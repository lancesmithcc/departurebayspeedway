// touch.js — the on-screen controls, for playing this on a phone.
//
// The whole thing writes into `game.keys` and calls `game.onKey()`, which is exactly
// what the keyboard listener does. Nothing downstream — readInput, the wheelie
// double-tap, the air tricks, the bar trigger — knows or cares that a thumb pressed
// it rather than a key, so there is one control path to keep working instead of two.
//
// Every button captures its own pointer. Without that, sliding a thumb off the gas
// mid-corner sends the pointerup to whatever is underneath and the throttle sticks on
// for the rest of the run.

const PAD = [
  // side, code, label, class
  { side: 'left', code: 'ArrowLeft', label: '◀', cls: 'steer' },
  { side: 'left', code: 'ArrowRight', label: '▶', cls: 'steer' },
  { side: 'right', code: 'KeyF', label: 'BAR', cls: 'small' },
  { side: 'right', code: 'ArrowDown', label: 'BRAKE', cls: 'small' },
  { side: 'right', code: 'Space', label: 'JUMP', cls: 'small' },
  { side: 'right', code: 'KeyW', label: 'GAS', cls: 'gas' },
];

// camera, respawn and mute: needed, but not mid-corner, so they get the thin strip
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
    el.textContent = b.label;
    el.setAttribute('aria-label', b.label);
    wire(el, b.code);
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

  pad.appendChild(clusters.left);
  pad.appendChild(util);
  pad.appendChild(clusters.right);
  document.body.appendChild(pad);

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
