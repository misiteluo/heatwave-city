// pedestrians.js — the citizens of Heatwave City. Most stroll a loop
// around their home block at kerb distance; a few walk the beachfront
// promenade or the boardwalk end to end, and a handful live out on the
// islands. All of them sprint away from gunfire, crashes and flying
// fists, and they count as witnesses for the crime system.

import { buildHumanoid, animateHumanoid } from './player.js';
import { BLOCK, ISLAND, SKIN_TONES, SHIRT_COLORS, blockCentre, clamp, dist2d, makeRng } from './config.js';

const PANTS = [0x2b2d42, 0x6c5849, 0x274156, 0x772e25, 0x3d405b];

export class Pedestrians {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = makeRng(seed * 97 + 3);
    this.peds = [];
    const rng = this.rng;
    const addPed = (x, z, waypoints, speed) => {
      const mesh = buildHumanoid(
        SHIRT_COLORS[Math.floor(rng() * SHIRT_COLORS.length)],
        PANTS[Math.floor(rng() * PANTS.length)],
        SKIN_TONES[Math.floor(rng() * SKIN_TONES.length)],
        { capColor: 0x555f6e },
      );
      mesh.position.set(x, 0, z);
      scene.add(mesh);
      this.peds.push({
        mesh, x, z, heading: rng() * Math.PI * 2, phase: rng() * 6,
        waypoints, wi: Math.floor(rng() * waypoints.length),
        speed: speed || (1.1 + rng() * 0.9), flee: 0, fleeX: 0, fleeZ: 0,
      });
    };
    // block-loop strollers
    for (let i = 0; i < 34; i++) {
      const bi = Math.floor(rng() * 12), bj = Math.floor(rng() * 12);
      const cx = blockCentre(bi), cz = blockCentre(bj);
      const o = BLOCK / 2 + 3.6;
      const wps = [
        [cx - o, cz - o], [cx + o, cz - o], [cx + o, cz + o], [cx - o, cz + o],
      ];
      if (rng() < 0.5) wps.reverse();
      addPed(wps[0][0], wps[0][1], wps);
    }
    // beachfront promenade walkers
    for (let i = 0; i < 6; i++) {
      const z = 296 + rng() * 10;
      addPed(-240 + rng() * 480, z, [[-268, z], [268, z]]);
    }
    // boardwalk walkers (east strip)
    for (let i = 0; i < 4; i++) {
      const x = 300 + rng() * 8;
      addPed(x, -240 + rng() * 480, [[x, -268], [x, 268]]);
    }
    // islanders
    for (let i = 0; i < 4; i++) {
      const a = rng() * Math.PI * 2;
      const x = ISLAND.x + Math.cos(a) * 26, z = ISLAND.z + Math.sin(a) * 26;
      addPed(x, z, [[ISLAND.x - 24, ISLAND.z + 10], [ISLAND.x + 20, ISLAND.z - 14], [ISLAND.x + 4, ISLAND.z + 26]]);
    }
  }

  scare(x, z, radius = 16) {
    for (const p of this.peds) {
      const d = dist2d(p.x, p.z, x, z);
      if (d < radius) {
        p.flee = 2.6;
        const dx = p.x - x, dz = p.z - z;
        const m = Math.hypot(dx, dz) || 1;
        p.fleeX = dx / m; p.fleeZ = dz / m;
      }
    }
  }

  update(dt, city) {
    for (const p of this.peds) {
      let mx = 0, mz = 0, speed = p.speed;
      if (p.flee > 0) {
        p.flee -= dt;
        mx = p.fleeX; mz = p.fleeZ; speed = 6.4;
      } else {
        const [tx, tz] = p.waypoints[p.wi];
        const dx = tx - p.x, dz = tz - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.4) { p.wi = (p.wi + 1) % p.waypoints.length; continue; }
        mx = dx / d; mz = dz / d;
      }
      const want = Math.atan2(mx, mz);
      let dh = want - p.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      p.heading += clamp(dh, -6 * dt, 6 * dt);
      const nx = p.x + mx * speed * dt;
      const nz = p.z + mz * speed * dt;
      if (city.isLand(nx, nz)) { p.x = nx; p.z = nz; }
      const probe = { x: p.x, z: p.z };
      city.collide(probe, 0.5);
      p.x = probe.x; p.z = probe.z;
      p.phase += dt * speed * 2.1;
      animateHumanoid(p.mesh, p.phase, p.flee > 0 ? 0.95 : 0.6);
      p.mesh.position.set(p.x, city.groundY(p.x, p.z), p.z);
      p.mesh.rotation.y = p.heading;
    }
  }

  nearest(x, z, maxD) {
    let best = null, bd = maxD;
    for (const p of this.peds) {
      const d = dist2d(p.x, p.z, x, z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  countNear(x, z, r) {
    let n = 0;
    for (const p of this.peds) if (dist2d(p.x, p.z, x, z) < r) n++;
    return n;
  }
}
