// Export tracked source without Git history, local browser links or ignored secrets.
import { execFileSync } from 'node:child_process';
import { cpSync, lstatSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(root, 'release-artifacts', 'open-source');
mkdirSync(outputRoot, { recursive: true });
const output = mkdtempSync(path.join(outputRoot, 'source-'));
const source = path.join(output, 'kudium');
mkdirSync(source);
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
for (const file of files) {
  // Keep AGENTS.md references usable without exporting local linked-group IDs.
  if (path.basename(file) === 'BROWSER.md') {
    const to = path.join(source, file);
    mkdirSync(path.dirname(to), { recursive: true });
    writeFileSync(to, '# Optional Kudium Browser integration\n\nThis public source snapshot has no linked browser groups or local connector\ncredentials. Configure External AI control locally if you use Kudium Browser\nfor development. Never commit connector tokens or private group metadata.\n');
    continue;
  }
  if (/^\.git(?:\/|$)|(?:^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith('.env.example')) throw new Error(`Refusing sensitive export path: ${file}`);
  if (/[\r\n]/.test(file) || path.isAbsolute(file) || file.split('/').includes('..')) throw new Error('Invalid tracked path');
  const from = path.join(root, file);
  if (!lstatSync(from).isFile()) throw new Error(`Export requires a regular file: ${file}`);
  const to = path.join(source, file);
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to);
}
// Scan the exact exported tree. Do not include secret-bearing scanner reports.
execFileSync('gitleaks', ['dir', '.', '--config', path.join(root, '.gitleaks.toml'), '--redact', '--no-banner'], { cwd: source, stdio: 'inherit' });
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
writeFileSync(path.join(output, 'source-info.json'), JSON.stringify({ sourceCommit: commit, includesWorkingEdits: true, historyIncluded: false, excluded: ['private BROWSER.md link metadata', 'ignored local files'], licenseReview: 'deferred by user' }, null, 2) + '\n');
const archive = path.join(output, 'kudium-source.tar.gz');
// macOS tar otherwise adds AppleDouble entries carrying filesystem metadata.
execFileSync('tar', ['-czf', archive, '-C', output, 'kudium'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
console.log(`Public-source candidate: ${archive}`);
console.log('No repository visibility, remote history, deployment or publication was changed.');
