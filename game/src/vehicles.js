// HEATWAVE CITY — car factory and arcade driving physics.
// A car is a plain object: { mesh, heading, speed, health, kind, driver, ... }.
// stepCar integrates one car; resolveCarCollisions handles car-vs-car bumps for the whole fleet.

import { CAR, clamp, pushOutOfBox } from './config.js';
import { makeGlowTexture } from './textures.js';

const bodyGeo = new THREE.BoxGeometry(CAR.width, 0.62, CAR.length);
const cabinGeo = new THREE.BoxGeometry(CAR.width * 0.82, 0.55, CAR.length * 0.46);
const wheelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.3, 10);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x17181c });
const glassMat = new THREE.MeshPhongMaterial({ color: 0x2c4a5e, shininess: 80, specular: 0xaaccdd });
const trimMat = new THREE.MeshLambertMaterial({ color: 0x22242a });
const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });

let smokePool = null;

export function createCar(scene, { color = 0xd64541, kind = 'civilian' } = {}) {
  const mesh = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(bodyGeo, paint);
  body.position.y = 0.55; body.castShadow = true;
  mesh.add(body);
  const cabin = new THREE.Mesh(cabinGeo, glassMat);
  cabin.position.set(0, 1.1, -0.25); cabin.castShadow = true;
  mesh.add(cabin);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(CAR.width + 0.06, 0.2, CAR.length * 0.9), trimMat);
  skirt.position.y = 0.26;
  mesh.add(skirt);
  // headlights / tail lights (nose is +z)
  for (const sx of [-0.62, 0.62]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), lightMat);
    hl.position.set(sx, 0.62, CAR.length / 2 + 0.01);
    mesh.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.06), tailMat);
    tl.position.set(sx, 0.66, -CAR.length / 2 - 0.01);
    mesh.add(tl);
  }
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.37, wz);
    mesh.add(w); wheels.push(w);
  }
  const car = {
    mesh, wheels, heading: 0, speed: 0, steerVis: 0,
    health: CAR.maxHealth, kind, driver: null, dead: false,
    smokeAcc: 0, radius: CAR.radius, honkCd: 0,
    lightRed: null, lightBlue: null,
  };
  if (kind === 'police') {
    const band = new THREE.Mesh(new THREE.BoxGeometry(CAR.width + 0.04, 0.3, CAR.length * 0.5), trimMat);
    band.position.y = 0.58; mesh.add(band);
    const barMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 0.5), barMat);
    bar.position.set(0, 1.45, -0.25); mesh.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.52), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.set(-0.31, 1.46, -0.25); mesh.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.52), new THREE.MeshBasicMaterial({ color: 0x2255ff }));
    blue.position.set(0.31, 1.46, -0.25); mesh.add(blue);
    car.lightRed = red; car.lightBlue = blue;
  }
  mesh.rotation.order = 'YXZ';
  scene.add(mesh);
  return car;
}

export function placeCar(car, x, z, heading) {
  car.mesh.position.set(x, 0, z);
  car.heading = heading;
  car.speed = 0;
  syncCarMesh(car, 0);
}

export function syncCarMesh(car, dt) {
  car.mesh.position.y = 0;
  car.mesh.rotation.y = car.heading;
  // body roll/pitch flavour from steering and acceleration
  car.mesh.rotation.z = -car.steerVis * clamp(car.speed / CAR.maxSpeed, -1, 1) * 0.05;
  const spin = (car.speed * dt) / 0.37;
  for (let i = 0; i < car.wheels.length; i++) {
    car.wheels[i].rotation.x += spin;
    if (i < 2) car.wheels[i].rotation.y = car.steerVis * 0.45;
  }
}

// control: { throttle: -1..1, steer: -1..1 (left positive), handbrake: bool }
// Returns impact speed when the car slammed a building this step (0 otherwise).
export function stepCar(car, dt, control, world) {
  if (car.dead) { car.speed = 0; return 0; }
  const engineFactor = car.health <= 0 ? 0 : 1;
  if (control.throttle > 0) car.speed += CAR.accel * control.throttle * engineFactor * dt;
  else if (control.throttle < 0) {
    car.speed += (car.speed > 0.5 ? -CAR.brake : CAR.accel * control.throttle * 0.7) * dt;
  }
  // rolling drag + air drag
  car.speed -= car.speed * CAR.drag * dt * 0.35;
  if (!control.throttle) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 2.2 * dt);
  if (control.handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
  car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed * (0.35 + 0.65 * (car.health / CAR.maxHealth)));

  const speedRatio = clamp(car.speed / 9, -1, 1);
  car.steerVis += ((control.steer || 0) - car.steerVis) * Math.min(1, dt * 8);
  car.heading += car.steerVis * CAR.turnRate * speedRatio * dt * (control.handbrake ? 1.5 : 1);

  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  car.mesh.position.x += fx * car.speed * dt;
  car.mesh.position.z += fz * car.speed * dt;

  // world bounds
  const b = world.bounds;
  car.mesh.position.x = clamp(car.mesh.position.x, b.minX, b.maxX);
  car.mesh.position.z = clamp(car.mesh.position.z, b.minZ, b.maxZ);

  // buildings
  let impact = 0;
  const p = car.mesh.position;
  for (const box of world.colliders) {
    const before = Math.abs(car.speed);
    if (pushOutOfBox(p, car.radius, box)) {
      impact = Math.max(impact, before);
      car.speed *= -0.18;
      car.health = Math.max(0, car.health - before * 0.9);
    }
  }
  syncCarMesh(car, dt);
  return impact;
}

// Pairwise car bumps: push apart, trade momentum, report the hardest hit via onCrash(a, b, severity).
export function resolveCarCollisions(cars, onCrash) {
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i]; if (a.dead) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j]; if (b.dead) continue;
      const dx = b.mesh.position.x - a.mesh.position.x;
      const dz = b.mesh.position.z - a.mesh.position.z;
      const rr = a.radius + b.radius - 0.4;
      const d2 = dx * dx + dz * dz;
      if (d2 > rr * rr || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, nz = dz / d;
      const push = (rr - d) / 2;
      a.mesh.position.x -= nx * push; a.mesh.position.z -= nz * push;
      b.mesh.position.x += nx * push; b.mesh.position.z += nz * push;
      const rel = Math.abs(a.speed - b.speed) + Math.abs(a.speed) * 0.3;
      const avg = (a.speed + b.speed) / 2;
      a.speed = avg + (a.speed - avg) * 0.3;
      b.speed = avg + (b.speed - avg) * 0.3;
      if (rel > 3.5) {
        a.health = Math.max(0, a.health - rel * 0.55);
        b.health = Math.max(0, b.health - rel * 0.55);
        if (onCrash) onCrash(a, b, rel);
      }
    }
  }
}

// --- damage smoke ------------------------------------------------------------
export function initSmoke(scene) {
  const tex = makeGlowTexture('rgba(70,70,78,0.85)', 'rgba(70,70,78,0)');
  smokePool = [];
  for (let i = 0; i < 90; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
    s.scale.set(1, 1, 1);
    s.visible = false;
    scene.add(s);
    smokePool.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0 });
  }
}

export function updateSmoke(dt, cars) {
  if (!smokePool) return;
  for (const car of cars) {
    if (car.dead || car.health > 48) continue;
    car.smokeAcc += dt * (car.health < 20 ? 9 : 4);
    while (car.smokeAcc > 1) {
      car.smokeAcc -= 1;
      const p = smokePool.find((q) => q.life <= 0);
      if (!p) break;
      p.life = p.max = 0.9 + Math.random() * 0.7;
      p.s.position.set(car.mesh.position.x + (Math.random() - 0.5) * 0.7, 1.1, car.mesh.position.z + (Math.random() - 0.5) * 0.7);
      p.vx = (Math.random() - 0.5) * 0.5; p.vy = 2.2 + Math.random(); p.vz = (Math.random() - 0.5) * 0.5;
      p.s.visible = true;
    }
  }
  for (const p of smokePool) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.s.visible = false; p.s.material.opacity = 0; continue; }
    const t = 1 - p.life / p.max;
    p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
    const sc = 0.8 + t * 2.4;
    p.s.scale.set(sc, sc, 1);
    p.s.material.opacity = 0.5 * (1 - t);
  }
}
