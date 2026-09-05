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
 player:{v:30,topSpeed:175,reset(){resets++}},closeNaming(){},
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
assert.equal(game.state,'riding');assert.equal(resets,1);assert.equal(game.time,0);assert.equal(game.player.topSpeed,0);
assert.ok(game.el.finish.classList.contains('hidden'));assert.ok(!game.el.hud.classList.contains('hidden'));
// Active/offline replay also clears a previously visible scoreboard.
game.state='finished';game.el.finish.classList.remove('hidden');globalThis.setTimeout=()=>0;
try{game.restart();}finally{globalThis.setTimeout=timeout;}
assert.equal(game.state,'riding');assert.ok(game.el.finish.classList.contains('hidden'));
console.log('PASS delayed multiplayer replay, admitted reset, scoreboard hidden, active replay');

game.keys={KeyW:true,Space:true};game._jumpEdge=true;game._lastW=performance.now();game.input={throttle:1,steer:1,hop:true,jump:true};game.clearInput();assert.deepEqual(game.keys,{});assert.equal(game.input.throttle,0);assert.equal(game.input.hop,false);assert.equal(game._jumpEdge,false);assert.equal(game._lastW,-Infinity);console.log("PASS fresh-run top speed and cleared focus-loss input");
const {Player}=await import('../src/player.js');
const rotation=()=>({set(){}});
const rider=Object.assign(Object.create(Player.prototype),{pos:{set(){}},groundAt:()=>0,root:{rotation:rotation()},leanG:{rotation:rotation()},pitchG:{rotation:rotation()},updateVisual(){},airTime:3,lean:.5,wheelie:1.2,steerVis:.6,offroad:true,onRamp:true,topSpeed:90,trickScore:500});
rider.reset([0,0],0);
for(const field of ['airTime','lean','wheelie','steerVis'])assert.equal(rider[field],0);
assert.equal(rider.onRamp,false);assert.equal(rider.offroad,false);assert.equal(rider.topSpeed,90);assert.equal(rider.trickScore,500);
console.log('PASS respawn clears stale pose and ramp state while preserving run statistics');
