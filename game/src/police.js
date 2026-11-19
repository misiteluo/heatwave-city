// police.js — the Heatwave PD. Owns the wanted level (0–5 stars),
// spawns cruisers in proportion to the heat, steers them in pursuit
// with a little target prediction, plants roadblocks at four stars,
// and from three stars puts a helicopter over the player whose
// spotlight keeps the stars from decaying. Busts happen when cruisers
// pin a slow or on-foot player long enough.

import { Car, Helicopter } from './vehicles.js';
import { HALF, WANTED_DECAY_SECONDS, BUSTED_RADIUS, BUSTED_SECONDS, angleDelta, clamp, dist2d } from './config.js';

export class Police {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.wanted = 0;
    this.cars = [];
    this.blocks = [];
    this.heli = null;
    this.hiddenTimer = 0;
    this.bustTimer = 0;
    this.spawnTimer = 0;
    this.blockCd = 0;
    this.onBusted = null;
    this.lastTX = 0; this.lastTZ = 0;
    this.velX = 0; this.velZ = 0;
  }

  setWanted(n) {
    const next = clamp(Math.round(n), 0, 5);
    if (next > this.wanted) this.hiddenTimer = 0;
    this.wanted = next;
  }

  addWanted(n) { this.setWanted(this.wanted + n); }

  targetCount() { return [0, 2, 3, 5, 6, 8][this.wanted] || 0; }

  spawnOne(world) {
    const target = world.playerCar || world.player;
    for (let tries = 0; tries < 8; tries++) {
      const vertical = Math.random() < 0.5;
      const li = Math.floor(Math.random() * 13);
      const line = -HALF + li * 46;
      const along = -HALF + Math.random() * HALF * 2;
      const x = vertical ? line : along;
      const z = vertical ? along : line;
      const d = dist2d(x, z, target.x, target.z);
      if (d < 48 || d > 150) continue;
      const car = new Car(this.scene, 'police', 0xf4f6f8, x, z, Math.random() * Math.PI * 2, { police: true });
      this.cars.push(car);
      return car;
    }
    return null;
  }

  spawnRoadblock(world) {
    const target = world.playerCar || world.player;
    const heading = world.playerCar ? world.playerCar.heading : world.player.heading;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const bx = target.x + fx * 58, bz = target.z + fz * 58;
    if (!this.city.isLand(bx, bz)) return;
    const perp = heading + Math.PI / 2;
    for (let i = -1; i <= 1; i++) {
      const x = bx + Math.sin(perp) * i * 5.2;
      const z = bz + Math.cos(perp) * i * 5.2;
      if (!this.city.isLand(x, z)) continue;
      const car = new Car(this.scene, 'police', 0xf4f6f8, x, z, perp, { police: true });
      car.ai = null;
      this.blocks.push(car);
    }
    this.blockCd = 26;
  }

  updateHeli(dt, world, t) {
    const target = world.playerCar || world.player;
    if (this.wanted >= 3) {
      if (!this.heli) {
        this.heli = new Helicopter(this.scene, 0x2456c8, target.x + 60, target.z - 60, { police: true, heading: 0 });
        this.heli.alt = 20;
      }
      this.heli.aiMove(dt, target.x + this.velX * 0.5, target.z + this.velZ * 0.5, 15 + Math.sin(t * 0.4) * 2, this.city);
    } else if (this.heli) {
      this.heli.aiMove(dt, this.heli.x + 300, this.heli.z - 300, 26, this.city);
      if (dist2d(this.heli.x, this.heli.z, target.x, target.z) > 260) {
        this.heli.remove();
        this.heli = null;
      }
    }
  }

  update(dt, world, t) {
    const target = world.playerCar || world.playerHeli || world.player;
    // target velocity estimate (for pursuit prediction + heli lead)
    if (dt > 0) {
      this.velX = (target.x - this.lastTX) / dt;
      this.velZ = (target.z - this.lastTZ) / dt;
      const m = Math.hypot(this.velX, this.velZ);
      if (m > 60) { this.velX *= 60 / m; this.velZ *= 60 / m; }
    }
    this.lastTX = target.x; this.lastTZ = target.z;

    if (this.wanted <= 0) {
      // stand down: cruisers leave, blocks clear
      for (const car of this.cars) car.remove();
      for (const car of this.blocks) car.remove();
      this.cars = []; this.blocks = [];
      if (this.heli) this.updateHeli(dt, world, t);
      this.bustTimer = 0;
      world.hud.setBustProgress(0);
      return;
    }

    // who can see the player?
    let seen = false;
    for (const car of this.cars) {
      if (!car.dead && dist2d(car.x, car.z, target.x, target.z) < 58) { seen = true; break; }
    }
    if (!seen && this.heli && dist2d(this.heli.x, this.heli.z, target.x, target.z) < 78) seen = true;
    if (seen) this.hiddenTimer = 0;
    else {
      this.hiddenTimer += dt;
      if (this.hiddenTimer > WANTED_DECAY_SECONDS) {
        this.hiddenTimer = 0;
        this.setWanted(this.wanted - 1);
        if (this.wanted > 0) world.hud.toast('The heat cools — ' + this.wanted + ' star' + (this.wanted > 1 ? 's' : ''));
        else world.hud.toast('You lost the heat');
      }
    }

    // maintain cruiser strength
    this.spawnTimer -= dt;
    const alive = this.cars.filter((c) => !c.dead).length;
    if (alive < this.targetCount() && this.spawnTimer <= 0) {
      this.spawnTimer = 1.6;
      this.spawnOne(world);
    }
    // recycle distant or long-dead cruisers
    this.cars = this.cars.filter((car) => {
      if (dist2d(car.x, car.z, target.x, target.z) > 430) { car.remove(); return false; }
      return true;
    });

    // pursuit driving
    const px = target.x + this.velX * 0.42;
    const pz = target.z + this.velZ * 0.42;
    for (const car of this.cars) {
      car.flashLights(t);
      if (car.dead || car.occupied) continue;
      const d = dist2d(car.x, car.z, px, pz);
      const want = Math.atan2(px - car.x, pz - car.z);
      const dh = angleDelta(car.heading, want);
      const input = { throttle: 1, steer: clamp(dh * 2.1, -1, 1), handbrake: Math.abs(dh) > 1.9 && d < 16 };
      if (Math.abs(dh) > 2.5 && d < 9) input.throttle = -1;
      if (d < 3.4) input.throttle = 0.2;
      car.drive(dt, input, this.city);
    }

    // roadblocks at four stars
    this.blockCd -= dt;
    if (this.wanted >= 4 && this.blocks.length === 0 && this.blockCd <= 0 && world.playerCar) {
      this.spawnRoadblock(world);
    }
    for (const car of this.blocks) car.flashLights(t);
    if (this.blocks.length && (this.wanted < 4 || dist2d(this.blocks[0].x, this.blocks[0].z, target.x, target.z) > 150)) {
      for (const car of this.blocks) car.remove();
      this.blocks = [];
    }

    this.updateHeli(dt, world, t);

    // bust logic: pinned and surrounded, or cornered on foot
    let pinned = false;
    if (!world.playerHeli) {
      const speed = world.playerCar ? Math.abs(world.playerCar.speed) : 0;
      if (world.playerCar && speed < 2.6) {
        let near = 0;
        for (const car of this.cars) if (!car.dead && dist2d(car.x, car.z, target.x, target.z) < 9) near++;
        pinned = near >= 2;
      } else if (!world.playerCar) {
        for (const car of this.cars) {
          if (!car.dead && dist2d(car.x, car.z, target.x, target.z) < BUSTED_RADIUS + 1.2) { pinned = true; break; }
        }
      }
    }
    if (pinned) {
      this.bustTimer += dt;
      world.hud.setBustProgress(this.bustTimer / BUSTED_SECONDS);
      if (this.bustTimer >= BUSTED_SECONDS && this.onBusted) {
        this.bustTimer = 0;
        world.hud.setBustProgress(0);
        this.onBusted();
      }
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 1.6);
      world.hud.setBustProgress(this.bustTimer / BUSTED_SECONDS);
    }
  }
}
