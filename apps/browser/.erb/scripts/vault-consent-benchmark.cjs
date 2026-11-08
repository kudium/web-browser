// Real original/current encrypted vault, synthetic records only. Security counts,
// not a performance claim: scrypt and disk timing are intentionally not compared.
const fs=require('fs');const os=require('os');const path=require('path');
const crypto=require('crypto');const {execFileSync}=require('child_process');
const esbuild=require('esbuild');
const ref='de2eae3bdf2f346d66dc91a6ef5aeda9581c0603';
const files=['src/main/passwordManager/vault.ts','src/main/passwordManager/records.ts','src/browser/passwordManager.ts'];
const password='disposable synthetic vault credential';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'kudiumbrowser-consent-benchmark-'));
const record={id:'record',title:'Synthetic profile',kind:'profile',origin:'',username:'',password:'',notes:'synthetic confidential fact',fields:[{name:'email',value:'fixture@example.test',secret:false}],allowAI:false};
const report={measuredAt:new Date().toISOString(),runtime:process.version,platform:process.platform,arch:process.arch,baselineRef:ref,method:'Bundle exact original Git vault/editor source and current source, create disposable encrypted files, save/edit/restart and rewrite one synthetic legacy envelope with omitted/false consents; count effective grants and public AI availability.',phases:{},limitations:['This proves record consent preservation, not per-task provider/client or downstream data-release approval.','Previously persisted automatically forced true values cannot be distinguished from intentional user grants.','Local hook/fill permission and provider disclosure are separate boundaries.']};
try {
  for(const phase of ['before','after']) {
    const folder=path.join(root,phase);const hashes={};
    for(const file of files) {
      const source=phase==='before'?execFileSync('git',['show',`${ref}:${file}`],{encoding:'utf8'}):fs.readFileSync(file,'utf8');
      const destination=path.join(folder,file);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,source);
      hashes[file]=crypto.createHash('sha256').update(source).digest('hex');
    }
    const entry=path.join(folder,'entry.ts');fs.writeFileSync(entry,"export {PasswordVault} from './src/main/passwordManager/vault';export {entryForEditor,entryForSave} from './src/browser/passwordManager';");
    const bundle=path.join(folder,'vault.cjs');esbuild.buildSync({entryPoints:[entry],bundle:true,platform:'node',outfile:bundle});
    const {PasswordVault,entryForEditor,entryForSave}=require(bundle);
    const filename=path.join(folder,'vault.json');const vault=new PasswordVault(filename);vault.unlock(password,true);
    const observations=[];
    for(const kind of ['login','profile','payment','knowledge']) {
      const edited=entryForSave(entryForEditor({...record,kind}));vault.save(edited);
      observations.push({case:`${kind} explicit false`,editorAllowsAI:edited.allowAI,persistedAllowsAI:vault.edit('record').allowAI});
    }
    const {allowAI,...missing}=record;vault.save(missing);observations.push({case:'missing consent',persistedAllowsAI:vault.edit('record').allowAI,searchDisclosesFact:vault.search('confidential').length>0});
    vault.saveMemory({kind:'knowledge',title:'New memory',fields:[],notes:'synthetic new memory'});observations.push({case:'new memory',persistedAllowsAI:vault.records().find(item=>item.id!=='record').allowAI});
    vault.save({...record,allowAI:true});vault.lock();
    const envelope=JSON.parse(fs.readFileSync(filename,'utf8'));const key=crypto.scryptSync(password,Buffer.from(envelope.salt,'base64'),32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
    const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64'));decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
    const legacy=JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]).toString());delete legacy.unifiedAccess;legacy.ai=false;legacy.items.find(item=>item.id==='record').allowAI=false;legacy.overrides=[{scope:'group',recordId:'record',patch:{allowAI:false}}];
    const iv=crypto.randomBytes(12);const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);envelope.iv=iv.toString('base64');envelope.ciphertext=Buffer.concat([cipher.update(JSON.stringify(legacy)),cipher.final()]).toString('base64');envelope.tag=cipher.getAuthTag().toString('base64');key.fill(0);fs.writeFileSync(filename,JSON.stringify(envelope));
    vault.unlock(password);observations.push({case:'legacy false record',persistedAllowsAI:vault.edit('record').allowAI},{case:'legacy false override',persistedAllowsAI:vault.edit('record','group').allowAI},{case:'legacy false global permission',persistedAllowsAI:vault.status().ai});
    report.phases[phase]={sourceSHA256:hashes,observations,unrequestedGrants:observations.filter(item=>item.persistedAllowsAI===true).length};vault.lock();
  }
  const filename='docs/benchmarks/vault-consent.json';
  if(fs.existsSync(filename)){const original=JSON.parse(fs.readFileSync(filename,'utf8'));original.confirmations=[...(original.confirmations||[]),report];fs.writeFileSync(filename,JSON.stringify(original,null,2)+'\n');}
  else fs.writeFileSync(filename,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally {fs.rmSync(root,{recursive:true,force:true});}
