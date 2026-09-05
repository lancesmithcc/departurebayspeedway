import {PLAYER_COLORS,PLAYER_COLOR_NAMES,validPlayerSlot,colorRider} from './player-colors.js';
// Seven-rider same-origin room. Network peers are visuals only: each client keeps
// its own terrain, collision, scoring and NPC simulation. No personal names needed.
import * as THREE from 'three';
import {AuthoredRiderAnimation} from './authored-rider-animation.js';

export const MULTIPLAYER_QUEUE_MESSAGE='Wait your turn, punk. Only 7 at a time on this biotch.';
const ENDPOINT='/api/multiplayer';
const finite=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
function riderBadge(id,slot){
  // Public random session ids produce stable anonymous badges. Never paint names.
  if(typeof document==='undefined')return null;
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=72;
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  let hash=2166136261;for(const ch of id){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619);}
  const colour=PLAYER_COLORS[slot]||'#ffffff',suffix=validPlayerSlot(slot)?String(slot+1):(hash>>>0).toString(36).slice(-3).toUpperCase();
  ctx.fillStyle='rgba(12,22,30,.88)';ctx.fillRect(0,0,256,72);
  ctx.fillStyle=colour;ctx.fillRect(0,0,7,72);ctx.beginPath();ctx.arc(28,36,8,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#ffffff';ctx.font='bold 27px system-ui, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('RIDER '+suffix,151,37);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,depthTest:true,toneMapped:false});
  const sprite=new THREE.Sprite(material);sprite.name='Anonymous online rider badge';sprite.scale.set(1.45,.408,1);sprite.renderOrder=3;
  return {sprite,texture,material};
}


export class Multiplayer {
  constructor(scene,player,options={}) {
    this.scene=scene;this.player=player;this.options=options;
    this.slot=null;this.localColorCleanup=null;this.status='idle';this.id=null;this.token=null;this.queuePosition=0;
    this.capacity=7;this.online=0;this.remotes=new Map();
    this.pollAfterMs=100;this.elapsed=0;this.busy=false;this.failures=0;
    this.generation=0;this.request=null;this.disposed=false;
    this._position=new THREE.Vector3();this._quaternion=new THREE.Quaternion();
    this._euler=new THREE.Euler();
    this._pageHide=()=>this.leave();
    if(typeof window!=='undefined')window.addEventListener('pagehide',this._pageHide);
  }

  start(){return this.join();}
  async join() {
    if(this.disposed)return false;
    if(this.status==='active')return true;
    if(this.status==='joining'||this.status==='waiting')return false;
    const generation=++this.generation;
    this.status='joining';this.failures=0;this.elapsed=0;this.busy=true;
    this._notify();
    try {
      const data=await this._post('/join',{},generation);
      if(generation!==this.generation)return false;
      this._accept(data);
      return this.status==='active';
    }catch(error){
      if(generation===this.generation)this._disconnect(error);
      return false;
    }finally{if(generation===this.generation)this.busy=false;}
  }

  async _post(path,body,generation,keepalive=false) {
    const controller=new AbortController();this.request=controller;
    const timeout=setTimeout(()=>controller.abort(),3000);
    try {
      const response=await fetch(ENDPOINT+path,{
        method:'POST',headers:{'Content-Type':'application/json'},
        credentials:'same-origin',cache:'no-store',body:JSON.stringify(body),
        signal:controller.signal,keepalive,
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok){const error=new Error(data.message||'Multiplayer connection unavailable');error.status=response.status;error.code=data.code;error.retryAfterMs=data.retryAfterMs;throw error;}
      if(generation!==this.generation){
        // A late join could reserve a slot after Leave. Release it immediately.
        if(path==='/join'&&data.token)this._release(data.token);
        return null;
      }
      return data;
    }finally{clearTimeout(timeout);if(this.request===controller)this.request=null;}
  }

  _accept(data) {
    if(!data||!['active','waiting'].includes(data.status)||typeof data.token!=='string'||typeof data.playerId!=='string')throw new Error('Invalid multiplayer response');
    const previous=this.status;
    this.token=data.token;this.id=data.playerId;this.status=data.status;
    if(data.slot!==this.slot){this.localColorCleanup?.();this.localColorCleanup=null;this.slot=validPlayerSlot(data.slot)?data.slot:null;if(this.slot!==null)this.localColorCleanup=colorRider(this.player.authoredRig,this.slot);}
    this.capacity=7;this.queuePosition=Math.max(0,finite(data.queuePosition));
    this.pollAfterMs=clamp(finite(data.pollAfterMs,this.status==='active'?100:1000),100,2000);
    this.failures=0;
    const peers=Array.isArray(data.players)?data.players:[];
    this.online=Math.min(7,peers.length);this._syncPeers(peers);
    this._notify();
    if(this.status==='active'&&previous!=='active')this.options.onAdmission?.(this._status());
    if(this.status==='waiting')this.options.onWaiting?.(this._status());
  }

  _status(){return {status:this.status,id:this.id,queuePosition:this.queuePosition,capacity:7,online:this.online,slot:this.slot,color:PLAYER_COLORS[this.slot],message:this.status==='waiting'?MULTIPLAYER_QUEUE_MESSAGE:''};}
  _notify(){this.options.onStatus?.(this._status());}

  _snapshot() {
    const p=this.player,extra=this.options.getState?.()||{};
    // Send rendered contact position, which includes wheelie and crash support.
    // Sending only the simulation centre would place tilted remote bikes underground.
    const at=p.root?.position||p.pos;
    return {
      x:finite(at?.x),y:finite(at?.y),z:finite(at?.z),
      heading:wrap(finite(p.root?.rotation.y,p.heading)),speed:finite(p.v),
      lean:wrap(finite(p.state==='crashed'?p.root?.rotation.z:p.leanG?.rotation.z,p.lean)),
      pitch:wrap(finite(p.state==='crashed'?p.root?.rotation.x:p.pitchG?.rotation.x,p.wheelie)),
      animation:extra.state==='finished'?'finished':p.state==='crashed'?'crash':Math.abs(p.v||0)<.1?'idle':'ride',
      score:finite(extra.score),checkpoint:Math.max(0,Math.floor(finite(extra.checkpoint))),
    };
  }

  async _poll() {
    if(this.busy||!this.token||!['active','waiting'].includes(this.status))return;
    const generation=this.generation;this.busy=true;
    try {
      const body={token:this.token};if(this.status==='active')body.state=this._snapshot();
      const data=await this._post('/state',body,generation);
      if(generation===this.generation)this._accept(data);
    }catch(error){
      if(generation!==this.generation)return;
      if(error.status===429){this.pollAfterMs=clamp(finite(error.retryAfterMs,500),100,3000);return;}
      if(error.status===401||++this.failures>=3)this._disconnect(error);
      else this.pollAfterMs=Math.min(2000,400*this.failures);
    }finally{if(generation===this.generation)this.busy=false;}
  }

  _syncPeers(peers) {
    const seen=new Set();
    if(this.status==='active')for(const peer of peers){
      if(seen.size>=6)break;
      if(!peer||peer.id===this.id||typeof peer.id!=='string'||!peer.state)continue;
      const s=peer.state;if(!['x','y','z','heading','speed','lean','pitch'].every(key=>Number.isFinite(s[key])))continue;
      if(Math.abs(s.x)>100000||Math.abs(s.z)>100000||Math.abs(s.y)>10000)continue;
      seen.add(peer.id);
      let remote=this.remotes.get(peer.id);
      if(remote&&(remote.slot!==peer.slot||remote.modelId!==(this.player.modelRoot?.uuid||'fallback'))){this._remove(peer.id);remote=null;}
      if(!remote){remote=this._buildRemote(peer.id,peer.slot);if(!remote)continue;this.remotes.set(peer.id,remote);}
      remote.target={...s};remote.age=0;
      if(!remote.initialized||remote.root.position.distanceToSquared(this._position.set(s.x,s.y,s.z))>225){
        remote.root.position.set(s.x,s.y,s.z);remote.heading=s.heading;remote.lean=s.lean;remote.pitch=s.pitch;remote.initialized=true;
      }
    }
    for(const id of this.remotes.keys())if(!seen.has(id))this._remove(id);
  }

  _buildRemote(id,slot) {
    const player=this.player;if(!player.root)return null;
    const root=player.root.clone(true),sources=[],copies=[];
    player.root.traverse(o=>sources.push(o));root.traverse(o=>copies.push(o));
    const correspondence=new Map(sources.map((o,i)=>[o,copies[i]]));
    for(const source of sources)if(source.isSkinnedMesh){const copy=correspondence.get(source);copy.skeleton=source.skeleton.clone();copy.skeleton.bones=source.skeleton.bones.map(b=>correspondence.get(b));copy.bindMatrix.copy(source.bindMatrix);copy.bind(copy.skeleton,copy.bindMatrix);}
    const lean=correspondence.get(player.leanG),pitch=correspondence.get(player.pitchG),bike=correspondence.get(player.bikeGroup),model=correspondence.get(player.modelRoot);
    // Local rig geometry is actively deformed. Reset clone source to the immutable
    // supplied mesh before creating its independent deformation buffers.
    for(const part of player.authoredRig?.parts||[]){const copy=correspondence.get(part.mesh);if(copy)copy.geometry=part.original;}
    root.name='Remote rider';root.visible=true;root.position.set(0,0,0);root.rotation.set(0,0,0);
    if(lean)lean.rotation.set(0,0,0);if(pitch)pitch.rotation.set(0,0,0);
    root.updateMatrixWorld(true);
    const rig=model&&bike?new AuthoredRiderAnimation(model,bike):null;
    if(model){model.visible=true;for(const part of player.procParts||[]){const copy=correspondence.get(part);if(copy)copy.visible=false;}}
    const remote={id,slot,root,leanGroup:lean,pitchGroup:pitch,rig,modelId:player.modelRoot?.uuid||'fallback',initialized:false,target:null,age:0,heading:0,lean:0,pitch:0,speed:0,wheelSpin:0};
    remote.colorCleanup=colorRider(rig,slot);remote.badge=riderBadge(id,slot);if(remote.badge)this.scene.add(remote.badge.sprite);this.scene.add(root);return remote;
  }

  update(dt) {
    dt=clamp(finite(dt),0,.1);
    if(['active','waiting'].includes(this.status)){
      this.elapsed+=dt*1000;
      if(this.elapsed>=this.pollAfterMs&&!this.busy){this.elapsed=0;void this._poll();}
    }
    const mix=1-Math.exp(-dt*12);
    for(const remote of this.remotes.values()){
      const s=remote.target;if(!s)continue;remote.age+=dt;
      // Never extrapolate unseen motion into buildings or beyond a slope.
      remote.root.position.lerp(this._position.set(s.x,s.y,s.z),mix);
      remote.heading+=wrap(s.heading-remote.heading)*mix;
      remote.lean+=wrap(s.lean-remote.lean)*mix;remote.pitch+=wrap(s.pitch-remote.pitch)*mix;
      remote.speed+=(s.speed-remote.speed)*mix;
      if(s.animation==='crash'){
        remote.root.rotation.set(remote.pitch,remote.heading,remote.lean);
        if(remote.leanGroup)remote.leanGroup.rotation.set(0,0,0);
        if(remote.pitchGroup)remote.pitchGroup.rotation.set(0,0,0);
      }else{
        remote.root.rotation.set(0,remote.heading,0);
        if(remote.leanGroup)remote.leanGroup.rotation.set(0,0,remote.lean);
        if(remote.pitchGroup)remote.pitchGroup.rotation.x=remote.pitch;
      }
      const floor=this.player.groundAt?.(remote.root.position.x,remote.root.position.z);
      if(Number.isFinite(floor))remote.root.position.y=Math.max(remote.root.position.y,floor);
      remote.root.visible=remote.age<15;
      if(remote.badge){remote.badge.sprite.position.copy(remote.root.position).y+=2.25;remote.badge.sprite.visible=remote.root.visible;}
      remote.rig?.update(dt,{v:remote.speed,lean:remote.lean,wheelie:remote.pitch,steerVis:-remote.lean,grounded:s.animation!=='crash',_lastThrottle:Math.abs(remote.speed)>2?.4:0});
    }
  }

  _remove(id){const remote=this.remotes.get(id);if(!remote)return;this.scene.remove(remote.root);remote.colorCleanup?.();remote.rig?.dispose();if(remote.badge){this.scene.remove(remote.badge.sprite);remote.badge.texture.dispose();remote.badge.material.dispose();}this.remotes.delete(id);}
  _release(token){if(!token)return;void fetch(ENDPOINT+'/leave',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({token}),keepalive:true}).catch(()=>{});}
  _disconnect(error){
    if(this.status==='disconnected'||this.status==='idle')return;
    this.localColorCleanup?.();this.localColorCleanup=null;this.slot=null;
    const token=this.token;this.token=null;this.id=null;this.status='disconnected';this.online=0;this.queuePosition=0;
    ++this.generation;this.request?.abort();this.busy=false;
    for(const id of this.remotes.keys())this._remove(id);
    this._release(token);this._notify();
    this.options.onDisconnect?.({status:'disconnected',message:'Connection lost. Press Enter to reconnect.',code:error?.code||'CONNECTION_LOST'});
  }
  leave(){
    this.localColorCleanup?.();this.localColorCleanup=null;this.slot=null;
    const token=this.token;this.token=null;this.id=null;this.status='idle';this.online=0;this.queuePosition=0;
    ++this.generation;this.request?.abort();this.busy=false;this.elapsed=0;
    for(const id of this.remotes.keys())this._remove(id);
    this._release(token);this._notify();
  }
  dispose(){this.leave();this.disposed=true;if(typeof window!=='undefined')window.removeEventListener('pagehide',this._pageHide);}
}
