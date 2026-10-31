// ── KOTA MATI — tiny synthesised soundscape (no assets) ──────────────
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.ambient = null;
  }

  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.42 : 0;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.startAmbient();
  }

  resume() { if (this.ctx?.state === 'suspended') this.ctx.resume(); }
  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.42 : 0;
  }

  startAmbient() {
    if (!this.ctx || this.ambient) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 240;
    const g = this.ctx.createGain();
    g.gain.value = 0.055;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(filt).connect(g).connect(this.master);
    src.start();
    lfo.start();
    this.ambient = { src, g };
  }

  noise({ dur = 0.12, vol = 0.4, freq = 1200, q = 0.8, type = 'lowpass', slide = 0 } = {}) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(freq, t);
    if (slide) filt.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    filt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  tone({ freq = 440, end = null, dur = 0.1, vol = 0.2, type = 'sine', delay = 0 } = {}) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (end) o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  shoot(kind) {
    if (!this.ctx) return;
    if (kind === 'pistol') {
      this.noise({ dur: 0.14, vol: 0.42, freq: 1600, slide: -1200, q: 0.7 });
      this.tone({ freq: 150, end: 55, dur: 0.12, vol: 0.3, type: 'square' });
    } else if (kind === 'smg') {
      this.noise({ dur: 0.07, vol: 0.26, freq: 2100, slide: -1300 });
      this.tone({ freq: 200, end: 90, dur: 0.06, vol: 0.16, type: 'square' });
    } else if (kind === 'shotgun') {
      this.noise({ dur: 0.32, vol: 0.6, freq: 900, slide: -700, q: 0.6 });
      this.tone({ freq: 90, end: 38, dur: 0.28, vol: 0.42, type: 'sawtooth' });
    } else if (kind === 'rifle') {
      this.noise({ dur: 0.18, vol: 0.44, freq: 1300, slide: -900 });
      this.tone({ freq: 120, end: 45, dur: 0.16, vol: 0.32, type: 'square' });
    } else {
      this.noise({ dur: 0.09, vol: 0.3, freq: 1800 });
    }
  }

  empty() { this.tone({ freq: 900, end: 500, dur: 0.05, vol: 0.12, type: 'square' }); }
  reload() {
    this.tone({ freq: 520, dur: 0.05, vol: 0.1, type: 'square' });
    this.tone({ freq: 760, dur: 0.05, vol: 0.1, type: 'square', delay: 0.18 });
  }
  swap() { this.tone({ freq: 420, end: 620, dur: 0.08, vol: 0.09, type: 'triangle' }); }
  swing() { this.noise({ dur: 0.12, vol: 0.2, freq: 2600, slide: -1800, type: 'bandpass', q: 1.4 }); }
  hit() { this.noise({ dur: 0.08, vol: 0.28, freq: 900, slide: -500, type: 'lowpass' }); }
  splat() {
    this.noise({ dur: 0.2, vol: 0.24, freq: 620, slide: -420, type: 'lowpass' });
    this.tone({ freq: 120, end: 60, dur: 0.15, vol: 0.12, type: 'sawtooth' });
  }
  hurt() {
    this.tone({ freq: 220, end: 70, dur: 0.25, vol: 0.3, type: 'sawtooth' });
    this.noise({ dur: 0.16, vol: 0.2, freq: 500, type: 'lowpass' });
  }
  groan() {
    if (!this.ctx) return;
    const f = 90 + Math.random() * 70;
    this.tone({ freq: f, end: f * 0.6, dur: 0.55, vol: 0.05, type: 'sawtooth' });
    this.noise({ dur: 0.5, vol: 0.04, freq: 420, type: 'bandpass', q: 2 });
  }
  pickup() {
    this.tone({ freq: 620, end: 940, dur: 0.1, vol: 0.1, type: 'triangle' });
    this.tone({ freq: 940, end: 1240, dur: 0.1, vol: 0.08, type: 'triangle', delay: 0.07 });
  }
  eat() {
    this.noise({ dur: 0.18, vol: 0.14, freq: 700, type: 'bandpass', q: 1.5 });
    this.tone({ freq: 300, end: 200, dur: 0.12, vol: 0.08, type: 'triangle' });
  }
  drink() {
    this.tone({ freq: 380, end: 560, dur: 0.22, vol: 0.08, type: 'sine' });
    this.noise({ dur: 0.2, vol: 0.06, freq: 800, type: 'bandpass' });
  }
  heal() {
    this.tone({ freq: 420, end: 780, dur: 0.25, vol: 0.09, type: 'sine' });
    this.tone({ freq: 630, end: 1000, dur: 0.25, vol: 0.06, type: 'sine', delay: 0.1 });
  }
  wave() {
    this.tone({ freq: 120, end: 90, dur: 1.1, vol: 0.22, type: 'sawtooth' });
    this.tone({ freq: 60, end: 45, dur: 1.4, vol: 0.18, type: 'sine' });
    this.noise({ dur: 0.9, vol: 0.1, freq: 300, type: 'lowpass' });
  }
  click() { this.tone({ freq: 700, end: 500, dur: 0.04, vol: 0.07, type: 'square' }); }
}
