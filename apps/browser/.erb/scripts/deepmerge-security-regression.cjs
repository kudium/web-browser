const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { patchInstalled, patchSource } = require('./patch-deepmerge.cjs');
patchInstalled();
const root = path.dirname(require.resolve('deepmerge/package.json'));
const source = readFileSync(path.join(root, 'dist/cjs.js'), 'utf8');
assert.equal(patchSource(source, 'dist/cjs.js'), source);
assert.throws(() => patchSource(source.replace('enumerable: true', 'enumerable: false'), 'dist/cjs.js'), /needs review/);
assert.equal(patchSource(readFileSync(path.join(root, 'index.js'), 'utf8'), 'index.js'), readFileSync(path.join(root, 'index.js'), 'utf8'));
const variants = [require('deepmerge')];
const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(readFileSync(path.join(root, 'dist/umd.js'), 'utf8'), sandbox);
variants.push(sandbox.module.exports);
for (const merge of variants) {
  const bad = JSON.parse('{"__proto__":{"isAdmin":true}}');
  for (const [target, input] of [[bad, {}], [Object.create(null), bad], [{ nested: bad }, {}], [{}, { nested: bad }]]) {
    const result = merge(target, input);
    assert.equal(result.isAdmin, undefined);
    assert.equal(result.nested?.isAdmin, undefined);
    assert.equal(Object.getPrototypeOf(result).isAdmin, undefined);
    assert.equal({}.isAdmin, undefined);
  }
  const symbol = Symbol('retained');
  const normal = merge({ nested: { a: 1 }, items: [1], [symbol]: 2 }, { nested: { b: 2 }, items: [2] });
  assert.equal(normal.nested.a, 1);
  assert.equal(normal.nested.b, 2);
  assert.equal(normal.items.join(','), '1,2');
  assert.equal(normal[symbol], 2);
  assert.equal(merge.all([{ a: 1 }, { b: 2 }]).b, 2);
}
console.log('Deepmerge installed CJS and UMD variants (source hash checked): hostile prototypes blocked; normal merges and idempotence pass.');
