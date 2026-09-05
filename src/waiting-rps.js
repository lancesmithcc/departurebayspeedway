const CHOICES=['rock','paper','scissors'];
const ICONS={rock:'✊',paper:'✋',scissors:'✌️'};
const BEAT_MS=550;
const CUES=['ROCK','PAPER','SCISSORS','DECIDE!','READY…','STEADY…','HOLD…','ROCK!','NEXT ROUND','NEXT ROUND','NEXT ROUND','NEXT ROUND'];
export function rpsResult(player,opponent){
 if(!CHOICES.includes(player)||!CHOICES.includes(opponent))throw new Error('Invalid hand');
 return player===opponent?'draw':CHOICES[(CHOICES.indexOf(player)+2)%3]===opponent?'win':'loss';
}
export function waitingRps(host){
 const game=document.createElement('section');game.className='waiting-rps';game.hidden=true;
 game.setAttribute('aria-label','Rock paper scissors against the computer');
 game.innerHTML=`<h3>Rock, paper, scissors, bud.</h3><p class="rps-hint">Pick before the throw. Eight beats in, four beats out!</p>
 <div class="rps-tempo"><strong data-cue>ROCK</strong><button type="button" data-sound aria-pressed="false">Beat sound: off</button></div>
 <div class="rps-beats" aria-hidden="true">${Array.from({length:12},(_,i)=>`<i></i>`).join('')}</div>
 <div class="rps-duel" aria-hidden="true"><div><span data-you>✊</span><small>YOU</small></div><small>VS</small><div><span data-bot>✊</span><small>COMPUTER</small></div></div>
 <div class="rps-choices">${CHOICES.map(c=>`<button type="button" data-hand="${c}" aria-pressed="false"><span aria-hidden="true">${ICONS[c]}</span>${c[0].toUpperCase()+c.slice(1)}</button>`).join('')}</div>
 <p class="rps-result" role="status" aria-live="polite">Pick your hand, bud!</p><div class="rps-score">You <b data-wins>0</b><span>Computer <b data-losses>0</b></span>Draws <b data-draws>0</b></div>`;
 host.append(game);
 let wins=0,losses=0,draws=0,selected=null,opponent=null,beat=0,timer=null,audio=null,sound=false;
 const query=s=>game.querySelector(s),buttons=[...game.querySelectorAll('[data-hand]')];
 function clickBeat(accent){
  if(!sound||!audio||audio.state!=='running')return;
  const osc=audio.createOscillator(),gain=audio.createGain(),now=audio.currentTime;
  osc.frequency.value=accent?660:330;gain.gain.setValueAtTime(.045,now);gain.gain.exponentialRampToValueAtTime(.001,now+.07);
  osc.connect(gain);gain.connect(audio.destination);osc.start(now);osc.stop(now+.08);
 }
 query('[data-sound]').onclick=()=>{
  sound=!sound;
  if(sound){const Context=window.AudioContext||window.webkitAudioContext;if(Context){audio??=new Context();audio.resume().catch(()=>{});}else sound=false;}
  query('[data-sound]').textContent=`Beat sound: ${sound?'on':'off'}`;query('[data-sound]').setAttribute('aria-pressed',String(sound));
 };
 for(const button of buttons)button.onclick=()=>{
  if(game.hidden||game.dataset.phase==='reveal')return;
  selected=button.dataset.hand;
  for(const b of buttons)b.setAttribute('aria-pressed',String(b===button));
  query('.rps-result').textContent=`${selected[0].toUpperCase()+selected.slice(1)} ready. Hold for the throw!`;
 };
 function tick(){
  if(game.hidden||document.hidden)return;
  if(beat===0){
   selected=null;opponent=CHOICES[Math.floor(Math.random()*3)];
   game.dataset.result='';query('[data-you]').textContent=query('[data-bot]').textContent=ICONS.rock;
   for(const b of buttons){b.disabled=false;b.setAttribute('aria-pressed','false');}
   query('.rps-result').textContent='Pick your hand, bud!';
  }
  game.dataset.phase=beat>=7?'reveal':'count';
  query('[data-cue]').textContent=CUES[beat];
  [...game.querySelectorAll('.rps-beats i')].forEach((el,i)=>el.classList.toggle('active',i===beat));
  // Restart a short animation on each beat, without a second animation clock.
  for(const el of [query('[data-you]'),query('[data-bot]'),query('[data-cue]')]){
   el.getAnimations().forEach(a=>a.cancel());
   if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)el.animate(beat<7?[
    {transform:'translateY(0) rotate(-9deg)'},{transform:'translateY(-18px) rotate(9deg)',offset:.45},{transform:'translateY(0) rotate(-9deg)'}
   ]:[{transform:'scale(1)'},{transform:'scale(1.16)',offset:.3},{transform:'scale(1)'}],{duration:BEAT_MS*.9,easing:'ease-in-out'});
  }
  clickBeat(beat===0||beat===7);
  if(beat===7){
   for(const b of buttons)b.disabled=true;
   query('[data-bot]').textContent=ICONS[opponent];query('[data-you]').textContent=selected?ICONS[selected]:'🤷';
   if(selected){
    const result=rpsResult(selected,opponent);game.dataset.result=result;
    if(result==='win')wins++;else if(result==='loss')losses++;else draws++;
    query('.rps-result').textContent=`${result==='win'?'Holy crap, bud—you won!':result==='loss'?'Aw, shoot. Got ya, pal!':'Same hand, eh!'} You: ${selected}. Computer: ${opponent}.`;
    query('[data-wins]').textContent=wins;query('[data-losses]').textContent=losses;query('[data-draws]').textContent=draws;
   }else query('.rps-result').textContent='Missed the beat, bud! Pick a hand next round.';
  }
  if(beat>7)query('[data-cue]').textContent=CUES[beat];
  beat=(beat+1)%12;
 }
 function stop(){clearInterval(timer);timer=null;}
 return {
  show(){if(!game.hidden)return;game.hidden=false;beat=0;tick();timer=setInterval(tick,BEAT_MS);},
  hide(){game.hidden=true;stop();for(const el of game.querySelectorAll('*'))el.getAnimations().forEach(a=>a.cancel());},
  reset(){stop();wins=losses=draws=0;beat=0;selected=null;for(const key of ['wins','losses','draws'])query(`[data-${key}]`).textContent='0';if(!game.hidden){tick();timer=setInterval(tick,BEAT_MS);}}
 };
}
