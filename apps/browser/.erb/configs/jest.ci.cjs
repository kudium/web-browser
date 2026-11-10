const path = require('path');
const { jest: base } = require('../../package.json');
const separator = String.raw`[/\\]`;
// Keep every package transform from the main config, including nested ESM
// dependencies, and accept Windows paths as well as POSIX paths.
module.exports = {
  ...base,
  rootDir: path.resolve(__dirname, '../..'),
  transform: Object.fromEntries(
    Object.entries(base.transform).map(([pattern, transformer]) => [
      pattern.replaceAll('/', separator),
      transformer,
    ])
  ),
  transformIgnorePatterns: base.transformIgnorePatterns.map((pattern) =>
    pattern.replaceAll('/', separator)
  ),
};
