/** Insert paths as shell arguments, without a command or an Enter keystroke. */
export function terminalDropText(paths: string[], platform = 'darwin') {
  if (!paths.length) throw new Error('Drop a local file or folder.');
  if (paths.some((value) => !value || /[\x00-\x1f\x7f]/.test(value)))
    throw new Error(
      'This path contains characters that cannot be pasted safely.'
    );
  return (
    paths
      .map(
        (value) =>
          "'" +
          value.replace(/'/g, platform === 'win32' ? "''" : "'\"'\"'") +
          "'"
      )
      .join(' ') + ' '
  );
}
