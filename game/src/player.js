// player.js — Dex Marlowe and every other human in Heatwave City.
// The figure is properly articulated: a rounded head with a hair
// cap (or a baseball cap, or a bandana), a two-part torso, and arms
// and legs with elbows and knees that genuinely bend through the
// walk cycle. Limbs are pivoted groups, materials are shared per
// colour across the whole city, and animateHumanoid drives
// shoulders, elbows, hips and knees from a single phase clock.
// Round 7 adds the bystander poses the smarter crowd needs: a phone
// held up to film the crime, and a cower with both arms thrown over
// the head.

import { clamp, angleDelta, SKIN_TONES, HAIR_COLORS, dist2d } from './config.js';

const matCache = new Map();
function mat(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
}

// Merge two box geometries into one (forearm + hand ride a single
// mesh on the elbow pivot — one less draw call per arm per person).
function mergeBoxes(a, b) {
  const parts = [a.toNonIndexed(), b.toNonIndexed()];
  let total = 0;
  for (const p of parts) total += p.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  let o = 0, ou = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o * 3);
    nor.set(p.attributes.normal.array, o * 3);
    uv.set(p.attributes.uv.array, ou * 2);
    o += p.attributes.position.count;
    ou += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// Shared geometry table — every figure in the city is assembled
// from these same parts, so the geometry cost is paid once.
const GEO = {
  pelvis: new THREE.BoxGeometry(0.6, 0.3, 0.36),
  torso: new THREE.BoxGeometry(0.74, 0.68, 0.42),
  chestBand: new THREE.BoxGeometry(0.78, 0.2, 0.46),
  neck: new THREE.CylinderGeometry(0.09, 0.11, 0.16, 8),
  skull: new THREE.SphereGeometry(0.235, 12, 10),
  hair: new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.58),
  capTop: new THREE.CylinderGeometry(0.24, 0.26, 0.13, 10),
  capBrim: new THREE.BoxGeometry(0.34, 0.05, 0.3),
  band: new THREE.CylinderGeometry(0.252, 0.252, 0.13, 12, 1, true),
  upperArm: new THREE.BoxGeometry(0.21, 0.54, 0.23),
  forearm: mergeBoxes(
    new THREE.BoxGeometry(0.18, 0.48, 0.2).translate(0, -0.21, 0),
    new THREE.BoxGeometry(0.17, 0.16, 0.19).translate(0, -0.48, 0)
  ),
  hand: new THREE.BoxGeometry(0.17, 0.16, 0.19),
  thigh: new THREE.BoxGeometry(0.25, 0.52, 0.27),
  shin: new THREE.BoxGeometry(0.21, 0.48, 0.23),
  shoe: new THREE.BoxGeometry(0.22, 0.12, 0.38),
  phone: new THREE.BoxGeometry(0.16, 0.26, 0.04),
};

function part(geo, material, x, y, z, parent, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  parent.add(m);
  return m;
}

// Build one articulated person. opts: capColor (baseball cap),
// noCap, hair (colour), bandana (colour), jacket (chest band
// colour), longSleeves (forearms in shirt colour instead of skin),
// phone (a handset in the right hand, for citizen journalists).
export function buildHumanoid(shirt, pants, skin, opts = {}) {
  const g = new THREE.Group();
  const skinM = mat(skin), shirtM = mat(shirt), pantsM = mat(pants);
  const darkM = mat(0x23252c);

  part(GEO.pelvis, pantsM, 0, 0.98, 0, g);
  part(GEO.torso, shirtM, 0, 1.34, 0, g);
  if (opts.jacket) part(GEO.chestBand, mat(opts.jacket), 0, 1.44, 0, g);
  part(GEO.neck, skinM, 0, 1.72, 0, g, false);

  // Head, plus hair / cap / bandana on top.
  const head = new THREE.Group();
  head.position.set(0, 1.82, 0);
  const skull = part(GEO.skull, skinM, 0, 0.08, 0, head);
  skull.scale.set(0.92, 1.08, 0.98);
  if (opts.bandana) {
    const band = part(GEO.band, mat(opts.bandana), 0, 0.16, 0, head, false);
    band.rotation.x = 0.12;
    const knot = part(GEO.hand, mat(opts.bandana), 0, 0.14, -0.26, head, false);
    knot.scale.set(0.7, 0.7, 0.5);
  } else if (!opts.noCap && opts.capColor) {
    part(GEO.capTop, mat(opts.capColor), 0, 0.26, 0, head, false);
    const brim = part(GEO.capBrim, mat(opts.capColor), 0, 0.21, 0.3, head, false);
    brim.rotation.x = 0.1;
  } else if (!opts.noCap) {
    const hair = part(GEO.hair, mat(opts.hair !== undefined ? opts.hair : HAIR_COLORS[0]), 0, 0.13, -0.025, head, false);
    hair.scale.set(0.94, 1, 1);
  }
  g.add(head);

  const limbs = {}, joints = {};
  for (const side of [-1, 1]) {
    const tag = side < 0 ? 'L' : 'R';
    // Arm: shoulder pivot -> upper arm -> elbow pivot -> forearm.
    const arm = new THREE.Group();
    arm.position.set(side * 0.48, 1.6, 0);
    part(GEO.upperArm, shirtM, 0, -0.25, 0, arm);
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.52, 0);
    part(GEO.forearm, opts.longSleeves ? shirtM : skinM, 0, 0, 0, elbow);
    if (opts.phone && side > 0) {
      const ph = part(GEO.phone, darkM, 0, -0.52, 0.08, elbow, false);
      ph.rotation.x = -0.5;
    }
    arm.add(elbow);
    g.add(arm);
    // Leg: hip pivot -> thigh -> knee pivot -> shin + shoe.
    const leg = new THREE.Group();
    leg.position.set(side * 0.19, 0.9, 0);
    part(GEO.thigh, pantsM, 0, -0.25, 0, leg);
    const knee = new THREE.Group();
    knee.position.set(0, -0.5, 0);
    part(GEO.shin, pantsM, 0, -0.22, 0, knee);
    part(GEO.shoe, darkM, 0, -0.46, 0.05, knee, false);
    leg.add(knee);
    g.add(leg);
    limbs['arm' + tag] = arm;
    limbs['leg' + tag] = leg;
    joints['elbow' + tag] = elbow;
    joints['knee' + tag] = knee;
  }
  g.userData.limbs = limbs;
  g.userData.joints = joints;
  g.userData.head = head;
  return g;
}

// Drive the walk cycle: hips and shoulders swing in opposition,
// knees bend as each leg swings through, elbows keep a soft flex.
export function animateHumanoid(g, phase, amount) {
  const l = g.userData.limbs, j = g.userData.joints;
  if (!l || !j) return;
  const s = Math.sin(phase) * amount;
  l.legL.rotation.x = s;
  l.legR.rotation.x = -s;
  j.kneeL.rotation.x = -Math.max(0, Math.sin(phase - 2.2)) * amount * 1.15 - 0.04;
  j.kneeR.rotation.x = -Math.max(0, Math.sin(phase + Math.PI - 2.2)) * amount * 1.15 - 0.04;
  l.armL.rotation.x = -s * 0.85;
  l.armR.rotation.x = s * 0.85;
  j.elbowL.rotation.x = 0.28 + Math.max(0, s) * 0.45;
  j.elbowR.rotation.x = 0.28 + Math.max(0, -s) * 0.45;
  if (g.userData.head) g.userData.head.rotation.x = Math.sin(phase * 2) * 0.03 * amount;
}

// Pose: phone up in the right hand, filming. Left arm hangs loose.
export function posePhone(g) {
  const l = g.userData.limbs, j = g.userData.joints;
  if (!l || !j) return;
  l.armR.rotation.x = -1.85; j.elbowR.rotation.x = 0.35;
  l.armL.rotation.x = 0.12; j.elbowL.rotation.x = 0.3;
  l.legL.rotation.x = 0.06; l.legR.rotation.x = -0.06;
  j.kneeL.rotation.x = -0.08; j.kneeR.rotation.x = -0.08;
}

// Pose: cowering — knees bent deep, both arms thrown overhead.
export function poseCower(g) {
  const l = g.userData.limbs, j = g.userData.joints;
  if (!l || !j) return;
  l.legL.rotation.x = -0.5; l.legR.rotation.x = -0.42;
  j.kneeL.rotation.x = -0.9; j.kneeR.rotation.x = -0.8;
  l.armL.rotation.x = -2.6; l.armR.rotation.x = -2.75;
  j.elbowL.rotation.x = 1.5; j.elbowR.rotation.x = 1.6;
  if (g.userData.head) g.userData.head.rotation.x = 0.4;
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
    // The sidearm: receiver, barrel, grip and magazine in dark
    // steel, riding in the right hand so it follows the aim pose.
    this.gun = new THREE.Group();
    const steel = mat(0x14161a), gripM = mat(0x2e2a26);
    part(new THREE.BoxGeometry(0.09, 0.15, 0.34), steel, 0, 0, 0.02, this.gun, false);
    part(new THREE.CylinderGeometry(0.028, 0.028, 0.22, 6), steel, 0, 0.045, 0.26, this.gun, false)
      .rotation.x = Math.PI / 2;
    part(new THREE.BoxGeometry(0.08, 0.2, 0.1), gripM, 0, -0.13, -0.06, this.gun, false)
      .rotation.x = 0.35;
    part(new THREE.BoxGeometry(0.07, 0.16, 0.09), steel, 0, -0.12, 0.08, this.gun, false);
    this.gun.position.set(0, -0.52, 0.1);
    this.gun.visible = false;
    const elbowR = this.mesh.userData.joints.elbowR;
    if (elbowR) elbowR.add(this.gun); else this.mesh.add(this.gun);
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
    const l = this.mesh.userData.limbs, j = this.mesh.userData.joints;
    animateHumanoid(this.mesh, this.phase, moving ? 0.8 : 0);
    if (this.punchTimer > 0) {
      this.punchTimer -= dt;
      const k = Math.sin((this.punchTimer / 0.28) * Math.PI);
      if (l) l.armR.rotation.x = -1.9 * k;
      if (j) j.elbowR.rotation.x = -0.5 * k + 0.15;
    } else if (this.aiming) {
      // Both hands up on the gun: right arm straight at the target,
      // left arm bent across to support it.
      if (l) { l.armR.rotation.x = -1.5; l.armL.rotation.x = -1.05; }
      if (j) { j.elbowR.rotation.x = 0.06; j.elbowL.rotation.x = 0.75; }
    }
    this.mesh.position.set(this.x, city.groundY(this.x, this.z), this.z);
    this.mesh.rotation.y = this.heading;
  }

  punch() { this.punchTimer = 0.28; }

  // Returns true when this hit kills Dex — main.js runs the
  // WASTED sequence off the return value.
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
