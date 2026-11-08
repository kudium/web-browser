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

test('retains the first full warning, deduplicates repeats and forwards other diagnostics', () => {
  const original = process.emitWarning;
  const output = jest.fn();
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
    expect(output).toHaveBeenCalledTimes(1);
    expect(output).toHaveBeenCalledWith(message, 'ExtensionLoadWarning');
    process.emitWarning(
      message.replace('3.4.0', '3.5.0'),
      'ExtensionLoadWarning'
    );
    process.emitWarning('Actual extension failure', 'ExtensionLoadWarning');
    process.emitWarning('Other warning', 'Warning');
    expect(output).toHaveBeenCalledTimes(4);
  } finally {
    process.emitWarning = original;
  }
});
