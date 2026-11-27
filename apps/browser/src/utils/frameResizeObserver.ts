/** Run layout-changing work outside ResizeObserver delivery, once per frame. */
export function frameResizeObserver(update: () => void, owner: Window = window): ResizeObserver {
  let frame: number | undefined;
  const observer = new ResizeObserver(() => {
    if (frame !== undefined) return;
    frame = owner.requestAnimationFrame(() => {
      frame = undefined;
      update();
    });
  });
  const disconnect = observer.disconnect.bind(observer);
  observer.disconnect = () => {
    disconnect();
    if (frame !== undefined) owner.cancelAnimationFrame(frame);
    frame = undefined;
  };
  return observer;
}
