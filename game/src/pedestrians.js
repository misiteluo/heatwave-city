// pedestrians.js — people strolling the sidewalks. They loop around a
// block at kerb distance, chat in pairs near plazas, and sprint away
// screaming (well, silently) when danger erupts close by.

import { buildHumanoid, animateHumanoid } from './player.js';
import { BLOCK, SKIN_TONES, SHIRT_COLORS, blockCentre, clamp, dist2d, makeRng } from './config.js';

export class Pedestrians {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = makeRng(seed * 97 + 3);
    this.peds = [];
    const rng = this.rng;
    for (let i = 0; i < 34; i++) {
      const gx = Math.floor(rng() * 10), gz = Math.floor(rng() * 10);
      const cx = blockCentre(gx), cz = blockCentre(gz);
      const mesh = buildHumanoid(
        SHIRT_COLORS[Math.floor(rng() * SHIRT_COLORS.length)],
        [0x2b2d42, 0x6c5849, 0x274156, 0x772e25][Math.floor(rng() * 4)],
        SKIN_TONES[Math.floor(rng() * SKIN_TONES.length)]);
      scene.add(mesh);
      this.peds.push({
        mesh,
        cx, cz,
        angle: rng() * Math.PI * 2,
        radius: BLOCK / 2 + 2.4 + rng() * 1.4,
        speed: 0.14 + rng() * 0.12,
        dir: rng() < 0.5 ? 1 : -1,
        phase: rng() * 6,
        flee: 0, fleeX: 0, fleeZ: 0,
        x: cx, z: cz,
      });
    }
  }

  // danger at (x,z): everyone nearby runs directly away for a few seconds
  scare(x, z, radius = 16) {
    for (const p of this.peds) {
      if (dist2d(p.x, p.z, x, z) < radius) {
        p.flee = 2.6;
        const dx = p.x - x, dz = p.z - z;
        const d = Math.hypot(dx, dz) || 1;
        p.fleeX = dx / d; p.fleeZ = dz / d;
      }
    }
  }

  update(dt, city) {
    for (const p of this.peds) {
      if (p.flee > 0) {
        p.flee -= dt;
        p.x += p.fleeX * 9 * dt;
        p.z += p.fleeZ * 9 * dt;
        p.x = clamp(p.x, -254, 254); p.z = clamp(p.z, -234, 300);
        const probe = { x: p.x, z: p.z };
        if (city) city.collide(probe, 0.55);
        p.x = probe.x; p.z = probe.z;
        p.mesh.rotation.y = Math.atan2(p.fleeX, p.fleeZ);
        p.phase += dt * 13;
      } else {
        p.angle += p.speed * p.dir * dt;
        p.x = p.cx + Math.cos(p.angle) * p.radius;
        p.z = p.cz + Math.sin(p.angle) * p.radius;
        const tangent = p.angle + (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        p.mesh.rotation.y = Math.atan2(Math.cos(tangent), Math.sin(tangent)) + Math.PI / 2;
        // the formula above resolves to walking direction; keep it stable:
        p.mesh.rotation.y = Math.atan2(-Math.sin(p.angle) * p.dir, Math.cos(p.angle) * p.dir) + (p.dir > 0 ? 0 : Math.PI);
        p.phase += dt * 7.5;
      }
      p.mesh.position.set(p.x, Math.abs(Math.sin(p.phase)) * 0.05, p.z);
      animateHumanoid(p.mesh, p.phase, 0.55);
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
