import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { hookPublishPage } from '../src/hook-pages';
import { Button } from '../src/components/web-ui';
import { createApp } from '../src/app';
import type { Database } from '../src/db';

test('hook editor preserves native form fields inside Radix controls', () => {
  const html = hookPublishPage();
  expect(html).toContain('radix-themes');
  expect(html).toContain('data-accent-color="teal"');
  expect(html).toContain('/assets/radix-themes.css?v=');
  expect(html).toContain('rt-TextFieldRoot');
  expect(html).toMatch(/<input[^>]*name="name"/);
  expect(html).toMatch(/<select[^>]*name="applicability"/);
  expect(html).toMatch(/<textarea[^>]*name="after"/);
  expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*data-action-context/);
  expect(html).toContain('data-hook-button-template');
  expect(html).toContain('data-hook-textarea-template');
  expect(html).toMatch(/<button[^>]*type="button"[^>]*data-add-action/);
  expect(html).toMatch(/<button[^>]*type="button"[^>]*data-remove-action/);
  expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Publish hook/);
});
test('shared button preserves the native submit default and explicit non-submit actions', () => {
  expect(renderToStaticMarkup(createElement(Button, null, 'Save'))).toContain('type="submit"');
  expect(renderToStaticMarkup(createElement(Button, { type: 'button' }, 'Cancel'))).toContain('type="button"');
});
test('Radix styles and the web integration stylesheet are served locally', async () => {
  const app = createApp({ db: {} as Database, assetOrigins: [] });
  for (const path of ['/assets/radix-themes.css', '/assets/ui.css']) {
    const response = await app.request(path);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/css');
    expect(await response.text()).toContain('.radix-themes');
  }
});


test('editor assets bundle locally and inline editor styles use a per-response CSP nonce', async () => {
  const app = createApp({ db: {} as Database, assetOrigins: [] });
  app.get('/editor-fixture', c => c.html(hookPublishPage(undefined, c.get('styleNonce'))));
  const first = await app.request('/editor-fixture');
  const html = await first.text();
  const nonce = html.match(/src="\/assets\/hook-editor.js"[^>]*nonce="([^"]+)"/)?.[1];
  expect(nonce).toBeTruthy();
  expect(first.headers.get('Content-Security-Policy')).toContain(`'nonce-${nonce}'`);
  expect(first.headers.get('Content-Security-Policy')).not.toContain("'unsafe-inline'");
  const second = await app.request('/editor-fixture');
  expect(second.headers.get('Content-Security-Policy')).not.toContain(`'nonce-${nonce}'`);
  const bundle = await app.request('/assets/hook-editor.js');
  expect(bundle.status).toBe(200);
  expect(bundle.headers.get('Content-Type')).toContain('javascript');
  expect(await bundle.text()).toContain('hook-source-replaced');
});
