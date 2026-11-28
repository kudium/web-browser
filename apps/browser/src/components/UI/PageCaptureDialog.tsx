import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Dialog } from '@radix-ui/themes';
import { Copy, Download, Scan, X } from 'lucide-react';
import { browser } from '../../browser/client';
import type {
  CaptureRectangle,
  PageCaptureMode,
  PageCapturePreview,
} from '../../browser/pageCapture';

const titles: Record<PageCaptureMode, string> = {
  area: 'Capture area',
  visible: 'Capture visible page',
  full: 'Capture full page',
  pdf: 'Save page as PDF',
};
type Selection = { x: number; y: number; width: number; height: number };

/** Selection runs on an immutable preview, never on live website elements. */
export function PageCaptureDialog({
  tabId,
  mode,
  onClose,
}: {
  tabId: string;
  mode: PageCaptureMode;
  onClose: () => void;
}) {
  const [capture, setCapture] = useState<PageCapturePreview>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selection, setSelection] = useState<Selection>();
  const [copied, setCopied] = useState(false);
  const currentCapture = useRef<PageCapturePreview | undefined>(undefined);
  const close = useRef(onClose);
  close.current = onClose;
  const dragStart = useRef<{ x: number; y: number } | undefined>(undefined);
  const selectionFrame = useRef(0);
  const pendingSelection = useRef<{ x: number; y: number } | undefined>(undefined);
  const image = useRef<HTMLImageElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await browser.capture(
        mode === 'pdf'
          ? { action: 'pdf', tabId }
          : {
              action: 'capture',
              tabId,
              mode: mode === 'full' ? 'full' : 'visible',
            }
      );
      if (!mounted.current) {
        if (result.kind === 'preview')
          browser
            .capture({ action: 'release', captureId: result.captureId })
            .catch(() => {});
        return;
      }
      if (result.kind === 'preview') {
        currentCapture.current = result;
        setCapture(result);
      } else close.current();
    } catch (reason) {
      if (mounted.current)
        setError(
          (reason as Error).message.replace(
            /^Error invoking remote method '[^']+': (Error: )?/,
            ''
          )
        );
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [mode, tabId]);
  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
      cancelAnimationFrame(selectionFrame.current);
      selectionFrame.current = 0;
      pendingSelection.current = undefined;
      dragStart.current = undefined;
      const id = currentCapture.current?.captureId;
      if (id)
        browser.capture({ action: 'release', captureId: id }).catch(() => {});
    };
  }, [load]);
  const point = (clientX: number, clientY: number) => {
    const bounds = image.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (clientY - bounds.top) / bounds.height)),
    };
  };
  const flushSelection = () => {
    cancelAnimationFrame(selectionFrame.current);
    selectionFrame.current = 0;
    const pending = pendingSelection.current;
    const start = dragStart.current;
    pendingSelection.current = undefined;
    if (!pending || !start || !image.current || !mounted.current) return;
    const end = point(pending.x, pending.y);
    setSelection({
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    });
  };
  const moveSelection = (clientX: number, clientY: number) => {
    if (!dragStart.current) return;
    pendingSelection.current = { x: clientX, y: clientY };
    if (!selectionFrame.current)
      selectionFrame.current = requestAnimationFrame(flushSelection);
  };
  const rectangle: CaptureRectangle | undefined =
    capture && selection
      ? {
          x: Math.floor(selection.x * capture.width),
          y: Math.floor(selection.y * capture.height),
          width: Math.max(
            1,
            Math.min(
              capture.width - Math.floor(selection.x * capture.width),
              Math.round(selection.width * capture.width)
            )
          ),
          height: Math.max(
            1,
            Math.min(
              capture.height - Math.floor(selection.y * capture.height),
              Math.round(selection.height * capture.height)
            )
          ),
        }
      : undefined;
  const selected =
    mode !== 'area' ||
    (!!selection && selection.width > 0.005 && selection.height > 0.005);
  const output = async (action: 'save' | 'copy') => {
    if (!capture || !selected || saving) return;
    setSaving(true);
    setError('');
    try {
      const result = await browser.capture({
        action,
        captureId: capture.captureId,
        ...(mode === 'area' ? { rectangle } : {}),
      });
      if (!mounted.current) return;
      if (result.kind === 'saved') close.current();
      if (result.kind === 'copied') {
        setCopied(true);
      }
    } catch (reason) {
      if (mounted.current)
        setError(
          (reason as Error).message.replace(
            /^Error invoking remote method '[^']+': (Error: )?/,
            ''
          )
        );
    } finally {
      if (mounted.current) setSaving(false);
    }
  };
  const dismiss = () => {
    if (saving) return;
    if (loading) browser.capture({ action: 'cancel' }).catch(() => {});
    onClose();
  };
  let description = 'Copy or save this page as an image.';
  if (mode === 'area') description = 'Drag over the image to select an area.';
  if (mode === 'pdf')
    description = 'Create a PDF using this website’s print layout.';
  let dimensions = capture ? `${capture.width} × ${capture.height}` : '';
  if (rectangle) dimensions = `${rectangle.width} × ${rectangle.height}`;
  if (copied) dimensions = 'Copied to clipboard';
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !saving) dismiss();
      }}
    >
      <Dialog.Content
        className="page-capture-dialog"
        maxWidth="960px"
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <div className="page-capture-heading">
          <div>
            <Dialog.Title mb="1">{titles[mode]}</Dialog.Title>
            <Dialog.Description size="2">{description}</Dialog.Description>
          </div>
          <Button
            variant="ghost"
            aria-label="Close capture"
            disabled={saving}
            onClick={dismiss}
          >
            <X size={18} />
          </Button>
        </div>
        {loading && (
          <div className="page-capture-status" role="status">
            {mode === 'pdf' ? 'Preparing PDF…' : 'Capturing page…'}
          </div>
        )}
        {capture && (
          <div
            className={`page-capture-preview${
              mode === 'full' ? ' full-page' : ''
            }`}
          >
            {/* Pointer selection uses an image surface with equivalent keyboard controls. */}
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
            <div
              className={`page-capture-stage${
                mode === 'area' ? ' selecting' : ''
              }`}
              ref={stage}
              role={mode === 'area' ? 'application' : undefined}
              tabIndex={mode === 'area' ? 0 : undefined}
              aria-label={
                mode === 'area' ? 'Select screenshot area' : undefined
              }
              aria-describedby={
                mode === 'area' ? 'capture-keyboard-help' : undefined
              }
              onPointerDown={(event) => {
                if (
                  mode !== 'area' ||
                  saving ||
                  event.button !== 0 ||
                  !image.current
                )
                  return;
                event.preventDefault();
                event.currentTarget.focus();
                event.currentTarget.setPointerCapture(event.pointerId);
                dragStart.current = point(event.clientX, event.clientY);
                setSelection(undefined);
                setCopied(false);
              }}
              onPointerMove={(event) =>
                moveSelection(event.clientX, event.clientY)
              }
              onPointerUp={(event) => {
                moveSelection(event.clientX, event.clientY);
                flushSelection();
                dragStart.current = undefined;
              }}
              onPointerCancel={() => {
                cancelAnimationFrame(selectionFrame.current);
                selectionFrame.current = 0;
                pendingSelection.current = undefined;
                dragStart.current = undefined;
                setSelection(undefined);
              }}
              onKeyDown={(event) => {
                if (mode !== 'area' || saving) return;
                if (event.key === 'Enter') {
                  event.preventDefault();
                  setSelection({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
                  setCopied(false);
                  return;
                }
                if (
                  !selection ||
                  !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(
                    event.key
                  )
                )
                  return;
                event.preventDefault();
                setCopied(false);
                const moves: Record<string, { dx: number; dy: number }> = {
                  ArrowLeft: { dx: -0.01, dy: 0 },
                  ArrowRight: { dx: 0.01, dy: 0 },
                  ArrowUp: { dx: 0, dy: -0.01 },
                  ArrowDown: { dx: 0, dy: 0.01 },
                };
                const { dx, dy } = moves[event.key];
                setSelection(
                  event.shiftKey
                    ? {
                        ...selection,
                        width: Math.max(
                          0.01,
                          Math.min(1 - selection.x, selection.width + dx)
                        ),
                        height: Math.max(
                          0.01,
                          Math.min(1 - selection.y, selection.height + dy)
                        ),
                      }
                    : {
                        ...selection,
                        x: Math.max(
                          0,
                          Math.min(1 - selection.width, selection.x + dx)
                        ),
                        y: Math.max(
                          0,
                          Math.min(1 - selection.height, selection.y + dy)
                        ),
                      }
                );
              }}
            >
              <img
                ref={image}
                src={capture.preview}
                alt="Captured webpage"
                draggable={false}
                onLoad={() => {
                  if (mode === 'area') stage.current?.focus();
                }}
              />
              {mode === 'area' && selection && (
                <div
                  className="page-capture-selection"
                  style={{
                    left: `${selection.x * 100}%`,
                    top: `${selection.y * 100}%`,
                    width: `${selection.width * 100}%`,
                    height: `${selection.height * 100}%`,
                  }}
                />
              )}
            </div>
          </div>
        )}
        {error && (
          <div className="page-capture-error" role="alert">
            {error}
            {!capture && (
              <Button size="1" variant="soft" disabled={loading} onClick={load}>
                Try again
              </Button>
            )}
          </div>
        )}
        <footer className="page-capture-footer">
          <span role="status">{dimensions}</span>
          {mode === 'area' && capture && (
            <Button
              size="2"
              variant="ghost"
              disabled={saving}
              onClick={() => {
                setSelection({ x: 0, y: 0, width: 1, height: 1 });
                setCopied(false);
              }}
            >
              <Scan size={14} />
              Whole image
            </Button>
          )}
          <Button size="2" variant="soft" disabled={saving} onClick={dismiss}>
            Cancel
          </Button>
          {capture && (
            <>
              <Button
                size="2"
                variant="soft"
                disabled={!selected || saving}
                onClick={() => output('copy')}
              >
                <Copy size={14} />
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button
                size="2"
                disabled={!selected || saving}
                onClick={() => output('save')}
              >
                <Download size={14} />
                {saving ? 'Saving…' : 'Save image'}
              </Button>
            </>
          )}
        </footer>
        {mode === 'area' && (
          <span id="capture-keyboard-help" className="visually-hidden">
            Enter selects a central area. Arrow keys move it. Shift and arrow
            keys resize it.
          </span>
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}
