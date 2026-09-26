// gamepad.js — Xbox (and any "standard"-mapped) controller support.
//
// Same philosophy as touch.js: nothing downstream learns a controller exists. The
// analog parts (stick steer, trigger gas and brake) land in game.pad and readInput
// blends them over the keys exactly like the tilt driver; the buttons fire the same
// key codes through game.onKey(), so the wheelie pop, the jump edge, the bar throw
// and the camera cycle stay one code path.
//
// The Gamepad API has no events for buttons — only a snapshot — so poll() runs at the
// top of every readInput and works out the presses by diffing against last frame.
// Browsers also hide pads until a button is pressed on the page (fingerprinting), so
// the first press is what makes one show up at all.
//
//   left stick / d-pad ◀ ▶   steer (and whip in the air)
//   RT                       gas         LT      brake (in the air: flips, like W / S)
//   A                        jump (tap in air = no-hander); starts / restarts a ride
//   X                        pop a wheelie (keep RT held)
//   B                        throw a Nanaimo bar (hold with a crate); skips the name box
//   Y                        camera      d-pad ▲   mute
//   View                     respawn     Menu      start / restart / enter name
//
// On the multiplayer admission panel the pad is a menu pad instead: stick / d-pad
// moves the focus, A presses, B backs out to the title.

// standard mapping indices — https://w3c.github.io/gamepad/#remapping
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

// press → key code, fired once per press through game.onKey
const TAP = [
  [BTN.X, 'KeyE'],
  [BTN.Y, 'KeyC'],
  [BTN.VIEW, 'KeyR'],
  [BTN.MENU, 'Enter'],
  [BTN.UP, 'KeyM'],
];

// An Xbox stick rests a few percent off centre and wanders with age; below this it
// counts as zero. Radial, so a diagonal doesn't eat into the steer range, then
// rescaled so the first bit past the deadzone is a small steer rather than a jump.
const STICK_DEAD = 0.16;
const TRIG_DEAD = 0.06;
const shapeStick = (x) => {
  const a = Math.abs(x);
  if (a < STICK_DEAD) return 0;
  return Math.sign(x) * Math.min(1, (a - STICK_DEAD) / (1 - STICK_DEAD));
};
const shapeTrig = (v) => (v < TRIG_DEAD ? 0 : Math.min(1, (v - TRIG_DEAD) / (1 - TRIG_DEAD)));

export function initGamepad(game) {
  const pad = game.pad = { steer: 0, throttle: 0, brake: 0, hop: false, bar: false, active: false };
  const prev = new Map();         // gamepad index → pressed[] from last poll
  let lastState = game.state;
  let seen = false;

  const val = (gp, i) => {
    const b = gp.buttons[i];
    return b ? (typeof b === 'object' ? b.value : b) : 0;
  };
  const down = (gp, i) => {
    const b = gp.buttons[i];
    return !!b && (typeof b === 'object' ? b.pressed : b > 0.5);
  };

  const rumble = (ms, strong, weak) => {
    for (const gp of navigator.getGamepads?.() || []) {
      if (!gp || !gp.connected) continue;
      const act = gp.vibrationActuator;
      if (act && typeof act.playEffect === 'function') {
        act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak })
          .catch(() => { /* no motors, no problem */ });
      }
    }
  };

  const press = (code) => {
    game.audio.init();              // a controller-only player still wants sound
    game.onKey(code);
  };

  // ---- menu navigation ----
  // d-pad edges, or the left stick crossing half-travel (so a held stick steps once,
  // not once a frame)
  const stickWas = new Map();
  const navDir = (gp, now, was) => {
    const e = (i) => now[i] && !was[i];
    const x = gp.axes[0] || 0, y = gp.axes[1] || 0;
    const dir = Math.abs(x) > 0.5 || Math.abs(y) > 0.5
      ? (Math.abs(x) > Math.abs(y) ? (x > 0 ? 1 : -1) : (y > 0 ? 1 : -1)) : 0;
    const stickEdge = dir !== (stickWas.get(gp.index) || 0) ? dir : 0;
    stickWas.set(gp.index, dir);
    if (e(BTN.LEFT) || e(BTN.UP)) return -1;
    if (e(BTN.RIGHT) || e(BTN.DOWN)) return 1;
    return stickEdge;
  };
  const focusables = (root) => [...root.querySelectorAll('button, input')]
    .filter((el) => !el.disabled && !el.closest('[hidden]') && el.getClientRects().length);
  const moveFocus = (root, dir) => {
    const list = focusables(root);
    if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    const next = i < 0 ? list[0] : list[(i + dir + list.length) % list.length];
    next.focus();
  };
  const activate = (root) => {
    game.audio.init();
    const el = root.contains(document.activeElement) ? document.activeElement : focusables(root)[0];
    if (!el) return;
    if (el.tagName === 'INPUT') {
      // no on-screen keyboard for a pad: an empty name box gets a stand-in the
      // player can change later from a keyboard (it is remembered either way)
      if (!el.value.trim()) el.value = 'Pad Rider ' + (10 + Math.floor(Math.random() * 90));
      el.form?.requestSubmit();
    } else el.click();
  };

  pad.poll = () => {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    let steer = 0, thr = 0, brk = 0, hop = false, bar = false, any = false;

    for (const gp of list) {
      if (!gp || !gp.connected) continue;
      any = true;
      const was = prev.get(gp.index) || [];
      const now = gp.buttons.map((_, i) => down(gp, i));
      const edge = (i) => now[i] && !was[i];

      // ---- analog ----
      // steer +1 is left in this game; stick and d-pad simply add up
      let s = -shapeStick(gp.axes[0] || 0);
      if (now[BTN.LEFT]) s += 1;
      if (now[BTN.RIGHT]) s -= 1;
      if (Math.abs(s) > Math.abs(steer)) steer = Math.max(-1, Math.min(1, s));
      thr = Math.max(thr, shapeTrig(val(gp, BTN.RT)));
      brk = Math.max(brk, shapeTrig(val(gp, BTN.LT)));
      hop = hop || now[BTN.A];
      bar = bar || now[BTN.B];

      // ---- the multiplayer admission panel ----
      // It sits over everything (name box, waiting-room rock-paper-scissors, retry) and
      // is all DOM buttons, so the pad drives it like a console menu instead: move the
      // focus, A to press, B to back out. Nothing reaches the ride underneath.
      const panel = document.querySelector('.room-panel:not([hidden])');
      if (panel) {
        const nav = navDir(gp, now, was);
        if (nav) moveFocus(panel, nav);
        if (edge(BTN.A) || edge(BTN.MENU)) activate(panel);
        if (edge(BTN.B)) panel.querySelector('[data-cancel]')?.click();
        prev.set(gp.index, now);
        seen = true;
        continue;
      }

      // ---- presses ----
      if (edge(BTN.A)) {
        // A is the "go" button on every menu a player has ever seen: on the title card
        // and the end screen it acts as ENTER, in the ride it is SPACE
        if (!game.namingOpen && (game.state === 'title' || game.state === 'finished')) press('Enter');
        else press('Space');
      }
      if (edge(BTN.B)) {
        if (game.namingOpen) game.skipName();
        else press('KeyF');
      }
      for (const [i, code] of TAP) if (edge(i)) press(code);

      if (now.some(Boolean) || s || thr || brk) seen = true;
      prev.set(gp.index, now);
    }

    pad.steer = steer;
    pad.throttle = thr;
    pad.brake = brk;
    pad.hop = hop;
    pad.bar = bar;
    pad.active = any;
    // once a controller is actually being used, swap the on-screen help over to it
    const using = any && seen;
    if (using !== document.body.classList.contains('gamepad')) {
      document.body.classList.toggle('gamepad', using);
      // the end-of-run board has its own prompt, outside the title card's CSS
      const again = document.getElementById('lb-prompt');
      if (again) {
        again.dataset.kb ??= again.textContent;
        again.textContent = using ? 'PRESS Ⓐ TO RIDE AGAIN' : again.dataset.kb;
      }
    }

    // a crash should be felt, not just heard
    if (game.state !== lastState) {
      if (game.state === 'crashed' && any) rumble(420, 1, 0.7);
      lastState = game.state;
    }
  };

  window.addEventListener('gamepaddisconnected', (e) => {
    prev.delete(e.gamepad.index);
  });

  return pad;
}
