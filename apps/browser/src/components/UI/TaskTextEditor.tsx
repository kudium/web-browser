import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { renderAIMessage } from './AIMessage';
const MarkdownNoteEditor = lazy(() => import('./MarkdownNoteEditor').then(module => ({default:module.MarkdownNoteEditor})));
/** Render stored Markdown cheaply; mount the shared rich editor only for the edited task. */
export function TaskTextEditor({title,markdown,disabled,onSave}: {title:string;markdown:string;disabled:boolean;onSave:(title:string,markdown:string)=>void}) {
  const [editing,setEditing]=useState(false);
  const [error,setError]=useState('');
  const value=useRef(markdown);
  const html=useMemo(()=>renderAIMessage(markdown),[markdown]);
  const finish=()=>{
    if(value.current!==markdown){
      const document=new DOMParser().parseFromString(renderAIMessage(value.current),'text/html');
      document.body.querySelectorAll('p,li,blockquote').forEach(node=>node.append('\n'));
      const plain=(document.body.textContent || '').trim();
      if(!plain || plain.length>500 || value.current.length>30000){setError('Keep task text between 1 and 500 characters.');return;}
      onSave(plain,value.current);
    }
    setEditing(false);
  };
  return <div className="todo-rich-text" onBlur={event=>{if(editing && !event.currentTarget.contains(event.relatedTarget as Node | null))finish();}}>
    {editing ? <Suspense fallback={<span>{title}</span>}><MarkdownNoteEditor autoFocus markdown={markdown} label={`Task title: ${title}`} onChange={text=>{value.current=text;}} onSelectionChange={()=>{}} onFocusTitle={finish} /></Suspense> :
      <div className="todo-title todo-markdown-preview ai-markdown" role="button" tabIndex={disabled ? -1 : 0} aria-label={`Edit task: ${title}`} onClick={event=>{if(!disabled && !(event.target as HTMLElement).closest('a')){value.current=markdown;setEditing(true);}}} onKeyDown={event=>{if(!disabled && (event.key==='Enter'||event.key===' ')){event.preventDefault();value.current=markdown;setEditing(true);}}} dangerouslySetInnerHTML={{__html:html}} />}
    {error && <small role="alert">{error}</small>}
  </div>;
}
