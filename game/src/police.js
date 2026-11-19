// police.js — the Heatwave PD. Owns the wanted level (0-5 stars), spawns
// patrol cars at the map edges in proportion to the heat, steers them in
// pursuit, plants roadblocks at high stars, and watches for the bust
// condition (a cruiser parked beside an on-foot player for 3 seconds).

import { Car } from './vehicles.js';
import { HALF, WANTED_DECAY_SECONDS, BUSTED_RADIUS, BUSTED_SECONDS, angleDelta, clamp, dist2d } from './config.js';

export class Police {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.cars = [];
    this.blocks = [];
    this.wanted = 0;
    this.unseenTimer = 0;
    this.spawnTimer = 0;
    this.bustTimer = 0;
    this.blockTimer = 0;
    this.onBusted = null;
  }

  setWanted(n) {
    this.wanted = clamp(Math.round(n), 0, 5);
    if (this.wanted === 0) {
      for (const c of this.cars) c.remove();
      for (const c of this.blocks) c.remove();
      this.cars = []; this.blocks = [];
      this.bustTimer = 0;
    }
  }

  addWanted(n) {
    this.setWanted(this.wanted + n);
    this.unseenTimer = 0;
  }

  targetCount() {
    return [0, 2, 3, 4, 6, 8][this.wanted] || 0;
  }

  spawnOne(world) {
    const px = world.playerCar ? world.playerCar.x : world.player.x;
    const pz = world.playerCar ? world.playerCar.z : world.player.z;
    const side = Math.floor(Math.random() * 4);
    let x = px, z = pz;
    if (side === 0) { x = px - 95; z = pz + (Math.random() - 0.5) * 50; }
    if (side === 1) { x = px + 95; z = pz + (Math.random() - 0.5) * 50; }
    if (side === 2) { z = pz - 95; x = px + (Math.random() - 0.5) * 50; }
    if (side === 3) { z = pz + 95; x = px + (Math.random() - 0.5) * 50; }
    x = clamp(x, -HALF - 14, HALF + 14); z = clamp(z, -HALF - 14, HALF + 30);
    // snap to the nearest road line so cruisers enter on a street
    const snap = (v) => {
      let best = this.city.roadsX[0], bd = 1e9;
      for (const l of this.city.roadsX) { const d = Math.abs(l - v); if (d < bd) { bd = d; best = l; } }
      return best;
    };
    if (side < 2) x = snap(x); else z = snap(z);
    const car = new Car(this.scene, 0x1c2733, x, z, Math.atan2(px - x, pz - z), { police: true });
    car.occupied = true;
    this.cars.push(car);
  }

  spawnRoadblock(world) {
    const ahead = 62;
    const px = world.playerCar ? world.playerCar.x : world.player.x;
    const pz = world.playerCar ? world.playerCar.z : world.player.z;
    const heading = world.playerCar ? world.playerCar.heading : world.player.heading;
    const bx = clamp(px + Math.sin(heading) * ahead, -HALF, HALF);
    const bz = clamp(pz + Math.cos(heading) * ahead, -HALF, HALF + 20);
    for (let i = -1; i <= 1; i++) {
      const car = new Car(this.scene, 0x1c2733, bx + Math.cos(heading) * i * 4.6, bz - Math.sin(heading) * i * 4.6,
        heading + Math.PI / 2, { police: true });
      car.occupied = true;
      car.speed = 0;
      this.blocks.push(car);
    }
  }

  update(dt, world, t) {
    if (this.wanted <= 0) { this.bustTimer = 0; return; }
    this.spawnTimer -= dt;
    if (this.cars.length < this.targetCount() && this.spawnTimer <= 0) {
      this.spawnTimer = 1.4;
      this.spawnOne(world);
    }
    if (this.wanted >= 4) {
      this.blockTimer -= dt;
      if (this.blockTimer <= 0 && this.blocks.length === 0) {
        this.blockTimer = 26;
        this.spawnRoadblock(world);
      }
    } else if (this.blocks.length) {
      for (const c of this.blocks) c.remove();
      this.blocks = [];
    }

    const tx = world.playerCar ? world.playerCar.x : world.player.x;
    const tz = world.playerCar ? world.playerCar.z : world.player.z;
    let anySees = false;
    for (const car of this.cars) {
      const d = dist2d(car.x, car.z, tx, tz);
      if (d < 70) anySees = true;
      const wantHeading = Math.atan2(tx - car.x, tz - car.z);
      const delta = angleDelta(car.heading, wantHeading);
      const input = { throttle: 0, steer: clamp(delta * 1.5, -1, 1), handbrake: false };
      const cruise = world.playerCar ? 30 : 17;
      if (d > 7) input.throttle = car.speed < cruise ? 0.95 : 0;
      else if (world.playerCar) input.throttle = 0.55; // keep ramming pressure
      else input.throttle = car.speed > 2 ? -0.5 : 0;   // on foot: pull up alongside
      if (Math.abs(delta) > 2.4 && d < 16) input.throttle = -0.7; // reverse out of a bad angle
      car.drive(dt, input, this.city);
      car.flashLights(t);
      if (car.dead) { car.speed = 0; }
    }
    for (const b of this.blocks) b.flashLights(t);

    // line-of-sight bookkeeping for star decay
    if (anySees) this.unseenTimer = 0;
    else {
      this.unseenTimer += dt;
      if (this.unseenTimer >= WANTED_DECAY_SECONDS) {
        this.unseenTimer = 0;
        this.setWanted(this.wanted - 1);
        if (world.hud) world.hud.toast('You lost the heat — one star gone');
      }
    }

    // bust check: on foot, any cruiser close and slow for BUSTED_SECONDS
    if (!world.playerCar) {
      let close = false;
      for (const car of this.cars) {
        if (dist2d(car.x, car.z, tx, tz) < BUSTED_RADIUS + 1.6 && Math.abs(car.speed) < 6) close = true;
      }
      if (close) {
        this.bustTimer += dt;
        if (world.hud) world.hud.setBustProgress(this.bustTimer / BUSTED_SECONDS);
        if (this.bustTimer >= BUSTED_SECONDS && this.onBusted) this.onBusted();
      } else {
        this.bustTimer = Math.max(0, this.bustTimer - dt * 1.6);
        if (world.hud) world.hud.setBustProgress(this.bustTimer / BUSTED_SECONDS);
      }
    } else {
      this.bustTimer = 0;
      if (world.hud) world.hud.setBustProgress(0);
    }
  }
}
