/** @jest-environment node */
import { navigateExtensionPage } from '../main/extensionPageNavigation';

function fixture() {
  let resolve!: () => void,
    reject!: (error: any) => void,
    destroyed = false;
  const load = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const popup = {
    isDestroyed: () => destroyed,
    show: jest.fn(),
    showInactive: jest.fn(),
    webContents: { focus: jest.fn() },
    loadURL: jest.fn(() => load),
    destroy: jest.fn(() => {
      destroyed = true;
    }),
  };
  const options = {
    assertAccess: jest.fn(),
    reportError: jest.fn(async () => {}),
  };
  return { popup, options, resolve, reject };
}
test('an extension navigation shows immediately while the destination is still loading', async () => {
  const { popup, options, resolve } = fixture();
  expect(
    navigateExtensionPage(popup as any, 'https://example.com/', options),
  ).toBeUndefined();
  expect(popup.show).toHaveBeenCalledTimes(1);
  expect(popup.webContents.focus).toHaveBeenCalledTimes(1);
  expect(popup.loadURL).toHaveBeenCalledWith('https://example.com/');
  resolve();
  await Promise.resolve();
  expect(options.assertAccess).toHaveBeenCalledTimes(2);
});
test('background tabs preserve focus and revoked access closes a pending window', async () => {
  const { popup, options, resolve } = fixture();
  navigateExtensionPage(popup as any, 'https://example.com/', {
    ...options,
    active: false,
  });
  expect(popup.showInactive).toHaveBeenCalledTimes(1);
  expect(popup.webContents.focus).not.toHaveBeenCalled();
  options.assertAccess.mockImplementation(() => {
    throw new Error('Revoked');
  });
  resolve();
  await Promise.resolve();
  expect(popup.destroy).toHaveBeenCalledTimes(1);
});
test('failed loads report a local error while normal redirects do not', async () => {
  const failure = fixture();
  navigateExtensionPage(
    failure.popup as any,
    'https://example.com/',
    failure.options,
  );
  const error = new Error('Network failed');
  failure.reject(error);
  await Promise.resolve();
  await Promise.resolve();
  expect(failure.options.reportError).toHaveBeenCalledWith(error);
  const redirect = fixture();
  navigateExtensionPage(
    redirect.popup as any,
    'https://example.com/',
    redirect.options,
  );
  redirect.reject({ code: 'ERR_ABORTED', errno: -3 });
  await Promise.resolve();
  await Promise.resolve();
  expect(redirect.options.reportError).not.toHaveBeenCalled();
});
