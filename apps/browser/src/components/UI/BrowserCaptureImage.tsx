import { ImgHTMLAttributes, useState } from 'react';

/** A missing capture must never replace the page status with a broken image. */
export function BrowserCaptureImage({
  src,
  alt = '',
  className,
  style,
  'data-presentation-id': presentationId = undefined,
}: Pick<
  ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'alt' | 'className' | 'style'
> & { 'data-presentation-id'?: string }) {
  const [failedSource, setFailedSource] = useState<string>();
  if (!src || src === failedSource) return null;
  return (
    <img
      alt={alt}
      className={className}
      style={style}
      data-presentation-id={presentationId}
      src={src}
      onError={() => setFailedSource(src)}
    />
  );
}

BrowserCaptureImage.defaultProps = { 'data-presentation-id': undefined };
