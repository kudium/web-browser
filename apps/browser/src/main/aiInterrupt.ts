import type { Input, WebContents } from 'electron';

/** Human keys must not edit the working page. CDP input bypasses this hook. */
export function attachAIInputGuard(
  contents: WebContents,
  owned: () => boolean,
  active: () => boolean
) {
  const listener = (event: { preventDefault(): void }, input: Input) => {
    if (input.type === 'keyDown' && owned() && active()) event.preventDefault();
  };
  contents.on('before-input-event', listener);
  return () => contents.removeListener('before-input-event', listener);
}
