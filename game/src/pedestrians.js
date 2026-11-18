// HEATWAVE CITY — pedestrians: low-poly people who stroll the sidewalks block by block,
// and scatter when gunfire, sirens or a reckless driver scare them.

import { CITY, clamp, dist2d } from './config.js';

const SKIN = [0xf2c79b, 0xc68863, 0x8a5a3b, 0x6e4530];
const SHIRT = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0xe67e22, 0x9b59b6, 0xecf0f1, 0x1abc9c, 0xfd79a8];
const PANTS = [0x2c3e50, 0x5d4037, 0x546e7a, 0x795548, 0x37474f];

// Builds one articulated low-poly person; parts are exposed for the walk-cycle swing.
export function buildPersonMesh(rng, forceColors = null) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: (forceColors && forceColors.skin) || SKIN[Math.floor(rng() * SKIN.length)] });
  const shirt = new THREE.MeshLambertMaterial({ color: (forceColors && forceColors.shirt) || SHIRT[Math.floor(rng() * SHIRT.length)] });
  const pants = new THREE.MeshLambertMaterial({ color: (forceColors && forceColors.pants) || PANTS[Math.floor(rng() * PANTS.length)] });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), shirt);
  torso.position.y = 1.12; torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.3), skin);
  head.position.y = 1.62; head.castShadow = true;
  g.add(head);
  function limb(mat, w, len, x, y, z) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat);
    m.position.y = -len / 2; m.castShadow = true;
    pivot.add(m);
    g.add(pivot);
    return pivot;
  }
  const legL = limb(pants, 0.17, 0.78, -0.14, 0.82, 0);
  const legR = limb(pants, 0.17, 0.78, 0.14, 0.82, 0);
  const armL = limb(skin, 0.13, 0.66, -0.34, 1.38, 0);
  const armR = limb(skin, 0.13, 0.66, 0.34, 1.38, 0);
  // short sleeves: tint the top of each arm with the shirt colour
  g.userData.parts = { legL, legR, armL, armR, torso, head };
  g.userData.phase = rng() * Math.PI * 2;
  return g;
}

export function animatePerson(mesh, dt, speed) {
  const u = mesh.userData;
  u.phase += dt * (3 + speed * 1.6);
  const swing = clamp(speed / 5, 0, 1.15) * 0.62;
  const s = Math.sin(u.phase);
  u.parts.legL.rotation.x = s * swing;
  u.parts.legR.rotation.x = -s * swing;
  u.parts.armL.rotation.x = -s * swing * 0.8;
  u.parts.armR.rotation.x = s * swing * 0.8;
  mesh.position.y = Math.abs(Math.cos(u.phase)) * 0.05 * clamp(speed / 5, 0, 1);
}

export class Pedestrians {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.peds = [];
    this.threat = null; // {x, z, until} — set by gunfire / near misses
    for (let i = 0; i < 26; i++) {
      const mesh = buildPersonMesh(rng);
      scene.add(mesh);
      const ped = { mesh, speed: 0, heading: rng() * Math.PI * 2, fleeT: 0, fallenT: 0, ring: null, corner: 0 };
      this.assignRing(ped, true);
      this.peds.push(ped);
    }
  }

  // A ped walks the sidewalk ring around one block: corners at block centre ± (block/2 + 2.4).
  assignRing(ped, randomStart = false) {
    const i = Math.floor(this.rng() * CITY.blocks), j = Math.floor(this.rng() * CITY.blocks);
    const cx = (i - (CITY.blocks - 1) / 2) * CITY.pitch;
    const cz = (j - (CITY.blocks - 1) / 2) * CITY.pitch;
    const o = CITY.block / 2 + 2.4;
    ped.ring = [{ x: cx - o, z: cz - o }, { x: cx + o, z: cz - o }, { x: cx + o, z: cz + o }, { x: cx - o, z: cz + o }];
    ped.corner = Math.floor(this.rng() * 4);
    if (randomStart) {
      const a = ped.ring[ped.corner], b = ped.ring[(ped.corner + 1) % 4];
      const t = this.rng();
      ped.mesh.position.set(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t);
    } else {
      const a = ped.ring[ped.corner];
      ped.mesh.position.set(a.x, 0, a.z);
    }
  }

  scare(x, z, seconds = 2.4) {
    this.threat = { x, z, until: performance.now() / 1000 + seconds };
  }

  knockDown(ped) {
    if (ped.fallenT <= 0) ped.fallenT = 2.6;
  }

  // A driver yanked out of a stolen car: appears at the door and runs for it.
  releaseDriver(x, z) {
    const mesh = buildPersonMesh(this.rng);
    this.scene.add(mesh);
    const ped = { mesh, speed: 0, heading: this.rng() * Math.PI * 2, fleeT: 2.6, fallenT: 0, ring: null, corner: 0 };
    this.assignRing(ped);
    mesh.position.set(x, 0, z);
    this.peds.push(ped);
    this.scare(x, z, 2.6);
    return ped;
  }

  update(dt, nowSec) {
    const threatActive = this.threat && nowSec < this.threat.until;
    for (const ped of this.peds) {
      const p = ped.mesh.position;
      if (ped.fallenT > 0) {
        ped.fallenT -= dt;
        ped.mesh.rotation.x = -Math.PI / 2 + 0.12;
        ped.mesh.position.y = 0.12;
        if (ped.fallenT <= 0) { ped.mesh.rotation.x = 0; ped.mesh.position.y = 0; ped.fleeT = 2; }
        continue;
      }
      let tx, tz, speed;
      const dThreat = threatActive ? dist2d(p.x, p.z, this.threat.x, this.threat.z) : Infinity;
      if (ped.fleeT > 0 || dThreat < 17) {
        // run directly away from the threat
        ped.fleeT = Math.max(ped.fleeT - dt, dThreat < 17 ? 0.7 : 0);
        const away = Math.atan2(p.x - this.threat.x, p.z - this.threat.z);
        ped.heading = away;
        speed = 7.4;
        tx = p.x + Math.sin(away) * 6; tz = p.z + Math.cos(away) * 6;
      } else {
        const target = ped.ring[(ped.corner + 1) % 4];
        tx = target.x; tz = target.z; speed = 1.7;
        if (dist2d(p.x, p.z, tx, tz) < 0.7) {
          ped.corner = (ped.corner + 1) % 4;
          if (this.rng() < 0.14) this.assignRing(ped); // wander off to another block
          continue;
        }
        ped.heading = Math.atan2(tx - p.x, tz - p.z);
      }
      ped.speed = speed;
      p.x += Math.sin(ped.heading) * speed * dt;
      p.z += Math.cos(ped.heading) * speed * dt;
      // keep peds out of buildings and on the map
      for (const box of this.city.colliders) {
        const nx = clamp(p.x, box.minX, box.maxX), nz = clamp(p.z, box.minZ, box.maxZ);
        if (Math.hypot(p.x - nx, p.z - nz) < 0.45) { p.x = nx + (p.x - nx || 0.45); p.z = nz + (p.z - nz || 0); }
      }
      const b = this.city.bounds;
      p.x = clamp(p.x, b.minX + 1, b.maxX - 1);
      p.z = clamp(p.z, b.minZ + 1, b.maxZ - 1);
      ped.mesh.rotation.y = ped.heading;
      animatePerson(ped.mesh, dt, speed);
    }
  }
}
