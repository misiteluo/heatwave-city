// pedestrians.js — the citizens of Heatwave City. Most stroll a loop
// around their home block at kerb distance; a few walk the beachfront
// promenade end to end. All of them sprint away from gunfire, crashes
// and flying fists, and they count as witnesses for the crime system.

import { buildHumanoid, animateHumanoid } from './player.js';
import { BLOCK, HALF, SKIN_TONES, SHIRT_COLORS, blockCentre, clamp, dist2d, makeRng } from './config.js';

const PANTS = [0x2b2d42, 0x6c5849, 0x274156, 0x772e25, 0x3d405b];

export class Pedestrians {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = makeRng(seed * 97 + 3);
    this.peds = [];
    const rng = this.rng;
    const spawn = (x, z, mode, data) => {
      const mesh = buildHumanoid(
        SHIRT_COLORS[Math.floor(rng() * SHIRT_COLORS.length)],
        PANTS[Math.floor(rng() * PANTS.length)],
        SKIN_TONES[Math.floor(rng() * SKIN_TONES.length)],
        { capColor: [0xe63946, 0x118ab2, 0xffd23f, 0x06d6a0][Math.floor(rng() * 4)] });
      scene.add(mesh);
      this.peds.push(Object.assign({
        mesh, x, z, mode, phase: rng() * 6, flee: 0, fleeX: 0, fleeZ: 0, speed: 1.6 + rng() * 1.1,
      }, data));
    };
    for (let i = 0; i < 40; i++) {
      const gx = Math.floor(rng() * 12), gz = Math.floor(rng() * 12);
      spawn(blockCentre(gx), blockCentre(gz), 'loop', {
        cx: blockCentre(gx), cz: blockCentre(gz),
        angle: rng() * Math.PI * 2,
        radius: BLOCK / 2 + 2.6 + rng() * 1.6,
        dir: rng() < 0.5 ? 1 : -1,
        angSpeed: 0.1 + rng() * 0.09,
      });
    }
    for (let i = 0; i < 8; i++) { // promenade walkers
      spawn(-HALF + rng() * HALF * 2, 296 + rng() * 8, 'prom', {
        dir: rng() < 0.5 ? 1 : -1, zLane: 294 + rng() * 10,
      });
    }
    for (let i = 0; i < 3; i++) { // island wanderers
      spawn((rng() - 0.5) * 40, 478 + (rng() - 0.5) * 40, 'loop', {
        cx: 0, cz: 478, angle: rng() * Math.PI * 2, radius: 16 + rng() * 14,
        dir: 1, angSpeed: 0.08,
      });
    }
  }

  scare(x, z, radius = 16) {
    for (const p of this.peds) {
      if (dist2d(p.x, p.z, x, z) < radius) {
        p.flee = 2.8;
        const dx = p.x - x, dz = p.z - z;
        const d = Math.hypot(dx, dz) || 1;
        p.fleeX = dx / d; p.fleeZ = dz / d;
      }
    }
  }

  update(dt, city) {
    for (const p of this.peds) {
      let moving = 0;
      if (p.flee > 0) {
        p.flee -= dt;
        const nx = p.x + p.fleeX * 9.5 * dt, nz = p.z + p.fleeZ * 9.5 * dt;
        if (city.isLand(nx, nz)) { p.x = nx; p.z = nz; }
        p.mesh.rotation.y = Math.atan2(p.fleeX, p.fleeZ);
        p.phase += dt * 13;
        moving = 1;
      } else if (p.mode === 'loop') {
        p.angle += p.angSpeed * p.dir * dt;
        p.x = p.cx + Math.cos(p.angle) * p.radius;
        p.z = p.cz + Math.sin(p.angle) * p.radius;
        p.mesh.rotation.y = Math.atan2(-Math.sin(p.angle) * p.dir, Math.cos(p.angle) * p.dir) + (p.dir > 0 ? 0 : Math.PI);
        p.phase += dt * 7.5;
        moving = 1;
      } else { // promenade
        p.x += p.dir * p.speed * dt;
        p.z = p.zLane;
        if (p.x > HALF + 20) p.dir = -1;
        if (p.x < -HALF - 20) p.dir = 1;
        p.mesh.rotation.y = Math.atan2(p.dir, 0);
        p.phase += dt * 7.5;
        moving = 1;
      }
      const probe = { x: p.x, z: p.z };
      if (city) city.collide(probe, 0.55);
      p.x = probe.x; p.z = probe.z;
      p.mesh.position.set(p.x, Math.abs(Math.sin(p.phase)) * 0.05, p.z);
      animateHumanoid(p.mesh, p.phase, moving ? 0.55 : 0);
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
