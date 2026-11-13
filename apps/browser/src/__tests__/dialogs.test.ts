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

it('renders all close-group choices with their original responses', () => {
  const html = dialogDocument({
    message: 'Close group?',
    buttons: ['Cancel', 'Archive', 'Delete'],
    cancelId: 0,
    defaultId: 0,
    destructive: true,
  });
  expect(html).toContain('data-response="0">Cancel</button>');
  expect(html).toContain('data-response="1" class="primary">Archive</button>');
  expect(html).toContain(
    'data-response="2" class="primary destructive">Delete</button>'
  );
});

it('reuses input controls and escapes requested names and saved-field labels', () => {
  const html = dialogDocument({
    message: 'Share fields',
    buttons: ['Cancel', 'Share'],
    cancelId: 0,
    inputs: [
      {
        key: 'firstName',
        label: 'First name',
        choices: [{ value: '0', label: 'Profile <script> · Name' }],
      },
      { key: 'question', label: 'Question <img src=x>' },
    ],
  });
  const document = new DOMParser().parseFromString(html, 'text/html');
  expect(document.querySelector('[data-input="firstName"]')?.tagName).toBe(
    'SELECT'
  );
  expect(document.querySelector('[data-input="question"]')?.tagName).toBe(
    'INPUT'
  );
  expect(document.querySelector('option[value="0"]')?.textContent).toBe(
    'Profile <script> · Name'
  );
  expect(document.querySelector('img')).toBeNull();
  expect(document.querySelectorAll('script')).toHaveLength(1);
});

it('keeps Personal Data beside grouped inputs when saved matches are unavailable', () => {
  const html = dialogDocument({
    message: 'Complete your name',
    buttons: ['Cancel', 'Continue'],
    inputs: [
      {
        key: 'firstName',
        label: 'First name',
        group: 'Profile',
        personalData: 'firstName',
        saved: [],
        savedHint: 'No saved values',
      },
    ],
  });
  const document = new DOMParser().parseFromString(html, 'text/html');
  expect(document.querySelector('.input-group h2')?.textContent).toBe(
    'Profile'
  );
  expect(document.querySelector('.saved-picker')).not.toBeNull();
  expect(document.querySelector('.saved-picker')?.tagName).toBe('BUTTON');
  expect(document.querySelector('.saved-hint')).toBeNull();
  expect(document.querySelector('.saved-input [data-input]')).not.toBeNull();
  expect(document.querySelector('.saved-input .saved-picker')).not.toBeNull();
  expect(
    document.querySelector('[data-input]')?.getAttribute('aria-describedby')
  ).toBe('error-0');
});
