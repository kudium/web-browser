import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { IApp } from '../types';
import { aiGroupId } from '../browser/aiGroups';
import { linkedProjectFolder } from './developerProject';

export function projectFileNavigation(url: string, tab: IApp) {
  try {
    if (new URL(url).protocol !== 'file:') return false;
    const folder = linkedProjectFolder(aiGroupId(tab));
    if (!folder) return false;
    const root = fs.realpathSync(folder);
    const file = fs.realpathSync(fileURLToPath(url));
    const relative = path.relative(root, file);
    return (
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative) &&
      fs.statSync(file).isFile()
    );
  } catch {
    return false;
  }
}
