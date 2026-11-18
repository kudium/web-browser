import { useEffect, useState } from 'react';
import { Button, IconButton, Switch, TextField } from '@radix-ui/themes';
import { ArrowUp, ArrowDown, Plus, Trash2 } from 'lucide-react';
import { GroupPicker } from '../../UI/GroupPicker';
import { AppManager } from '../../../utils/AppManager';
import { useSpaces } from '../../../utils/SpaceManager';
import { aiGroupId } from '../../../browser/aiGroups';
import { resolveLinkRoute, validateLinkRoutingRules, LinkRoutingRule } from '../../../browser/linkRouting';

export function LinkRoutingSettings({rules, busy, save}: {
  rules: LinkRoutingRule[]; busy: boolean; save: (rules: LinkRoutingRule[]) => Promise<boolean>;
}) {
  const {spaces, active} = useSpaces();
  const [draft, setDraft] = useState(rules);
  const [testUrl, setTestUrl] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => setDraft(rules), [rules]);
  const apps = AppManager.getAll();
  const set = (id: string, patch: Partial<LinkRoutingRule>) => setDraft(items => items.map(item => item.id === id ? {...item,...patch} : item));
  const move = (index: number, delta: number) => setDraft(items => {
    const next = [...items];
    [next[index],next[index+delta]] = [next[index+delta],next[index]];
    return next;
  });
  let preview = 'Enter a URL to preview its destination.';
  if (testUrl) {
    try {
      const route = resolveLinkRoute(testUrl, validateLinkRoutingRules(draft), spaces, apps);
      preview = route ? `Opens in ${spaces.find(space => space.id === route.spaceId)?.name}${route.source ? ` / ${route.source.sessionName || route.source.name}` : ' / new group'}.`
        : 'No matching usable rule. Opens in the active group.';
    } catch { preview = 'Complete the rules before testing a link.'; }
  }
  return <div className="link-routing-settings">
    <p className="preference-note">Choose where links from other apps open. The first matching rule with an available destination wins.</p>
    {draft.map((rule,index) => {
      const groups = apps.filter(app => !app.archived && (app.spaceId || 'default') === rule.spaceId);
      return <div className="link-routing-rule" key={rule.id}>
        <div className="link-routing-rule-heading">
          <Switch aria-label={`Enable routing rule ${index+1}`} checked={rule.enabled} disabled={busy} onCheckedChange={enabled => set(rule.id,{enabled})} />
          <strong>Rule {index+1}</strong>
          <span className="link-routing-rule-actions">
            <IconButton variant="ghost" disabled={busy || index===0} aria-label={`Move rule ${index+1} up`} onClick={() => move(index,-1)}><ArrowUp size={16}/></IconButton>
            <IconButton variant="ghost" disabled={busy || index===draft.length-1} aria-label={`Move rule ${index+1} down`} onClick={() => move(index,1)}><ArrowDown size={16}/></IconButton>
            <IconButton variant="ghost" disabled={busy} aria-label={`Delete rule ${index+1}`} onClick={() => setDraft(items => items.filter(item => item.id !== rule.id))}><Trash2 size={16}/></IconButton>
          </span>
        </div>
        <label className="link-routing-field">Website hostname<TextField.Root aria-label={`Hostname for rule ${index+1}`} value={rule.hostname} placeholder="example.com" disabled={busy} onChange={event => set(rule.id,{hostname:event.target.value})}/></label>
        <div className="link-routing-destination">
          <GroupPicker label={`Space for rule ${index+1}`} disabled={busy} value={rule.spaceId} options={spaces.map(space => ({id:space.id,name:space.name}))} onChange={spaceId => set(rule.id,{spaceId,groupId:undefined})}/>
          <GroupPicker label={`Group for rule ${index+1}`} disabled={busy} value={rule.groupId || ''} options={[{id:'',name:'New group in this Space'},...groups.map(app => ({id:aiGroupId(app),name:app.sessionName || app.name,group:app}))]} onChange={groupId => set(rule.id,{groupId:groupId || undefined})}/>
        </div>
        <label className="link-routing-subdomains"><Switch aria-label={`Include subdomains for rule ${index+1}`} disabled={busy} checked={rule.includeSubdomains} onCheckedChange={includeSubdomains => set(rule.id,{includeSubdomains})}/>Include subdomains</label>
      </div>;
    })}
    <div className="link-routing-toolbar">
      <Button variant="soft" disabled={busy || draft.length >= 100} onClick={() => setDraft(items => [...items,{id:crypto.randomUUID(),hostname:'',enabled:true,includeSubdomains:true,spaceId:active.id}])}><Plus size={16}/>Add rule</Button>
      <Button disabled={busy} onClick={async () => {try {if(await save(validateLinkRoutingRules(draft)))setMessage('Routing rules saved.');}catch(error){setMessage(String(error));}}}>Save rules</Button>
    </div>
    {message && <p role="status">{message}</p>}
    <label className="link-routing-field">Test a link<TextField.Root aria-label="Test link routing" value={testUrl} placeholder="https://example.com/page" onChange={event => setTestUrl(event.target.value)}/></label>
    <p role="status" className="preference-note">{preview}</p>
  </div>;
}
