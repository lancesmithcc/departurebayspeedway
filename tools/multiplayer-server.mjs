import { randomBytes } from 'node:crypto';

/**
 * Single-process room admission + transform relay. Gameplay remains client-local.
 * Await the returned handle(req,res) before falling back to static file routing.
 * POST /api/multiplayer/join {name} creates a ticket; {token} resumes one.
 * POST /api/multiplayer/state {token,state?} renews the heartbeat and returns peers.
 * POST /api/multiplayer/leave {token} frees the seat and promotes the oldest waiter.
 * Snapshots return token, playerId, status, slot, queuePosition, players and serverTime.
 * Active slots are authoritative unique integers 0..capacity-1; waiters have null.
 * State: x/y/z/heading/speed, optional lean/pitch/animation/score/checkpoint.
 * A 401 SESSION_EXPIRED requires a fresh join; 429 returns retryAfterMs.
 * Clients poll while waiting, render only non-null peer states, and do not start
 * local gameplay until active. Tokens are bearer credentials: retain per tab and
 * never include them in URLs or peer records. Expiry is swept on every request.
 */
export function createMultiplayerHandler({ maxPlayers = 7, heartbeatMs = 15000, maxWaiting = 64, now = Date.now } = {}) {
  if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 64) throw new Error('Invalid room capacity');
  const sessions = new Map();
  const token = () => randomBytes(24).toString('base64url');
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  function reply(res, code, data) { res.writeHead(code, headers); res.end(JSON.stringify(data)); }
  function freeSlot() {
    const used=new Set([...sessions.values()].filter(p=>p.status==='active').map(p=>p.slot));
    for(let slot=0;slot<maxPlayers;slot++)if(!used.has(slot))return slot;
    return null;
  }
  function sweep() {
    const time = now();
    for (const [id, session] of sessions) if (time - session.lastSeen >= heartbeatMs) sessions.delete(id);
    let active = [...sessions.values()].filter(p => p.status === 'active').length;
    for (const session of sessions.values()) {
      if (active >= maxPlayers) break;
      if (session.status === 'waiting') { session.slot=freeSlot(); session.status = 'active'; active++; }
    }
  }
  function snapshot(session) {
    const all = [...sessions.values()], waiting = all.filter(p => p.status === 'waiting');
    return { token: session.token, playerId: session.playerId, status: session.status, slot: session.slot,
      queuePosition: session.status === 'waiting' ? waiting.indexOf(session) + 1 : 0,
      capacity: maxPlayers, heartbeatMs, pollAfterMs: session.status === 'waiting' ? 1000 : 100,
      players: all.filter(p => p.status === 'active').map(p => ({ id: p.playerId, slot: p.slot, name: p.name, state: p.state, updatedAt: p.updatedAt })),
      serverTime: now() };
  }
  function validState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const { x, y, z, heading, speed, lean = 0, pitch = 0, animation = 'ride' } = value;
    // Bounds encompass the complete baked Nanaimo world, with room for wipeouts.
    if (![x,y,z,heading,speed,lean,pitch].every(v => typeof v === 'number' && Number.isFinite(v))) return null;
    if (Math.abs(x)>12000 || Math.abs(z)>12000 || y < -100 || y > 1500 || Math.abs(speed)>150 || Math.abs(heading)>10000 || Math.abs(lean)>Math.PI || Math.abs(pitch)>Math.PI) return null;
    if (!['ride','crash','idle','finished'].includes(animation)) return null;
    const extra={};
    for(const key of ['score','checkpoint'])if(value[key]!==undefined){if(!Number.isInteger(value[key]) || Math.abs(value[key])>1000000000 || (key==='checkpoint' && (value[key]<0 || value[key]>20)))return null;extra[key]=value[key];}
    return {x,y,z,heading,speed,lean,pitch,animation,...extra};
  }
  async function body(req) {
    const length = Number(req.headers['content-length']);
    const tooLarge=()=>Object.assign(new Error('Payload too large'), {status:413});
    if (Number.isFinite(length) && length > 4096) { req.resume(); throw tooLarge(); }
    const data=await new Promise((resolve,reject)=>{
      const chunks=[];let bytes=0,overflow=false;
      req.on('data',chunk=>{
        bytes+=chunk.length;
        if(bytes>4096){overflow=true;chunks.length=0;reject(tooLarge());return;}
        if(!overflow)chunks.push(chunk);
      });
      req.on('end',()=>{if(!overflow)resolve(Buffer.concat(chunks).toString('utf8'));});
      req.on('error',reject);
      req.on('aborted',()=>reject(Object.assign(new Error('Request aborted'),{status:400})));
    });
    try { const value=JSON.parse(data);if (!value || typeof value!=='object' || Array.isArray(value)) throw new Error();return value; }
    catch { throw Object.assign(new Error('Invalid JSON object'), {status:400}); }
  }
  async function handle(req,res) {
    const pathname = (req.url || '').split('?')[0];
    if (!pathname.startsWith('/api/multiplayer/')) return false;
    if (!['/api/multiplayer/join','/api/multiplayer/state','/api/multiplayer/leave'].includes(pathname)) {reply(res,404,{error:'Unknown multiplayer endpoint'});return true;}
    if (req.method !== 'POST') {reply(res,405,{error:'POST required'});return true;}
    // Browser requests must originate from this host; no permissive CORS header.
    if (req.headers.origin) {
      try { if (new URL(req.headers.origin).host !== req.headers.host) throw new Error(); }
      catch {reply(res,403,{error:'Same-origin requests only'});return true;}
    }
    let input;
    try { input=await body(req); } catch(error) {reply(res,error.status||400,{error:error.message});return true;}
    // Admission mutations after the body await execute synchronously in this process.
    sweep();
    let session = typeof input.token === 'string' ? sessions.get(input.token) : null;
    if (pathname.endsWith('/join')) {
      if (session) {session.lastSeen=now();reply(res,200,snapshot(session));return true;}
      if (input.token !== undefined) {reply(res,401,{error:'Session expired',code:'SESSION_EXPIRED'});return true;}
      const all=[...sessions.values()], active=all.filter(p=>p.status==='active').length;
      if (active>=maxPlayers && all.length-active>=maxWaiting) {reply(res,503,{error:'Waiting room full',retryAfterMs:3000});return true;}
      const name=(typeof input.name==='string'?input.name:'Rider').replace(/[\u0000-\u001f\u007f<>]/g,'').trim().slice(0,32)||'Rider';
      session={token:token(),playerId:token().slice(0,16),name,status:active<maxPlayers?'active':'waiting',slot:active<maxPlayers?freeSlot():null,lastSeen:now(),lastUpdate:-Infinity,updatedAt:now(),state:null};
      sessions.set(session.token,session);reply(res,201,snapshot(session));return true;
    }
    if (!session) {reply(res,401,{error:'Session expired',code:'SESSION_EXPIRED'});return true;}
    if (pathname.endsWith('/leave')) {sessions.delete(session.token);sweep();reply(res,200,{left:true});return true;}
    let state;
    if (input.state!==undefined) {
      state=validState(input.state);
      if (!state) {reply(res,400,{error:'Invalid player state'});return true;}
    }
    const time=now();
    if (time-session.lastUpdate<50) {reply(res,429,{error:'Poll too fast',retryAfterMs:Math.ceil(50-(time-session.lastUpdate))});return true;}
    session.lastSeen=time;session.lastUpdate=time;
    if (state && session.status==='active') {session.state=state;session.updatedAt=time;}
    reply(res,200,snapshot(session));return true;
  }
  // Request-driven expiry avoids a timer keeping a static server/test process alive.
  return handle;
}
