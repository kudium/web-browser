import {
  consolidateExtensionWarnings,
  extensionWarningKey,
} from '../main/extensionWarnings';

const message =
  "Warnings loading extension at /extensions/passwords/3.4.0:\n  Permission 'privacy' is unknown.\n  Permission 'contextMenus' is unknown.";

test('only recognizes the explicit compatibility permission diagnostics', () => {
  expect(extensionWarningKey(message, 'ExtensionLoadWarning')).toBeDefined();
  expect(extensionWarningKey(message, 'Warning')).toBeUndefined();
  expect(
    extensionWarningKey(
      `${message}\nManifest is invalid.`,
      'ExtensionLoadWarning'
    )
  ).toBeUndefined();
  expect(
    extensionWarningKey(
      message.replace('privacy', 'unsupportedAPI'),
      'ExtensionLoadWarning'
    )
  ).toBeUndefined();
});

test('reports compatibility once and forwards genuine load diagnostics', () => {
  const original = process.emitWarning;
  const output = jest.fn();
  const notices = jest.spyOn(console, 'info').mockImplementation(() => {});
  process.emitWarning = output;
  try {
    consolidateExtensionWarnings();
    const wrapper = process.emitWarning;
    consolidateExtensionWarnings();
    expect(process.emitWarning).toBe(wrapper);
    process.emitWarning(message, 'ExtensionLoadWarning');
    process.emitWarning(message, { type: 'ExtensionLoadWarning' });
    const error = new Error(message);
    error.name = 'ExtensionLoadWarning';
    process.emitWarning(error);
    expect(output).not.toHaveBeenCalled();
    expect(notices).toHaveBeenCalledTimes(1);
    expect(notices).toHaveBeenCalledWith(
      '[extensions] passwords/3.4.0: using browser compatibility APIs'
    );
    process.emitWarning(
      message.replace('3.4.0', '3.5.0'),
      'ExtensionLoadWarning'
    );
    process.emitWarning('Actual extension failure', 'ExtensionLoadWarning');
    process.emitWarning('Other warning', 'Warning');
    expect(output).toHaveBeenCalledTimes(2);
    expect(notices).toHaveBeenCalledTimes(2);
  } finally {
    process.emitWarning = original;
    notices.mockRestore();
  }
});

test('recognizes redundant MV2 scripts only after verifying an MV3 service worker', () => {
  const diagnostic =
    "Warnings loading extension at /extensions/wappalyzer/6.12.8:\n  'background.scripts' requires manifest version of 2 or lower.\n  Permission 'cookies' is unknown.\n  Permission 'downloads' is unknown.";
  expect(
    extensionWarningKey(diagnostic, 'ExtensionLoadWarning')
  ).toBeUndefined();
  expect(
    extensionWarningKey(diagnostic, 'ExtensionLoadWarning', true)
  ).toBeDefined();
  expect(
    extensionWarningKey(
      `${diagnostic}\nInvalid service worker.`,
      'ExtensionLoadWarning',
      true
    )
  ).toBeUndefined();
});
