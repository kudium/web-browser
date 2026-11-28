import { frameResizeObserver } from '../../utils/frameResizeObserver';
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { PageDevToolsToolbar } from './PageDevToolsToolbar';
import { SidebarResizeHandle } from './SidebarResizeHandle';
export function PageDevToolsFrame({
  mode,
  fraction,
  style,
  menu,
  close,
  resize,
}: {
  mode: 'right' | 'bottom';
  fraction: number;
  style: CSSProperties;
  menu: () => void;
  close: () => void;
  resize: (fraction: number, live?: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dimension, setDimension] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const measure = () => {
      const bounds = node.getBoundingClientRect();
      setDimension(mode === 'right' ? bounds.width : bounds.height);
    };
    const observer = frameResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, [mode]);
  return (
    <div
      ref={ref}
      className="page-devtools-frame"
      data-dock={mode}
      style={
        {
          ...style,
          '--devtools-size': `${Math.round(dimension * fraction)}px`,
        } as CSSProperties
      }
    >
      <PageDevToolsToolbar mode={mode} menu={menu} close={close} />
      {dimension > 0 && (
        <SidebarResizeHandle
          width={dimension * fraction}
          side="right"
          axis={mode === 'bottom' ? 'vertical' : 'horizontal'}
          label="Resize Developer Tools"
          className="page-devtools-resize"
          minWidth={dimension * 0.2}
          maxWidth={dimension * 0.75}
          resetWidth={dimension * 0.4}
          liveResize={{ target: ref, property: '--devtools-size' }}
          onLiveChange={(pixels) =>
            resize(Math.max(0.2, Math.min(0.75, pixels / dimension)), true)
          }
          onChange={(pixels) =>
            resize(Math.max(0.2, Math.min(0.75, pixels / dimension)), false)
          }
          onResizingChange={(active) => {
            if (ref.current) ref.current.dataset.resizing = String(active);
          }}
        />
      )}
    </div>
  );
}
