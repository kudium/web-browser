import { Button } from '@radix-ui/themes';
import { ChevronDown, X } from 'lucide-react';
import { ChromeIconButton } from './ChromeIconButton';
export function PageDevToolsToolbar({mode, menu, close}: {mode:'right'|'bottom'|'window';menu:()=>void;close:()=>void}) {
  return <div className="page-devtools-toolbar" data-dock={mode}>
    <span>Developer Tools</span>
    <Button variant="ghost" color="gray" size="1" onClick={menu} aria-haspopup="menu">Dock <ChevronDown size={12}/></Button>
    <ChromeIconButton icon={X} label="Close page Developer Tools" onClick={close}/>
  </div>;
}
