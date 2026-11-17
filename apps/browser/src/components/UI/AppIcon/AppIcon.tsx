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
    setLoadedIcon(undefined);
    const image = new Image();
    image.onload = () => setLoadedIcon(icon);
    image.onerror = () => setLoadedIcon(undefined);
    image.src = icon;
    return () => {
      image.onload = null;
      image.onerror = null;
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
      {icon && loadedIcon === icon ? (
        <img src={loadedIcon} alt={title || ''} />
      ) : (
        <span className="app-icon-fallback-mark" aria-hidden="true">
          <Globe2
            size={22}
            strokeWidth={1.8}
            style={{ width: '70%', height: '70%', color: 'inherit', borderRadius: 0 }}
          />
        </span>
      )}
    </span>
  );
}
