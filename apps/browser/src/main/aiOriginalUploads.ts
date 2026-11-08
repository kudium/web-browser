import fs from 'fs';
import path from 'path';
import type { WebContents } from 'electron';

const recovered = new Set<string>();

/**
 * Chromium File objects read lazily. Keep approved originals until their page
 * leaves.
 */
export class AIOriginalUploads {
  private releases = new Set<() => void>();

  constructor(private root: string) {
    if (!recovered.has(root)) {
      fs.rmSync(root, { recursive: true, force: true });
      recovered.add(root);
    }
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  }

  async attach<T>(
    contents: WebContents,
    name: string,
    bytes: Buffer,
    action: (file: string) => Promise<T>
  ) {
    if (contents.isDestroyed()) throw new Error('Upload page closed.');
    if (this.releases.size >= 8)
      throw new Error(
        'Finish or leave an existing upload page before attaching more files.'
      );
    const { releases } = this;
    const directory = fs.mkdtempSync(path.join(this.root, 'file-'));
    const filename = path.join(directory, path.basename(name));
    function release() {
      releases.delete(release);
      contents.removeListener('did-navigate', release);
      contents.removeListener('destroyed', release);
      contents.removeListener('render-process-gone', release);
      try {
        fs.rmSync(directory, { recursive: true, force: true });
      } catch {
        // A locked filesystem entry is recovered at the next app startup.
      }
    }
    this.releases.add(release);
    // Release after navigation commits, so multipart submission can finish reading.
    contents.once('did-navigate', release);
    contents.once('destroyed', release);
    contents.once('render-process-gone', release);
    try {
      fs.writeFileSync(filename, bytes, { mode: 0o600 });
      return await action(filename);
    } catch (error) {
      release();
      throw error;
    }
  }

  clear() {
    [...this.releases].forEach((release) => release());
  }
}
