// Builds a single offline HTML preview using the real interface + demo data.
// This separate entry is never part of the production build or deployment.
import { build } from 'vite';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const demo=resolve(root,'tests/fixtures/design-demo.js');
const logo='data:image/svg+xml;base64,'+readFileSync(resolve(root,'logo.svg')).toString('base64');
const result=await build({configFile:false,root,logLevel:'warn',publicDir:false,plugins:[{
  name:'isolated-design-demo', enforce:'pre',
  resolveId(id){if(/(?:^|\/)(?:supabase|api)\.js$/.test(id))return demo},
  transform(code,id){if(!id.startsWith(root)||!id.endsWith('.js'))return null;
    let next=code.replaceAll('kulturo-','kulturo-design-preview-');
    if(id===resolve(root,'app.js'))next=next.replace('["http:", "https:"].includes(url.protocol)','(["http:", "https:"].includes(url.protocol) || /^data:image\\/svg\\+xml;charset=utf-8,/.test(url.href))').replaceAll('src="logo.svg"',`src="${logo}"`).replace('Journal culturel personnel</span>','Aperçu · données fictives</span>');
    return next;
  }
}],build:{write:false,target:'es2022',minify:true,lib:{entry:resolve(root,'app.js'),formats:['iife'],name:'KulturoDesign'},rollupOptions:{output:{}}}});
const bundle=(Array.isArray(result)?result[0]:result).output.find(item=>item.type==='chunk').code;
let css=['style.css','styles/add-sheet.css','styles/mobile-polish.css','styles/enhancements.css','styles/design-system-v4.css'].map(name=>readFileSync(resolve(root,name),'utf8')).join('\n');
css=css.replace(/@import[^;]+;/g,'').replace(/url\(['"]?(\.\/fonts\/[^)'"\s]+)['"]?\)/g,(_,name)=>`url(data:font/woff2;base64,${readFileSync(resolve(root,name)).toString('base64')})`);
const html=`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Kulturo — Aperçu Édition</title><style>${css}</style></head><body><div id="app"></div><script>const CONFIG={app:{name:'Kulturo',version:'4.1.0',itemsPerPage:100},supabase:{url:'',anonKey:''}};</script><script>${bundle.replaceAll('</script','<\\/script')}</script></body></html>`;
mkdirSync(resolve(root,'design'),{recursive:true});
writeFileSync(resolve(root,'design/Kulturo-apercu.html'),html);
console.log('Aperçu autonome créé : design/Kulturo-apercu.html');
