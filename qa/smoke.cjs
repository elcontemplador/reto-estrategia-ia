const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const root=path.resolve(__dirname,'../dist');
const artifacts=path.join(__dirname,'artifacts');
const key='estrategia-quiz-v3';
const email='fernandonieto@institucioneducativaaleph.com';
const publicUrl='https://elcontemplador.github.io/reto-estrategia-ia/';
const report={checks:[],accessibility:[],errors:[],responses:[]};
let server,browser;
function check(name,condition){report.checks.push({name,pass:!!condition});assert.ok(condition,name);}
async function saved(p){return p.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);}
async function layout(p,label){check(label+' sin desbordamiento',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
async function accessibility(p,label){await p.addScriptTag({path:require.resolve('axe-core/axe.min.js')});const r=await p.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});return{violations:r.violations.map(x=>({id:x.id,nodes:x.nodes.map(n=>n.target)})),incomplete:r.incomplete.map(x=>x.id)};});report.accessibility.push({label,...r});check(label+' sin infracciones axe',r.violations.length===0);}
async function start(p){await p.locator('[data-action=start]').click();await p.locator('.question-title').waitFor();}
async function select(p,wrong=false){const g=(await saved(p)).game;const selected=wrong?(g.round[g.index].answer+1)%4:g.round[g.index].answer;await p.locator(`[data-answer="${selected}"]`).click();await p.waitForFunction(()=>!document.querySelector('[data-action=confirm]').disabled);await p.locator('[data-action=confirm]').click();await p.locator('.feedback').waitFor();}
async function next(p){const g=(await saved(p)).game;await p.locator('[data-action=next]').click();await p.waitForFunction(([k,i])=>{const s=JSON.parse(localStorage.getItem(k));return s.game.phase==='result'||(s.game.phase==='question'&&s.game.index===i+1);},[key,g.index]);}

(async()=>{try{
  fs.mkdirSync(artifacts,{recursive:true});
  let url=process.env.QA_BASE_URL;
  if(!url){
    const prefix='/reto-estrategia-ia/';
    server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;if(!pathname.startsWith(prefix)){res.writeHead(404).end();return;}const file=path.resolve(root,decodeURIComponent(pathname.slice(prefix.length))||'index.html');if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html; charset=utf-8','.json':'application/json','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${server.address().port}${prefix}`;
  }
  report.url=url;
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const p=await context.newPage();p.setDefaultTimeout(15000);
  p.on('pageerror',e=>report.errors.push(e.message));
  p.on('response',r=>{if(r.url().startsWith(url)&&r.status()>=400)report.responses.push({url:r.url(),status:r.status()});});
  const response=await p.goto(url);check('Acceso HTTP correcto',response.status()===200);
  await p.locator('[data-action=start]').waitFor();
  check('Canonical público',await p.locator('link[rel=canonical]').getAttribute('href')===publicUrl);
  check('Open Graph público',await p.locator('meta[property="og:url"]').getAttribute('content')===publicUrl);
  check('Enlace de regreso a LAB',await p.locator('footer a[href="https://elcontemplador.github.io/estrategIA-lab/"]').count()===1);
  for(const [w,h] of [[320,568],[390,844],[1440,900]]){await p.setViewportSize({width:w,height:h});await layout(p,`Inicio ${w}`);}
  await p.setViewportSize({width:390,height:844});
  await p.screenshot({path:path.join(artifacts,'inicio-movil.png'),fullPage:true});
  await accessibility(p,'Inicio');
  await p.locator('#method').click();
  check('Destino de errores en información general',await p.locator(`#modal a[href^="mailto:${email}"]`).innerText()===email);
  check('Texto de alojamiento actualizado',(await p.locator('#modal-body').innerText()).includes('GitHub Pages'));
  await p.keyboard.press('Escape');
  await start(p);
  const before=(await saved(p)).game.round[0].id;
  await p.locator('[data-aid=half]').click();await p.waitForFunction(k=>!JSON.parse(localStorage.getItem(k)).game.aids.half,key);
  await p.locator('[data-aid=hint]').click();await p.locator('.hint').waitFor();
  await p.locator('[data-aid=swap]').click();await p.waitForFunction(([k,id])=>JSON.parse(localStorage.getItem(k)).game.round[0].id!==id,[key,before]);
  await p.reload();await p.locator('.question-title').waitFor();
  const resumed=(await saved(p)).game;
  check('Los tres comodines y la partida sobreviven a recargar',resumed.hint&&resumed.hidden.length===2&&Object.values(resumed.aids).every(v=>!v));
  await select(p);
  await p.locator('.source-detail summary').click();await p.locator('[data-report]').click();
  const contact=p.locator(`#modal a[href^="mailto:${email}"]`);
  check('Destino de errores junto a la observación',await contact.innerText()===email);
  const mailto=new URL(await contact.getAttribute('href'));
  check('Correo y asunto válidos',mailto.pathname===email&&mailto.searchParams.get('subject').includes('revisión'));
  await p.locator('#report-comment').fill('Comprobación de publicación: no se envía ningún correo.');
  for(const [width,font] of [[320,''],[320,'200%'],[390,'']]){await p.setViewportSize({width,height:844});await p.evaluate(size=>document.documentElement.style.fontSize=size,font);await layout(p,`Referencia ${width} ${font}`);check('Correo largo dentro del formulario',await contact.evaluate(e=>e.getBoundingClientRect().right<=innerWidth));}
  await p.screenshot({path:path.join(artifacts,'contacto-movil.png'),fullPage:true});
  await accessibility(p,'Referencia con correo');
  await p.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('Portapapeles no disponible');}}}));
  await p.locator('[data-copy-report]').click();await p.locator('textarea[readonly]').waitFor();
  check('Copia alternativa conserva la observación',(await p.locator('textarea[readonly]').inputValue()).includes('Comprobación de publicación'));
  await p.keyboard.press('Escape');await next(p);
  for(let i=1;i<15;i++){await select(p);await next(p);}
  await p.locator('.result-summary').waitFor();let state=await saved(p);
  check('Partida completa: 100.000 puntos',state.game.score===100000&&state.game.outcome==='win'&&state.stats.plays===1);
  await accessibility(p,'Resultado');await layout(p,'Resultado móvil');
  await p.reload();await p.locator('.result-summary').waitFor();state=await saved(p);
  check('Recarga conserva resultado sin duplicar partidas',state.stats.plays===1&&state.stats.best===100000);
  await start(p);for(let i=0;i<5;i++){await select(p);await next(p);}await select(p,true);await next(p);await p.locator('.result-summary').waitFor();state=await saved(p);
  check('Fallar tras el primer seguro conserva 1.000',state.game.score===1000&&state.game.outcome==='miss'&&state.stats.plays===2);
  await start(p);await p.locator('[data-action=stop]').click();await p.keyboard.press('Escape');check('Cancelar plantarse conserva la pregunta',await p.locator('.question-title').isVisible());
  await p.locator('[data-action=stop]').click();await p.locator('[data-action=confirm-stop]').click();await p.locator('.result-summary').waitFor();
  check('Plantarse sin responder se explica',(await p.locator('.result-description').innerText()).includes('sin responder'));
  check('Sin errores JavaScript',report.errors.length===0);check('Sin recursos locales fallidos',report.responses.length===0);
  report.status='passed';
}catch(e){report.status='failed';report.failure=e.stack;process.exitCode=1;}finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));fs.mkdirSync(artifacts,{recursive:true});fs.writeFileSync(path.join(artifacts,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}})();
