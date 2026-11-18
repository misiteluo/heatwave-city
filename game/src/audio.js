// HEATWAVE CITY — all-synth WebAudio sound: engine loop tied to speed, two-tone
// sirens, gunshots, punches, honks, reward arpeggios and a warm ambient pad.
// No audio files; everything is oscillators and shaped noise. Starts on the
// first user gesture (the title-screen buttons), as browsers require.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineNodes = null;
    this.sirenNodes = null;
    this.padOn = false;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    // shared noise buffer
    const len = this.ctx.sampleRate * 1;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.startPad();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }

  // --- ambient pad: slow warm chords --------------------------------------
  startPad() {
    if (!this.ctx || this.padOn) return;
    this.padOn = true;
    const chords = [[110, 164.81, 261.63], [87.31, 130.81, 220], [98, 146.83, 246.94], [110, 164.81, 261.63]];
    let step = 0;
    const playChord = () => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.028, t + 2.4);
      gain.gain.linearRampToValueAtTime(0.0001, t + 7.8);
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 620;
      gain.connect(filter); filter.connect(this.master);
      for (const f of chords[step % chords.length]) {
        const o = this.ctx.createOscillator();
        o.type = 'triangle'; o.frequency.value = f;
        o.connect(gain); o.start(t); o.stop(t + 8);
      }
      step++;
      this.padTimer = setTimeout(playChord, 7000);
    };
    playChord();
  }

  // --- engine loop -----------------------------------------------------------
  setEngine(on, speedRatio = 0) {
    if (!this.ctx) return;
    if (on && !this.engineNodes) {
      const osc = this.ctx.createOscillator(); osc.type = 'sawtooth';
      const sub = this.ctx.createOscillator(); sub.type = 'square';
      const filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 420; filter.Q.value = 2;
      const gain = this.ctx.createGain(); gain.gain.value = 0.05;
      osc.connect(filter); sub.connect(filter); filter.connect(gain); gain.connect(this.master);
      osc.start(); sub.start();
      this.engineNodes = { osc, sub, filter, gain };
    }
    if (this.engineNodes) {
      const n = this.engineNodes;
      if (!on) {
        n.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.1);
        const nodes = this.engineNodes; this.engineNodes = null;
        setTimeout(() => { try { nodes.osc.stop(); nodes.sub.stop(); } catch { /* already stopped */ } }, 350);
        return;
      }
      const f = 55 + Math.abs(speedRatio) * 165;
      n.osc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05);
      n.sub.frequency.setTargetAtTime(f / 2, this.ctx.currentTime, 0.05);
      n.filter.frequency.setTargetAtTime(380 + Math.abs(speedRatio) * 900, this.ctx.currentTime, 0.08);
      n.gain.gain.setTargetAtTime(0.045 + Math.abs(speedRatio) * 0.05, this.ctx.currentTime, 0.09);
    }
  }

  // --- siren ------------------------------------------------------------------
  setSiren(on, volume = 0.05) {
    if (!this.ctx) return;
    if (on && !this.sirenNodes) {
      const osc = this.ctx.createOscillator(); osc.type = 'triangle';
      const lfo = this.ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 0.85;
      const lfoGain = this.ctx.createGain(); lfoGain.gain.value = 130;
      lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
      osc.frequency.value = 800;
      const gain = this.ctx.createGain(); gain.gain.value = volume;
      osc.connect(gain); gain.connect(this.master);
      osc.start(); lfo.start();
      this.sirenNodes = { osc, lfo, gain };
    }
    if (this.sirenNodes) {
      if (!on) {
        const nodes = this.sirenNodes; this.sirenNodes = null;
        nodes.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.08);
        setTimeout(() => { try { nodes.osc.stop(); nodes.lfo.stop(); } catch { /* noop */ } }, 300);
      } else {
        this.sirenNodes.gain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.2);
      }
    }
  }

  blip(freq, dur, type = 'sine', vol = 0.16, when = 0, slideTo = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, vol, filterFreq, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  shot() { this.noise(0.14, 0.5, 2600); this.blip(150, 0.09, 'square', 0.2, 0, 60); }
  enemyShot() { this.noise(0.11, 0.22, 2000); }
  punch() { this.blip(140, 0.12, 'sine', 0.4, 0, 55); this.noise(0.06, 0.15, 900); }
  hit() { this.blip(90, 0.16, 'sine', 0.35, 0, 45); }
  honk() { this.blip(370, 0.16, 'square', 0.07); this.blip(370, 0.16, 'square', 0.07, 0.22); }
  empty() { this.blip(1200, 0.04, 'square', 0.08); }
  pickup() { this.blip(880, 0.09, 'sine', 0.18); this.blip(1320, 0.12, 'sine', 0.16, 0.07); }
  reward() { [660, 830, 990, 1320].forEach((f, i) => this.blip(f, 0.16, 'triangle', 0.16, i * 0.09)); }
  sting() { this.blip(392, 0.22, 'triangle', 0.2); this.blip(523, 0.3, 'triangle', 0.2, 0.16); }
  bustedJingle() { [440, 349, 262, 196].forEach((f, i) => this.blip(f, 0.24, 'triangle', 0.2, i * 0.17)); }
  crash(big = 1) { this.noise(0.2 * big, 0.3 * big, 700); this.blip(70, 0.2 * big, 'sine', 0.3 * big, 0, 40); }
}
