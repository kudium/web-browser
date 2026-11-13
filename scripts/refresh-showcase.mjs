// Local product photography only; never publishes or touches the normal profile.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const browser = path.join(root, 'apps/browser');
for (const [command, args, cwd] of [
  [path.join(browser, 'node_modules/.bin/electron'), ['.erb/scripts/demo-photography.cjs'], browser],
  ['python3', ['apps/browser/demo/prepare-images.py'], root],
]) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
