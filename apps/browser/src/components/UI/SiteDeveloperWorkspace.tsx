import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  ImperativePanelHandle,
} from 'react-resizable-panels';

/** Keep independent code/log scroll areas and remember each window layout. */
export function SiteDeveloperWorkspace({
  code,
  activity,
}: {
  code: ReactNode;
  activity: ReactNode;
}) {
  const [wide, setWide] = useState(
    () => window.matchMedia('(min-width: 720px)').matches
  );
  const codePanel = useRef<ImperativePanelHandle>(null);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 720px)');
    const update = () => setWide(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const direction = wide ? 'horizontal' : 'vertical';
  const defaultSize = wide ? 68 : 65;
  if (!activity)
    return (
      <div className="site-developer-workspace site-developer-workspace-code-only">
        <div className="site-developer-code-pane">{code}</div>
      </div>
    );
  return (
    <PanelGroup
      key={direction}
      direction={direction}
      autoSaveId={`kudiumbrowser-developer-workspace-${direction}`}
      className="site-developer-workspace"
    >
      <Panel
        id="code"
        order={1}
        ref={codePanel}
        defaultSize={defaultSize}
        minSize={wide ? 45 : 30}
        maxSize={80}
        className="site-developer-code-pane"
      >
        {code}
      </Panel>
      <PanelResizeHandle
        className="site-developer-divider"
        aria-label="Resize code and activity"
        title="Drag to resize. Double-click to reset."
        onDoubleClick={() => codePanel.current?.resize(defaultSize)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            codePanel.current?.resize(defaultSize);
          }
        }}
      >
        <span />
      </PanelResizeHandle>
      <Panel
        id="activity"
        order={2}
        defaultSize={100 - defaultSize}
        minSize={20}
        className="site-developer-activity-pane"
      >
        {activity}
      </Panel>
    </PanelGroup>
  );
}
