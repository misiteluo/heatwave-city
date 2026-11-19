// traffic.js — civilian traffic on the road grid. Drivers hold a lane
// (road centre + right-hand offset), brake for obstacles and red
// lights, honk when stuck near the player, and sometimes turn at
// intersections. Parked cars line the kerbs and lots — every one of
// them can be taken. Cars that fall too far behind the player are
// recycled to streets ahead so the city never empties.

import { Car } from './vehicles.js';
import { CAR_COLORS, HALF, blockCentre, roadLine, clamp, dist2d, angleDelta, makeRng } from './config.js';

const LANE = 3.4;
const MOVING_TYPES = ['sedan', 'sedan', 'sedan', 'taxi', 'sports', 'pickup', 'moto', 'truck'];

export class Traffic {
  constructor(scene, city, seed) {
    this.scene = scene;
    this.city = city;
    this.rng = makeRng(seed * 31 + 7);
    this.cars = [];
    this.parked = [];
    this.hornCooldown = 0;
    this.spawnMoving(18);
    this.spawnParked();
  }

  lanePose(vertical, line, dir) {
    if (vertical) return { x: line + (dir > 0 ? -LANE : LANE), heading: dir > 0 ? 0 : Math.PI };
    return { z: line + (dir > 0 ? LANE : -LANE), heading: dir > 0 ? Math.PI / 2 : -Math.PI / 2 };
  }

  randomRoadPose() {
    const rng = this.rng;
    const vertical = rng() < 0.5;
    const line = this.city.roadsX[Math.floor(rng() * this.city.roadsX.length)];
    const dir = rng() < 0.5 ? 1 : -1;
    const along = -HALF + rng() * HALF * 2;
    const pose = this.lanePose(vertical, line, dir);
    return { vertical, line, dir, x: vertical ? pose.x : along, z: vertical ? along : pose.z, heading: pose.heading };
  }

  spawnMoving(n) {
    const rng = this.rng;
    for (let i = 0; i < n; i++) {
      const p = this.randomRoadPose();
      const type = MOVING_TYPES[Math.floor(rng() * MOVING_TYPES.length)];
      const car = new Car(this.scene, type, CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)], p.x, p.z, p.heading);
      car.occupied = true;
      car.ai = { vertical: p.vertical, line: p.line, dir: p.dir, cruise: 11 + rng() * 6, blocked: 0, deadTimer: 0 };
      this.cars.push(car);
    }
  }

  spawnParked() {
    const rng = this.rng;
    const spots = [];
    // kerbside spots: [x, z, heading]
    const kerb = (roadIdx, blockIdx, side) => [roadLine(roadIdx) + side * 5.9, blockCentre(blockIdx), side > 0 ? Math.PI : 0];
    const kerbH = (blockIdx, roadIdx, side) => [blockCentre(blockIdx), roadLine(roadIdx) + side * 5.9, side > 0 ? -Math.PI / 2 : Math.PI / 2];
    spots.push(kerb(2, 3, -1), kerb(2, 7, 1), kerb(4, 2, -1), kerb(4, 10, 1), kerb(6, 5, -1),
      kerb(8, 3, 1), kerb(8, 8, -1), kerb(10, 6, 1), kerb(11, 2, -1), kerb(3, 9, 1),
      kerbH(5, 4, -1), kerbH(7, 6, 1), kerbH(2, 8, -1), kerbH(9, 10, 1), kerbH(6, 1, -1), kerbH(10, 9, -1));
    for (const [x, z, h] of spots) {
      const type = ['sedan', 'sedan', 'pickup', 'sports', 'taxi'][Math.floor(rng() * 5)];
      const car = new Car(this.scene, type, CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)], x, z, h + (rng() - 0.5) * 0.05);
      car.occupied = rng() < 0.3;
      this.parked.push(car);
    }
    // a sedan waiting right by the player's start corner
    const starter = new Car(this.scene, 'sedan', 0x3ec1d3, -196, 178.1, Math.PI / 2);
    this.parked.push(starter);
    // THE gold Comet sports coupe on the Midtown parking lot (mission 1)
    const comet = new Car(this.scene, 'sports', 0xffd23f, blockCentre(6) - 6, blockCentre(9) + 6, Math.PI / 2, { marker: true });
    this.parked.push(comet);
    this.comet = comet;
    // a pickup on the beach lot and a motorcycle by the marina
    this.parked.push(new Car(this.scene, 'pickup', 0x06d6a0, blockCentre(0) + 4, blockCentre(10) + 4, 0));
    this.parked.push(new Car(this.scene, 'moto', 0xef476f, blockCentre(10) - 8, blockCentre(5) + 10, Math.PI));
  }

  allCars() { return this.cars.concat(this.parked); }

  takeParked(car) {
    const i = this.parked.indexOf(car);
    if (i >= 0) this.parked.splice(i, 1);
  }
  takeMoving(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
  }

  obstacleAhead(car, world) {
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const check = (ox, oz, r) => {
      const dx = ox - car.x, dz = oz - car.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      return ahead > 0.5 && ahead < r && side < 2.3;
    };
    for (const other of this.cars) if (other !== car && !other.dead && check(other.x, other.z, 9.5)) return true;
    for (const other of this.parked) if (check(other.x, other.z, 8)) return true;
    if (world.playerCar) { if (check(world.playerCar.x, world.playerCar.z, 9.5)) return true; }
    else if (check(world.player.x, world.player.z, 7)) return true;
    for (const cop of world.police.cars) if (check(cop.x, cop.z, 9.5)) return true;
    for (const cop of world.police.blocks) if (check(cop.x, cop.z, 9.5)) return true;
    return false;
  }

  // distance to the stop line of the next intersection on a red light
  redLightStop(car) {
    const ai = car.ai;
    const axis = this.city.lightAxis();
    if ((ai.vertical && axis === 'NS') || (!ai.vertical && axis === 'EW')) return Infinity;
    const lines = ai.vertical ? this.city.roadsZ : this.city.roadsX;
    const pos = ai.vertical ? car.z : car.x;
    let best = Infinity;
    for (const l of lines) {
      const d = (l - pos) * ai.dir;
      if (d > 3 && d < best) best = d;
    }
    return best - 8.5; // stop before the crossing
  }

  recycle(car, world) {
    const rng = this.rng;
    const px = world.player.x, pz = world.player.z;
    for (let tries = 0; tries < 8; tries++) {
      const p = this.randomRoadPose();
      const d = dist2d(p.x, p.z, px, pz);
      if (d > 110 && d < 210) {
        car.x = p.x; car.z = p.z; car.heading = p.heading;
        car.ai.vertical = p.vertical; car.ai.line = p.line; car.ai.dir = p.dir;
        car.speed = car.ai.cruise * 0.6;
        car.health = car.spec.hp; car.dead = false;
        return;
      }
    }
  }

  update(dt, world) {
    this.hornCooldown -= dt;
    for (let idx = this.cars.length - 1; idx >= 0; idx--) {
      const car = this.cars[idx];
      const ai = car.ai;
      if (!ai) continue;
      if (car.dead) {
        ai.deadTimer += dt;
        car.drive(dt, { throttle: 0, steer: 0, handbrake: true }, this.city);
        if (ai.deadTimer > 25) { car.remove(); this.cars.splice(idx, 1); this.spawnMoving(1); }
        continue;
      }
      const distP = dist2d(car.x, car.z, world.player.x, world.player.z);
      if (distP > 320) { this.recycle(car, world); continue; }
      const blocked = this.obstacleAhead(car, world);
      const stopDist = this.redLightStop(car);
      const atLight = stopDist < 7 && car.speed > -0.1;
      ai.blocked = blocked ? ai.blocked + dt : 0;
      const want = (blocked || atLight) ? 0 : ai.cruise;
      const input = { throttle: 0, steer: 0, handbrake: false };
      if (car.speed < want - 0.4) input.throttle = 0.55;
      else if (want === 0 && car.speed > 0.6) input.throttle = -0.5;
      // lane keeping + heading alignment
      const pose = this.lanePose(ai.vertical, ai.line, ai.dir);
      let steer = clamp(angleDelta(car.heading, pose.heading) * 1.1, -0.7, 0.7);
      if (ai.vertical) steer += clamp((pose.x - car.x) * 0.13, -0.5, 0.5) * Math.cos(car.heading);
      else steer += -clamp((pose.z - car.z) * 0.13, -0.5, 0.5) * Math.sin(car.heading);
      input.steer = clamp(steer, -0.8, 0.8);
      car.drive(dt, input, this.city);
      if (blocked && ai.blocked > 1.3 && this.hornCooldown <= 0 && distP < 30) {
        this.hornCooldown = 2.5;
        if (world.audio) world.audio.horn();
      }
      // wrap off the map edges
      if (car.x < -HALF - 30 || car.x > HALF + 40 || car.z < -HALF - 30 || car.z > HALF + 16) {
        this.recycle(car, world);
        continue;
      }
      // sometimes turn at an intersection
      const crossLines = ai.vertical ? this.city.roadsZ : this.city.roadsX;
      const along = ai.vertical ? car.z : car.x;
      let nearCross = null;
      for (const l of crossLines) if (Math.abs(l - along) < 1.7) { nearCross = l; break; }
      if (nearCross !== null && this.rng() < dt * 0.22) {
        ai.vertical = !ai.vertical;
        ai.line = nearCross;
        if (this.rng() < 0.5) ai.dir = -ai.dir;
      }
    }
  }
}
