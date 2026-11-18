// HEATWAVE CITY — all sound is synthesized with WebAudio: engine hum, police
// siren, gunshots, punches, reward chimes, mission stings and an ambient pad.
// No audio files. The context is created on the first user gesture (the start
// screen button), as browsers require.

export class AudioSys {
  constructor() {
    this.ctx = null; this.master = null; this.muted = false;
    this.engineOsc = null; this.engineGain = null;
    this.sirenOsc = null; this.sirenGain = null; this.sirenLfo = null;
    this.padNodes = null;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);
    this._engine(); this._siren(); this._pad();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  _engine() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator(); this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 50;
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 420;
    this.engineGain = ctx.createGain(); this.engineGain.gain.value = 0;
    this.engineOsc.connect(filt); filt.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  // speedKmh 0..~140, active only while driving.
  engine(speedKmh, driving) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = driving ? 0.05 + Math.min(0.1, Math.abs(speedKmh) / 900) : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.09);
    this.engineOsc.frequency.setTargetAtTime(48 + Math.abs(speedKmh) * 1.7, t, 0.06);
  }

  _siren() {
    const ctx = this.ctx;
    this.sirenOsc = ctx.createOscillator(); this.sirenOsc.type = 'triangle'; this.sirenOsc.frequency.value = 760;
    this.sirenLfo = ctx.createOscillator(); this.sirenLfo.type = 'square'; this.sirenLfo.frequency.value = 0.7;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 190;
    this.sirenLfo.connect(lfoGain); lfoGain.connect(this.sirenOsc.frequency);
    this.sirenGain = ctx.createGain(); this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.sirenOsc.start(); this.sirenLfo.start();
  }

  // level 0..1 by nearest police distance.
  siren(level) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(level * 0.045, this.ctx.currentTime, 0.15);
  }

  _pad() {
    const ctx = this.ctx;
    const gain = ctx.createGain(); gain.gain.value = 0.018;
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 600;
    [110, 164.8, 220].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = i * 4 - 4;
      o.connect(filt); o.start();
    });
    filt.connect(gain); gain.connect(this.master);
    this.padNodes = { gain };
  }

  _blip(freq, dur, type = 'sine', vol = 0.2, when = 0, slideTo = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  _noise(dur, vol, freq = 1200, when = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + when;
    const len = Math.max(1, (dur * ctx.sampleRate) | 0);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(filt); filt.connect(g); g.connect(this.master); src.start(t);
  }

  shoot() { this._noise(0.14, 0.5, 2600); this._blip(160, 0.08, 'square', 0.15, 0, 60); }
  punch() { this._noise(0.07, 0.3, 500); this._blip(90, 0.09, 'sine', 0.3, 0, 45); }
  hit() { this._blip(220, 0.08, 'square', 0.12, 0, 110); }
  crash(intensity = 1) { this._noise(0.25, 0.3 * intensity, 700); this._blip(70, 0.2, 'sine', 0.25 * intensity, 0, 35); }
  horn() { this._blip(370, 0.22, 'square', 0.07); this._blip(466, 0.22, 'square', 0.05); }
  pickup() { this._blip(880, 0.09, 'sine', 0.18); this._blip(1320, 0.12, 'sine', 0.18, 0.07); }
  reward(cash = 300) {
    const base = 520 + Math.min(300, cash / 4);
    [0, 4, 7, 12].forEach((n, i) => this._blip(base * Math.pow(2, n / 12), 0.16, 'triangle', 0.2, i * 0.07));
  }
  sting() { [0, 3, 7].forEach((n, i) => this._blip(392 * Math.pow(2, n / 12), 0.3, 'triangle', 0.16, i * 0.1)); }
  busted() { [7, 3, 0].forEach((n, i) => this._blip(330 * Math.pow(2, n / 12), 0.3, 'sawtooth', 0.1, i * 0.13)); }
  wasted() { this._blip(220, 0.8, 'sawtooth', 0.12, 0, 55); }
}
