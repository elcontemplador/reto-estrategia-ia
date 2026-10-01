export function validateBank(bank){
  const fail=()=>{throw new Error('El banco de preguntas no está completo o contiene datos inválidos.');};
  const text=v=>typeof v==='string'&&v.trim().length>0;
  if(!Array.isArray(bank)||bank.length<20)fail();
  const ids=new Set(),facts=new Set();
  for(const q of bank){
    if(!q||['id','topic','family','factKey','prompt','hint','explanation','sourceTitle','sourceLocator'].some(k=>!text(q[k])))fail();
    if(ids.has(q.id)||facts.has(q.factKey)||!Number.isInteger(q.band)||q.band<1||q.band>5)fail();ids.add(q.id);facts.add(q.factKey);
    if(!Array.isArray(q.options)||q.options.length!==4||!q.options.every(text)||new Set(q.options.map(x=>x.toLocaleLowerCase('es'))).size!==4||!Number.isInteger(q.answer)||q.answer<0||q.answer>3)fail();
    try{if(new URL(q.source).protocol!=='https:')fail();if(q.hintSource!==undefined&&(!text(q.hintSourceTitle)||new URL(q.hintSource).protocol!=='https:'))fail();}catch{fail();}
    if(typeof q.reviewedAt!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(q.reviewedAt)||!Number.isFinite(Date.parse(q.reviewedAt)))fail();
  }
  for(let band=1;band<=5;band++)if(new Set(bank.filter(q=>q.band===band).map(q=>q.family)).size<19)fail();
  return bank;
}
