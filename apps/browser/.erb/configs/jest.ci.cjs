const path = require('path');
const { jest: base } = require('../../package.json');
const separator = String.raw`[/\\]`;
const packages =
  '(?:react-arborist|react-dnd|react-dnd-html5-backend|dnd-core|@react-dnd)';
const [esmPattern, esmTransform] = Object.entries(base.transform)[0];
module.exports = {
  ...base,
  rootDir: path.resolve(__dirname, '../..'),
  transform: {
    [`node_modules${separator}${packages}${separator}.*\\.js$`]: esmTransform,
    ...Object.fromEntries(
      Object.entries(base.transform).filter(
        ([pattern]) => pattern !== esmPattern
      )
    ),
  },
  transformIgnorePatterns: [
    `node_modules${separator}(?!(?:@toon-format${separator}toon|react-arborist|react-dnd|react-dnd-html5-backend|dnd-core|@react-dnd)${separator})`,
  ],
};
