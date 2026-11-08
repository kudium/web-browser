/** Webpack config for the Electron main process in development. */

import path from 'path';
import webpack from 'webpack';
import { merge } from 'webpack-merge';
import { copyExtensionPreloads } from '../scripts/copy-extension-preloads';
import baseConfig from './webpack.config.base';
import webpackPaths from './webpack.paths';
import checkNodeEnv from '../scripts/check-node-env';

checkNodeEnv('development');

const configuration: webpack.Configuration = {
  devtool: 'inline-source-map',
  mode: 'development',
  target: 'electron-main',
  entry: path.join(webpackPaths.srcMainPath, 'main.ts'),
  output: {
    path: webpackPaths.dllPath,
    filename: 'main.js',
    library: { type: 'umd' },
  },
  plugins: [
    {
      apply(compiler: webpack.Compiler) {
        compiler.hooks.afterEmit.tap('CopyExtensionPreloads', () =>
          copyExtensionPreloads(compiler.options.output.path!)
        );
      },
    },
    new webpack.EnvironmentPlugin({
      NODE_ENV: 'development',
      DEBUG_PROD: false,
      START_MINIMIZED: false,
    }),
    new webpack.DefinePlugin({
      'process.type': '"browser"',
    }),
  ],
  node: {
    __dirname: false,
    __filename: false,
  },
};

export default merge(baseConfig, configuration);
