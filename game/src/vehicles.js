// vehicles.js — everything with wheels (and one thing with rotors).
// Cars are low-poly box builds in six flavours — sedan, sports coupe,
// pickup, box truck, taxi, motorcycle, police cruiser — sharing one
// arcade physics step: throttle, steering that bites harder with the
// handbrake, building collision with damage, smoke and fire as health
// falls, and a burnt-out end state. The Helicopter is its own simple
// flight model: collective up/down, tilt to travel, roofs are floors.

import { clamp, fwd } from './config.js';
import { dotTexture } from './textures.js';

let smokeTex = null;
function getSmokeTex() { if (!smokeTex) smokeTex = dotTexture(); return smokeTex; }

export const CAR_TYPES = {
  sedan:  { w: 2.0, l: 4.3, topSpeed: 31, accel: 15, hp: 100, radius: 1.8 },
  sports: { w: 1.9, l: 4.1, topSpeed: 43, accel: 23, hp: 90, radius: 1.75 },
  pickup: { w: 2.2, l: 5.0, topSpeed: 27, accel: 11.5, hp: 160, radius: 2.0 },
  truck:  { w: 2.4, l: 6.6, topSpeed: 23, accel: 8, hp: 240, radius: 2.3 },
  taxi:   { w: 2.0, l: 4.3, topSpeed: 31, accel: 15, hp: 100, radius: 1.8 },
  moto:   { w: 0.7, l: 2.2, topSpeed: 39, accel: 25, hp: 55, radius: 0.85 },
  police: { w: 2.0, l: 4.4, topSpeed: 37, accel: 20, hp: 140, radius: 1.8 },
};

const darkMat = () => new THREE.MeshLambertMaterial({ color: 0x22262c });
const glassMat = () => new THREE.MeshLambertMaterial({ color: 0x9fd8ef });

function wheelsFor(g, w, l, n = 4) {
  const geo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
  const mat = darkMat();
  const wheels = [];
  const zs = n === 2 ? [0.78, -0.78] : [l / 2 - 0.85, -(l / 2 - 0.85)];
  for (const sz of zs) {
    for (const sx of (n === 2 ? [0] : [-w / 2 - 0.02, w / 2 + 0.02])) {
      const wheel = new THREE.Mesh(geo, mat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx, 0.42, sz);
      g.add(wheel);
      wheels.push(wheel);
    }
  }
  return wheels;
}

function lightBar(g) {
  const bar = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.15, 0.5), darkMat());
  base.position.y = 0.1; bar.add(base);
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.2, 0.44),
    new THREE.MeshBasicMaterial({ color: 0xff2233 }));
  red.position.set(-0.38, 0.12, 0); bar.add(red);
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.2, 0.44),
    new THREE.MeshBasicMaterial({ color: 0x2266ff }));
  blue.position.set(0.38, 0.12, 0); bar.add(blue);
  bar.position.y = 1.52;
  g.add(bar);
  return bar;
}

export function buildCarMesh(type, color, opts = {}) {
  const spec = CAR_TYPES[type] || CAR_TYPES.sedan;
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const paints = [paint];
  const glass = glassMat();

  if (type === 'moto') {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 2.1), paint);
    frame.position.y = 0.62; frame.castShadow = true; g.add(frame);
    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.8), paint);
    tank.position.set(0, 0.92, 0.25); g.add(tank);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.8), darkMat());
    seat.position.set(0, 0.9, -0.55); g.add(seat);
    g.userData.wheels = wheelsFor(g, 0.3, 2.2, 2);
    g.userData.paints = paints;
    return g;
  }
  if (type === 'truck') {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.7, 1.9), paint);
    cab.position.set(0, 1.25, 2.2); cab.castShadow = true; g.add(cab);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 0.1), glass);
    shield.position.set(0, 1.65, 3.16); g.add(shield);
    const boxMat = new THREE.MeshLambertMaterial({ color: opts.boxColor || 0xe8e4da });
    paints.push(boxMat);
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.45, 2.6, 4.4), boxMat);
    box.position.set(0, 1.75, -1.0); box.castShadow = true; g.add(box);
    g.userData.wheels = wheelsFor(g, spec.w, spec.l);
    g.userData.paints = paints;
    return g;
  }
  // sedan / sports / pickup / taxi / police share a body plan
  const low = type === 'sports';
  const bodyH = low ? 0.5 : 0.62;
  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.w, bodyH, spec.l), paint);
  body.position.y = 0.6; body.castShadow = true; g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(spec.w - 0.2, 0.32, 0.7), paint);
  nose.position.set(0, 0.48, spec.l / 2 + 0.2); g.add(nose);
  if (type === 'pickup') {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 1.7), glass);
    cab.position.set(0, 1.2, 0.7); cab.castShadow = true; g.add(cab);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.3, 2.0), darkMat());
    bed.position.set(0, 0.85, -1.3); g.add(bed);
  } else {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.w - 0.25, low ? 0.44 : 0.58, spec.l * 0.48), glass);
    cabin.position.set(0, 1.08, -0.2); cabin.castShadow = true; g.add(cabin);
  }
  if (low) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.45), darkMat());
    wing.position.set(0, 1.0, -spec.l / 2 + 0.15); g.add(wing);
  }
  const trim = new THREE.Mesh(new THREE.BoxGeometry(spec.w + 0.04, 0.13, spec.l + 0.04), darkMat());
  trim.position.y = 0.33; g.add(trim);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6bf });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3344 });
  for (const sx of [-spec.w / 2 + 0.32, spec.w / 2 - 0.32]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.15, 0.06), headMat);
    hl.position.set(sx, 0.62, spec.l / 2 + 0.56); g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.06), tailMat);
    tl.position.set(sx, 0.64, -spec.l / 2 - 0.01); g.add(tl);
  }
  if (type === 'taxi') {
    const signM = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.24, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    signM.position.set(0, 1.5, -0.2); g.add(signM);
  }
  if (type === 'police' || opts.police) {
    g.userData.lightBar = lightBar(g);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(spec.w + 0.02, 0.2, spec.l + 0.02),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    stripe.position.y = 0.8; g.add(stripe);
  }
  if (opts.marker) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.09, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    fin.position.set(0, 1.02, -spec.l / 2 + 0.2); g.add(fin);
  }
  g.userData.wheels = wheelsFor(g, spec.w, spec.l);
  g.userData.paints = paints;
  return g;
}

export class Car {
  constructor(scene, type, color, x, z, heading, opts = {}) {
    this.type = type;
    this.spec = CAR_TYPES[type] || CAR_TYPES.sedan;
    this.mesh = buildCarMesh(type, color, opts);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.scene = scene;
    this.x = x; this.z = z; this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.health = this.spec.hp;
    this.maxHealth = this.spec.hp;
    this.occupied = false;
    this.isPolice = type === 'police' || !!opts.police;
    this.isMissionCar = !!opts.marker;
    this.dead = false;
    this.burnt = false;
    this.crashInfo = null;
    this.smokeTimer = 0;
    this.smokes = [];
    this.ai = null;
    this.onDestroyed = null;
  }

  forwardX() { return Math.sin(this.heading); }
  forwardZ() { return Math.cos(this.heading); }

  // input: {throttle -1..1, steer -1..1, handbrake bool}
  drive(dt, input, city) {
    if (this.dead) { this.speed = 0; this.updateSmoke(dt); return; }
    const spec = this.spec;
    const maxF = spec.topSpeed, maxR = -11;
    if (input.throttle > 0) this.speed += spec.accel * dt * (this.speed < 0 ? 2.2 : 1);
    else if (input.throttle < 0) this.speed -= spec.accel * 0.75 * dt * (this.speed > 0.5 ? 2.0 : 1);
    else this.speed -= this.speed * 1.5 * dt;
    if (input.handbrake) this.speed -= this.speed * 3.4 * dt;
    this.speed -= this.speed * 0.16 * dt;
    this.speed = clamp(this.speed, maxR, maxF);
    if (Math.abs(this.speed) < 0.05 && !input.throttle) this.speed = 0;
    const targetSteer = input.steer * (this.type === 'moto' ? 0.7 : 0.55);
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * 8);
    if (this.speed !== 0) {
      const bite = this.type === 'moto' ? 1.9 : 1.35;
      const turn = this.steer * (input.handbrake ? 2.1 : bite) * dt * Math.sign(this.speed)
        * clamp(Math.abs(this.speed) / 9, 0.25, 1);
      this.heading += turn;
    }
    const nx = this.x + this.forwardX() * this.speed * dt;
    const nz = this.z + this.forwardZ() * this.speed * dt;
    if (city && !city.isLand(nx, nz)) {
      // water is a wall for wheels: slide along the shore instead
      if (city.isLand(nx, this.z)) this.x = nx;
      else if (city.isLand(this.x, nz)) this.z = nz;
      this.speed *= 0.55;
    } else {
      this.x = nx; this.z = nz;
    }
    const probe = { x: this.x, z: this.z };
    if (city && city.collide(probe, spec.radius)) {
      const impact = Math.abs(this.speed);
      this.x = probe.x; this.z = probe.z;
      if (impact > 7) {
        this.damage((impact - 6) * 1.7);
        this.crashInfo = { impact };
        this.speed *= -0.22;
      } else this.speed *= 0.35;
    }
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    this.mesh.rotation.z = -this.steer * clamp(Math.abs(this.speed) / 30, 0, 1) * (this.type === 'moto' ? 0.9 : 0.5);
    const spin = this.speed * dt * 2.2;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    this.updateSmoke(dt);
  }

  damage(amount) {
    if (this.dead) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) {
      this.dead = true;
      for (const m of this.mesh.userData.paints || []) m.color.setHex(0x191919);
      if (this.onDestroyed) this.onDestroyed(this);
    }
  }

  updateSmoke(dt) {
    this.smokeTimer -= dt;
    const hurt = this.health < this.maxHealth * 0.45;
    if ((hurt || this.dead) && this.smokeTimer <= 0) {
      this.smokeTimer = this.dead ? 0.16 : 0.1;
      const fire = this.dead || this.health < this.maxHealth * 0.2;
      const mat = new THREE.SpriteMaterial({
        map: getSmokeTex(), color: fire ? 0xff7b33 : 0x555555,
        transparent: true, opacity: 0.55, depthWrite: false,
      });
      const s = new THREE.Sprite(mat);
      s.position.set(this.x + this.forwardX() * (this.spec.l / 2 - 0.6), 1.2, this.z + this.forwardZ() * (this.spec.l / 2 - 0.6));
      s.scale.set(0.85, 0.85, 1);
      this.scene.add(s);
      this.smokes.push({ s, life: 0.9 });
    }
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const p = this.smokes[i];
      p.life -= dt;
      p.s.position.y += dt * 1.8;
      p.s.scale.multiplyScalar(1 + dt * 1.5);
      p.s.material.opacity = Math.max(0, p.life * 0.6);
      if (p.life <= 0) { this.scene.remove(p.s); this.smokes.splice(i, 1); }
    }
  }

  flashLights(t) {
    const bar = this.mesh.userData.lightBar;
    if (!bar) return;
    const on = Math.sin(t * 11) > 0;
    bar.children[1].material.color.setHex(on ? 0xff5566 : 0x771122);
    bar.children[2].material.color.setHex(on ? 0x113377 : 0x4488ff);
  }

  remove() {
    this.scene.remove(this.mesh);
    for (const p of this.smokes) this.scene.remove(p.s);
    this.smokes = [];
  }
}

// ------------------------------------------------------------ helicopter
export function buildHeliMesh(color, opts = {}) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const dark = darkMat();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.9, 4.6), paint);
  body.position.y = 1.6; body.castShadow = true; g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.3, 1.2), glassMat());
  nose.position.set(0, 1.5, 2.6); g.add(nose);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 5.4), paint);
  tail.position.set(0, 1.9, -4.6); g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, 0.9), paint);
  fin.position.set(0, 2.4, -7.2); g.add(fin);
  for (const sx of [-1.05, 1.05]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 4.4), dark);
    skid.position.set(sx, 0.25, 0.3); g.add(skid);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), dark);
    strut.position.set(sx, 0.6, 1.2); g.add(strut);
    const strut2 = strut.clone(); strut2.position.z = -0.8; g.add(strut2);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.7, 6), dark);
  mast.position.y = 2.9; g.add(mast);
  const rotor = new THREE.Group();
  const bladeMat = new THREE.MeshBasicMaterial({ color: 0x22262c });
  for (const rz of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 11.6), bladeMat);
    blade.rotation.y = rz;
    rotor.add(blade);
  }
  rotor.position.y = 3.3;
  g.add(rotor);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.7, 0.24), bladeMat);
  tailRotor.position.set(0.18, 2.4, -7.2);
  g.add(tailRotor);
  if (opts.police) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.4, 4.64),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    stripe.position.y = 1.15; g.add(stripe);
  }
  g.userData.rotor = rotor;
  g.userData.tailRotor = tailRotor;
  g.userData.paints = [paint];
  return g;
}

export class Helicopter {
  constructor(scene, color, x, z, opts = {}) {
    this.mesh = buildHeliMesh(color, opts);
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.scene = scene;
    this.x = x; this.z = z;
    this.alt = 0;             // height above the local floor
    this.heading = opts.heading || 0;
    this.speed = 0;           // forward speed
    this.vx = 0; this.vz = 0;
    this.rotorSpin = 0;
    this.airborne = false;
    this.occupied = false;
    this.isPolice = !!opts.police;
    this.health = 300;
    this.dead = false;
  }

  floorAt(city) { return city ? city.heightAt(this.x, this.z) : 0; }

  // input: {throttle -1..1 (pitch), turn -1..1, lift -1..1}
  update(dt, input, city) {
    const targetSpin = this.occupied || this.airborne ? 42 : (this.rotorSpin > 0.4 ? 8 : 0);
    this.rotorSpin += (targetSpin - this.rotorSpin) * Math.min(1, dt * 1.6);
    this.mesh.userData.rotor.rotation.y += this.rotorSpin * dt;
    this.mesh.userData.tailRotor.rotation.x += this.rotorSpin * 1.4 * dt;
    const liftPower = clamp((this.rotorSpin - 6) / 30, 0, 1);
    if (input.turn) this.heading += input.turn * dt * 0.9 * (this.alt > 0.5 ? 1 : 0.3);
    const want = (input.throttle || 0) * 34;
    this.speed += (want - this.speed) * Math.min(1, dt * 1.4);
    const f = fwd(this.heading);
    this.vx = f.x * this.speed; this.vz = f.z * this.speed;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.x = clamp(this.x, -560, 560);
    this.z = clamp(this.z, -560, 640);
    const floor = this.floorAt(city);
    const lift = (input.lift || 0) * 13 * liftPower;
    this.alt += lift * dt;
    if (this.alt < 0) this.alt = 0;
    if (this.alt > 78) this.alt = 78;
    this.airborne = this.alt > 0.4;
    const y = floor + this.alt;
    this.mesh.position.set(this.x, y, this.z);
    this.mesh.rotation.y = this.heading;
    this.mesh.rotation.x = clamp(this.speed * 0.006, -0.2, 0.28);
    this.mesh.rotation.z = clamp(-(input.turn || 0) * 0.22, -0.25, 0.25);
  }

  get landed() { return this.alt <= 0.05 && Math.abs(this.speed) < 2; }

  remove() { this.scene.remove(this.mesh); }
}
