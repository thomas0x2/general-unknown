// Generative background music (WebAudio, no assets).
// A step sequencer in D minor whose layers fade in and out with the battle's intensity:
//   0 = menus (pads + sparse arpeggio), 1 = quiet build-up, 2 = combat, 3 = last stand.
const BPM = 96;
const STEP = 60 / BPM / 4; // sixteenth note
const LOOKAHEAD = 0.2;

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Chords as midi notes (root first). Two progressions alternate every 8 bars.
const PROGRESSIONS = [
  [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]], // Dm  Bb  Gm  A
  [[50, 53, 57], [48, 52, 55], [46, 50, 53], [45, 49, 52]], // Dm  C   Bb  A
];
// Lead motifs (scale offsets from the chord root, one per two bars)
const MOTIFS = [[12, 10, 7, 5], [7, 8, 7, 3], [12, 15, 14, 12], [5, 7, 3, 2]];

// Per-intensity layer levels
const MIX = [
  { pad: 0.5, arp: 0.16, bass: 0, drums: 0, lead: 0 },
  { pad: 0.42, arp: 0.2, bass: 0.32, drums: 0.22, lead: 0 },
  { pad: 0.34, arp: 0.24, bass: 0.42, drums: 0.5, lead: 0.13 },
  { pad: 0.3, arp: 0.26, bass: 0.48, drums: 0.66, lead: 0.2 },
];

export class Music {
  constructor(audio) {
    this.audio = audio;
    this.enabled = true;
    try { this.enabled = localStorage.getItem('gu-music') !== '0'; } catch { /* ignore */ }
    this.intensity = 0;
    this.started = false;
    this.step = 0;
    this.bar = 0;
  }

  // Needs a user gesture first (the browser blocks audio until then).
  start() {
    const a = this.audio;
    a.ensure();
    if (!a.ctx || this.started) return;
    this.started = true;
    const ctx = a.ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = this.enabled ? 0.8 : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    this.bus.connect(comp).connect(a.master);
    // shared reverb + tempo delay
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.8);
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    this.reverb.connect(wet).connect(this.bus);
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = STEP * 3;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const dl = ctx.createGain(); dl.gain.value = 0.3;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(dl).connect(this.bus);
    this.layers = {};
    for (const k of ['pad', 'arp', 'bass', 'drums', 'lead']) {
      const g = ctx.createGain();
      g.gain.value = MIX[0][k];
      g.connect(this.bus);
      if (k !== 'bass' && k !== 'drums') g.connect(this.reverb);
      if (k === 'arp' || k === 'lead') g.connect(this.delay);
      this.layers[k] = g;
    }
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 40);
  }

  setEnabled(on) {
    this.enabled = on;
    try { localStorage.setItem('gu-music', on ? '1' : '0'); } catch { /* ignore */ }
    if (!on || this.started) this.bus?.gain.setTargetAtTime(on ? 0.8 : 0, this.audio.ctx.currentTime, 0.4);
    if (on && !this.started) this.start();
  }

  toggle() { this.setEnabled(!this.enabled); return this.enabled; }

  setIntensity(level) {
    level = Math.max(0, Math.min(3, level | 0));
    if (level === this.intensity || !this.started) { this.intensity = level; return; }
    this.intensity = level;
    const t = this.audio.ctx.currentTime;
    for (const [k, g] of Object.entries(this.layers)) g.gain.setTargetAtTime(MIX[level][k], t, 1.2);
  }

  impulse(seconds) {
    const ctx = this.audio.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  schedule() {
    const ctx = this.audio.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (this.nextTime < ctx.currentTime - 0.5) this.nextTime = ctx.currentTime + 0.05; // tab was asleep
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      if (this.enabled) this.playStep(this.step, this.bar, this.nextTime);
      this.nextTime += STEP;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar++;
    }
  }

  playStep(s, bar, t) {
    const I = this.intensity;
    const prog = PROGRESSIONS[Math.floor(bar / 8) % 2];
    const chord = prog[bar % 4];
    const root = chord[0];

    // pads: one sustained chord per bar
    if (s === 0) {
      for (const n of chord) this.pad(midi(n), t, STEP * 16);
      this.pad(midi(root - 12), t, STEP * 16, 0.6);
    }

    // arpeggio: chord tones walking up and down
    const arpEvery = I === 0 ? 4 : I === 1 ? 2 : 1;
    if (s % arpEvery === 0) {
      const seq = [0, 1, 2, 1, 0, 2, 1, 2];
      const n = chord[seq[(s / arpEvery) % seq.length]] + 12 + (s >= 8 && I >= 2 ? 12 : 0);
      this.pluck(midi(n), t, I === 0 ? 0.5 : 0.22);
    }

    // galloping bass
    if (I >= 1) {
      const pat = I === 1 ? [0, 3, 6, 8, 11, 14] : [0, 2, 3, 6, 8, 10, 11, 14];
      if (pat.includes(s)) this.bass(midi(root - 12 + (I >= 2 && s === 14 ? 12 : 0)), t);
    }

    // drums
    if (I >= 1) {
      const kicks = I === 1 ? [0, 8] : I === 2 ? [0, 6, 8, 11] : [0, 3, 6, 8, 11, 14];
      if (kicks.includes(s)) this.kick(t);
    }
    if (I >= 2) {
      if (s === 4 || s === 12) this.snare(t, 1);
      if (I >= 3 && (s === 15 || s === 7)) this.snare(t, 0.35);
      if (s % (I >= 3 ? 1 : 2) === 0) this.hat(t, s % 4 === 2 ? 0.7 : 0.4);
      if (bar % 4 === 3 && s >= 12) this.tom(t, 1 - (s - 12) * 0.12, s);
    }

    // brass-like lead: one long note per half bar of a two-bar motif
    if (I >= 2 && (s === 0 || s === 8)) {
      const motif = MOTIFS[Math.floor(bar / 2) % MOTIFS.length];
      const idx = (bar % 2) * 2 + (s === 8 ? 1 : 0);
      this.lead(midi(root + motif[idx] + 12), t, STEP * 7.5);
    }
  }

  // ---- instruments ---------------------------------------------------------
  env(g, t, a, peak, hold, r) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
  }

  pad(f, t, dur, level = 1) {
    const ctx = this.audio.ctx;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(500 + this.intensity * 250, t);
    lp.frequency.linearRampToValueAtTime(900 + this.intensity * 400, t + dur * 0.6);
    lp.Q.value = 0.7;
    for (const det of [-7, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      o.start(t); o.stop(t + dur + 1.4);
    }
    lp.connect(g).connect(this.layers.pad);
    this.env(g, t, 0.8, 0.07 * level, dur - 0.8, 1.2);
  }

  pluck(f, t, level) {
    const ctx = this.audio.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = ctx.createGain();
    this.env(g, t, 0.005, 0.18 * level, 0.02, 0.28);
    o.connect(g).connect(this.layers.arp);
    o.start(t); o.stop(t + 0.4);
  }

  bass(f, t) {
    const ctx = this.audio.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + 0.18);
    const g = ctx.createGain();
    this.env(g, t, 0.005, 0.32, 0.05, 0.16);
    o.connect(lp).connect(g).connect(this.layers.bass);
    o.start(t); o.stop(t + 0.3);
  }

  lead(f, t, dur) {
    const ctx = this.audio.ctx;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1700; lp.Q.value = 2;
    const vib = ctx.createOscillator(); vib.frequency.value = 5.2;
    const vg = ctx.createGain(); vg.gain.value = 4;
    vib.connect(vg);
    for (const [type, det] of [['sawtooth', -4], ['square', 5]]) {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = f; o.detune.value = det;
      vg.connect(o.detune);
      o.connect(lp);
      o.start(t); o.stop(t + dur + 0.6);
    }
    vib.start(t); vib.stop(t + dur + 0.6);
    lp.connect(g).connect(this.layers.lead);
    this.env(g, t, 0.12, 0.09, dur - 0.3, 0.5);
  }

  kick(t) {
    const ctx = this.audio.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
    const g = ctx.createGain();
    this.env(g, t, 0.002, 0.9, 0.02, 0.32);
    o.connect(g).connect(this.layers.drums);
    o.start(t); o.stop(t + 0.4);
  }

  noise(t, dur, type, freq, q, level, dest = this.layers.drums) {
    const ctx = this.audio.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.audio.noise;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, 0.002, level, 0.005, dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random(), dur + 0.05);
  }

  snare(t, level) {
    this.noise(t, 0.18, 'bandpass', 1900, 0.9, 0.42 * level);
    const ctx = this.audio.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    const g = ctx.createGain();
    this.env(g, t, 0.002, 0.2 * level, 0.01, 0.1);
    o.connect(g).connect(this.layers.drums);
    o.start(t); o.stop(t + 0.2);
  }

  hat(t, level) { this.noise(t, 0.05, 'highpass', 7500, 0.7, 0.12 * level); }

  tom(t, level, s) {
    const ctx = this.audio.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f0 = 130 - (s - 12) * 14;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.3);
    const g = ctx.createGain();
    this.env(g, t, 0.003, 0.55 * level, 0.02, 0.35);
    o.connect(g).connect(this.layers.drums);
    o.start(t); o.stop(t + 0.45);
  }
}
