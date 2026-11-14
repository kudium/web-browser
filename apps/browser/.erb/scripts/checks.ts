import { spawnSync } from 'child_process';
import path from 'path';

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) console.error(result.error);
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}

const [check, ...args] = process.argv.slice(2);

if (check === 'storage-migration') {
  run(process.execPath, [
    require.resolve('jest/bin/jest'),
    '--runInBand',
    'src/__tests__/secureStorage.test.ts',
    'src/__tests__/storageMigration.test.ts',
    'src/__tests__/storageReleaseGate.test.ts',
    'src/__tests__/storageSchemas.test.ts',
    'src/__tests__/aiCheckpoint.test.ts',
    'src/__tests__/aiTasks.test.ts',
    'src/__tests__/aiConversations.test.ts',
    'src/__tests__/passwordVault.test.ts',
  ]);
  if (args.includes('--native')) {
    run(process.execPath, [path.join(__dirname, 'secure-storage-smoke.cjs')]);
    run(process.execPath, [path.join(__dirname, 'legacy-identity-smoke.cjs')]);
  }
} else if (check === 'packaged-security') {
  if (args.length !== 1) throw new Error('Supply the packaged .app path.');
  run(process.execPath, ['.erb/scripts/fuse-regression.cjs', args[0]]);
  run(process.execPath, [
    '.erb/scripts/packaged-debugging-smoke.cjs',
    'after',
    args[0],
  ]);
  run(process.execPath, ['.erb/scripts/packaged-observer-smoke.cjs', args[0]]);
} else if (check === 'lint') {
  console.log('Checking code style...');
  run(process.execPath, [
    path.join(
      path.dirname(require.resolve('eslint/package.json')),
      'bin/eslint.js'
    ),
    '.',
    '--ext',
    '.js,.jsx,.ts,.tsx',
    ...args,
  ]);
  console.log('Checking TypeScript types...');
  run(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmit']);
} else if (check === 'test') {
  const desktop = args.includes('--desktop');
  const jestArgs = args.filter((arg) => arg !== '--desktop');
  run(process.execPath, [path.join(__dirname, 'patch-native-messaging.cjs')]);
  run(process.execPath, [path.join(__dirname, 'deepmerge-security-regression.cjs')]);
  run(process.execPath, [
    path.join(__dirname, 'extension-webextension-alias-regression.cjs'),
  ]);
  run(process.execPath, [
    path.join(__dirname, 'native-messaging-regression.cjs'),
  ]);
  run(process.execPath, [
    path.join(__dirname, 'native-authority-regression.cjs'),
  ]);
  run(process.execPath, [
    path.join(__dirname, 'native-authority-regression.cjs'),
    '--esm',
  ]);
  run(process.execPath, [
    path.join(__dirname, 'extension-transport-regression.cjs'),
  ]);
  run(process.execPath, [
    path.join(__dirname, 'extension-transport-regression.cjs'),
    '--esm',
  ]);
  run(process.execPath, [
    path.join(__dirname, 'extension-update-regression.cjs'),
  ]);
  run(process.execPath, [
    path.join(__dirname, 'extension-update-regression.cjs'),
    '--esm',
  ]);
  run(process.execPath, [
    path.join(__dirname, 'extension-router-regression.cjs'),
  ]);
  run(process.execPath, [
    path.join(__dirname, 'extension-router-regression.cjs'),
    '--esm',
  ]);
  run(process.execPath, [
    path.join(__dirname, 'external-links-regression.cjs'),
  ]);
  run(process.execPath, [
    path.join(__dirname, 'extension-actions-regression.cjs'),
  ]);
  console.log('Running unit tests...');
  run(process.execPath, [require.resolve('jest/bin/jest'), ...jestArgs]);
  if (!desktop) process.exit(0);
  console.log('Building the app for desktop tests...');
  if (!process.env.npm_execpath) {
    throw new Error('Run this command with npm test.');
  }
  run(process.execPath, [process.env.npm_execpath, 'run', 'build']);
  console.log('Running desktop smoke tests...');
  run(require('electron'), ['.erb/scripts/renderer-csp-smoke.cjs']);
  run(require('electron'), ['.erb/scripts/favicon-benchmark.cjs']);
  run(require('electron'), ['.erb/scripts/history-shutdown-smoke.cjs']);
  run(require('electron'), ['.erb/scripts/ai-data-disclosure-smoke.cjs']);
  run(require('electron'), ['.erb/scripts/ai-private-fill-smoke.cjs', 'after']);
  run(require('electron'), [
    '.erb/scripts/ai-private-input-smoke.cjs',
    'after',
  ]);
  run(process.execPath, ['.erb/scripts/ai-private-recovery-smoke.cjs']);
  run(process.execPath, [
    '.erb/scripts/ai-private-recovery-smoke.cjs',
    '--control',
  ]);
  run(require('electron'), [
    '.erb/scripts/extension-worker-smoke.cjs',
    '--before',
  ]);
  run(require('electron'), ['.erb/scripts/extension-worker-smoke.cjs']);
  run(require('electron'), ['.erb/scripts/extension-runtime-smoke.cjs']);
  if (process.platform !== 'win32')
    run(require('electron'), ['.erb/scripts/extension-native-host-smoke.cjs']);
  run(require('electron'), ['.erb/scripts/browser-identity-smoke.cjs']);
  if (process.platform === 'darwin')
    run(process.execPath, [path.join(__dirname, 'import-session-smoke.cjs')]);
  run(require('electron'), ['.erb/scripts/advanced-preferences-smoke.cjs']);
  run(require('electron'), ['.erb/scripts/ipc-boundary-smoke.cjs', 'after']);
  run(require('electron'), ['.erb/scripts/preferences-benchmark.cjs', 'after']);
  run(require('electron'), ['.erb/scripts/advanced-settings-ui-smoke.cjs']);
  run(require('electron'), ['.erb/scripts/ai-smoke.cjs']);
  run(require('electron'), [
    '.erb/scripts/ai-import-boundary-smoke.cjs',
    'after',
  ]);
  run(require('electron'), [
    '.erb/scripts/ai-composer-save-smoke.cjs',
    'after',
  ]);
  run(require('electron'), ['.erb/scripts/mcp-ownership-smoke.cjs', 'after']);
  run(require('electron'), [
    '.erb/scripts/group-removal-boundary-smoke.cjs',
    'after',
  ]);
  run(require('electron'), [
    '.erb/scripts/page-capture-boundary-smoke.cjs',
    'after',
  ]);
  run(require('electron'), ['.erb/scripts/image-preflight-smoke.cjs', 'after']);
  run(require('electron'), [
    '.erb/scripts/local-image-boundary-smoke.cjs',
    'after',
  ]);
  run(require('electron'), [
    '.erb/scripts/private-outbound-smoke.cjs',
    'after',
  ]);
  run(require('electron'), [
    '.erb/scripts/private-navigation-smoke.cjs',
    'after',
  ]);
  run(require('electron'), [
    '.erb/scripts/private-navigation-dispatch-smoke.cjs',
    'after',
  ]);
  run(require('electron'), ['.erb/scripts/enter-key-smoke.cjs', 'after']);
  run(require('electron'), ['.erb/scripts/key-release-smoke.cjs', 'after']);
  run(require('electron'), [
    '.erb/scripts/extension-store-boundary-smoke.cjs',
    'after',
  ]);
  run(require('electron'), [
    '.erb/scripts/extension-store-integration-smoke.cjs',
    'after',
  ]);
  [
    'selected',
    'native menu',
    'all',
    'decline',
    'actual permissions',
    'source changed',
    'callbacks refreshed',
    'target restored',
    'navigation',
    'owner restored',
    'queued target restored',
    'package changed',
    'file added',
    'native identity changed',
    'navigation after native load',
    'native load failed',
    'all native failure',
  ].forEach((scenario) =>
    run(require('electron'), [
      '.erb/scripts/extension-install-owned-smoke.cjs',
      'after',
      scenario,
    ])
  );
  run(process.execPath, [
    '.erb/scripts/mcp-marker-durability-smoke.cjs',
    'after',
  ]);
  run(require('electron'), [
    '.erb/scripts/browser-ui-smoke.cjs',
    '--local-images-only',
  ]);
  run(require('electron'), ['.erb/scripts/ai-activity-smoke.cjs']);
  run(require('electron'), ['.erb/scripts/ai-activity-lifecycle-smoke.cjs']);
  run(require('electron'), ['.erb/scripts/password-manager-smoke.cjs']);
  run(require('electron'), ['.erb/scripts/password-auth-smoke.cjs']);
  run(require('electron'), ['.erb/scripts/personal-data-documents-smoke.cjs']);
  run(require('electron'), ['.erb/scripts/personal-data-ai-smoke.cjs']);
  run(require('electron'), ['.erb/scripts/hook-ai-smoke.cjs']);
  run(require('electron'), ['.erb/scripts/hook-review-smoke.cjs']);
  run(require('electron'), [
    '.erb/scripts/site-developer-window-smoke.cjs',
    '--hook-permissions',
  ]);
  run(require('electron'), ['.erb/scripts/personal-data-ui-smoke.cjs']);
  run(require('electron'), ['.erb/scripts/mcp-smoke.cjs']);
  run(require('electron'), [
    '.erb/scripts/mcp-smoke.cjs',
    '--action-approval-only',
  ]);
  run(require('electron'), ['.erb/scripts/personal-agents-smoke.cjs']);
  run(require('electron'), ['.erb/scripts/mcp-smoke.cjs', '--oop-frames']);
  run(require('electron'), [
    '.erb/scripts/browser-ui-smoke.cjs',
    '--ai-sidebar-only',
  ]);
  run(require('electron'), ['.erb/scripts/window-navigation-smoke.cjs']);
  run(require('electron'), ['.erb/scripts/window-commands-smoke.cjs']);
  run(require('electron'), [
    '.erb/scripts/browser-ui-smoke.cjs',
    '--ipc-boundaries-only',
  ]);
  run(require('electron'), [
    '.erb/scripts/browser-ui-smoke.cjs',
    '--browser-data-consent-only',
  ]);
  run(require('electron'), [
    '.erb/scripts/browser-ui-smoke.cjs',
    '--native-ui-boundaries-only',
  ]);
  run(require('electron'), [
    '.erb/scripts/browser-ui-smoke.cjs',
    '--download-history-boundaries-only',
  ]);
  run(require('electron'), ['.erb/scripts/browser-ui-smoke.cjs']);
} else {
  throw new Error('Expected lint or test.');
}
