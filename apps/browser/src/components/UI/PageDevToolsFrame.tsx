import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { PageDevToolsToolbar } from './PageDevToolsToolbar';
import { SidebarResizeHandle } from './SidebarResizeHandle';
export function PageDevToolsFrame({mode,fraction,style,menu,close,resize}: {mode:'right'|'bottom';fraction:number;style:CSSProperties;menu:()=>void;close:()=>void;resize:(fraction:number)=>void}) {
  const ref=useRef<HTMLDivElement>(null);
  const [dimension,setDimension]=useState(0);
  useLayoutEffect(()=>{const node=ref.current;if(!node)return undefined;const measure=()=>{const bounds=node.getBoundingClientRect();setDimension(mode==='right'?bounds.width:bounds.height);};const observer=new ResizeObserver(measure);observer.observe(node);measure();return()=>observer.disconnect();},[mode]);
  return <div ref={ref} className="page-devtools-frame" data-dock={mode} style={{...style,'--devtools-size':`${Math.round(dimension*fraction)}px`} as CSSProperties}>
    <PageDevToolsToolbar mode={mode} menu={menu} close={close}/>
    {dimension>0 && <SidebarResizeHandle width={dimension*fraction} side="right" axis={mode==='bottom'?'vertical':'horizontal'} label="Resize Developer Tools" className="page-devtools-resize" minWidth={dimension*.2} maxWidth={dimension*.75} resetWidth={dimension*.4} onChange={pixels=>resize(Math.max(.2,Math.min(.75,pixels/dimension)))} onResizingChange={active=>{if(ref.current)ref.current.dataset.resizing=String(active);}}/>}
  </div>;
}
