// HEATWAVE CITY — the Caldera Bay PD: pursuit cars that spawn at the city edge,
// chase with predictive steering, ram the player, set roadblocks at high heat,
// and flash their light bars. Wanted-level bookkeeping lives in main; this class
// owns the units and answers "can any cop see the player?".

import { WANTED, clamp, angleDiff, dist2d } from './config.js';
import { createCar, placeCar, stepCar } from './vehicles.js';

export class Police {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.units = [];
    this.blockers = [];
    this.flashT = 0;
    this.blockCd = 0;
  }

  activeCars() { return this.units.concat(this.blockers); }

  anySees(pos) {
    for (const u of this.units) {
      if (dist2d(u.mesh.position.x, u.mesh.position.z, pos.x, pos.z) < WANTED.sightRange) return true;
    }
    return false;
  }

  nearestCopDist(pos) {
    let best = Infinity;
    for (const u of this.units) best = Math.min(best, dist2d(u.mesh.position.x, u.mesh.position.z, pos.x, pos.z));
    return best;
  }

  spawnCop(playerPos) {
    const { intersections } = this.city;
    let spot = null;
    for (let tries = 0; tries < 12; tries++) {
      const c = intersections[Math.floor(this.rng() * intersections.length)];
      const d = dist2d(c.x, c.z, playerPos.x, playerPos.z);
      if (d > 85 && d < 170) { spot = c; break; }
    }
    if (!spot) spot = intersections[Math.floor(this.rng() * intersections.length)];
    const car = createCar(this.scene, { color: 0xf4f6f7, kind: 'police' });
    car.driver = 'police';
    const heading = Math.atan2(playerPos.x - spot.x, playerPos.z - spot.z);
    placeCar(car, spot.x, spot.z, heading);
    this.units.push(car);
    return car;
  }

  despawn(car) {
    this.scene.remove(car.mesh);
    this.units.splice(this.units.indexOf(car), 1);
  }

  setRoadblock(playerPos, playerHeading) {
    // two cruisers parked nose-to-nose across the road ahead of the player
    const ahead = 74;
    const cx = playerPos.x + Math.sin(playerHeading) * ahead;
    const cz = playerPos.z + Math.cos(playerHeading) * ahead;
    const { roadsX, roadsZ } = this.city;
    // snap to the nearest road crossing so the block sits on a street
    const sx = roadsX.reduce((a, b) => (Math.abs(b - cx) < Math.abs(a - cx) ? b : a), roadsX[0]);
    const sz = roadsZ.reduce((a, b) => (Math.abs(b - cz) < Math.abs(a - cz) ? b : a), roadsZ[0]);
    const onVerticalRoad = Math.abs(sx - cx) < Math.abs(sz - cz);
    for (const off of [-4.2, 4.2]) {
      const car = createCar(this.scene, { color: 0xf4f6f7, kind: 'police' });
      car.driver = 'blockade';
      if (onVerticalRoad) placeCar(car, sx + off, cz, Math.PI / 2 + 0.35);
      else placeCar(car, cx, sz + off, 0.35);
      this.blockers.push(car);
    }
    this.blockCd = 26;
  }

  clearAll() {
    for (const u of this.units) this.scene.remove(u.mesh);
    for (const b of this.blockers) this.scene.remove(b.mesh);
    this.units = []; this.blockers = [];
  }

  update(dt, stars, playerPos, playerVel, world) {
    this.flashT += dt;
    const want = WANTED.copsPerStar[stars] || 0;
    // spawn / despawn to match the wanted level
    if (stars > 0 && this.units.length < want) this.spawnCop(playerPos);
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      const d = dist2d(u.mesh.position.x, u.mesh.position.z, playerPos.x, playerPos.z);
      if ((this.units.length > want && d > 60) || d > 260) this.despawn(u);
    }
    this.blockCd -= dt;
    if (stars >= 4 && this.blockCd <= 0 && this.blockers.length === 0) {
      this.setRoadblock(playerPos, Math.atan2(playerVel.x, playerVel.z) || 0);
    }
    if (stars < 3) { for (const b of this.blockers) this.scene.remove(b.mesh); this.blockers = []; }

    const phase = Math.floor(this.flashT * 6) % 2 === 0;
    for (const car of this.activeCars()) {
      if (car.lightRed) { car.lightRed.visible = phase; car.lightBlue.visible = !phase; }
    }
    // pursuit
    for (const car of this.units) {
      const p = car.mesh.position;
      const lead = 0.45;
      const tx = playerPos.x + playerVel.x * lead, tz = playerPos.z + playerVel.z * lead;
      const desired = Math.atan2(tx - p.x, tz - p.z);
      const steer = clamp(angleDiff(car.heading, desired) * 2.6, -1, 1);
      const d = dist2d(p.x, p.z, playerPos.x, playerPos.z);
      // ram the player: full throttle until contact range, then match speed
      let throttle = 0;
      const topSpeed = d > 26 ? 27 : 15;
      if (car.speed < topSpeed) throttle = 1;
      else if (car.speed > topSpeed + 2) throttle = -0.5;
      // don't plough into other cruisers
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      for (const other of this.units) {
        if (other === car) continue;
        const dx = other.mesh.position.x - p.x, dz = other.mesh.position.z - p.z;
        const ahead = dx * fx + dz * fz;
        if (ahead > 0 && ahead < 6 && Math.abs(dx * fz - dz * fx) < 2.4) { throttle = -0.7; break; }
      }
      stepCar(car, dt, { throttle, steer, handbrake: d < 9 && Math.abs(angleDiff(car.heading, desired)) > 2.2 }, world);
    }
  }
}
