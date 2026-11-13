// This isolated worker only parses code. It never evaluates hook source.
const { parentPort, workerData } = require('worker_threads');
const path = require('path');
const fs = require('fs');
const ts = require('./typescript.js');
const dir = workerData.libDir;
const file = path.join(dir, 'hook.js');
const api = path.join(dir, 'hook-api.d.ts');
let prefix = 'async function __kudiumHook() {\n';
let mode = 'lifecycle';
let source = '';
let version = 0;
const cache = new Map();
function read(name) {
  name = path.normalize(name);
  if (name === file) return prefix + source + '\n}';
  if (path.dirname(name) !== dir || !(name === api || /^lib\..*\.d\.ts$/.test(path.basename(name)))) return undefined;
  if (!cache.has(name)) cache.set(name, fs.existsSync(name) ? fs.readFileSync(name, 'utf8') : undefined);
  return cache.get(name);
}
const options = { allowJs: true, checkJs: true, strictNullChecks: true, target: ts.ScriptTarget.ES2022, noEmit: true, skipLibCheck: true, allowNonTsExtensions: true, types: [] };
const host = {
  getCompilationSettings: () => options,
  getScriptFileNames: () => [file, api],
  getScriptVersion: (name) => path.normalize(name) === file ? String(version) : '1',
  getScriptSnapshot: (name) => { const text = read(name); return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text); },
  getCurrentDirectory: () => dir,
  getDefaultLibFileName: () => path.join(dir, 'lib.es2022.full.d.ts'),
  fileExists: (name) => read(name) !== undefined,
  readFile: read,
  readDirectory: () => [],
};
const service = ts.createLanguageService(host);
function query(request) {
  if (source !== request.source || mode !== (request.mode || 'lifecycle')) {
    source = request.source; mode = request.mode || 'lifecycle'; version += 1;
    prefix = mode === 'action' ? '/** @param {KudiumActionContext} context @param {KudiumActionApi} api */\nasync function __kudiumHook(context, api) {\n' : 'async function __kudiumHook() {\n';
  }
  const position = prefix.length + request.position;
  if (request.action === 'diagnostics') {
    const diagnostics = [...service.getSyntacticDiagnostics(file), ...service.getSemanticDiagnostics(file)];
    return { diagnostics: diagnostics.filter((item) => item.start >= prefix.length && item.start <= prefix.length + source.length).slice(0, 200).map((item) => ({
      from: Math.min(source.length, item.start - prefix.length),
      to: Math.min(source.length, item.start - prefix.length + (item.length || 1)),
      severity: item.category === ts.DiagnosticCategory.Error ? 'error' : 'warning',
      message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
    })) };
  }
  if (request.action === 'hover') {
    const info = service.getQuickInfoAtPosition(file, position);
    return info ? { hover: {
      from: Math.max(0, info.textSpan.start - prefix.length),
      to: Math.min(source.length, info.textSpan.start - prefix.length + info.textSpan.length),
      text: ts.displayPartsToString(info.displayParts) + '\n' + ts.displayPartsToString(info.documentation),
    } } : {};
  }
  const result = service.getCompletionsAtPosition(file, position, { includeCompletionsForModuleExports: false });
  const word = /[\w$]*$/.exec(source.slice(0, request.position))[0];
  return { from: request.position - word.length, completions: (result?.entries || []).filter((entry) => entry.name.startsWith(word)).slice(0, 1000).map((entry, index) => {
    const detail = index < 40 ? service.getCompletionEntryDetails(file, position, entry.name, undefined, entry.source, undefined, entry.data) : undefined;
    return { label: entry.name, type: /method|function/.test(entry.kind) ? 'function' : /property/.test(entry.kind) ? 'property' : /class|interface/.test(entry.kind) ? 'type' : 'variable', detail: detail ? ts.displayPartsToString(detail.displayParts) : entry.kind };
  }) };
}
parentPort.on('message', ({ id, request }) => {
  try { parentPort.postMessage({ id, result: query(request) }); }
  catch { parentPort.postMessage({ id, error: 'JavaScript assistance is unavailable.' }); }
});
