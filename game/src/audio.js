// audio.js — a tiny WebAudio synth band. No audio files: the engine is a
// sawtooth whose pitch tracks speed, sirens are two alternating tones,
// gunshots are filtered noise bursts, and the ambience is a slow pad.
// Everything is created lazily on the first user gesture.

export class AudioBand {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.engineOsc = null; this.engineGain = null;
    this.sirenOsc = null; this.sirenGain = null; this.sirenTimer = null;
    this.padStarted = false;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.startEngine();
    this.startPad();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slideTo = null) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  noise(dur, vol, freq = 1200) {
    if (!this.ctx) return;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
  }

  startEngine() {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = 55;
    g.gain.value = 0;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start();
    this.engineOsc = o; this.engineGain = g;
  }

  engine(speedRatio, driving) {
    if (!this.ctx || !this.engineOsc) return;
    const target = driving ? 0.05 + Math.abs(speedRatio) * 0.05 : 0;
    this.engineOsc.frequency.setTargetAtTime(52 + Math.abs(speedRatio) * 165, this.ctx.currentTime, 0.08);
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
  }

  startPad() {
    if (this.padStarted || !this.ctx) return;
    this.padStarted = true;
    const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [164.8, 196, 246.9]];
    let step = 0;
    const play = () => {
      if (!this.ctx) return;
      const chord = chords[step % chords.length]; step++;
      for (const fq of chord) this.tone(fq, 3.6, 'triangle', 0.028);
      this.padTimer = setTimeout(play, 3400);
    };
    play();
  }

  siren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = 700; g.gain.value = 0.035;
      o.connect(g); g.connect(this.master); o.start();
      this.sirenOsc = o; this.sirenGain = g;
      let hi = false;
      this.sirenTimer = setInterval(() => { hi = !hi; if (this.sirenOsc) this.sirenOsc.frequency.value = hi ? 950 : 660; }, 380);
    } else if (!on && this.sirenOsc) {
      clearInterval(this.sirenTimer);
      this.sirenOsc.stop(); this.sirenOsc.disconnect();
      this.sirenOsc = null;
    }
  }

  shot() { this.noise(0.14, 0.5, 2600); this.tone(140, 0.09, 'square', 0.16, 0, 55); }
  punch() { this.noise(0.08, 0.3, 700); this.tone(95, 0.08, 'sine', 0.25, 0, 50); }
  horn() { this.tone(370, 0.28, 'square', 0.07); this.tone(466, 0.28, 'square', 0.05); }
  crash() { this.noise(0.3, 0.4, 500); }
  pickup() { this.tone(880, 0.09, 'sine', 0.16); this.tone(1320, 0.14, 'sine', 0.16, 0.07); }
  chime() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'sine', 0.16, i * 0.09)); }
  sting() { [392, 392, 523, 659].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.2, i * 0.11)); }
  busted() { [330, 262, 196].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.2, i * 0.16)); }
}
