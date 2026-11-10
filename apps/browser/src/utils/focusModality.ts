/**
 * Distinguish pointer selection from keyboard navigation without blurring
 * controls.
 */
export function installFocusModality(targetDocument: Document = document) {
  const root = targetDocument.documentElement;
  root.dataset.inputModality = 'pointer';
  const pointer = () => {
    root.dataset.inputModality = 'pointer';
  };
  const keyboard = (event: KeyboardEvent) => {
    if (
      [
        'Tab',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Home',
        'End',
      ].includes(event.key)
    )
      root.dataset.inputModality = 'keyboard';
  };
  targetDocument.addEventListener('pointerdown', pointer, true);
  targetDocument.addEventListener('keydown', keyboard, true);
  return () => {
    targetDocument.removeEventListener('pointerdown', pointer, true);
    targetDocument.removeEventListener('keydown', keyboard, true);
    delete root.dataset.inputModality;
  };
}
