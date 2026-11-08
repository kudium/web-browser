import { spawn, ChildProcess } from 'child_process';
import webpack from 'webpack';
import WebpackDevServer from 'webpack-dev-server';
import detectPort from 'detect-port';
import mainConfiguration from '../configs/webpack.config.main.dev';
import preloadConfiguration from '../configs/webpack.config.preload.dev';
import rendererConfiguration from '../configs/webpack.config.renderer.dev';

const mainCompiler = webpack(mainConfiguration);
const preloadCompiler = webpack(preloadConfiguration);
const rendererCompiler = webpack(rendererConfiguration);
const server = new WebpackDevServer(
  { ...rendererConfiguration.devServer, setupExitSignals: false },
  rendererCompiler
);
const ready = new Set<string>();
let electron: ChildProcess | undefined;
let stopping = false;

async function stop(code: number) {
  if (stopping) return;
  stopping = true;
  const electronStopped = new Promise<void>((resolve) => {
    if (
      !electron ||
      electron.exitCode !== null ||
      electron.signalCode !== null
    ) {
      resolve();
      return;
    }
    const timeout = setTimeout(() => {
      electron?.kill('SIGKILL');
      resolve();
    }, 5000);
    electron.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    electron.kill('SIGINT');
  });
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
  ready.add(name);
  if (ready.size !== 3 || electron || stopping) return;

  const mainArgs = (process.env.MAIN_ARGS?.match(/"[^"]+"|[^\s"]+/g) || []).map(
    (arg) => arg.replace(/^"|"$/g, '')
  );
  electron = spawn(
    process.execPath,
    [
      require.resolve('electronmon/bin/cli.js'),
      '.erb/dll/main.js',
      ...mainArgs,
      ...process.argv.slice(2),
    ],
    { stdio: 'inherit', env: process.env }
  );
  electron.on('error', (spawnError) => {
    console.error(spawnError);
    stop(1);
  });
  electron.on('exit', (code, signal) => stop(code ?? (signal ? 1 : 0)));
}

async function start() {
  const port = Number(process.env.PORT || 1212);
  const availablePort = await detectPort(port);
  if (availablePort !== port) {
    throw new Error(
      `Port ${port} is already in use. Choose another port: PORT=4343 npm run dev`
    );
  }
  rendererCompiler.hooks.done.tap('TouchBoxDev', (stats) =>
    onBuild('renderer', null, stats)
  );
  rendererCompiler.hooks.failed.tap('TouchBoxDev', (error) =>
    onBuild('renderer', error)
  );
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
