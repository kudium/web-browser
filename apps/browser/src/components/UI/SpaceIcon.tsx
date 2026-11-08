import {
  Music,
  Camera,
  Gamepad2,
  Rocket,
  FlaskConical,
  Plane,
  ShoppingBag,
  Wallet,
  Dumbbell,
  Sun,
  Moon,
  Palette,
  Home,
  Briefcase,
  Compass,
  Code2,
  BookOpen,
  Heart,
  Coffee,
  Layers,
  Star,
  Globe,
} from 'lucide-react';
import { Select } from '@radix-ui/themes';
import { Space, SpaceIconName } from '../../utils/SpaceManager';
import { IconPicker } from './IconPicker';

const symbols = {
  home: Home,
  work: Briefcase,
  explore: Compass,
  code: Code2,
  reading: BookOpen,
  heart: Heart,
  coffee: Coffee,
  layers: Layers,
  star: Star,
  globe: Globe,
  music: Music,
  camera: Camera,
  game: Gamepad2,
  rocket: Rocket,
  science: FlaskConical,
  travel: Plane,
  shopping: ShoppingBag,
  finance: Wallet,
  fitness: Dumbbell,
  sun: Sun,
  moon: Moon,
  palette: Palette,
};
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
      onChange={(value) =>
        onChange({
          iconEmoji: value.emoji || undefined,
          iconImage: value.image || undefined,
        })
      }
      renderDefaultChoice={(done) => (
        <Select.Root
          value={emoji || image ? '' : icon}
          onValueChange={(value) => {
            onChange({
              icon: value as SpaceIconName,
              iconImage: undefined,
              iconEmoji: undefined,
            });
            done();
          }}
        >
          <Select.Trigger
            aria-label="Default space icon"
            className="icon-picker-symbol-select"
          >
            <SpaceIcon space={{ icon }} /> Choose a symbol
          </Select.Trigger>
          <Select.Content>
            {Object.entries(symbols).map(([name, Symbol]) => (
              <Select.Item key={name} value={name}>
                <span className="space-icon-option">
                  <Symbol size={16} />
                  {name[0].toUpperCase() + name.slice(1)}
                </span>
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      )}
    />
  );
}
