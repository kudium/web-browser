import { EventEmitter } from 'events';
import type { WebContents, WebFrameMain, ContextMenuParams } from 'electron';
import {
  PictureInPictureController,
  pictureInPicturePage,
} from '../main/pictureInPicture';

const settle = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};
function fixture() {
  let active = false;
  const frame = {
    detached: false,
    isDestroyed: () => false,
    executeJavaScript: jest.fn(async (code: string, gesture: boolean) => {
      if (gesture) active = !active;
      return { available: true, active, area: 640 * 360 };
    }),
  } as unknown as WebFrameMain;
  const contents = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    mainFrame: { framesInSubtree: [frame] },
  }) as unknown as WebContents;
  const changed = jest.fn();
  const controller = new PictureInPictureController(
    contents,
    () => true,
    changed
  );
  return { controller, contents, frame, changed };
}

describe('native PiP lifecycle', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it('inspects without a user gesture and toggles only on an explicit action', async () => {
    const { controller, frame, contents } = fixture();
    await settle();
    expect(controller.state).toMatchObject({ available: true, active: false });
    expect(frame.executeJavaScript).toHaveBeenLastCalledWith(
      expect.any(String),
      false
    );
    await controller.toggle();
    expect(controller.state.active).toBe(true);
    expect(
      (frame.executeJavaScript as jest.Mock).mock.calls.some(
        ([, gesture]) => gesture === true
      )
    ).toBe(true);
    await controller.toggle();
    expect(controller.state.active).toBe(false);
    contents.emit('destroyed');
    expect(jest.getTimerCount()).toBe(0);
  });
  it('ignores a menu opened before navigation and rejects foreign frames', async () => {
    const { controller, frame, contents } = fixture();
    await settle();
    const click = controller.contextAction({
      frame,
      srcURL: 'https://example.com/video',
    } as ContextMenuParams);
    contents.emit(
      'did-start-navigation',
      {},
      'https://next.example',
      false,
      true
    );
    click();
    await settle();
    expect(
      (frame.executeJavaScript as jest.Mock).mock.calls.every(
        ([, gesture]) => !gesture
      )
    ).toBe(true);
    const foreign = { ...frame, executeJavaScript: jest.fn() };
    await controller.toggle({ frame: foreign } as unknown as ContextMenuParams);
    expect(foreign.executeJavaScript).not.toHaveBeenCalled();
    controller.dispose();
  });
  it('ignores late inspection results after navigation', async () => {
    const { controller, frame, contents } = fixture();
    await settle();
    let finish!: (value: unknown) => void;
    (frame.executeJavaScript as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const pending = controller.refresh();
    contents.emit(
      'did-start-navigation',
      {},
      'https://next.example',
      false,
      true
    );
    finish({ available: true, active: true, area: 100 });
    await pending;
    expect(controller.state).toEqual({ available: false, active: false });
    controller.dispose();
  });
  it('reports denied playback, permits retries, and never leaves busy set', async () => {
    const { controller, frame } = fixture();
    await settle();
    (frame.executeJavaScript as jest.Mock).mockImplementation(
      async (_code: string, gesture: boolean) => {
        if (gesture) throw new Error('NotAllowedError');
        return { available: true, active: false, area: 100 };
      }
    );
    await controller.toggle();
    expect(controller.state).toMatchObject({
      busy: false,
      active: false,
      error: expect.stringContaining('could not open'),
    });
    controller.dispose();
  });
});

describe('video selection and website restrictions', () => {
  let active: HTMLVideoElement | null;
  beforeEach(() => {
    document.body.innerHTML = '';
    active = null;
    Object.defineProperty(document, 'pictureInPictureEnabled', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(document, 'pictureInPictureElement', {
      configurable: true,
      get: () => active,
    });
    Object.defineProperty(document, 'exitPictureInPicture', {
      configurable: true,
      value: jest.fn(async () => {
        active = null;
      }),
    });
  });
  function video(width = 640, paused = false) {
    const element = document.createElement('video');
    Object.defineProperties(element, {
      readyState: { value: 4 },
      videoWidth: { value: width },
      paused: { configurable: true, value: paused },
      disablePictureInPicture: { configurable: true, value: false },
      requestPictureInPicture: {
        value: jest.fn(async () => {
          active = element;
        }),
      },
    });
    element.getBoundingClientRect = () => ({ width, height: 360 } as DOMRect);
    document.body.append(element);
    return element;
  }
  it('selects the largest playing video and exits when it is paused in PiP', async () => {
    const small = video(100);
    const large = video(800);
    await pictureInPicturePage('inspect', 'selection');
    await pictureInPicturePage('toggle', 'selection');
    expect(large.requestPictureInPicture).toHaveBeenCalledTimes(1);
    expect(small.requestPictureInPicture).not.toHaveBeenCalled();
    Object.defineProperty(large, 'paused', { value: true });
    expect((await pictureInPicturePage('inspect', 'selection')).active).toBe(
      true
    );
    await pictureInPicturePage('toggle', 'selection');
    expect(document.exitPictureInPicture).toHaveBeenCalled();
  });
  it('automatic PiP ignores muted loops and closes only the player it opened', async () => {
    const loop = video(1000);loop.muted=true;loop.loop=true;
    const playing = video(640);
    await pictureInPicturePage('inspect','automatic');
    await pictureInPicturePage('auto-enter','automatic');
    expect(playing.requestPictureInPicture).toHaveBeenCalledTimes(1);
    expect(loop.requestPictureInPicture).not.toHaveBeenCalled();
    await pictureInPicturePage('auto-exit','automatic');
    expect(document.pictureInPictureElement).toBeNull();
    await pictureInPicturePage('toggle','automatic');
    const manual = document.pictureInPictureElement;
    await pictureInPicturePage('auto-exit','automatic');
    expect(document.pictureInPictureElement).toBe(manual);
  });
  it('does not start an automatic player for a page containing only muted video', async () => {
    const muted = video();muted.muted=true;
    const inspection=await pictureInPicturePage('inspect','muted');
    expect(inspection.available).toBe(true);
    expect(inspection.autoArea).toBe(0);
    await pictureInPicturePage('auto-enter','muted');
    expect(muted.requestPictureInPicture).not.toHaveBeenCalled();
  });
  it('targets the exact right-clicked video even with duplicate sources', async () => {
    const first = video();
    const second = video();
    first.src = 'https://example.com/video';
    second.src = first.src;
    await pictureInPicturePage('inspect', 'context');
    second.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, composed: true })
    );
    await pictureInPicturePage('context', 'context', second.src);
    expect(second.requestPictureInPicture).toHaveBeenCalled();
    expect(first.requestPictureInPicture).not.toHaveBeenCalled();
  });
  it('ignores audio, paused videos, and disabled PiP', async () => {
    document.body.append(document.createElement('audio'));
    video(800, true);
    const disabled = video();
    Object.defineProperty(disabled, 'disablePictureInPicture', { value: true });
    expect((await pictureInPicturePage('inspect', 'disabled')).available).toBe(
      false
    );
    await expect(
      pictureInPicturePage('context', 'disabled', disabled.src)
    ).rejects.toThrow();
    expect(disabled.requestPictureInPicture).not.toHaveBeenCalled();
    Object.defineProperty(document, 'pictureInPictureEnabled', {
      value: false,
    });
    expect((await pictureInPicturePage('inspect', 'disabled')).available).toBe(
      false
    );
  });
  it('finds shadow DOM video and rejects commands for an older document', async () => {
    const element = video();
    const host = document.createElement('div');
    document.body.append(host);
    host.attachShadow({ mode: 'open' }).append(element);
    expect((await pictureInPicturePage('inspect', 'old')).available).toBe(true);
    await pictureInPicturePage('inspect', 'new');
    await expect(pictureInPicturePage('toggle', 'old')).rejects.toThrow(
      'Video document changed'
    );
    await pictureInPicturePage('toggle', 'new');
    expect(element.requestPictureInPicture).toHaveBeenCalled();
  });
});
