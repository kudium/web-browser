(() => {
  const root = document.querySelector('[data-account-data]');
  if (!root) return;
  const $ = selector => root.querySelector(selector);
  const status = $('[data-data-status]'), list = $('[data-data-list]'), detail = $('[data-data-detail]');
  const recovery = $('[data-data-recovery]'), search = $('[data-data-search]'), source = $('[data-data-source]');
  const refresh = $('[data-data-refresh]'), mobileNavigation = $('[data-workspace-navigation]');
  const categories = {
    personal: {title:'Personal details', subtitle:'Your saved profiles and payment details.', icon:'▤'},
    forms: {title:'Saved forms', subtitle:'Information captured from your forms.', icon:'▤'},
    documents: {title:'Documents', subtitle:'Your saved documents and their text.', icon:'▤'},
    passwords: {title:'Passwords', subtitle:'Your encrypted saved logins.', icon:'▤'},
    notes: {title:'Notes', subtitle:'Your ideas, always within reach.', icon:'≡'},
    workspace: {title:'Apps & tabs', subtitle:'Pick up where your browser left off.', icon:'▣'},
    hooks: {title:'Page hooks', subtitle:'The customizations that make your pages yours.', icon:'⌘'},
    storage: {title:'Storage', subtitle:'A clear view of your cloud storage.', icon:'▤'},
    devices: {title:'Devices & sessions', subtitle:'Manage where you’re signed in.', icon:'▱'}
  };
  let records = [], entries = [], category = 'notes', selected = null, busy = false, dirty = false, pending = null, loadError = null;
  const isDataView = () => ['notes','workspace','hooks','personal','forms','documents','passwords'].includes(category);
  const node = (tag, text, className) => { const element=document.createElement(tag); if(text!==undefined)element.textContent=text; if(className)element.className=className; return element; };
  const message = text => { status.textContent=text; };
  const deviceLabel = id => `Device · ${String(id || 'unknown').slice(-6)}`;
  const titleOf = entry => entry.category==='hooks' ? new URL(entry.item.origin).hostname : entry.item.title || entry.item.name || 'Untitled';
  const workspaceItems = record => { const items=new Map();(record.value.openTabs || []).forEach(item=>items.set(item.id,item));(record.value.workspace?.apps || []).forEach(item=>items.set(item.id,item));return [...items.values()]; };
  const dateLabel = value => { const date=new Date(value); return Number.isFinite(date.getTime()) && value ? date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}) : ''; };
  const excerpt = entry => entry.category==='notes' ? (entry.item.notes || 'Empty note').replace(/\s+/g,' ') : entry.category==='hooks' ? `${entry.item.config.hooks?.length || 0} named ${(entry.item.config.hooks?.length || 0)===1?'hook':'hooks'} · CSS & scripts` : entry.item.document?.name || entry.item.origin || entry.item.homeUrl || entry.item.url || '';
  async function request(path, options = {}) {
    const response=await fetch(`/api/account-data/${path}`,{credentials:'same-origin',redirect:'error',...options});
    const result=await response.json().catch(()=>({}));
    if(!response.ok){
      const error=new Error(response.status===409 ? 'This backup changed on another device. Keep your edits, then refresh to load the latest version.' : response.status===401 ? 'Your session expired. Sign in again.' : response.status===503 ? 'Cloud data is not available yet. Please try again later.' : 'Unable to load or save your data. Please try again.');
      if(result.error==='incorrect_recovery_key')error.message='That recovery key does not match your existing backups.';
      error.code=result.error;error.status=response.status;throw error;
    }
    return result;
  }
  function rebuildEntries() {
    entries=[];
    for(const record of records){
      if(record.category==='passwords' && records.some(other=>other.category==='personal' && other.value.deviceId===record.value.deviceId))continue;
      const items=['notes','personal','passwords'].includes(record.category) ? record.value.items : workspaceItems(record);
      items.forEach(item=>{const view=record.category==='personal' ? item.kind==='login'?'passwords':item.document?'documents':item.origin && item.fields?.length?'forms':'personal' : record.category;entries.push({key:JSON.stringify([record.id,view,item.id]),category:view,record,item});});
      if(record.category==='workspace') (record.value.workspace?.developer || []).forEach(item=>entries.push({key:JSON.stringify([record.id,'hooks',item.spaceId,item.sessionId,item.origin]),category:'hooks',record,item}));
    }
    for(const button of root.querySelectorAll('[data-data-category]')){
      button.setAttribute('aria-current',button.dataset.dataCategory===category?'page':'false');
      const count=button.querySelector('[data-data-count]');if(count)count.textContent=String(entries.filter(entry=>entry.category===button.dataset.dataCategory).length);
    }
    mobileNavigation.value=category;
    const icon=$('[data-workspace-icon]');icon.textContent=categories[category].icon;icon.className=`cloud-app-icon ${category==='notes'?'cloud-icon-notes':category==='workspace'?'cloud-icon-tabs':category==='hooks'?'cloud-icon-hooks':'cloud-icon-settings'}`;
    const previous=source.value;
    source.replaceChildren(new Option('All devices','all'));
    [...new Set(records.map(record=>record.value.deviceId))].forEach(id=>source.append(new Option(deviceLabel(id),id)));
    source.value=[...source.options].some(option=>option.value===previous)?previous:'all';
    source.closest('.cloud-source-filter').hidden=source.options.length<=2;
  }
  function filtered() {
    const query=search.value.trim().toLocaleLowerCase();
    return entries.filter(entry=>entry.category===category && (source.value==='all'||entry.record.value.deviceId===source.value) && (!query || `${titleOf(entry)} ${excerpt(entry)} ${entry.item.sessionName || ''} ${(entry.item.config?.hooks || []).map(hook=>`${hook.name || ''} ${hook.path || ''}`).join(' ')}`.toLocaleLowerCase().includes(query)));
  }
  function empty(container,title,text) {
    const box=node('div',undefined,'cloud-empty');box.append(node('span',categories[category].icon,'cloud-empty-icon'),node('h3',title),node('p',text));box.firstChild.setAttribute('aria-hidden','true');container.append(box);
  }
  function renderList() {
    if(!isDataView())return;
    list.replaceChildren();list.setAttribute('aria-busy','false');
    const visible=filtered();
    if(!visible.length){
      if(loadError){empty(list,'Unable to load your data',loadError.status===401?'Sign in again to access your workspace.':loadError.code==='recovery_key_required'?'Connect your existing backups above to get started.':loadError.status===503?'Please try again in a moment.':'Check your connection and try again.');
        if(loadError.status===401){const signin=node('a','Sign in','account-button');signin.href='/sign-in';list.lastChild.append(signin);}
        else if(loadError.code!=='recovery_key_required'){const retry=node('button','Try again','account-button');retry.type='button';retry.addEventListener('click',()=>navigate(load));list.lastChild.append(retry);}
      }else if(search.value.trim()||source.value!=='all'){
        empty(list,'No matches','Try a different search or device.');const clear=node('button','Clear filters','account-button');clear.type='button';clear.addEventListener('click',()=>{search.value='';source.value='all';renderList();});list.lastChild.append(clear);
      }else{empty(list,'Nothing here yet',['personal','forms','documents','passwords'].includes(category)?'In Kudium Browser, open Preferences → Sync, enable Personal details, forms & documents, then choose Unlock & sync personal data.':'Connect Kudium Browser and enable sync to save your data here.');const guide=node('a','Set up sync ↗','account-button');guide.href='/docs#sync';list.lastChild.append(guide);}
      return;
    }
    const count=node('div',`${visible.length} ${category==='notes'?(visible.length===1?'note':'notes'):category==='hooks'?(visible.length===1?'customization':'customizations'):category==='workspace'?'apps & tabs':visible.length===1?category==='personal'?'personal record':category==='forms'?'saved form':category==='documents'?'document':'password':categories[category].title.toLowerCase()}`,'cloud-list-count');list.append(count);
    visible.forEach(entry=>{
      const button=node('button',undefined,'cloud-item');button.type='button';button.setAttribute('aria-pressed',String(selected===entry.key));
      const heading=node('strong',titleOf(entry));const preview=node('span',excerpt(entry),'cloud-item-excerpt');
      const meta=node('span',deviceLabel(entry.record.value.deviceId),'cloud-item-meta');meta.title=String(entry.record.value.deviceId || '');
      if(entry.category==='passwords' || ['personal','forms','documents'].includes(entry.category) || entry.item.sensitive)meta.append(node('span','Protected','cloud-protected'));
      button.append(heading,preview,meta);button.addEventListener('click',()=>navigate(()=>{selected=entry.key;renderList();renderDetail();root.classList.add('cloud-detail-open');if(matchMedia('(max-width: 900px)').matches)detail.focus();}));list.append(button);
    });
  }
  function navigate(action) {
    if(busy)return;
    if(!dirty){action();return;}
    pending=action;
    const guard=detail.querySelector('.cloud-unsaved');
    if(guard){guard.hidden=false;guard.querySelector('button').focus();}
  }
  function field(form,label,value,multiline=false) {
    const wrapper=node('label',undefined,'account-data-field');wrapper.append(node('span',label));
    const input=node(multiline?'textarea':'input');input.value=value||'';if(multiline)input.rows=10;else input.type='text';wrapper.append(input);form.append(wrapper);return input;
  }
  function renderDetail() {
    if(!isDataView())return;
    detail.replaceChildren();dirty=false;pending=null;
    const entry=entries.find(item=>item.key===selected);
    if(!entry && loadError){empty(detail,'Your data is unavailable','Use the action in the list to reconnect.');return;}
    if(!entry){empty(detail,`A little space for your ${category==='notes'?'ideas':'workspace'}`,`Select ${category==='notes'?'a note':category==='hooks'?'a customization':category==='workspace'?'an app or tab':'a saved record'} to preview it here.`);return;}
    const {record,item}=entry;
    const toolbar=node('div',undefined,'cloud-detail-toolbar');
    const back=node('button','‹ Back','account-button cloud-back');back.type='button';back.addEventListener('click',()=>navigate(()=>root.classList.remove('cloud-detail-open')));
    toolbar.append(back,node('span',category==='notes'?'NOTE':category==='hooks'?'PAGE CUSTOMIZATION':category==='workspace'?'APP / TAB':categories[category].title.toUpperCase(),'cloud-detail-kind'));
    detail.append(toolbar,node('h3',titleOf(entry),'cloud-detail-title'));
    const metadata=node('p',`${deviceLabel(record.value.deviceId)}${dateLabel(record.value.createdAt)?` · Backed up ${dateLabel(record.value.createdAt)}`:''}`,'cloud-detail-meta');detail.append(metadata);
    if(category==='hooks'){
      detail.append(node('p','Preview only. Restored hooks stay disabled until you review them in Developer.','cloud-hook-notice'));
      const scopes=node('p',item.origin,'cloud-detail-meta');detail.append(scopes);
      function codeSection(label,config){
        const section=node('section',undefined,'cloud-hook-section');section.append(node('h4',label));
        for(const [key,title] of [['before','Before page load'],['after','After page load'],['css','Custom CSS']]){
          if(!config[key])continue;const block=node('details',undefined,'cloud-code');block.append(node('summary',title),node('pre',config[key]));section.append(block);
        }
        if(section.children.length>1)detail.append(section);
      }
      codeSection('Page defaults',item.config);
      (item.config.hooks||[]).forEach(hook=>codeSection(hook.name || 'Unnamed hook',hook));return;
    }
    if (['personal','forms','documents','passwords'].includes(category)) {
      const preview=node('div',undefined,'cloud-preview');
      preview.append(node('p',item.origin || 'Saved information','cloud-detail-meta'));
      if(item.scope)preview.append(node('p',`Group · ${item.scope}`,'cloud-detail-meta'));
      const addValue=(label,value,secret)=>{
        if(!value)return;
        const row=node('div',undefined,'account-data-field');row.append(node('strong',label));
        const text=node('p',secret?'••••••••':value,'cloud-note-content');row.append(text);
        if(secret){const reveal=node('button','Reveal','account-button');reveal.type='button';let shown=false;reveal.addEventListener('click',()=>{shown=!shown;text.textContent=shown?value:'••••••••';reveal.textContent=shown?'Hide':'Reveal';});row.append(reveal);}
        preview.append(row);
      };
      addValue('Username',item.username,false);addValue('Password',item.password,true);
      (item.fields || []).forEach(field=>addValue(field.name,field.value,field.secret || item.kind==='payment'));
      addValue('Notes',item.notes,item.sensitive || ['login','payment'].includes(item.kind));
      if(item.document){
        addValue(item.document.name,item.document.text,item.sensitive);
        const download=node('button','Download document','account-button');download.type='button';
        download.addEventListener('click',()=>{
          const bytes=Uint8Array.from(atob(item.document.content),char=>char.charCodeAt(0));
          const url=URL.createObjectURL(new Blob([bytes],{type:item.document.mime}));
          const link=node('a');link.href=url;link.download=item.document.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
        });preview.append(download);
      }
      preview.append(node('p','Manage this saved information in Kudium Browser. Enable Personal details, forms & documents in Sync settings and unlock Personal Data to update this backup.','cloud-detail-meta'));
      detail.append(preview);return;
    }
    const preview=node('div',undefined,'cloud-preview');
    if(category==='notes')preview.append(node('p',item.notes || 'This note is empty.','cloud-note-content'));
    else {
      const url=item.homeUrl || item.url;
      const link=node('a',url,'cloud-website-link');link.href=url;link.target='_blank';link.rel='noopener noreferrer';preview.append(link);
      if(item.sessionName)preview.append(node('p',`Group · ${item.sessionName}`,'cloud-detail-meta'));
      const space=record.value.workspace?.spaces.find(space=>space.id===item.spaceId);if(space)preview.append(node('p',`Space · ${space.name}`,'cloud-detail-meta'));
      const open=node('a','Open website ↗','account-button');open.href=url;open.target='_blank';open.rel='noopener noreferrer';preview.append(open);
    }
    const form=node('form',undefined,'account-data-editor');form.hidden=true;
    const title=field(form,'Title',item.title || item.name),content=field(form,category==='notes'?'Note':'Website address',category==='notes'?item.notes:item.homeUrl || item.url,category==='notes');
    title.maxLength=category==='notes'?120:256;content.maxLength=category==='notes'?100000:8192;
    if(category==='workspace'){
      content.type='url';content.required=true;content.inputMode='url';content.autocomplete='url';
      const validateAddress=()=>{let valid=false;try{const url=new URL(content.value);valid=['http:','https:'].includes(url.protocol)&&!url.username&&!url.password;}catch{}content.setCustomValidity(valid?'':'Enter an http:// or https:// address without a username or password.');};
      content.addEventListener('input',validateAddress);validateAddress();
    }
    const actions=node('div',undefined,'account-data-actions');
    const save=node('button','Save changes','account-button cloud-primary');save.type='submit';save.disabled=true;
    const cancel=node('button','Cancel','account-button');cancel.type='button';
    const edit=node('button',category==='notes'?'Edit note':'Edit details','account-button');edit.type='button';
    const remove=node('button','Delete…','cloud-delete');remove.type='button';
    const feedback=node('p',undefined,'cloud-editor-feedback');feedback.setAttribute('role','status');
    const guard=node('div',undefined,'cloud-unsaved');guard.hidden=true;
    guard.append(node('p','You have unsaved changes. Save them before leaving, or discard them.'));
    const discard=node('button','Discard changes','account-button');discard.type='button';
    const stay=node('button','Keep editing','account-button');stay.type='button';guard.append(discard,stay);
    discard.addEventListener('click',()=>{dirty=false;const next=pending;pending=null;guard.hidden=true;if(next)next();});
    stay.addEventListener('click',()=>{pending=null;guard.hidden=true;content.focus();});
    form.addEventListener('input',()=>{dirty=title.value!==(item.title||item.name||'') || content.value!==(category==='notes'?(item.notes||''):(item.homeUrl||item.url||''));save.disabled=!dirty;});
    edit.addEventListener('click',()=>{form.hidden=false;preview.hidden=true;tools.hidden=true;title.focus();});
    cancel.addEventListener('click',()=>navigate(renderDetail));
    const deletion=node('div',undefined,'cloud-delete-confirm');deletion.hidden=true;
    deletion.append(node('strong','Delete from this backup?'),node('p','Other device backups and local copies are kept. This cannot be undone here.'));
    const confirm=node('button','Delete from backup','account-button cloud-danger');confirm.type='button';
    const keep=node('button','Keep item','account-button');keep.type='button';deletion.append(confirm,keep);
    remove.addEventListener('click',()=>{deletion.hidden=false;confirm.focus();});keep.addEventListener('click',()=>{deletion.hidden=true;remove.focus();});
    async function update(deleting) {
      if(busy)return;busy=true;[save,cancel,edit,remove,confirm,keep,title,content].forEach(control=>control.disabled=true);feedback.textContent=deleting?'Deleting…':'Saving…';
      try{
        const result=await request(`records/${encodeURIComponent(record.id)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:record.revision,itemId:item.id,...(deleting?{remove:true}:{title:title.value,...(category==='notes'?{notes:content.value}:{url:content.value})})})});
        // Keep the saved state even if the follow-up refresh fails.
        record.revision=result.revision || record.revision;
        if(deleting){if(record.category==='notes')record.value.items=record.value.items.filter(saved=>saved.id!==item.id);else{if(record.value.workspace)record.value.workspace.apps=record.value.workspace.apps.filter(saved=>saved.id!==item.id);if(record.value.openTabs)record.value.openTabs=record.value.openTabs.filter(saved=>saved.id!==item.id);}selected=null;root.classList.remove('cloud-detail-open');}
        else{if('name' in item)item.name=title.value;else item.title=title.value;if(category==='notes')item.notes=content.value;else if('homeUrl' in item)item.homeUrl=content.value;else item.url=content.value;}
        dirty=false;const next=pending;pending=null;rebuildEntries();renderList();renderDetail();message(deleting?'Deleted from this cloud backup.':'Saved to this cloud backup.');busy=false;if(next)next();
      }catch(error){feedback.textContent=error.message;}finally{busy=false;[cancel,edit,remove,confirm,keep,title,content].forEach(control=>control.disabled=false);save.disabled=!dirty;}
    }
    form.addEventListener('submit',event=>{event.preventDefault();if(form.reportValidity())update(false);});confirm.addEventListener('click',()=>update(true));
    actions.append(save,cancel);form.append(actions,guard);const tools=node('div',undefined,'cloud-preview-actions');tools.append(edit,remove);
    detail.append(preview,form,tools,deletion,feedback);
  }
  async function load() {
    if(busy)return;
    busy=true;refresh.disabled=true;detail.inert=true;message('Refreshing your workspace…');list.setAttribute('aria-busy','true');
    try{const result=await request('records');records=result.records;loadError=null;recovery.hidden=true;rebuildEntries();if(!entries.some(entry=>entry.key===selected))selected=filtered()[0]?.key || null;if(!selected)root.classList.remove('cloud-detail-open');renderList();renderDetail();message('');}
    catch(error){loadError=error;message(error.message);if(error.code==='recovery_key_required'){recovery.hidden=false;message('Your existing backups need a one-time connection.');}if(!entries.length){root.classList.remove('cloud-detail-open');renderList();renderDetail();}}
    finally{busy=false;refresh.disabled=false;detail.inert=false;list.setAttribute('aria-busy','false');}
  }
  function switchCategory(next){
    navigate(()=>{
      category=next;selected=null;search.value='';root.classList.remove('cloud-detail-open');
      root.classList.toggle('cloud-settings-open',!isDataView());refresh.hidden=!isDataView();
      for(const panel of root.querySelectorAll('[data-workspace-panel]'))panel.hidden=panel.dataset.workspacePanel!==category;
      $('[data-data-heading]').textContent=categories[category].title;$('[data-data-subtitle]').textContent=categories[category].subtitle;
      $('.cloud-workspace-footnote').textContent=['personal','forms','documents','passwords'].includes(category)?'These are cloud backups. Manage saved information in Kudium Browser and sync again to update it here.':'Changes here update a device’s cloud backup. Restore in Kudium Browser → Preferences → Sync to use them on your desktop.';
      search.placeholder=`Search ${categories[category].title.toLowerCase()}`;search.setAttribute('aria-label',search.placeholder);
      rebuildEntries();renderList();renderDetail();message(isDataView()&&loadError?loadError.message:'');
    });
  }
  for(const button of root.querySelectorAll('[data-data-category]'))button.addEventListener('click',()=>switchCategory(button.dataset.dataCategory));
  mobileNavigation.addEventListener('change',()=>{const next=mobileNavigation.value;mobileNavigation.value=category;switchCategory(next);});
  list.addEventListener('keydown',event=>{
    const buttons=[...list.querySelectorAll('.cloud-item')],index=buttons.indexOf(document.activeElement);
    if(index<0||!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,index+(event.key==='ArrowDown'?1:-1)));
    buttons[next].focus();
  });
  // Filtering keeps the current editor and unsaved text intact.
  search.addEventListener('input',renderList);source.addEventListener('change',renderList);
  refresh.addEventListener('click',()=>navigate(load));
  recovery.addEventListener('submit',async event=>{
    event.preventDefault();const input=recovery.querySelector('input'),button=recovery.querySelector('button');button.disabled=true;
    try{await request('enroll',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recoveryKey:input.value.trim()})});input.value='';await load();}catch(error){message(error.message);}finally{button.disabled=false;}
  });
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  window.addEventListener('pagehide',()=>{records=[];entries=[];list.replaceChildren();detail.replaceChildren();recovery.querySelector('input').value='';});
  window.addEventListener('pageshow',event=>{if(event.persisted)load();});
  load();
})();
