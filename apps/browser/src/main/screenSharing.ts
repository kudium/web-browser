import { desktopCapturer, webContents } from 'electron';
import type { BrowserWindow, Session, WebContents } from 'electron';
import { showBrowserDialog } from './dialogs';
import { getBrowserPreferences } from './preferences';
import { getSiteSettings, siteOrigin } from './siteSettings';

type Handler = NonNullable<
  Parameters<Session['setDisplayMediaRequestHandler']>[0]
>;

/** Every fallback request requires a fresh source choice, even after a site grant. */
export function screenSharingHandler(
  profile: string,
  ownerFor: (contents: WebContents) => BrowserWindow | undefined,
): Handler {
  return async (request, callback) => {
    const frame = request.frame;
    const contents =
      frame && !frame.isDestroyed() ? webContents.fromFrame(frame) : undefined;
    const owner =
      contents && !contents.isDestroyed() ? ownerFor(contents) : undefined;
    const origin = siteOrigin(request.securityOrigin);
    const blocked = () =>
      !origin ||
      getBrowserPreferences().permissions === 'block' ||
      getSiteSettings(profile, origin).permissions['display-capture'] ===
        'block';
    if (
      !frame ||
      !contents ||
      !owner ||
      owner.isDestroyed() ||
      !request.userGesture ||
      !request.videoRequested ||
      blocked()
    ) {
      callback({});
      return;
    }
    const controller = new AbortController();
    let settled = false;
    const finish = (streams: Electron.Streams) => {
      if (settled) return;
      settled = true;
      contents.removeListener('did-start-navigation', navigating);
      contents.removeListener('destroyed', cancel);
      owner.removeListener('closed', cancel);
      controller.abort();
      callback(streams);
    };
    const cancel = () => finish({});
    // Conservatively cancel on any document navigation in the requesting tab.
    const navigating = (
      _event: unknown,
      _url: string,
      sameDocument: boolean,
    ) => {
      if (!sameDocument) cancel();
    };
    contents.on('did-start-navigation', navigating);
    contents.once('destroyed', cancel);
    owner.once('closed', cancel);
    const stillValid = () =>
      !settled &&
      !frame.isDestroyed() &&
      !contents.isDestroyed() &&
      !owner.isDestroyed() &&
      ownerFor(contents) === owner &&
      !blocked();
    try {
      const options = {
        types: ['window', 'screen'] as ('window' | 'screen')[],
        thumbnailSize: { width: 0, height: 0 },
        fetchWindowIcons: false,
      };
      const sources = await desktopCapturer.getSources(options);
      if (!stillValid() || !sources.length) {
        cancel();
        return;
      }
      const answer = await showBrowserDialog(owner, {
        message: 'Choose what to share',
        detail:
          'Share only the window or screen you choose. Audio is not included in this browser picker.',
        siteOrigin: origin,
        icon: 'shield',
        inputs: [
          {
            key: 'source',
            label: 'Window or screen',
            required: true,
            type: 'select',
            options: sources.map((source, index) => ({
              value: String(index),
              label: source.name || `Source ${index + 1}`,
            })),
          },
        ],
        buttons: ['Cancel', 'Share'],
        defaultId: 0,
        cancelId: 0,
        signal: controller.signal,
      });
      if (answer.response !== 1 || !stillValid()) {
        cancel();
        return;
      }
      const value = answer.inputValues?.source;
      const index =
        typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
      const selected =
        Number.isInteger(index) && index >= 0 ? sources[index] : undefined;
      if (!selected) {
        cancel();
        return;
      }
      const fresh = await desktopCapturer.getSources(options);
      const current = fresh.find((source) => source.id === selected.id);
      if (!stillValid() || !current) {
        cancel();
        return;
      }
      finish({ video: current });
    } catch {
      cancel();
    }
  };
}

export function configureScreenSharing(
  target: Session,
  profile: string,
  ownerFor: (contents: WebContents) => BrowserWindow | undefined,
) {
  target.setDisplayMediaRequestHandler(
    screenSharingHandler(profile, ownerFor),
    // Keep per-site blocks and request-lifetime checks in the browser picker path.
    { useSystemPicker: false },
  );
}
