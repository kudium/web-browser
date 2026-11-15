import {
  createSidebarMediaSession,
  SIDEBAR_MEDIA_CACHE_KEY,
  type MediaPlayerSnapshot,
} from '../main/sidebarMediaSession';

let playing: boolean;
let audible: boolean;
let muted: boolean;
let snapshot: MediaPlayerSnapshot;
let session: ReturnType<typeof createSidebarMediaSession>;
let contents: Parameters<typeof createSidebarMediaSession>[0];

beforeEach(() => {
  jest.useFakeTimers();
  playing = true;
  audible = true;
  muted = false;
  snapshot = { explicit: false, track: true, resumable: true, hasMedia: true };
  contents = {
    executeJavaScript: jest.fn(async () => snapshot),
    isDestroyed: () => false,
    isCurrentlyAudible: () => audible,
    isAudioMuted: () => muted,
  };
  session = createSidebarMediaSession(contents, () => playing, jest.fn());
});
afterEach(() => {
  session.dispose();
  jest.useRealTimers();
  document.body.innerHTML = '';
});
const tick = async (ms: number) => {
  session.refresh();
  await jest.advanceTimersByTimeAsync(ms);
};

test('requires sustained audible playback, preserves pause and mute, and clears ended sessions', async () => {
  await tick(4000);
  expect(session.eligible).toBe(false);
  await jest.advanceTimersByTimeAsync(1000);
  expect(session.eligible).toBe(true);
  playing = false;
  audible = false;
  snapshot.track = false;
  await tick(1000);
  expect(session.eligible).toBe(true);
  muted = true;
  await tick(1000);
  expect(session.eligible).toBe(true);
  snapshot.resumable = false;
  await tick(1000);
  expect(session.eligible).toBe(false);
});

test('brief sounds, silent media and decorative playback never qualify', async () => {
  await tick(2000);
  playing = false;
  audible = false;
  snapshot = {
    explicit: false,
    track: false,
    resumable: false,
    hasMedia: true,
  };
  await tick(12000);
  expect(session.eligible).toBe(false);
  playing = true;
  await tick(12000);
  expect(session.eligible).toBe(false);
  audible = true;
  await tick(12000);
  expect(session.eligible).toBe(false);
});

test('embedded players use a longer audible fallback and navigation resets qualification', async () => {
  snapshot = {
    explicit: false,
    track: false,
    resumable: false,
    hasMedia: false,
  };
  await tick(9000);
  expect(session.eligible).toBe(false);
  await jest.advanceTimersByTimeAsync(1000);
  expect(session.eligible).toBe(true);
  session.reset();
  expect(session.eligible).toBe(false);
  expect(jest.getTimerCount()).toBe(0);
});

test('stale page probes cannot requalify a navigated or disposed page', async () => {
  let resolveProbe!: (value: MediaPlayerSnapshot) => void;
  contents.executeJavaScript = jest.fn(
    () =>
      new Promise<MediaPlayerSnapshot>((resolve) => {
        resolveProbe = resolve;
      }),
  );
  session.refresh();
  session.reset();
  resolveProbe(snapshot);
  await jest.advanceTimersByTimeAsync(10000);
  expect(session.eligible).toBe(false);
  expect(jest.getTimerCount()).toBe(0);
});

test('page inspection rejects muted loops and short effects but accepts a long audio track', async () => {
  const media = document.createElement('video');
  document.body.append(media);
  Object.defineProperties(media, {
    duration: { configurable: true, value: 60 },
    paused: { configurable: true, value: false },
    currentTime: { configurable: true, value: 1 },
  });
  contents.executeJavaScript = jest.fn(async (source) => window.eval(source));
  media.loop = true;
  await tick(12000);
  expect(session.eligible).toBe(false);
  media.loop = false;
  media.muted = true;
  await tick(12000);
  expect(session.eligible).toBe(false);
  media.muted = false;
  Object.defineProperty(media, 'duration', { configurable: true, value: 2 });
  await tick(12000);
  expect(session.eligible).toBe(false);
  Object.defineProperty(media, 'duration', { configurable: true, value: 60 });
  await tick(5000);
  expect(session.eligible).toBe(true);
});

test('qualification uses a single deadline and sustained playback avoids one-second probes', async () => {
  await tick(4999);
  expect(contents.executeJavaScript).toHaveBeenCalledTimes(1);
  expect(session.eligible).toBe(false);
  await jest.advanceTimersByTimeAsync(1);
  expect(session.eligible).toBe(true);
  expect(contents.executeJavaScript).toHaveBeenCalledTimes(2);
  await jest.advanceTimersByTimeAsync(60000);
  expect(contents.executeJavaScript).toHaveBeenCalledTimes(14);
});

test('rejected decorative playback uses a slow fallback', async () => {
  snapshot = {
    explicit: false,
    track: false,
    resumable: false,
    hasMedia: true,
  };
  await tick(60000);
  expect(contents.executeJavaScript).toHaveBeenCalledTimes(5);
  expect(session.eligible).toBe(false);
});

test('cached page inspection avoids repeated full scans and handles new media, pause, removal and cleanup', async () => {
  contents.executeJavaScript = jest.fn(async (source) => window.eval(source));
  const scans = jest.spyOn(document, 'querySelectorAll');
  await tick(0);
  expect(scans).toHaveBeenCalledTimes(1);
  const audio = document.createElement('audio');
  Object.defineProperties(audio, {
    duration: { configurable: true, value: 60 },
    paused: { configurable: true, value: false },
    currentTime: { configurable: true, value: 1 },
  });
  document.body.append(audio);
  await jest.advanceTimersByTimeAsync(0);
  audio.dispatchEvent(new Event('playing'));
  await tick(5000);
  expect(session.eligible).toBe(true);
  await jest.advanceTimersByTimeAsync(20000);
  expect(scans).toHaveBeenCalledTimes(1);
  Object.defineProperty(audio, 'paused', { configurable: true, value: true });
  playing = false;
  audible = false;
  audio.dispatchEvent(new Event('pause'));
  await tick(0);
  expect(session.eligible).toBe(true);
  audio.remove();
  await jest.advanceTimersByTimeAsync(0);
  await tick(0);
  expect(session.eligible).toBe(false);
  session.dispose();
  expect((window as any)[SIDEBAR_MEDIA_CACHE_KEY]).toBeUndefined();
  expect(jest.getTimerCount()).toBe(0);
  scans.mockRestore();
});
