// missions.js — the five-job story of Rico Vale, a wheelman new in town,
// and Sable Quinn, the fixer who phones him work from the Sun Pier cafe.
// Each job is a short list of stages: reach a pillar of light, drive a
// specific car somewhere, survive a shootout, hold a point, escape.
// Stages drive the HUD objective, the gold minimap dot and the marker.

import { dist2d } from './config.js';
import { Enemy } from './combat.js';

export const FIXER = 'Sable Quinn';
export const HERO = 'Rico Vale';

// Stage kinds: goto | driveCar | fight | hold | deliverCar
export const MISSIONS = [
  {
    title: 'Job 1 — First Wheels',
    intro: 'Sable: "Rico. A turquoise coupe near the north-west plaza has my name on it. Take it, bring it to the Coral Garage."',
    reward: 450,
    stages: [
      { kind: 'carTarget', text: 'Steal the marked coupe', x: -170.2, z: 20 },
      { kind: 'goto', text: 'Deliver it to the Coral Garage', x: 132, z: -88, needCar: true },
    ],
  },
  {
    title: 'Job 2 — Hot Parcel',
    intro: 'Sable: "Pick up the parcel by the marina steps, then get it to the Palms Hotel. The PD will not wave you through."',
    reward: 700,
    stages: [
      { kind: 'goto', text: 'Collect the parcel at the marina steps', x: 0, z: 232 },
      { kind: 'goto', text: 'Deliver the parcel to the Palms Hotel', x: -88, z: -132, heat: 2 },
    ],
  },
  {
    title: 'Job 3 — Beach Debt',
    intro: 'Sable: "Dario Venn owes me rent on three beach bars. Collect it in person — he keeps muscle around him."',
    reward: 950,
    stages: [
      { kind: 'goto', text: 'Find Dario Venn on the beach', x: 60, z: 238 },
      { kind: 'fight', text: 'Collect the debt — drop Venn and his crew', x: 60, z: 238, count: 3 },
      { kind: 'carTarget', text: "Take Venn's car as payment", x: 49.8, z: 196 },
      { kind: 'goto', text: 'Park it at the Sun Pier lot', x: 132, z: 196, needCar: true },
    ],
  },
  {
    title: 'Job 4 — Four-Star Run',
    intro: 'Sable: "That stunt lit up every scanner in the city. Lose them and reach the lighthouse safehouse. Do not stop."',
    reward: 1200,
    stages: [
      { kind: 'goto', text: 'Reach the lighthouse safehouse', x: -198, z: 232, heat: 4 },
    ],
  },
  {
    title: 'Job 5 — The Meridian Job',
    intro: 'Sable: "Last one, Rico. The Meridian Bank vault crew needs sixty seconds covered. Hold the plaza, then vanish to the docks."',
    reward: 2200,
    stages: [
      { kind: 'goto', text: 'Get to the Meridian Bank plaza', x: 44, z: 44 },
      { kind: 'hold', text: 'Hold the plaza while the crew works', x: 44, z: 44, seconds: 30, waves: 3 },
      { kind: 'goto', text: 'Escape to the pier at the docks', x: 176, z: 252, heat: 3 },
    ],
  },
];

export class Missions {
  constructor(world) {
    this.world = world;
    this.index = 0;       // next mission to run
    this.active = null;   // current mission def
    this.stage = 0;
    this.stageData = {};
    this.busy = false;
  }

  get done() { return this.index >= MISSIONS.length && !this.active; }

  startNext() {
    if (this.index >= MISSIONS.length) return false;
    this.active = MISSIONS[this.index];
    this.stage = 0;
    this.busy = true;
    this.world.hud.toast(this.active.title, 4200);
    this.world.hud.setObjective(this.active.intro);
    if (this.world.audio) this.world.audio.sting();
    this.enterStage();
    return true;
  }

  currentStage() { return this.active ? this.active.stages[this.stage] : null; }

  enterStage() {
    const st = this.currentStage();
    this.stageData = {};
    if (!st) return;
    const w = this.world;
    if (st.heat) w.police.setWanted(Math.max(w.police.wanted, st.heat));
    if (st.kind === 'carTarget') {
      // find the parked car parked at the stage spot and gild it
      let best = null, bd = 30;
      for (const car of w.traffic.parked) {
        const d = dist2d(car.x, car.z, st.x, st.z);
        if (d < bd) { bd = d; best = car; }
      }
      this.stageData.car = best;
      w.city.setMarker(st.x, st.z);
    } else if (st.kind === 'fight') {
      this.stageData.enemies = [];
      for (let i = 0; i < st.count; i++) {
        const a = (i / st.count) * Math.PI * 2;
        const e = new Enemy(w.scene, st.x + Math.cos(a) * 7, st.z + Math.sin(a) * 7, 1 + this.index * 0.15);
        w.enemies.push(e);
        this.stageData.enemies.push(e);
      }
      w.city.setMarker(st.x, st.z, 0xff5566);
    } else if (st.kind === 'hold') {
      this.stageData.left = st.seconds;
      this.stageData.wave = 0;
      w.city.setMarker(st.x, st.z, 0xff5566);
    } else {
      w.city.setMarker(st.x, st.z);
    }
    w.hud.setObjective(this.active.title + ' — ' + st.text);
  }

  completeStage() {
    const w = this.world;
    this.stage++;
    if (this.stage >= this.active.stages.length) {
      const reward = this.active.reward;
      w.addCash(reward);
      w.hud.toast('Job complete — $' + reward.toLocaleString('en-US'), 4200);
      if (w.audio) w.audio.chime();
      w.city.clearMarker();
      this.index++;
      this.active = null;
      this.busy = false;
      w.saveProgress();
      if (this.index < MISSIONS.length) {
        w.hud.setObjective('Call Sable when ready — press Enter for the next job');
      } else {
        w.hud.setObjective('Story complete — Heatwave City is yours. Free roam!');
        w.hud.toast('You finished Sable Quinn\'s story. Free roam!', 6000);
      }
      return;
    }
    this.enterStage();
  }

  update(dt) {
    if (!this.active) return;
    const st = this.currentStage();
    if (!st) return;
    const w = this.world;
    const px = w.playerCar ? w.playerCar.x : w.player.x;
    const pz = w.playerCar ? w.playerCar.z : w.player.z;
    const d = dist2d(px, pz, st.x, st.z);

    if (st.kind === 'goto') {
      if (st.needCar && !w.playerCar) {
        w.hud.setObjective(this.active.title + ' — ' + st.text + ' (you need the car)');
        return;
      }
      if (d < 7) this.completeStage();
    } else if (st.kind === 'carTarget') {
      if (w.playerCar && this.stageData.car && w.playerCar === this.stageData.car) this.completeStage();
      else if (w.playerCar && d < 9 && !this.stageData.car) this.completeStage();
    } else if (st.kind === 'fight') {
      const alive = this.stageData.enemies.filter((e) => !e.dead).length;
      w.hud.setObjective(this.active.title + ' — ' + st.text + ' (' + alive + ' left)');
      if (alive === 0) this.completeStage();
    } else if (st.kind === 'hold') {
      if (d < 11) {
        this.stageData.left -= dt;
        // waves of gunmen as the timer runs
        const wave = Math.floor((st.seconds - this.stageData.left) / (st.seconds / st.waves));
        if (wave > this.stageData.wave) {
          this.stageData.wave = wave;
          for (let i = 0; i < 3; i++) {
            const a = Math.random() * Math.PI * 2;
            w.enemies.push(new Enemy(w.scene, st.x + Math.cos(a) * 20, st.z + Math.sin(a) * 20, 1.2));
          }
          w.hud.toast('More of Venn\'s friends — hold on!');
        }
        w.hud.setObjective(this.active.title + ' — Hold the plaza: ' + Math.ceil(this.stageData.left) + 's');
        if (this.stageData.left <= 0) {
          // clear remaining attackers as the crew escapes
          for (const e of w.enemies) if (!e.dead) e.hurt(9999, w);
          this.completeStage();
        }
      } else {
        w.hud.setObjective(this.active.title + ' — Get back to the plaza!');
      }
    }
  }
}
