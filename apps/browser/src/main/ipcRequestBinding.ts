import type { IpcMainInvokeEvent, WebContents } from 'electron';

/** Preserve the document that authorized an asynchronous privileged request. */
export function watchIPCRequest(
  event: IpcMainInvokeEvent,
  trusted: (contents: WebContents) => boolean
) {
  const contents = event.sender;
  const frame = event.senderFrame;
  const url = contents.getURL();
  let replaced = false;
  const invalidate = () => {
    replaced = true;
  };
  const navigating = (
    _event: unknown,
    _url: string,
    inPage: boolean,
    mainFrame: boolean
  ) => {
    if (mainFrame && !inPage) invalidate();
  };
  const active = () =>
    !replaced &&
    !contents.isDestroyed() &&
    contents.mainFrame === frame &&
    contents.getURL() === url &&
    trusted(contents);
  const assert = () => {
    if (!active())
      throw new Error(
        'This window or its access changed. Try the action again.'
      );
  };
  assert();
  contents.on('did-start-navigation', navigating);
  contents.on('destroyed', invalidate);
  contents.on('render-process-gone', invalidate);
  return {
    active,
    assert,
    dispose: () => {
      contents.removeListener('did-start-navigation', navigating);
      contents.removeListener('destroyed', invalidate);
      contents.removeListener('render-process-gone', invalidate);
    },
  };
}
