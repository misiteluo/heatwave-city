// HEATWAVE CITY — the player: a box-built character (Jett) with third-person
// camera, on-foot movement, entering/leaving cars and the driving camera.

import { THREE, clamp, lerp, angleLerp, angleWrap, dist2d, collideCircle, PLAYER_MAX_HP } from './config.js';
import { buildHumanoid, animateHumanoid } from './pedestrians.js';
import { stepCar, syncCarMesh } from './vehicles.js';
import { addCrime } from './police.js';

export function createPlayer(G) {
  const h = buildHumanoid(0x00b4a2, 0x2b2d42, 0xf2c09a);
  G.scene.add(h.group);
  G.player = {
    h, x: -246, z: -246, yaw: 0.6, hp: PLAYER_MAX_HP, phase: 0,
    speedNow: 0, attackCd: 0,
  };
  G.camYaw = 0.6; G.camPitch = 0.32;
  G.mode = 'menu';
  G.playerPos = { x: G.player.x, z: G.player.z };
  G.playerVel = { x: 0, z: 0 };
}

export function nearestCar(G, maxD = 3.4) {
  let best = null, bd = maxD;
  for (const car of G.cars) {
    if (car.dead) continue;
    const d = dist2d(G.player.x, G.player.z, car.x, car.z);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

export function enterCar(G, car) {
  const wasTraffic = car.kind === 'traffic';
  if (wasTraffic) { // drag the driver out: they become a fleeing pedestrian
    const i = G.trafficCars.indexOf(car); if (i >= 0) G.trafficCars.splice(i, 1);
    G.spawnEjectedDriver(car);
    addCrime(G, 110, car.x, car.z);
    G.hud.toast('Car jacked!');
  } else if (car.kind === 'parked') {
    addCrime(G, 70, car.x, car.z);
  }
  if (car.marked) { car.marked = false; if (car.ring) { car.ring.visible = false; } G.events.push({ type: 'stoleMarked', car }); }
  car.kind = 'player';
  G.playerCar = car;
  G.mode = 'car';
  G.player.h.group.visible = false;
  G.audio.pickup();
}

export function exitCar(G) {
  const car = G.playerCar;
  if (!car) return;
  car.kind = 'parked'; car.parked = true; car.speed = 0;
  const side = car.yaw + Math.PI / 2;
  G.player.x = car.x + Math.sin(side) * 2.4;
  G.player.z = car.z + Math.cos(side) * 2.4;
  const p = { x: G.player.x, z: G.player.z };
  collideCircle(p, 0.55, G.colliders); G.player.x = p.x; G.player.z = p.z;
  G.player.yaw = car.yaw;
  G.playerCar = null;
  G.mode = 'foot';
  G.player.h.group.visible = true;
}

export function updatePlayerFoot(G, dt) {
  const p = G.player, k = G.keys;
  // Camera orbit from accumulated mouse drag.
  G.camYaw -= G.lookDX * 0.0052; G.camPitch = clamp(G.camPitch + G.lookDY * 0.004, -0.05, 1.1);
  G.lookDX = 0; G.lookDY = 0;
  let mx = 0, mz = 0;
  const f = (k['KeyW'] || k['ArrowUp'] ? 1 : 0) - (k['KeyS'] || k['ArrowDown'] ? 1 : 0);
  const s = (k['KeyD'] || k['ArrowRight'] ? 1 : 0) - (k['KeyA'] || k['ArrowLeft'] ? 1 : 0);
  const sy = Math.sin(G.camYaw), cy = Math.cos(G.camYaw);
  mx = sy * f + cy * s; mz = cy * f - sy * s;
  const moving = Math.hypot(mx, mz) > 0.01;
  const sprint = k['ShiftLeft'] || k['ShiftRight'];
  const speed = sprint ? 6.6 : 3.6;
  if (moving) {
    const len = Math.hypot(mx, mz); mx /= len; mz /= len;
    p.yaw = angleLerp(p.yaw, Math.atan2(mx, mz), dt * 12);
    p.x += mx * speed * dt; p.z += mz * speed * dt;
    p.phase += dt * speed * 2.6;
    p.speedNow = speed;
  } else p.speedNow = 0;
  const pos = { x: p.x, z: p.z };
  collideCircle(pos, 0.55, G.colliders);
  // Cars are solid on foot too.
  for (const car of G.cars) {
    if (car.dead) continue;
    const d = dist2d(pos.x, pos.z, car.x, car.z);
    if (d < 1.9 && d > 0.001) { const push = (1.9 - d) / d; pos.x += (pos.x - car.x) * push; pos.z += (pos.z - car.z) * push; }
  }
  p.x = clamp(pos.x, -296, 296); p.z = clamp(pos.z, -296, 392);
  p.h.group.position.set(p.x, 0.24 + (p.z > 292 ? -0.1 : 0), p.z);
  p.h.group.rotation.y = p.yaw;
  animateHumanoid(p.h, p.phase, sprint ? 1.5 : 1);
  if (!moving) { p.h.legL.rotation.x *= 0.8; p.h.legR.rotation.x *= 0.8; p.h.armL.rotation.x *= 0.8; p.h.armR.rotation.x *= 0.8; }
  G.playerPos.x = p.x; G.playerPos.z = p.z;
  G.playerVel.x = mx * p.speedNow; G.playerVel.z = mz * p.speedNow;
  // Camera: behind and above, looking past the player.
  const back = 6.8, up = 2.4 + G.camPitch * 3.4;
  const cx = p.x - Math.sin(G.camYaw) * back * Math.cos(G.camPitch);
  const cz = p.z - Math.cos(G.camYaw) * back * Math.cos(G.camPitch);
  const cy2 = 1.6 + up * Math.sin(G.camPitch) + 1.2;
  G.camera.position.lerp(new THREE.Vector3(cx, Math.max(1.1, cy2), cz), 1 - Math.pow(0.0001, dt));
  G.camera.lookAt(p.x + Math.sin(G.camYaw) * 5, 1.5, p.z + Math.cos(G.camYaw) * 5);
}

export function updatePlayerCar(G, dt) {
  const car = G.playerCar, k = G.keys;
  const input = {
    throttle: (k['KeyW'] || k['ArrowUp'] ? 1 : 0) - (k['KeyS'] || k['ArrowDown'] ? 1 : 0),
    steer: (k['KeyA'] || k['ArrowLeft'] ? 1 : 0) - (k['KeyD'] || k['ArrowRight'] ? 1 : 0),
    brake: !!(k['KeyS'] || k['ArrowDown']),
    handbrake: !!k['Space'],
  };
  if (input.throttle < 0) input.brake = false; // S alone is reverse; stepCar sorts it out
  const crash = stepCar(car, input, dt, G.colliders);
  if (crash > 0.25) {
    G.shake = Math.min(0.7, crash);
    G.audio.crash(crash);
    if (crash > 0.45) addCrime(G, 25, car.x, car.z);
  }
  G.playerPos.x = car.x; G.playerPos.z = car.z;
  G.playerVel.x = Math.sin(car.yaw) * car.speed; G.playerVel.z = Math.cos(car.yaw) * car.speed;
  G.audio.engine(car.speed * 3.6, true);
  // Chase camera.
  const back = 9.2 + Math.abs(car.speed) * 0.06;
  const tx = car.x - Math.sin(car.yaw) * back;
  const tz = car.z - Math.cos(car.yaw) * back;
  const ty = 3.4 + Math.abs(car.speed) * 0.012;
  G.camera.position.lerp(new THREE.Vector3(tx, ty, tz), 1 - Math.pow(0.0005, dt));
  if (G.shake > 0) {
    G.camera.position.x += (Math.random() - 0.5) * G.shake;
    G.camera.position.y += (Math.random() - 0.5) * G.shake * 0.6;
    G.shake = Math.max(0, G.shake - dt * 1.8);
  }
  G.camera.lookAt(car.x + Math.sin(car.yaw) * 7, 1.2, car.z + Math.cos(car.yaw) * 7);
  G.camYaw = car.yaw;
}
