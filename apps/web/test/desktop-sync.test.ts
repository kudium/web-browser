import { beforeAll, afterAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { connect } from '../src/db';
import { createAuth, syncAccountId } from '../src/auth';
import { createApp } from '../src/app';
import { authUser, accounts } from '../src/schema';
const clientModule = '../../browser/src/main/sync/accountClient';
const { AccountSyncClient, SyncHTTPError, SYNC_ORIGIN } = await import(clientModule);
const preferencesModule = '../../browser/src/browser/preferences';
const { defaultPreferences } = await import(preferencesModule);
const url=process.env.TEST_DATABASE_URL;
const testIP=`2001:db8:${randomUUID().slice(0,4)}::1`;
describe.skipIf(!url)('two desktop devices with real encrypted sync API',()=>{
 const {db,client}=connect(url!);const auth=createAuth(db,{baseURL:SYNC_ORIGIN,secret:'desktop-sync-test-secret-32-characters'});const app=createApp({db,auth,assetOrigins:[]});let cookie:string,userId:string;
 beforeAll(async()=>{await migrate(db,{migrationsFolder:new URL('../drizzle',import.meta.url).pathname});const response=await app.request(SYNC_ORIGIN+'/api/auth/sign-up/email',{method:'POST',headers:{'x-forwarded-for':testIP,Origin:SYNC_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({name:'Sync test',email:`sync-${randomUUID()}@example.com`,password:'sync test account password 123'})});userId=(await response.json()).user.id;cookie=response.headers.get('set-cookie')!.split(';')[0];});
 afterAll(async()=>{if(userId){await db.delete(accounts).where(eq(accounts.id,syncAccountId(userId)));await db.delete(authUser).where(eq(authUser.id,userId));}await client.end();});
 function device(){
  let saved:any={};let preferences=structuredClone(defaultPreferences);preferences.cloudSync={enabled:false,provider:'kudiumbrowser',categories:{workspace:true,openTabs:true,preferences:true}};
  const request=async(path:string,token?:string,body?:unknown,headers:Record<string,string>={},method=body?'POST':'GET')=>{
   const response=await app.request(SYNC_ORIGIN+path,{method,headers:{'x-forwarded-for':testIP,...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw new SyncHTTPError(response.status,result.error,result.revision);return {body:result,headers:response.headers,status:response.status};
  };
  const instance=new AccountSyncClient({load:()=>saved,save:(value:any)=>{saved=structuredClone(value);},preferences:()=>preferences,enable:()=>{preferences.cloudSync.enabled=true;},request,
   open:async (url:string)=>{const code=new URL(url).searchParams.get('user_code');const call=(path:string,body?:unknown)=>app.request(SYNC_ORIGIN+path,{method:body?'POST':'GET',headers:{'x-forwarded-for':testIP,Cookie:cookie,Origin:SYNC_ORIGIN,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});await call(`/api/auth/device?user_code=${code}`);expect((await call('/api/auth/device/approve',{userCode:code})).status).toBe(200);}
  });return {instance,preferences,stored:()=>saved};
 }
 test('first-device enrollment, second-device recovery, restore and opt-out',async()=>{
  const a=device();await a.instance.connect();await a.instance.poll();expect(a.instance.status().phase).toBe('key-required');const key=a.instance.status().recoveryKey!;
  await expect(a.instance.enable({})).rejects.toThrow('Save your recovery key');await a.instance.enable({savedRecoveryKey:true});
  a.instance.snapshot({apps:[{id:'tab-a',sessionId:'group-a',spaceId:'space-a',name:'Example',url:'https://example.com',icon:''}],spaces:[{id:'space-a',name:'Work',color:'blue',folders:[]}]});await a.instance.sync();expect(a.instance.status().phase).toBe('ready');
  const b=device();await b.instance.connect();await b.instance.poll();expect(b.instance.status().phase).toBe('recovery-required');
  await expect(b.instance.enable({recoveryKey:Buffer.alloc(32).toString('base64url')})).rejects.toThrow('Unable to decrypt');await b.instance.enable({recoveryKey:key});
  b.instance.snapshot({apps:[],spaces:[]});await b.instance.sync();expect(b.instance.status().remote).toHaveLength(1);
  const restored=b.instance.restore(b.instance.status().remote[0].recordId);expect(restored.apps[0].url).toBe('https://example.com/');expect(restored.apps[0].sessionId).not.toBe('group-a');expect(restored.spaces[0].name).toBe('Work · Synced');
  const logins=[{title:'Example login',origin:'https://example.com',username:'sync-user',password:'private-password-123'}];
  await expect(a.instance.syncPasswords(logins)).rejects.toThrow('Enable passwords sync');
  a.preferences.cloudSync.categories.passwords=true;b.preferences.cloudSync.categories.passwords=true;
  await a.instance.syncPasswords(logins);await b.instance.sync(true);
  const passwordId=b.instance.status().passwordDevices[0].recordId;
  expect(await b.instance.restorePasswords(passwordId)).toEqual(logins);
  expect(JSON.stringify(b.instance.status())).not.toContain('private-password-123');
  b.preferences.cloudSync.categories.passwords=false;b.instance.pause();
  await expect(b.instance.restorePasswords(passwordId)).rejects.toThrow('Enable passwords sync');
  const last=b.instance.status().lastSyncedAt;b.preferences.cloudSync.enabled=false;b.instance.pause();await b.instance.sync();expect(b.instance.status().lastSyncedAt).toBe(last);
  await b.instance.deleteData();
  const c=device();await c.instance.connect();await c.instance.poll();expect(c.instance.status().phase).toBe('key-required');expect(c.instance.status().recoveryKey).not.toBe(key);
  await c.instance.enable({savedRecoveryKey:true});c.instance.snapshot({apps:[],spaces:[]});await c.instance.sync();expect(c.instance.status().phase).toBe('ready');
  await a.instance.sync(true);expect(a.instance.status().phase).toBe('error');
  await a.instance.disconnect();expect(a.stored().credential).toBeUndefined();expect(a.instance.status().connected).toBe(false);
 },20000);
});
