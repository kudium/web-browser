import { getGroupLocks } from './groupLocks';
import type { WebContents } from 'electron';
export type ActiveNote = {id:string;scope?:string;kind:'note'|'todo'};
const active = new WeakMap<WebContents,ActiveNote>();
export const activeNoteFor = (contents:WebContents) => {const note=active.get(contents);return note?.scope && getGroupLocks().locked(note.scope.replace(/^group:/,'')) ? undefined : note;};
export function setActiveNote(contents:WebContents,value:unknown) {
  const note=value as ActiveNote;
  if (value === undefined || value === null) {active.delete(contents);return;}
  if (!note || typeof note.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(note.id) || !['note','todo'].includes(note.kind) || (note.scope !== undefined && (typeof note.scope !== 'string' || !note.scope || note.scope.length>200))) return;
  active.set(contents,{id:note.id,kind:note.kind,scope:note.scope});
}
export const sameActiveNote = (a:ActiveNote|undefined,b:ActiveNote|undefined) => !!a && !!b && a.id===b.id && a.scope===b.scope && a.kind===b.kind;
