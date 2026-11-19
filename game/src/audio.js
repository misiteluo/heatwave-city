// audio.js — a WebAudio synth band, no audio files. Engine, boat and
// rotor are looping oscillators, sirens are two alternating tones,
// gunfire is shaped noise, and the car radio is a tiny step sequencer
// with four procedural stations. Everything is created lazily on the
// first user gesture.

const STATIONS = [
  { name: 'SOLSTICE FM', root: 110, scale: [0, 3, 5, 7, 10], tempo: 132, wave: 'sawtooth', bass: 0.15 },
  { name: 'NEON WAH 98.1', root: 98, scale: [0, 2, 3, 7, 9], tempo: 104, wave: 'square', bass: 0.1 },
  { name: 'PALM RADIO', root: 130.8, scale: [0, 4, 7, 11], tempo: 88, wave: 'triangle', bass: 0.12 },
  { name: 'CRANE CLASSICS', root: 87.3, scale: [0, 2, 4, 7, 9], tempo: 76, wave: 'sine', bass: 0.14 },
];

export class AudioBand {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineNodes = null;
    this.boatNodes = null;
    this.rotorNodes = null;
    this.sirenNodes = null;
    this.radioTimer = null;
    this.radioStep = 0;
    this.padOn = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.85;
      this.master.connect(this.ctx.destination);
      this.startPad();
    } catch (e) { /* no audio — play silent */ }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.85;
  }

  tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slideTo = null) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  noise(dur, vol, freq = 1200, type = 'lowpass') {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
  }

  startEngine() {
    if (!this.ctx || this.engineNodes) return;
    const o1 = this.ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
    const o2 = this.ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 28;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    const g = this.ctx.createGain(); g.gain.value = 0;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
    o1.start(); o2.start();
    this.engineNodes = { o1, o2, g, f };
  }

  engine(speedRatio, driving) {
    if (!this.ctx) return;
    if (driving) {
      this.startEngine();
      if (!this.engineNodes) return;
      const r = Math.abs(speedRatio);
      const t = this.ctx.currentTime;
      this.engineNodes.o1.frequency.setTargetAtTime(52 + r * 165, t, 0.06);
      this.engineNodes.o2.frequency.setTargetAtTime(26 + r * 82, t, 0.06);
      this.engineNodes.f.frequency.setTargetAtTime(380 + r * 900, t, 0.08);
      this.engineNodes.g.gain.setTargetAtTime(0.05 + r * 0.075, t, 0.09);
    } else if (this.engineNodes) {
      this.engineNodes.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    }
  }

  startBoat() {
    if (!this.ctx || this.boatNodes) return;
    const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 48;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
    const g = this.ctx.createGain(); g.gain.value = 0;
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start();
    this.boatNodes = { o, g, f };
  }

  boat(speedRatio, on) {
    if (!this.ctx) return;
    if (on) {
      this.startBoat();
      if (!this.boatNodes) return;
      const r = Math.abs(speedRatio);
      const t = this.ctx.currentTime;
      this.boatNodes.o.frequency.setTargetAtTime(46 + r * 90, t, 0.1);
      this.boatNodes.g.gain.setTargetAtTime(0.04 + r * 0.06, t, 0.12);
    } else if (this.boatNodes) {
      this.boatNodes.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    }
  }

  rotor(on, rate = 1) {
    if (!this.ctx) return;
    if (on && !this.rotorNodes) {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 24;
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 300; f.Q.value = 1.4;
      const g = this.ctx.createGain(); g.gain.value = 0;
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 11;
      const lfoG = this.ctx.createGain(); lfoG.gain.value = 0.028;
      lfo.connect(lfoG); lfoG.connect(g.gain);
      o.connect(f); f.connect(g); g.connect(this.master);
      o.start(); lfo.start();
      this.rotorNodes = { o, g, lfo };
    }
    if (this.rotorNodes) {
      const t = this.ctx.currentTime;
      this.rotorNodes.g.gain.setTargetAtTime(on ? 0.05 + rate * 0.05 : 0, t, 0.15);
      this.rotorNodes.o.frequency.setTargetAtTime(20 + rate * 10, t, 0.2);
    }
  }

  siren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenNodes) {
      const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 720;
      const g = this.ctx.createGain(); g.gain.value = 0;
      const lfo = this.ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 0.7;
      const lfoG = this.ctx.createGain(); lfoG.gain.value = 160;
      lfo.connect(lfoG); lfoG.connect(o.frequency);
      o.connect(g); g.connect(this.master);
      o.start(); lfo.start();
      this.sirenNodes = { o, g, lfo };
    }
    if (this.sirenNodes) {
      this.sirenNodes.g.gain.setTargetAtTime(on ? 0.028 : 0, this.ctx.currentTime, 0.2);
    }
  }

  radioStationName(i) { return STATIONS[i].name; }

  radio(on, stationIdx = 0) {
    if (!this.ctx) return stationIdx;
    if (!on) {
      if (this.radioTimer) { clearInterval(this.radioTimer); this.radioTimer = null; }
      return -1;
    }
    if (this.radioTimer) clearInterval(this.radioTimer);
    const st = STATIONS[stationIdx];
    this.radioStep = 0;
    const stepDur = 60 / st.tempo / 2;
    this.radioTimer = setInterval(() => {
      if (!this.ctx || this.muted) return;
      const s = this.radioStep++;
      const deg = st.scale[Math.floor(Math.abs(Math.sin(s * 0.7)) * st.scale.length) % st.scale.length];
      const f = st.root * Math.pow(2, deg / 12) * (s % 16 >= 8 ? 2 : 1);
      this.tone(f, stepDur * 0.92, st.wave, 0.055);
      if (s % 4 === 0) this.tone(st.root / 2, stepDur * 1.8, 'sine', st.bass);
      if (s % 8 === 4) this.noise(0.05, 0.02, 6000, 'highpass');
    }, stepDur * 1000);
    return stationIdx;
  }

  startPad() {
    if (!this.ctx || this.padOn) return;
    this.padOn = true;
    const notes = [110, 130.8, 164.8, 196];
    let i = 0;
    const play = () => {
      if (!this.ctx) return;
      this.tone(notes[i % notes.length], 3.4, 'sine', 0.028);
      this.tone(notes[i % notes.length] * 1.5, 3.4, 'sine', 0.016, 0.4);
      i++;
    };
    play();
    setInterval(play, 3400);
  }

  shot(kind = 'pistol') {
    if (kind === 'smg') { this.noise(0.07, 0.2, 2600); this.tone(210, 0.05, 'square', 0.08, 0, 90); }
    else if (kind === 'shotgun') { this.noise(0.22, 0.42, 1100); this.tone(120, 0.16, 'sine', 0.3, 0, 45); }
    else if (kind === 'carbine') { this.noise(0.11, 0.3, 2000); this.tone(160, 0.08, 'square', 0.12, 0, 70); }
    else { this.noise(0.1, 0.28, 2200); this.tone(180, 0.07, 'square', 0.1, 0, 80); }
  }

  enemyShot() { this.noise(0.09, 0.16, 2000); }
  punch() { this.noise(0.08, 0.3, 700); this.tone(95, 0.08, 'sine', 0.25, 0, 50); }
  horn() { this.tone(370, 0.26, 'square', 0.05); this.tone(466, 0.26, 'square', 0.04); }
  crash() { this.noise(0.3, 0.38, 500); this.tone(70, 0.22, 'sine', 0.2, 0, 38); }
  explosion() { this.noise(0.85, 0.8, 300); this.tone(55, 0.7, 'sine', 0.5, 0, 26); this.noise(0.4, 0.4, 1800); }
  pickup() { this.tone(880, 0.09, 'sine', 0.14); this.tone(1320, 0.14, 'sine', 0.14, 0.07); }
  chime() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'sine', 0.14, i * 0.09)); }
  sting() { [392, 392, 523, 659].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.16, i * 0.11)); }
  fail() { [330, 294, 262, 196].forEach((f, i) => this.tone(f, 0.26, 'triangle', 0.16, i * 0.15)); }
  busted() { [330, 262, 196].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.18, i * 0.16)); }
  spook() { this.tone(1180, 0.07, 'square', 0.09); this.tone(1180, 0.07, 'square', 0.09, 0.12); }
  splash() { this.noise(0.35, 0.2, 900); }
}
