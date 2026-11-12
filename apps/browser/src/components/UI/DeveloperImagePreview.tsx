import { useState } from 'react';
import { Button } from '@radix-ui/themes';
import {
  usePreviewZoom,
  clampPreviewZoom,
} from '../../utils/hooks/usePreviewZoom';

export function DeveloperImagePreview({
  url,
  name,
  onError,
}: {
  url: string;
  name: string;
  onError: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState<number>();
  const container = usePreviewZoom(zoom, setZoom);
  return (
    <div className="developer-format-preview">
      <div
        className="developer-preview-controls"
        role="group"
        aria-label="Image zoom"
      >
        <Button
          size="1"
          variant="ghost"
          aria-label="Zoom out"
          disabled={zoom <= 0.25}
          onClick={() => setZoom(clampPreviewZoom(zoom / 1.25))}
        >
          −
        </Button>
        <Button
          size="1"
          variant="ghost"
          aria-label="Reset image zoom"
          onClick={() => setZoom(1)}
        >
          {Math.round(zoom * 100)}%
        </Button>
        <Button
          size="1"
          variant="ghost"
          aria-label="Zoom in"
          disabled={zoom >= 4}
          onClick={() => setZoom(clampPreviewZoom(zoom * 1.25))}
        >
          +
        </Button>
      </div>
      <div ref={container} className="developer-image-preview">
        <img
          src={url}
          alt={name}
          style={
            width
              ? {
                  width: width * zoom,
                  maxWidth: 'none',
                  maxHeight: 'none',
                  flexShrink: 0,
                }
              : undefined
          }
          onLoad={(event) => {
            const image = event.currentTarget;
            setWidth(
              Math.min(
                image.naturalWidth,
                Math.max(
                  1,
                  (container.current?.clientWidth || image.naturalWidth) - 32
                ),
                image.naturalWidth *
                  ((window.innerHeight * 0.6) / image.naturalHeight)
              )
            );
          }}
          onError={(event) => {
            event.currentTarget.hidden = true;
            onError();
          }}
        />
      </div>
    </div>
  );
}
