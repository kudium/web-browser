/**
 * Distinguish pointer selection from keyboard navigation without blurring
 * controls.
 */
export function installFocusModality() {
  const root = document.documentElement;
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
  document.addEventListener('pointerdown', pointer, true);
  document.addEventListener('keydown', keyboard, true);
  return () => {
    document.removeEventListener('pointerdown', pointer, true);
    document.removeEventListener('keydown', keyboard, true);
    delete root.dataset.inputModality;
  };
}
