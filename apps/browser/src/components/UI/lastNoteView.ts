/** Remember only a view identifier; note content stays in main-process storage. */
const key=(scope:string)=>`kudiumbrowser-notes-last-view:${scope}`;
export function lastNoteView(scope:string):string {
  try {const value=localStorage.getItem(key(scope));return value && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : 'today';}catch{return 'today';}
}
export function rememberNoteView(scope:string,id:string){
  try{localStorage.setItem(key(scope),id);}catch{/* Unavailable layout storage does not interrupt editing. */}
}
