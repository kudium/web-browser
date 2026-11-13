import type { BrowserDialogOptions } from './dialogs';

/** One searchable popover per dialog; shared saved values are serialized once. */
export function savedPickerScript(
  inputs: NonNullable<BrowserDialogOptions['inputs']>,
  inline = false
) {
  const catalog: { id: string; label: string; value: string }[] = [];
  const indexes = new Map<string, number>();
  const orders = inputs.map((input) =>
    (input.saved || []).map((choice) => {
      const key = JSON.stringify(choice);
      if (!indexes.has(key)) {
        indexes.set(key, catalog.length);
        catalog.push(choice);
      }
      return indexes.get(key)!;
    })
  );
  const json = (value: unknown) =>
    JSON.stringify(value).replace(/</g, '\\u003c');
  return `
    const savedInline=${inline};
    const savedCatalog=${json(catalog)};
    const savedOrders=${json(orders)};
    const savedMessages=${json(
      inputs.map((input) => input.savedHint || 'No saved values')
    )};
    const savedPanel=document.createElement('div');
    savedPanel.className='saved-panel'+(savedInline?' saved-inline':'');savedPanel.hidden=!savedInline;
    savedPanel.setAttribute('role',savedInline?'group':'dialog');savedPanel.setAttribute('aria-label','Personal Data');
    savedPanel.innerHTML='<input id="saved-search" class="saved-search" type="search" placeholder="Search Personal Data" aria-label="Search Personal Data" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="saved-results"><div class="saved-results" id="saved-results" role="listbox" aria-label="Saved values"></div><div class="saved-empty" role="status"></div>';
    (savedInline?document.querySelector('.content'):document.body).append(savedPanel);
    const savedSearch=savedPanel.querySelector('.saved-search');
    const savedResults=savedPanel.querySelector('.saved-results');
    const savedEmpty=savedPanel.querySelector('.saved-empty');
    let savedTrigger, savedIndex=0, savedMatches=[], savedActive=0, savedLimit=40;
    const closeSaved=(restore=false)=>{
      if(savedInline||savedPanel.hidden)return;
      savedPanel.hidden=true;savedTrigger?.setAttribute('aria-expanded','false');
      if(restore)savedTrigger?.focus();
    };
    const chooseSaved=index=>{
      const choice=savedCatalog[index];if(!choice)return;
      if(savedInline){window.finish(Number(choice.id)+1);return;}
      const input=document.getElementById(savedTrigger.dataset.savedFor);
      input.value=choice.value;input.dataset.source=choice.id;
      savedTrigger.dataset.selected=choice.id;
      input.dispatchEvent(new Event('input'));closeSaved();input.focus();
    };
    const renderSaved=()=>{
      const scroll=savedResults.scrollTop;savedResults.replaceChildren();
      const groups=new Map();
      savedMatches.slice(0,savedLimit).forEach((index,position)=>{
        const choice=savedCatalog[index];const row=document.createElement('button');
        row.type='button';row.className='saved-option';row.id='saved-option-'+position;
        row.dataset.savedOption=choice.id;row.setAttribute('role','option');row.tabIndex=-1;
        row.setAttribute('aria-selected',String(position===savedActive));
        const split=choice.label.lastIndexOf(' · ');
        const name=document.createElement('span');name.className='saved-option-name';
        name.textContent=split<0?choice.label:choice.label.slice(split+3);
        const groupName=split<0?'':choice.label.slice(0,split);
        if(!groups.has(groupName)){
          const group=document.createElement('div');group.className='saved-option-group';
          if(groupName){
            group.setAttribute('role','group');
            const heading=document.createElement('div');heading.className='saved-group-title';
            heading.id='saved-group-'+groups.size;heading.textContent=groupName;
            group.setAttribute('aria-labelledby',heading.id);group.append(heading);
          }
          groups.set(groupName,group);savedResults.append(group);
        }
        row.append(name);row.addEventListener('click',()=>chooseSaved(index));groups.get(groupName).append(row);
      });
      savedResults.scrollTop=scroll;
      savedEmpty.textContent=savedMatches.length?'':(savedSearch.value?'No results':savedMessages[savedIndex]);
      savedEmpty.hidden=!!savedMatches.length;
      if(savedMatches.length)savedSearch.setAttribute('aria-activedescendant','saved-option-'+savedActive);
      else savedSearch.removeAttribute('aria-activedescendant');
    };
    const filterSaved=()=>{
      const terms=savedSearch.value.trim().toLocaleLowerCase().split(/\\s+/).filter(Boolean);
      const groups=new Map();
      savedOrders[savedIndex].filter(index=>terms.every(term=>savedCatalog[index].label.toLocaleLowerCase().includes(term))).forEach(index=>{
        const label=savedCatalog[index].label;const split=label.lastIndexOf(' · ');
        const group=split<0?'':label.slice(0,split);
        if(!groups.has(group))groups.set(group,[]);groups.get(group).push(index);
      });
      savedMatches=[...groups.values()].flat();
      savedActive=0;savedLimit=40;savedResults.scrollTop=0;renderSaved();
    };
    const placeSaved=()=>{
      const rect=savedTrigger.closest('.saved-input').getBoundingClientRect();
      const width=Math.min(Math.max(rect.width,260),400,innerWidth-24);
      savedPanel.style.width=width+'px';
      savedPanel.style.left=Math.max(12,Math.min(rect.right-width,innerWidth-width-12))+'px';
      const height=savedPanel.getBoundingClientRect().height;
      savedPanel.style.top=Math.max(12,Math.min(rect.bottom+6,innerHeight-height-12))+'px';
    };
    document.querySelectorAll('[data-saved-for]').forEach(trigger=>{
      trigger.addEventListener('click',()=>{
        if(savedTrigger===trigger&&!savedPanel.hidden){closeSaved(true);return;}
        closeSaved();savedTrigger=trigger;savedIndex=Number(trigger.dataset.savedFor.replace('input-',''));
        savedSearch.value='';savedPanel.hidden=false;trigger.setAttribute('aria-expanded','true');
        filterSaved();placeSaved();savedSearch.focus();
      });
      trigger.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();trigger.click();}});
    });
    savedSearch.addEventListener('input',filterSaved);
    savedPanel.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(savedInline)window.finish(0);else closeSaved(true);}
      if(['ArrowDown','ArrowUp'].includes(event.key)){
        event.preventDefault();if(!savedMatches.length)return;
        savedActive=Math.max(0,Math.min(savedMatches.length-1,savedActive+(event.key==='ArrowDown'?1:-1)));
        savedLimit=Math.max(savedLimit,savedActive+1);renderSaved();
        document.getElementById('saved-option-'+savedActive)?.scrollIntoView({block:'nearest'});
      }
      if(event.key==='Enter'){event.preventDefault();if(savedMatches.length)chooseSaved(savedMatches[savedActive]);}
    });
    savedResults.addEventListener('scroll',()=>{
      if(savedLimit<savedMatches.length&&savedResults.scrollTop+savedResults.clientHeight>=savedResults.scrollHeight-12){savedLimit+=40;renderSaved();}
    });
    document.addEventListener('pointerdown',event=>{if(!savedPanel.contains(event.target)&&!event.target.closest('[data-saved-for]'))closeSaved();});
    document.addEventListener('focusin',event=>{if(!savedPanel.contains(event.target)&&event.target!==savedTrigger)closeSaved();});
    document.querySelector('.content')?.addEventListener('scroll',()=>closeSaved());
    window.addEventListener('resize',()=>closeSaved());
    if(savedInline){filterSaved();savedSearch.focus();}
  `;
}
