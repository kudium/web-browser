import { PanelBottom, PanelRight } from 'lucide-react';
import { usePanelDock } from '../../utils/hooks/usePanelDock';
/** A native select does not suspend the page or stretch its snapshot. */
export function PanelDockButton() {
  const { position, change } = usePanelDock();
  const Icon = position === 'bottom' ? PanelBottom : PanelRight;
  return (
    <span className="panel-dock-button">
      <Icon size={15} aria-hidden="true" />
      <select
        aria-label="Panel dock position"
        value={position}
        onChange={(event) => change(event.target.value as 'right' | 'bottom')}
      >
        <option value="right">Dock panels right</option>
        <option value="bottom">Dock panels bottom</option>
      </select>
    </span>
  );
}
