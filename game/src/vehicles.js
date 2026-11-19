// vehicles.js — everything that moves under its own power: cars in
// seven flavours (sedan, sports coupe, pickup, box truck, taxi,
// motorcycle, police cruiser), the helicopter (collective + tilt flight,
// roofs are floors), and — new for the bay — a drivable powerboat.
// Cars share one arcade physics step: throttle, steering that bites
// harder with the handbrake, building collision with damage, smoke and
// fire as health falls, and a burnt-out end state.

import { clamp, fwd, WORLD_EDGE } from './config.js';
import { dotTexture } from './textures.js';

let smokeTex = null;
function getSmokeTex() { if (!smokeTex) smokeTex = dotTexture(); return smokeTex; }

export const CAR_TYPES = {
  sedan:  { top: 30, accel: 13, w: 1.9, l: 4.4, hp: 110, radius: 2.3, grip: 2.6 },
  sports: { top: 39, accel: 20, w: 1.85, l: 4.3, hp: 95, radius: 2.2, grip: 3.1 },
  pickup: { top: 27, accel: 12, w: 2.0, l: 4.9, hp: 140, radius: 2.5, grip: 2.4 },
  truck:  { top: 22, accel: 8, w: 2.3, l: 6.9, hp: 200, radius: 3.2, grip: 2.0 },
  taxi:   { top: 30, accel: 13, w: 1.9, l: 4.4, hp: 110, radius: 2.3, grip: 2.6 },
  moto:   { top: 37, accel: 21, w: 0.8, l: 2.3, hp: 55, radius: 1.2, grip: 3.4 },
  police: { top: 35, accel: 17, w: 1.9, l: 4.5, hp: 130, radius: 2.3, grip: 2.9 },
};

function darkMat() { return new THREE.MeshLambertMaterial({ color: 0x1c1f24 }); }
function glassMat() { return new THREE.MeshLambertMaterial({ color: 0x22384a }); }

function wheelsFor(g, w, l, n = 4) {
  const geo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
  const mat = darkMat();
  const wheels = [];
  const zs = n === 2 ? [0.78, -0.78] : [l / 2 - 0.85, -(l / 2 - 0.85)];
  for (const sz of zs) {
    for (const sx of (n === 2 ? [0] : [-w / 2, w / 2])) {
      const wheel = new THREE.Mesh(geo, mat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx, 0.42, sz);
      g.add(wheel); wheels.push(wheel);
    }
  }
  return wheels;
}

function lightBar(g, y) {
  const bar = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.5), darkMat());
  base.position.y = 0.08; bar.add(base);
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.2, 0.44),
    new THREE.MeshBasicMaterial({ color: 0xff2233 }));
  red.position.set(-0.38, 0.14, 0); bar.add(red);
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.2, 0.44),
    new THREE.MeshBasicMaterial({ color: 0x2255ff }));
  blue.position.set(0.38, 0.14, 0); bar.add(blue);
  bar.position.y = y;
  g.add(bar);
  return { red, blue };
}

export function buildCarMesh(type, color, opts = {}) {
  const spec = CAR_TYPES[type] || CAR_TYPES.sedan;
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = glassMat();
  if (type === 'moto') {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 2.1), paint);
    frame.position.y = 0.62; frame.castShadow = true; g.add(frame);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.9), darkMat());
    seat.position.set(0, 0.92, -0.3); g.add(seat);
    const rider = new THREE.Group(); // a simple hunched rider silhouette
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.34),
      new THREE.MeshLambertMaterial({ color: opts.riderColor || 0x333a45 }));
    torso.position.set(0, 1.28, -0.25); torso.rotation.x = 0.5; rider.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34),
      new THREE.MeshLambertMaterial({ color: 0xf2c89b }));
    head.position.set(0, 1.62, -0.02); rider.add(head);
    g.add(rider);
    g.userData.wheels = wheelsFor(g, 0.5, spec.l, 2);
    return g;
  }
  if (type === 'truck') {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(spec.w, 1.5, 1.7), paint);
    cab.position.set(0, 1.05, spec.l / 2 - 0.85); cab.castShadow = true; g.add(cab);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(spec.w - 0.3, 0.6, 0.1), glass);
    shield.position.set(0, 1.45, spec.l / 2 + 0.02); g.add(shield);
    const box = new THREE.Mesh(new THREE.BoxGeometry(spec.w + 0.15, 2.3, spec.l - 1.9),
      new THREE.MeshLambertMaterial({ color: opts.boxColor || 0xe8e4da }));
    box.position.set(0, 1.55, -0.85); box.castShadow = true; g.add(box);
  } else {
    const low = type === 'sports';
    const bodyH = low ? 0.52 : 0.66;
    const body = new THREE.Mesh(new THREE.BoxGeometry(spec.w, bodyH, spec.l), paint);
    body.position.y = 0.62; body.castShadow = true; g.add(body);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(spec.w - 0.2, 0.3, 0.7), paint);
    nose.position.set(0, 0.5, spec.l / 2 + 0.2); g.add(nose);
    if (type === 'pickup') {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(spec.w - 0.15, 0.62, 1.6), glass);
      cab.position.set(0, 1.2, 0.7); g.add(cab);
      const bed = new THREE.Mesh(new THREE.BoxGeometry(spec.w - 0.1, 0.3, 2.2), darkMat());
      bed.position.set(0, 0.95, -1.2); g.add(bed);
    } else {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(spec.w - 0.24, low ? 0.42 : 0.56, spec.l * 0.46), glass);
      cab.position.set(0, 0.62 + bodyH / 2 + 0.24, -0.2); g.add(cab);
    }
    if (type === 'sports') {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(spec.w - 0.1, 0.09, 0.5), darkMat());
      wing.position.set(0, 1.05, -spec.l / 2 + 0.25); g.add(wing);
    }
  }
  const trim = new THREE.Mesh(new THREE.BoxGeometry(spec.w + 0.04, 0.13, spec.l + 0.04), darkMat());
  trim.position.y = 0.34; g.add(trim);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6bf });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3344 });
  for (const sx of [-spec.w / 2 + 0.32, spec.w / 2 - 0.32]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.08), headMat);
    hl.position.set(sx, 0.62, spec.l / 2 + 0.52); g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.08), tailMat);
    tl.position.set(sx, 0.66, -spec.l / 2 - 0.02); g.add(tl);
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.24, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    sign.position.set(0, 1.5, -0.2); g.add(sign);
  }
  if (type === 'police' || opts.police) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(spec.w + 0.06, 0.3, spec.l * 0.6),
      new THREE.MeshLambertMaterial({ color: 0x2456c8 }));
    stripe.position.y = 0.62; g.add(stripe);
    g.userData.bar = lightBar(g, 1.52);
  }
  if (opts.marker) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    dot.position.y = 2.1; g.add(dot);
  }
  g.userData.wheels = wheelsFor(g, spec.w, spec.l);
  return g;
}

export class Car {
  constructor(scene, type, color, x, z, heading, opts = {}) {
    this.type = type;
    this.spec = CAR_TYPES[type] || CAR_TYPES.sedan;
    this.x = x; this.z = z; this.heading = heading || 0;
    this.speed = 0;
    this.health = this.spec.hp;
    this.maxHealth = this.spec.hp;
    this.dead = false;
    this.occupied = false;
    this.ai = null;         // traffic.js fills this for civilian drivers
    this.crashInfo = null;
    this.wheelSpin = 0;
    this.smokeT = 0;
    this.mesh = buildCarMesh(type, color, opts);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = this.heading;
    scene.add(this.mesh);
    this.scene = scene;
    // smoke / fire sprite, hidden until damaged
    this.smoke = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getSmokeTex(), color: 0x555560, transparent: true, opacity: 0, depthWrite: false,
    }));
    this.smoke.position.set(0, 1.6, 0);
    this.smoke.scale.set(1.6, 1.6, 1);
    this.mesh.add(this.smoke);
  }

  forwardX() { return Math.sin(this.heading); }
  forwardZ() { return Math.cos(this.heading); }

  // input: { throttle: -1..1, steer: -1..1, handbrake: bool }
  drive(dt, input, city) {
    if (this.dead) { this.speed = 0; return; }
    const spec = this.spec;
    if (input.throttle > 0) this.speed += spec.accel * input.throttle * dt * (this.speed < 0 ? 2.2 : 1);
    else if (input.throttle < 0) {
      if (this.speed > 0.6) this.speed -= spec.accel * 1.4 * dt; // brake
      else this.speed = Math.max(this.speed + spec.accel * 0.55 * input.throttle * dt, -spec.top * 0.38);
    }
    const drag = input.handbrake ? 2.6 : 0.35;
    this.speed -= this.speed * drag * dt * 0.4;
    if (!input.throttle) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 2.2 * dt);
    this.speed = clamp(this.speed, -spec.top * 0.4, spec.top);
    const steerAuthority = clamp(Math.abs(this.speed) / 6, 0, 1) * (input.handbrake ? 1.5 : 1);
    if (Math.abs(this.speed) > 0.2) {
      this.heading += input.steer * spec.grip * steerAuthority * dt * (this.speed < 0 ? -1 : 1) * clamp(Math.abs(this.speed) / spec.top, 0.35, 1);
    }
    const fx = this.forwardX(), fz = this.forwardZ();
    const nx = this.x + fx * this.speed * dt;
    const nz = this.z + fz * this.speed * dt;
    // water is a wall for cars (the causeway and islands are land)
    if (!city.isLand(nx, nz)) {
      if (Math.abs(this.speed) > 7) { this.damage(6); this.crashInfo = true; }
      this.speed *= 0.3;
    } else {
      this.x = nx; this.z = nz;
    }
    this.x = clamp(this.x, -WORLD_EDGE, WORLD_EDGE);
    this.z = clamp(this.z, -WORLD_EDGE, WORLD_EDGE);
    const probe = { x: this.x + fx * spec.radius * 0.7, z: this.z + fz * spec.radius * 0.7 };
    if (city.collide(probe, spec.radius * 0.72)) {
      const impact = Math.abs(this.speed);
      if (impact > 6.5) { this.damage((impact - 5) * 1.15); this.crashInfo = true; }
      this.x = probe.x - fx * spec.radius * 0.7;
      this.z = probe.z - fz * spec.radius * 0.7;
      // slide along the wall instead of sticking
      this.speed *= impact > 6.5 ? -0.18 : 0.55;
    }
    this.wheelSpin += this.speed * dt * 2.2;
    this.syncMesh();
    this.updateSmoke(dt);
  }

  syncMesh() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const wheels = this.mesh.userData.wheels;
    if (wheels) for (const w of wheels) w.rotation.x = this.wheelSpin;
  }

  damage(amount) {
    if (this.dead) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.speed = 0;
      this.mesh.traverse((o) => {
        if (o.isMesh && o.material && o.material.color && !o.isSprite) {
          o.material = o.material.clone();
          o.material.color.multiplyScalar(0.32);
        }
      });
    }
  }

  updateSmoke(dt) {
    const ratio = this.health / this.maxHealth;
    this.smokeT -= dt;
    if (ratio < 0.62 && this.smokeT <= 0) {
      this.smokeT = 0.09;
      const s = this.smoke;
      s.material.opacity = this.dead ? 0.75 : (0.62 - ratio) * 0.9;
      s.material.color.setHex(this.dead || ratio < 0.3 ? 0xff6a33 : 0x555560);
      const sc = 1.3 + (1 - ratio) * 2.4 + Math.random() * 0.5;
      s.scale.set(sc, sc, 1);
      s.position.y = 1.5 + Math.random() * 0.4;
    }
    if (ratio >= 0.62) this.smoke.material.opacity = 0;
  }

  flashLights(t) {
    const bar = this.mesh.userData.bar;
    if (!bar) return;
    const on = Math.floor(t * 6) % 2 === 0;
    bar.red.material.color.setHex(on ? 0xff2233 : 0x551119);
    bar.blue.material.color.setHex(on ? 0x2255ff : 0x112255);
    const barGroup = bar.red.parent;
    if (barGroup) barGroup.visible = !this.dead;
  }

  remove() {
    this.scene.remove(this.mesh);
  }
}

// ------------------------------------------------------------ helicopter
export function buildHeliMesh(color, opts = {}) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const dark = darkMat();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.9, 4.6), paint);
  body.position.y = 1.7; body.castShadow = true; g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.25, 1.3), glassMat());
  nose.position.set(0, 1.55, 2.6); g.add(nose);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 4.6), paint);
  tail.position.set(0, 2.1, -4.2); g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, 0.8), paint);
  fin.position.set(0, 2.7, -6.3); g.add(fin);
  const skidL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 4.4), dark);
  skidL.position.set(-1.15, 0.25, 0.4); g.add(skidL);
  const skidR = skidL.clone(); skidR.position.x = 1.15; g.add(skidR);
  for (const sx of [-1.15, 1.15]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.8, 0.14), dark);
    leg.position.set(sx, 0.7, 1.4); g.add(leg);
    const leg2 = leg.clone(); leg2.position.z = -0.8; g.add(leg2);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.7, 6), dark);
  mast.position.y = 2.95; g.add(mast);
  const rotor = new THREE.Group();
  const bladeMat = new THREE.MeshBasicMaterial({ color: 0x22262c });
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.06, 0.55), bladeMat);
  rotor.add(b1);
  const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 11.5), bladeMat);
  rotor.add(b2);
  rotor.position.y = 3.3;
  g.add(rotor);
  g.userData.rotor = rotor;
  if (opts.police) {
    g.userData.bar = lightBar(g, 0.9);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(3.4, 15, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }));
    cone.geometry.translate(0, -7.5, 0);
    cone.position.set(0, 0.6, 1.4);
    g.add(cone);
    g.userData.spot = cone;
  }
  return g;
}

export class Helicopter {
  constructor(scene, color, x, z, opts = {}) {
    this.x = x; this.z = z;
    this.heading = opts.heading || 0;
    this.alt = 0; this.vy = 0;
    this.speed = 0;
    this.rotorSpin = 0;
    this.landed = true;
    this.occupied = false;
    this.police = !!opts.police;
    this.health = 160;
    this.dead = false;
    this.mesh = buildHeliMesh(color, opts);
    this.scene = scene;
    scene.add(this.mesh);
    this.syncMesh(null);
  }

  floorY(city) { return city.heightAt(this.x, this.z); }

  // input: { throttle: -1..1, turn: -1..1, lift: -1..1 }
  update(dt, input, city) {
    const targetSpin = (this.occupied || this.police) ? 42 : 0;
    this.rotorSpin += (targetSpin - this.rotorSpin) * Math.min(1, dt * (targetSpin > this.rotorSpin ? 0.7 : 0.4));
    const spooled = clamp(this.rotorSpin / 42, 0, 1);
    if (spooled > 0.75) {
      this.vy += input.lift * 14 * dt;
      if (input.lift === 0) this.vy -= this.vy * 2.4 * dt;
      this.vy = clamp(this.vy, -11, 13);
      this.alt += this.vy * dt;
      if (this.alt <= 0) {
        this.alt = 0;
        if (this.vy < -7) { this.damage(18); }
        this.vy = 0;
        this.landed = true;
      } else this.landed = false;
      if (!this.landed) {
        this.heading += input.turn * 1.25 * dt;
        const accel = input.throttle * 15;
        this.speed += accel * dt;
        this.speed -= this.speed * 0.55 * dt;
        this.speed = clamp(this.speed, -9, 30);
        const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
        const nx = this.x + fx * this.speed * dt;
        const nz = this.z + fz * this.speed * dt;
        // buildings are walls in the air too when low
        const probe = { x: nx, z: nz };
        const floorThere = city.heightAt(nx, nz);
        if (floorThere > this.floorY(city) + this.alt + 1.2 && city.collide(probe, 2.4)) {
          this.speed *= -0.25;
          if (Math.abs(this.speed) > 8) this.damage(10);
        } else { this.x = nx; this.z = nz; }
        this.x = clamp(this.x, -WORLD_EDGE, WORLD_EDGE);
        this.z = clamp(this.z, -WORLD_EDGE, WORLD_EDGE);
      } else {
        this.speed = 0;
      }
    } else {
      this.vy = 0;
      if (this.alt > 0) { this.alt = Math.max(0, this.alt - 3 * dt); this.landed = this.alt === 0; }
    }
    this.syncMesh(city);
  }

  // police / scripted flight: steer toward a point at a target altitude
  aiMove(dt, tx, tz, altTarget, city) {
    this.rotorSpin += (42 - this.rotorSpin) * Math.min(1, dt * 0.8);
    const dx = tx - this.x, dz = tz - this.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    let dh = want - this.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.heading += clamp(dh, -1.5 * dt, 1.5 * dt);
    const spd = clamp(dist * 0.55, 4, 24);
    this.speed += (spd - this.speed) * Math.min(1, dt * 1.6);
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    this.alt += clamp(altTarget - this.alt, -9 * dt, 9 * dt);
    this.landed = this.alt <= 0.01;
    this.syncMesh(city);
  }

  damage(amount) {
    this.health -= amount;
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      this.mesh.traverse((o) => {
        if (o.isMesh && o.material && o.material.color) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.3); }
      });
    }
  }

  syncMesh(city) {
    const floor = city ? this.floorY(city) : 0;
    this.mesh.position.set(this.x, floor + this.alt, this.z);
    this.mesh.rotation.y = this.heading;
    this.mesh.rotation.x = clamp(this.speed * 0.006, -0.12, 0.2);
    const rotor = this.mesh.userData.rotor;
    if (rotor) rotor.rotation.y += this.rotorSpin * 0.12;
    const bar = this.mesh.userData.bar;
    if (bar) {
      const on = Math.floor(performance.now() / 160) % 2 === 0;
      bar.red.material.color.setHex(on ? 0xff2233 : 0x551119);
      bar.blue.material.color.setHex(on ? 0x2255ff : 0x112255);
    }
  }

  remove() { this.scene.remove(this.mesh); }
}

// ------------------------------------------------------------ boat
export function buildBoatMesh(color) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 6.4),
    new THREE.MeshLambertMaterial({ color }));
  hull.position.y = 0.55; hull.castShadow = true; g.add(hull);
  const bow = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 1.0, 3, 1),
    new THREE.MeshLambertMaterial({ color }));
  bow.rotation.y = Math.PI;
  bow.scale.set(1, 1, 1.6);
  bow.position.set(0, 0.55, 3.6); g.add(bow);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.9, 2.2),
    new THREE.MeshLambertMaterial({ color: 0xf4f6f8 }));
  cabin.position.set(0, 1.4, -0.5); g.add(cabin);
  const shield = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 0.12), glassMat());
  shield.position.set(0, 1.6, 0.62); g.add(shield);
  const motor = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.4), darkMat());
  motor.position.set(0, 0.8, -3.4); g.add(motor);
  const foam = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getSmokeTex(), color: 0xeaf7ff, transparent: true, opacity: 0, depthWrite: false,
  }));
  foam.scale.set(3.4, 1.4, 1);
  foam.position.set(0, 0.25, -3.8);
  g.add(foam);
  g.userData.foam = foam;
  return g;
}

export class Boat {
  constructor(scene, color, x, z, heading) {
    this.x = x; this.z = z; this.heading = heading || 0;
    this.speed = 0;
    this.health = 120;
    this.dead = false;
    this.occupied = false;
    this.bobT = Math.random() * 6;
    this.spec = { top: 21, accel: 9, radius: 2.6 };
    this.mesh = buildBoatMesh(color);
    this.scene = scene;
    scene.add(this.mesh);
    this.syncMesh();
  }

  // input: { throttle: -1..1, steer: -1..1 }
  drive(dt, input, city) {
    if (this.dead) { this.speed = 0; this.syncMesh(); return; }
    this.bobT += dt;
    if (input.throttle) this.speed += this.spec.accel * input.throttle * dt;
    this.speed -= this.speed * 0.5 * dt;
    if (!input.throttle) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 1.6 * dt);
    this.speed = clamp(this.speed, -6, this.spec.top);
    if (Math.abs(this.speed) > 0.3) {
      this.heading += input.steer * 1.15 * dt * (this.speed < 0 ? -1 : 1) * clamp(Math.abs(this.speed) / 7, 0.3, 1);
    }
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const nx = this.x + fx * this.speed * dt;
    const nz = this.z + fz * this.speed * dt;
    if (city.isLand(nx, nz)) {
      // shore, dock or causeway wall: boats stop, hard hits cost hull
      if (Math.abs(this.speed) > 6) this.damage(7);
      this.speed *= 0.25;
    } else {
      this.x = nx; this.z = nz;
    }
    this.x = clamp(this.x, -WORLD_EDGE, WORLD_EDGE);
    this.z = clamp(this.z, -WORLD_EDGE, WORLD_EDGE);
    const foam = this.mesh.userData.foam;
    if (foam) foam.material.opacity = clamp(Math.abs(this.speed) / this.spec.top, 0, 1) * 0.65;
    this.syncMesh();
  }

  damage(amount) {
    this.health -= amount;
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      this.mesh.traverse((o) => {
        if (o.isMesh && o.material && o.material.color) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.35); }
      });
    }
  }

  syncMesh() {
    this.mesh.position.set(this.x, 0.05 + Math.sin(this.bobT * 1.7) * 0.09, this.z);
    this.mesh.rotation.y = this.heading;
    this.mesh.rotation.z = Math.sin(this.bobT * 1.3) * 0.02;
    this.mesh.rotation.x = clamp(-this.speed * 0.004, -0.06, 0.03);
  }

  remove() { this.scene.remove(this.mesh); }
}
