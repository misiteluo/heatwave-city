// HEATWAVE CITY — traffic AI: civilian cars that cruise the road grid, keep their lane,
// brake for whatever is in front of them and honk when blocked. Also parks the
// stealable cars along the kerbs.

import { CITY, COLORS, clamp, angleDiff, dist2d } from './config.js';
import { createCar, placeCar, stepCar } from './vehicles.js';

const LANE = CITY.road / 4; // right-hand lane offset from the road centre line

export class Traffic {
  constructor(scene, city, rng) {
    this.city = city;
    this.cars = [];       // moving traffic
    this.parked = [];     // kerbside cars waiting to be stolen
    this.rng = rng;
    const paint = COLORS.carPaint;
    for (let i = 0; i < 14; i++) {
      const car = createCar(scene, { color: paint[i % paint.length], kind: 'civilian' });
      car.driver = 'traffic';
      this.spawnOnRoad(car);
      this.cars.push(car);
    }
    for (let i = 0; i < 16; i++) {
      const car = createCar(scene, { color: paint[(i * 3 + 1) % paint.length], kind: 'civilian' });
      car.driver = 'parked';
      this.parkCar(car);
      this.parked.push(car);
    }
  }

  allCars() { return this.cars.concat(this.parked); }

  spawnOnRoad(car) {
    const { roadsX, roadsZ } = this.city;
    const ix = 1 + Math.floor(this.rng() * (roadsX.length - 2));
    const iz = 1 + Math.floor(this.rng() * (roadsZ.length - 2));
    const vertical = this.rng() < 0.5;
    const dir = this.rng() < 0.5 ? 1 : -1;
    car.navDir = vertical ? { x: 0, z: dir } : { x: dir, z: 0 };
    const cx = roadsX[ix], cz = roadsZ[iz];
    const right = rightOf(car.navDir);
    placeCar(car, cx + right.x * LANE, cz + right.z * LANE, Math.atan2(car.navDir.x, car.navDir.z));
    this.pickNext(car, cx, cz);
  }

  parkCar(car) {
    const { roadsX, roadsZ } = this.city;
    // park parallel along a random road, on the right kerb
    const vertical = this.rng() < 0.5;
    const road = vertical ? roadsX[Math.floor(this.rng() * roadsX.length)] : roadsZ[Math.floor(this.rng() * roadsZ.length)];
    const along = (this.rng() * 2 - 1) * (this.city.bounds.maxX - 30);
    const side = this.rng() < 0.5 ? 1 : -1;
    const off = (CITY.road / 2 - 1.6) * side;
    if (vertical) placeCar(car, road + off, along, side > 0 ? 0 : Math.PI);
    else placeCar(car, along, road + off, side > 0 ? Math.PI / 2 : -Math.PI / 2);
  }

  // Choose the next intersection to aim for, from the one just reached.
  pickNext(car, cx, cz) {
    const { roadsX, roadsZ } = this.city;
    const dirs = [];
    const straight = car.navDir;
    const options = [straight, { x: straight.z, z: straight.x }, { x: -straight.z, z: -straight.x }, { x: -straight.x, z: -straight.z }];
    const weights = [0.55, 0.2, 0.2, 0.05];
    for (let k = 0; k < options.length; k++) {
      const d = options[k];
      const nx = cx + d.x * CITY.pitch, nz = cz + d.z * CITY.pitch;
      if (roadsX.includes(nx) && roadsZ.includes(nz)) dirs.push({ d, w: weights[k], nx, nz });
    }
    let sum = 0; for (const o of dirs) sum += o.w;
    let roll = this.rng() * sum, pick = dirs[0];
    for (const o of dirs) { roll -= o.w; if (roll <= 0) { pick = o; break; } }
    car.navDir = pick.d;
    const right = rightOf(pick.d);
    car.navTarget = { x: pick.nx + right.x * LANE, z: pick.nz + right.z * LANE, cx: pick.nx, cz: pick.nz };
  }

  update(dt, world, playerPos) {
    const everyone = this.allCars();
    for (const car of this.cars) {
      if (car.driver !== 'traffic') continue; // stolen cars leave the fleet
      const p = car.mesh.position;
      const t = car.navTarget;
      if (dist2d(p.x, p.z, t.x, t.z) < 8) this.pickNext(car, t.cx, t.cz);
      const desired = Math.atan2(t.x - p.x, t.z - p.z);
      const steer = clamp(angleDiff(car.heading, desired) * 2.4, -1, 1);
      // obstacle scan: anything 10 m ahead in the facing cone
      let blocked = false, slow = false;
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      const check = (ox, oz, r) => {
        const dx = ox - p.x, dz = oz - p.z;
        const ahead = dx * fx + dz * fz;
        if (ahead < 0 || ahead > 11) return;
        const side = Math.abs(dx * fz - dz * fx);
        if (side < r) { if (ahead < 6.5) blocked = true; else slow = true; }
      };
      for (const other of everyone) {
        if (other === car) continue;
        check(other.mesh.position.x, other.mesh.position.z, 2.4);
      }
      if (playerPos) check(playerPos.x, playerPos.z, 2.2);
      let throttle = 0;
      const targetSpeed = blocked ? 0 : slow ? 4 : 10.5;
      if (car.speed < targetSpeed) throttle = 0.75;
      else if (car.speed > targetSpeed + 1) throttle = -0.6;
      if (blocked && car.speed < 0.4) {
        car.honkCd -= dt;
        if (car.honkCd <= 0) { car.honkCd = 1.4 + this.rng() * 2; if (world.onHonk) world.onHonk(p); }
      }
      stepCar(car, dt, { throttle, steer, handbrake: false }, world);
    }
  }
}

function rightOf(dir) {
  // right-hand side of travel direction (forward x up), for right-hand traffic
  return { x: -dir.z, z: dir.x };
}
