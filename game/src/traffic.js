// HEATWAVE CITY — ambient traffic: parked cars plus lane-following drivers
// who brake for obstacles, honk when stuck and turn at intersections.

import { THREE, ROADS, clamp, rr, ri, rnd, pick, angleWrap, yawToward, dist2d } from './config.js';
import { createCar, stepCar } from './vehicles.js';

const laneFor = (axis, dir) => (axis === 'z' ? -4 * dir : 4 * dir);

export function spawnTraffic(G, parkedCount = 24, movingCount = 13) {
  const scene = G.scene;
  // Parked cars hug the kerb on random roads, clear of intersections.
  for (let n = 0; n < parkedCount; n++) {
    const vertical = rnd() < 0.5;
    const road = pick(ROADS);
    let along = rr(-268, 268);
    if (ROADS.some((r) => Math.abs(r - along) < 13)) along += 20;
    const side = rnd() < 0.5 ? -6.9 : 6.9;
    const x = vertical ? road + side : along;
    const z = vertical ? along : road + side;
    const yaw = vertical ? (side > 0 ? Math.PI : 0) : (side > 0 ? -Math.PI / 2 : Math.PI / 2);
    const car = createCar(scene, x, z, yaw + rr(-0.04, 0.04), { kind: 'parked' });
    car.parked = true;
    G.cars.push(car); G.parkedCars.push(car);
  }
  // Moving traffic on lanes.
  for (let n = 0; n < movingCount; n++) {
    const axis = rnd() < 0.5 ? 'z' : 'x';
    const dir = rnd() < 0.5 ? 1 : -1;
    const road = pick(ROADS);
    const along = rr(-240, 240);
    const x = axis === 'z' ? road + laneFor(axis, dir) : along;
    const z = axis === 'z' ? along : road + laneFor(axis, dir);
    const car = createCar(scene, x, z, axis === 'z' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2), { kind: 'traffic' });
    car.nav = { axis, dir, fixed: road + laneFor(axis, dir), lastCross: '', stuck: 0, cruise: rr(10, 13.5) };
    G.cars.push(car); G.trafficCars.push(car);
  }
}

function obstacleAhead(G, car, dist) {
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  for (const other of G.cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x, dz = other.z - car.z;
    const fwd = dx * fx + dz * fz;
    if (fwd < 0.5 || fwd > dist) continue;
    if (Math.abs(dx * fz - dz * fx) < 2.4) return other;
  }
  for (const ped of G.peds) {
    if (ped.state === 'down') continue;
    const dx = ped.x - car.x, dz = ped.z - car.z;
    const fwd = dx * fx + dz * fz;
    if (fwd > 0.5 && fwd < dist * 0.8 && Math.abs(dx * fz - dz * fx) < 2) return ped;
  }
  return null;
}

export function updateTraffic(G, dt) {
  for (const car of G.trafficCars) {
    if (car.dead || car === G.playerCar) continue;
    const nav = car.nav;
    // Recycle cars that drift too far from the player.
    if (dist2d(car.x, car.z, G.playerPos.x, G.playerPos.z) > 340) {
      const axis = rnd() < 0.5 ? 'z' : 'x';
      const dir = rnd() < 0.5 ? 1 : -1;
      const road = pick(ROADS);
      nav.axis = axis; nav.dir = dir; nav.fixed = road + laneFor(axis, dir);
      car.x = axis === 'z' ? nav.fixed : G.playerPos.x + rr(-160, 160);
      car.z = axis === 'z' ? G.playerPos.z + rr(-160, 160) : nav.fixed;
      car.speed = 0;
    }
    // Intersection turns.
    const crossCoord = nav.axis === 'z' ? car.z : car.x;
    for (const r of ROADS) {
      if (Math.abs(crossCoord - r) < 2.4) {
        const key = `${nav.axis}:${r}`;
        if (nav.lastCross !== key) {
          nav.lastCross = key;
          if (rnd() < 0.38) {
            const newAxis = nav.axis === 'z' ? 'x' : 'z';
            const newDir = rnd() < 0.5 ? 1 : -1;
            nav.fixed = r + laneFor(newAxis, newDir);
            nav.axis = newAxis; nav.dir = newDir;
          }
        }
      }
    }
    const target = nav.axis === 'z'
      ? { x: nav.fixed, z: car.z + nav.dir * 26 }
      : { x: car.x + nav.dir * 26, z: nav.fixed };
    const desired = yawToward(car.x, car.z, target.x, target.z);
    const steer = clamp(angleWrap(desired - car.yaw) * 2.4, -1, 1);
    const blocked = obstacleAhead(G, car, 10);
    let throttle = 0, brake = false;
    if (blocked) {
      brake = car.speed > 1;
      nav.stuck += dt;
      if (nav.stuck > 1.6 && car.honkCd <= 0) { G.audio.horn(); car.honkCd = rr(3, 7); }
    } else {
      nav.stuck = 0;
      throttle = car.speed < nav.cruise ? 0.75 : 0;
      if (car.speed > nav.cruise + 1) brake = true;
    }
    car.honkCd -= dt;
    stepCar(car, { throttle, steer, brake }, dt, G.colliders);
  }
}
