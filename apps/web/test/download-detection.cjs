const {readFileSync}=require('node:fs');const {runInNewContext}=require('node:vm');const assert=require('node:assert/strict');
const source=readFileSync(require('node:path').join(__dirname, '../public/download.js'),'utf8');
(async()=>{for(const [nav,expected] of [
[{userAgent:'Mac',platform:'MacIntel',userAgentData:{getHighEntropyValues:async()=>({platform:'macOS',architecture:'arm',bitness:'64',platformVersion:'15.1'})}},['/download/darwin/arm64']],
[{userAgent:'Windows',platform:'Win32'},[]],
[{userAgent:'Linux',platform:'Linux x86_64',userAgentData:{getHighEntropyValues:async()=>{throw Error()}}},[]],
[{userAgent:'iPad',platform:'MacIntel',maxTouchPoints:5},[]],
[{userAgent:'Android',platform:'Linux'},[]],
[{userAgent:'unknown',platform:''},[]]]){const nodes={};const document={addEventListener(){},querySelector:s=>nodes[s]??={hidden:true,classList:{add(){}}}};await runInNewContext(source,{navigator:nav,document});const primary=nodes['[data-download-primary]'];assert.deepEqual(primary?.href ? [primary.href] : [],expected);}console.log('6 platform detection cases passed');})();
