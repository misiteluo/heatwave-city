// traffic.js — civilian cars that cruise the road grid. Each picks a lane
// (road centre + a right-hand offset), drives straight, turns at some
// intersections, slows for anything ahead and honks when blocked near
// the player. Parked cars fill the plazas and kerbs for carjacking.

import { Car } from './vehicles.js';
import { CAR_COLORS, HALF, clamp, dist2d, makeRng } from './config.js';

const LANE = 3.4;

export class Traffic {
  constructor(scene, city, seed) {
    this.scene = scene;
    this.city = city;
    this.rng = makeRng(seed * 31 + 7);
    this.cars = [];
    this.parked = [];
    this.hornCooldown = 0;
    this.spawnMoving(15);
    this.spawnParked(16);
  }

  lanePose(vertical, line, dir) {
    // dir +1 travels toward +axis on the right-hand lane
    if (vertical) return { x: line + (dir > 0 ? -LANE : LANE), heading: dir > 0 ? 0 : Math.PI };
    return { z: line + (dir > 0 ? LANE : -LANE), heading: dir > 0 ? Math.PI / 2 : -Math.PI / 2 };
  }

  spawnMoving(n) {
    const rng = this.rng;
    for (let i = 0; i < n; i++) {
      const vertical = rng() < 0.5;
      const line = this.city.roadsX[Math.floor(rng() * this.city.roadsX.length)];
      const dir = rng() < 0.5 ? 1 : -1;
      const along = -HALF + rng() * HALF * 2;
      const pose = this.lanePose(vertical, line, dir);
      const car = new Car(this.scene, CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)],
        vertical ? pose.x : along, vertical ? along : pose.z, pose.heading);
      car.occupied = true;
      car.ai = { vertical, line, dir, cruise: 11 + rng() * 6, blocked: 0 };
      this.cars.push(car);
    }
  }

  spawnParked(n) {
    const rng = this.rng;
    // Parked along road kerbs (road line + 5.8): always clear of building
    // footprints, so a parked car can always pull out and be driven away.
    const spots = [
      [-170.2, 20], [-170.2, 108], [-82.2, 65], [-82.2, -20], [5.8, 108], [5.8, -65],
      [93.8, 20], [93.8, 152], [181.8, 65], [181.8, -108], [-126.2, -108], [-38.2, 152],
      [49.8, -20], [137.8, 108], [-214.2, 65], [49.8, 196],
    ];
    for (let i = 0; i < Math.min(n, spots.length); i++) {
      const [x, z] = spots[i];
      const car = new Car(this.scene, CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)],
        x, z, (i % 3 === 0 ? Math.PI : 0) + (rng() - 0.5) * 0.06);
      car.occupied = rng() < 0.3;
      this.parked.push(car);
    }
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
      return ahead > 0 && ahead < r && side < 2.4;
    };
    for (const other of this.cars) {
      if (other !== car && check(other.x, other.z, 9)) return true;
    }
    if (world.playerCar) { if (check(world.playerCar.x, world.playerCar.z, 9)) return true; }
    else if (check(world.player.x, world.player.z, 7)) return true;
    for (const cop of world.police.cars) if (check(cop.x, cop.z, 9)) return true;
    return false;
  }

  update(dt, world) {
    this.hornCooldown -= dt;
    for (const car of this.cars) {
      const ai = car.ai;
      if (!ai) continue;
      const blocked = this.obstacleAhead(car, world);
      ai.blocked = blocked ? ai.blocked + dt : 0;
      const want = blocked ? 0 : ai.cruise;
      const input = { throttle: 0, steer: 0, handbrake: false };
      if (car.speed < want) input.throttle = 0.55;
      else if (blocked) input.throttle = car.speed > 1 ? -0.4 : 0;
      // stay centred on the lane
      const pose = this.lanePose(ai.vertical, ai.line, ai.dir);
      const lateral = ai.vertical ? (pose.x - car.x) : (pose.z - car.z);
      input.steer = clamp(lateral * 0.14, -0.5, 0.5) * (ai.vertical ? 1 : -1) * ai.dir;
      if (ai.vertical) input.steer = clamp((pose.x - car.x) * 0.12, -0.5, 0.5) * (car.heading > Math.PI / 2 && car.heading < Math.PI * 1.5 ? -1 : 1);
      car.drive(dt, input, this.city);
      if (blocked && ai.blocked > 1.2 && this.hornCooldown <= 0
        && dist2d(car.x, car.z, world.player.x, world.player.z) < 30) {
        this.hornCooldown = 2.5;
        if (world.audio) world.audio.horn();
      }
      // wrap around the map edges back into the flow
      if (car.x < -HALF - 26 || car.x > HALF + 26 || car.z < -HALF - 26 || car.z > HALF + 12) {
        const rng = this.rng;
        ai.vertical = rng() < 0.5;
        ai.line = this.city.roadsX[Math.floor(rng() * this.city.roadsX.length)];
        ai.dir = rng() < 0.5 ? 1 : -1;
        const p = this.lanePose(ai.vertical, ai.line, ai.dir);
        const along = (ai.dir > 0 ? -HALF - 20 : HALF + 20);
        car.x = ai.vertical ? p.x : along;
        car.z = ai.vertical ? along : p.z;
        car.heading = p.heading;
        car.speed = ai.cruise * 0.7;
      }
      // occasionally turn at an intersection
      const nearLine = this.city.roadsX.find((l) => Math.abs((ai.vertical ? car.z : car.x) - l) < 1.6);
      if (nearLine !== undefined && this.rng() < dt * 0.25) {
        const cross = ai.vertical ? car.z : car.x;
        ai.vertical = !ai.vertical;
        ai.line = Math.round(cross);
        // snap the cross street to the nearest real road line
        let best = this.city.roadsX[0], bd = 1e9;
        for (const l of this.city.roadsX) { const d = Math.abs(l - cross); if (d < bd) { bd = d; best = l; } }
        ai.line = best;
        if (this.rng() < 0.5) ai.dir = -ai.dir;
        const p = this.lanePose(ai.vertical, ai.line, ai.dir);
        car.heading = p.heading;
      }
    }
  }
}
