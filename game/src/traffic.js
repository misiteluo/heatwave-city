// traffic.js — civilian traffic on the road grid. Drivers hold a
// lane (road centre + a right-hand offset), brake for obstacles and
// red lights, honk when stuck near the player, and sometimes turn at
// intersections. Parked cars line the kerbs and the lots — every one
// of them can be taken. Cars that fall too far behind the player are
// recycled onto streets ahead so the city never empties.
//
// Round 7's drivers have survival instincts: a car bearing down on
// them at speed makes them swerve for the kerb, a carjacking in
// front of them makes the whole street brake and stare, and the
// fleet now includes the odd supercar and armoured SUV.

import { Car } from './vehicles.js';
import { CAR_COLORS, GRID, HALF, blockCentre, roadLine, clamp, dist2d, makeRng } from './config.js';

const LANE = 3.4;
const MOVING_TYPES = ['sedan', 'sedan', 'sedan', 'taxi', 'sports', 'pickup', 'moto', 'truck', 'sedan', 'super', 'armor'];
const PARKED_TYPES = ['sedan', 'sedan', 'sports', 'pickup', 'taxi', 'moto', 'truck', 'super', 'armor'];

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
    // Lateral lane offset from the road centre line, right-hand side.
    return vertical ? line + dir * LANE : line - dir * LANE;
  }

  randomRoadPose() {
    const rng = this.rng;
    const vertical = rng() < 0.5;
    const li = Math.floor(rng() * (GRID + 1));
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

  pickColor(type) {
    return type === 'taxi' ? 0xffc93c : CAR_COLORS[Math.floor(this.rng() * CAR_COLORS.length)];
  }

  spawnMoving(n) {
    const rng = this.rng;
    for (let i = 0; i < n; i++) {
      const pose = this.randomRoadPose();
      const type = MOVING_TYPES[Math.floor(rng() * MOVING_TYPES.length)];
      const car = new Car(this.scene, type, this.pickColor(type), pose.x, pose.z, pose.heading);
      car.ai = {
        vertical: pose.vertical, line: pose.line, dir: pose.dir,
        cruise: 8.5 + rng() * 5, stuck: 0, honkCd: rng() * 6, turnCd: 0, swerve: 0,
      };
      this.cars.push(car);
    }
  }

  spawnParked() {
    const rng = this.rng;
    const parkAt = (x, z, heading) => {
      const type = PARKED_TYPES[Math.floor(rng() * PARKED_TYPES.length)];
      const car = new Car(this.scene, type, this.pickColor(type), x, z, heading);
      car.ai = null;
      this.parked.push(car);
    };
    // Kerbside rows along a sample of blocks.
    for (let i = 0; i < 28; i++) {
      const cx = blockCentre(Math.floor(rng() * GRID));
      const cz = blockCentre(Math.floor(rng() * GRID));
      const side = Math.floor(rng() * 4);
      const jitter = (rng() - 0.5) * 20;
      if (side === 0) parkAt(cx - 19.5, cz + jitter, 0);
      else if (side === 1) parkAt(cx + 19.5, cz + jitter, Math.PI);
      else if (side === 2) parkAt(cx + jitter, cz - 19.5, Math.PI / 2);
      else parkAt(cx + jitter, cz + 19.5, -Math.PI / 2);
    }
    // The lots: Neon Mile parking, beach lot, casino forecourt,
    // island, HQ yard, stadium apron, airport car park.
    const lotSpots = [
      [blockCentre(7) - 9, blockCentre(11)], [blockCentre(7) + 3, blockCentre(11)], [blockCentre(7) + 12, blockCentre(11)],
      [blockCentre(0) - 6, blockCentre(12)], [blockCentre(0) + 8, blockCentre(12)],
      [blockCentre(5) - 10, blockCentre(10) + 12], [blockCentre(5) + 10, blockCentre(10) + 12],
      [blockCentre(3) - 8, blockCentre(3) + 13], [blockCentre(3) + 9, blockCentre(3) + 13],
      [-16, 452], [10, 458],
      [-352, 492], [-336, 492], [-262, 500],
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
      return Math.abs(dx * fz - dz * fx) < 2.4;
    };
    for (const o of world.targetCars()) if (check(o, 8.5)) return true;
    return !!world.peds.nearest(car.x + fx * 5, car.z + fz * 5, 3.2);
  }

  redLightStop(car) {
    const ai = car.ai;
    const state = this.city.lightState(ai.vertical ? 'NS' : 'EW');
    if (state === 'green') return false;
    const along = ai.vertical ? car.z : car.x;
    let best = 1e9;
    for (let j = 0; j <= GRID; j++) {
      const d = (roadLine(j) - along) * ai.dir;
      if (d > 2 && d < best) best = d;
    }
    if (best > 11) return false;
    if (state === 'yellow' && best < 4.5) return false; // too close to stop: roll through
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
    car.syncMesh(this.city);
  }

  update(dt, world) {
    const focus = world.playerCar || world.player;
    const pc = world.playerCar;
    for (const car of this.cars) {
      if (car.dead || car.occupied) continue;
      const ai = car.ai;
      if (!ai) continue;
      const focusD = dist2d(car.x, car.z, focus.x, focus.z);
      car.mesh.visible = focusD < 330; // distance culling: far traffic costs no draw calls
      if (focusD > 380) { this.recycle(car, world); continue; }
      let target = ai.cruise;
      if (this.obstacleAhead(car, world)) target = 0;
      if (this.redLightStop(car)) target = 0;
      // Self-preservation: the player's car coming in hot and close
      // makes a driver dive for the kerb (and brake, if head-on).
      ai.swerve = Math.max(0, (ai.swerve || 0) - dt * 1.4);
      if (pc && !pc.dead && Math.abs(pc.speed) > 13) {
        const dx = car.x - pc.x, dz = car.z - pc.z;
        const d = Math.hypot(dx, dz);
        if (d < 13 && d > 0.1) {
          const closing = (dx * Math.sin(pc.heading) + dz * Math.cos(pc.heading)) > 0;
          if (closing) {
            const side = (dx * Math.cos(pc.heading) - dz * Math.sin(pc.heading)) > 0 ? 1 : -1;
            ai.swerve = 1.6 * side;
            const headOn = Math.abs(Math.sin(pc.heading - car.heading)) < 0.4
              && Math.cos(pc.heading - car.heading) < -0.5;
            if (headOn) target = 0;
          }
        }
      }
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
      // Lane keeping: ease toward the lane centre line (plus any
      // swerve offset), roll forward, sometimes turn at a junction.
      const lane = this.lanePose(ai.vertical, ai.line, ai.dir) + (ai.swerve || 0);
      ai.turnCd -= dt;
      if (ai.vertical) {
        car.x += clamp(lane - car.x, -3.4 * dt, 3.4 * dt);
        car.z += Math.cos(car.heading) * car.speed * dt;
        car.heading += clamp((ai.dir > 0 ? 0 : Math.PI) - car.heading, -2.4 * dt, 2.4 * dt);
        for (let j = 0; j <= GRID; j++) {
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
        car.z += clamp(lane - car.z, -3.4 * dt, 3.4 * dt);
        car.x += Math.sin(car.heading) * car.speed * dt;
        const want = ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        let dh = want - car.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        car.heading += clamp(dh, -2.4 * dt, 2.4 * dt);
        for (let j = 0; j <= GRID; j++) {
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
      car.syncMesh(this.city);
      car.updateSmoke(dt);
    }
    // Parked cars just smoulder if wrecked; all of them cull by range.
    for (const car of this.parked) {
      car.mesh.visible = dist2d(car.x, car.z, focus.x, focus.z) < 330;
      if (car.dead) car.updateSmoke(dt);
    }
  }
}
