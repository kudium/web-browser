/* Decoder dispatch observer: hostile headers never enter the real native decoder. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const assert = require('assert/strict');
const { app, nativeImage } = require('electron');
const root = path.resolve(__dirname, '../..');
const phase = process.argv[2] || 'after';
const sourcePath = phase === 'before' ? 'docs/benchmarks/baselines/image-preflight/aiComposer.ts.txt' : 'src/main/aiComposer.ts';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'touchbox-image-preflight-'));
const original = nativeImage.createFromBuffer.bind(nativeImage);
let dispatches = 0;
let controlled = true;
const sentinel = {isEmpty:()=>false,getSize:()=>({width:32,height:32}),resize(){return this},toDataURL:()=> 'data:image/png;base64,c3ludGhldGlj'};
nativeImage.createFromBuffer = bytes => { dispatches++; return controlled ? sentinel : original(bytes); };
app.whenReady().then(async () => {
 const source = fs.readFileSync(path.join(root, sourcePath));
 const bundle = path.join(temporary, 'composer.cjs');
 const build = await require('esbuild').build({stdin:{contents:source.toString(),resolveDir:path.join(root,'src/main'),loader:'ts'},bundle:true,platform:'node',external:['electron'],outfile:bundle,metafile:true});
 const {AIComposerAttachments} = require(bundle);
 const normal = nativeImage.createFromBitmap(Buffer.alloc(32*32*4,170),{width:32,height:32}).toPNG();
 const giant=Buffer.from(normal);giant.writeUInt32BE(32767,16);giant.writeUInt32BE(32767,20);
 const gif=Buffer.alloc(10);gif.write('GIF89a');gif.writeUInt16LE(65535,6);gif.writeUInt16LE(65535,8);
 const cases=[];
 for (const [name,bytes] of [['oversized.png',giant],['oversized.gif',gif],['invalid.jpg',Buffer.from('not an image')],['script.png',Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"></svg>')]]) {
  dispatches=0;let accepted=false,error;
  try {await new AIComposerAttachments().add(name,bytes);accepted=true}catch(reason){error=reason.message}
  cases.push({name,bytes:bytes.length,accepted,nativeDecoderDispatches:dispatches,error});
  assert.equal(dispatches,phase==='before'?1:0);
 }
 controlled=false;dispatches=0;
 const result=await new AIComposerAttachments().add('normal.png',normal);
 assert.equal(result.kind,'image');assert.equal(dispatches,1);
 const dependencyHashes={};for(const file of Object.keys(build.metafile.inputs)){if(fs.existsSync(file))dependencyHashes[path.relative(root,path.resolve(file))]=hash(fs.readFileSync(file));}
 const output=path.join(root,'docs/benchmarks/image-preflight.json');const report=fs.existsSync(output)?JSON.parse(fs.readFileSync(output)):{};
 report[phase]={recordedAt:new Date().toISOString(),electron:process.versions.electron,platform:process.platform,arch:process.arch,probeSha256:hash(fs.readFileSync(__filename)),sourceSha256:hash(source),bundleSha256:hash(fs.readFileSync(bundle)),dependencyHashes,cases,normalNativePNGAccepted:true,scope:'Actual AIComposerAttachments with controlled native decoder dispatch for hostile headers; normal PNG uses actual Electron native decoder. No hostile decoder execution, decoder sandbox, peak memory/CPU, full application or cross-platform claim.'};
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report[phase]));app.exit(0);
}).catch(error=>{console.error(error);app.exit(1)});
app.on('will-quit',()=>{nativeImage.createFromBuffer=original;fs.rmSync(temporary,{recursive:true,force:true})});
