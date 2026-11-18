import { app, type WebContents } from 'electron';
import { FiltersEngine, Request, type RequestType } from '@ghostery/adblocker';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDomain } from 'tldts';
import seed from '../browser/protectionSeed.json';
import { BrowserProtectionStatus, protectionListURLs } from '../browser/protection';
import { getSiteSettings, onSiteSettingsChanged, siteOrigin } from './siteSettings';

const day = 86400000;
const config = {enableCompression: true, loadCosmeticFilters: true, loadExtendedSelectors: false, enableHtmlFiltering: false};
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
type FilterSeed = {version: number; updatedAt: number; sources: string[]; sha256: string; engine: string};

export class BrowserProtection {
  private engine?: FiltersEngine;
  private updatedAt = 0;
  private updating?: Promise<BrowserProtectionStatus>;
  private error?: string;
  private listeners = new Set<() => void>();
  private counts = new Map<number, number>();

  constructor(private options: {
    read: () => FilterSeed | undefined;
    write: (value: FilterSeed) => void;
    load: () => Promise<FiltersEngine>;
    seed?: FilterSeed;
    now?: () => number;
  }) {
    const accept = (value: FilterSeed | undefined) => {
      if (!value || value.version !== 1 || !Number.isFinite(value.updatedAt) || value.updatedAt < 0 ||
        value.updatedAt > this.now() + 300000 || typeof value.engine !== 'string' || value.engine.length > 40*1024*1024 ||
        JSON.stringify(value.sources) !== JSON.stringify(protectionListURLs)) return false;
      const bytes = Buffer.from(value.engine, 'base64');
      if (digest(bytes) !== value.sha256) return false;
      this.engine = FiltersEngine.deserialize(bytes);
      this.updatedAt = value.updatedAt;
      return true;
    };
    try { if (accept(options.read())) return; } catch { /* Use bundled rules after corrupt/incompatible cache. */ }
    try { accept(options.seed || seed); } catch { this.error = 'Protection rules could not load.'; }
  }
  private now() { return this.options.now?.() ?? Date.now(); }
  private notify() {
    this.listeners.forEach(listener => {
      try { listener(); } catch { /* A closed UI must not interrupt rule updates. */ }
    });
  }
  onChange(listener: () => void) { this.listeners.add(listener); return () => {this.listeners.delete(listener);}; }
  status(): BrowserProtectionStatus {
    return {available: Boolean(this.engine), updatedAt: this.updatedAt || undefined,
      phase: this.updating ? 'updating' : !this.engine ? 'unavailable' : this.now()-this.updatedAt > 2*day ? 'stale' : 'ready', error: this.error};
  }
  count(id: number) { return this.counts.get(id) || 0; }
  reset(id: number) { this.counts.delete(id); }
  block(url: string, sourceUrl: string, type: RequestType, id: number) {
    if (!this.engine || !siteOrigin(sourceUrl) || type === 'mainFrame') return false;
    const blocked = this.engine.match(Request.fromRawDetails({url, sourceUrl, type, tabId:id})).match;
    if (blocked) this.counts.set(id, this.count(id)+1);
    return blocked;
  }
  styles(url: string) {
    if (!this.engine || !siteOrigin(url)) return '';
    const hostname = new URL(url).hostname;
    // CSS only. Scriptlets and extended selectors are deliberately not executed.
    const result = this.engine.getCosmeticsFilters({url, hostname, domain:getDomain(hostname), getInjectionRules:false, getExtendedRules:false});
    return typeof result.styles === 'string' && result.styles.length <= 512*1024 && !/url\s*\(|@import|expression\s*\(/i.test(result.styles) ? result.styles : '';
  }
  update() {
    if (this.updating) return this.updating;
    this.error = undefined;
    this.updating = Promise.resolve().then(async () => {
      try {
        const candidate = await this.options.load();
        const bytes = candidate.serialize();
        const updatedAt = this.now();
        const value = {version:1, updatedAt, sources:protectionListURLs, sha256:digest(bytes), engine:Buffer.from(bytes).toString('base64')};
        // Swap memory only after the new version is durably written.
        this.options.write(value);
        this.engine = candidate;
        this.updatedAt = updatedAt;
      } catch { this.error = this.engine
        ? 'Could not update protection rules. The last working rules are still in use.'
        : 'Could not update protection rules. Protection is unavailable.'; }
      finally { this.updating = undefined; this.notify(); }
      return this.status();
    });
    this.notify();
    return this.updating;
  }
}

async function loadLists() {
  const lists = await Promise.all(protectionListURLs.map(async url => {
    const response = await fetch(url, {signal:AbortSignal.timeout(20000), redirect:'error', credentials:'omit', referrerPolicy:'no-referrer'});
    if (!response.ok || !response.body) throw new Error('Filter list unavailable');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const {done,value} = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 8*1024*1024) throw new Error('Filter list too large');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const text = Buffer.concat(chunks).toString('utf8');
    if (!text.startsWith('[Adblock') || text.split('\n').length < 1000) throw new Error('Invalid filter list');
    return text;
  }));
  return FiltersEngine.parse(lists.join('\n'), config);
}
let service: BrowserProtection | undefined;
export function browserProtection() {
  if (service) return service;
  const file = path.join(app.getPath('userData'),'protection-rules.json');
  service = new BrowserProtection({
    read: () => fs.existsSync(file) && fs.statSync(file).size <= 40*1024*1024 ? JSON.parse(fs.readFileSync(file,'utf8')) : undefined,
    write: value => {
      fs.mkdirSync(path.dirname(file),{recursive:true});
      try { fs.writeFileSync(`${file}.tmp`,JSON.stringify(value),{mode:0o600}); fs.renameSync(`${file}.tmp`,file); }
      catch(error) { fs.rmSync(`${file}.tmp`,{force:true}); throw error; }
    }, load:loadLists,
  });
  const refresh = () => {if(Date.now()-(service?.status().updatedAt || 0) >= day) service?.update();};
  const timer = setInterval(refresh,3600000);timer.unref?.();
  refresh();
  return service;
}

const styleOwners = new WeakMap<WebContents, {profile:string; enabled:boolean; exceptions:string[]; css?:string; revision:number; style?:string}>();
export function applyProtectionStyles(contents: WebContents, profile: string, enabled: boolean, exceptions:string[] = []) {
  let owner = styleOwners.get(contents);
  if (!owner) {
    owner = {profile,enabled,exceptions,revision:0};styleOwners.set(contents,owner);
    const apply = () => applyProtectionStyles(contents,owner!.profile,owner!.enabled,owner!.exceptions);
    contents.on('did-finish-load',apply);
    const unsubscribe = onSiteSettingsChanged((changed,origin) => {if(changed===owner?.profile && origin===siteOrigin(contents.getURL()))apply();});
    const stopUpdate = browserProtection().onChange(apply);
    contents.once('destroyed',() => {unsubscribe();stopUpdate();browserProtection().reset(contents.id);styleOwners.delete(contents);});
    contents.on('did-start-navigation',(_event,_url,inPlace,mainFrame) => {if(mainFrame && !inPlace){owner!.revision++;owner!.css=undefined;owner!.style=undefined;browserProtection().reset(contents.id);}});
  }
  owner.profile=profile;owner.enabled=enabled;owner.exceptions=exceptions;
  if(contents.isDestroyed())return;
  const origin=siteOrigin(contents.getURL());
  const css=enabled && origin && !exceptions.includes(origin) && getSiteSettings(profile,origin).adBlocking !== false ? browserProtection().styles(contents.getURL()) : '';
  if(owner.style===css)return;
  const revision=++owner.revision;
  const previous=owner.css;owner.css=undefined;owner.style=css;
  if(previous)contents.removeInsertedCSS(previous).catch(() => {});
  if(css)contents.insertCSS(css,{cssOrigin:'user'}).then(key => {
    if(!contents.isDestroyed() && owner!.revision===revision)owner!.css=key;
    else if(!contents.isDestroyed())contents.removeInsertedCSS(key).catch(() => {});
    return undefined;
  }).catch(() => {});
}
