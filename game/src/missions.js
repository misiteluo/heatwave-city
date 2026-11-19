// missions.js — the nine-job story of Nico Serrano, a driver who washes
// up in Heatwave City with a burnt-out past, and Valentina "Val" Rojas,
// the fixer who turns his wheel into a living. Marco Delgado's casino
// empire is the rot under the neon; by the finale Nico is running from
// every siren in the city to a lighthouse on Gull Island.
//
// A mission is a list of steps. Step kinds: goto, steal, deliver,
// follow, fight, hold, race, destroy, flyreach, pickup, survive.
// The runner owns dialogue, markers, timers, fail states and retry.

import { dist2d, angleDelta, clamp, blockCentre } from './config.js';
import { Enemy } from './combat.js';
import { Car } from './vehicles.js';

const BC = (i, j) => ({ x: blockCentre(i), z: blockCentre(j) });
const GARAGE = { x: BC(2, 5).x, z: BC(2, 5).z + 16 };
const PLAZA = BC(5, 5);
const HELIPAD = BC(10, 5);
const ISLAND_PAD = { x: -16, z: 500 };
const LIGHTHOUSE = { x: 14, z: 484 };

export const MISSIONS = [
  {
    title: 'Job 1 — First Gear',
    reward: 600,
    intro: [
      { who: 'Val', text: 'Nico Serrano. Heard you can drive. A gold Comet GT sits on the Midtown lot with my name on it.' },
      { who: 'Val', text: 'Take it. Bring it to Priya\'s Auto Works. Try not to redecorate it on the way.' },
    ],
    steps: [
      { kind: 'steal', text: 'Steal the gold Comet GT on the Midtown lot', car: 'comet', say: { who: 'Priya', text: 'That\'s my bay you\'re aiming for, hotshot. Door\'s open.' } },
      { kind: 'deliver', text: 'Deliver the Comet to Priya\'s Auto Works', x: GARAGE.x, z: GARAGE.z },
    ],
  },
  {
    title: 'Job 2 — Hot Freight',
    reward: 900,
    timeLimit: 240,
    intro: [
      { who: 'Val', text: 'A crate came off a freighter at the Portside sheds. It is extremely not paperwork.' },
      { who: 'Val', text: 'Collect it, take it to the Marina Hotel. The PD have a new toy budget — expect company.' },
    ],
    steps: [
      { kind: 'pickup', text: 'Collect the crate at the Portside sheds', x: -228, z: -69 },
      { kind: 'goto', text: 'Deliver the crate to the Marina Hotel', x: 207, z: -92, heat: 2, say: { who: 'Val', text: 'Scanner chatter just lit up. Move, Nico.' } },
    ],
  },
  {
    title: 'Job 3 — Tail of the Tape',
    reward: 850,
    intro: [
      { who: 'Val', text: 'Silas Kane — Delgado\'s right hand — leaves the Coral Casino in a black sedan, right about now.' },
      { who: 'Val', text: 'Tail him to wherever he\'s going. Stay close enough to see, far enough to breathe. 16 to 60 metres.' },
    ],
    steps: [
      { kind: 'follow', text: 'Tail Silas Kane — stay 16–60m back', say: { who: 'Val', text: 'He\'s rolling. Softly, Nico.' } },
    ],
  },
  {
    title: 'Job 4 — Pier Pressure',
    reward: 1150,
    unlock: 'shotgun',
    intro: [
      { who: 'Val', text: 'Kane\'s meet was with his own crew — they\'re counting Delgado\'s money on the east pier tonight.' },
      { who: 'Val', text: 'Take the count back. I\'m sending you a shotgun. Try to keep the pier attached to the city.' },
    ],
    steps: [
      { kind: 'goto', text: 'Get to the east pier', x: 300, z: -96 },
      { kind: 'fight', text: 'Clear Kane\'s crew off the pier', x: 322, z: -96, count: 6, waves: 2 },
    ],
  },
  {
    title: 'Job 5 — Neon Grand Prix',
    reward: 1250,
    intro: [
      { who: 'Priya', text: 'Every Friday the city\'s wheelmen run the Neon Grand Prix. Delgado bets heavy against outsiders.' },
      { who: 'Priya', text: 'Eight checkpoints. Beat the clock and his money burns. I tuned your ride options — pick something quick.' },
    ],
    steps: [
      {
        kind: 'race', text: 'Run the Grand Prix checkpoints', startTime: 45, bonus: 13,
        points: [[-230, -230], [0, -230], [230, -184], [230, 0], [138, 92], [0, 184], [-184, 230], [-23, -23]],
      },
    ],
  },
  {
    title: 'Job 6 — Meridian Heat',
    reward: 2100,
    grantAtStart: 'smg',
    intro: [
      { who: 'Val', text: 'The big one. Meridian Bank, vault level three. Priya\'s crew needs the plaza held while they work.' },
      { who: 'Val', text: 'You\'ll want the SMG I left in your locker. Delgado will send everyone. Hold the plaza, Nico.' },
    ],
    steps: [
      { kind: 'goto', text: 'Get to the Meridian Bank plaza', x: PLAZA.x, z: PLAZA.z },
      { kind: 'hold', text: 'Hold the plaza while Priya\'s crew cracks the vault', x: PLAZA.x, z: PLAZA.z, seconds: 75, waves: 4, say: { who: 'Priya', text: 'Drills are hot. Whatever happens, we need the full time.' } },
    ],
  },
  {
    title: 'Job 7 — Rotor Blades',
    reward: 1650,
    intro: [
      { who: 'Val', text: 'Delgado keeps a ledger on Gull Island — names, bribes, Detective Cole\'s whole career in one case.' },
      { who: 'Val', text: 'The marina helicopter is fuelled. Fly out, land by the lighthouse, grab the case, fly it home.' },
    ],
    steps: [
      { kind: 'flyreach', text: 'Take the marina helicopter and fly to Gull Island', x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, radius: 26 },
      { kind: 'pickup', text: 'Grab the ledger case by the lighthouse', x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, radius: 4 },
      { kind: 'flyreach', text: 'Fly the case back to the marina helipad', x: HELIPAD.x, z: HELIPAD.z, radius: 15, land: true },
    ],
  },
  {
    title: 'Job 8 — Convoy Smash',
    reward: 1850,
    intro: [
      { who: 'Val', text: 'Three of Delgado\'s box trucks are moving product across the city tonight. Wreck all three.' },
      { who: 'Val', text: 'Ram them, shoot them, introduce them to architecture. Just make sure they stop moving forever.' },
    ],
    steps: [
      { kind: 'destroy', text: 'Wreck Delgado\'s three convoy trucks', count: 3 },
    ],
  },
  {
    title: 'Job 9 — Heatwave Finale',
    reward: 5000,
    intro: [
      { who: 'Val', text: 'Cole flipped — he\'s selling us all to Delgado tonight. The vault money is our exit ticket.' },
      { who: 'Val', text: 'Grab the cash case at Meridian, then run. Every star in the sky, Nico. Gull Island. Don\'t stop.' },
    ],
    steps: [
      { kind: 'pickup', text: 'Grab the cash case at Meridian Bank', x: PLAZA.x, z: PLAZA.z - 14, heat: 5 },
      { kind: 'goto', text: 'Escape to the Gull Island safehouse', x: -22, z: 462, say: { who: 'Val', text: 'I can hear the sirens from here. Causeway. NOW.' } },
      { kind: 'survive', text: 'Hold the island until Val arrives', x: 0, z: 478, radius: 55, seconds: 30, waves: 2 },
      { kind: 'goto', text: 'Get to the island helipad — Val is coming in low', x: ISLAND_PAD.x, z: ISLAND_PAD.z, radius: 9 },
    ],
  },
];

// A car that drives a waypoint route at cruise speed (follow target,
// convoy trucks). Steering is the police-style aim-at-point model.
export class RouteDriver {
  constructor(car, waypoints, speed = 13, loop = false) {
    this.car = car;
    this.points = waypoints;
    this.i = 0;
    this.speed = speed;
    this.loop = loop;
    this.done = false;
    this.parked = false;
  }

  update(dt, city) {
    const car = this.car;
    if (car.dead) { this.done = true; return; }
    if (this.parked) { car.drive(dt, { throttle: car.speed > 0.5 ? -0.6 : 0, steer: 0, handbrake: this.parked }, city); return; }
    const target = this.points[this.i];
    if (!target) { this.done = true; this.parked = true; return; }
    const d = dist2d(car.x, car.z, target[0], target[1]);
    if (d < 9) {
      this.i++;
      if (this.i >= this.points.length) {
        if (this.loop) this.i = 0;
        else { this.done = true; this.parked = true; }
      }
      return;
    }
    const want = Math.atan2(target[0] - car.x, target[1] - car.z);
    const delta = angleDelta(car.heading, want);
    const input = {
      throttle: car.speed < this.speed ? 0.8 : 0,
      steer: clamp(delta * 1.6, -1, 1),
      handbrake: false,
    };
    if (Math.abs(delta) > 2.4 && d < 15) input.throttle = -0.6;
    car.drive(dt, input, city);
  }
}

export class Missions {
  constructor(world) {
    this.world = world;
    this.index = 0;
    this.active = null;
    this.stage = 0;
    this.stageData = {};
    this.busy = false;
    this.failed = false;
    this.failText = '';
    this.timeLeft = 0;
    this.spawnedEnemies = [];
    this.spawnedCars = [];
    this.drivers = [];
    this.dialogue = [];
    this.dlgTimer = 0;
  }

  get done() { return this.index >= MISSIONS.length && !this.active; }
  currentStage() { return this.active ? this.active.steps[this.stage] : null; }

  say(who, text) { this.dialogue.push({ who, text }); }

  startNext() {
    if (this.index >= MISSIONS.length || this.active) return false;
    const def = MISSIONS[this.index];
    this.active = def;
    this.stage = 0;
    this.missionData = {};
    this.failed = false;
    this.busy = true;
    this.timeLeft = def.timeLimit || 0;
    this.world.hud.toast(def.title, 4200);
    if (this.world.audio) this.world.audio.sting();
    for (const line of def.intro) this.say(line.who, line.text);
    if (def.grantAtStart && !this.world.combat.unlocked[def.grantAtStart]) {
      this.world.combat.unlock(def.grantAtStart);
      this.world.hud.toast('New weapon in the locker: ' + def.grantAtStart.toUpperCase() + ' — press Q');
      this.world.hud.setWeapon(this.world.combat);
    }
    this.enterStage();
    return true;
  }

  enterStage() {
    const st = this.currentStage();
    this.stageData = {};
    if (!st) return;
    const w = this.world;
    if (st.heat) w.police.setWanted(Math.max(w.police.wanted, st.heat));
    if (st.say) this.say(st.say.who, st.say.text);
    switch (st.kind) {
      case 'steal': {
        const car = st.car === 'comet' ? w.traffic.comet : null;
        this.stageData.car = car;
        this.missionData.car = car;
        if (car) w.city.setMarker(car.x, car.z);
        break;
      }
      case 'follow': {
        const car = new Car(w.scene, 'sedan', 0x14161c, -69, 130, Math.PI / 2);
        car.occupied = true;
        this.spawnedCars.push(car);
        w.looseCars.push(car);
        this.stageData.car = car;
        this.stageData.driver = new RouteDriver(car, [[-23, 138], [184, 138], [184, 92], [276, 92], [318, 96]], 12.5);
        this.drivers.push(this.stageData.driver);
        this.stageData.spook = 0;
        this.stageData.lost = 0;
        w.city.setMarker(-69, 130);
        break;
      }
      case 'fight': {
        this.spawnWave(st, st.count);
        w.city.setMarker(st.x, st.z, 0xff5566);
        break;
      }
      case 'hold': {
        this.stageData.left = st.seconds;
        this.stageData.wave = 0;
        w.city.setMarker(st.x, st.z, 0xff5566);
        break;
      }
      case 'survive': {
        this.stageData.left = st.seconds;
        this.stageData.wave = 0;
        w.city.setMarker(st.x, st.z, 0xff5566);
        break;
      }
      case 'race': {
        this.stageData.point = 0;
        this.stageData.time = st.startTime;
        const p = st.points[0];
        w.city.setMarker(p[0], p[1], 0x4cc9f0);
        break;
      }
      case 'destroy': {
        // rectangular loops that stay on real road lines
        const routes = [
          { start: [-230, -184, 0], points: [[-230, 92], [-46, 92], [-46, -184], [-230, -184]] },
          { start: [230, 184, Math.PI], points: [[230, -92], [46, -92], [46, 184], [230, 184]] },
          { start: [-184, 230, Math.PI / 2], points: [[184, 230], [184, 46], [-184, 46], [-184, 230]] },
        ];
        this.stageData.trucks = [];
        for (let i = 0; i < st.count; i++) {
          const r = routes[i];
          const truck = new Car(w.scene, 'truck', 0x8c2f39, r.start[0], r.start[1], r.start[2], { boxColor: 0x3a3f4a });
          truck.occupied = true;
          this.spawnedCars.push(truck);
          w.looseCars.push(truck);
          const driver = new RouteDriver(truck, r.points, 10.5, true);
          this.drivers.push(driver);
          this.stageData.trucks.push(truck);
        }
        break;
      }
      default:
        w.city.setMarker(st.x, st.z);
    }
    w.hud.setObjective(this.active.title + ' — ' + st.text);
  }

  spawnWave(st, n, tough = 1) {
    const w = this.world;
    for (let i = 0; i < n; i++) {
      const a = (i / Math.max(1, n)) * Math.PI * 2 + Math.random() * 0.6;
      const r = st.kind === 'hold' || st.kind === 'survive' ? 20 + Math.random() * 6 : 7 + Math.random() * 3;
      const e = new Enemy(w.scene, st.x + Math.cos(a) * r, st.z + Math.sin(a) * r, tough + this.index * 0.12);
      w.enemies.push(e);
      this.spawnedEnemies.push(e);
    }
  }

  cleanup() {
    const w = this.world;
    for (const e of this.spawnedEnemies) {
      const i = w.enemies.indexOf(e);
      if (i >= 0) w.enemies.splice(i, 1);
      e.remove();
    }
    for (const car of this.spawnedCars) {
      const i = w.looseCars.indexOf(car);
      if (i >= 0) w.looseCars.splice(i, 1);
      car.remove();
    }
    this.spawnedEnemies = [];
    this.spawnedCars = [];
    this.drivers = [];
    w.city.clearMarker();
  }

  fail(reason) {
    if (!this.active || this.failed) return;
    this.failed = true;
    this.failText = reason;
    this.world.hud.showFail(this.active.title + ' failed — ' + reason + ' · Press Enter to retry');
    if (this.world.audio) this.world.audio.fail();
    this.world.city.clearMarker();
  }

  retry() {
    this.cleanup();
    this.active = null;
    this.failed = false;
    this.world.hud.hideFail();
    this.startNext();
  }

  onPlayerDown() {
    if (this.active && !this.failed) this.fail('Nico went down');
  }

  completeStage() {
    const w = this.world;
    this.stage++;
    if (this.stage >= this.active.steps.length) {
      const def = this.active;
      w.addCash(def.reward);
      w.hud.toast('Job complete — $' + def.reward.toLocaleString('en-US'), 4200);
      if (w.audio) w.audio.chime();
      if (def.unlock && !w.combat.unlocked[def.unlock]) {
        w.combat.unlock(def.unlock);
        w.hud.toast(def.unlock.toUpperCase() + ' unlocked — press Q to switch');
        w.hud.setWeapon(w.combat);
      }
      this.cleanup();
      this.index++;
      this.active = null;
      this.busy = false;
      w.saveProgress();
      if (this.index < MISSIONS.length) w.hud.setObjective('Press Enter — Val has another job');
      else {
        w.hud.setObjective('Story complete — Delgado is finished, and Heatwave City is yours. Free roam!');
        w.hud.toast('You finished the Heatwave City story. Free roam!', 6000);
      }
      return;
    }
    this.enterStage();
  }

  updateDialogue(dt) {
    const hud = this.world.hud;
    if (this.dlgTimer > 0) {
      this.dlgTimer -= dt;
      if (this.dlgTimer <= 0) hud.clearDialogue();
      return;
    }
    const line = this.dialogue.shift();
    if (line) {
      hud.setDialogue(line.who, line.text);
      this.dlgTimer = 3.8;
    }
  }

  update(dt) {
    this.updateDialogue(dt);
    for (const d of this.drivers) d.update(dt, this.world.city);
    if (!this.active || this.failed) return;
    const st = this.currentStage();
    if (!st) return;
    const w = this.world;
    if (this.timeLeft > 0) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.fail('Out of time'); return; }
    }
    const px = w.playerCar ? w.playerCar.x : w.player.x;
    const pz = w.playerCar ? w.playerCar.z : w.player.z;

    switch (st.kind) {
      case 'goto': {
        if (st.needCar && !w.playerCar) break;
        if (dist2d(px, pz, st.x, st.z) < (st.radius || 8)) this.completeStage();
        break;
      }
      case 'pickup': {
        if (!w.playerCar && !w.playerHeli && dist2d(px, pz, st.x, st.z) < (st.radius || 3)) this.completeStage();
        break;
      }
      case 'steal': {
        const car = this.stageData.car;
        if (car) {
          if (car.dead) { this.fail('The target car was wrecked'); break; }
          if (w.playerCar === car) this.completeStage();
          else w.city.setMarker(car.x, car.z);
        }
        break;
      }
      case 'deliver': {
        const car = this.missionData.car;
        if (car && car.dead) { this.fail('The Comet was wrecked'); break; }
        if (car && w.playerCar === car && dist2d(px, pz, st.x, st.z) < 9) this.completeStage();
        else if (car && w.playerCar !== car) w.hud.setObjective(this.active.title + ' — ' + st.text + ' (in the Comet)');
        break;
      }
      case 'follow': {
        const d = this.stageData;
        const car = d.car;
        if (!car || car.dead) { this.fail('Kane\'s car was destroyed'); break; }
        const dist = dist2d(px, pz, car.x, car.z);
        w.city.setMarker(car.x, car.z);
        if (dist < 13) {
          d.spook += dt;
          w.hud.setObjective(this.active.title + ' — TOO CLOSE — back off! (' + Math.max(0, 5 - d.spook).toFixed(0) + 's)');
          if (d.spook > 1.2 && w.audio) w.audio.spook();
          if (d.spook >= 5) { this.fail('Kane spotted the tail'); break; }
        } else if (dist > 75) {
          d.lost += dt;
          w.hud.setObjective(this.active.title + ' — You\'re losing him! (' + Math.max(0, 6 - d.lost).toFixed(0) + 's)');
          if (d.lost >= 6) { this.fail('Kane got away'); break; }
        } else {
          d.spook = Math.max(0, d.spook - dt * 1.5);
          d.lost = Math.max(0, d.lost - dt * 1.5);
          w.hud.setObjective(this.active.title + ' — ' + st.text + ' (' + Math.round(dist) + 'm)');
        }
        if (d.driver.done) {
          this.say('Val', 'He led us to the pier count room. That\'s gold, Nico — file it away.');
          this.completeStage();
        }
        break;
      }
      case 'fight': {
        const alive = this.spawnedEnemies.filter((e) => !e.dead).length;
        w.hud.setObjective(this.active.title + ' — ' + st.text + ' (' + alive + ' left)');
        if (alive === 0) {
          if ((this.stageData.wavesLeft || 0) > 0) break;
          if (st.waves && !this.stageData.secondWave) {
            this.stageData.secondWave = true;
            this.spawnWave(st, Math.ceil(st.count / 2), 1.2);
            w.hud.toast('More of them — hold the pier!');
            break;
          }
          this.completeStage();
        }
        break;
      }
      case 'hold':
      case 'survive': {
        const d = this.stageData;
        const radius = st.radius || 13;
        if (dist2d(px, pz, st.x, st.z) < radius) {
          d.left -= dt;
          const wave = Math.floor((st.seconds - d.left) / (st.seconds / st.waves));
          if (wave > d.wave) {
            d.wave = wave;
            this.spawnWave(st, 3, 1.15);
            w.hud.toast('Another wave — hold on!');
          }
          w.hud.setObjective(this.active.title + ' — ' + st.text + ': ' + Math.ceil(d.left) + 's');
          if (d.left <= 0) {
            for (const e of this.spawnedEnemies) if (!e.dead) e.hurt(9999, w);
            this.completeStage();
          }
        } else {
          w.hud.setObjective(this.active.title + ' — Get back to the zone!');
        }
        break;
      }
      case 'race': {
        const d = this.stageData;
        d.time -= dt;
        const p = st.points[d.point];
        if (dist2d(px, pz, p[0], p[1]) < 13) {
          d.point++;
          d.time += st.bonus;
          if (w.audio) w.audio.pickup();
          if (d.point >= st.points.length) { this.completeStage(); break; }
          const np = st.points[d.point];
          w.city.setMarker(np[0], np[1], 0x4cc9f0);
        }
        w.hud.setObjective(this.active.title + ' — Checkpoint ' + (d.point + 1) + '/' + st.points.length + ' · ' + Math.max(0, d.time).toFixed(0) + 's');
        if (d.time <= 0) this.fail('The clock beat you');
        break;
      }
      case 'destroy': {
        const left = this.stageData.trucks.filter((t) => !t.dead).length;
        w.hud.setObjective(this.active.title + ' — ' + st.text + ' (' + left + ' rolling)');
        // keep the marker on the nearest living truck
        let best = null, bd = 1e9;
        for (const t of this.stageData.trucks) {
          if (t.dead) continue;
          const dd = dist2d(px, pz, t.x, t.z);
          if (dd < bd) { bd = dd; best = t; }
        }
        if (best) w.city.setMarker(best.x, best.z, 0xff5566);
        if (left === 0) this.completeStage();
        break;
      }
      case 'flyreach': {
        if (w.playerHeli) {
          const h = w.playerHeli;
          const dd = dist2d(h.x, h.z, st.x, st.z);
          if (dd < (st.radius || 15) && (!st.land || h.landed)) this.completeStage();
        }
        break;
      }
    }
    if (this.timeLeft > 0 && this.active) {
      // time pressure rides along under the objective via toast cadence
      if (Math.ceil(this.timeLeft) % 30 === 0 && Math.abs(this.timeLeft % 1) < dt) {
        w.hud.toast(Math.ceil(this.timeLeft) + 's left on the clock');
      }
    }
  }
}
