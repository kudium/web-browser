import { PictureInPicture2 } from 'lucide-react';
import type { PictureInPictureState } from '../../browser/contracts';
import { ChromeIconButton } from './ChromeIconButton';

export function PictureInPictureButton({
  state,
  disabled,
  onToggle,
}: {
  state: PictureInPictureState | undefined;
  disabled: boolean;
  onToggle: () => void;
}) {
  if (!state || (!state.available && !state.active)) return null;
  return (
    <ChromeIconButton
      icon={PictureInPicture2}
      className="picture-in-picture-button"
      label={state.active ? 'Exit picture in picture' : 'Picture in picture'}
      aria-pressed={state.active}
      disabled={disabled || state.busy}
      onClick={onToggle}
    />
  );
}
