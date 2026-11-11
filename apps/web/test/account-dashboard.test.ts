import { expect, test, mock } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { accountPage } from '../src/pages';

const script = readFileSync(new URL('../public/sessions.js', import.meta.url), 'utf8');
class Element {
  children: Element[] = [];
  parent?: Element;
  attributes: Record<string, string> = {};
  listeners: Record<string, () => unknown> = {};
  className = '';
  innerHTML = '';
  disabled = false;
  type = '';
  content = '';
  focused = false;
  constructor(public tag: string) {}
  set textContent(text: string) { this.content = text; this.children = []; }
  get textContent(): string { return this.content + this.children.map(child => child.textContent).join(''); }
  setAttribute(key: string, value: string) { this.attributes[key] = value; }
  append(...nodes: Element[]) { nodes.forEach(node => { node.parent = this; this.children.push(node); }); }
  prepend(node: Element) { node.parent = this; this.children.unshift(node); }
  replaceChildren(...nodes: Element[]) { this.content = ''; this.children = []; this.append(...nodes); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); }
  focus() { this.focused = true; }
  addEventListener(type: string, callback: () => unknown) { this.listeners[type] = callback; }
  async click() { await this.listeners.click?.(); }
  find(className: string): Element[] { return [...(this.className === className ? [this] : []), ...this.children.flatMap(child => child.find(className))]; }
}
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
async function fixture(records: any[], options: { failLoad?: boolean; failRevoke?: boolean } = {}) {
  const sessions = new Element('div');
  const count = new Element('span');
  const assigned = mock();
  const fetch = mock(async (url: string, init?: { body?: string }) => {
    if (url.endsWith('get-session')) return { ok: true, json: async () => ({ session: { token: 'current-secret' } }) };
    if (url.endsWith('revoke-session')) {
      if (options.failRevoke) return { ok: false };
      const token = JSON.parse(init!.body!).token;
      records = records.filter(item => item.token !== token);
      return { ok: true };
    }
    if (options.failLoad) return { ok: false };
    return { ok: true, json: async () => records };
  });
  runInNewContext(script, { document: { querySelector: (selector: string) => selector === '[data-account-sessions]' ? sessions : count, createElement: (tag: string) => new Element(tag) }, fetch, location: { assign: assigned } });
  await settle();
  return { sessions, count, fetch, assigned };
}
const session = (token: string, userAgent: string) => ({ token, userAgent, createdAt: '2026-11-08T12:00:00Z' });

test('dashboard escapes account details and exposes an accurate, bounded storage meter', () => {
  const markup = accountPage('<script>alert(1)</script>', 'user@example.com', { usedBytes: 16 * 1024 * 1024, recordCount: 128, quotas: { bytes: 64 * 1024 * 1024 } });
  expect(markup).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  expect(markup).toContain('aria-valuenow="25"');
  expect(markup).toContain('128 stored records');
  expect(markup).toContain('data-sign-out');
  expect(markup).toContain('data-account-data');
  expect(markup).toContain('Your synced data');
  expect(markup).toContain('/assets/account-data.js');
  expect(markup).not.toContain('class="auth-layout"');
  expect(accountPage('', '', { usedBytes: 200, recordCount: 0, quotas: { bytes: 100 } })).toContain('aria-valuenow="100"');
  expect(accountPage('', '', { usedBytes: 0, recordCount: 0, quotas: { bytes: 0 } })).toContain('aria-valuenow="0"');
});
test('shows readable device names and the current device without exposing tokens or raw agents', async () => {
  const { sessions, count } = await fixture([
    session('current-secret', 'Mozilla/5.0 (Macintosh) Chrome/156.0.0.0 Safari/537.36'),
    session('other-secret', 'Mozilla/5.0 (Windows NT 10.0) Chrome/157.0.0.0 Edg/157.0'),
    session('mobile-secret', 'iPhone Version/18.0 Mobile Safari/605.1'),
    session('untrusted-secret', '<img src=x onerror=alert(1)>'),
  ]);
  expect(sessions.textContent).toContain('MacThis device');
  expect(sessions.textContent).toContain('Chrome 156');
  expect(sessions.textContent).toContain('Windows PC');
  expect(sessions.textContent).toContain('Edge 157');
  expect(sessions.textContent).toContain('iPhone');
  expect(sessions.textContent).toContain('Safari 18');
  expect(sessions.textContent).not.toContain('secret');
  expect(sessions.textContent).not.toContain('<img');
  expect(count.textContent).toBe('4 sessions');
  expect(sessions.attributes['aria-busy']).toBe('false');
});
test('requires confirmation, allows cancel, then revokes exactly the selected device', async () => {
  const { sessions, fetch, count } = await fixture([session('current-secret', 'Macintosh Chrome/156'), session('other-secret', 'Windows Chrome/157')]);
  const button = sessions.find('account-session-actions')[1].children[0];
  await button.click();
  expect(button.textContent).toBe('Confirm');
  expect(fetch.mock.calls.filter(([url]) => url.endsWith('revoke-session'))).toHaveLength(0);
  await sessions.find('account-session-actions')[1].children[0].click();
  expect(button.textContent).toBe('Sign out');
  expect(sessions.find('account-session-confirm')).toHaveLength(0);
  await button.click(); await button.click(); await settle();
  const requests = fetch.mock.calls.filter(([url]) => url.endsWith('revoke-session'));
  expect(requests).toHaveLength(1);
  expect(JSON.parse(requests[0][1]!.body!)).toEqual({ token: 'other-secret' });
  expect(count.textContent).toBe('1 session');
});
test('keeps a failed revocation retryable and redirects only after revoking the current session', async () => {
  const options = { failRevoke: true };
  const { sessions, assigned } = await fixture([session('current-secret', 'Macintosh Chrome/156')], options);
  const button = sessions.find('account-button')[0];
  await button.click(); await button.click();
  expect(button.disabled).toBe(false);
  expect(button.textContent).toBe('Retry');
  expect(assigned).not.toHaveBeenCalled();
  options.failRevoke = false;
  await button.click();
  expect(assigned).toHaveBeenCalledWith('/sign-in');
});
test('supports retrying a failed device list and renders an empty state', async () => {
  const options = { failLoad: true };
  const { sessions, count } = await fixture([], options);
  expect(sessions.textContent).toContain('couldn’t be loaded');
  options.failLoad = false;
  await sessions.find('account-button')[0].click(); await settle();
  expect(sessions.textContent).toBe('No signed-in devices.');
  expect(count.textContent).toBe('0 sessions');
});
