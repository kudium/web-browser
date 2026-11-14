import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  Panel,
  Group,
  Separator,
  PanelImperativeHandle,
  useDefaultLayout,
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
  const codePanel = useRef<PanelImperativeHandle>(null);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 720px)');
    const update = () => setWide(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const direction = wide ? 'horizontal' : 'vertical';
  const defaultSize = wide ? 68 : 65;
  const layout = useDefaultLayout({ id: `kudiumbrowser-developer-workspace-${direction}`, panelIds: ['code', 'activity'] });
  if (!activity)
    return (
      <div className="site-developer-workspace site-developer-workspace-code-only">
        <div className="site-developer-code-pane">{code}</div>
      </div>
    );
  return (
    <Group
      key={direction}
      orientation={direction}
      defaultLayout={layout.defaultLayout}
      onLayoutChanged={layout.onLayoutChanged}
      className="site-developer-workspace"
    >
      <Panel
        id="code"
        panelRef={codePanel}
        defaultSize={`${defaultSize}%`}
        minSize={`${wide ? 45 : 30}%`}
        maxSize="80%"
        className="site-developer-code-pane"
      >
        {code}
      </Panel>
      <Separator
        className="site-developer-divider"
        aria-label="Resize code and activity"
        title="Drag to resize. Double-click to reset."
        onDoubleClick={() => codePanel.current?.resize(`${defaultSize}%`)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            codePanel.current?.resize(`${defaultSize}%`);
          }
        }}
      >
        <span />
      </Separator>
      <Panel
        id="activity"
        defaultSize={`${100 - defaultSize}%`}
        minSize="20%"
        className="site-developer-activity-pane"
      >
        {activity}
      </Panel>
    </Group>
  );
}
