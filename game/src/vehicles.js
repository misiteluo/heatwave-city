// vehicles.js — the low-poly car: a box body, cabin, four wheels and a
// damage state, plus the arcade driving physics shared by the player,
// traffic and the police (they differ only in who feeds the inputs).

import { clamp } from './config.js';
import { dotTexture } from './textures.js';

let smokeTex = null;

export function buildCarMesh(color, opts = {}) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x22262c });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fd8ef });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 4.3), paint);
  body.position.y = 0.62; body.castShadow = true; g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.34, 0.7), paint);
  nose.position.set(0, 0.5, 2.3); g.add(nose);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.58, 2.1), glass);
  cabin.position.set(0, 1.2, -0.25); cabin.castShadow = true; g.add(cabin);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.14, 4.34), dark);
  trim.position.y = 0.34; g.add(trim);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6bf });
  for (const sx of [-0.68, 0.68]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), lightMat);
    hl.position.set(sx, 0.66, 2.66); g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xff3344 }));
    tl.position.set(sx, 0.68, -2.16); g.add(tl);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
  const wheels = [];
  for (const [sx, sz] of [[-1.02, 1.45], [1.02, 1.45], [-1.02, -1.45], [1.02, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.rotation.z = Math.PI / 2;
    w.position.set(sx, 0.42, sz);
    g.add(w); wheels.push(w);
  }
  if (opts.police) {
    const bar = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.5), dark);
    base.position.y = 1.58; bar.add(base);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.2, 0.44),
      new THREE.MeshBasicMaterial({ color: 0xff2233 }));
    red.position.set(-0.38, 1.6, 0); bar.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.2, 0.44),
      new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    blue.position.set(0.38, 1.6, 0); bar.add(blue);
    g.add(bar);
    g.userData.lightBar = bar;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.2, 4.32),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    stripe.position.y = 0.82; g.add(stripe);
  }
  if (opts.marker) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    fin.position.set(0, 1.05, -2.0); g.add(fin);
  }
  g.userData.wheels = wheels;
  return g;
}

export class Car {
  constructor(scene, color, x, z, heading, opts = {}) {
    this.mesh = buildCarMesh(color, opts);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.scene = scene;
    this.x = x; this.z = z; this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.occupied = false;
    this.isPolice = !!opts.police;
    this.isMissionCar = !!opts.marker;
    this.dead = false;
    this.smokeTimer = 0;
    this.smokes = [];
    if (!smokeTex) smokeTex = dotTexture();
  }

  get pos() { return this.mesh.position; }
  forwardX() { return Math.sin(this.heading); }
  forwardZ() { return Math.cos(this.heading); }

  // input: {throttle -1..1, steer -1..1, handbrake bool}
  drive(dt, input, city) {
    const accel = input.throttle > 0 ? 17 : 11;
    const maxF = 34, maxR = -11;
    if (input.throttle !== 0) this.speed += input.throttle * accel * dt * (input.throttle > 0 ? 1 : 1);
    else this.speed -= this.speed * 1.4 * dt;
    if (input.handbrake) this.speed -= this.speed * 3.2 * dt;
    const drag = 0.22;
    this.speed -= this.speed * drag * dt;
    this.speed = clamp(this.speed, maxR, maxF);
    if (Math.abs(this.speed) < 0.04 && input.throttle === 0) this.speed = 0;
    const targetSteer = input.steer * 0.55;
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * 8);
    if (this.speed !== 0) {
      const turn = this.steer * (input.handbrake ? 2.1 : 1.35) * dt * Math.sign(this.speed)
        * clamp(Math.abs(this.speed) / 9, 0.25, 1);
      this.heading += turn;
    }
    const nx = this.x + this.forwardX() * this.speed * dt;
    const nz = this.z + this.forwardZ() * this.speed * dt;
    const before = { x: this.x, z: this.z };
    this.x = nx; this.z = nz;
    // world bounds: keep cars on the map (beach driving allowed, sea is not)
    this.x = clamp(this.x, -252, 252);
    this.z = clamp(this.z, -232, 292);
    const probe = { x: this.x, z: this.z };
    if (city && city.collide(probe, 1.75)) {
      const impact = Math.abs(this.speed);
      this.x = probe.x; this.z = probe.z;
      if (impact > 7) {
        this.damage((impact - 6) * 1.6);
        this.speed *= -0.25;
        this.crashInfo = { impact, x: before.x, z: before.z };
      } else this.speed *= 0.4;
    }
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    this.mesh.rotation.z = -this.steer * clamp(Math.abs(this.speed) / 30, 0, 1) * 0.55;
    const spin = this.speed * dt * 2.2;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    this.updateSmoke(dt);
  }

  damage(amount) {
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) this.dead = true;
  }

  updateSmoke(dt) {
    this.smokeTimer -= dt;
    if (this.health < 45 && this.smokeTimer <= 0 && !this.dead) {
      this.smokeTimer = 0.09;
      const mat = new THREE.SpriteMaterial({ map: smokeTex, color: 0x555555, transparent: true, opacity: 0.55, depthWrite: false });
      const s = new THREE.Sprite(mat);
      s.position.set(this.x + this.forwardX() * 2, 1.2, this.z + this.forwardZ() * 2);
      s.scale.set(0.8, 0.8, 1);
      this.scene.add(s);
      this.smokes.push({ s, life: 0.9 });
    }
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const p = this.smokes[i];
      p.life -= dt;
      p.s.position.y += dt * 1.7;
      p.s.scale.multiplyScalar(1 + dt * 1.4);
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
