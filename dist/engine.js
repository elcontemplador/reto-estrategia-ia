// The scoring and lifelines follow the original ALEPH game.
export const POINTS = Object.freeze([0,100,200,300,500,1000,1500,2500,4000,6500,10000,15000,25000,40000,65000,100000]);
export const BANDS = Object.freeze(['Para empezar','Ya sabes más','A media altura','El gran desafío','La cima']);
export function shuffle(items,rng=Math.random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function prepare(q,rng=Math.random){const order=shuffle([0,1,2,3],rng);return {...q,options:order.map(i=>q.options[i]),answer:order.indexOf(q.answer)};}
function pick(pool,seen,chosen,rng,preferredTrack){
  if(!pool.length)throw new Error('Faltan preguntas distintas para preparar el reto.');
  const fresh=pool.filter(q=>!seen.has(q.id));if(fresh.length)pool=fresh;
  const balanced=pool.filter(q=>q.track===preferredTrack);if(preferredTrack&&balanced.length)pool=balanced;
  const topics=new Set(chosen.map(q=>q.topic));const varied=pool.filter(q=>!topics.has(q.topic));if(varied.length)pool=varied;
  const answers=new Set(chosen.map(q=>q.options[q.answer].toLocaleLowerCase('es')));
  const diverse=pool.filter(q=>!answers.has(q.options[q.answer].toLocaleLowerCase('es')));if(diverse.length)pool=diverse;
  return pool[Math.floor(rng()*pool.length)];
}
export function makeRound(bank,seen=new Set(),rng=Math.random){
  const chosen=[],families=new Set();
  const tracks=['conceptos','historia','sociedad'];
  const hasTracks=tracks.every(t=>bank.some(q=>q.track===t));
  for(let band=1;band<=5;band++)for(const track of hasTracks?shuffle(tracks,rng):[null,null,null]){
    const q=pick(bank.filter(q=>q.band===band&&!families.has(q.family)),seen,chosen,rng,track);
    chosen.push(prepare(q,rng));families.add(q.family);
  }
  return chosen;
}
export function createGame(bank,seen=new Set(),rng=Math.random){return {id:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`,round:makeRound(bank,seen,rng),index:0,correct:0,secured:0,phase:'question',selected:null,hidden:[],hint:false,aids:{half:true,hint:true,swap:true},history:[],retired:[],startedAt:Date.now(),endedAt:null,outcome:null,score:0};}
export function selectAnswer(g,i){if(g.phase!=='question'||!Number.isInteger(i)||i<0||i>3||g.hidden.includes(i))return false;g.selected=i;return true;}
export function revealAnswer(g){
  if(g.phase!=='question'||g.selected===null||g.hidden.includes(g.selected))return false;
  const q=g.round[g.index],correct=g.selected===q.answer;
  g.phase='feedback';g.history.push({question:q,selected:g.selected,correct,usedHint:g.hint,usedHalf:g.hidden.length>0});
  if(correct){g.correct++;g.score=POINTS[g.correct];if(g.correct===5||g.correct===10)g.secured=g.score;}
  else{g.score=g.secured;g.outcome='miss';g.endedAt=Date.now();}
  if(g.correct===15){g.outcome='win';g.endedAt=Date.now();}
  return correct;
}
export function nextQuestion(g){if(g.phase!=='feedback')return false;if(g.outcome){g.phase='result';return true;}g.index++;g.phase='question';g.selected=null;g.hidden=[];g.hint=false;return true;}
export function stopGame(g){if(g.phase!=='question')return false;g.outcome='stop';g.phase='result';g.score=POINTS[g.correct];g.endedAt=Date.now();return true;}
export function useAid(g,type,bank,seen=new Set(),rng=Math.random){
  if(g.phase!=='question'||!Object.hasOwn(g.aids,type)||!g.aids[type])return false;
  const q=g.round[g.index];
  if(type==='half'){g.hidden=shuffle([0,1,2,3].filter(i=>i!==q.answer),rng).slice(0,2);if(g.hidden.includes(g.selected))g.selected=null;}
  else if(type==='hint')g.hint=true;
  else if(type==='swap'){
    const excluded=new Set([...g.round.map(q=>q.family),...g.retired.map(q=>q.family)]);
    const pool=bank.filter(p=>p.band===q.band&&!excluded.has(p.family));if(!pool.length)return false;
    const replacement=pick(pool,seen,g.round,rng,q.track);g.retired.push({id:q.id,family:q.family});g.round[g.index]=prepare(replacement,rng);g.selected=null;
    // Spent aids remain spent and their effects carry over to the replacement.
    if(g.hidden.length)g.hidden=shuffle([0,1,2,3].filter(i=>i!==g.round[g.index].answer),rng).slice(0,2);
  }else return false;
  g.aids[type]=false;return true;
}

// Validate a saved game against the current bank, including shuffled answers.
export function restoreGame(value,bank){
  try{
    const g=structuredClone(value),map=new Map(bank.map(q=>[q.id,q]));
    if(!g||!Array.isArray(g.round)||g.round.length!==15||!['question','feedback','result'].includes(g.phase))return null;
    if(!Number.isInteger(g.index)||g.index<0||g.index>14||!Number.isInteger(g.correct)||g.correct<0||g.correct>15)return null;
    if(!Array.isArray(g.history)||!Array.isArray(g.retired)||g.retired.length>1||!Array.isArray(g.hidden))return null;
    const normalize=q=>{
      const original=map.get(q?.id);
      if(!original||!Number.isInteger(q.answer)||q.answer<0||q.answer>3||!Array.isArray(q.options)||q.options.length!==4||new Set(q.options).size!==4||!q.options.every(x=>original.options.includes(x))||q.options[q.answer]!==original.options[original.answer])throw new Error('Pregunta alterada');
      return {...original,options:q.options,answer:q.answer};
    };
    g.round=g.round.map(normalize);
    if(new Set(g.round.map(q=>q.family)).size!==15||g.round.some((q,i)=>q.band!==Math.floor(i/3)+1))return null;
    if(!g.aids||['half','hint','swap'].some(k=>typeof g.aids[k]!=='boolean')||typeof g.hint!=='boolean')return null;
    if(g.hidden.length!==0&&g.hidden.length!==2)return null;
    if(new Set(g.hidden).size!==g.hidden.length||g.hidden.some(i=>!Number.isInteger(i)||i<0||i>3||i===g.round[g.index].answer))return null;
    if(g.selected!==null&&(!Number.isInteger(g.selected)||g.selected<0||g.selected>3||g.hidden.includes(g.selected)))return null;
    if((g.hint&&g.aids.hint)||(g.hidden.length&&g.aids.half)||(g.retired.length&&g.aids.swap))return null;
    let correct=0,miss=false;
    for(let i=0;i<g.history.length;i++){
      const h=g.history[i];h.question=normalize(h.question);
      if(i>14||h.question.id!==g.round[i].id||h.question.answer!==g.round[i].answer||h.question.options.some((option,j)=>option!==g.round[i].options[j])||!Number.isInteger(h.selected)||h.selected<0||h.selected>3||h.correct!==(h.selected===h.question.answer)||miss)return null;
      if(h.correct)correct++;else miss=true;
    }
    if(correct!==g.correct)return null;
    const secured=correct>=10?10000:correct>=5?1000:0;
    if(g.secured!==secured||g.score!==(miss?secured:POINTS[correct]))return null;
    if(g.outcome!==null&&!['win','miss','stop'].includes(g.outcome))return null;
    if(g.outcome==='miss'&&!miss||miss&&g.outcome!=='miss'||g.outcome==='win'&&correct!==15||correct===15&&g.outcome!=='win')return null;
    if(g.phase==='question'&&(g.outcome!==null||g.history.length!==g.index))return null;
    if(g.phase==='feedback'&&(g.history.length!==g.index+1||g.selected!==g.history.at(-1).selected))return null;
    if(g.phase==='result'&&!g.outcome||g.outcome==='stop'&&g.phase!=='result')return null;
    if(g.phase==='result'&&g.index!==(g.outcome==='stop'?correct:g.history.length-1))return null;
    if(!Number.isFinite(g.startedAt)||g.startedAt<=0||g.outcome&&(!Number.isFinite(g.endedAt)||g.endedAt<g.startedAt))return null;
    return g;
  }catch{return null;}
}
