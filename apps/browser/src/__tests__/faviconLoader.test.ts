/** @jest-environment node */
import {
  FaviconLoader,
  readFaviconBody,
  validateFaviconDimensions,
} from '../main/faviconLoader';

const limit = 1024 * 1024;
const signal = () => new AbortController().signal;

it('accepts a complete body at the limit and rejects decoded bytes beyond it', async () => {
  const bytes = new Uint8Array(limit);
  expect(await readFaviconBody(new Response(bytes), signal())).toHaveLength(
    limit
  );
  const cancelled = jest.fn();
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.enqueue(new Uint8Array(1));
      },
      cancel: cancelled,
    }),
    { headers: { 'content-length': '1', 'content-encoding': 'gzip' } }
  );
  await expect(readFaviconBody(response, signal())).rejects.toThrow(
    'too large'
  );
  expect(cancelled).toHaveBeenCalledTimes(1);
});

it.each([200, 404])(
  'cancels rejected response bodies for status %s',
  async (status) => {
    const cancelled = jest.fn();
    const response = new Response(new ReadableStream({ cancel: cancelled }), {
      status,
      headers: { 'content-length': String(limit + 1) },
    });
    await expect(readFaviconBody(response, signal())).rejects.toThrow();
    expect(cancelled).toHaveBeenCalledTimes(1);
  }
);

it('aborts a stalled reader and releases its stream lock/listener', async () => {
  const controller = new AbortController();
  const cancelled = jest.fn();
  const response = new Response(new ReadableStream({ cancel: cancelled }));
  const remove = jest.spyOn(controller.signal, 'removeEventListener');
  const pending = readFaviconBody(response, controller.signal);
  controller.abort();
  await expect(pending).rejects.toThrow();
  expect(cancelled).toHaveBeenCalledTimes(1);
  expect(response.body?.locked).toBe(false);
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
});

it('rejects stream failures without retaining a locked reader', async () => {
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.error(new Error('Disconnected'));
      },
    })
  );
  await expect(readFaviconBody(response, signal())).rejects.toThrow(
    'Disconnected'
  );
  expect(response.body?.locked).toBe(false);
});

it('bounds concurrency, removes cancelled queued work, and drains remaining work', async () => {
  const loader = new FaviconLoader();
  const finish = new Map<string, (response: Response) => void>();
  const fetch = jest.fn(
    (url: string) =>
      new Promise<Response>((resolve) => {
        finish.set(url, resolve);
      })
  );
  const accept = jest.fn();
  const tasks = Array.from({ length: 6 }, (_, index) =>
    loader
      .load(String(index), String(index), fetch, accept)
      .catch((error) => error)
  );
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  expect(fetch).toHaveBeenCalledTimes(4);
  loader.cancel('4');
  finish.get('0')!(new Response('healthy'));
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    '0',
    '1',
    '2',
    '3',
    '5',
  ]);
  ['1', '2', '3', '5'].forEach((id) =>
    finish.get(id)!(new Response('healthy'))
  );
  const results = await Promise.all(tasks);
  expect(results[4]).toMatchObject({ name: 'AbortError' });
  expect(accept).toHaveBeenCalledTimes(5);
});

it('superseding a request cancels its transport and accepts only the replacement', async () => {
  const loader = new FaviconLoader();
  const signals: AbortSignal[] = [];
  const fetch = jest.fn(
    async (_url: string, options: { signal: AbortSignal }) => {
      signals.push(options.signal);
      if (signals.length === 1)
        return new Promise<Response>((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => reject(options.signal.reason),
            { once: true }
          );
        });
      return new Response('replacement');
    }
  );
  const accept = jest.fn();
  const old = loader.load('tab', 'old', fetch, accept).catch((error) => error);
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  await loader.load('tab', 'new', fetch, accept);
  await old;
  expect(signals[0].aborted).toBe(true);
  expect(accept).toHaveBeenCalledTimes(1);
  expect(accept.mock.calls[0][0].toString()).toBe('replacement');
});

it('clear cancels active and queued work and never invokes acceptance', async () => {
  const loader = new FaviconLoader();
  const fetch = jest.fn(
    (_url: string, options: { signal: AbortSignal }) =>
      new Promise<Response>((_resolve, reject) => {
        options.signal.addEventListener(
          'abort',
          () => reject(options.signal.reason),
          { once: true }
        );
      })
  );
  const accept = jest.fn();
  const tasks = Array.from({ length: 6 }, (_, index) =>
    loader.load(String(index), 'fixture', fetch, accept).catch((error) => error)
  );
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  loader.clear();
  await Promise.all(tasks);
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(accept).not.toHaveBeenCalled();
});

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAALUlEQVR4nO3OIQEAAAgDsOckJ/0gxs3E/JKdqxIQEBAQEBAQEBAQEBAQEGgHHuoPNHkTKkJmAAAAAElFTkSuQmCC',
  'base64'
);
it('allows supported small PNG metadata before native decoding', () => {
  expect(() => validateFaviconDimensions(png)).not.toThrow();
});
it.each([
  [2049, 32],
  [32, 2049],
  [0, 32],
  [32, 0],
])(
  'refuses dimension metadata %s by %s before native decoding',
  (width, height) => {
    const bytes = Buffer.from(png);
    bytes.writeUInt32BE(width, 16);
    bytes.writeUInt32BE(height, 20);
    expect(() => validateFaviconDimensions(bytes)).toThrow('dimensions');
  }
);
it('rejects corrupt data and unsupported buffer formats', () => {
  expect(() => validateFaviconDimensions(Buffer.from('broken'))).toThrow();
  expect(() =>
    validateFaviconDimensions(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"></svg>'
      )
    )
  ).toThrow();
});

it('aborts the native fetch transport after rejecting its body', async () => {
  const loader = new FaviconLoader();
  let observed: AbortSignal | undefined;
  const fetch = async (_address: string, options: { signal: AbortSignal }) => {
    observed = options.signal;
    return new Response(new Uint8Array(1), {
      headers: { 'content-length': String(2 * 1024 * 1024) },
    });
  };
  await expect(
    loader.load('tab', 'fixture', fetch, jest.fn())
  ).rejects.toThrow();
  expect(observed?.aborted).toBe(true);
});

it('expires stalled transport without accepting or retaining queued work', async () => {
  jest.useFakeTimers();
  try {
    const loader = new FaviconLoader();
    const accept = jest.fn();
    const fetch = (_address: string, options: { signal: AbortSignal }) =>
      new Promise<Response>((_resolve, reject) => {
        options.signal.addEventListener(
          'abort',
          () => reject(options.signal.reason),
          { once: true }
        );
      });
    const pending = loader
      .load('tab', 'fixture', fetch, accept)
      .catch((error) => error);
    await Promise.resolve();
    jest.advanceTimersByTime(10000);
    expect(await pending).toMatchObject({ name: 'AbortError' });
    expect(accept).not.toHaveBeenCalled();
    loader.clear();
  } finally {
    jest.useRealTimers();
  }
});
it('accepts a bounded ICO favicon supplied by a loaded website', () => {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header[6] = 1;
  header[7] = 1;
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  expect(() =>
    validateFaviconDimensions(Buffer.concat([header, png]))
  ).not.toThrow();
});
