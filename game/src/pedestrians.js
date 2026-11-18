// HEATWAVE CITY — box-built humanoids (shared by the player, pedestrians and
// gang members) and the pedestrian crowd: sidewalk loop walkers who flee
// from gunfire and reckless driving, and can be knocked down.

import { THREE, PITCH, BLOCK_HALF, GRID, clamp, rr, rnd, pick, dist2d, yawToward, angleLerp } from './config.js';

const SKIN = [0xf2c09a, 0xc68863, 0x8a5a3b, 0xffdbac];
const SHIRTS = [0xef476f, 0x118ab2, 0x06d6a0, 0xffd166, 0xf78c6b, 0x9b5de5, 0xffffff, 0x2a9d8f];
const PANTS = [0x2b2d42, 0x4a4e69, 0x6c5849, 0x1d3557, 0x555b6e];

export function buildHumanoid(shirt = null, pants = null, skin = null) {
  const g = new THREE.Group();
  const sMat = new THREE.MeshLambertMaterial({ color: skin ?? pick(SKIN) });
  const tMat = new THREE.MeshLambertMaterial({ color: shirt ?? pick(SHIRTS) });
  const pMat = new THREE.MeshLambertMaterial({ color: pants ?? pick(PANTS) });
  const mk = (w, h, d, m, x, y, z) => { const q = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); q.position.set(x, y, z); q.castShadow = true; g.add(q); return q; };
  const legL = mk(0.17, 0.78, 0.19, pMat, -0.11, 0.39, 0); legL.geometry.translate(0, -0.33, 0); legL.position.y = 0.72;
  const legR = mk(0.17, 0.78, 0.19, pMat, 0.11, 0.39, 0); legR.geometry.translate(0, -0.33, 0); legR.position.y = 0.72;
  const torso = mk(0.46, 0.62, 0.24, tMat, 0, 1.03, 0);
  const armL = mk(0.13, 0.66, 0.15, tMat, -0.31, 0.95, 0); armL.geometry.translate(0, -0.26, 0); armL.position.y = 1.28;
  const armR = mk(0.13, 0.66, 0.15, tMat, 0.31, 0.95, 0); armR.geometry.translate(0, -0.26, 0); armR.position.y = 1.28;
  const head = mk(0.26, 0.3, 0.26, sMat, 0, 1.52, 0);
  const hair = mk(0.28, 0.09, 0.28, new THREE.MeshLambertMaterial({ color: pick([0x2b2118, 0x59422a, 0x111111, 0xb08968]) }), 0, 1.7, 0);
  return { group: g, legL, legR, armL, armR, torso, head };
}

export function animateHumanoid(h, phase, runFactor = 1) {
  const s = Math.sin(phase), amp = 0.55 * runFactor;
  h.legL.rotation.x = s * amp; h.legR.rotation.x = -s * amp;
  h.armL.rotation.x = -s * amp * 0.8; h.armR.rotation.x = s * amp * 0.8;
}

// Perimeter point of a block's sidewalk loop. s runs 0..perim.
function loopPoint(bi, bj, s) {
  const o = BLOCK_HALF + 2.6, per = 8 * o;
  s = ((s % per) + per) % per;
  const cx = bi * PITCH, cz = bj * PITCH;
  if (s < 2 * o) return { x: cx - o + s, z: cz - o, dir: [1, 0] };
  s -= 2 * o;
  if (s < 2 * o) return { x: cx + o, z: cz - o + s, dir: [0, 1] };
  s -= 2 * o;
  if (s < 2 * o) return { x: cx + o - s, z: cz + o, dir: [-1, 0] };
  s -= 2 * o;
  return { x: cx - o, z: cz + o - s, dir: [0, -1] };
}

export function spawnPeds(G, count = 26) {
  for (let n = 0; n < count; n++) {
    const bi = Math.floor(rr(-GRID, GRID + 0.99)), bj = Math.floor(rr(-GRID, GRID + 0.99));
    const h = buildHumanoid();
    G.scene.add(h.group);
    G.peds.push({
      h, x: 0, z: 0, yaw: 0, bi, bj, s: rr(0, 8 * (BLOCK_HALF + 2.6)),
      dirSign: rnd() < 0.5 ? 1 : -1, speed: rr(1.1, 1.7), phase: rr(0, 6),
      state: 'walk', fleeT: 0, downT: 0, threatX: 0, threatZ: 0,
    });
    const p = G.peds[G.peds.length - 1];
    const pt = loopPoint(p.bi, p.bj, p.s); p.x = pt.x; p.z = pt.z;
  }
}

// Returns events: [{type:'pedHit', ped}] for the wanted system.
export function updatePeds(G, dt) {
  const events = [];
  const threat = G.threat; // {x,z,t} refreshed by gunfire / near-miss driving
  for (const ped of G.peds) {
    if (ped.state === 'pose') { // staged for screenshots: stand and idle
      ped.phase += dt * 1.6;
      animateHumanoid(ped.h, ped.phase, 0.12);
      ped.h.group.position.set(ped.x, 0.24, ped.z);
      ped.h.group.rotation.y = ped.yaw;
      continue;
    }
    if (ped.state === 'down') {
      ped.downT -= dt;
      ped.h.group.rotation.x = -Math.PI / 2;
      ped.h.group.position.set(ped.x, 0.25, ped.z);
      if (ped.downT <= 0) { // gets up somewhere else
        ped.state = 'walk'; ped.h.group.rotation.x = 0;
        ped.bi = Math.floor(rr(-GRID, GRID + 0.99)); ped.bj = Math.floor(rr(-GRID, GRID + 0.99));
        ped.s = rr(0, 180);
      }
      continue;
    }
    // Start fleeing when a threat is close.
    if (threat && G.time - threat.t < 2.5 && dist2d(ped.x, ped.z, threat.x, threat.z) < 16) {
      ped.state = 'flee'; ped.fleeT = rr(2, 3.4); ped.threatX = threat.x; ped.threatZ = threat.z;
    }
    let speed = ped.speed;
    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      const away = yawToward(ped.threatX, ped.threatZ, ped.x, ped.z);
      ped.yaw = angleLerp(ped.yaw, away, dt * 8);
      ped.x += Math.sin(ped.yaw) * 4.3 * dt; ped.z += Math.cos(ped.yaw) * 4.3 * dt;
      speed = 4.3;
      if (ped.fleeT <= 0) { // rejoin the nearest block loop
        ped.state = 'walk';
        ped.bi = clamp(Math.round(ped.x / PITCH), -GRID, GRID);
        ped.bj = clamp(Math.round(ped.z / PITCH), -GRID, GRID);
        ped.s = 0;
      }
    } else {
      ped.s += ped.dirSign * ped.speed * dt;
      const pt = loopPoint(ped.bi, ped.bj, ped.s);
      ped.x = pt.x; ped.z = pt.z;
      ped.yaw = angleLerp(ped.yaw, Math.atan2(pt.dir[0] * ped.dirSign, pt.dir[1] * ped.dirSign), dt * 10);
    }
    ped.phase += speed * dt * 3.6;
    animateHumanoid(ped.h, ped.phase, clamp(speed / 1.6, 0.4, 1.6));
    ped.h.group.position.set(ped.x, 0.24, ped.z);
    ped.h.group.rotation.y = ped.yaw;
    // Knocked down by a moving car?
    for (const car of G.cars) {
      if (car.dead || Math.abs(car.speed) < 5.5) continue;
      if (dist2d(ped.x, ped.z, car.x, car.z) < 1.7) {
        ped.state = 'down'; ped.downT = 7;
        events.push({ type: 'pedHit', ped, byPlayer: car === G.playerCar || car.kind === 'player' });
        G.audio.punch();
        break;
      }
    }
  }
  return events;
}
