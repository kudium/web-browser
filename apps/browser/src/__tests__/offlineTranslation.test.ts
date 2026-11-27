/** @jest-environment node */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  OfflinePageTranslator,
  translationPath,
  detectTranslationLanguage,
} from '../main/offlineTranslation';
jest.mock('franc-min', () => ({ franc: jest.fn(() => 'spa') }));
let directory: string;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'kudium-model-test-'));
});
afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});
const bytes = Buffer.from('verified model');
const info = {
  name: 'model.bin',
  size: bytes.length,
  expectedSha256Hash: createHash('sha256').update(bytes).digest('hex'),
};
it('verifies and caches a pack, then loads it without any network', async () => {
  const transport = jest.fn(async (..._args: any[]) => new Response(bytes));
  const engine = new OfflinePageTranslator(
    directory,
    'unused',
    transport as unknown as typeof fetch,
  );
  const download = () =>
    (engine as any).file('esen', info, new AbortController().signal, jest.fn());
  await download();
  await download();
  expect(transport).toHaveBeenCalledTimes(1);
  expect(transport.mock.calls[0]).toEqual([
    expect.stringMatching(
      /^https:\/\/storage.googleapis.com\/bergamot-models-sandbox\//,
    ),
    expect.objectContaining({ credentials: 'omit', redirect: 'error' }),
  ]);
  expect(
    Buffer.from(
      await fs.readFile(path.join(directory, info.expectedSha256Hash)),
    ),
  ).toEqual(bytes);
  engine.dispose();
});
it('rejects damaged and oversized downloads without persisting them', async () => {
  for (const body of [Buffer.from('corrupt model!'), Buffer.alloc(100)]) {
    const engine = new OfflinePageTranslator(
      directory,
      'unused',
      (async () => new Response(body)) as typeof fetch,
    );
    await expect(
      (engine as any).file(
        'esen',
        info,
        new AbortController().signal,
        jest.fn(),
      ),
    ).rejects.toThrow(/verification|size/);
    expect(await fs.readdir(directory)).toEqual([]);
    engine.dispose();
  }
});
it('replaces a corrupt cache entry with a verified download and never leaves partial files', async () => {
  await fs.writeFile(path.join(directory, info.expectedSha256Hash), 'bad');
  const engine = new OfflinePageTranslator(
    directory,
    'unused',
    (async () => new Response(bytes)) as typeof fetch,
  );
  await (engine as any).file(
    'esen',
    info,
    new AbortController().signal,
    jest.fn(),
  );
  expect(await fs.readdir(directory)).toEqual([info.expectedSha256Hash]);
  engine.dispose();
});
it('supports English pivoting and fails clearly for unsupported languages', () => {
  expect(translationPath('es', 'fr')).toEqual(['esen', 'enfr']);
  expect(translationPath('es', 'en')).toEqual(['esen']);
  expect(() => translationPath('ja', 'en')).toThrow('not available');
  expect(detectTranslationLanguage('A bounded sample')).toBe('es');
});
it('rejects cancelled work before starting a worker or downloading packs', async () => {
  const transport = jest.fn();
  const engine = new OfflinePageTranslator(directory, 'unused', transport);
  const controller = new AbortController();
  controller.abort();
  await expect(
    engine.translate(
      { source: 'es', target: 'en', texts: ['Hola'] },
      controller.signal,
    ),
  ).rejects.toThrow();
  expect(transport).not.toHaveBeenCalled();
  engine.dispose();
});
