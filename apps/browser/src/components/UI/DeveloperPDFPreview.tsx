/* global globalThis */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@radix-ui/themes';
import {
  usePreviewZoom,
  clampPreviewZoom,
} from '../../utils/hooks/usePreviewZoom';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export function DeveloperPDFPreview({ url }: { url: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState('');
  const container = usePreviewZoom(zoom, setZoom);
  useEffect(() => {
    let active = true;
    let task: { destroy: () => Promise<void> } | undefined;
    setError('');
    setDocument(undefined);
    setPage(1);
    setZoom(1);
    const load = async () => {
      try {
        const pdf = await import(
          /* webpackMode: "eager" */ 'pdfjs-dist/legacy/build/pdf.mjs'
        );
        const worker = await import(
          /* webpackMode: "eager" */ 'pdfjs-dist/legacy/build/pdf.worker.mjs'
        );
        if (!active) return;
        (
          globalThis as typeof globalThis & { pdfjsWorker?: unknown }
        ).pdfjsWorker = worker;
        const data = Uint8Array.from(
          atob(url.slice(url.indexOf(',') + 1)),
          (char) => char.charCodeAt(0)
        );
        const loading = pdf.getDocument({
          data,
          useSystemFonts: true,
        });
        task = loading;
        const result = await loading.promise;
        if (active) setDocument(result);
      } catch {
        if (active)
          setError(
            'Could not preview this PDF. It may be damaged or password protected.'
          );
      }
    };
    load();
    return () => {
      active = false;
      task?.destroy().catch(() => {});
    };
  }, [url]);
  useEffect(() => {
    if (!document) return undefined;
    let active = true;
    let render: { cancel: () => void } | undefined;
    const draw = async () => {
      try {
        const pdfPage = await document.getPage(page);
        if (!active || !canvas.current) return;
        const viewport = pdfPage.getViewport({ scale: zoom });
        const target = canvas.current;
        const ratio = Math.min(
          window.devicePixelRatio || 1,
          Math.sqrt(8000000 / (viewport.width * viewport.height))
        );
        target.width = Math.ceil(viewport.width * ratio);
        target.height = Math.ceil(viewport.height * ratio);
        target.style.width = `${viewport.width}px`;
        target.style.height = `${viewport.height}px`;
        const context = target.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        const rendering = pdfPage.render({
          canvas: target,
          canvasContext: context,
          viewport,
          transform: [ratio, 0, 0, ratio, 0, 0],
        });
        render = rendering;
        await rendering.promise;
      } catch {
        if (active) setError('Could not display this PDF page.');
      }
    };
    draw();
    return () => {
      active = false;
      render?.cancel();
    };
  }, [document, page, zoom]);
  return (
    <div className="developer-format-preview">
      <div className="developer-preview-controls">
        <Button
          size="1"
          variant="ghost"
          disabled={!document || page <= 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </Button>
        <span>
          {document ? `${page} / ${document.numPages}` : 'Loading PDF…'}
        </span>
        <Button
          size="1"
          variant="ghost"
          disabled={!document || page >= document.numPages}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
        <Button
          size="1"
          variant="ghost"
          aria-label="Zoom out"
          disabled={zoom <= 0.25}
          onClick={() => setZoom(clampPreviewZoom(zoom - 0.25))}
        >
          −
        </Button>
        <span>{Math.round(zoom * 100)}%</span>
        <Button
          size="1"
          variant="ghost"
          aria-label="Zoom in"
          disabled={zoom >= 4}
          onClick={() => setZoom(clampPreviewZoom(zoom + 0.25))}
        >
          +
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
      <div ref={container} className="developer-pdf-page">
        <canvas ref={canvas} aria-label={`PDF page ${page}`} />
      </div>
    </div>
  );
}
