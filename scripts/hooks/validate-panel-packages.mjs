import fs from 'node:fs';import {createRequire} from 'node:module';
const require=createRequire(new URL('../../apps/browser/package.json',import.meta.url));const ts=require('typescript'),acorn=require('acorn'),postcss=require('postcss');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {parseHookPackage}=require('../../packages/hooks/package.ts');const {createHookSourceValidator}=require('../../packages/hooks/source-validation.ts');const {validateHookPanel}=require('../../apps/browser/src/browser/hookPanels.ts');
const validator=createHookSourceValidator({javascript:source=>acorn.parse(source,{ecmaVersion:'latest',locations:true}),css:source=>postcss.parse(source)});
for(const id of ['listen-article','pr-navigator','page-explorer']){
 const root=new URL('../../docs/marketplace-hooks/',import.meta.url);const pkg=parseHookPackage(JSON.parse(fs.readFileSync(new URL(id+'.json',root),'utf8')));
 const errors=validator.errors({name:pkg.name,...pkg.lifecycle});if(errors.length)throw new Error(JSON.stringify(errors));
 acorn.parse(fs.readFileSync(new URL('src/'+id+'.panel.js',root),'utf8'),{ecmaVersion:'latest'});
 const design={html:fs.readFileSync(new URL('src/'+id+'.panel.html',root),'utf8'),css:fs.readFileSync(new URL('src/panel-shared.css',root),'utf8'),script:fs.readFileSync(new URL('src/'+id+'.panel.js',root),'utf8'),data:{title:'Example',paragraphs:['Hello'],files:[],headings:[],links:[]}};
 if(id!=='listen-article'){const css=fs.readFileSync(new URL('src/navigator-shared.css',root),'utf8');postcss.parse(css);design.css+='\n'+css;}
 const customCSS=new URL('src/'+id+'.panel.css',root);if(fs.existsSync(customCSS)){const css=fs.readFileSync(customCSS,'utf8');postcss.parse(css);design.css+='\n'+css;}
 validateHookPanel({id:'qa',title:pkg.name,content:{type:'html',...design}});
 console.log('PASS package/source/panel validators:',id);
}
