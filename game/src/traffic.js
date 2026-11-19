// traffic.js — civilian traffic on the road grid. Drivers hold a lane
// (road centre + right-hand offset), brake for obstacles and red
// lights, honk when stuck near the player, and sometimes turn at
// intersections. Parked cars line the kerbs and lots — every one of
// them can be taken. Cars that fall too far behind the player are
// recycled to streets ahead so the city never empties.

import { Car } from './vehicles.js';
import { CAR_COLORS, HALF, blockCentre, roadLine, clamp, dist2d, makeRng } from './config.js';

const LANE = 3.4;
const MOVING_TYPES = ['sedan', 'sedan', 'sedan', 'taxi', 'sports', 'pickup', 'moto', 'truck'];

export class Traffic {
  constructor(scene, city, seed) {
    this.scene = scene;
    this.city = city;
    this.rng = makeRng(seed * 131 + 7);
    this.cars = [];
    this.parked = [];
    this.spawnMoving(26);
    this.spawnParked();
  }

  lanePose(vertical, line, dir) {
    // returns {offset} lateral lane offset from the road centre line
    return vertical ? line + dir * LANE : line - dir * LANE;
  }

  randomRoadPose() {
    const rng = this.rng;
    const vertical = rng() < 0.5;
    const li = Math.floor(rng() * 13);
    const dir = rng() < 0.5 ? 1 : -1;
    const along = -HALF + rng() * HALF * 2;
    const line = roadLine(li);
    const lane = this.lanePose(vertical, line, dir);
    return {
      vertical, line, dir,
      x: vertical ? lane : along,
      z: vertical ? along : lane,
      heading: vertical ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2),
    };
  }

  spawnMoving(n) {
    const rng = this.rng;
    for (let i = 0; i < n; i++) {
      const pose = this.randomRoadPose();
      const type = MOVING_TYPES[Math.floor(rng() * MOVING_TYPES.length)];
      const color = type === 'taxi' ? 0xffc93c : CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
      const car = new Car(this.scene, type, color, pose.x, pose.z, pose.heading);
      car.ai = {
        vertical: pose.vertical, line: pose.line, dir: pose.dir,
        cruise: 8.5 + rng() * 5, stuck: 0, honkCd: rng() * 6, turnCd: 0,
      };
      this.cars.push(car);
    }
  }

  spawnParked() {
    const rng = this.rng;
    const types = ['sedan', 'sedan', 'sports', 'pickup', 'taxi', 'moto', 'truck'];
    const parkAt = (x, z, heading) => {
      const type = types[Math.floor(rng() * types.length)];
      const color = type === 'taxi' ? 0xffc93c : CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
      const car = new Car(this.scene, type, color, x, z, heading);
      car.ai = null;
      this.parked.push(car);
    };
    // kerbside rows along a sample of blocks
    for (let i = 0; i < 30; i++) {
      const bi = Math.floor(rng() * 12), bj = Math.floor(rng() * 12);
      const cx = blockCentre(bi), cz = blockCentre(bj);
      const side = Math.floor(rng() * 4);
      if (side === 0) parkAt(cx - 19.5, cz + (rng() - 0.5) * 20, 0);
      else if (side === 1) parkAt(cx + 19.5, cz + (rng() - 0.5) * 20, Math.PI);
      else if (side === 2) parkAt(cx + (rng() - 0.5) * 20, cz - 19.5, Math.PI / 2);
      else parkAt(cx + (rng() - 0.5) * 20, cz + 19.5, -Math.PI / 2);
    }
    // the lots: Neon Mile parking, beach lot, casino forecourt, island
    const lotSpots = [
      [blockCentre(6) - 9, blockCentre(9)], [blockCentre(6) + 3, blockCentre(9)], [blockCentre(6) + 12, blockCentre(9)],
      [blockCentre(0) - 6, blockCentre(10)], [blockCentre(0) + 8, blockCentre(10)],
      [blockCentre(4) - 10, blockCentre(8) + 12], [blockCentre(4) + 10, blockCentre(8) + 12],
      [-16, 452], [10, 458],
    ];
    for (const [x, z] of lotSpots) parkAt(x, z, rng() * Math.PI * 2);
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
    const check = (o, rr) => {
      if (!o || o === car || o.dead) return false;
      const dx = o.x - car.x, dz = o.z - car.z;
      const ahead = dx * fx + dz * fz;
      if (ahead < 1 || ahead > rr) return false;
      const side = Math.abs(dx * fz - dz * fx);
      return side < 2.4;
    };
    for (const o of world.targetCars()) if (check(o, 8.5)) return true;
    const ped = world.peds.nearest(car.x + fx * 5, car.z + fz * 5, 3.2);
    return !!ped;
  }

  redLightStop(car) {
    const ai = car.ai;
    const axis = ai.vertical ? 'NS' : 'EW';
    const state = this.city.lightState(axis);
    if (state === 'green') return false;
    const along = ai.vertical ? car.z : car.x;
    // distance to the next intersection line ahead
    let best = 1e9;
    for (let j = 0; j <= 12; j++) {
      const d = (roadLine(j) - along) * ai.dir;
      if (d > 2 && d < best) best = d;
    }
    if (best > 11) return false;
    if (state === 'yellow' && best < 4.5) return false; // too close: roll through
    return true;
  }

  recycle(car, world) {
    const focus = world.playerCar || world.player;
    let pose = this.randomRoadPose();
    let tries = 0;
    while (dist2d(pose.x, pose.z, focus.x, focus.z) < 130 && tries++ < 8) pose = this.randomRoadPose();
    car.x = pose.x; car.z = pose.z; car.heading = pose.heading;
    car.ai.vertical = pose.vertical; car.ai.line = pose.line; car.ai.dir = pose.dir;
    car.speed = 0;
    car.syncMesh();
  }

  update(dt, world) {
    const focus = world.playerCar || world.player;
    for (const car of this.cars) {
      if (car.dead || car.occupied) continue;
      const ai = car.ai;
      if (!ai) continue;
      // recycle far-away traffic to keep the player's streets alive
      if (dist2d(car.x, car.z, focus.x, focus.z) > 360) { this.recycle(car, world); continue; }
      let target = ai.cruise;
      if (this.obstacleAhead(car, world)) target = 0;
      if (this.redLightStop(car)) target = 0;
      // accelerate / brake toward target
      const accel = target > car.speed ? 7 : 16;
      car.speed += clamp(target - car.speed, -accel * dt, accel * dt);
      if (car.speed < 0.05 && target === 0) {
        ai.stuck += dt;
        ai.honkCd -= dt;
        if (ai.stuck > 2.5 && ai.honkCd <= 0 && dist2d(car.x, car.z, focus.x, focus.z) < 30) {
          world.audio.horn();
          ai.honkCd = 4 + this.rng() * 5;
        }
      } else ai.stuck = 0;
      // lane keeping: drift toward the lane centre line
      const lane = this.lanePose(ai.vertical, ai.line, ai.dir);
      if (ai.vertical) {
        car.x += clamp(lane - car.x, -3.2 * dt, 3.2 * dt);
        car.z += Math.cos(car.heading) * car.speed * dt;
        car.heading += clamp((ai.dir > 0 ? 0 : Math.PI) - car.heading, -2.4 * dt, 2.4 * dt);
        // maybe turn at an intersection
        ai.turnCd -= dt;
        for (let j = 0; j <= 12; j++) {
          if (Math.abs(car.z - roadLine(j)) < 1.1 && ai.turnCd <= 0 && this.rng() < 0.16) {
            ai.vertical = false; ai.line = roadLine(j);
            ai.dir = this.rng() < 0.5 ? 1 : -1;
            ai.turnCd = 3;
            break;
          }
        }
        if (car.z > HALF + 30) { car.z = HALF + 30; ai.dir = -1; }
        if (car.z < -HALF - 30) { car.z = -HALF - 30; ai.dir = 1; }
      } else {
        car.z += clamp(lane - car.z, -3.2 * dt, 3.2 * dt);
        car.x += Math.sin(car.heading) * car.speed * dt;
        const want = ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        let dh = want - car.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        car.heading += clamp(dh, -2.4 * dt, 2.4 * dt);
        ai.turnCd -= dt;
        for (let j = 0; j <= 12; j++) {
          if (Math.abs(car.x - roadLine(j)) < 1.1 && ai.turnCd <= 0 && this.rng() < 0.16) {
            ai.vertical = true; ai.line = roadLine(j);
            ai.dir = this.rng() < 0.5 ? 1 : -1;
            ai.turnCd = 3;
            break;
          }
        }
        if (car.x > HALF + 30) { car.x = HALF + 30; ai.dir = -1; }
        if (car.x < -HALF - 30) { car.x = -HALF - 30; ai.dir = 1; }
      }
      car.wheelSpin += car.speed * dt * 2.2;
      car.syncMesh();
      car.updateSmoke(dt);
    }
    // parked cars just smoulder if wrecked
    for (const car of this.parked) if (car.dead) car.updateSmoke(dt);
  }
}
