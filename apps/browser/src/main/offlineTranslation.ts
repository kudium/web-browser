import { Worker } from 'node:worker_threads';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { franc } from 'franc-min';
import registry from './translationModels.json';

const models = registry as Record<
  string,
  Record<string, { name: string; size: number; expectedSha256Hash: string }>
>;
const modelHost =
  'https://storage.googleapis.com/bergamot-models-sandbox/0.3.3';
const maxCacheBytes = 256 * 1024 * 1024;
const languageCodes: Record<string, string> = {
  eng: 'en',
  spa: 'es',
  fra: 'fr',
  deu: 'de',
  ita: 'it',
  por: 'pt',
  pol: 'pl',
  ces: 'cs',
  bul: 'bg',
  est: 'et',
  nld: 'nl',
  rus: 'ru',
  ukr: 'uk',
  fas: 'fa',
  nob: 'nb',
  nno: 'nn',
  isl: 'is',
};
export function detectTranslationLanguage(text: string) {
  return languageCodes[franc(text.slice(0, 4000), { minLength: 20 })];
}
export function translationPath(from: string, to: string) {
  if (from === to) return [];
  if (models[from + to]) return [from + to];
  if (models[from + 'en'] && models['en' + to]) return [from + 'en', 'en' + to];
  throw new Error(
    'Offline translation is not available for this language yet.',
  );
}
const checksum = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
const arrayBuffer = (bytes: Uint8Array) =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

/** One bounded worker shared by tabs; only model files ever leave this process. */
export class OfflinePageTranslator {
  private worker?: Worker;
  private ready?: Promise<void>;
  private serial = 0;
  private pending = new Map<
    number,
    { resolve: (value: any) => void; reject: (error: Error) => void }
  >();
  private loaded = new Set<string>();
  private tail: Promise<unknown> = Promise.resolve();
  private queued = 0;
  private idle?: ReturnType<typeof setTimeout>;
  private disposed = false;
  constructor(
    private cacheDirectory: string,
    private workerFile = path.join(
      __dirname.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1'),
      'translation-engine/translator-worker.cjs',
    ),
    private transport: typeof fetch = fetch,
  ) {}
  dispose() {
    this.disposed = true;
    this.stop();
  }
  private stop(reason = new Error('Translation was interrupted.')) {
    clearTimeout(this.idle);
    this.idle = undefined;
    const worker = this.worker;
    this.worker = undefined;
    this.ready = undefined;
    this.loaded.clear();
    for (const item of this.pending.values())
      item.reject(reason);
    this.pending.clear();
    void worker?.terminate();
  }
  private call(name: string, ...args: any[]) {
    if (!this.worker)
      return Promise.reject(new Error('Translation engine is unavailable.'));
    return new Promise<any>((resolve, reject) => {
      const id = ++this.serial;
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ id, name, args });
    });
  }
  private initialize() {
    if (this.ready) return this.ready;
    const worker = new Worker(this.workerFile);
    this.worker = worker;
    worker.on('message', ({ id, result, error }) => {
      const item = this.pending.get(id);
      if (!item) return;
      this.pending.delete(id);
      if (error)
        item.reject(new Error('Offline translation could not complete.'));
      else item.resolve(result);
    });
    worker.on('error', (error) => {
      console.warn('Offline translation worker failed:', error);
      if (this.worker === worker) this.stop(new Error('Translation couldn’t start. Restart the browser and try again.'));
    });
    worker.on('exit', () => {
      if (this.worker === worker) this.stop();
    });
    this.ready = this.call('initialize', {
      cacheSize: 0,
      useNativeIntGemm: false,
    }).then(() => {});
    return this.ready;
  }
  private async file(
    pair: string,
    info: { name: string; size: number; expectedSha256Hash: string },
    signal: AbortSignal,
    progress: () => void,
  ) {
    const filename = path.join(this.cacheDirectory, info.expectedSha256Hash);
    try {
      const stat = await fs.lstat(filename);
      if (stat.isSymbolicLink() || stat.size !== info.size)
        throw new Error('Invalid cached model');
      const bytes = await fs.readFile(filename);
      if (checksum(bytes) !== info.expectedSha256Hash)
        throw new Error('Invalid cached model');
      await fs.utimes(filename, new Date(), new Date());
      return arrayBuffer(bytes);
    } catch (error) {
      if (signal.aborted) throw error;
    }
    progress();
    const response = await this.transport(`${modelHost}/${pair}/${info.name}`, {
      signal,
      redirect: 'error',
      credentials: 'omit',
    });
    if (!response.ok || !response.body)
      throw new Error(
        'Unable to download the language pack. Check your connection and try again.',
      );
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > info.size || size > 64 * 1024 * 1024)
          throw new Error('Invalid language pack size.');
        chunks.push(chunk.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const bytes = Buffer.concat(chunks);
    if (size !== info.size || checksum(bytes) !== info.expectedSha256Hash)
      throw new Error('Language pack verification failed.');
    signal.throwIfAborted();
    await fs.mkdir(this.cacheDirectory, { recursive: true, mode: 0o700 });
    const temporary = `${filename}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
      signal.throwIfAborted();
      await fs.rename(temporary, filename);
    } finally {
      await fs.rm(temporary, { force: true });
    }
    return arrayBuffer(bytes);
  }
  private async trimCache(keep: Set<string>) {
    const files = await fs.readdir(this.cacheDirectory).catch(() => []);
    const entries = await Promise.all(
      files
        .filter((name) => /^[a-f0-9]{64}$/.test(name))
        .map(async (name) => ({
          name,
          stat: await fs.lstat(path.join(this.cacheDirectory, name)),
        })),
    );
    let size = entries.reduce((total, item) => total + item.stat.size, 0);
    for (const item of entries.sort(
      (a, b) => a.stat.mtimeMs - b.stat.mtimeMs,
    )) {
      if (size <= maxCacheBytes) break;
      if (keep.has(item.name)) continue;
      await fs.rm(path.join(this.cacheDirectory, item.name), { force: true });
      size -= item.stat.size;
    }
  }
  translate(
    input: { source: string; target: string; texts: string[] },
    signal: AbortSignal,
    progress: () => void = () => {},
  ) {
    if (this.disposed)
      return Promise.reject(new Error('Translation engine is closed.'));
    if (this.queued >= 4)
      return Promise.reject(
        new Error('Translation is busy. Try again shortly.'),
      );
    this.queued++;
    const run = this.tail
      .catch(() => {})
      .then(async () => {
        signal.throwIfAborted();
        if (this.disposed) throw new Error('Translation engine is closed.');
        const source =
          input.source === 'auto'
            ? detectTranslationLanguage(input.texts.join(' '))
            : input.source;
        if (!source) throw new Error('Unable to detect this page’s language.');
        const pairs = translationPath(source, input.target);
        if (!pairs.length) return { source, texts: input.texts };
        clearTimeout(this.idle);
        const bounded = AbortSignal.any([signal, AbortSignal.timeout(180000)]);
        const abort = () => this.stop();
        bounded.addEventListener('abort', abort, { once: true });
        try {
          await this.initialize();
          bounded.throwIfAborted();
          for (const old of this.loaded)
            if (!pairs.includes(old)) {
              await this.call('freeTranslationModel', {
                from: old.slice(0, 2),
                to: old.slice(2),
              });
              this.loaded.delete(old);
            }
          const keep = new Set<string>();
          for (const pair of pairs) {
            const files = models[pair];
            for (const info of Object.values(files))
              keep.add(info.expectedSha256Hash);
            if (this.loaded.has(pair)) continue;
            const buffers: Record<string, ArrayBuffer> = {};
            for (const [part, info] of Object.entries(files))
              buffers[part] = (await this.file(
                pair,
                info,
                bounded,
                progress,
              )) as ArrayBuffer;
            await this.call(
              'loadTranslationModel',
              { from: pair.slice(0, 2), to: pair.slice(2) },
              {
                model: buffers.model,
                shortlist: buffers.lex,
                vocabs: buffers.vocab
                  ? [buffers.vocab]
                  : [buffers.srcvocab, buffers.trgvocab],
                config: files.model.name.endsWith('intgemm8.bin')
                  ? { 'gemm-precision': 'int8shiftAll' }
                  : {},
              },
            );
            this.loaded.add(pair);
          }
          await this.trimCache(keep);
          bounded.throwIfAborted();
          const result = await this.call('translate', {
            models: pairs.map((pair) => ({
              from: pair.slice(0, 2),
              to: pair.slice(2),
            })),
            texts: input.texts.map((text) => ({
              text,
              html: false,
              qualityScores: false,
            })),
          });
          bounded.throwIfAborted();
          return {
            source,
            texts: result.map((item: any) => item.target.text) as string[],
          };
        } finally {
          bounded.removeEventListener('abort', abort);
          this.idle = setTimeout(() => this.stop(), 60000);
          this.idle.unref?.();
        }
      });
    this.tail = run.then(
      () => {},
      () => {},
    );
    return run.finally(() => {
      this.queued--;
    });
  }
}
