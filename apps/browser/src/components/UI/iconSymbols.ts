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
import type { SpaceIconName } from '../../utils/SpaceManager';

export const iconSymbols = {
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
// Stored alongside custom images so group identities use the existing persistence path.
export function symbolImage(name: SpaceIconName) {
  return `kudium-symbol:${name}`;
}
export function imageSymbol(image?: string): SpaceIconName | undefined {
  const name = image?.startsWith('kudium-symbol:')
    ? image.slice('kudium-symbol:'.length)
    : '';
  return Object.prototype.hasOwnProperty.call(iconSymbols, name)
    ? (name as SpaceIconName)
    : undefined;
}
