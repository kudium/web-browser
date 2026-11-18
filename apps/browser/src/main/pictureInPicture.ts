import { randomUUID } from 'crypto';
import type { ContextMenuParams, WebContents, WebFrameMain } from 'electron';
import type { PictureInPictureState } from '../browser/contracts';

type VideoState = { available: boolean; active: boolean; area: number; autoArea?: number };

/** Runs in the website, with no Node access or privileged browser bridge. */
export async function pictureInPicturePage(
  action: 'inspect' | 'toggle' | 'context' | 'auto-enter' | 'auto-exit',
  key: string,
  source = ''
): Promise<VideoState> {
  const root = window as unknown as Record<
    string,
    { key: string; clicked: HTMLVideoElement | null; automatic: HTMLVideoElement | null }
  >;
  const captureKey = '__kudium_browser_picture_in_picture';
  // Remember the exact right-clicked video, including videos in open shadow DOM.
  if (!root[captureKey]) {
    if (action !== 'inspect') throw new Error('Video document changed');
    const memory = { key, clicked: null as HTMLVideoElement | null, automatic: null as HTMLVideoElement | null };
    Object.defineProperty(root, captureKey, { value: memory });
    document.addEventListener(
      'contextmenu',
      (event) => {
        memory.clicked =
          (event
            .composedPath()
            .find((node) => node instanceof HTMLVideoElement) as
            | HTMLVideoElement
            | undefined) || null;
      },
      true
    );
  }
  if (action === 'inspect') root[captureKey].key = key;
  else if (root[captureKey].key !== key)
    throw new Error('Video document changed');
  const videos: HTMLVideoElement[] = [];
  const collect = (parent: Document | ShadowRoot) => {
    videos.push(
      ...Array.from(parent.querySelectorAll<HTMLVideoElement>('video'))
    );
    parent.querySelectorAll('*').forEach((node) => {
      if (node.shadowRoot) collect(node.shadowRoot);
    });
  };
  collect(document);
  const area = (video: HTMLVideoElement) => {
    const bounds = video.getBoundingClientRect();
    const style = getComputedStyle(video);
    return style.visibility === 'hidden' || style.display === 'none'
      ? 0
      : bounds.width * bounds.height;
  };
  const supported = (video: HTMLVideoElement) =>
    document.pictureInPictureEnabled &&
    !video.disablePictureInPicture &&
    video.readyState > 0 &&
    video.videoWidth > 0 &&
    typeof video.requestPictureInPicture === 'function';
  const active = document.pictureInPictureElement as HTMLVideoElement | null;
  const automaticVideos = videos.filter(entry => supported(entry) && !entry.paused && !entry.ended &&
    !entry.muted && entry.volume > 0 && !entry.loop && area(entry) >= 14400);
  if (action === 'auto-exit') {
    if (active && root[captureKey].automatic === active) await document.exitPictureInPicture();
    root[captureKey].automatic = null;
    return {available: false, active: Boolean(document.pictureInPictureElement), area: 0};
  }
  const { clicked } = root[captureKey];
  let video: HTMLVideoElement | null | undefined;
  if (action === 'context') {
    video =
      clicked?.isConnected &&
      (!source || clicked.currentSrc === source || clicked.src === source)
        ? clicked
        : videos.find(
            (entry) =>
              source && (entry.currentSrc === source || entry.src === source)
          );
  } else {
    video =
      active ||
      videos
        .filter(
          (entry) =>
            supported(entry) && !entry.paused && !entry.ended && area(entry) > 0
            && (action !== 'auto-enter' || (!entry.muted && entry.volume > 0 && !entry.loop && area(entry) >= 14400))
        )
        .sort((a, b) => area(b) - area(a))[0];
  }
  if (action === 'auto-enter') {
    if (!active && video && supported(video)) {
      await video.requestPictureInPicture();
      root[captureKey].automatic = video;
    }
  } else if (action !== 'inspect') {
    root[captureKey].automatic = null;
    if (!video) throw new Error('No supported video');
    if (active === video) await document.exitPictureInPicture();
    else {
      if (!supported(video))
        throw new Error('Picture in picture is unavailable');
      await video.requestPictureInPicture();
    }
  }
  return {
    available: Boolean(video && supported(video)),
    active: Boolean(document.pictureInPictureElement),
    area: video ? area(video) : 0,
    autoArea: Math.max(0,...automaticVideos.map(area)),
  };
}

function bounded<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Video inspection timed out')),
      3000
    );
    promise
      .then((value) => {
        clearTimeout(timer);
        return resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/** Manual actions and opted-in tab transitions are controlled by browser chrome. */
export class PictureInPictureController {
  state: PictureInPictureState = { available: false, active: false };

  private key = `__kudium_pip_${randomUUID().replace(/-/g, '')}`;

  private revision = 0;

  private disposed = false;

  private scanning = false;

  private busy = false;

  private visibilityRevision = 0;

  private automaticFrame?: WebFrameMain;

  private shown = true;

  private candidates: { frame: WebFrameMain; state: VideoState }[] = [];

  private readonly timer: ReturnType<typeof setInterval>;

  constructor(
    private readonly contents: WebContents,
    private readonly visible: () => boolean,
    private readonly changed: () => void
  ) {
    this.timer = setInterval(() => {
      if (this.visible() || this.state.active) this.refresh();
    }, 1000);
    this.timer.unref?.();
    contents.on('did-start-navigation', this.navigation);
    contents.on('dom-ready', this.refresh);
    contents.on('media-started-playing', this.refresh);
    contents.on('media-paused', this.refresh);
    contents.once('destroyed', this.dispose);
    this.refresh();
  }

  private navigation = (_event: unknown, _url: string, inPlace: boolean) => {
    if (inPlace) return;
    this.revision += 1;
    this.key = `__kudium_pip_${randomUUID().replace(/-/g, '')}`;
    this.candidates = [];
    this.setState({ available: false, active: false });
  };

  private current(revision: number) {
    return (
      !this.disposed &&
      !this.contents.isDestroyed() &&
      revision === this.revision
    );
  }

  private owns(frame: WebFrameMain) {
    try {
      return (
        !frame.isDestroyed() &&
        !frame.detached &&
        this.contents.mainFrame.framesInSubtree.includes(frame)
      );
    } catch {
      return false;
    }
  }

  private setState(state: PictureInPictureState) {
    if (JSON.stringify(this.state) === JSON.stringify(state)) return;
    this.state = state;
    this.changed();
  }

  private run(
    frame: WebFrameMain,
    action: 'inspect' | 'toggle' | 'context' | 'auto-enter' | 'auto-exit',
    source = ''
  ) {
    if (frame.detached || frame.isDestroyed())
      return Promise.reject(new Error('Video frame closed'));
    return bounded(
      frame.executeJavaScript(
        `(${pictureInPicturePage.toString()})(${JSON.stringify(
          action
        )},${JSON.stringify(this.key)},${JSON.stringify(source)})`,
        action !== 'inspect'
      )
    );
  }

  refresh = async () => {
    if (
      this.disposed ||
      this.scanning ||
      this.busy ||
      this.contents.isDestroyed()
    )
      return;
    this.scanning = true;
    const { revision } = this;
    try {
      const frames = this.contents.mainFrame.framesInSubtree;
      const results = await Promise.all(
        frames.map(async (frame) => {
          try {
            const value = (await this.run(frame, 'inspect')) as VideoState;
            if (
              typeof value?.available !== 'boolean' ||
              typeof value?.active !== 'boolean' ||
              !Number.isFinite(value.area) ||
              value.area < 0
            )
              return undefined;
            return { frame, state: value };
          } catch {
            return undefined;
          }
        })
      );
      if (!this.current(revision) || this.busy) return;
      this.candidates = results.filter(
        (entry): entry is NonNullable<typeof entry> => Boolean(entry)
      );
      this.setState({
        available: this.candidates.some((entry) => entry.state.available),
        active: this.candidates.some((entry) => entry.state.active),
        busy: false,
        error: this.state.error,
      });
    } catch {
      if (this.current(revision))
        this.setState({ available: false, active: false });
    } finally {
      this.scanning = false;
    }
  };

  contextAction(params: ContextMenuParams) {
    const { revision } = this;
    return () => {
      if (this.current(revision)) this.toggle(params);
    };
  }

  async visibilityChanged(shown: boolean, enabled: boolean) {
    this.shown = shown;
    const transition = ++this.visibilityRevision;
    const { revision } = this;
    if (shown || !enabled) {
      const frame = this.automaticFrame;
      this.automaticFrame = undefined;
      if (frame && this.owns(frame)) await this.run(frame, 'auto-exit').catch(() => {});
      await this.refresh();
      return;
    }
    if (!this.current(revision) || this.busy || this.state.active) return;
    await this.refresh();
    if (!this.current(revision) || transition !== this.visibilityRevision || this.shown || this.state.active) return;
    const frame = this.candidates.slice().sort((a,b) => (b.state.autoArea || 0)-(a.state.autoArea || 0)).find(entry => entry.state.available && (entry.state.autoArea || 0)>0)?.frame;
    if (!frame || !this.owns(frame)) return;
    this.automaticFrame = frame;
    this.busy = true;
    try {
      await this.run(frame, 'auto-enter');
      if (!this.current(revision) || transition !== this.visibilityRevision || this.shown) {
        if (this.owns(frame)) await this.run(frame, 'auto-exit').catch(() => {});
        this.automaticFrame = undefined;
      }
    } catch { this.automaticFrame = undefined; }
    finally { this.busy = false; await this.refresh(); }
  }

  async toggle(params?: ContextMenuParams) {
    if (this.busy || this.disposed || this.contents.isDestroyed()) return;
    this.visibilityRevision += 1;
    this.automaticFrame = undefined;
    const { revision } = this;
    if (!params) await this.refresh();
    if (!this.current(revision)) return;
    const frame = params
      ? params.frame
      : this.candidates
          .slice()
          .sort(
            (a, b) =>
              Number(b.state.active) - Number(a.state.active) ||
              b.state.area - a.state.area
          )
          .find((entry) => entry.state.available || entry.state.active)?.frame;
    if (!frame || !this.owns(frame)) return;
    this.busy = true;
    this.setState({ ...this.state, busy: true, error: undefined });
    try {
      await this.run(frame, params ? 'context' : 'toggle', params?.srcURL);
    } catch {
      if (this.current(revision))
        this.setState({
          ...this.state,
          error:
            'This video could not open in picture in picture. Try playing it again.',
        });
    } finally {
      this.busy = false;
      if (this.current(revision)) {
        this.setState({ ...this.state, busy: false });
        await this.refresh();
      }
    }
  }

  dispose = () => {
    this.disposed = true;
    this.revision += 1;
    this.visibilityRevision += 1;
    this.automaticFrame = undefined;
    clearInterval(this.timer);
    this.contents.removeListener('did-start-navigation', this.navigation);
    this.contents.removeListener('dom-ready', this.refresh);
    this.contents.removeListener('media-started-playing', this.refresh);
    this.contents.removeListener('media-paused', this.refresh);
    this.contents.removeListener('destroyed', this.dispose);
    this.candidates = [];
  };
}
