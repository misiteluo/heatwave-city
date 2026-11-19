// player.js — Dex Marlowe, the blocky protagonist: a group of boxes
// with a walk cycle, sprint, a punch animation and a little pistol that
// appears in his hand when a firearm is selected. Also exports the
// humanoid builder every pedestrian and gunman is made from.

import { clamp, angleDelta, SKIN_TONES, dist2d } from './config.js';

export function buildHumanoid(shirt, pants, skin, opts = {}) {
  const g = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.8, 0.42), shirtMat);
  torso.position.y = 1.14; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.48, 0.46), skinMat);
  head.position.y = 1.8; head.castShadow = true; g.add(head);
  if (!opts.noCap) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.14, 0.52),
      new THREE.MeshLambertMaterial({ color: opts.capColor || 0x20304a }));
    cap.position.y = 2.08; g.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.06, 0.3),
      new THREE.MeshLambertMaterial({ color: opts.capColor || 0x20304a }));
    brim.position.set(0, 2.02, 0.36); g.add(brim);
  }
  if (opts.jacket) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.16, 0.46),
      new THREE.MeshLambertMaterial({ color: opts.jacket }));
    stripe.position.y = 1.32; g.add(stripe);
  }
  const limbs = {};
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.48, 1.48, 0);
    const armMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.78, 0.26), shirtMat);
    armMesh.position.y = -0.34; armMesh.castShadow = true; arm.add(armMesh);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.22), skinMat);
    hand.position.y = -0.78; arm.add(hand);
    g.add(arm);
    const leg = new THREE.Group();
    leg.position.set(side * 0.2, 0.78, 0);
    const legMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.76, 0.3), pantsMat);
    legMesh.position.y = -0.38; legMesh.castShadow = true; leg.add(legMesh);
    g.add(leg);
    limbs[side < 0 ? 'armL' : 'armR'] = arm;
    limbs[side < 0 ? 'legL' : 'legR'] = leg;
  }
  g.userData.limbs = limbs;
  return g;
}

export function animateHumanoid(g, phase, amount) {
  const l = g.userData.limbs;
  if (!l) return;
  const s = Math.sin(phase) * amount;
  l.legL.rotation.x = s;
  l.legR.rotation.x = -s;
  l.armL.rotation.x = -s * 0.8;
  l.armR.rotation.x = s * 0.8;
}

export class Player {
  constructor(scene, x, z) {
    this.x = x; this.z = z;
    this.heading = Math.PI;
    this.health = 100;
    this.armor = 0;
    this.phase = 0;
    this.speedNow = 0;
    this.punchTimer = 0;
    this.aiming = false;
    this.mesh = buildHumanoid(0x20304a, 0x2b2d42, SKIN_TONES[0], { capColor: 0xe63946, jacket: 0xffd23f });
    // the sidearm that appears when a gun is selected
    this.gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.42),
      new THREE.MeshLambertMaterial({ color: 0x14161a }));
    this.gun.position.set(0.48, 0.62, 0.3);
    this.gun.visible = false;
    this.mesh.add(this.gun);
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
  }

  setWeaponDrawn(drawn) { this.gun.visible = !!drawn; }

  update(dt, move, sprint, city) {
    const mag = Math.hypot(move.x, move.z);
    let moving = false;
    if (mag > 0.01) {
      moving = true;
      const speed = sprint ? 8.6 : 5.3;
      const nx = move.x / mag, nz = move.z / mag;
      const want = Math.atan2(nx, nz);
      this.heading += angleDelta(this.heading, want) * Math.min(1, dt * 11);
      const px = this.x + nx * speed * dt;
      const pz = this.z + nz * speed * dt;
      if (city.isLand(px, pz)) { this.x = px; this.z = pz; }
      else if (city.isLand(px, this.z)) this.x = px;
      else if (city.isLand(this.x, pz)) this.z = pz;
      const probe = { x: this.x, z: this.z };
      city.collide(probe, 0.55);
      this.x = probe.x; this.z = probe.z;
      this.phase += dt * speed * 1.9;
      this.speedNow = speed;
    } else {
      this.speedNow = 0;
    }
    const l = this.mesh.userData.limbs;
    if (this.punchTimer > 0) {
      this.punchTimer -= dt;
      const k = Math.sin((this.punchTimer / 0.28) * Math.PI);
      if (l) l.armR.rotation.x = -1.9 * k;
    } else if (this.aiming) {
      if (l) { l.armR.rotation.x = -1.45; l.armL.rotation.x = -0.25; }
      animateHumanoid(this.mesh, this.phase, moving ? 0.35 : 0);
      if (l) l.armR.rotation.x = -1.45;
    } else {
      animateHumanoid(this.mesh, this.phase, moving ? 0.75 : 0);
    }
    this.mesh.position.set(this.x, city.groundY(this.x, this.z), this.z);
    this.mesh.rotation.y = this.heading;
  }

  punch() { this.punchTimer = 0.28; }

  hurt(amount) {
    let rest = amount;
    if (this.armor > 0) {
      const soaked = Math.min(this.armor, amount * 0.65);
      this.armor -= soaked;
      rest = amount - soaked;
    }
    this.health -= rest;
    if (this.health <= 0) { this.health = 0; return true; }
    return false;
  }

  heal(amount) { this.health = Math.min(100, this.health + amount); }
  addArmor(amount) { this.armor = Math.min(100, this.armor + amount); }
  distanceTo(x, z) { return dist2d(this.x, this.z, x, z); }
}
