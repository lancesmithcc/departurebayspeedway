// game.js — state machine, input, checkpoints, HUD, minimap, overlays
import * as THREE from 'three';
import { clamp, lerp, damp, rand, choice, CFG } from './util.js';
import { buildGates } from './effects.js';
import { BarThrower } from './nanaimo.js';
import { KINDS } from './powerups.js';
import { loadBoard, qualifies, submit, renderBoard, sanitiseName, NAME_MAX } from './leaderboard.js';

// The first gate used to sit on top of the start line, and since the beam is a 12 m
// translucent cylinder you began the race standing *inside* it — which read as a
// great pale roof hanging over the forecourt. It now sits a little way down the road.
const GATE_FRACTIONS = [0.07, 0.18, 0.3, 0.44, 0.58, 0.7, 0.78, 0.84];
const PAR_TIME = 150; // seconds

export class Game {
  constructor(map, terrain, player, traffic, effects, skyWater, audio, camera, refs) {
    this.map = map;
    this.terrain = terrain;
    this.player = player;
    this.traffic = traffic;
    this.effects = effects;
    this.skyWater = skyWater;
    this.audio = audio;
    this.camera = camera;
    this.refs = refs; // { buildCollide, corridor, peds, powerups, baptist, apocalypse, zones }
    this.peds = refs.peds || null;
    // school zones and the church, each announced once per run as the rider arrives
    this.zones = (refs.zones || []).map(z => ({ ...z, done: false }));
    this.powerups = refs.powerups || null;
    this.pedsHit = 0;
    this.state = 'title'; // title | riding | crashed | finished
    this.input = { throttle: 0, brake: 0, steer: 0, hop: false, jump: false };
    this.trickText = '';
    this.trickT = 0;
    this.time = 0;
    this.closeCalls = 0;
    this.captionText = '';
    this.gullT = rand(3, 8);
    this.hornDone = false;
    this.splashDone = false;
    this.finishT = 0;
    this.crashT = 0;
    this.fractions = GATE_FRACTIONS;
    this.demo = new URLSearchParams(location.search).has('demo');
    this.debug = this.demo || new URLSearchParams(location.search).has('debug');
    this.schoolView = new URLSearchParams(location.search).has('school');

    // route helpers
    const route = map.route;
    this.routePts = route;
    this.routeCum = [0];
    for (let i = 1; i < route.length; i++) {
      this.routeCum.push(this.routeCum[i - 1] + Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]));
    }
    this.routeTotal = this.routeCum[this.routeCum.length - 1];

    // start position: route point nearest the Circle K
    const ck = map.circleK;
    let bestI = 0, bestD = Infinity;
    route.forEach((p, i) => {
      const d = Math.hypot(p[0] - ck[0], p[1] - ck[1]);
      if (d < bestD) { bestD = d; bestI = i; }
    });
    const ahead = route[Math.min(route.length - 1, bestI + 4)];
    this.corridor = refs.corridor;
    this.startPos = this.corridor ? this.corridor.laneCenter(bestI) : route[bestI];
    this.startHeading = Math.atan2(-(ahead[0] - this.startPos[0]), -(ahead[1] - this.startPos[1]));

    // gates
    const gatePos = GATE_FRACTIONS.map(f => this.routeAt(f, true));
    this.gates = buildGates(refs.scene, gatePos, terrain);
    this.nextGate = 0;

    // Nanaimo bar combat
    this.bars = new BarThrower(refs.scene, {
      traffic, effects, audio,
      onHit: (car) => this.onBarHit(car),
      peds: refs.peds || null,
      onPedHit: (ped) => this.onPedSplat(ped),
    });
    if (this.peds) this.peds.onBump = (ped, speed) => this.onPedBump(ped, speed);
    if (this.powerups) this.powerups.onPickup = (kind, ended) => this.onPowerup(kind, ended);
    traffic.onCarCrash = (car, justDied) => this.onCarWreck(car, justDied);

    this.buildMinimap();
    this.bindInput();
    if (this.demo) {
      const d = document.createElement('div');
      d.id = 'inputprobe';
      d.style.cssText = 'position:fixed;bottom:0;left:0;z-index:998;background:#032;color:#8f8;font:11px monospace;padding:2px 6px;pointer-events:none;';
      document.body.appendChild(d);
    }
    this.el = {
      title: document.getElementById('title'),
      loading: document.getElementById('loading'),
      finish: document.getElementById('finish'),
      crash: document.getElementById('crash'),
      hud: document.getElementById('hud'),
      speed: document.getElementById('speed'),
      timer: document.getElementById('timer'),
      gates: document.getElementById('gates'),
      caption: document.getElementById('caption'),
      arrow: document.getElementById('arrow'),
      arrowDist: document.getElementById('arrow-dist'),
      closecall: document.getElementById('closecall'),
      ringsHud: document.getElementById('rings'),
      statsTime: document.getElementById('stat-time'),
      statsRings: document.getElementById('stat-rings'),
      statsCalls: document.getElementById('stat-calls'),
      statsSpeed: document.getElementById('stat-speed'),
      statsPar: document.getElementById('stat-par'),
      minimap: document.getElementById('minimap'),
      trick: document.getElementById('trick'),
      score: document.getElementById('score'),
      statsTricks: document.getElementById('stat-tricks'),
      statsPeds: document.getElementById('stat-peds'),
      power: document.getElementById('power'),
      powerLabel: document.getElementById('power-label'),
      powerBar: document.getElementById('power-bar'),
      lbEntry: document.getElementById('lb-entry'),
      lbName: document.getElementById('lb-name'),
      lbRows: document.getElementById('lb-rows'),
      lbPrompt: document.getElementById('lb-prompt'),
      lbSave: document.getElementById('lb-save'),
    };
    this.el.title.classList.remove('hidden');
  }

  routeAt(frac, onLane = false) {
    const target = frac * this.routeTotal;
    let i = 1;
    while (i < this.routeCum.length - 1 && this.routeCum[i] < target) i++;
    return onLane && this.corridor ? this.corridor.laneCenter(i) : this.routePts[i];
  }

  // ---------------- minimap ----------------
  buildMinimap() {
    const S = 1024;
    const off = document.createElement('canvas');
    off.width = off.height = S;
    const g = off.getContext('2d');
    const W = CFG.world;
    const toMap = (x, z) => [
      (x - W.terrainMinX) / (W.terrainMaxX - W.terrainMinX) * S,
      (z - W.terrainMinZ) / (W.terrainMaxZ - W.terrainMinZ) * S,
    ];
    // land mask
    g.fillStyle = '#0e1a24';
    g.fillRect(0, 0, S, S);
    const step = 8;
    for (let my = 0; my < S; my += step) {
      for (let mx = 0; mx < S; mx += step) {
        const x = W.terrainMinX + mx / S * (W.terrainMaxX - W.terrainMinX);
        const z = W.terrainMinZ + my / S * (W.terrainMaxZ - W.terrainMinZ);
        if (this.terrain.seaSignedDist(x, z) > 0) {
          g.fillStyle = '#25313a';
          g.fillRect(mx, my, step, step);
        }
      }
    }
    // roads
    g.strokeStyle = '#4d5a66';
    g.lineWidth = 1.2;
    for (const r of this.map.roads) {
      if (r.w < 5.5) continue;
      g.beginPath();
      r.p.forEach((p, i) => {
        const [mx, my] = toMap(p[0], p[1]);
        i ? g.lineTo(mx, my) : g.moveTo(mx, my);
      });
      g.stroke();
    }
    // route
    g.strokeStyle = '#ff9b2f';
    g.lineWidth = 2.6;
    g.beginPath();
    this.routePts.forEach((p, i) => {
      const [mx, my] = toMap(p[0], p[1]);
      i ? g.lineTo(mx, my) : g.moveTo(mx, my);
    });
    g.stroke();
    this.minimapBake = off;
    this.toMap = toMap;
  }

  drawMinimap() {
    const cv = this.el.minimap;
    const g = cv.getContext('2d');
    const S = cv.width;
    const p = this.player.pos;
    const span = 1500; // meters visible
    const W = CFG.world;
    const worldW = W.terrainMaxX - W.terrainMinX;
    const pxPerM = S / span;
    const scale = (S / worldW) / (1 / span) * (span / worldW); // bake px per meter
    const bakePxPerM = S / worldW * (worldW / span) / 1;
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath();
    const R = S / 2 - 4;
    g.arc(S / 2, S / 2, R, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#0e1a24';
    g.fillRect(0, 0, S, S);
    // draw baked map scaled around player
    const k = (S / span) / (S / worldW); // zoom factor vs bake
    const [pmx, pmy] = this.toMap(p.x, p.z);
    g.drawImage(this.minimapBake,
      pmx - (S / 2) / k, pmy - (S / 2) / k, S / k, S / k,
      0, 0, S, S);
    // gates
    for (let i = 0; i < this.gates.length; i++) {
      const gate = this.gates[i];
      const [gx, gy] = this.toMap(gate.pos.x, gate.pos.z);
      const sx = (gx - pmx) * k + S / 2, sy = (gy - pmy) * k + S / 2;
      if (sx < -10 || sx > S + 10 || sy < -10 || sy > S + 10) continue;
      g.fillStyle = i < this.nextGate ? '#3adf6e' : '#ffd23f';
      g.beginPath();
      g.arc(sx, sy, 4.5, 0, Math.PI * 2);
      g.fill();
    }
    // ramp + rings
    const rmp = this.effects.ramp;
    const [rx, ry] = this.toMap(rmp.base.x, rmp.base.y);
    const sx = (rx - pmx) * k + S / 2, sy = (ry - pmy) * k + S / 2;
    g.fillStyle = '#ff4b1f';
    g.beginPath();
    g.moveTo(sx, sy - 7); g.lineTo(sx + 6, sy + 5); g.lineTo(sx - 6, sy + 5);
    g.closePath(); g.fill();
    // player arrow
    const θ = this.player.heading;
    g.save();
    g.translate(S / 2, S / 2);
    g.rotate(θ + Math.PI);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -8); g.lineTo(5.5, 7); g.lineTo(0, 4); g.lineTo(-5.5, 7);
    g.closePath(); g.fill();
    g.restore();
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(S / 2, S / 2, R, 0, Math.PI * 2);
    g.stroke();
  }

  // ---------------- input ----------------
  bindInput() {
    this.keys = {};
    // input probe overlay: dev aid, only with ?debug (or ?demo)
    const probe = () => {
      if (!this.debug) return;
      let d = document.getElementById('inputprobe');
      if (!d) {
        d = document.createElement('div');
        d.id = 'inputprobe';
        d.style.cssText = 'position:fixed;bottom:0;left:0;z-index:998;background:#032;color:#8f8;font:11px monospace;padding:2px 6px;pointer-events:none;';
        document.body.appendChild(d);
      }
      d.textContent = 'input ok ' + performance.now().toFixed(0);
    };
    window.addEventListener('keydown', (e) => {
      probe();
      this.audio.init();          // first gesture unlocks WebAudio + the soundtrack
      if (e.repeat) return;
      this.keys[e.code] = true;
      this.onKey(e.code);
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('pointerdown', () => {
      probe();
      this.audio.init();
      if (this.state === 'title') this.startRide();
    });
  }

  onKey(code) {
    // While the board is asking for a name the keyboard belongs to the input box —
    // R would respawn and M would mute in the middle of typing "RAMBO M".
    if (this.namingOpen) {
      if (code === 'Enter') this.submitName();
      return;
    }
    if (code === 'Enter') {
      if (this.state === 'title') this.startRide();
      else if (this.state === 'finished') this.restart();
    }
    if (code === 'KeyR') {
      if (this.state === 'riding') this.respawn();
      else if (this.state === 'crashed') this.respawn();
      else if (this.state === 'finished') this.restart();
    }
    if (code === 'Space') {
      this._jumpEdge = true;
    }
    if (code === 'KeyW' || code === 'ArrowUp') {
      // double-tap throttle = pop a wheelie
      const now = performance.now();
      if (now - (this._lastW || 0) < 330) this.player.startWheelie();
      this._lastW = now;
    }
    if (code === 'KeyF') {
      if (this.state === 'riding') this.bars.throw(this.player);
    }
    if (code === 'KeyC') {
      this.player.cameraMode = (this.player.cameraMode + 1) % 3;
    }
    if (code === 'KeyM') {
      this.audio.setMuted(!this.audio.muted);
    }
  }

  readInput() {
    const k = this.keys;
    const thr = (k['KeyW'] || k['ArrowUp']) ? 1 : 0;
    const brk = (k['KeyS'] || k['ArrowDown']) ? 1 : 0;
    let steer = 0;
    if (k['KeyA'] || k['ArrowLeft']) steer += 1;
    if (k['KeyD'] || k['ArrowRight']) steer -= 1;
    this.input.throttle = thr;
    this.input.brake = brk;
    this.input.steer = steer;
    this.input.hop = !!(k['Space']);
    // a crate of bars turns F from a tap into a trigger
    if (this.state === 'riding' && k['KeyF'] && this.powerups && this.powerups.barCooldown) {
      this.bars.throw(this.player, this.powerups.barCooldown);
    }
    this.input.jump = this._jumpEdge;      // one frame per Space press
    this._jumpEdge = false;
    this.player._input = this.input;
    if (this.demo && this.state === 'riding') this.autopilot();
  }

  autopilot() {
    // pure-pursuit along the stitched route (roads), then onto the ramp
    const p = this.player.pos;
    if (this._routeIdx === undefined) this._routeIdx = 0;
    const pts = this.routePts;
    // advance nearest route index (search a window ahead/behind)
    let best = this._routeIdx, bestD = Infinity;
    for (let i = Math.max(0, this._routeIdx - 6); i < Math.min(pts.length, this._routeIdx + 26); i++) {
      const d = Math.hypot(pts[i][0] - p.x, pts[i][1] - p.z);
      if (d < bestD) { bestD = d; best = i; }
    }
    this._routeIdx = best;
    let target;
    const rmp = this.effects.ramp;
    const distToRamp = Math.hypot(rmp.base.x - p.x, rmp.base.y - p.z);
    if (this._routeIdx > pts.length - 10 || (distToRamp < 90 && this.nextGate >= this.gates.length - 1)) {
      // final: aim down the ramp
      target = { x: rmp.base.x + rmp.dir.x * rmp.len, z: rmp.base.y + rmp.dir.y * rmp.len };
    } else {
      const ahead = Math.min(pts.length - 1, this._routeIdx + 12);
      const lp = this.corridor ? this.corridor.laneCenter(ahead) : pts[ahead];
      target = { x: lp[0], z: lp[1] };
    }
    const θt = Math.atan2(-(target.x - p.x), -(target.z - p.z));
    let diff = θt - this.player.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    let steer = clamp(diff * 1.0, -0.6, 0.6);
    let throttle = Math.abs(diff) > 2 ? 0.1 : 1;
    // dodge traffic: cars ahead in a narrow cone
    const fx = -Math.sin(this.player.heading), fz = -Math.cos(this.player.heading);
    const rx = Math.cos(this.player.heading), rz = -Math.sin(this.player.heading);
    let dodge = 0, danger = 0;
    for (const car of this.traffic.cars) {
      if (!car.active) continue;
      const dx = car.x - p.x, dz = car.z - p.z;
      const ahead = dx * fx + dz * fz;
      const lat = dx * rx + dz * rz;
      if (ahead > 2 && ahead < 26 && Math.abs(lat) < 3.4) {
        danger = Math.max(danger, 1 - ahead / 26);
        dodge += lat >= 0 ? -1 : 1; // steer to the side with room
      }
    }
    if (danger > 0) {
      // prefer to pass on the side with corridor room left, and only lift when it is
      // genuinely blocked — otherwise the bot just tailgates the whole way down
      let bias = dodge;
      if (this.corridor) {
        const pr = this.corridor.project(p.x, p.z);
        const room = pr.hw - Math.abs(pr.lat);
        if (room < 2.5) bias = -Math.sign(pr.lat) || bias;
      }
      steer = clamp(steer + Math.sign(bias || 1) * (0.35 + danger * 0.55), -0.6, 0.6);
      throttle = danger > 0.85 ? 0.35 : throttle;
    }
    this.input.steer = steer;
    this.input.throttle = throttle;
    this.input.brake = 0;
    // demo flavour: wheelies on straights, bars at oncoming traffic
    this._demoT = (this._demoT || 0) + 1;
    if (this._demoT % 420 === 0 && this.player.v > 8 && Math.abs(steer) < 0.2) {
      this.player.startWheelie();
    }
    if (this._demoT % 300 === 0 && this.bars.ready) {
      for (const car of this.traffic.cars) {
        if (!car.active || car.crashed) continue;
        const d = Math.hypot(car.x - p.x, car.z - p.z);
        if (d > 18 && d < 70) { this.bars.throw(this.player); break; }
      }
    }
  }

  // ---------------- state ----------------
  startRide() {
    try {
      this.audio.init();
      if (this.audio.ctx && this.audio.ctx.state === 'suspended') this.audio.ctx.resume();
    } catch (e) { /* autoplay policy — will retry on first input */ }
    this.state = 'riding';
    this.el.title.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    this.player.cameraMode = 0;
    this.player.reset(this.startPos, this.startHeading);
    this.time = 0;
    this.closeCalls = 0;
    this.nextGate = 0;
    this.effects.ringsHit = 0;
    this.player.trickScore = 0;
    this.pedsHit = 0;
    if (this.peds) this.peds.reset();
    if (this.powerups) this.powerups.reset();
    this.closeNaming();
    if (this.el.score) this.el.score.textContent = '0';
    if (this.el.trick) this.el.trick.classList.add('hidden');
    this.audio.setMusic(true);
    this.gates.forEach(g => g.passed = false);
    this.effects.rings.forEach(r => { r.hit = false; r.fire.material.color.set(0xff8830); });
    this.splashDone = false;
    this.hornDone = false;
    for (const z of this.zones) z.done = false;
    this._routeIdx = 0;
    this.bars.reset();
    if (this.demo) {
      this.traffic.routePref = 0.05; // sparse oncoming traffic for the autopilot
      this.traffic.crashRel = 13;
    }
    this.setCaption('Rip down Departure Bay Road — watch for traffic!', 4.5);
    this.audio.voice('intro', 0.95, 0.55, 4);
    setTimeout(() => { if (this.state === 'riding') this.audio.voice('intro2', 0.8, 0.55, 4); }, 3400);
  }

  restart() {
    this.el.finish.classList.add('hidden');
    this.startRide();
  }

  respawn() {
    const gateIdx = Math.max(0, this.nextGate - 1);
    const gp = this.gates[gateIdx] ? this.gates[gateIdx].pos : null;
    const p = gp ? [gp.x, gp.z] : this.startPos;
    // face along the route at the respawn point
    let ni = 0, nd = Infinity;
    this.routePts.forEach((rp, i) => {
      const d = Math.hypot(rp[0] - p[0], rp[1] - p[1]);
      if (d < nd) { nd = d; ni = i; }
    });
    const ahead = this.routePts[Math.min(this.routePts.length - 1, ni + 5)];
    const heading = ahead ? Math.atan2(-(ahead[0] - p[0]), -(ahead[1] - p[1])) : this.startHeading;
    const lane = this.corridor ? this.corridor.laneCenter(ni) : p;
    this.player.reset(lane, heading);
    // clear the road right around the respawn so the rider isn't instantly re-hit
    for (const car of this.traffic.cars) {
      if (!car.active) continue;
      const sm = this.traffic.sample(car.path, car.s);
      if (Math.hypot(sm.x - lane[0], sm.z - lane[1]) < 55) car.active = false;
    }
    // reset route pursuit to the respawn area
    let rIdx = 0, rBest = Infinity;
    this.routePts.forEach((rp, i) => {
      const d = Math.hypot(rp[0] - p[0], rp[1] - p[1]);
      if (d < rBest) { rBest = d; rIdx = i; }
    });
    this._routeIdx = rIdx;
    this.state = 'riding';
    this.el.crash.classList.add('hidden');
  }

  onTrick(name, points, total) {
    this.trickText = `${name}  +${points}`;
    this.trickT = 1.8;
    this.audio.trickSting(points > 900 ? 2 : points > 400 ? 1 : 0);
    if (this.el.trick) {
      this.el.trick.textContent = this.trickText;
      this.el.trick.classList.remove('hidden');
    }
    if (this.el.score) this.el.score.textContent = total.toLocaleString();
  }

  onJump() {
    this.audio.jump();
  }

  onBarHit(car) {
    // a bar landed: score, popup, and the driver has opinions
    const pts = 75;
    this.player.trickScore += pts;
    if (this.el.score) this.el.score.textContent = this.player.trickScore.toLocaleString();
    this.trickText = `NANAIMO'D!  +${pts}`;
    this.trickT = 1.6;
    if (this.el.trick) {
      this.el.trick.textContent = this.trickText;
      this.el.trick.classList.remove('hidden');
    }
    this.audio.reaction();
  }

  onPedSplat(ped) {
    this.pedsHit++;                 // a bar counts the same as a front wheel
    // The second hit on him is scored by onSatanSlain, not here: this is the fall, and
    // it has already been paid for once.
    if (ped && ped.risen) return;
    const holy = ped && ped.name === 'jesus';
    const pts = holy ? 1000 : 120;
    this.player.trickScore += pts;
    if (this.el.score) this.el.score.textContent = this.player.trickScore.toLocaleString();
    this.trickText = holy
      ? `NANAIMO'D THE SON OF MAN  +${pts}`
      : `NANAIMO'D A PEDESTRIAN!  +${pts}`;
    this.trickT = holy ? 3 : 1.8;
    if (holy) this.setCaption('YOU PUT DOWN THE SON OF MAN — SOMETHING IS GETTING UP', 3.4);
    if (this.el.trick) {
      this.el.trick.textContent = this.trickText;
      this.el.trick.classList.remove('hidden');
    }
  }

  onPedBump(ped, speed) {
    this.pedsHit++;
    if (ped && ped.risen) return;   // see onPedSplat: the slaying carries its own score
    const holy = ped && ped.name === 'jesus';
    const pts = holy ? 1000 : 60 + Math.round(Math.min(240, speed * 9));
    this.player.trickScore += pts;
    if (this.el.score) this.el.score.textContent = this.player.trickScore.toLocaleString();
    const label = holy ? 'YOU RAN OVER JESUS — HE FELL' :
      speed > 22 ? 'BOWLED THEM OVER!' : speed > 11 ? 'FLATTENED A PEDESTRIAN!' : 'EXCUSE ME!';
    this.trickText = `${label}  +${pts}`;
    this.trickT = holy ? 3 : 1.5;
    if (holy) this.setCaption('YOU PUT DOWN THE SON OF MAN — SOMETHING IS GETTING UP', 3.4);
    if (this.el.trick) {
      this.el.trick.textContent = this.trickText;
      this.el.trick.classList.remove('hidden');
    }
  }

  // And put back down. The sky, the crowd and the fire all go back where they were;
  // the body stays where it landed.
  onSatanSlain() {
    const pts = 5000;
    this.player.trickScore += pts;
    if (this.el.score) this.el.score.textContent = this.player.trickScore.toLocaleString();
    this.trickText = `YOU KILLED THE DEVIL  +${pts}`;
    this.trickT = 3.6;
    if (this.el.trick) {
      this.el.trick.textContent = this.trickText;
      this.el.trick.classList.remove('hidden');
    }
    this.setCaption('THE SKY COMES BACK — DEPARTURE BAY IS QUIET AGAIN', 4);
    this.audio.trickSting && this.audio.trickSting(1);
  }

  // He got back up, and the lawn went with him.
  onSatanRisen() {
    const pts = 2000;
    this.player.trickScore += pts;
    if (this.el.score) this.el.score.textContent = this.player.trickScore.toLocaleString();
    this.trickText = `HE IS RISEN — AS SOMETHING ELSE  +${pts}`;
    this.trickT = 3.4;
    if (this.el.trick) {
      this.el.trick.textContent = this.trickText;
      this.el.trick.classList.remove('hidden');
    }
    this.setCaption('THE SKY IS RED AND IT IS RAINING FIRE — PUT HIM DOWN AGAIN', 4.2);
    this.audio.trickSting && this.audio.trickSting(1);
  }

  onBounce(x, y, z) {
    this.audio.jump();
    this.setCaption(choice([
      'BOING!', 'Off the bouncy castle!', 'Praise be — AIR!',
    ]), 1.3);
    if (this.effects) this.effects.dust(x, y + 0.2, z, 6);
  }

  onPowerup(kind, ended) {
    if (kind) {
      const def = KINDS[kind];
      this.setCaption(def.caption, 3);
      this.audio.trickSting(1);
      if (this.el.power) {
        this.el.power.classList.remove('hidden');
        this.el.powerLabel.textContent = def.label;
        this.el.power.style.setProperty('--pw', '#' + def.colour.toString(16).padStart(6, '0'));
      }
    } else if (ended) {
      if (this.el.power) this.el.power.classList.add('hidden');
      if (ended === 'beer') this.setCaption('Sobered up. Steering back.', 1.6);
    }
  }

  onCarWreck(car, justDied) {
    // smoke off the wrecked car as it stops off the road
    this.effects.smoke.emit(car.x, car.y + 1.2, car.z, rand(-0.4, 0.4), rand(1.2, 2.4), rand(-0.4, 0.4),
      rand(1.2, 2.2), rand(1.5, 3.2), 0.22, 0.2, 0.18, -0.6, 0.985);
    if (justDied) {
      this.effects.sparks(car.x, car.y + 0.5, car.z, 8);
      this.audio.crash();
    }
  }

  onRail(x, y, z, force) {
    this.audio.scrape();
    this.effects.sparks(x, y, z, Math.min(14, 4 + force * 12));
  }

  onCrash(reason) {
    if (this.state !== 'riding') return;
    this.lastCrash = reason;
    this._nc = (this._nc || 0) + 1;
    this.state = 'crashed';
    this.crashT = 0;
    this.audio.crash();
    this.audio.duckMusic(0.3, 1.8);
    this.effects.sparks(this.player.pos.x, this.player.pos.y, this.player.pos.z, 26);
  }

  onWater() {
    if (this.state !== 'riding') return;
    const rmp = this.effects.ramp;
    const rel = { x: this.player.pos.x - rmp.base.x, z: this.player.pos.z - rmp.base.y };
    const u = rel.x * rmp.dir.x + rel.z * rmp.dir.y;
    if (u > rmp.len * 0.5) {
      // SPLASH finish
      this.state = 'finished';
      this.finishT = 0;
      if (!this.splashDone) {
        this.splashDone = true;
        this.effects.splash(this.player.pos.x, 0.5, this.player.pos.z, true);
        this.audio.splash();
      }
    } else {
      // drowned the bike before the ramp
      this.setCaption('The rings are THAT way! (Respawning…)', 2.5);
      this.respawn();
    }
  }

  setCaption(text, dur = 3) {
    this.captionText = text;
    this.captionT = dur;
    this.el.caption.textContent = text;
    this.el.caption.classList.remove('hidden');
  }

  // ---------------- per-frame ----------------
  update(dt, time) {
    this.readInput();

    const riding = this.state === 'riding';
    const playerActive = riding;

    if (this.state === 'title') {
      this.player.cameraMode = 3;
    } else {
      if (this.player.cameraMode === 3) this.player.cameraMode = 0;
    }

    // powerups: the modifiers have to land on the bike before its physics runs
    if (this.powerups) {
      this.powerups.update(dt, this.player, riding);
      this.player.mods = this.powerups.modifiers();
    }

    // player physics (runs in all states for crash tumble / finish float)
    this.player.setLastInput(this.input);
    this.player.update(dt, riding ? this.input : { throttle: 0, brake: 1, steer: 0, hop: false }, );

    // people on the sidewalks, the school crossing and the church lawn
    if (this.peds) this.peds.update(dt, this.player.pos, Math.abs(this.player.v));

    // traffic
    this.traffic.update(dt, this.player, playerActive);
    const col = riding ? this.traffic.checkPlayer(this.player, playerActive) : null;
    if (col) {
      if (col.type === 'crash') {
        this.player.crash('car');
        if (Math.random() < 0.45) this.audio.reaction();
      } else if (col.type === 'scrape') {
        this.audio.scrape();
        this.effects.sparks(this.player.pos.x, this.player.pos.y, this.player.pos.z, 10);
      }
    }
    // near-miss events
    if (riding) {
      for (const ev of this.traffic.nearMissEvents) {
        this.closeCalls++;
        this.el.closecall.textContent = `CLOSE CALL +1  (${this.closeCalls})`;
        this.el.closecall.classList.remove('hidden');
        clearTimeout(this._ccT);
        this._ccT = setTimeout(() => this.el.closecall.classList.add('hidden'), 1300);
        if (Math.random() < 0.5) this.audio.horn();
      }
      this.traffic.nearMissEvents.length = 0;
    }

    // effects + rings
    this.effects.update(dt);
    this.bars.update(dt, this.player);
    if (riding) {
      const hits = this.effects.checkRings(this.player);
      if (hits) {
        this.audio.ring();
        if (Math.random() < 0.4) this.audio.voice('ring', 0.8, 0.55, 2);
        this.setCaption(`RING OF FIRE ${this.effects.ringsHit}/3!`, 1.6);
      }
      // dust when offroad
      if (this.player.grounded && this.player.offroad && this.player.v > 6 && Math.random() < 0.6) {
        this.effects.dust(this.player.pos.x, this.player.pos.y, this.player.pos.z, 2);
      }
    }

    // gates
    if (riding) {
      for (let i = this.nextGate; i < this.gates.length; i++) {
        const gate = this.gates[i];
        gate.group.visible = true;
        if (this.player.pos.distanceTo(gate.pos) < 24) {
          gate.passed = true;
          this.nextGate = i + 1;
          this.audio.checkpoint();
          if (i === this.gates.length - 1) {
            this.setCaption('HIT THE RAMP! SEND IT THROUGH THE RINGS OF FIRE!', 4);
            this.audio.voice('sendit', 0.85, 0.55, 2);
          } else {
            this.setCaption(choice([
              'Checkpoint!', 'Nice — keep it pinned!', 'Traffic up ahead!',
              'Follow the orange arrows!', 'Departure Bay dead ahead!',
            ]), 1.8);
          }
          break;
        }
      }
      // hide far gates
      this.gates.forEach((gate, i) => {
        if (!gate.passed && Math.abs(i - this.nextGate) > 1) gate.group.visible = false;
        else if (!gate.passed) gate.group.visible = true;
        // Fade the beam out as you arrive. Standing inside a 12 m translucent
        // cylinder fills the whole screen with a pale slab that reads as a roof.
        const near = this.player.pos.distanceTo(gate.pos);
        const fade = clamp((near - 14) / 22, 0, 1);
        gate.beam.material.opacity = gate.passed ? 0 : (0.08 + Math.sin(time * 3) * 0.03) * fade;
      });

      this.time += dt;
      // ferry horn once near terminal
      if (!this.hornDone && this.player.pos.x > -350 && this.player.pos.z > -80) {
        this.hornDone = true;
        this.audio.ferryHorn();
      }
      // school zones and the church lawn: called out once each, on arrival
      for (const z of this.zones) {
        if (z.done) continue;
        if (Math.hypot(this.player.pos.x - z.x, this.player.pos.z - z.z) > z.r) continue;
        z.done = true;
        if (z.caption) this.setCaption(z.caption, 2.6);
        if (z.voice) this.audio.voice(z.voice, 0.9, 0.55, 2);
      }

      // gulls near shore
      this.gullT -= dt;
      if (this.gullT < 0 && this.terrain.seaSignedDist(this.player.pos.x, this.player.pos.z) < 160) {
        this.gullT = rand(2.5, 7);
        this.audio.gull();
      }
    }

    // crashed state: show overlay after delay
    if (this.state !== 'crashed' && !this.el.crash.classList.contains('hidden')) {
      this.el.crash.classList.add('hidden');     // stale overlay after a respawn
    }
    if (this.state === 'crashed') {
      this.crashT += dt;
      if (this.demo && this.crashT > 2.2) this.respawn();
      if (this.crashT > 1.1 && this.el.crash.classList.contains('hidden')) {
        this.el.crash.classList.remove('hidden');
      }
    }

    // finished state
    if (this.state === 'finished') {
      this.finishT += dt;
      // slow sink + drift
      this.player.vy = Math.max(this.player.vy, -1.2);
      if (this.finishT > 1.4 && this.el.finish.classList.contains('hidden')) {
        this.el.finish.classList.remove('hidden');
        this.el.statsTime.textContent = this.fmtTime(this.time);
        this.el.statsRings.textContent = `${this.effects.ringsHit}/3`;
        this.el.statsCalls.textContent = this.closeCalls;
        this.el.statsSpeed.textContent = `${Math.round(this.player.topSpeed)} km/h`;
        this.el.statsPar.textContent = this.time <= PAR_TIME ? 'CLEARED' : 'MISSED';
        if (this.el.statsTricks) this.el.statsTricks.textContent = this.player.trickScore.toLocaleString();
        if (this.el.statsPeds) this.el.statsPeds.textContent = this.pedsHit;
        this.audio.duckMusic(0.25, 3.2);
        this.audio.missionPassed();
        this.audio.voice('finish', 0.95, 0.55, 4);
        this.openBoard();
      }
      if (Math.random() < 0.2) {
        this.effects.dust(this.player.pos.x + rand(-2, 2), 0.3, this.player.pos.z + rand(-2, 2), 1);
      }
    }

    // camera + audio + hud
    if (this.state === 'title' && !this.schoolView) {
      this.titleCamera(time);
    } else if (this.schoolView) {
      this.player.cameraMode = 3;
      this.player.updateCamera(this.camera, dt, time);
    } else {
      this.player.updateCamera(this.camera, dt, time);
    }
    const seaD = this.terrain.seaSignedDist(this.player.pos.x, this.player.pos.z);
    this.audio.update(dt, this.player, seaD, this.state === 'riding' || this.state === 'crashed');
    this.updateHUD(dt);
    this.skyWater.updateShadow(this.player.pos);
  }

  // ---------------- leaderboard ----------------
  // Ranked by STYLE, tie-broken by time. A run that makes the top ten gets to sign it;
  // everyone else just gets to look at it.
  openBoard() {
    const run = {
      score: this.player.trickScore,
      time: this.time,
      rings: this.effects.ringsHit,
      // crossed the line while the sky was still red: the name gets the mark
      satan: !!(this.refs.apocalypse && this.refs.apocalypse.on),
    };
    this.pendingRun = run;
    const board = loadBoard();
    const made = qualifies(run, board);
    if (this.el.lbRows) renderBoard(this.el.lbRows, board, -1);
    if (!this.el.lbEntry) return;
    if (made && !this.demo) {
      this.namingOpen = true;
      this.el.lbEntry.classList.remove('hidden');
      if (this.el.lbPrompt) this.el.lbPrompt.classList.add('hidden');
      const input = this.el.lbName;
      input.value = '';
      input.maxLength = NAME_MAX;
      // focus after the overlay is actually on screen, or Safari drops it
      setTimeout(() => { try { input.focus(); input.select(); } catch { /* no focus, no problem */ } }, 60);
      input.oninput = () => { input.value = sanitiseName(input.value); };
      // A phone has no ENTER until a field is focused, and even then the return key is
      // whatever that keyboard decided to put there. The button is the reliable path.
      if (this.el.lbSave) {
        this.el.lbSave.onclick = (e) => { e.preventDefault(); e.stopPropagation(); this.submitName(); };
      }
      input.onkeydown = (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' || e.keyCode === 13) { e.preventDefault(); this.submitName(); }
        else if (e.key === 'Escape') { e.preventDefault(); this.skipName(); }
      };
    } else {
      this.el.lbEntry.classList.add('hidden');
      if (this.el.lbPrompt) this.el.lbPrompt.classList.remove('hidden');
    }
  }

  submitName() {
    if (!this.namingOpen || !this.pendingRun) return;
    const name = sanitiseName(this.el.lbName ? this.el.lbName.value : '') || 'RIDER';
    const { board, index } = submit({ ...this.pendingRun, name });
    this.namingOpen = false;
    this.pendingRun = null;
    if (this.el.lbEntry) this.el.lbEntry.classList.add('hidden');
    if (this.el.lbPrompt) this.el.lbPrompt.classList.remove('hidden');
    if (this.el.lbRows) renderBoard(this.el.lbRows, board, index);
    this.audio.checkpoint();
  }

  // walked away from the board without signing it
  skipName() {
    this.namingOpen = false;
    this.pendingRun = null;
    if (this.el.lbEntry) this.el.lbEntry.classList.add('hidden');
    if (this.el.lbPrompt) this.el.lbPrompt.classList.remove('hidden');
    if (this.el.lbName) this.el.lbName.blur();
  }

  closeNaming() {
    this.namingOpen = false;
    this.pendingRun = null;
    if (this.el.lbEntry) this.el.lbEntry.classList.add('hidden');
    if (this.el.lbName) this.el.lbName.blur();
  }

  titleCamera(time) {
    const cam = this.camera;
    const r = this.effects.ramp;
    const a = time * 0.1;
    const cx = r.base.x + r.dir.x * 55;
    const cz = r.base.y + r.dir.y * 55;
    cam.position.set(cx + Math.cos(a) * 95, 16 + Math.sin(time * 0.21) * 7, cz + Math.sin(a) * 95);
    const ring = this.effects.rings[1] ? this.effects.rings[1].center : new THREE.Vector3(cx, 8, cz);
    cam.lookAt(ring.x, ring.y + 2, ring.z);
    cam.fov = 58;
    cam.updateProjectionMatrix();
  }

  fmtTime(t) {
    const m = Math.floor(t / 60), s = Math.floor(t % 60), cs = Math.floor((t * 100) % 100);
    return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  }

  updateHUD(dt) {
    if (this.trickT > 0) {
      this.trickT -= dt;
      if (this.trickT <= 0 && this.el.trick) this.el.trick.classList.add('hidden');
    }
    const el = this.el;
    if (this.demo) {
      const d = document.getElementById('inputprobe');
      if (d) d.textContent = `demo x=${this.player.pos.x.toFixed(0)} z=${this.player.pos.z.toFixed(0)} y=${this.player.pos.y.toFixed(1)} v=${this.player.kmh.toFixed(0)} st=${this.state} g=${this.nextGate} air=${this.player.grounded ? 0 : 1} why=${this.lastCrash || '-'} crashes=${this._nc || 0}`;
    }
    if (this.state === 'title') { this.drawMinimap(); return; }
    el.speed.textContent = Math.round(this.player.kmh);
    el.timer.textContent = this.fmtTime(this.state === 'finished' ? this.time : this.time);
    el.gates.textContent = `${Math.min(this.nextGate, this.gates.length)}/${this.gates.length}`;
    if (this.effects.ringsHit > 0 || this.player.onRamp || this.player.pos.y > 3) {
      el.ringsHud.textContent = `🔥 RINGS ${this.effects.ringsHit}/3`;
      el.ringsHud.classList.remove('hidden');
    }
    // powerup timer
    if (this.el.power && this.powerups) {
      const a = this.powerups.active;
      if (a) {
        this.el.power.classList.remove('hidden');
        this.el.powerBar.style.width = `${clamp(a.t / a.def.time, 0, 1) * 100}%`;
      } else {
        this.el.power.classList.add('hidden');
      }
    }
    // caption fade
    if (this.captionT > 0) {
      this.captionT -= dt;
      if (this.captionT <= 0) el.caption.classList.add('hidden');
    }
    // nav arrow to next gate / ramp
    let target;
    if (this.nextGate < this.gates.length) {
      target = this.gates[this.nextGate].pos;
    } else {
      target = new THREE.Vector3(this.effects.ramp.base.x, 0, this.effects.ramp.base.y);
    }
    const dx = target.x - this.player.pos.x, dz = target.z - this.player.pos.z;
    // relative bearing clockwise from player forward
    const rel = Math.atan2(dx, -dz) + this.player.heading;
    el.arrow.style.transform = `rotate(${(rel * 180 / Math.PI).toFixed(0)}deg)`;
    const dist = Math.hypot(dx, dz);
    el.arrowDist.textContent = dist > 999 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`;
    this.drawMinimap();
  }
}
