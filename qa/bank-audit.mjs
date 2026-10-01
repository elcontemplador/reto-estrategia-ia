import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeRound,createGame,useAid} from '../dist/engine.js';
import {validateBank} from '../dist/bank.js';
const bank=JSON.parse(fs.readFileSync(new URL('../dist/questions.json',import.meta.url),'utf8'));
validateBank(bank);
assert.equal(bank.length,1000);
for(let band=1;band<=5;band++)assert(new Set(bank.filter(q=>q.band===band).map(q=>q.family)).size>=19);
assert.equal(new Set(bank.map(q=>q.factKey)).size,1000);
assert.equal(new Set(bank.map(q=>q.prompt.toLocaleLowerCase('es'))).size,1000);
let seed=19092026;
const rng=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
const canonical=new Map(bank.map(q=>[q.id,q]));
const report={questions:bank.length,rounds:0,swaps:0,historyScenarios:{},sourcePages:new Set(bank.map(q=>q.source)).size};
for(const fraction of [0,0.5,0.9,0.99,1]){
  let tested=0;
  for(let n=0;n<1000;n++){
    const seen=new Set(bank.filter(()=>rng()<fraction).map(q=>q.id));
    const round=makeRound(bank,seen,rng),families=new Set();
    assert.equal(round.length,15);
    for(const [i,q] of round.entries()){
      assert.equal(q.band,Math.floor(i/3)+1);
      assert(!families.has(q.family));
      if(seen.has(q.id))assert(!bank.some(p=>p.band===q.band&&!families.has(p.family)&&!seen.has(p.id)),`Repetición evitable: ${q.id}`);
      assert.equal(q.options[q.answer],canonical.get(q.id).options[canonical.get(q.id).answer]);
      assert.deepEqual([...q.options].sort(),[...canonical.get(q.id).options].sort());
      families.add(q.family);
    }
    if(fraction===0)for(let b=0;b<5;b++)assert.equal(new Set(round.slice(b*3,b*3+3).map(q=>q.track)).size,3);
    const g=createGame(bank,seen,rng),previous=g.round[0],excluded=new Set(g.round.map(q=>q.family));
    assert(useAid(g,'swap',bank,seen,rng));
    assert.equal(g.round[0].band,previous.band);assert(!excluded.has(g.round[0].family));
    if(seen.has(g.round[0].id))assert(!bank.some(p=>p.band===previous.band&&!excluded.has(p.family)&&!seen.has(p.id)));
    assert.equal(new Set(g.round.map(q=>q.family)).size,15);
    tested++;report.rounds++;report.swaps++;
  }
  report.historyScenarios[String(fraction)]=tested;
}
const seen=new Set();let firstRepeat=null;
for(let n=1;n<=100;n++){
  const round=makeRound(bank,seen,rng);
  for(const q of round){if(seen.has(q.id)&&firstRepeat===null)firstRepeat=n;seen.add(q.id);}
}
report.sequentialPerfectGames={games:100,uniqueQuestions:seen.size,firstRepeatAtGame:firstRepeat,note:'Simulación con semilla fija; no es una garantía de número de partidas sin repetir.'};
report.status='passed';
fs.writeFileSync(new URL('./bank-audit-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
