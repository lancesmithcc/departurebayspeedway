import {register} from 'node:module';
import assert from 'node:assert/strict';
const base=new URL('../',import.meta.url).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,next){if(s==='three')return {url:'${base}lib/build/three.module.js',shortCircuit:true};if(s.startsWith('three/addons/'))return {url:'${base}lib/examples/jsm/'+s.slice(13),shortCircuit:true};return next(s,c)}`),import.meta.url);
const {Game}=await import('../src/game.js');
const element=()=>({classList:{values:new Set(),add(v){this.values.add(v)},remove(v){this.values.delete(v)},contains(v){return this.values.has(v)}}});
let resets=0,joins=0;
const game=Object.assign(Object.create(Game.prototype),{
 state:'finished',finishT:3,time:120,keys:{Enter:true},
 el:{finish:element(),hud:element(),title:element()},
 player:{v:30,reset(){resets++}},closeNaming(){},
 multiplayer:{status:'idle',join(){joins++;this.status='joining'}},
 audio:{init(){},setMusic(){},voice(){}},effects:{rings:[]},gates:[],zones:[],bars:{reset(){}},setCaption(){}
});
game.restart();
assert.equal(game.state,'title');assert.equal(game.finishT,0);assert.ok(game.el.finish.classList.contains('hidden'));assert.equal(resets,0);assert.equal(joins,1);
// Simulate the queue delay: finish rendering and automatic seat release both
// depend on this state, which must stay out of "finished" until admission.
assert.notEqual(game.state,'finished');
game.multiplayer.status='active';
const timeout=globalThis.setTimeout;globalThis.setTimeout=()=>0;
try {game.startRide();}finally{globalThis.setTimeout=timeout;}
assert.equal(game.state,'riding');assert.equal(resets,1);assert.equal(game.time,0);
assert.ok(game.el.finish.classList.contains('hidden'));assert.ok(!game.el.hud.classList.contains('hidden'));
// Active/offline replay also clears a previously visible scoreboard.
game.state='finished';game.el.finish.classList.remove('hidden');globalThis.setTimeout=()=>0;
try{game.restart();}finally{globalThis.setTimeout=timeout;}
assert.equal(game.state,'riding');assert.ok(game.el.finish.classList.contains('hidden'));
console.log('PASS delayed multiplayer replay, admitted reset, scoreboard hidden, active replay');
