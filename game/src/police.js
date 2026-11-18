// HEATWAVE CITY — the wanted system and police response. Crimes add heat;
// heat becomes stars; stars decide how many units respond. Police spawn on
// roads near (but not on top of) the player, pursue, ram, set roadblocks at
// high stars, and fade away when the player breaks line of sight.

import { ROADS, WANTED_DECAY_SEC, clamp, rr, rnd, pick, angleWrap, dist2d } from './config.js';
import { createCar, stepCar } from './vehicles.js';

export function starsForHeat(heat) { return heat <= 0 ? 0 : clamp(Math.ceil(heat / 100), 1, 5); }
const UNITS_PER_STAR = [0, 1, 2, 3, 4, 6];

export function initWanted(G) {
  G.wanted = { heat: 0, stars: 0, lastSeen: -99, floor: 0 };
}

// amount of heat; witnessed crimes count double-ish because someone saw them.
export function addCrime(G, amount, x, z) {
  const seen = G.policeCars.some((c) => dist2d(x, z, c.x, c.z) < 60)
    || G.peds.some((p) => p.state !== 'down' && dist2d(x, z, p.x, p.z) < 22);
  G.wanted.heat = Math.min(500, G.wanted.heat + amount * (seen ? 1 : 0.45));
  G.threat = { x, z, t: G.time };
}

export function updateWanted(G, dt) {
  const w = G.wanted;
  const seen = G.policeCars.some((c) => !c.blockade && dist2d(G.playerPos.x, G.playerPos.z, c.x, c.z) < 58);
  if (seen) w.lastSeen = G.time;
  if (G.time - w.lastSeen > WANTED_DECAY_SEC && w.heat > w.floor) {
    w.heat = Math.max(w.floor, w.heat - 13 * dt);
  }
  w.stars = Math.max(starsForHeat(w.heat), starsForHeat(w.floor));
}

function spawnPoint(G) {
  // 100–135m from the player in a random direction, snapped onto a road.
  for (let tries = 0; tries < 14; tries++) {
    const a = rnd() * Math.PI * 2, d = rr(100, 135);
    const tx = G.playerPos.x + Math.sin(a) * d, tz = G.playerPos.z + Math.cos(a) * d;
    const nx = ROADS.reduce((best, r) => (Math.abs(r - tx) < Math.abs(best - tx) ? r : best), ROADS[0]);
    const nz = ROADS.reduce((best, r) => (Math.abs(r - tz) < Math.abs(best - tz) ? r : best), ROADS[0]);
    const cand = Math.abs(nx - tx) < Math.abs(nz - tz)
      ? { x: nx, z: clamp(tz, -268, 268) }
      : { x: clamp(tx, -268, 268), z: nz };
    const dd = dist2d(cand.x, cand.z, G.playerPos.x, G.playerPos.z);
    if (dd > 75 && dd < 175) return cand;
  }
  return { x: clamp(G.playerPos.x + 110, -260, 260), z: clamp(G.playerPos.z, -268, 268) };
}

// Road-network navigation: units follow the intersection grid toward the
// player (like traffic) and only cut across directly when close. A plan is a
// two-leg queue: first the nearest intersection (along the car's own road),
// then the neighbouring intersection that most reduces distance to the player.
function nearRoad(v) { return ROADS.reduce((b, r) => (Math.abs(r - v) < Math.abs(b - v) ? r : b), ROADS[0]); }
function planNav(G, car) {
  const ix = nearRoad(car.x), iz = nearRoad(car.z);
  const xi = ROADS.indexOf(ix), zi = ROADS.indexOf(iz);
  const cand = [];
  if (xi > 0) cand.push([ROADS[xi - 1], iz]);
  if (xi < ROADS.length - 1) cand.push([ROADS[xi + 1], iz]);
  if (zi > 0) cand.push([ix, ROADS[zi - 1]]);
  if (zi < ROADS.length - 1) cand.push([ix, ROADS[zi + 1]]);
  let best = null, bs = 1e9;
  for (const [x, z] of cand) {
    const s = dist2d(x, z, G.playerPos.x, G.playerPos.z);
    if (s < bs) { bs = s; best = { x, z }; }
  }
  car.navQueue = dist2d(car.x, car.z, ix, iz) > 10 && best ? [{ x: ix, z: iz }, best] : (best ? [best] : []);
  car.navPt = car.navQueue[0] || null;
}

export function updatePolice(G, dt) {
  const w = G.wanted;
  const want = UNITS_PER_STAR[w.stars] || 0;
  const active = G.policeCars.filter((c) => !c.blockade);
  // Spawn up to the wanted number.
  if (active.length < want && (G.policeSpawnCd -= dt) <= 0) {
    G.policeSpawnCd = 1.2;
    const sp = spawnPoint(G);
    const car = createCar(G.scene, sp.x, sp.z, 0, { kind: 'police' });
    car.yaw = Math.atan2(G.playerPos.x - sp.x, G.playerPos.z - sp.z); car.mesh.rotation.y = car.yaw;
    G.cars.push(car); G.policeCars.push(car);
  }
  // Despawn far units when the heat is off.
  for (let i = G.policeCars.length - 1; i >= 0; i--) {
    const c = G.policeCars[i];
    const d = dist2d(c.x, c.z, G.playerPos.x, G.playerPos.z);
    if ((w.stars === 0 && d > 60) || d > 300) {
      G.scene.remove(c.mesh);
      G.cars.splice(G.cars.indexOf(c), 1);
      G.policeCars.splice(i, 1);
    }
  }
  // Roadblocks at 4+ stars while the player drives.
  if (w.stars >= 4 && G.mode === 'car' && (G.blockadeCd -= dt) <= 0) {
    G.blockadeCd = 26;
    const ahead = 85;
    const bx = clamp(G.playerPos.x + Math.sin(G.playerCar.yaw) * ahead, -260, 260);
    const bz = clamp(G.playerPos.z + Math.cos(G.playerCar.yaw) * ahead, -260, 268);
    for (const off of [-4, 4]) {
      const car = createCar(G.scene, bx + off, bz, G.playerCar.yaw + Math.PI / 2, { kind: 'police' });
      car.blockade = true; car.parked = true;
      G.cars.push(car); G.policeCars.push(car);
    }
  }
  // Pursuit driving.
  let nearest = 1e9;
  for (const car of G.policeCars) {
    if (car.blockade || car.dead) continue;
    const d = dist2d(car.x, car.z, G.playerPos.x, G.playerPos.z);
    nearest = Math.min(nearest, d);
    const lead = clamp(d / 55, 0, 1) * 0.7;
    let tx = G.playerPos.x + (G.playerVel?.x || 0) * lead;
    let tz = G.playerPos.z + (G.playerVel?.z || 0) * lead;
    // Far away: navigate the road grid. Close: direct pursuit.
    if (car.navPt && dist2d(car.x, car.z, car.navPt.x, car.navPt.z) < 9) {
      car.navQueue.shift();
      car.navPt = car.navQueue[0] || null;
    }
    if (!car.navPt && d > 42) planNav(G, car);
    if (car.navPt) { tx = car.navPt.x; tz = car.navPt.z; }
    const desired = Math.atan2(tx - car.x, tz - car.z);
    const steer = clamp(angleWrap(desired - car.yaw) * 2.6, -1, 1);
    let throttle = 1, brake = false;
    if (!car.navPt && d < 16 && car.speed > 7) brake = true; // approach braking
    if (!car.navPt && d < 7) { throttle = car.speed > 6 ? 0 : 0.4; if (car.speed > 10) brake = true; }
    if (!car.navPt && d < 4.2 && G.mode === 'foot' && car.speed > 1.2) brake = true; // pull up beside a suspect on foot
    // Unstick: barely moving while trying means a building is in the way —
    // back off and rejoin the road grid.
    if (Math.abs(car.speed) < 0.9 && d > 8) { car.stuckT = (car.stuckT || 0) + dt; } else car.stuckT = 0;
    if (car.stuckT > 0.9) {
      car.stuckT = 0;
      planNav(G, car);
      car.speed = -3;
    }
    const crash = stepCar(car, { throttle, steer, brake }, dt, G.colliders);
    if (crash > 0.3) G.audio.crash(crash * 0.7);
  }
  G.audio.siren(clamp(1 - nearest / 95, 0, 1) * (w.stars > 0 ? 1 : 0));
  return nearest;
}

export function clearPolice(G) {
  for (const c of G.policeCars) {
    G.scene.remove(c.mesh);
    const i = G.cars.indexOf(c); if (i >= 0) G.cars.splice(i, 1);
  }
  G.policeCars.length = 0;
}
