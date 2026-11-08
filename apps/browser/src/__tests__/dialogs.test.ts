import { BrowserWindow, dialog } from 'electron';
import {
  dialogDocument,
  permissionSummary,
  showBrowserDialog,
  websitePermissionDialog,
} from '../main/dialogs';

jest.mock('electron', () => ({
  BrowserWindow: jest.fn(),
  dialog: {
    showMessageBox: jest
      .fn()
      .mockResolvedValue({ response: 0, checkboxChecked: false }),
  },
}));
it('explains permissions without exposing API names in the summary', () => {
  const summary = permissionSummary([
    'privacy',
    'nativeMessaging',
    'storage',
    'declarativeContent',
    '*://*/*',
  ]);
  expect(summary).toContain('companion software');
  expect(summary).toContain('all websites');
  expect(summary).not.toContain('nativeMessaging');
  expect(summary).not.toContain('declarativeContent');
});
it('escapes extension content and selects the requested scope', () => {
  const html = dialogDocument({
    message: '<script>bad()</script>',
    detail: 'Access settings',
    buttons: ['Cancel', 'Install', 'Install'],
    cancelId: 0,
    defaultId: 2,
    scope: [
      { label: 'All apps', response: 2 },
      { label: 'Personal', response: 1 },
    ],
    technicalDetail: 'nativeMessaging',
  });
  expect(html).toContain('&lt;script&gt;bad()&lt;/script&gt;');
  expect(html).toContain('value="2" selected');
  expect(html).toContain('Install extension');
  expect(html).toContain('<summary>Technical permissions</summary>');
  expect(html).toContain("default-src 'none'");
});

it('uses native permission dialogs with concise identity and safe keyboard default', async () => {
  const owner = {} as BrowserWindow;
  await showBrowserDialog(owner, {
    ...websitePermissionDialog('https://www.google.com', 'geolocation'),
    moreInformation: undefined,
  });
  expect(dialog.showMessageBox).toHaveBeenCalledWith(
    owner,
    expect.objectContaining({
      message: 'Share your location?',
      detail: 'www.google.com wants to use your current location.',
      buttons: ['Deny', 'Allow'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    })
  );
  expect(BrowserWindow).not.toHaveBeenCalled();
});
it('retains the insecure scheme and nonstandard port in the requesting identity', async () => {
  await showBrowserDialog({} as BrowserWindow, {
    ...websitePermissionDialog('http://example.com:8080', 'notifications'),
    moreInformation: undefined,
  });
  expect(dialog.showMessageBox).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({
      detail: 'http://example.com:8080 wants to send you notifications.',
    })
  );
});

it('keeps permission explanations in a collapsed disclosure', () => {
  const html = dialogDocument(
    websitePermissionDialog('https://www.google.com', 'geolocation')
  );
  const document = new DOMParser().parseFromString(html, 'text/html');
  expect(document.querySelector('h1')?.textContent).toBe(
    'Share your location?'
  );
  expect(document.querySelector('.eyebrow')?.textContent).toBe(
    'www.google.com'
  );
  const details = document.querySelector('details');
  expect(details?.hasAttribute('open')).toBe(false);
  expect(details?.querySelector('summary')?.textContent).toBe(
    'More information'
  );
  expect(details?.textContent).toContain('current location');
  expect(document.querySelector('.site')).toBeNull();
});

it.each([5, 6])(
  'groups %i permissions and collapses only lists longer than five',
  (count) => {
    const html = dialogDocument({
      message: 'Install extension?',
      permissions: Array.from(
        { length: count },
        (_, index) => `permission${index}`
      ),
    });
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const section = parsed.querySelector('.permission-section');
    expect(section?.tagName).toBe(count > 5 ? 'DETAILS' : 'SECTION');
    expect(section?.hasAttribute('open')).toBe(false);
    expect(section?.textContent).toContain('Requested permissions');
    expect(section?.querySelectorAll('li')).toHaveLength(count);
  }
);

it('shows every imported page and an inert expandable preview of all hooks', () => {
  const html = dialogDocument({
    message: 'Import Work?',
    buttons: ['Import & Review', 'Cancel'],
    cancelId: 1,
    importReview: {
      pages: [
        {
          name: '<img src=x onerror=run()>',
          url: 'example.com/download',
          hooks: true,
        },
        { name: 'Plain page', url: 'example.org', hooks: false },
      ],
      hooks: [
        {
          origin: 'https://example.com',
          source: '<script>run()</script>\nbody { color: red; }',
        },
      ],
    },
  });
  expect(html).toContain('Pages (2)');
  expect(html).toContain('View all hooks (1 website)');
  expect(html).toContain('&lt;script&gt;run()&lt;/script&gt;');
  expect(html).toContain('&lt;img src=x onerror=run()&gt;');
  expect(html).not.toContain('<img src=x');
  expect(html).toContain('Plain page');
  expect(html).toContain('Hooks stay disabled');
  expect(html).toContain("document.getElementById('cancel')?.focus()");
});
