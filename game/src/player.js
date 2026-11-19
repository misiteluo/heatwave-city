// player.js — Nico Serrano, the blocky protagonist: a group of boxes
// with a walk cycle, sprint, a punch animation and a little pistol that
// appears in his hand when a firearm is selected. Also exports the
// humanoid builder every pedestrian and gunman is made from.

import { clamp, angleDelta, SKIN_TONES, dist2d } from './config.js';

export function buildHumanoid(shirt, pants, skin, opts = {}) {
  const g = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.78, 0.4), shirtMat);
  torso.position.y = 1.12; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.46, 0.44), skinMat);
  head.position.y = 1.76; head.castShadow = true; g.add(head);
  if (!opts.noCap) {
    const capMat = new THREE.MeshLambertMaterial({ color: opts.capColor || 0xe63946 });
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), capMat);
    cap.position.y = 2.02; g.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.3), capMat);
    brim.position.set(0, 1.98, 0.36); g.add(brim);
  }
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
    this.mesh = buildHumanoid(0x0f7f8c, 0x2b2d42, SKIN_TONES[1], { capColor: 0xffd23f });
    // the pistol that shows when a firearm is selected
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.46),
      new THREE.MeshLambertMaterial({ color: 0x15181d }));
    gun.position.set(0, -0.62, 0.18);
    this.mesh.userData.limbs.armR.add(gun);
    this.gun = gun;
    this.gun.visible = false;
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.x = x; this.z = z;
    this.heading = 0;
    this.health = 100;
    this.armor = 0;
    this.walkPhase = 0;
    this.speedNow = 0;
    this.punchTimer = 0;
    this.aiming = false;
  }

  setWeaponDrawn(drawn) { this.gun.visible = !!drawn; }

  // move: {x,z} camera-relative wish direction (world units), sprint flag
  update(dt, move, sprint, city) {
    const mag = Math.hypot(move.x, move.z);
    const speed = sprint ? 10.5 : 6.4;
    if (mag > 0.05) {
      const tx = (move.x / mag) * speed, tz = (move.z / mag) * speed;
      const nx = this.x + tx * dt, nz = this.z + tz * dt;
      if (!city || city.isLand(nx, nz)) { this.x = nx; this.z = nz; }
      else if (city.isLand(nx, this.z)) this.x = nx;
      else if (city.isLand(this.x, nz)) this.z = nz;
      const target = Math.atan2(move.x, move.z);
      this.heading += angleDelta(this.heading, target) * Math.min(1, dt * 14);
      this.walkPhase += dt * (sprint ? 13 : 9.5);
      this.speedNow = speed;
    } else {
      this.speedNow = 0;
    }
    const probe = { x: this.x, z: this.z };
    if (city) city.collide(probe, 0.62);
    this.x = probe.x; this.z = probe.z;
    this.mesh.position.set(this.x, Math.abs(Math.sin(this.walkPhase)) * (this.speedNow > 0 ? 0.07 : 0), this.z);
    this.mesh.rotation.y = this.heading;
    animateHumanoid(this.mesh, this.walkPhase, this.speedNow > 0 ? 0.65 : 0);
    // aiming pose: right arm levelled ahead
    const l = this.mesh.userData.limbs;
    if (l) {
      if (this.punchTimer > 0) {
        this.punchTimer -= dt;
        l.armR.rotation.x = -1.9 * Math.max(0, this.punchTimer / 0.28);
      } else if (this.aiming) {
        l.armR.rotation.x = -1.45;
      }
    }
  }

  punch() { this.punchTimer = 0.28; }

  // Armor soaks 60% until it is gone. Returns true when Nico drops.
  hurt(amount) {
    let dmg = amount;
    if (this.armor > 0) {
      const soaked = Math.min(this.armor, amount * 0.6);
      this.armor -= soaked;
      dmg = amount - soaked;
    }
    this.health = Math.max(0, this.health - dmg);
    return this.health <= 0;
  }

  heal(amount) { this.health = Math.min(100, this.health + amount); }

  distanceTo(x, z) { return dist2d(this.x, this.z, x, z); }
}
