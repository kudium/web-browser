import { useEffect, useState } from 'react';
import { Globe2 } from 'lucide-react';
import { Props } from './types';

export function AppIcon({ icon, title }: Props) {
  const [loadedIcon, setLoadedIcon] = useState<string>();
  useEffect(() => {
    if (!icon) return undefined;
    const image = new Image();
    image.onload = () => setLoadedIcon(icon);
    image.src = icon;
    return () => {
      image.onload = null;
    };
  }, [icon]);
  return (
    <span className="app-icon">
      {loadedIcon ? (
        <img src={loadedIcon} alt={title || ''} />
      ) : (
        <Globe2 aria-hidden="true" size={22} />
      )}
    </span>
  );
}
