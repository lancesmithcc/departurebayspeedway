import {createServer,request} from 'node:http';
import assert from 'node:assert/strict';
import {createMultiplayerHandler} from './multiplayer-server.mjs';
let time=100000;
const handler=createMultiplayerHandler({maxPlayers:7,heartbeatMs:15000,maxWaiting:2,now:()=>time});
const server=createServer(async(req,res)=>{if(!await handler(req,res)){res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
async function call(action,body,headers={}){
 const response=await fetch(`${base}/api/multiplayer/${action}`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 return {status:response.status,data:await response.json()};
}
try{
 // Concurrent requests still produce exactly seven admissions in a single process.
 const joined=await Promise.all(Array.from({length:9},(_,i)=>call('join',{name:`Rider ${i}`})));
 assert.ok(joined.every(r=>r.status===201));
 const active=joined.filter(r=>r.data.status==='active').map(r=>r.data),waiting=joined.filter(r=>r.data.status==='waiting').map(r=>r.data).sort((a,b)=>a.queuePosition-b.queuePosition);
 assert.equal(active.length,7);assert.equal(waiting.length,2);assert.deepEqual(waiting.map(p=>p.queuePosition),[1,2]);
 assert.deepEqual(active.map(p=>p.slot).sort((a,b)=>a-b),[0,1,2,3,4,5,6],'seven distinct server slots');
 assert.ok(waiting.every(p=>p.slot===null),'waiters have no active color');
 assert.equal(new Set(joined.map(r=>r.data.token)).size,9);assert.ok(active.every(p=>p.token.length>=32));
 assert.equal((await call('join',{name:'Overflow'})).status,503);
 const resumed=(await call('join',{token:active[0].token,slot:6})).data;
 assert.equal(resumed.playerId,active[0].playerId,'reconnect keeps seat');assert.equal(resumed.slot,active[0].slot,'reconnect retains server slot and ignores override');
 const state={x:-2900,y:120,z:-1200,heading:1.5,speed:20,lean:.1,pitch:-.15,animation:'ride',score:150,checkpoint:2};
 let response=await call('state',{token:active[0].token,slot:6,state:{...state,slot:6}});assert.equal(response.status,200);
 assert.equal(response.data.slot,active[0].slot,'state update cannot override slot');
 assert.equal(response.data.players.find(p=>p.id===active[0].playerId).slot,active[0].slot);
 assert.deepEqual(response.data.players.find(p=>p.id===active[0].playerId).state,state);
 assert.ok(response.data.players.every(p=>!('token' in p)),'never reveal peer session tokens');
 assert.equal((await call('state',{token:active[0].token,state})).status,429);
 time+=50;
 for(const invalid of [{...state,x:Infinity},{...state,y:90000},{...state,speed:'20'},{...state,animation:'execute'},{...state,checkpoint:-1}])assert.equal((await call('state',{token:active[0].token,state:invalid})).status,400);
 assert.equal((await call('state',{token:'wrong'})).status,401);
 assert.equal((await call('join',{}, {Origin:'https://different.example'})).status,403);
 assert.equal((await call('join',{name:'x'.repeat(5000)})).status,413);
 assert.equal((await fetch(base+'/api/multiplayer/state')).status,405);
 const chunkStatus=await new Promise((resolve,reject)=>{const req=request(base+'/api/multiplayer/join',{method:'POST',headers:{'Content-Type':'application/json'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.write('{"name":"');req.write('x'.repeat(2500));req.write('y'.repeat(2500));req.end('"}');});
 assert.equal(chunkStatus,413,'chunked request cannot bypass body limit');
 // A waiter cannot send a visible active transform before promotion.
 response=await call('state',{token:waiting[0].token,state});assert.equal(response.data.status,'waiting');assert.equal(response.data.players.length,7);
 assert.equal((await call('leave',{token:active[0].token})).status,200);
 time+=50;
 response=await call('state',{token:waiting[0].token});assert.equal(response.data.status,'active');assert.equal(response.data.queuePosition,0);assert.equal(response.data.players.length,7);
 assert.equal(response.data.players.find(p=>p.id===waiting[0].playerId).state,null);
 assert.equal(response.data.slot,active[0].slot,'FIFO waiter receives freed slot');
 assert.equal(new Set(response.data.players.map(p=>p.slot)).size,7,'promotion retains unique peer slots');
 for(const peer of active.slice(1))assert.equal(response.data.players.find(p=>p.id===peer.playerId).slot,peer.slot,'other active colors remain stable');
 assert.equal((await call('state',{token:waiting[1].token})).data.queuePosition,1);
 assert.equal((await call('leave',{token:active[0].token})).status,401);
 // Only keep the remaining waiter alive; stale active peers expire before admission.
 time+=14000;await call('state',{token:waiting[1].token});time+=1100;
 response=await call('state',{token:waiting[1].token});assert.equal(response.data.status,'active');assert.equal(response.data.players.length,1);assert.equal(response.data.slot,0,'expiry promotion uses lowest free slot');
 assert.equal((await call('join',{token:active[1].token})).status,401);
 const newcomer=await call('join',{name:'Fresh'});assert.equal(newcomer.data.status,'active');assert.equal(newcomer.data.players.length,2);assert.equal(newcomer.data.slot,1,'new join uses next free slot');
 // Expired waiting tickets are removed too, not silently reserved forever.
 time+=15001;
 response=await call('join',{name:'After timeout'});assert.equal(response.data.players.length,1);
 assert.equal(response.data.status,'active');
 const batch=await Promise.all(Array.from({length:7},()=>call('join',{})));const staleWaiter=batch.find(r=>r.data.status==='waiting').data;time+=15001;assert.equal((await call('state',{token:staleWaiter.token})).status,401,'waiting heartbeat also expires');
 console.log(JSON.stringify({result:'PASS',capacity:7,concurrentClients:9,checks:['seven-player admission','unique authoritative colors','stable reconnect slots','FIFO slot reuse','bounded FIFO wait','promotion','expiry/reconnect','20Hz cap','finite state validation','body limit','same origin','token privacy','leave cleanup']}));
}finally{await new Promise(resolve=>server.close(resolve));server.closeAllConnections();}
