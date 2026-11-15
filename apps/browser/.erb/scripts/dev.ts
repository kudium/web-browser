import { spawn, ChildProcess } from 'child_process';
import webpack from 'webpack';
import WebpackDevServer from 'webpack-dev-server';
import { detectPort } from 'detect-port';
import { isCancelledAssetResponse } from './devLogging';
import mainConfiguration from '../configs/webpack.config.main.dev';
import preloadConfiguration from '../configs/webpack.config.preload.dev';
import rendererConfiguration from '../configs/webpack.config.renderer.dev';

const {
  developmentElectronPath,
}: {
  developmentElectronPath: () => string;
} = require('./brand-development-app.cjs');

const mainCompiler = webpack(mainConfiguration);
const preloadCompiler = webpack(preloadConfiguration);
const rendererCompiler = webpack(rendererConfiguration);
rendererCompiler.hooks.infrastructureLog.tap(
  'KudiumBrowserCancelledResponse',
  (origin, type, args) =>
    isCancelledAssetResponse(origin, type, args || []) ? true : undefined
);
const server = new WebpackDevServer(
  {
    ...(
      rendererConfiguration as webpack.Configuration & {
        devServer?: ConstructorParameters<typeof WebpackDevServer>[0];
      }
    ).devServer,
    setupExitSignals: false,
  },
  rendererCompiler
);
const ready = new Set<string>();
let electron: ChildProcess | undefined;
let stopping = false;
let restarting = false;
let restartTimer: ReturnType<typeof setTimeout> | undefined;
let restartRequested = false;

function stopElectron() {
  const child = electron;
  return new Promise<void>((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill('SIGINT');
  });
}

async function stop(code: number) {
  if (stopping) return;
  stopping = true;
  if (restartTimer) clearTimeout(restartTimer);
  const electronStopped = stopElectron();
  await server.stop();
  await Promise.all([
    electronStopped,
    ...[mainCompiler, preloadCompiler, rendererCompiler].map(
      (compiler) =>
        new Promise<void>((resolve) => {
          compiler.close(() => resolve());
        })
    ),
  ]);
  process.exit(code);
}

function launchElectron() {
  const mainArgs = (process.env.MAIN_ARGS?.match(/"[^"]+"|[^\s"]+/g) || []).map(
    (arg) => arg.replace(/^"|"$/g, '')
  );
  electron = spawn(
    developmentElectronPath(),
    ['.erb/dll/main.js', ...mainArgs, ...process.argv.slice(2)],
    { stdio: 'inherit', env: process.env }
  );
  electron.on('error', (spawnError) => {
    console.error(spawnError);
    stop(1);
  });
  electron.on('exit', (code, signal) => {
    electron = undefined;
    if (!restarting && !stopping) stop(code ?? (signal ? 1 : 0));
  });
}

function scheduleRestart() {
  if (stopping || ready.size !== 3) return;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(async () => {
    restartTimer = undefined;
    if (stopping || ready.size !== 3 || restarting) return;
    restartRequested = false;
    restarting = true;
    try {
      await stopElectron();
      if (!stopping && ready.size === 3) launchElectron();
    } finally {
      restarting = false;
      if (restartRequested || !electron) scheduleRestart();
    }
  }, 150);
}

function onBuild(name: string, error: Error | null, stats?: webpack.Stats) {
  if (error) {
    console.error(error);
    stop(1);
    return;
  }
  if (stats?.hasErrors()) {
    ready.delete(name);
    console.error(stats.toString({ all: false, errors: true }));
    return;
  }
  const initialBuild = !ready.has(name);
  ready.add(name);
  if (name !== 'renderer' && !initialBuild) restartRequested = true;
  if (ready.size !== 3 || stopping) return;
  if (restartRequested) scheduleRestart();
  else if (!electron && !restarting) launchElectron();
}

async function start() {
  const port = Number(process.env.PORT || 1212);
  const availablePort = await detectPort(port);
  if (availablePort !== port) {
    throw new Error(
      `Port ${port} is already in use. Choose another port: PORT=4343 npm run dev`
    );
  }
  rendererCompiler.hooks.done.tap('KudiumBrowserDev', (stats) =>
    onBuild('renderer', null, stats)
  );
  rendererCompiler.hooks.failed.tap('KudiumBrowserDev', (error) =>
    onBuild('renderer', error)
  );
  // A failed/in-progress build must not restart the app with stale bundles.
  const compilers: [string, webpack.Compiler][] = [
    ['main', mainCompiler],
    ['preload', preloadCompiler],
    ['renderer', rendererCompiler],
  ];
  compilers.forEach(([name, compiler]) => {
    compiler.hooks.invalid.tap('KudiumBrowserDev', () => {
      ready.delete(name);
      if (name !== 'renderer') restartRequested = true;
    });
  });
  await server.start();
  mainCompiler.watch({}, (error, stats) => onBuild('main', error, stats));
  preloadCompiler.watch({}, (error, stats) => onBuild('preload', error, stats));
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
start().catch((error) => {
  console.error(error);
  stop(1);
});
