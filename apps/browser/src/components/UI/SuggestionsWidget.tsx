import { useEffect, useState, type ReactNode } from 'react';
import { NativeContextMenu as Menu } from './NativeContextMenu';

export function SuggestionsWidget({expanded,onHide,children}: {expanded:boolean;onHide:()=>void;children:ReactNode}) {
  const [present,setPresent]=useState(expanded);
  const [open,setOpen]=useState(expanded);
  useEffect(()=>{
    let frame: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if(expanded){
      setPresent(true);
      if(reduced)setOpen(true);
      else frame=requestAnimationFrame(()=>setOpen(true));
    }else{
      setOpen(false);
      timer=setTimeout(()=>setPresent(false),reduced ? 0 : 220);
    }
    return ()=>{if(frame !== undefined)cancelAnimationFrame(frame);if(timer !== undefined)clearTimeout(timer);};
  },[expanded]);
  return <Menu.Root menu={() => <Menu.Content><Menu.Item onSelect={onHide}>Hide Suggestions</Menu.Item></Menu.Content>}>
    <div className="suggestions-widget" data-expanded={expanded} data-open={open}>
      <div className="suggestions-reveal" inert={!expanded} aria-hidden={!expanded}>
        <div className="suggestions-body">{present && children}</div>
      </div>
    </div>
  </Menu.Root>;
}
