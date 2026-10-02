import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createGame,restoreGame,selectAnswer,revealAnswer,nextQuestion,useAid} from '../dist/engine.js';
import {LEGACY_BANDS} from '../dist/legacy-bands.js';
const bankBytes=fs.readFileSync(new URL('../dist/questions.json',import.meta.url));
const bank=JSON.parse(bankBytes),review=JSON.parse(fs.readFileSync(new URL('../data/difficulty-review-2026-10-02.json',import.meta.url),'utf8'));
const changes=new Map(review.changes.map(c=>[c.id,c]));
const previous=bank.map(q=>({...q,band:changes.get(q.id)?.from??q.band}));
const hash=data=>createHash('sha256').update(data).digest('hex');
const rng=()=>{let seed=42;return()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296}};
test('La revisión cubre 1000 preguntas y solo ha cambiado los niveles documentados',()=>{
 assert.equal(review.empiricalPlayerData,false);assert.equal(review.reviewedIds.length,1000);
 assert.deepEqual([...new Set(review.reviewedIds)].sort(),bank.map(q=>q.id).sort());
 assert.equal(review.changes.length,396);assert.equal(changes.size,396);
 assert.equal(hash(bankBytes),review.afterSha256);
 assert.equal(hash(JSON.stringify(previous)+'\n'),'6df11754dd581dd324054c2007d41c74b1d5a744306158e46ec72e70de5a8319');
 for(const q of bank){const c=changes.get(q.id);if(c){assert.equal(q.band,c.to);assert.notEqual(c.from,c.to);assert.ok(c.reason.length>20);assert.deepEqual(LEGACY_BANDS[q.id],[c.from]);}}
 assert.deepEqual(Object.keys(LEGACY_BANDS).sort(),[...changes.keys()].sort());
});
test('La distribución documentada coincide y todas las bandas tienen suficientes familias',()=>{
 for(let band=1;band<=5;band++){const items=bank.filter(q=>q.band===band);assert.equal(items.length,review.afterLevels[band]);assert.ok(new Set(items.map(q=>q.family)).size>=19);}
});
test('1000 partidas anteriores conservan niveles, progreso y ayudas en fases distintas',()=>{
 const random=rng();let archived=0;
 for(let n=0;n<1000;n++){
  const game=createGame(previous,new Set(),random),answered=n%16;
  for(let i=0;i<answered;i++){selectAnswer(game,game.round[game.index].answer);revealAnswer(game);nextQuestion(game);}
  if(game.phase==='question'){
   if(n%2===0)useAid(game,'hint',previous,new Set(),random);
   if(n%3===0)useAid(game,'half',previous,new Set(),random);
   if(n%7===0)useAid(game,'swap',previous,new Set(),random);
   selectAnswer(game,game.round[game.index].answer);
   if(n%4===0)revealAnswer(game);
  }
  const restored=restoreGame(JSON.parse(JSON.stringify(game)),bank);
  assert.deepEqual(restored,game,`partida anterior ${n}`);
  if(game.round.some(q=>changes.has(q.id)))archived++;
 }
 assert.ok(archived>900,'La simulación alcanza partidas realmente afectadas');
});
test('Los niveles archivados no permiten recuperar opciones, familias o peldaños arbitrarios',()=>{
 const game=createGame(previous,new Set(),rng()),index=game.round.findIndex(q=>changes.has(q.id));assert.ok(index>=0);
 for(const mutate of [q=>{q.options[0]='opción inventada';},q=>{q.answer=(q.answer+1)%4;},q=>{q.band=0;},q=>{q.family='familia-falsa';}]){
  const corrupted=structuredClone(game);mutate(corrupted.round[index]);assert.equal(restoreGame(corrupted,bank),null);
 }
 const shifted=structuredClone(game);[shifted.round[0],shifted.round[12]]=[shifted.round[12],shifted.round[0]];assert.equal(restoreGame(shifted,bank),null);
});
