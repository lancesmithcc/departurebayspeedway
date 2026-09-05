import { register } from 'node:module';
import assert from 'node:assert/strict';

const base = new URL('../', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s,c,next){
  if(s==='three')return {url:'${base}lib/build/three.module.js',shortCircuit:true};
  if(s.startsWith('three/addons/'))return {url:'${base}lib/examples/jsm/'+s.slice(13),shortCircuit:true};
  return next(s,c);
}`), import.meta.url);
const { PowerupPostPass } = await import('../src/powerup-post.js');

const pass = new PowerupPostPass();
const beer = { kind: 'beer' }, coffee = { kind: 'coffee' };
const read = { texture: {} }, write = { texture: {} };
const draws = [];
let target;
// Exercise actual pass orchestration without a GPU. Shader compilation and the
// resulting appearance are covered by the browser integration check.
const renderer = {
  setRenderTarget(value) { target = value; },
  render(mesh) {
    if (mesh.material === pass.tracer) {
      assert.notEqual(target.texture, mesh.material.uniforms.previous.value, 'history must never sample its current render target');
      assert.notEqual(target.texture, mesh.material.uniforms.current.value, 'current frame must remain a separate source');
    }
    draws.push({ target, material: mesh.material, valid: pass.tracer.uniforms.valid.value });
  },
};

assert.equal(pass.enabled, false);
pass.setSize(390, 845);
assert.equal(pass.history.width, 195);
assert.equal(pass.history.height, 423);
pass.update('riding', beer, 1 / 60);
assert.equal(pass.enabled, true);
assert.equal(pass.historyValid, false);
pass.render(renderer, write, read);
assert.equal(draws.length, 2);
assert.equal(draws[0].valid, false, 'first frame must not read uninitialised history');
assert.equal(draws[1].target, write);
assert.equal(pass.historyValid, true);

pass.update('riding', beer, 1 / 30);
assert.ok(Math.abs(pass.tracer.uniforms.decay.value - 0.81) < 1e-10, 'decay must compensate for frame duration');
assert.equal(pass.historyValid, true);
pass.render(renderer, write, read);
assert.equal(draws[2].valid, true);

pass.update('riding', coffee, 1 / 60);
assert.equal(pass.historyValid, false);
assert.equal(pass.effect.uniforms.beer.value, false);
const beforeCoffee = draws.length;
pass.render(renderer, write, read);
assert.equal(draws.length, beforeCoffee + 1, 'coffee must not render a history pass');

pass.update('riding', beer, 1 / 60);
assert.equal(pass.historyValid, false);
pass.render(renderer, write, read);
pass.update('riding', { kind: 'beer' }, 1 / 60);
assert.equal(pass.historyValid, false, 'replacement pickup of the same kind must reset history');
pass.render(renderer, write, read);
pass.setSize(1440, 900);
assert.equal(pass.historyValid, false, 'resize must discard old frame history');
assert.equal(pass.history.width, 720);

for (const state of ['title', 'crashed', 'finished']) {
  pass.update('riding', beer, 1 / 60);
  pass.render(renderer, write, read);
  pass.update(state, beer, 1 / 60);
  assert.equal(pass.enabled, false, `${state} must disable effects`);
  assert.equal(pass.historyValid, false, `${state} must reset history`);
}
for (const active of [null, { kind: 'bars' }, { kind: 'blessed' }]) {
  pass.update('riding', active, 1 / 60);
  assert.equal(pass.enabled, false);
}
pass.dispose();
console.log('PASS powerup post: feedback safety, half-resolution history, frame-rate decay, coffee single draw, replacement/resize reset, riding-only lifecycle');
