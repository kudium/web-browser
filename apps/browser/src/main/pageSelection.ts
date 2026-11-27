import { randomUUID } from 'node:crypto';
import { getGroupLocks } from './groupLocks';
import { passwordVault } from './passwordManager';
import type { ActiveNote } from './activeNote';
import { addTodo } from './todos';

/** Explicit selection actions share ordinary note/task storage and change events. */
export function savePageSelection(kind: 'note' | 'today' | 'append', text: string, scope?: string, plainText?: string, target?: ActiveNote) {
  if (typeof text !== 'string' || !text.trim() || text.length > 30000) throw new Error('Select text up to 30,000 characters.');
  if (scope && getGroupLocks().locked(scope.replace(/^group:/, ''))) throw new Error('Unlock this group first.');
  const selection = text.trim();
  const plain=(plainText || selection).trim();
  const long=plain.length>500;
  const title=long ? plain.replace(/\s+/g,' ').slice(0,157).replace(/\s+\S*$/,'')+'…' : plain;
  if(kind==='append') {
    if(!target) throw new Error('The current note is no longer available.');
    const vault=passwordVault();
    if(!vault.isOrdinaryNote(target.id)) throw new Error('The current note is unavailable.');
    const note=vault.edit(target.id,target.scope);
    if((target.kind==='todo') !== !!note.todo) throw new Error('The current note changed.');
    if(note.todo) return addTodo(title,false,target.scope,target.id,undefined,undefined,long ? undefined : plainText === undefined ? undefined : selection,undefined,long ? selection : undefined);
    vault.save({...note,notes:[note.notes,selection].filter(Boolean).join('\n\n')},target.scope);
    return {recordId:note.id};
  }
  if (kind === 'today') {
    if(long) return addTodo(title,true,scope,undefined,undefined,undefined,undefined,undefined,selection);
    return plainText === undefined ? addTodo(selection, true, scope) : addTodo(plain, true, scope, undefined, undefined, undefined, selection);
  }
  const id = randomUUID();
  passwordVault().save({id, kind:'note', title:(plainText || selection).split(/\r?\n/)[0].slice(0,120), notes:selection, scope, origin:'', username:'', password:'', fields:[], sensitive:false, allowAI:false, asRead:false}, scope);
  return {recordId:id};
}
