// Reconstruct the previous union-of-all-parameters schema with current metadata.
const fs = require('fs');
const os = require('os');
const path = require('path');
const esbuild = require('esbuild');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'touchbox-tool-schemas-'));
try {
  const filename = path.join(root, 'schemas.cjs');
  esbuild.buildSync({ entryPoints: ['src/browser/aiToolSchemas.ts'], bundle: true, platform: 'node', outfile: filename });
  const tools = require(filename).aiProviderTools();
  const properties = Object.assign({}, ...tools.map(tool => tool.function.parameters.properties));
  const baseline = tools.map(tool => ({ ...tool, function: { ...tool.function, parameters: { type: 'object', properties, additionalProperties: false } } }));
  const summarize = values => ({ tools: values.length, bytes: Buffer.byteLength(JSON.stringify(values)), parameters: values.reduce((n, tool) => n + Object.keys(tool.function.parameters.properties).length, 0) });
  const before = summarize(baseline); const after = summarize(tools);
  const report = {
    measuredAt: new Date().toISOString(),
    method: 'Serialized provider tool-definition bytes only, excluding messages, inference and transport framing. Baseline reproduces the previous all-fields schema using the same tool names, descriptions and parameter metadata.',
    before, after, reductionPercent: 100 * (before.bytes - after.bytes) / before.bytes,
    limitations: ['Byte reduction is not a tokenizer measurement, provider billing estimate or measured inference speedup.', 'Metadata or tool additions change the reconstructed baseline; historical raw numbers are retained in this report.'],
  };
  fs.writeFileSync('docs/benchmarks/ai-tool-schema-benchmark.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
