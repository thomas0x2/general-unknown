// Tiny synthesized sound effects via WebAudio. No assets required.
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.volume = 0.5;
    this.last = new Map();
    try { this.muted = localStorage.getItem('gu-muted') === '1'; } catch { /* ignore */ }
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 1.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    try { localStorage.setItem('gu-muted', this.muted ? '1' : '0'); } catch { /* ignore */ }
    return this.muted;
  }

  // vol 0..1 based on distance to camera; name selects the patch.
  play(name, vol = 1) {
    if (!this.ctx || this.muted || vol <= 0.02) return;
    const minGap = { gun: 0.045, laser: 0.06, cannon: 0.08, explosion: 0.07, launch: 0.08 }[name] ?? 0.12;
    const now = this.ctx.currentTime;
    if (now - (this.last.get(name) || 0) < minGap) return;
    this.last.set(name, now);
    const fn = this[`p_${name}`];
    if (fn) fn.call(this, now, vol);
  }

  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  noiseHit(t, vol, freq, q, dur, type = 'bandpass') {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, t, 0.003, vol, dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  tone(t, vol, f0, f1, dur, type = 'sine') {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ctx.createGain();
    this.env(g, t, 0.005, vol, dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  p_gun(t, v) { this.noiseHit(t, 0.18 * v, 2200, 1.2, 0.06); }
  p_cannon(t, v) { this.noiseHit(t, 0.3 * v, 700, 0.8, 0.14); this.tone(t, 0.12 * v, 160, 60, 0.12, 'triangle'); }
  p_laser(t, v) { this.tone(t, 0.05 * v, 1800, 900, 0.07, 'sawtooth'); }
  p_railgun(t, v) { this.tone(t, 0.2 * v, 3000, 200, 0.35, 'sawtooth'); this.noiseHit(t, 0.25 * v, 4000, 0.5, 0.2, 'highpass'); }
  p_launch(t, v) { this.noiseHit(t, 0.2 * v, 900, 0.6, 0.35, 'lowpass'); }
  p_explosion(t, v) { this.noiseHit(t, 0.45 * v, 380, 0.5, 0.5, 'lowpass'); this.tone(t, 0.2 * v, 120, 40, 0.3, 'sine'); }
  p_bigboom(t, v) { this.noiseHit(t, 0.7 * v, 250, 0.4, 1.2, 'lowpass'); this.tone(t, 0.35 * v, 90, 25, 0.9, 'sine'); }
  p_alarm(t, v) {
    for (let i = 0; i < 3; i++) { this.tone(t + i * 0.32, 0.12 * v, 880, 870, 0.14, 'square'); this.tone(t + i * 0.32 + 0.16, 0.12 * v, 660, 650, 0.14, 'square'); }
  }
  p_click(t, v) { this.tone(t, 0.08 * v, 1200, 1000, 0.04, 'square'); }
  p_ready(t, v) { this.tone(t, 0.08 * v, 700, 1100, 0.08, 'triangle'); }
  p_place(t, v) { this.tone(t, 0.12 * v, 300, 500, 0.1, 'triangle'); }
  p_built(t, v) { this.tone(t, 0.1 * v, 500, 500, 0.08, 'triangle'); this.tone(t + 0.09, 0.1 * v, 750, 750, 0.12, 'triangle'); }
  p_pickup(t, v) { [660, 880, 1320].forEach((f, i) => this.tone(t + i * 0.07, 0.1 * v, f, f, 0.1, 'triangle')); }
  p_research(t, v) { [523, 659, 784, 1046].forEach((f, i) => this.tone(t + i * 0.09, 0.09 * v, f, f, 0.18, 'sine')); }
  p_upgrade(t, v) { [784, 1046, 1568].forEach((f, i) => this.tone(t + i * 0.06, 0.1 * v, f, f * 1.01, 0.2, 'triangle')); }
  p_error(t, v) { this.tone(t, 0.1 * v, 200, 150, 0.15, 'square'); }
  p_timejump(t, v) {
    this.tone(t, 0.25 * v, 80, 1600, 2.2, 'sawtooth');
    this.tone(t, 0.2 * v, 120, 2400, 2.2, 'sine');
    this.noiseHit(t + 1.6, 0.5 * v, 600, 0.4, 1.2, 'lowpass');
  }
}
