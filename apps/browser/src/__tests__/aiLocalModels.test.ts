/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { LocalModels, parseOllamaProgress } from '../main/aiLocalModels';

jest.mock('electron', () => ({ shell: { openExternal: jest.fn() } }));

const stream = (lines: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      lines.forEach((line) => controller.enqueue(new TextEncoder().encode(`${line}\n`)));
      controller.close();
    },
  });

it('parses pull progress lines', () => {
  expect(parseOllamaProgress('gemma3n', '{"status":"pulling abc","completed":5,"total":10}')).toEqual({
    model: 'gemma3n',
    status: 'pulling abc',
    completed: 5,
    total: 10,
  });
  expect(parseOllamaProgress('gemma3n', '{"status":"success"}')).toMatchObject({ done: true });
  expect(parseOllamaProgress('gemma3n', '{"error":"model not found"}')).toMatchObject({ error: 'model not found' });
  expect(parseOllamaProgress('gemma3n', 'not json')).toBeUndefined();
});

it('requires the licence acknowledgement once, streams progress, and remembers it on disk', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kudium-local-models-'));
  const stateFile = path.join(root, 'local-models.json');
  const sent: unknown[] = [];
  const fetcher = jest.fn(async (url: string) => {
    if (url.endsWith('/api/pull'))
      return new Response(stream(['{"status":"pulling","completed":1,"total":2}', '{"status":"success"}']), { status: 200 });
    if (url.endsWith('/api/tags')) return Response.json({ models: [{ name: 'gemma3n:latest' }] });
    return new Response('', { status: 200 });
  }) as unknown as typeof fetch;
  try {
    const models = new LocalModels({ stateFile, fetch: fetcher, send: (progress) => sent.push(progress) });
    await expect(models.pull('gemma3n')).rejects.toThrow('Gemma Terms of Use');
    expect(models.acknowledgeLicence('gemma3n')).toEqual({ acknowledged: true });
    await expect(models.pull('gemma3n')).resolves.toEqual({ model: 'gemma3n', endpoint: 'http://localhost:11434/v1' });
    expect(sent).toEqual([
      { model: 'gemma3n', status: 'pulling', completed: 1, total: 2 },
      { model: 'gemma3n', status: 'success', done: true },
      { model: 'gemma3n', status: 'success', done: true },
    ]);
    const reloaded = new LocalModels({ stateFile, fetch: fetcher });
    expect((await reloaded.status()).licenceAcknowledged).toEqual({ gemma3n: true });
    expect((await reloaded.status()).running).toBe(true);
    expect((await reloaded.status()).models).toEqual(['gemma3n:latest']);
    await reloaded.warm('gemma3n');
    const warmCall = (fetcher as jest.Mock).mock.calls.find(([url]) => String(url).endsWith('/api/generate'));
    expect(JSON.parse(warmCall![1].body)).toMatchObject({ model: 'gemma3n', keep_alive: '30m' });
    expect(() => (models as any).acknowledgeLicence('llama')).toThrow('supported local model');
    expect(LocalModels.installCommand('brew')).toBe('brew install ollama');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
