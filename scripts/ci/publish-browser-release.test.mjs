import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

test('retry reuses immutable GitHub assets and requires live feeds before success', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'github-release-test-'));
  try {
    const root = path.join(tmp, 'installers'), manifests = [], assets = [];
    for (const arch of ['arm64', 'x64']) {
      const directory = path.join(root, `darwin-${arch}`); fs.mkdirSync(directory, { recursive: true });
      const files = ['zip', 'dmg'].map(ext => {
        const name = `Kudium-Browser-1.0.18-${arch}.${ext}`, bytes = Buffer.from(`${arch}-${ext}`);
        fs.writeFileSync(path.join(directory, name), bytes);
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        const url = `https://github.com/kudium/web-browser/releases/download/v1.0.18/${name}`;
        assets.push({ name, size: bytes.length, digest: `sha256:${sha256}`, state: 'uploaded' });
        return { url, size: bytes.length, sha512: createHash('sha512').update(bytes).digest('base64'), sha256 };
      });
      const m = { version: '1.0.18', channel: 'stable', platform: 'darwin', arch, notes: '', files };
      fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(m)); manifests.push(m);
    }
    const fixture = path.join(tmp, 'fixture.json');
    fs.writeFileSync(fixture, JSON.stringify({ manifests, release: { tag_name: 'v1.0.18', draft: false, prerelease: false, assets } }));
    const gh = path.join(tmp, 'gh');
    fs.writeFileSync(gh, `#!${process.execPath}\nconst fs=require('fs');const f=JSON.parse(fs.readFileSync(process.env.FIXTURE));const a=process.argv.slice(2);if(a[0]==='auth'){if(a[1]==='token')console.log('test-github-token');process.exit(0);}if(a[0]==='release'&&a[1]==='edit'){f.release.draft=false;fs.writeFileSync(process.env.FIXTURE,JSON.stringify(f));process.exit(0);}if(a[0]!=='api')throw Error('must never mutate published release');console.log(JSON.stringify(a.includes('--slurp')?[[f.release]]:f.release));\n`, { mode: 0o755 });
    const preload = path.join(tmp, 'fetch.mjs');
    fs.writeFileSync(preload, `import fs from 'node:fs';const f=JSON.parse(fs.readFileSync(process.env.FIXTURE));globalThis.fetch=async(url,init={})=>{if(init.method==='HEAD'){const fresh=new URL(url);if(!fresh.searchParams.has('verify')||init.cache!=='no-store')return new Response(null,{status:404});fresh.search='';const a=f.manifests.flatMap(m=>m.files).find(a=>a.url===fresh.href);return new Response(null,{headers:{'content-length':String(a.size)}});}if(init.method==='POST'){fs.writeFileSync(process.env.POSTED,init.body);return Response.json({published:true});}if(url.includes('/updates/')){const m=f.manifests.find(m=>url.includes('/'+m.arch+'/'));return new Response('version: '+(process.env.BAD_FEED?'1.0.17':m.version)+'\\n'+m.files.map(a=>a.url).join('\\n'));}return Response.json({releases:[{version:'1.0.18',channel:'stable',targets:f.manifests}]});};`);
    const run = extra => spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, new URL('./publish-browser-release.mjs', import.meta.url).pathname, root, 'macos'], { encoding: 'utf8', env: { ...process.env, PATH: `${tmp}:${process.env.PATH}`, FIXTURE: fixture, POSTED: path.join(tmp, 'posted.json'), RELEASE_PUBLISH_TOKEN: 'test', ...extra } });
    const success = run({}); assert.equal(success.status, 0, success.stderr);
    assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, 'publication.json'))).version, '1.0.18');
    assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, 'posted.json')))[0].files[0].sha256, manifests[0].files[0].sha256);
    const stale = run({ BAD_FEED: '1' }); assert.notEqual(stale.status, 0); assert.match(stale.stderr, /feed does not match/);
    const curl = path.join(tmp, 'curl');
    fs.writeFileSync(curl, `#!${process.execPath}
const fs=require('fs'),path=require('path'),args=process.argv.slice(2);let config='';process.stdin.on('data',b=>config+=b);process.stdin.on('end',()=>{
if(args.some(a=>a.includes('test-github-token'))||config.split(String.fromCharCode(10)).length!==3||!config.includes('Content-Type: application/octet-stream'))throw Error('unsafe curl configuration');
const name=new URL(args[args.length-1]).searchParams.get('name');if(process.env.FAIL_ASSET===name){process.stderr.write('fixture upload timeout');process.exit(1);}
const lock=process.env.FIXTURE+'.lock';while(true){try{fs.mkdirSync(lock);break;}catch(e){if(e.code!=='EEXIST')throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1);}}
try{const f=JSON.parse(fs.readFileSync(process.env.FIXTURE));const file=f.manifests.flatMap(m=>m.files).find(a=>a.url.endsWith('/'+name));f.release.assets.push({name,size:file.size,digest:'sha256:'+file.sha256,state:'uploaded'});fs.writeFileSync(process.env.FIXTURE,JSON.stringify(f));}finally{fs.rmdirSync(lock);}
});`, { mode: 0o755 });
    const draft = () => fs.writeFileSync(fixture, JSON.stringify({ manifests, release: { id: 123, tag_name: 'v1.0.18', draft: true, prerelease: false, assets: [] } }));
    draft();
    const uploaded = run({}); assert.equal(uploaded.status, 0, uploaded.stderr);
    assert.equal(JSON.parse(fs.readFileSync(fixture)).release.assets.length, 4);
    draft();
    const failedUpload = run({ FAIL_ASSET: 'Kudium-Browser-1.0.18-arm64.zip' });
    assert.notEqual(failedUpload.status, 0); assert.match(failedUpload.stderr, /uploads incomplete/);
    assert.equal(JSON.parse(fs.readFileSync(fixture)).release.draft, true);
    assets[0].digest = 'sha256:wrong'; fs.writeFileSync(fixture, JSON.stringify({ manifests, release: { tag_name: 'v1.0.18', draft: false, prerelease: false, assets } }));
    const corrupt = run({}); assert.notEqual(corrupt.status, 0); assert.match(corrupt.stderr, /Immutable GitHub asset differs/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
