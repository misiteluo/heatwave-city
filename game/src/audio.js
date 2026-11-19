// audio.js — a WebAudio synth band, no audio files. Engine and rotor are
// looping oscillators, sirens are two alternating tones, gunfire is
// shaped noise, and the car radio is a tiny step sequencer with three
// procedural stations. Everything is created lazily on first gesture.

const STATIONS = [
  { name: 'SOLSTICE FM', root: 110, scale: [0, 3, 5, 7, 10], tempo: 132, wave: 'sawtooth', bass: 0.16 },
  { name: 'NEON WAH 98.1', root: 98, scale: [0, 2, 3, 7, 9], tempo: 104, wave: 'square', bass: 0.11 },
  { name: 'PALM RADIO', root: 130.8, scale: [0, 4, 7, 11], tempo: 88, wave: 'triangle', bass: 0.13 },
];

export class AudioBand {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.engineOsc = null; this.engineGain = null; this.engineFilter = null;
    this.rotorSrc = null; this.rotorGain = null; this.rotorLfo = null;
    this.sirenOsc = null; this.sirenTimer = null;
    this.radioTimer = null; this.radioStep = 0; this.station = -1;
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
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  noise(dur, vol, freq = 1200, type = 'lowpass') {
    if (!this.ctx) return;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
  }

  // ------------------------------------------------------------ engine
  startEngine() {
    const o = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = 55;
    o2.type = 'square'; o2.frequency.value = 28;
    f.type = 'lowpass'; f.frequency.value = 420;
    g.gain.value = 0;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
    o.start(); o2.start();
    this.engineOsc = o; this.engineSub = o2; this.engineGain = g; this.engineFilter = f;
  }

  engine(speedRatio, driving) {
    if (!this.ctx || !this.engineOsc) return;
    const r = Math.abs(speedRatio);
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(52 + r * 185, t, 0.08);
    this.engineSub.frequency.setTargetAtTime(26 + r * 92, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(380 + r * 900, t, 0.1);
    this.engineGain.gain.setTargetAtTime(driving ? 0.045 + r * 0.05 : 0, t, 0.1);
  }

  // ------------------------------------------------------------- rotor
  rotor(on, rate = 1) {
    if (!this.ctx) return;
    if (on && !this.rotorSrc) {
      const len = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 300; f.Q.value = 0.8;
      const g = this.ctx.createGain(); g.gain.value = 0;
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 11;
      const lfoG = this.ctx.createGain(); lfoG.gain.value = 0.05;
      lfo.connect(lfoG); lfoG.connect(g.gain);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(); lfo.start();
      this.rotorSrc = src; this.rotorGain = g; this.rotorLfo = lfo;
    }
    if (this.rotorGain) {
      this.rotorGain.gain.setTargetAtTime(on ? 0.05 + rate * 0.06 : 0, this.ctx.currentTime, 0.2);
      if (this.rotorLfo) this.rotorLfo.frequency.setTargetAtTime(9 + rate * 6, this.ctx.currentTime, 0.3);
    }
    if (!on && this.rotorSrc) {
      const src = this.rotorSrc, lfo = this.rotorLfo;
      setTimeout(() => { try { src.stop(); lfo.stop(); } catch (e) { /* already stopped */ } }, 600);
      this.rotorSrc = null; this.rotorGain = null; this.rotorLfo = null;
    }
  }

  // ------------------------------------------------------------- siren
  siren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = 700; g.gain.value = 0.032;
      o.connect(g); g.connect(this.master); o.start();
      this.sirenOsc = o;
      let hi = false;
      this.sirenTimer = setInterval(() => { hi = !hi; if (this.sirenOsc) this.sirenOsc.frequency.value = hi ? 960 : 650; }, 370);
    } else if (!on && this.sirenOsc) {
      clearInterval(this.sirenTimer);
      try { this.sirenOsc.stop(); } catch (e) { /* noop */ }
      this.sirenOsc.disconnect();
      this.sirenOsc = null;
    }
  }

  // ------------------------------------------------------------- radio
  radioStationName(i) { return STATIONS[i].name; }
  radio(on, stationIdx = 0) {
    if (!this.ctx) return -1;
    if (!on) {
      if (this.radioTimer) clearInterval(this.radioTimer);
      this.radioTimer = null; this.station = -1;
      return -1;
    }
    this.station = ((stationIdx % STATIONS.length) + STATIONS.length) % STATIONS.length;
    if (this.radioTimer) clearInterval(this.radioTimer);
    const st = STATIONS[this.station];
    const stepMs = 60000 / st.tempo / 2;
    this.radioStep = 0;
    this.radioTimer = setInterval(() => {
      if (!this.ctx) return;
      const s = this.radioStep++;
      const deg = st.scale[s % st.scale.length];
      const oct = s % 16 >= 8 ? 2 : 1;
      const f = st.root * Math.pow(2, deg / 12) * oct;
      if (s % 2 === 0) this.tone(st.root / 2, 0.22, 'sine', st.bass);
      this.tone(f, 0.16, st.wave, 0.045);
      if (s % 8 === 6) this.tone(f * 1.5, 0.2, st.wave, 0.03);
    }, stepMs);
    return this.station;
  }

  // --------------------------------------------------------------- pad
  startPad() {
    if (this.padStarted || !this.ctx) return;
    this.padStarted = true;
    const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [164.8, 196, 246.9]];
    let step = 0;
    const play = () => {
      if (!this.ctx) return;
      const chord = chords[step % chords.length]; step++;
      for (const fq of chord) this.tone(fq, 3.6, 'triangle', 0.024);
      this.padTimer = setTimeout(play, 3400);
    };
    play();
  }

  // ---------------------------------------------------------- one-shots
  shot(kind = 'pistol') {
    if (kind === 'shotgun') { this.noise(0.3, 0.65, 1500); this.tone(110, 0.16, 'square', 0.2, 0, 40); }
    else if (kind === 'smg') { this.noise(0.08, 0.36, 3000); this.tone(160, 0.05, 'square', 0.1, 0, 70); }
    else { this.noise(0.14, 0.5, 2600); this.tone(140, 0.09, 'square', 0.16, 0, 55); }
  }
  enemyShot() { this.noise(0.1, 0.22, 2200); }
  punch() { this.noise(0.08, 0.3, 700); this.tone(95, 0.08, 'sine', 0.25, 0, 50); }
  horn() { this.tone(370, 0.28, 'square', 0.06); this.tone(466, 0.28, 'square', 0.045); }
  crash() { this.noise(0.3, 0.4, 500); this.tone(70, 0.22, 'sine', 0.2, 0, 38); }
  explosion() { this.noise(0.8, 0.8, 300); this.tone(55, 0.7, 'sine', 0.5, 0, 26); this.noise(0.4, 0.4, 1800); }
  pickup() { this.tone(880, 0.09, 'sine', 0.15); this.tone(1320, 0.14, 'sine', 0.15, 0.07); }
  chime() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'sine', 0.15, i * 0.09)); }
  sting() { [392, 392, 523, 659].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.18, i * 0.11)); }
  fail() { [330, 294, 262, 196].forEach((f, i) => this.tone(f, 0.26, 'triangle', 0.18, i * 0.15)); }
  busted() { [330, 262, 196].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.2, i * 0.16)); }
  spook() { this.tone(1180, 0.07, 'square', 0.1); this.tone(1180, 0.07, 'square', 0.1, 0.12); }
}
