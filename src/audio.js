// audio.js — procedural WebAudio: engine, wind, surf, gulls, horns, crashes
export class AudioSys {
  constructor() {
    this.ready = false;
    this.muted = false;
    // the single announcer channel: what is on it, how loudly it outranks the rest,
    // and when it frees up
    this.voiceSrc = null;
    this.voiceGain = null;
    this.voicePriority = 0;
    this.voiceUntil = 0;
  }

  init() {
    if (this.ready) return;
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);

    // ---- noise buffer ----
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    // ---- engine ----
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 800;
    this.engFilter.Q.value = 2.5;
    this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth'; this.osc1.frequency.value = 60;
    this.osc2 = ctx.createOscillator(); this.osc2.type = 'square'; this.osc2.frequency.value = 30;
    const engMix = ctx.createGain(); engMix.gain.value = 0.5;
    this.osc1.connect(engMix); this.osc2.connect(engMix);
    // exhaust noise
    this.exhGain = ctx.createGain(); this.exhGain.gain.value = 0;
    const exhSrc = ctx.createBufferSource(); exhSrc.buffer = buf; exhSrc.loop = true;
    const exhFilter = ctx.createBiquadFilter(); exhFilter.type = 'bandpass'; exhFilter.frequency.value = 220; exhFilter.Q.value = 0.8;
    exhSrc.connect(exhFilter); exhFilter.connect(this.exhGain);
    engMix.connect(this.engFilter); this.engFilter.connect(this.engGain);
    this.exhGain.connect(this.engGain);
    this.engGain.connect(this.master);
    this.osc1.start(); this.osc2.start(); exhSrc.start();

    // ---- wind ----
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    this.windFilter = ctx.createBiquadFilter(); this.windFilter.type = 'lowpass'; this.windFilter.frequency.value = 500;
    const windSrc = ctx.createBufferSource(); windSrc.buffer = buf; windSrc.loop = true;
    windSrc.connect(this.windFilter); this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    windSrc.start();

    // ---- surf (waves near shore) ----
    this.surfGain = ctx.createGain(); this.surfGain.gain.value = 0;
    const surfFilter = ctx.createBiquadFilter(); surfFilter.type = 'lowpass'; surfFilter.frequency.value = 900;
    const surfSrc = ctx.createBufferSource(); surfSrc.buffer = buf; surfSrc.loop = true;
    surfSrc.connect(surfFilter); surfFilter.connect(this.surfGain);
    this.surfGain.connect(this.master);
    surfSrc.start();
    // slow swell LFO
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.35;
    lfo.connect(lfoGain); lfoGain.connect(this.surfGain.gain);
    lfo.start();

    // ---- voice reverb bus ----
    // The announcer and the bystanders are dry Kokoro renders, which sit flat on top
    // of the mix. A short bright plate behind them — pre-delayed so the consonants
    // land dry first — gives the lines the arena bark they were written for.
    this.verbSend = ctx.createGain(); this.verbSend.gain.value = 1;
    this.verbWet = ctx.createGain(); this.verbWet.gain.value = 0.62;
    this.verbPre = ctx.createDelay(0.25); this.verbPre.delayTime.value = 0.055;
    this.verbTone = ctx.createBiquadFilter();
    this.verbTone.type = 'lowpass'; this.verbTone.frequency.value = 3400;
    const verb = ctx.createConvolver();
    verb.buffer = this.impulse(2.4, 2.2);
    this.verb = verb;
    this.verbSend.connect(this.verbPre);
    this.verbPre.connect(verb);
    verb.connect(this.verbTone);
    this.verbTone.connect(this.verbWet);
    this.verbWet.connect(this.master);

    // ---- soundtrack bus (departurbayspeedway.mp3) ----
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.connect(this.master);
    this.musicVol = 0.42;
    // ---- the other soundtrack (satan.mp3) ----
    // Its own bus running in parallel, so the swap is a crossfade of two gains rather
    // than a stop and a start: the road noise never drops into silence mid-corner.
    this.hellGain = ctx.createGain();
    this.hellGain.gain.value = 0;
    this.hellGain.connect(this.master);
    this.hellOn = false;

    this.ready = true;
    this.startMusic();
  }

  // A decaying-noise impulse response: two uncorrelated channels so the tail opens
  // out in stereo instead of doubling the voice down the middle.
  impulse(seconds = 2.4, decay = 2.2) {
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // hold the first few milliseconds back so the tail blooms rather than cracks
        const build = Math.min(1, t * 40);
        d[i] = (Math.random() * 2 - 1) * build * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }

  // The track streams through an <audio> element so the 4 MB file doesn't have to
  // be fully decoded before the first note.
  startMusic() {
    if (!this.ready || this.music) return;
    const el = new Audio('./departurbayspeedway.mp3');
    el.loop = true;
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    this.musicEl = el;
    try {
      this.music = this.ctx.createMediaElementSource(el);
      this.music.connect(this.musicGain);
    } catch {
      this.music = null;          // fall back to the element's own output
    }
    el.volume = this.music ? 1 : this.musicVol;
    this.setMusic(true);
    const play = () => el.play().catch(() => {});
    play();
    // browsers gate playback on a gesture: retry on the next one
    const retry = () => { play(); window.removeEventListener('pointerdown', retry); window.removeEventListener('keydown', retry); };
    window.addEventListener('pointerdown', retry);
    window.addEventListener('keydown', retry);
  }

  setMusic(on, vol = this.musicVol) {
    if (!this.ready) return;
    this.musicVol = vol;
    this.musicOn = on;
    this.applyMusicMix(0.5);
  }

  // ---- which track is playing ----
  // Both elements run the whole time once the second one has been asked for; only the
  // two gains move. Anything that cannot be routed through the graph (a browser that
  // refused createMediaElementSource) falls back to the element's own volume.
  applyMusicMix(ramp = 0.5) {
    if (!this.ready) return;
    const on = this.musicOn !== false && !this.muted;
    const hell = on && this.hellOn;
    const day = on && !this.hellOn;
    const t = this.now();
    this.rampGain(this.music && this.musicGain, day ? this.musicVol : 0, ramp, t);
    if (!this.music && this.musicEl) this.musicEl.volume = day ? this.musicVol : 0;
    this.rampGain(this.hell && this.hellGain, hell ? this.musicVol : 0, ramp, t);
    if (!this.hell && this.hellEl) this.hellEl.volume = hell ? this.musicVol : 0;
  }

  // ---- one authority over a music gain ----
  // Automation events live on the timeline until something clears them. A voice line
  // ducks the track by scheduling a dip *and* a recovery a few seconds out; if the
  // handover to the other track happened in between, that pending recovery still fired
  // and pulled the old track back up underneath the new one — which is what put two
  // soundtracks on at once when the church lawn turned. Every move on these gains goes
  // through here, and every one of them wipes what was queued behind it first.
  //
  // Linear rather than setTargetAtTime: an exponential approach never actually reaches
  // zero, so the track being faded out stayed faintly audible under the other one.
  rampGain(gain, to, seconds, at = this.now()) {
    if (!gain) return;
    const g = gain.gain;
    g.cancelScheduledValues(at);
    g.setValueAtTime(g.value, at);
    g.linearRampToValueAtTime(to, at + Math.max(0.01, seconds));
  }

  // The sky went red. Start the other track if this is the first time it has been
  // asked for, then hand over.
  setHellMusic(on) {
    if (!this.ready || this.hellOn === on) return;
    this.hellOn = on;
    clearTimeout(this.duckTimer);          // whatever was ducked belongs to the old mix
    if (on && !this.hellEl) {
      const el = new Audio('./satan.mp3');
      el.loop = true;
      el.crossOrigin = 'anonymous';
      el.preload = 'auto';
      this.hellEl = el;
      try {
        this.hell = this.ctx.createMediaElementSource(el);
        this.hell.connect(this.hellGain);
      } catch {
        this.hell = null;
      }
      el.volume = this.hell ? 1 : 0;
      el.play().catch(() => {});
    }
    if (on && this.hellEl) {
      // always from the top: it is a cue, not a station left running
      try { this.hellEl.currentTime = 0; } catch { /* not seekable yet */ }
      this.hellEl.play().catch(() => {});
    }
    this.applyMusicMix(0.35);
    if (!on && this.hellEl) {
      // let the crossfade finish before the element stops
      setTimeout(() => { if (!this.hellOn) this.hellEl.pause(); }, 1400);
    }
  }

  // duck whichever track is up, under crashes / mission-passed stings
  duckMusic(amount = 0.35, seconds = 1.6) {
    if (!this.ready || this.muted) return;
    const node = this.hellOn ? (this.hell && this.hellGain) : (this.music && this.musicGain);
    if (!node) return;
    const t = this.now();
    const hellWas = this.hellOn;
    this.rampGain(node, this.musicVol * amount, 0.12, t);
    // The recovery is scheduled, so it has to be checked when it lands rather than
    // when it was booked: if the other track took over in the meantime, the mix has
    // already been set correctly and this one must not touch it.
    clearTimeout(this.duckTimer);
    this.duckTimer = setTimeout(() => {
      if (this.muted || this.hellOn !== hellWas) return;
      this.rampGain(node, this.musicVol, 0.5);
    }, Math.max(0, seconds * 1000));
  }

  now() { return this.ctx.currentTime; }

  // per-frame update: player {v, throttle, airborne}, seaDist
  update(dt, player, seaDist, riding) {
    if (!this.ready || this.muted) return;
    const t = this.now();
    const v = Math.abs(player.v || 0);
    // fake gearbox
    const gearSpan = 10;
    const gear = Math.min(4, Math.floor(v / gearSpan));
    const frac = (v - gear * gearSpan) / gearSpan;
    const rpm = riding ? (0.25 + frac * 0.75) * (player.airborneNow ? 1 : 0.9) + (player._input && player._input.throttle ? 0.08 : 0) : 0;
    const f = 46 + rpm * 105 + gear * 9;
    this.osc1.frequency.setTargetAtTime(f, t, 0.03);
    this.osc2.frequency.setTargetAtTime(f / 2, t, 0.03);
    this.engFilter.frequency.setTargetAtTime(500 + rpm * 2200, t, 0.05);
    const engVol = riding ? 0.05 + (player._input?.throttle || 0) * 0.1 + rpm * 0.04 : 0;
    this.engGain.gain.setTargetAtTime(engVol, t, 0.08);
    this.exhGain.gain.setTargetAtTime(riding ? 0.15 + rpm * 0.1 : 0, t, 0.1);

    this.windGain.gain.setTargetAtTime(Math.min(0.16, v * v * 0.00007), t, 0.15);
    this.windFilter.frequency.setTargetAtTime(300 + v * 40, t, 0.2);

    const nearShore = seaDist !== null && seaDist > -80 && seaDist < 90;
    this.surfGain.gain.setTargetAtTime(nearShore ? 0.05 : 0.008, t, 0.6);
  }

  blip(freq = 880, dur = 0.09, vol = 0.18, type = 'square') {
    if (!this.ready || this.muted) return;
    const t = this.now();
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noiseBurst(dur, freq, vol, type = 'lowpass') {
    if (!this.ready || this.muted) return;
    const t = this.now();
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  crash() {
    this.noiseBurst(0.5, 900, 0.5);
    this.blip(70, 0.3, 0.4, 'sine');
    this.blip(55, 0.45, 0.3, 'triangle');
  }

  scrape() { this.noiseBurst(0.25, 2400, 0.2, 'bandpass'); }

  ring() {
    this.noiseBurst(0.7, 700, 0.4);
    this.blip(196, 0.5, 0.25, 'sine');
    this.blip(392, 0.4, 0.18, 'sine');
  }

  splash() {
    this.noiseBurst(1.4, 500, 0.6);
    setTimeout(() => this.noiseBurst(1.0, 300, 0.35), 120);
  }

  checkpoint() {
    this.blip(660, 0.08, 0.16);
    setTimeout(() => this.blip(880, 0.1, 0.16), 90);
  }

  horn() {
    if (!this.ready || this.muted) return;
    const t = this.now();
    for (const f of [392, 494]) {
      const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.06, t);
      g.gain.setValueAtTime(0.06, t + 0.28);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 0.45);
    }
  }

  ferryHorn() {
    if (!this.ready || this.muted) return;
    const t = this.now();
    for (const f of [87, 116, 65]) {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.08, t + 0.3);
      g.gain.setValueAtTime(0.08, t + 2.2);
      g.gain.exponentialRampToValueAtTime(0.001, t + 3.2);
      const fl = this.ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 400;
      o.connect(fl); fl.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 3.3);
    }
  }

  gull() {
    if (!this.ready || this.muted) return;
    const t = this.now();
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(1150, t);
    o.frequency.exponentialRampToValueAtTime(1600, t + 0.09);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.3);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.035, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    const fl = this.ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 1400; fl.Q.value = 2;
    o.connect(fl); fl.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.4);
  }

  missionPassed() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => setTimeout(() => this.blip(f, 0.35, 0.2, 'triangle'), i * 160));
  }

  trickSting(level = 1) {
    const base = [523, 659, 784][Math.min(2, level)];
    this.blip(base, 0.09, 0.14, 'square');
    setTimeout(() => this.blip(base * 1.5, 0.12, 0.12, 'square'), 80);
  }

  jump() { this.noiseBurst(0.18, 1800, 0.12, 'highpass'); }

  // ---- Kokoro voice lines (audio/voices/*.wav, generated by tools/make_voices.py) ----
  VOICE_KEYS = ['intro', 'intro2', 'sendit', 'ring', 'finish',
    'crash1', 'crash2', 'crash3', 'crash4', 'crash5', 'crash6', 'crash7', 'crash8', 'crash9', 'crash10'];

  // ---- one voice at a time ----
  // There is one announcer channel and one mouth on it. Lines used to be fired the
  // moment their event happened, so bowling a pedestrian over during a school-zone
  // callout put three people talking across each other and none of them landed.
  //
  // A line takes the channel if it is free, or if it outranks whatever is on it — in
  // which case the running line is faded out over 120 ms rather than cut, so the
  // handover reads as an announcer talking over himself and not as a dropout. A line
  // that loses is dropped, never queued: a reaction that arrives four seconds after
  // the crash is worse than one that never comes.
  //
  // The claim is taken *after* the buffer is ready, because the first play of a key
  // goes to the network and two lines can be in flight at once.
  voiceFree(priority) {
    if (!this.voiceSrc) return true;
    if (this.now() >= this.voiceUntil) return true;
    return priority > this.voicePriority;
  }

  stopVoice(fade = 0.12) {
    if (!this.voiceSrc) return;
    const src = this.voiceSrc, g = this.voiceGain;
    this.voiceSrc = null; this.voiceGain = null; this.voiceUntil = 0; this.voicePriority = 0;
    const t = this.now();
    try {
      if (g) {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0.0001, t + fade);
      }
      src.stop(t + fade + 0.02);
    } catch { /* already stopped */ }
  }

  async voice(key, vol = 0.95, wet = 0.55, priority = 1) {
    if (!this.ready || this.muted) return;
    if (!this.voiceFree(priority)) return;         // cheap reject before the fetch
    try {
      if (!this.voiceBufs) this.voiceBufs = {};
      let buf = this.voiceBufs[key];
      if (!buf) {
        const res = await fetch(`./audio/voices/${key}.wav`);
        if (!res.ok) return;
        buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        this.voiceBufs[key] = buf;
      }
      if (this.muted) return;
      if (!this.voiceFree(priority)) return;       // something took the channel while we fetched
      this.stopVoice();
      const t = this.now();
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 0.97 + Math.random() * 0.07;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.setValueAtTime(vol, t + buf.duration - 0.15);
      g.gain.linearRampToValueAtTime(0.001, t + buf.duration);
      src.connect(g); g.connect(this.master);
      // dry to the master, a tap to the plate — the tail is what makes the line land
      if (this.verbSend) {
        const send = this.ctx.createGain();
        send.gain.value = wet;
        g.connect(send); send.connect(this.verbSend);
      }
      src.start(t);
      this.voiceSrc = src;
      this.voiceGain = g;
      this.voicePriority = priority;
      // a beat of silence on the end, so the next line does not tread on this one
      this.voiceUntil = t + buf.duration + 0.2;
      src.onended = () => { if (this.voiceSrc === src) { this.voiceSrc = null; this.voiceGain = null; this.voiceUntil = 0; this.voicePriority = 0; } };
      this.duckMusic(0.4, Math.min(3, buf.duration));
    } catch { /* voice files missing — silent */ }
  }

  // priority 1: background chatter — whoever the bike just hit
  reaction() {
    const n = 1 + Math.floor(Math.random() * 10);
    return this.voice(`crash${n}`, 0.95, 0.55, 1);
  }

  // priority 3: the announcer calling a pickup. Two takes per kind, so a run with four
  // cases of Lucky in it does not play the same line four times.
  powerupLine(kind) {
    const n = 1 + Math.floor(Math.random() * 2);
    return this.voice(`pow_${kind}${n}`, 1.0, 0.5, 3);
  }

  // ---- Nanaimo bar sounds ----
  throwWhoosh() { this.noiseBurst(0.22, 1400, 0.14, 'bandpass'); }

  splat() {
    this.noiseBurst(0.16, 700, 0.42, 'lowpass');
    this.blip(160, 0.09, 0.3, 'sine');
    setTimeout(() => this.blip(120, 0.07, 0.22, 'sine'), 40);
  }

  setMuted(m) {
    this.muted = m;
    if (m) this.stopVoice(0.05);
    if (this.ready) this.master.gain.value = m ? 0 : 0.8;
    // elements that never made it into the graph carry their own volume
    if (this.musicEl && !this.music) this.musicEl.volume = m || this.hellOn ? 0 : this.musicVol;
    if (this.hellEl && !this.hell) this.hellEl.volume = m || !this.hellOn ? 0 : this.musicVol;
  }
}
