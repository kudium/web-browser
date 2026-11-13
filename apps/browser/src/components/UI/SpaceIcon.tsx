import { Layers } from 'lucide-react';
import { Space, SpaceIconName } from '../../utils/SpaceManager';
import { IconPicker } from './IconPicker';
import { iconSymbols as symbols, imageSymbol } from './iconSymbols';

export function SpaceIcon({
  space,
}: {
  space: Pick<Space, 'icon' | 'iconImage' | 'iconEmoji'>;
}) {
  const Symbol = Object.prototype.hasOwnProperty.call(symbols, space.icon || '')
    ? symbols[space.icon!]
    : Layers;
  if (space.iconEmoji)
    return (
      <span className="space-symbol-emoji" aria-hidden="true">
        {space.iconEmoji}
      </span>
    );
  return space.iconImage ? (
    <img className="space-symbol-image" src={space.iconImage} alt="" />
  ) : (
    <Symbol
      className="space-symbol"
      size={17}
      strokeWidth={1.6}
      aria-hidden="true"
    />
  );
}
export function SpaceIconPicker({
  icon,
  image,
  emoji,
  onChange,
  label,
}: {
  icon: SpaceIconName;
  image: string;
  emoji: string;
  onChange: (patch: Pick<Space, 'icon' | 'iconImage' | 'iconEmoji'>) => void;
  label: string;
}) {
  return (
    <IconPicker
      label={label}
      emoji={emoji}
      image={image}
      preview={
        <SpaceIcon space={{ icon, iconImage: image, iconEmoji: emoji }} />
      }
      symbol={!emoji && !image ? icon : undefined}
      onChange={(value) => {
        const selectedSymbol = imageSymbol(value.image);
        onChange({
          ...(selectedSymbol ? { icon: selectedSymbol } : {}),
          iconEmoji: value.emoji || undefined,
          iconImage: selectedSymbol ? undefined : value.image || undefined,
        });
      }}
    />
  );
}
