import { aboutDocument } from '../main/about';

jest.mock('electron', () => ({ app: {}, BrowserWindow: jest.fn(), shell: {} }));
jest.mock('electron-log', () => ({ error: jest.fn() }));

it('shows one release version and a fixed browser website in the custom About dialog', () => {
  const document = aboutDocument('1.0.2', 'data:image/png;base64,aGVsbG8=');
  expect(document).toContain('Version 1.0.2');
  expect(document).not.toContain('(1.0.2)');
  expect(document).toContain('href="https://browser.kudium.com"');
  expect(document).toContain('id="close"');
  expect(document).toContain("event.key==='Escape'");
});

it('treats version and icon metadata as data', () => {
  const document = aboutDocument('<script>bad()</script>', '" onerror="bad()');
  expect(document).not.toContain('<script>bad()</script>');
  expect(document).toContain('&lt;script&gt;bad()&lt;/script&gt;');
  expect(document).toContain('src="&quot; onerror=&quot;bad()"');
});
