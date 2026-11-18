// HEATWAVE CITY — low-poly cars (box body, cabin, wheels, light bars), arcade
// driving physics, building collision and car-to-car separation. One Car
// shape is shared by parked, traffic, police and the player's ride.

import { THREE, clamp, collideCircle, rr, pick } from './config.js';
import { glowTexture } from './textures.js';

export const CAR_COLORS = [0xd94f30, 0x2e86ab, 0xf2c14e, 0x76b041, 0xe8e3d9, 0x35393f, 0x9b5de5, 0x00b4a2, 0xef6f6c, 0xf15bb5];
const glassMat = new THREE.MeshLambertMaterial({ color: 0x1d2b38 });
const tyreMat = new THREE.MeshLambertMaterial({ color: 0x17181a });
const chromeMat = new THREE.MeshLambertMaterial({ color: 0xb9c2c9 });

let _uid = 1;
export function createCar(scene, x, z, yaw, opts = {}) {
  const kind = opts.kind || 'parked';
  const police = kind === 'police';
  const color = police ? 0xf2f3f5 : (opts.color ?? pick(CAR_COLORS));
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 4.3), paint);
  body.position.y = 0.58; body.castShadow = true; g.add(body);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 1.0), paint);
  hood.position.set(0, 0.48, 1.85); g.add(hood);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.52, 1.9), police ? new THREE.MeshLambertMaterial({ color: 0x22262c }) : glassMat);
  cabin.position.set(0, 1.08, -0.25); cabin.castShadow = true; g.add(cabin);
  if (police) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.2, 4.34), new THREE.MeshLambertMaterial({ color: 0x22262c }));
    stripe.position.y = 0.6; g.add(stripe);
    const barR = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    barR.position.set(-0.32, 1.42, -0.25); g.add(barR);
    const barB = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    barB.position.set(0.32, 1.42, -0.25); g.add(barB);
    g.userData.barR = barR; g.userData.barB = barB;
  }
  const hl = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
  const tl = new THREE.MeshBasicMaterial({ color: 0xff3333 });
  for (const sx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), hl); h.position.set(sx, 0.62, 2.16); g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), tl); t.position.set(sx, 0.66, -2.16); g.add(t);
  }
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.18, 0.24), chromeMat);
  bumper.position.set(0, 0.32, 2.2); g.add(bumper);
  const wheelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.3, 10);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.42], [0.95, 1.42], [-0.95, -1.42], [0.95, -1.42]]) {
    const w = new THREE.Mesh(wheelGeo, tyreMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.37, wz); g.add(w); wheels.push(w);
  }
  g.position.set(x, 0, z); g.rotation.y = yaw;
  scene.add(g);
  return {
    id: _uid++, kind, mesh: g, wheels, x, z, yaw, speed: 0, steerVis: 0,
    damage: 0, radius: 1.35, dead: false, honkCd: rr(0, 4),
    maxSpeed: kind === 'police' ? 27 : kind === 'player' ? 34 : 13.5,
    accel: kind === 'police' ? 11 : kind === 'player' ? 12 : 7,
  };
}

// Advance one car. input: {throttle -1..1, steer -1..1 (left positive), brake bool, handbrake bool}.
// Returns crash intensity 0..1 when it slammed something this step.
export function stepCar(car, input, dt, colliders) {
  const maxF = car.maxSpeed * (1 - car.damage * 0.35);
  const maxR = 9;
  let crash = 0;
  if (input.brake && car.speed > 0.5) {
    car.speed -= 24 * dt; // a real brake: strong decel while rolling forward
  } else if (input.throttle > 0) {
    car.speed += car.accel * input.throttle * dt * (car.speed < 0 ? 2.2 : 1);
  } else if (input.throttle < 0) {
    car.speed += 8 * input.throttle * dt; // reverse gear (also slows a forward roll)
  }
  car.speed -= car.speed * (input.handbrake ? 0.9 : 0.28) * dt;          // drag
  if (!input.throttle && !input.brake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 2.2 * dt);
  car.speed = clamp(car.speed, -maxR, maxF);
  const sf = clamp(car.speed / 7, -1.4, 1.4);
  car.yaw += input.steer * sf * dt * (input.handbrake ? 2.4 : 1.55);
  car.steerVis = input.steer;
  const ox = car.x, oz = car.z;
  car.x += Math.sin(car.yaw) * car.speed * dt;
  car.z += Math.cos(car.yaw) * car.speed * dt;
  const p = { x: car.x, z: car.z };
  if (collideCircle(p, car.radius, colliders)) {
    // How much of the intended move the wall ate: ~1 is a head-on slam
    // (crash, big slowdown), ~0 is a glancing scrape (keep speed and slide
    // along the face — AI drivers rely on this to round corners).
    const intended = Math.max(0.001, Math.abs(car.speed * dt));
    const moved = Math.hypot(p.x - ox, p.z - oz);
    const blocked = clamp(1 - moved / intended, 0, 1);
    car.x = p.x; car.z = p.z;
    if (blocked > 0.72 && Math.abs(car.speed) > 8) {
      crash = clamp(Math.abs(car.speed) / 22, 0.2, 1);
      car.damage = Math.min(1, car.damage + Math.abs(car.speed) / 90);
      car.speed *= 0.3;
    } else {
      car.speed *= 0.94;
    }
  }
  // world bounds: keep cars in the play area
  car.x = clamp(car.x, -292, 292); car.z = clamp(car.z, -292, 372);
  syncCarMesh(car, dt);
  return crash;
}

export function syncCarMesh(car, dt = 0.016) {
  car.mesh.position.set(car.x, car.damage > 0.75 ? 0.03 : 0, car.z);
  car.mesh.rotation.y = car.yaw;
  car.mesh.rotation.z = -car.steerVis * clamp(car.speed / 30, -1, 1) * 0.05;
  const spin = car.speed * dt / 0.37;
  car.wheels.forEach((w, i) => {
    w.rotation.x += spin;
    if (i < 2) w.rotation.y = car.steerVis * 0.42;
  });
  if (car.kind === 'police') {
    const t = performance.now() / 140;
    car.mesh.userData.barR.material.color.setScalar(0).offsetHSL(0, 1, (Math.sin(t) > 0 ? 0.55 : 0.18));
    car.mesh.userData.barB.material.color.setScalar(0).offsetHSL(0.66, 1, (Math.sin(t) <= 0 ? 0.55 : 0.18));
  }
}

// Positional separation so cars never overlap; returns the hardest bump speed.
export function separateCars(cars) {
  let bump = 0;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i]; if (a.dead) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j]; if (b.dead) continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      const d2 = dx * dx + dz * dz, min = a.radius + b.radius + 0.25;
      if (d2 > min * min || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), push = (min - d) / 2, nx = dx / d, nz = dz / d;
      const rel = Math.abs(a.speed - b.speed);
      if (a.kind !== 'parked') { a.x -= nx * push; a.z -= nz * push; }
      if (b.kind !== 'parked') { b.x += nx * push; b.z += nz * push; }
      if (rel > 5) { bump = Math.max(bump, rel / 24); a.damage = Math.min(1, a.damage + rel / 160); b.damage = Math.min(1, b.damage + rel / 160); }
      if (a.kind !== 'parked') a.speed *= 0.82;
      if (b.kind !== 'parked') b.speed *= 0.82;
      syncCarMesh(a); syncCarMesh(b);
    }
  }
  return bump;
}

// --- damage smoke -------------------------------------------------------------
let smokePool = null;
export function initSmoke(scene) {
  const tex = glowTexture();
  smokePool = [];
  for (let i = 0; i < 40; i++) {
    const m = new THREE.SpriteMaterial({ map: tex, color: 0x555555, transparent: true, opacity: 0, depthWrite: false });
    const s = new THREE.Sprite(m); s.visible = false; s.userData.life = 0; scene.add(s); smokePool.push(s);
  }
}
export function updateSmoke(cars, dt) {
  if (!smokePool) return;
  for (const s of smokePool) {
    if (!s.visible) continue;
    s.userData.life -= dt;
    if (s.userData.life <= 0) { s.visible = false; continue; }
    s.position.y += dt * 2.2; s.scale.multiplyScalar(1 + dt * 1.4);
    s.material.opacity = Math.min(0.4, s.userData.life * 0.5);
  }
  for (const car of cars) {
    if (car.dead || car.damage < 0.5) continue;
    if (Math.random() > dt * 6) continue;
    const s = smokePool.find((p) => !p.visible); if (!s) return;
    s.visible = true; s.userData.life = rr(0.7, 1.3);
    s.position.set(car.x + Math.sin(car.yaw) * 1.6, 1.1, car.z + Math.cos(car.yaw) * 1.6);
    s.scale.set(0.8, 0.8, 1);
  }
}
