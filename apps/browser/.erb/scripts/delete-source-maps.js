import fs from 'fs';
import path from 'path';
import webpackPaths from '../configs/webpack.paths';

export default function deleteSourceMaps() {
  [webpackPaths.distMainPath, webpackPaths.distRendererPath].forEach(
    (folder) => {
      if (!fs.existsSync(folder)) return;
      fs.readdirSync(folder)
        .filter((file) => file.endsWith('.js.map'))
        .forEach((file) => fs.unlinkSync(path.join(folder, file)));
    }
  );
}
