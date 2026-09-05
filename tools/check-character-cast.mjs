import {register} from 'node:module';
import assert from 'node:assert/strict';
const base=new URL('../',import.meta.url).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,next){if(s==='three')return {url:${JSON.stringify(base)}+'lib/build/three.module.js',shortCircuit:true};if(s.startsWith('three/addons/'))return {url:${JSON.stringify(base)}+'lib/examples/jsm/'+s.slice(13),shortCircuit:true};return next(s,c)}`),import.meta.url);
const {createCharacterCast,buildCharacter,animateCharacter}=await import('../src/character-cast.js');
const {recolorFlattened}=await import('../src/models.js');
const cast=createCharacterCast();assert.equal(cast.length,6);const report=[];
for(const v of cast){assert.equal(v.frames.length,8);assert.ok(['male','female'].includes(v.voiceGender));assert.ok(v.adult);const count=v.geometry.attributes.position.count;
 for(const g of v.frames){assert.equal(g.attributes.position.count,count,'animation retains topology');for(const key of ['position','normal','color'])assert.ok(g.attributes[key].array.every(Number.isFinite));assert.ok(Math.abs(g.boundingBox.min.y-.001)<.002,'at least one supporting foot stays on ground');assert.ok(g.boundingBox.max.y<2.4&&g.boundingBox.max.y>1.6);}
 assert.ok(v.frames[0].attributes.position.array.some((x,i)=>Math.abs(x-v.frames[2].attributes.position.array[i])>.015),'actual articulated movement');
 assert.equal(v.parts.reduce((n,p)=>n+p.count,0),count);let start=0;const tinted=recolorFlattened(v.geometry,v.parts,(name,col)=>/skin|eye|hair/i.test(name)?null:col.set(0xffffff));for(const p of v.parts){if(/skin/i.test(p.name)){assert.equal(tinted.attributes.color.getX(start),v.geometry.attributes.color.getX(start));}start+=p.count;}tinted.dispose();
 assert.ok(count/3<28000,'per-pose triangle budget');report.push({name:v.name,gender:v.voiceGender,triangles:count/3,poses:8});
}
for(const kind of ['muscular','hoodie','shirtless','leopard']){const figure=buildCharacter(kind);assert.ok(figure.getObjectByName('Continuous torso'),'single sculpted torso');assert.ok(figure.getObjectByName('Sculpted head jaw cheeks and nose'),'integrated face surface');assert.ok(figure.getObjectByName('Rounded moulded sneaker sole'),'shaped shoe silhouette');figure.traverse(o=>{if(o.isMesh){assert.ok(o.geometry.attributes.normal.array.every(Number.isFinite));}});}
const live=buildCharacter('hoodie');animateCharacter(live,.37);assert.ok(Math.abs(live.userData.arms[0].shoulder.rotation.z)>1,'dancer raises arms');
console.log(JSON.stringify({result:'PASS',cast:report,checks:['finite mesh attributes','support foot contact','constant topology','articulation','gender metadata','skin retained under recolouring']}));
