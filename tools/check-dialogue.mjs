import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { DIALOGUE_LINES, selectDialogue, PERSON_VOICES } from '../src/dialogue.js';
import { AudioSys } from '../src/audio.js';
assert.deepEqual(PERSON_VOICES,['male','female','male','female','male','female','female','male']);
for (const gender of ['male','female']) for (const group of [{},{kid:true},{party:true},{party:true,hell:true},{driver:true}]) {
  const history=new Map(); let last;
  for(let i=0;i<30;i++) {
    const line=selectDialogue(i%2?'bar':'bike',{...group,voiceGender:gender,voiceId:'cast-2'},history,()=>.4);
    assert(line && line.gender===gender);assert(line.key!==last);last=line.key;
    assert(line.voice.startsWith(gender==='male'?'am_':'af_'));
  }
  const a=selectDialogue('bike',{...group,voiceGender:gender},new Map(),()=>.2);
  const b=selectDialogue('bar',{...group,voiceGender:gender},new Map(),()=>.2);
  assert.notEqual(a.bank,b.bank);
}
for(const persona of ['jesus','satan']) for(const event of ['bike','bar','greet','rise']) assert(selectDialogue(event,{persona}));
const history=new Map();let last;
for(let i=0;i<12;i++){const x=selectDialogue('bar',{},history,()=>0);assert.notEqual(x.key,last);last=x.key;}
// Verify actual WebAudio timeline, including the slower pitch duration.
const events=[];const param=()=>({value:1,setValueAtTime:(v,t)=>events.push(t),linearRampToValueAtTime:(v,t)=>events.push(t)});
const audio=new AudioSys();audio.ready=true;audio.master={};audio.now=()=>10;audio.voiceBufs={test:{duration:4}};
audio.ctx={createBufferSource:()=>({playbackRate:param(),detune:param(),connect(){},start(){},stop(){}}),createGain:()=>({gain:param(),connect(){}})};
let duck;audio.duckMusic=(amount,seconds)=>{duck=seconds};
const result=await audio.voice('test',1,0,1,{rate:.9,pitch:.9});
assert(Math.abs(result.duration-4/.81)<1e-10);assert(Math.abs(audio.voiceUntil-(10+4/.81+.2))<1e-10);assert.equal(duck,result.duration+.2);
assert(events.includes(10+result.duration));
// A failed load is suppressed briefly, then retries rather than poisoning cache.
const originalFetch=globalThis.fetch;let fetches=0;
const missingAudio=new AudioSys();missingAudio.ready=true;missingAudio.ctx=audio.ctx;missingAudio.now=()=>0;
globalThis.fetch=async()=>{fetches++;return {ok:false,status:404}};
await missingAudio.voice('missing');await missingAudio.voice('missing');assert.equal(fetches,1);
missingAudio.voiceFailures.missing=Date.now()-1;await missingAudio.voice('missing');assert.equal(fetches,2);
globalThis.fetch=originalFetch;
const generated = JSON.parse(fs.readFileSync('audio/voices/generated-lines.json', 'utf8'));
for (const line of DIALOGUE_LINES) {
  assert.equal(generated[line.key]?.text, line.text, `stale spoken text: ${line.key}`);
  assert.equal(generated[line.key]?.voice, line.voice, `stale casting: ${line.key}`);
  assert.equal(generated[line.key]?.pitch, line.pitch ?? 1, `stale pitch: ${line.key}`);
}
for (const [key, record] of Object.entries(generated)) {
  const bytes = fs.readFileSync(`audio/voices/${key}.wav`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256, `stale recording: ${key}`);
  assert(record.seconds > .5 && record.seconds < 10, `unexpected dialogue duration: ${key}`);
}
const missing=[];
for(const line of DIALOGUE_LINES){const path=`audio/voices/${line.key}.wav`;if(!fs.existsSync(path)){missing.push(path);continue;}const b=fs.readFileSync(path);assert.equal(b.toString('ascii',0,4),'RIFF');assert(b.length>24000,`${path} unexpectedly short`);}
assert.equal(missing.length,0,`Missing ${missing.length} voice renders`);
console.log(JSON.stringify({result:'PASS',lines:DIALOGUE_LINES.length,checks:['event pools','cast genders','no immediate repeat','pitched duration and ducking','rendered WAV files','source text and audio hashes']}));
