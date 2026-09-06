// touch.js — the on-screen controls, for playing this on a phone.
//
// The whole thing writes into `game.keys` and calls `game.onKey()`, which is exactly
// what the keyboard listener does. Nothing downstream — readInput, the wheelie
// double-tap, the air tricks, the bar trigger — knows or cares that a thumb pressed
// it rather than a key, so there is one control path to keep working instead of two.
//
// Steering and throttle live on the device tilt: tilt left/right to steer, tip the
// top edge away to gas, tip it toward you to brake. The pose comes off the motion
// sensor as one gravity vector rather than Euler angles — Euler beta/gamma has a
// gimbal lock exactly where a phone sits in a gaming grip (device top near vertical),
// and that made the throttle flake out on real phones. Tilt is analog: it goes into
// game.tilt (steer/throttle/brake) and readInput blends it over the keys. The buttons
// keep the things a thumb genuinely does better: BAR, JUMP and WHEELIE. Until the
// sensor is up and calibrated — permission denied, no gyroscope, or the ?touch
// desktop fallback — the old thumb buttons stay on screen instead.

const PAD = [
  // side, code, label, class — drive: true stands down once the tilt is in charge
  { side: 'left', code: 'ArrowLeft', label: '◀', cls: 'steer', drive: true },
  { side: 'left', code: 'ArrowRight', label: '▶', cls: 'steer', drive: true },
  { side: 'right', code: 'KeyF', label: 'BAR', cls: 'small' },
  { side: 'right', code: 'KeyW', label: 'WHEELIE', cls: 'small', pop: true, accent: true },
  { side: 'right', code: 'ArrowDown', label: 'BRAKE', cls: 'small', drive: true },
  { side: 'right', code: 'Space', label: 'JUMP', cls: 'small' },
  { side: 'right', code: 'KeyW', label: 'GAS', cls: 'gas', drive: true },
];

// camera, respawn, recalibrate and mute: needed, but not mid-corner, so they get the
// thin strip. LVL re-captures the neutral pose, for when the phone migrates laps.
const UTIL = [
  { code: 'KeyC', label: 'CAM' },
  { code: 'KeyR', label: 'R' },
  { code: 'KeyM', label: 'MUTE' },
];

export function isTouchDevice() {
  const q = new URLSearchParams(location.search);
  if (q.has('touch')) return true;               // force it on, for testing on a desktop
  if (q.has('notouch')) return false;
  // maxTouchPoints alone is wrong: a touchscreen laptop reports plenty of them and
  // then gets a thumb pad it does not want and loses the keyboard legend it does. The
  // question is not "can this thing be touched" but "is touch the only way in".
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const fine = window.matchMedia('(any-pointer: fine)').matches;
  if (!coarse) return false;
  if (!fine) return true;                        // phone or tablet: no mouse anywhere
  // Both: a hybrid. Go by whether the screen is one you hold — a touchscreen laptop
  // has a keyboard attached and should stay on the keyboard path.
  return Math.min(screen.width, screen.height) <= 820;
}

// ---- tilt shaping ----
// deadzone first, then an eased ramp: a small unconscious wobble must be nothing, and
// a hard lean must reach the rail before the wrist gets uncomfortable. Signed — past
// the deadzone it returns the shaped magnitude with its original sign, so gas and
// brake (opposite tips of the same axis) can never both be on. Degrees.
const ROLL_DEAD = 3, ROLL_RANGE = 20;        // full lock at 23° of lean
const TIP_DEAD = 2.5, TIP_RANGE = 8;         // full gas at ~10.5° of tip
const BRAKE_DEAD = 3, BRAKE_RANGE = 10;      // a shade stiffer, so braking is deliberate
const shape = (deg, dead, range) => {
  const x = Math.min(1, Math.max(0, (Math.abs(deg) - dead) / range));
  return Math.sign(deg) * x * x * (3 - 2 * x);    // smoothstep, so the ramp eases in
};
const D = (r) => r * 180 / Math.PI;

// which of the four ways round the content is. The steer sign per angle is not
// guesswork — it was solved against geometry (roll right = the screen's left edge
// rises) and checked for every angle at grips from near-vertical to near-flat.
const STEER_SIGN = { 0: 1, 90: 1, 180: -1, 270: 1 };
const screenAngle = () => {
  const a = (screen.orientation && typeof screen.orientation.angle === 'number')
    ? screen.orientation.angle
    : (window.orientation || 0);
  return ((a % 360) + 360) % 360;
};

// ---- tilt: from motion sensor to game.tilt ----
// game.tilt = { steer, throttle, brake, active }. The sensor hands us
// accelerationIncludingGravity — at rest that is the chair pushing back, which points
// along world-up, so its unit vector IS "up" expressed in the phone's frame. One
// vector yields both controls, with no singularities at any grip angle:
//
//   tip  = asin(up·screen-normal) − baseline.  How flat the glass is versus neutral:
//                                              tipping the top edge away turns the
//                                              glass toward the sky, which is gas.
//                                              Same sign in all four orientations.
//   roll = angle of up's in-glass projection   Which way the phone is leaned, read
//                                              around the glass from the baseline.
//                                              A pure tip slides that projection along
//                                              its own ray, so steering and throttle
//                                              never cross-talk.
//
// The baseline is the average of the first samples after the pad appears (and after
// LVL) — a phone is never held at factory zero, and wherever the hand sits
// comfortably is the pose that should mean "straight and coasting".
function initTilt(game, onActive) {
  const t = game.tilt = { steer: 0, throttle: 0, brake: 0, active: false };
  const q = new URLSearchParams(location.search);

  let up = [0, 0, 1];            // smoothed, device frame; normalized on use
  let base = null;               // neutral up vector
  let sign = 1;                  // +1: platform reports proper acceleration per spec
  let samples = [];
  let pending = true;            // a baseline is wanted (first run, or a recalibrate)
  let driven = false;            // pad told the drive buttons to stand down

  const calibrate = () => { samples = []; pending = true; };
  t.calibrate = calibrate;

  const wrap = (d) => { while (d > 180) d -= 360; while (d < -180) d += 360; return d; };

  const ingest = (raw) => {
    const m = Math.hypot(raw[0], raw[1], raw[2]);
    if (!m) return;
    for (let i = 0; i < 3; i++) up[i] += (raw[i] / m - up[i]) * 0.3;   // jitter smoothing
    const n = Math.hypot(up[0], up[1], up[2]) || 1;
    const g = [up[0] / n * sign, up[1] / n * sign, up[2] / n * sign];
    if (samples.length < 14) samples.push(g);
    if (pending && samples.length >= 14) {
      const avg = [0, 1, 2].map((i) => samples.reduce((s, v) => s + v[i], 0) / samples.length);
      // The spec convention puts +z out of the glass on a face-up phone. In a gaming
      // grip the glass always faces somewhat skyward, so a baseline with negative
      // normal component means the platform reports it inverted — accept either.
      sign = avg[2] < 0 ? -1 : 1;
      base = avg.map((v) => v * sign);
      pending = false;
      t.active = true;                          // stays true through a recalibrate
    }
    if (!t.active || !base) return;
    if (!driven) { driven = true; onActive(true); }
    const tip = D(Math.asin(Math.max(-1, Math.min(1, g[2]))))
              - D(Math.asin(Math.max(-1, Math.min(1, base[2]))));
    const dRoll = wrap(D(Math.atan2(g[1], g[0])) - D(Math.atan2(base[1], base[0])));
    const roll = dRoll * (STEER_SIGN[screenAngle()] ?? 1);
    t.steer = -shape(roll, ROLL_DEAD, ROLL_RANGE);          // steer +1 is left
    t.throttle = Math.max(0, shape(tip, TIP_DEAD, TIP_RANGE));
    t.brake = Math.max(0, shape(-tip, BRAKE_DEAD, BRAKE_RANGE));
  };

  // ?tilt: no sensor needed — the phone leans and tips on a slow figure, so a desk
  // can exercise the whole path, baseline included
  if (q.has('tilt')) {
    t.sim = true;
    const t0 = performance.now();
    const R = (d) => d * Math.PI / 180;
    setInterval(() => {
      const s = (performance.now() - t0) / 1000;
      const V = R(60 + 7 * Math.sin(s * 1.1 + 1.2));        // glass angle from vertical
      const th = R(90 + 16 * Math.sin(s * 0.9));            // lean around the glass
      ingest([Math.sin(V) * Math.cos(th), Math.sin(V) * Math.sin(th), Math.cos(V)]);
    }, 66);
    return t;
  }

  if (!window.DeviceMotionEvent) return t;
  const listen = () => window.addEventListener('devicemotion', (e) => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;               // desktops fire hollow events
    ingest([a.x, a.y, a.z]);
  });
  // iOS 13+ gates the sensors behind a permission ask that has to happen inside a
  // gesture — the same tap that starts the ride is the natural one. Everywhere else
  // the sensor just listens.
  if (typeof window.DeviceMotionEvent.requestPermission === 'function') {
    window.addEventListener('pointerdown', () => {
      window.DeviceMotionEvent.requestPermission()
        .then((state) => { if (state === 'granted') listen(); })
        .catch(() => { /* no tilt, no problem: the thumb pad is still there */ });
    }, { once: true });
  } else {
    listen();
  }
  return t;
}

export function initTouchControls(game) {
  const pad = document.createElement('div');
  pad.id = 'touchpad';
  pad.className = 'hidden';

  const clusters = {
    left: Object.assign(document.createElement('div'), { className: 'tp-cluster tp-left' }),
    right: Object.assign(document.createElement('div'), { className: 'tp-cluster tp-right' }),
  };
  const util = document.createElement('div');
  util.className = 'tp-util';

  // ---- one button ----
  // press() and release() are idempotent per pointer: a cancel after an up (which
  // iOS does on a call or a notification) must not fire the key a second time.
  const wire = (el, code, opts = {}) => {
    let held = null;
    const press = (e) => {
      e.preventDefault();
      e.stopPropagation();                       // or the window handler starts the run
      if (held !== null) return;
      held = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch { /* capture unsupported */ }
      el.classList.add('down');
      game.audio.init();                         // first touch unlocks WebAudio
      game.keys[code] = true;
      game.onKey(code);
      if (opts.pop) game.onKey('KeyE');          // pop now — the double-tap is a keyboard thing
      if (navigator.vibrate && opts.buzz !== false) navigator.vibrate(8);
    };
    const release = (e) => {
      if (held === null || (e && e.pointerId !== held)) return;
      held = null;
      el.classList.remove('down');
      game.keys[code] = false;
    };
    el.addEventListener('pointerdown', press);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    // A capture that gets lost (the browser taking the gesture) has to let the key go
    // too, or it is held down forever.
    el.addEventListener('lostpointercapture', release);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };

  for (const b of PAD) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `tp-btn tp-${b.cls}`;
    if (b.drive) el.classList.add('drive');
    if (b.accent) el.classList.add('wheelie');
    el.textContent = b.label;
    el.setAttribute('aria-label', b.label);
    wire(el, b.code, { pop: b.pop });
    clusters[b.side].appendChild(el);
  }
  for (const u of UTIL) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'tp-btn tp-util-btn';
    el.textContent = u.label;
    el.setAttribute('aria-label', u.label);
    wire(el, u.code, { buzz: false });
    util.appendChild(el);
  }
  // LVL re-takes the neutral pose. Not a key, so it steps outside wire().
  const lvl = document.createElement('button');
  lvl.type = 'button';
  lvl.className = 'tp-btn tp-util-btn';
  lvl.textContent = 'LVL';
  lvl.setAttribute('aria-label', 'recalibrate tilt');
  lvl.addEventListener('pointerdown', (e) => { e.preventDefault(); tilt.calibrate(); });
  lvl.addEventListener('contextmenu', (e) => e.preventDefault());
  util.appendChild(lvl);

  pad.appendChild(clusters.left);
  pad.appendChild(util);
  pad.appendChild(clusters.right);
  document.body.appendChild(pad);

  // ---- tilt ----
  // WHEELIE holds GAS (the trick bails the moment throttle drops, and a thumb holding
  // one button can't also tip the phone), so that button survives tilt and the drive
  // buttons stand down instead. They stay in the DOM — the sensor can be revoked or
  // lost mid-run, and the sync timer is happier never having to rebuild them.
  const tilt = initTilt(game, (on) => {
    pad.classList.toggle('tilt', on);
    // anything the drive buttons still owe gets paid before they vanish
    if (on) for (const b of PAD) if (b.drive) game.keys[b.code] = false;
  });

  // ---- hold the screen in landscape ----
  // A tilt game and auto-rotate do not mix: tipping toward the gas swings the phone
  // through the attitudes where the OS likes to flip the screen over. Android hands
  // the screen over for good once the page is fullscreen, so the ride-start tap asks
  // for both. iPhones expose neither, so there the steer signs simply follow the
  // screen if it does flip.
  const lockLandscape = async () => {
    if (!window.matchMedia('(pointer: coarse)').matches) return;   // desktop QA: hands off
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      await screen.orientation?.lock?.('landscape');
    } catch { /* refused or unsupported — the rotate hint still copes */ }
  };
  window.addEventListener('pointerdown', () => {
    if (game.state === 'title' || game.state === 'finished') lockLandscape();
  });

  // ---- turn it sideways ----
  // Portrait on a phone leaves a letterbox of road under most of a sky. The hint sits
  // above the pad and a media query drops it the moment the aspect ratio goes
  // landscape, so it costs nothing once the phone is the right way round.
  const hint = document.createElement('div');
  hint.id = 'rotate-hint';
  hint.className = 'hidden';
  hint.textContent = 'TURN YOUR PHONE SIDEWAYS';
  document.body.appendChild(hint);

  // ---- when the pad is up ----
  // Only while there is a bike to steer. It is in the way on the title card, it is on
  // top of the Hall of Fame at the end, and while the name box is open the phone's own
  // keyboard has the bottom of the screen anyway.
  // On a timer rather than requestAnimationFrame, to match the game loop: the rest of
  // this app runs on setTimeout precisely so it keeps ticking in a background tab, and
  // rAF is throttled to a stop there. Showing and hiding a pad does not need 60 Hz.
  let shown = null;
  const sync = () => {
    const want = (game.state === 'riding' || game.state === 'crashed') && !game.namingOpen;
    if (want !== shown) {
      shown = want;
      pad.classList.toggle('hidden', !want);
      if (hint) hint.classList.toggle('hidden', !want);
      // Anything still held when the pad goes away stays held forever otherwise.
      if (!want) {
        for (const b of PAD) game.keys[b.code] = false;
        for (const el of pad.querySelectorAll('.down')) el.classList.remove('down');
      } else {
        tilt.calibrate();      // neutral is wherever the hand happens to be holding it now
      }
    }
  };
  sync();
  setInterval(sync, 120);

  // ---- tap to get going again ----
  // The window already starts a run from the title on pointerdown; the end of a run
  // has only ever been ENTER, which a phone does not have until something focuses a
  // text field.
  window.addEventListener('pointerdown', () => {
    if (game.state === 'finished' && !game.namingOpen) game.restart();
  });

  document.body.classList.add('touch');
  // The board's own prompt still says ENTER
  const again = document.getElementById('lb-prompt');
  if (again) again.textContent = 'TAP TO RIDE AGAIN';
  return pad;
}
