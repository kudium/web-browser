import { Button } from '@radix-ui/themes';
import { Layers3 } from 'lucide-react';
import type { ComponentProps } from 'react';
import type { Collection } from '../../utils/SpaceManager';
import { IconPicker } from './IconPicker';
import { iconSymbols, imageSymbol } from './iconSymbols';

type CollectionAppearance = Pick<Collection, 'iconImage' | 'iconEmoji'>;

export function CollectionIcon({
  collection,
  size = 16,
  ...props
}: ComponentProps<typeof Layers3> & { collection?: CollectionAppearance }) {
  if (collection?.iconEmoji)
    return (
      <span
        className={props.className}
        style={{ fontSize: size, lineHeight: 1, ...props.style }}
        aria-hidden="true"
      >
        {collection.iconEmoji}
      </span>
    );
  const symbol = imageSymbol(collection?.iconImage || '');
  if (collection?.iconImage && !symbol)
    return (
      <img
        className={props.className}
        src={collection.iconImage}
        alt=""
        style={{
          width: size,
          height: size,
          objectFit: 'contain',
          ...props.style,
        }}
      />
    );
  const Symbol = symbol ? iconSymbols[symbol] : Layers3;
  return <Symbol size={size} {...props} />;
}

export function CollectionIconPicker({
  value,
  onChange,
}: {
  value: { emoji: string; image: string; focusColor?: string };
  onChange: (value: {
    emoji: string;
    image: string;
    focusColor?: string;
  }) => void;
}) {
  return (
    <IconPicker
      label="Choose collection icon"
      emoji={value.emoji}
      image={value.image}
      preview={
        <CollectionIcon
          collection={{ iconEmoji: value.emoji, iconImage: value.image }}
          size={22}
        />
      }
      onChange={(icon) => onChange({ ...value, ...icon })}
      focusColor={value.focusColor}
      colorMode="background"
      onFocusColorChange={(color) => onChange({ ...value, focusColor: color })}
      renderDefaultChoice={(close) => (
        <Button
          type="button"
          variant="soft"
          color="gray"
          onClick={() => {
            onChange({ ...value, emoji: '', image: '' });
            close();
          }}
        >
          <CollectionIcon />
          Default collection icon
        </Button>
      )}
    />
  );
}
