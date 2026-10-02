import {POINTS,BANDS,createGame,selectAnswer,revealAnswer,nextQuestion,stopGame,useAid,restoreGame} from './engine.js';
import {validateBank} from './bank.js';
import {GameSound} from './sound.js';
import {STORAGE_KEY,readSave,writeSave,clearSave,withSaveLock} from './storage.js';
const $=s=>document.querySelector(s), esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat('es-ES',{useGrouping:'always'}).format(n), letters=['A','B','C','D'];
let bank=[],game=null,recent=new Set(),sound=false,busy=false,ready=false,noticeTimer;
let stats={best:0,plays:0,lastFinished:null},storageAvailable=true;
let view='start',lastChangeId=null,actionPending=false,syncPending=false,storageWarning=false;
const main=$('#main'), modal=$('#modal');
// Drafts stay in this tab for this visit; they never enter the shared game save.
const reportDrafts=new Map();
let copyRevision=0;
const saveWarning=()=>storageAvailable?'':'<p class="save-warning" role="note"><strong>El progreso no se está guardando.</strong> Puedes seguir jugando, pero los cambios de esta visita pueden perderse al recargar o cerrar esta pestaña.</p>';
const iconArrow='<span aria-hidden="true">→</span>';
const sourceHtml=q=>`<details class="source-detail"><summary>Consultar la fuente</summary><p><a href="${esc(q.source)}" target="_blank" rel="noopener noreferrer">${esc(q.sourceTitle)} ↗</a><br>${esc(q.sourceLocator)} · Revisión documental asistida: ${esc(q.reviewedAt.split('-').reverse().join('/'))}${q.hintSource?`<br>Fuente de la pista: <a href="${esc(q.hintSource)}" target="_blank" rel="noopener noreferrer">${esc(q.hintSourceTitle)} ↗</a>`:''}<br>Referencia ${esc(q.id)} <button class="report" aria-haspopup="dialog" data-report="${esc(q.id)}">Copiar referencia</button></p></details>`;
function clearNotice(){clearTimeout(noticeTimer);$('#notice').textContent='';$('#notice').classList.remove('visible','announcement-only');}
function notice(text,visual=true){if(modal.open){$('#modal-notice').textContent=text;return;}clearNotice();$('#notice').textContent=text;$('#notice').classList.add(visual?'visible':'announcement-only');noticeTimer=setTimeout(clearNotice,5000);}
const soundtrack=new GameSound(()=>{sound=false;updateSound();notice('El sonido no está disponible en este navegador. Puedes seguir jugando.');});
function play(type){void soundtrack.play(type);}
document.addEventListener('visibilitychange',()=>{if(document.hidden)soundtrack.stop();});
window.addEventListener('pagehide',()=>soundtrack.stop());
function updateSound(){$('#sound').setAttribute('aria-pressed',String(sound));$('#sound').innerHTML=`♪ <span>Sonido ${sound?'activado':'apagado'}</span>`;$('#sound').title=sound?'Desactivar sonido':'Activar sonido';$('#sound').setAttribute('aria-label',`Sonido ${sound?'activado. Desactivar':'apagado. Activar'} sonido`);}
function ladder(start=false){
  return `<aside class="ladder ${start?'start-ladder':'play-ladder'}" aria-label="Escalera de puntos"><div class="ladder-heading"><h2>${start?'Escala de puntos':'Hasta la cima'}</h2><span>${start?'15 aciertos para ganar':'15 preguntas'}</span></div><ol class="rungs">${POINTS.slice(1).map((p,i)=>{const n=i+1,current=game&&game.phase==='question'&&game.index===i,done=game&&game.correct>=n;return `<li class="rung ${n===5||n===10?'safe':''} ${current?'current':''} ${done?'done':''} ${n===15?'final':''}" ${current?'aria-current="step"':''}><span class="n">${String(n).padStart(2,'0')}</span>${n===5||n===10?'<span class="lock">SEGURO</span>':''}${done?'<span role="img" aria-label="Superado">✓</span>':''}<span class="value">${fmt(p)}</span></li>`;}).join('')}</ol><p class="ladder-foot">${start?'Cada peldaño indica tu puntuación total al acertar esa pregunta. Los seguros protegen los puntos si después fallas.':'Los seguros de las preguntas 5 y 10 protegen tus puntos si fallas.'}</p></aside>`;
}
const changeId=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`;
function snapshot(){return {game,view,seen:[...recent],stats,changeId:changeId()};}
function persist(){
  const finished=game&&(game.id||game.startedAt);
  if(game?.outcome&&stats.lastFinished!==finished){stats.best=Math.max(stats.best,game.score);stats.plays++;stats.lastFinished=finished;}
  const value=snapshot(),ok=writeSave(value);storageAvailable=ok;
  if(ok){lastChangeId=value.changeId;storageWarning=false;}
  else if(!storageWarning){storageWarning=true;notice('Puedes seguir jugando, pero este navegador no está guardando tu progreso.');}
  return ok;
}
function adoptSaved(saved){
  const value=saved.value,ids=new Set(bank.map(q=>q.id));
  recent=new Set((value?.seen||[]).filter(id=>ids.has(id)));
  const old=value?.stats;stats=old&&POINTS.includes(old.best)&&Number.isSafeInteger(old.plays)&&old.plays>=0?{best:old.best,plays:old.plays,lastFinished:old.lastFinished??null}:{best:0,plays:0,lastFinished:null};
  game=restoreGame(value?.game,bank);view=value?.view==='start'?'start':game?'game':'start';
  lastChangeId=value?.changeId??(value?'legacy':null);storageAvailable=saved.available;
}
function refreshSaved(){
  const saved=readSave();if(!saved.available||saved.corrupt)return false;
  const incoming=saved.value?.changeId??(saved.value?'legacy':null);if(incoming===lastChangeId)return false;
  const keepReference=modal.open&&!!modal.querySelector('#report-comment');
  adoptSaved(saved);if(modal.open&&!keepReference)modal.close();if(view==='start')startScreen();else render(!keepReference,false);
  notice('Tu progreso se ha actualizado desde otra pestaña.');return true;
}
async function transact(action){
  if(actionPending||busy)return false;actionPending=true;
  try{return await withSaveLock(async()=>{if(refreshSaved())return false;return await action();});}
  catch(error){busy=false;console.error(error);if(!readSave().available)storageAvailable=false;if(view==='game')render(false,false);else startScreen();notice('No se ha podido completar la acción. Puedes intentarlo de nuevo.');return false;}
  finally{actionPending=false;if(syncPending){syncPending=false;refreshSaved();}}
}
window.addEventListener('storage',event=>{if(!ready||(event.key!==STORAGE_KEY&&event.key!==null))return;if(actionPending||busy)syncPending=true;else refreshSaved();});
function showScale(){if(busy)return;showModal('Tu escala de puntos',`<p>Cada peldaño indica tu puntuación total si aciertas esa pregunta.</p><div class="score-modal">${ladder()}</div>`);}
function resume(){if(!game||modal.open||busy)return false;view='game';render(true);return true;}
function goHome(){if(!ready||busy||modal.open)return false;view='start';persist();startScreen();focusHeading();return true;}
function deleteHistory(){
  if(busy)return false;
  const empty={game:null,view:'start',seen:[],stats:{best:0,plays:0,lastFinished:null},changeId:changeId()};
  if(!clearSave(empty)){storageAvailable=false;notice('No hemos podido confirmar el borrado. Comprueba los permisos del navegador y vuelve a intentarlo.');return false;}
  reportDrafts.clear();game=null;view='start';recent=new Set();stats=empty.stats;lastChangeId=empty.changeId;storageAvailable=true;storageWarning=false;
  modal.close();startScreen();focusHeading();notice('Historial borrado.');return true;
}
function resetHistory(){showModal('¿Borrar tu historial?',`<p>Se borrarán tu partida, las preguntas vistas y tu mejor marca en este navegador.</p><div class="dialog-actions"><button class="secondary" data-close>Conservar mis datos</button><button class="primary" data-action="confirm-reset">Borrar historial</button></div>`);}

function startScreen(){
  if(!ready)return;
  view='start';clearNotice();
  main.innerHTML=`<div class="game-layout enter"><section class="start-surface"><p class="eyebrow"><span class="anniversary-full">El concurso del tercer aniversario</span><span class="anniversary-mobile">3 años de estrategIA</span></p><h1 class="start-title" tabindex="-1">¿Cuánto sabes de <em>inteligencia artificial?</em></h1><p class="intro">Quince preguntas para poner a prueba tu cultura general sobre IA. El reto sube de nivel. ¿Llegarás a los <strong>100.000 puntos</strong>?</p><div class="start-bottom"><button class="primary" data-action="${game&&game.phase!=='result'?'resume':'start'}">${game&&game.phase!=='result'?'Continuar mi partida':'Empezar a jugar'} ${iconArrow}</button><span class="small-note">Una partida individual.<br> Sin límite de tiempo.</span></div>${game?.phase==='result'?'<div class="last-result"><button class="text-button" data-action="last-result">Repasar mi última partida <span aria-hidden="true">→</span></button></div>':''}${saveWarning()}<div class="big-challenge home-scoring"><div><h2>Los puntos, paso a paso</h2><p><strong>Cada acierto te hace avanzar.</strong> El primero te da 100 puntos. Si aciertas las quince preguntas, llegas a 100.000.</p><p><strong>Puedes plantarte y conservar lo ganado.</strong> Si fallas, la partida termina y te quedas con el último seguro alcanzado.</p><p><strong>Hay dos seguros:</strong> 1.000 puntos al acertar la pregunta 5 y 10.000 al acertar la 10. Antes del primero, un fallo te deja en 0.</p></div></div><button class="text-button scale-button" aria-haspopup="dialog" data-action="scale">Ver escala de puntos</button><p class="home-aids"><strong>Si dudas, tienes tres comodines:</strong> descartar dos respuestas, pedir una pista o cambiar de pregunta. Puedes usar cada uno una vez.</p><p class="inventory"><span>Un banco de ${fmt(bank.length)} preguntas para volver a jugar</span><span>Cada respuesta incluye explicación y fuente</span></p><p class="brand-credit">Celebramos tres años de <a href="https://estrategiabyaleph.substack.com/" target="_blank" rel="noopener noreferrer">estrategIA ↗</a> con un reto para seguir aprendiendo.</p><div class="personal-best">${stats.plays?`<span>Tu mejor puntuación</span><strong>${fmt(stats.best)} puntos</strong><small>${stats.plays} ${stats.plays===1?'partida terminada':'partidas terminadas'} · ${recent.size} ${recent.size===1?'pregunta vista':'preguntas vistas'}</small>`:`<span>Tu primera partida te espera.</span><small>${storageAvailable?'Tu mejor puntuación se guardará aquí si el navegador permite guardar datos.':'Puedes jugar, pero este navegador no permite guardar tu progreso.'}</small>`}</div></section>${ladder(true)}</div>`;
}
function start(){if(!ready||busy||modal.open||(game&&game.phase!=='result'))return false;game=createGame(bank,recent);view='game';render(true);play('start');return true;}
function render(focus=false,save=true){
  clearNotice();
  if(!game){startScreen();return;}
  if(game.phase==='result'){if(save)persist();renderResult();if(focus)focusHeading();return;}
  const q=game.round[game.index],feedback=game.phase==='feedback',last=game.history.at(-1),isCorrect=feedback&&last.correct;
  const aidsLeft=Object.values(game.aids).filter(Boolean).length;
  recent.add(q.id);if(save)persist();
  main.innerHTML=`<div class="game-layout"><section class="play-surface ${focus?'enter':''}"><div class="question-top"><div class="question-count"><strong>${String(game.index+1).padStart(2,'0')}</strong><span class="slash">/</span><div><small>15 preguntas</small><span class="eyebrow">Por ${fmt(POINTS[game.index+1])} puntos</span></div></div><div class="stage">Etapa ${q.band} de 5<strong>${BANDS[q.band-1]}</strong></div></div><div class="progress-track" role="img" aria-label="${game.correct} de 15 preguntas acertadas">${POINTS.slice(1).map((_,i)=>`<span class="progress-segment ${i<game.correct?'done':i===game.index?'active':''}"></span>`).join('')}</div><div class="question-meta"><span class="country">${esc(q.topic)}</span><span class="topic">${fmt(game.secured)} puntos asegurados</span>${!feedback?`<button class="text-button aid-jump" data-action="aids" ${Object.values(game.aids).some(Boolean)?'':'disabled'}>${aidsLeft?`${aidsLeft} ${aidsLeft===1?'comodín disponible':'comodines disponibles'} ↓`:'Comodines utilizados'}</button>`:''}<button class="text-button scale-button" aria-haspopup="dialog" data-action="scale">Ver escala</button></div>${saveWarning()}<h1 class="question-title" tabindex="-1">${esc(q.prompt)}</h1><div class="answers" role="group" aria-label="Elige una respuesta">${q.options.map((opt,i)=>{
    const eliminated=game.hidden.includes(i),selected=game.selected===i,correct=feedback&&i===q.answer,wrong=feedback&&selected&&!correct;
    return `<button class="answer ${eliminated?'eliminated':''} ${selected&&!feedback?'selected':''} ${correct?'correct':''} ${wrong?'incorrect':''}" data-answer="${i}" aria-label="Respuesta ${letters[i]}: ${eliminated?'opción descartada':esc(opt)}${correct?' — correcta':wrong?' — incorrecta':''}" aria-pressed="${selected}" ${feedback||eliminated||busy?'disabled':''}><span class="letter" aria-hidden="true">${letters[i]}</span><span class="answer-text">${eliminated?'Opción descartada':esc(opt)}</span>${correct?'<span class="mark" role="img" aria-label="Respuesta correcta">✓</span>':wrong?'<span class="mark" role="img" aria-label="Respuesta incorrecta">×</span>':''}</button>`;
  }).join('')}</div>${game.hint?`<div class="hint" tabindex="-1"><strong>Una pista para seguir</strong>${esc(q.hint)}</div>`:''}${feedback?`<div class="feedback ${isCorrect?'':'bad'}" tabindex="-1" id="feedback"><h2>${isCorrect?(game.correct===15?'Quince aciertos. Reto superado.':game.correct===5||game.correct===10?'ASEGURADO. Estos puntos ya son tuyos.':['Exacto. Un acierto más.','Bien visto. Seguimos subiendo.','Correcto. Un paso más hacia la cima.'][game.index%3]):'Esta vez, la respuesta era otra.'}</h2><p>Respuesta correcta: <strong>${esc(q.options[q.answer])}</strong>.</p><p>${esc(q.explanation)}</p>${sourceHtml(q)}</div><div class="feedback-next"><span class="safe-notice">${game.outcome==='win'?'100.000 puntos. Reto completado.':game.outcome==='miss'?`Conservas ${fmt(game.score)} puntos.`:game.correct===5||game.correct===10?`${fmt(game.secured)} puntos asegurados.`:game.correct===14?'Solo queda una pregunta.':`${fmt(game.score)} puntos en juego.`}</span><button class="primary" data-action="next">${game.outcome?'Ver resultado':'Siguiente pregunta'} ${iconArrow}</button></div>`:`<div class="aids" role="group" aria-label="Comodines, una vez cada uno por partida">${[['half','½','Descartar dos'],['hint','?','Pedir una pista'],['swap','↻','Cambiar pregunta']].map(([id,symbol,label])=>`<button class="aid" data-aid="${id}" ${!game.aids[id]||busy?'disabled':''} aria-label="${label}${game.aids[id]?'':' — utilizado'}"><span class="aid-symbol" aria-hidden="true">${game.aids[id]?symbol:'✓'}</span><span>${label}${game.aids[id]?'':'<small class="aid-status">Utilizado</small>'}</span></button>`).join('')}</div><div class="answer-actions"><button class="withdraw" aria-haspopup="dialog" data-action="stop" ${busy?'disabled':''}>Plantarte y conservar<strong>${fmt(POINTS[game.correct])} puntos</strong></button><button class="primary" data-action="confirm" ${game.selected===null||busy?'disabled':''}>${busy?'Comprobando…':'Confirmar respuesta'} ${iconArrow}</button></div><p class="keyboard-note">Con el foco en las respuestas, puedes elegir con A, B, C o D y confirmar con Intro.</p>`}</section>${ladder()}</div>`;
  if(focus)focusHeading();
}
function focusHeading(){main.querySelector('h1')?.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
function choose(i){if(!game||view!=='game'||busy||modal.open)return false;if(!selectAnswer(game,i))return false;play('select');render();main.querySelector(`[data-answer="${i}"]`)?.focus({preventScroll:true});return true;}
async function confirm(){
  if(!game||view!=='game'||busy||modal.open||game.phase!=='question'||game.selected===null)return false;
  const current=game;busy=true;render();
  try{
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches)play('confirm');
    await new Promise(r=>setTimeout(r,matchMedia('(prefers-reduced-motion: reduce)').matches?0:470));
    if(game!==current||game.phase!=='question')return false;
    // Also protect browsers without Web Locks if another tab saved during the pause.
    busy=false;if(refreshSaved())return false;
    const correct=revealAnswer(game);busy=false;render();play(game.outcome==='win'?'win':correct?(game.correct===5||game.correct===10?'checkpoint':'correct'):'miss');
    $('#feedback')?.focus({preventScroll:true});$('#feedback')?.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});return true;
  }finally{busy=false;}
}
function aid(type){if(!game||view!=='game'||busy||modal.open)return false;const ok=useAid(game,type,bank,recent);if(ok){render();play(type);notice(type==='half'?'Dos opciones descartadas. Elige entre las dos restantes.':type==='hint'?'Pista disponible.':'Nueva pregunta. Mismo nivel.',false);if(type==='swap')focusHeading();else{const target=type==='hint'?main.querySelector('.hint'):main.querySelector(game.selected===null?'.answer:not(:disabled)':`[data-answer="${game.selected}"]`);target?.focus({preventScroll:true});target?.scrollIntoView({block:'nearest'});}}else notice('Este comodín no está disponible.');return ok;}
function next(){if(!game||view!=='game'||busy||modal.open)return false;if(nextQuestion(game)){render(true);return true;}return false;}
function requestStop(){if(!game||game.phase!=='question'||busy)return;showModal('¿Te plantas aquí?',`<p>Has acertado <strong>${game.correct} de 15</strong>. Si te plantas, terminas con <strong>${fmt(POINTS[game.correct])} puntos</strong>.</p><p>Si sigues y fallas, conservarás ${fmt(game.secured)} puntos.</p><div class="dialog-actions"><button class="secondary" data-close>Seguir jugando</button><button class="primary" data-action="confirm-stop">Me planto ${iconArrow}</button></div>`);}
function resultText(){const n=game.correct;if(!game.history.length)return 'Has terminado sin responder. Puedes empezar otra partida cuando quieras.';return n===15?'Has superado las cinco etapas. ¿Te atreves con otras quince preguntas?':n>=10?'Te has quedado cerca de la cima. ¿Lo intentas de nuevo?':n>=5?'Has superado el primer seguro. Repasa tus respuestas antes del próximo reto.':n>0?`Has acertado ${n} de las 15 preguntas. Repasa las respuestas y vuelve a intentarlo.`:'La primera pregunta se ha resistido. Consulta la explicación y prueba de nuevo.';}
function learningPanel(){
  return `<aside class="result-side learning-panel" aria-labelledby="learning-title"><p class="eyebrow">Tres años de estrategIA</p><h2 id="learning-title">La siguiente pregunta siempre es la mejor.</h2><p>Ideas, noticias y herramientas para entender cómo la IA está cambiando la política, el gobierno y nuestra vida.</p><div class="learning-paths"><a href="https://estrategiabyaleph.substack.com/" target="_blank" rel="noopener noreferrer">Seguir leyendo estrategIA ↗</a><a href="https://institucioneducativaaleph.com/encuentra-todas-las-herramientas-de-ia-mostradas-en-nuestra-newsletter-estrategia/" target="_blank" rel="noopener noreferrer">Explorar las herramientas de IA ↗</a><a href="https://institucioneducativaaleph.com/recopilatorio-de-buenas-practicas-en-inteligencia-artificial-aplicada-a-politica-y-gobierno/" target="_blank" rel="noopener noreferrer">IA aplicada a política y gobierno ↗</a></div><small>Gracias por seguir aprendiendo con nosotros.</small></aside>`;
}
function renderResult(){
  const elapsed=((game.endedAt||Date.now())-game.startedAt)/60000,duration=elapsed<1?'&lt; 1 min':`${Math.round(elapsed)} min`,used=Object.values(game.aids).filter(v=>!v).length,empty=game.history.length===0;
  main.innerHTML=`<div class="game-layout result-layout enter"><section class="result-summary">${game.outcome==='win'?'<div class="win-spark" aria-hidden="true"></div>':''}<p class="eyebrow">${empty?'Reto pendiente':game.outcome==='win'?'Reto completado':game.outcome==='stop'?'Has elegido plantarte':'Fin de la partida'}</p><h1 class="result-title" tabindex="-1">${empty?'El reto<br>te espera.':game.outcome==='win'?'Quince de quince.<br>La cima es tuya.':game.outcome==='stop'?'Hasta aquí.<br>Conservas tus puntos.':'Hoy llegaste hasta aquí.<br>¿Y la próxima vez?'}</h1><div class="score-block"><span class="result-score">${fmt(game.score)}</span><span>puntos</span></div><p class="result-description">${resultText()}</p>${saveWarning()}<p class="record-note">Tu mejor marca en este navegador: <strong>${fmt(stats.best)} puntos</strong>.</p><div class="result-metrics"><div><strong>${game.correct} / 15</strong><span>preguntas acertadas</span></div><div><strong>${used} / 3</strong><span>comodines utilizados</span></div><div><strong>${duration}</strong><span>duración aproximada</span></div></div><div class="result-actions"><button class="primary" data-action="start">Volver a jugar ${iconArrow}</button><button class="secondary" data-action="share">Compartir resultado ↗</button></div><a class="review-jump" href="#review">Repasar mis respuestas ↓</a></section><section class="review" id="review" tabindex="-1"><h2>Tus respuestas, con explicación</h2>${game.history.length?game.history.map((item,i)=>`<details class="review-item ${item.correct?'':'miss'}"><summary><span class="review-icon" role="img" aria-label="${item.correct?'Acierto':'Error'}">${item.correct?'✓':'×'}</span><span>${i+1}. ${esc(item.question.prompt)}</span><span class="review-chevron" aria-hidden="true">+</span></summary><div class="review-body"><p>${!item.correct?`Tu respuesta: ${esc(item.question.options[item.selected])}.<br>`:''}<strong>${esc(item.question.options[item.question.answer])}</strong></p><p>${esc(item.question.explanation)}</p>${sourceHtml(item.question)}</div></details>`).join(''):'<p class="small-note">No has respondido preguntas en esta partida.</p>'}</section>${learningPanel()}</div>`;
}
function showModal(title,body){
  if(busy||actionPending)return false;clearNotice();$('#modal-notice').textContent='';$('#modal-title').textContent=title;$('#modal-body').innerHTML=body;
  if(!modal.open)modal.showModal();
  const target=title==='¿Borrar tu historial?'?modal.querySelector('[data-close]'):$('#modal-title');target.tabIndex=target.id==='modal-title'?-1:target.tabIndex;target.focus({preventScroll:true});modal.querySelector('.dialog-scroll').scrollTop=0;return true;
}
function rules(){showModal('Quince preguntas. Tú decides.',`<p>Tu objetivo es llegar a <strong>100.000 puntos</strong>. La dificultad aumenta en cinco etapas de tres preguntas, desde usos y nombres conocidos hasta cultura general más exigente.</p><ol><li>Elige una de las cuatro respuestas y confírmala. Puedes cambiar tu elección antes de confirmar.</li><li>Si aciertas, subes un peldaño. Al superar las preguntas <strong>5 y 10</strong>, aseguras 1.000 y 10.000 puntos.</li><li>Si fallas, la partida termina y conservas el último seguro alcanzado. Antes del primero, conservas 0 puntos.</li><li>Puedes plantarte antes de confirmar una respuesta y conservar todo lo ganado.</li></ol><h3>Tres comodines, una vez cada uno</h3><p><strong>Descartar dos:</strong> elimina dos opciones incorrectas.<br><strong>Pedir una pista:</strong> ofrece una pista.<br><strong>Cambiar pregunta:</strong> sustituye la pregunta por otra del mismo nivel. Si ya has usado una pista o descartado opciones, esa ayuda se mantiene en la nueva pregunta.</p><h3>Una partida diferente cada vez</h3><p>Cultura general sobre IA: historia, protagonistas, conceptos básicos, herramientas y hechos sociales documentados. Tres preguntas por cada nivel. Las opciones cambian de orden. Priorizamos preguntas no vistas en este navegador mientras queden alternativas compatibles del mismo nivel. Dos preguntas sobre el mismo hecho no aparecen juntas.</p><p>El sonido es opcional: puedes activarlo o silenciarlo en la cabecera. No hay cuenta atrás ni premios económicos. Los puntos solo forman parte del juego. La partida y las preguntas vistas se guardan en este navegador, si permite almacenamiento local. Puedes recargar y continuar. Las pestañas de esta versión comparten la misma partida. Para volver al inicio sin perderla, pulsa la marca estrategIA y después Continuar mi partida. Tu mejor marca cuenta los puntos conservados al terminar; no hay clasificación pública.</p>`);}
function method(){
  if(!ready)return;
  const sources=[...new Map(bank.map(q=>{const url=new URL(q.source);url.hash='';return [url.href,{url:url.href,title:q.sourceTitle}];})).values()];
  showModal('Preguntas con fundamento',`<p><strong>${fmt(bank.length)} preguntas de cultura general sobre inteligencia artificial</strong>, organizadas en cinco niveles. Cada ficha incluye una explicación, una fuente y un localizador para comprobar la respuesta.</p><h3>Qué preguntamos</h3><p>Personas, ideas, empresas, herramientas, hitos y hechos públicos documentados. Las preguntas técnicas explican conceptos básicos sin exigir programación. Los acontecimientos y cargos se sitúan en una fecha concreta cuando hace falta.</p><h3>Cómo se revisa</h3><p>Redacción y revisión documental asistidas por IA. Se comprueban enunciado, respuesta, alternativas, pista y explicación. La dificultad se ha revisado pregunta a pregunta según los conocimientos necesarios y las alternativas de respuesta. Es una estimación editorial, todavía pendiente de calibración con jugadores. La revisión asistida no equivale a una validación académica humana.</p><h3>Créditos de las definiciones</h3><p>Algunas definiciones se han adaptado y traducido del <a href="https://developers.google.com/machine-learning/glossary" target="_blank" rel="noopener noreferrer">Machine Learning Glossary de Google Developers</a>, bajo licencia <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>. Las preguntas y explicaciones son una adaptación al formato del concurso; las fuentes concretas se indican en cada ficha.</p><h3>Tus datos</h3><p>El juego guarda la partida, la mejor marca y las preguntas vistas solo en este navegador. No pide una cuenta de jugador ni envía las respuestas a una clasificación. Si borras los datos del navegador, ese historial se pierde. Esta versión del juego se aloja en GitHub Pages.</p><p>${storageAvailable?'El guardado local está disponible.':'Este navegador no permite guardar el progreso; puedes jugar durante esta visita.'}</p><button class="secondary" data-action="reset-history">Borrar mi historial local</button><h3>¿Has detectado un error?</h3><p>En cada fuente puedes copiar la referencia de la pregunta y tu observación. Pégalas en un correo y envíalo a <a href="mailto:fernandonieto@institucioneducativaaleph.com?subject=El%20reto%20estrategIA%20-%20revisi%C3%B3n%20de%20una%20pregunta">fernandonieto@<wbr>institucioneducativaaleph.com</a>.</p><details class="source-detail"><summary>Consultar las ${sources.length} fuentes del banco</summary><ul class="source-list">${sources.map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a><small>${esc(new URL(s.url).hostname)}</small></li>`).join('')}</ul></details>`);
}
function report(id){const q=bank.find(q=>q.id===id);if(!q||busy||actionPending)return;showModal('Referencia de esta pregunta',`<p><strong>${esc(q.id)} · ${esc(q.topic)}</strong><br>${esc(q.prompt)}</p><label for="report-comment">Tu observación, si quieres añadirla</label><textarea id="report-comment" data-question="${esc(id)}" maxlength="2000" placeholder="Describe el error o la ambigüedad que has encontrado.">${esc(reportDrafts.get(id)||'')}</textarea><p class="small-note">Copia la pregunta, su fuente y tu observación para guardarlas o compartirlas. Este botón solo copia el texto; no envía ningún aviso.</p><p>Para comunicarnos un error, pega el texto copiado en un correo a <a href="mailto:fernandonieto@institucioneducativaaleph.com?subject=El%20reto%20estrategIA%20-%20revisi%C3%B3n%20de%20una%20pregunta">fernandonieto@<wbr>institucioneducativaaleph.com</a>.</p><div class="dialog-actions"><button class="secondary" data-copy-report="${esc(id)}">Copiar pregunta y observación</button></div>`);}
function reportText(id){const q=bank.find(q=>q.id===id);return `El reto estrategIA — revisión de ${q.id}\n${q.prompt}\nRespuesta: ${q.options[q.answer]}\nFuente: ${q.source}\nLocalizador: ${q.sourceLocator}\n\nObservación: ${$('#report-comment')?.value||''}`;}
async function copy(text){
  const revision=++copyRevision,fromModal=modal.open,origin=(fromModal?$('#modal-body'):main).firstElementChild;
  const current=()=>revision===copyRevision&&modal.open===fromModal&&origin===(fromModal?$('#modal-body'):main).firstElementChild;
  try{await navigator.clipboard.writeText(text);if(current())notice('Texto copiado.');return true;}
  catch{
    if(!current())return false;
    if(showModal('Copia este texto',`<p>No se ha podido copiar automáticamente. Selecciona el texto y cópialo.</p><textarea aria-label="Texto para copiar" readonly>${esc(text)}</textarea>`))modal.querySelector('textarea[readonly]')?.select();
    return false;
  }
}
async function share(){
  if(!game||game.phase!=='result')return;
  const blocks=Array.from({length:15},(_,i)=>i<game.correct?'🟩':i===game.correct&&game.outcome==='miss'?'🟥':'⬜');
  const used=Object.values(game.aids).filter(v=>!v).length;
  const text=`El reto estrategIA · Cultura general sobre IA\n${game.correct}/15 · ${fmt(game.score)} puntos · ${used}/3 comodines utilizados\n${[blocks.slice(0,5).join(''),blocks.slice(5,10).join(''),blocks.slice(10).join('')].join('\n')}\n¿Hasta dónde llegas tú?\nTres años de estrategIA. Quince preguntas para llegar a la cima.`;
  const url=location.origin+location.pathname,origin=main.firstElementChild;
  if(navigator.share){try{await navigator.share({title:'El reto estrategIA',text,url});return;}catch(e){if(e.name==='AbortError')return;}}
  if(!modal.open&&main.firstElementChild===origin)await copy(text+'\n'+url);
}
main.addEventListener('click',async e=>{
  const el=e.target.closest('button');if(!el||el.disabled)return;
  if(el.dataset.answer!==undefined){await transact(()=>choose(Number(el.dataset.answer)));return;}
  if(el.dataset.aid){await transact(()=>aid(el.dataset.aid));return;}
  if(el.dataset.report){report(el.dataset.report);return;}
  const action=el.dataset.action;
  if(action==='start')await transact(start);else if(action==='resume')await transact(resume);else if(action==='last-result')await transact(()=>game?.phase==='result'&&resume());else if(action==='confirm')await transact(confirm);else if(action==='next')await transact(next);else if(action==='stop')requestStop();else if(action==='share')await share();else if(action==='scale')showScale();else if(action==='aids'){const aid=main.querySelector('.aid:not(:disabled)');aid?.focus({preventScroll:true});aid?.scrollIntoView({block:'center',behavior:'instant'});}
});
modal.addEventListener('input',e=>{const field=e.target;if(field.matches('#report-comment[data-question]'))reportDrafts.set(field.dataset.question,field.value);});
modal.addEventListener('close',()=>{if(!modal.open&&(document.activeElement===document.body||modal.contains(document.activeElement)))main.querySelector('h1')?.focus({preventScroll:true});});
modal.addEventListener('click',async e=>{
  const el=e.target.closest('button');if(!el||el.disabled)return;
  if(el.hasAttribute('data-close'))modal.close();
  if(el.dataset.action==='reset-history')resetHistory();
  if(el.dataset.action==='confirm-reset')await transact(deleteHistory);
  if(el.dataset.action==='confirm-stop')await transact(()=>{if(!game||game.phase!=='question')return false;stopGame(game);modal.close();view='game';render(true);play('stop');return true;});
  if(el.dataset.copyReport)await copy(reportText(el.dataset.copyReport));
});
$('#close-modal').addEventListener('click',()=>modal.close());
modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)modal.close();}});
$('#rules').addEventListener('click',rules);$('#method').addEventListener('click',method);
$('#sound').addEventListener('click',()=>{sound=!sound;soundtrack.setEnabled(sound);updateSound();if(sound)play('enable');});
$('.identity').addEventListener('click',e=>{e.preventDefault();void transact(goHome);});
document.addEventListener('keydown',e=>{
  if(modal.open||busy||actionPending||e.ctrlKey||e.metaKey||e.altKey||!game||view!=='game')return;
  const target=e.target;if(e.repeat||!target?.closest('.play-surface')||target.matches('input,textarea,select')||target.isContentEditable)return;
  const i=letters.indexOf(e.key.toUpperCase());if(i>=0&&game.phase==='question'&&target.closest('.answers')){e.preventDefault();void transact(()=>choose(i));}
  if(e.key==='Enter'&&((target?.hasAttribute('data-answer')&&Number(target.dataset.answer)===game.selected)||!target?.closest('button,a,summary'))){if(game.phase==='question'&&game.selected!==null){e.preventDefault();void transact(confirm);}else if(game.phase==='feedback'){e.preventDefault();void transact(next);}}
});

function publicState(){if(!game||view==='start')return{phase:'start',questions:bank.length};const q=game.round[game.index];return{phase:game.phase,step:game.index+1,correct:game.correct,score:game.score,secured:game.secured,aids:game.aids,selected:game.selected,question:game.phase==='result'?null:{topic:q.topic,prompt:q.prompt,options:q.options.map((text,i)=>({letter:letters[i],text:game.hidden.includes(i)?'Descartada':text})),...(game.phase==='feedback'?{correctAnswer:letters[q.answer],explanation:q.explanation}:{})}};}
function registerWebMCP(){
  if(!document.modelContext?.registerTool)return;
  const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  const tools=[
    {name:'read_estrategia_game',description:'Leer el estado visible del reto estrategIA. No revela respuestas antes de confirmarlas.',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{},additionalProperties:false},execute:()=>publicState()},
    {name:'start_estrategia_game',description:'Iniciar una partida del reto estrategIA desde el inicio o el resultado.',annotations:{readOnlyHint:false},inputSchema:{type:'object',properties:{},additionalProperties:false},execute:async()=>{if(modal.open)throw new Error('Cierra la ventana antes de empezar.');if(!await transact(game&&game.phase!=='result'?resume:start))throw new Error('El estado ha cambiado; vuelve a leerlo.');return publicState();}},
    {name:'select_estrategia_answer',description:'Elegir una respuesta A, B, C o D, sin confirmarla todavía.',annotations:{readOnlyHint:false},inputSchema:{type:'object',properties:{letter:{type:'string',enum:letters}},required:['letter'],additionalProperties:false},execute:async input=>{if(!input||!letters.includes(input.letter))throw new Error('Indica A, B, C o D.');if(!await transact(()=>choose(letters.indexOf(input.letter))))throw new Error('No se puede elegir esa respuesta ahora.');return publicState();}},
    {name:'confirm_estrategia_answer',description:'Confirmar definitivamente la respuesta elegida; puede terminar la partida si es incorrecta.',annotations:{readOnlyHint:false},inputSchema:{type:'object',properties:{},additionalProperties:false},execute:async()=>{if(!await transact(confirm))throw new Error('Primero elige una respuesta disponible.');return publicState();}},
    {name:'continue_estrategia_game',description:'Continuar después de leer la explicación de una respuesta.',annotations:{readOnlyHint:false},inputSchema:{type:'object',properties:{},additionalProperties:false},execute:async()=>{if(!await transact(next))throw new Error('No hay una explicación pendiente.');return publicState();}}
  ];
  for(const tool of tools){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
}
const loadingController=new AbortController();
const loadingTimeout=setTimeout(()=>loadingController.abort(),15000);
try{
  const response=await fetch('./questions.json',{signal:loadingController.signal});if(!response.ok)throw new Error('No se ha podido descargar el banco.');
  bank=validateBank(await response.json());ready=true;$('#method').disabled=false;$('#rules').disabled=false;$('#sound').disabled=false;
  await withSaveLock(()=>{
    const saved=readSave();adoptSaved(saved);
    // Import the former save once; retain the best score even if edited questions invalidate its round.
    if(saved.migrated)persist();
    if(game&&view==='game')render(false,false);else startScreen();
    if(saved.corrupt)notice('La partida guardada no se ha podido leer. Puedes empezar una nueva.');
    else if(saved.value?.game&&!game)notice('Hemos actualizado las preguntas. Tu mejor marca se conserva; puedes empezar un nuevo reto.');
    else if(game&&view==='game')notice('Tu partida se ha recuperado.',false);
    else notice(storageAvailable?'Reto preparado. Puedes empezar a jugar.':'Reto preparado. Puedes jugar, pero el progreso no se guardará.',!storageAvailable);
  });registerWebMCP();
}catch(error){main.innerHTML=`<section class="error-view"><p class="eyebrow">Una pausa inesperada</p><h1 tabindex="-1">No hemos podido preparar las preguntas.</h1><p>Comprueba tu conexión y vuelve a intentarlo.</p><button class="primary" id="retry">Volver a cargar ${iconArrow}</button></section>`;$('#retry').onclick=()=>location.reload();notice('No hemos podido cargar las preguntas. Puedes volver a intentarlo.');main.querySelector('h1').focus();console.error(error);}finally{clearTimeout(loadingTimeout);}
