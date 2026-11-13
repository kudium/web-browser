import { useEffect, useState } from 'react';
import { Globe2 } from 'lucide-react';
import { iconSymbols, imageSymbol } from '../iconSymbols';
import { Props } from './types';

export function AppIcon({ icon, title }: Props) {
  const [loadedIcon, setLoadedIcon] = useState<string>();
  useEffect(() => {
    if (!icon || imageSymbol(icon)) {
      setLoadedIcon(undefined);
      return undefined;
    }
    const image = new Image();
    image.onload = () => setLoadedIcon(icon);
    image.src = icon;
    return () => {
      image.onload = null;
    };
  }, [icon]);
  const symbol = imageSymbol(icon);
  const Symbol = symbol && iconSymbols[symbol];
  if (Symbol)
    return (
      <span className="app-icon">
        <Symbol size={22} strokeWidth={1.6} aria-hidden="true" />
      </span>
    );
  return (
    <span className="app-icon">
      {icon && loadedIcon ? (
        <img src={loadedIcon} alt={title || ''} />
      ) : (
        <Globe2 aria-hidden="true" size={22} />
      )}
    </span>
  );
}
