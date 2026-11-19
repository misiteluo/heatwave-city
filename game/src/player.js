// player.js — Rico Vale, the blocky protagonist: a group of boxes with a
// walk cycle, driven on foot by WASD relative to the camera orbit.

import { clamp, angleDelta, SKIN_TONES, dist2d } from './config.js';

export function buildHumanoid(shirt, pants, skin) {
  const g = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.78, 0.4), shirtMat);
  torso.position.y = 1.12; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.46, 0.44), skinMat);
  head.position.y = 1.76; head.castShadow = true; g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5),
    new THREE.MeshLambertMaterial({ color: 0xe63946 }));
  cap.position.y = 2.02; g.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.3),
    new THREE.MeshLambertMaterial({ color: 0xe63946 }));
  brim.position.set(0, 1.98, 0.36); g.add(brim);
  const limbs = {};
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.2), shirtMat);
    arm.geometry.translate(0, -0.3, 0);
    arm.position.set(side * 0.47, 1.44, 0);
    g.add(arm); limbs[side < 0 ? 'armL' : 'armR'] = arm;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.76, 0.26), pantsMat);
    leg.geometry.translate(0, -0.34, 0);
    leg.position.set(side * 0.19, 0.76, 0);
    g.add(leg); limbs[side < 0 ? 'legL' : 'legR'] = leg;
  }
  g.userData.limbs = limbs;
  return g;
}

export function animateHumanoid(g, phase, amount) {
  const l = g.userData.limbs;
  if (!l) return;
  const s = Math.sin(phase) * amount;
  l.armL.rotation.x = s; l.armR.rotation.x = -s;
  l.legL.rotation.x = -s; l.legR.rotation.x = s;
}

export class Player {
  constructor(scene, x, z) {
    this.mesh = buildHumanoid(0x118ab2, 0x2b2d42, SKIN_TONES[1]);
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.x = x; this.z = z;
    this.heading = 0;
    this.health = 100;
    this.walkPhase = 0;
    this.speedNow = 0;
    this.punchTimer = 0;
  }

  get pos() { return this.mesh.position; }

  // move: {x,z} camera-relative wish direction (world), sprint flag
  update(dt, move, sprint, city) {
    const mag = Math.hypot(move.x, move.z);
    const speed = sprint ? 10.5 : 6.2;
    if (mag > 0.05) {
      const tx = (move.x / mag) * speed, tz = (move.z / mag) * speed;
      this.x += tx * dt; this.z += tz * dt;
      const target = Math.atan2(move.x, move.z);
      this.heading += angleDelta(this.heading, target) * Math.min(1, dt * 14);
      this.walkPhase += dt * (sprint ? 13 : 9.5);
      this.speedNow = speed;
    } else {
      this.speedNow = 0;
      this.walkPhase += (0 - 0) * dt; // settle
    }
    this.x = clamp(this.x, -254, 254);
    this.z = clamp(this.z, -234, 300);
    const probe = { x: this.x, z: this.z };
    if (city) city.collide(probe, 0.62);
    this.x = probe.x; this.z = probe.z;
    this.mesh.position.set(this.x, Math.abs(Math.sin(this.walkPhase)) * (this.speedNow > 0 ? 0.07 : 0), this.z);
    this.mesh.rotation.y = this.heading;
    animateHumanoid(this.mesh, this.walkPhase, this.speedNow > 0 ? 0.65 : 0);
    if (this.punchTimer > 0) {
      this.punchTimer -= dt;
      const l = this.mesh.userData.limbs;
      if (l) l.armR.rotation.x = -1.9 * Math.max(0, this.punchTimer / 0.28);
    }
  }

  punch() { this.punchTimer = 0.28; }

  hurt(amount) {
    this.health = Math.max(0, this.health - amount);
    return this.health <= 0;
  }

  distanceTo(x, z) { return dist2d(this.x, this.z, x, z); }
}
