// HEATWAVE CITY — Mara Voss's five-job story line and the runner that tracks it.
// Steps are data: goto / steal a marked car / deliver it / clear a fight /
// hold a circle / escape the heat. The runner talks to the game through hooks
// so it never reaches into rendering or physics directly.

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    reward: 400,
    intro: 'Jett. A gold coupe sits outside the Meridian Hotel, and its owner owes me. Take it, bring it to my garage. Try not to scratch it.',
    steps: [
      { type: 'goto', x: -238, z: 32, r: 12, text: 'Meet Mara at Voss Garage', dialog: ['Mara Voss', 'You showed up. Good. Wheels first, questions later.'] },
      { type: 'steal', x: 155.6, z: -118, heading: 0, color: 0xf5b041, text: 'Steal the gold coupe by the Meridian Hotel', dialog: ['Mara Voss', 'Gold coupe, east side, plates ending 88. The doorman looks the other way for cash — you are the cash.'] },
      { type: 'deliver', x: -238, z: 32, r: 13, text: 'Deliver the coupe to Voss Garage' },
    ],
    outro: 'Clean work. The bay is full of people who owe me, Jett. Stick around.',
  },
  {
    id: 'package-run',
    title: 'Package Run',
    reward: 650,
    intro: 'A package came in at the docks. Pick it up and take it across town to my buyers. The port guards shoot first, so expect company.',
    steps: [
      { type: 'goto', x: -225, z: 316, r: 12, text: 'Pick up the package at the docks', dialog: ['Dock Foreman', 'You Voss\'s new dog? Package is yours. And hey — the guards saw your face. Run.'], crime: 'pickup' },
      { type: 'goto', x: 200, z: -238, r: 13, text: 'Drop the package at the buyers, north-east', dialog: ['Buyer', 'On time and still breathing. Mara pays well for both.'] },
    ],
    outro: 'Word travels. The whole bay knows your name now — the cops included.',
  },
  {
    id: 'beach-debt',
    title: 'Beach Debt',
    reward: 900,
    intro: 'The Solano brothers owe me three months of protection money and think the beach is a fortress. Go collect — and take their car as interest.',
    steps: [
      { type: 'goto', x: 66, z: 314, r: 13, text: 'Confront the Solano brothers at the beach' },
      { type: 'fight', x: 66, z: 314, count: 3, text: 'Put the Solano crew down', dialog: ['Rico Solano', 'Wrong beach, friend. Nobody collects from us.'] },
      { type: 'steal', x: 88, z: 300, heading: Math.PI / 2, color: 0x22252b, text: 'Take the Solanos\' black sedan as interest' },
      { type: 'deliver', x: 238, z: -208, r: 13, text: 'Bring the sedan to the safehouse' },
    ],
    outro: 'The brothers will walk funny for a month. You are earning your cut, Jett.',
  },
  {
    id: 'hot-pursuit',
    title: 'Hot Pursuit',
    reward: 1200,
    intro: 'Time to grow up. The Bank of Caldera keeps my money in vault two. Trip the alarm, fill a bag, then disappear to the safehouse.',
    steps: [
      { type: 'goto', x: 2, z: -224, r: 10, text: 'Go to the Bank of Caldera', dialog: ['Jett', 'Vault two. In and out. What could go wrong.'] },
      { type: 'hold', x: 2, z: -224, r: 13, seconds: 12, text: 'Fill the bag — hold the bank entrance', startCrime: 4, dialog: ['Alarm', 'SILENT ALARM TRIPPED — CBPD units responding.'] },
      { type: 'escape', x: 238, z: -208, r: 14, text: 'Lose the heat and reach the safehouse' },
    ],
    outro: 'Half the force chased you and you still made rent. I am impressed, and I do not impress.',
  },
  {
    id: 'big-score',
    title: 'The Big Score',
    reward: 2000,
    intro: 'One last job, the big one. The bank again — but the Solanos want their revenge and the vault holds a fortune. Hold the door, then run it to the docks.',
    steps: [
      { type: 'goto', x: 2, z: -224, r: 10, text: 'Return to the Bank of Caldera' },
      { type: 'hold', x: 2, z: -224, r: 15, seconds: 40, fight: 3, fightWave2: 3, text: 'Hold the bank doors against the Solano crew', startCrime: 3, dialog: ['Rico Solano', 'There he is! Nobody robs our bank run. Take him down!'] },
      { type: 'goto', x: -225, z: 316, r: 14, text: 'Escape to the docks with the score', dialog: ['Mara Voss', 'Boat is waiting, Jett. Bring my money home.'] },
    ],
    outro: 'That is the whole bay in your pocket. Legend status, Jett. The city is yours now — go enjoy it.',
  },
];

export class MissionRunner {
  constructor(hooks, landmarks) {
    this.hooks = hooks;
    this.landmarks = landmarks;
    this.index = 0;         // current mission
    this.stepIndex = 0;
    this.active = false;    // a mission is in progress
    this.done = false;      // whole story finished
    this.stepCar = null;    // the car a steal/deliver chain is about
    this.holdLeft = 0;
    this.spawnedFight = false;
    this.wave2Spawned = false;
  }

  get mission() { return MISSIONS[this.index] || null; }
  get step() { return this.mission ? this.mission.steps[this.stepIndex] : null; }

  start(index) {
    this.index = index;
    this.stepIndex = 0;
    this.active = true;
    this.done = false;
    this.beginStep();
    this.hooks.dialog('Mara Voss', this.mission.intro);
    this.hooks.toast(`New job: ${this.mission.title}`);
  }

  beginStep() {
    const s = this.step;
    if (!s) return;
    this.spawnedFight = false;
    this.wave2Spawned = false;
    if (s.type === 'steal') {
      this.stepCar = this.hooks.spawnMissionCar(s.x, s.z, s.heading || 0, s.color);
    }
    if (s.type === 'hold') {
      this.holdLeft = s.seconds;
      if (s.startCrime) this.hooks.setWantedAtLeast(s.startCrime);
      if (s.fight) { this.hooks.spawnFight(s.fight, s.x, s.z); this.spawnedFight = true; }
    }
    if (s.type === 'fight') {
      this.hooks.spawnFight(s.count, s.x, s.z);
      this.spawnedFight = true;
    }
    if (s.crime === 'pickup') { /* applied on arrival, see update */ }
    if (s.dialog) this.hooks.dialog(s.dialog[0], s.dialog[1]);
  }

  marker() {
    const s = this.step;
    if (!s || !this.active) return null;
    if (s.type === 'steal' && this.stepCar) return { x: this.stepCar.mesh.position.x, z: this.stepCar.mesh.position.z };
    return { x: s.x, z: s.z };
  }

  objectiveText() {
    const s = this.step;
    if (!s) return '';
    if (s.type === 'escape') return `${s.text} — heat must be gone`;
    if (s.type === 'hold') return `${s.text} (${Math.ceil(this.holdLeft)}s)`;
    if (s.type === 'fight') return `${s.text} — ${this.hooks.aliveEnemies()} left`;
    return s.text;
  }

  completeMission() {
    const m = this.mission;
    this.hooks.addCash(m.reward);
    this.hooks.toast(`Job done: ${m.title}  +$${m.reward}`);
    this.hooks.dialog('Mara Voss', m.outro);
    this.hooks.sfx('reward');
    this.active = false;
    this.stepCar = null;
    this.hooks.clearEnemies();
    if (this.index + 1 < MISSIONS.length) {
      this.index += 1;
      this.stepIndex = 0;
      this.active = true;
      this.beginStep();
      this.hooks.toast(`New job available: ${this.mission.title} — follow the gold marker`);
    } else {
      this.done = true;
      this.hooks.onStoryComplete();
    }
    this.hooks.save();
  }

  advance() {
    this.stepIndex += 1;
    if (this.stepIndex >= this.mission.steps.length) this.completeMission();
    else this.beginStep();
  }

  // Called every frame by main. ctx: { playerPos, currentCar, wanted }
  update(dt, ctx) {
    if (!this.active || !this.step) return;
    const s = this.step;
    const p = ctx.playerPos;
    const d = Math.hypot(p.x - s.x, p.z - s.z);
    switch (s.type) {
      case 'goto':
        if (d < s.r) {
          if (s.crime === 'pickup') this.hooks.setWantedAtLeast(2);
          this.advance();
        }
        break;
      case 'steal':
        if (ctx.currentCar && ctx.currentCar === this.stepCar) this.advance();
        break;
      case 'deliver':
        if (d < s.r && ctx.currentCar === this.stepCar) {
          // hand the car over: it stays at the drop-off as a normal parked car
          this.advance();
        }
        break;
      case 'fight':
        if (this.spawnedFight && this.hooks.aliveEnemies() === 0) this.advance();
        break;
      case 'hold': {
        if (s.fight && s.fightWave2 && !this.wave2Spawned && this.holdLeft < s.seconds / 2) {
          this.hooks.spawnFight(s.fightWave2, s.x + 16, s.z + 10);
          this.wave2Spawned = true;
        }
        if (d < s.r) {
          this.holdLeft -= dt;
          if (this.holdLeft <= 0) this.advance();
        }
        break;
      }
      case 'escape':
        if (d < s.r && ctx.wanted === 0) this.advance();
        break;
    }
  }
}
