/** @jest-environment node */
import { AIScriptAPI, parseScriptSelector } from '../main/aiScriptApi';

it('parses refs, text, role, css, xpath and href selectors', () => {
  expect(parseScriptSelector('@12')).toEqual({ kind: 'ref', elementId: 12 });
  expect(parseScriptSelector(7)).toEqual({ kind: 'ref', elementId: 7 });
  expect(parseScriptSelector('text=Save changes')).toEqual({
    kind: 'label',
    label: 'Save changes',
  });
  expect(parseScriptSelector('role=button[name="Sign in"]')).toEqual({
    kind: 'label',
    label: 'Sign in',
    role: 'button',
  });
  expect(parseScriptSelector("role=link[name='Docs']")).toEqual({
    kind: 'label',
    label: 'Docs',
    role: 'link',
  });
  expect(parseScriptSelector('css=#id')).toEqual({ kind: 'selector', selector: 'css=#id' });
  expect(parseScriptSelector('href=/docs')).toEqual({ kind: 'selector', selector: 'href=/docs' });
  expect(() => parseScriptSelector('')).toThrow('A target is required');
  expect(() => parseScriptSelector('Save')).toThrow('Unsupported target');
});

function api(scopeTab = 't1') {
  const calls: { tool: string; args: Record<string, unknown> }[] = [];
  const dispatch = jest.fn(async (tool: string, args: Record<string, unknown>) => {
    calls.push({ tool, args });
    if (tool === 'back') throw new Error('No previous page.');
    switch (tool) {
      case 'read_page':
      case 'wait_until':
        return { url: 'https://site.test/', snapshotId: `snap-${calls.length}`, elements: [] };
      case 'find_element':
        return { elementId: 4, snapshotId: `find-${calls.length}` };
      case 'screenshot':
        return { data: 'abc', mimeType: 'image/jpeg' };
      case 'list_tabs':
        return [{ id: 't1' }];
      case 'new_tab':
        return { tabId: 't2', loaded: true };
      default:
        return { ok: true };
    }
  });
  const receipts: string[] = [];
  const instance = new AIScriptAPI(dispatch, {
    scopeTab: () => scopeTab,
    onReceipt: (receipt) => receipts.push(`${receipt.tool}:${receipt.ok ? 'ok' : receipt.error}`),
  });
  return { instance, dispatch, calls, receipts };
}

it('tracks the latest snapshot per tab so @refs resolve to an element and snapshot ID', async () => {
  const { instance, calls } = api();
  await expect(instance.invoke('click', { target: '@3' })).rejects.toThrow('Take page.snapshot()');
  await instance.invoke('snapshot', {});
  await instance.invoke('click', { target: '@3' });
  await instance.invoke('fill', { target: 5, value: 'hello' });
  expect(calls[0]).toEqual({ tool: 'read_page', args: { tabId: 't1', format: 'compact' } });
  expect(calls[1]).toEqual({ tool: 'click', args: { tabId: 't1', elementId: 3, snapshotId: 'snap-1' } });
  expect(calls[2]).toEqual({
    tool: 'type',
    args: { tabId: 't1', elementId: 5, snapshotId: 'snap-1', text: 'hello' },
  });
});

it('resolves text and role targets through find_element and uses its snapshot', async () => {
  const { instance, calls } = api();
  await instance.invoke('click', { target: 'text=Save' });
  await instance.invoke('press', { target: 'role=textbox[name=Email]', key: 'Enter' });
  expect(calls[0]).toEqual({ tool: 'find_element', args: { tabId: 't1', label: 'Save' } });
  expect(calls[1]).toEqual({ tool: 'click', args: { tabId: 't1', elementId: 4, snapshotId: 'find-1' } });
  expect(calls[2]).toEqual({
    tool: 'find_element',
    args: { tabId: 't1', label: 'Email', role: 'textbox' },
  });
  expect(calls[3]).toMatchObject({ tool: 'press_key', args: { key: 'Enter', elementId: 4 } });
  await instance.invoke('hover', { target: 'css=#menu' });
  expect(calls[4]).toEqual({ tool: 'find_element', args: { tabId: 't1', selector: 'css=#menu' } });
  expect(calls[5]).toMatchObject({ tool: 'hover', args: { elementId: 4, snapshotId: 'find-5' } });
});

it('keeps screenshot bytes out of the script and returns them with the result', async () => {
  const { instance } = api();
  await expect(instance.invoke('screenshot', { scale: 1 })).resolves.toEqual({
    captured: true,
    index: 0,
    mimeType: 'image/jpeg',
  });
  expect(instance.images).toEqual([{ tabId: 't1', mimeType: 'image/jpeg', data: 'abc' }]);
});

it('maps session, navigation, waits, extraction and tabs onto tools with receipts', async () => {
  const { instance, calls, receipts, dispatch } = api();
  await expect(instance.invoke('session', {})).resolves.toEqual({ tabId: 't1', tabs: [{ id: 't1' }] });
  await instance.invoke('navigate', { url: 'https://site.test/a', waitUntil: 'networkidle' });
  await instance.invoke('wait', { text: 'Saved', timeout: 3000 });
  await instance.invoke('extract', { selector: 'tr', columns: { name: 'td' }, limit: 5 });
  const opened = await instance.invoke('newPage', { url: 'https://site.test/b' });
  expect(opened).toEqual({ tabId: 't2', loaded: true });
  await instance.invoke('scroll', { tabId: 't2', amount: 300 });
  await expect(instance.invoke('back', {})).rejects.toThrow('No previous page.');
  expect(calls.map((call) => call.tool)).toEqual([
    'list_tabs',
    'navigate',
    'wait_until',
    'extract_rows',
    'new_tab',
    'scroll',
    'back',
  ]);
  expect(calls[1].args).toEqual({ tabId: 't1', url: 'https://site.test/a', waitUntil: 'networkidle' });
  expect(calls[2].args).toEqual({ tabId: 't1', format: 'compact', text: 'Saved', timeoutMs: 3000 });
  expect(calls[5].args).toEqual({ tabId: 't2', amount: 300 });
  expect(receipts).toEqual([
    'list_tabs:ok',
    'navigate:ok',
    'wait_until:ok',
    'extract_rows:ok',
    'new_tab:ok',
    'scroll:ok',
    'back:No previous page.',
  ]);
  expect(instance.receipts[2]).toMatchObject({ step: 3, url: 'https://site.test/' });
});

it('refuses run-management tools and unknown methods', async () => {
  const { instance, dispatch } = api();
  await expect(instance.invoke('nope', {})).rejects.toThrow('Unknown Page API method');
  await expect(instance.invoke('handOff', {})).resolves.toEqual({ ok: true });
  expect(dispatch).toHaveBeenCalledWith(
    'hand_off',
    { reason: 'The script asked for human help.' },
    expect.any(AbortSignal)
  );
});

it('stops dispatching once its bound signal is aborted', async () => {
  const { instance, dispatch } = api();
  const control = new AbortController();
  instance.bind(control.signal);
  control.abort(new Error('Run budget of 5 ms exceeded.'));
  await expect(instance.invoke('tabs', {})).rejects.toThrow('Run budget');
  expect(dispatch).not.toHaveBeenCalled();
  expect(instance.receipts[0]).toMatchObject({ ok: false, error: 'Run budget of 5 ms exceeded.' });
});
