// HEATWAVE CITY — the player: Jett Marlowe on foot (third-person orbit camera,
// WASD movement, building collision) and the enter/exit-car glue.

import { PLAYER, clamp, lerp, angleLerp, dist2d, pushOutOfBox } from './config.js';
import { buildPersonMesh, animatePerson } from './pedestrians.js';

export class Player {
  constructor(scene, rng) {
    this.mesh = buildPersonMesh(rng, { shirt: 0x16a085, pants: 0x2c3e50, skin: 0xc68863 });
    scene.add(this.mesh);
    this.heading = Math.PI; // face the city (north) at spawn
    this.mode = 'foot';     // 'foot' | 'car'
    this.car = null;
    this.health = PLAYER.maxHealth;
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.speedNow = 0;
  }

  get pos() { return this.mode === 'car' && this.car ? this.car.mesh.position : this.mesh.position; }

  teleport(x, z, heading = this.heading) {
    this.mesh.position.set(x, 0, z);
    this.heading = heading;
    this.camYaw = heading;
  }

  findNearbyCar(cars) {
    const p = this.mesh.position;
    let best = null, bd = PLAYER.enterCarRange;
    for (const car of cars) {
      if (car.dead || car.driver === 'police' || car.driver === 'blockade') continue;
      const d = dist2d(p.x, p.z, car.mesh.position.x, car.mesh.position.z);
      if (d < bd) { bd = d; best = car; }
    }
    return best;
  }

  enterCar(car) {
    this.mode = 'car';
    this.car = car;
    car.driver = 'player';
    this.mesh.visible = false;
  }

  exitCar() {
    const car = this.car;
    if (!car) return null;
    // step out on the car's left side
    const side = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
    this.mesh.position.set(car.mesh.position.x - side.x * 2.6, 0, car.mesh.position.z - side.z * 2.6);
    this.heading = car.heading;
    this.mode = 'foot';
    this.car = null;
    car.driver = 'parked';
    this.mesh.visible = true;
    return car;
  }

  // On-foot movement. input: {x: -1..1 strafe, z: -1..1 forward, sprint, lookDX, lookDY}
  updateFoot(dt, input, world) {
    this.camYaw -= (input.lookDX || 0) * 0.0052;
    this.camPitch = clamp(this.camPitch + (input.lookDY || 0) * 0.004, 0.06, 1.15);
    const p = this.mesh.position;
    const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
    // View forward on the ground plane is (sin, cos) of the camera yaw (camera sits at
    // target - forward*dist); the right vector is (-cos, sin).
    let mx = sin * input.z - cos * input.x;
    let mz = cos * input.z + sin * input.x;
    const len = Math.hypot(mx, mz);
    let speed = 0;
    if (len > 0.05) {
      mx /= len; mz /= len;
      speed = input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      const targetHeading = Math.atan2(mx, mz);
      this.heading = angleLerp(this.heading, targetHeading, dt * 11);
      p.x += mx * speed * dt;
      p.z += mz * speed * dt;
    }
    this.speedNow = speed;
    for (const box of world.colliders) pushOutOfBox(p, PLAYER.radius, box);
    const b = world.bounds;
    p.x = clamp(p.x, b.minX + 0.6, b.maxX - 0.6);
    p.z = clamp(p.z, b.minZ + 0.6, b.maxZ - 0.6);
    this.mesh.rotation.y = this.heading;
    animatePerson(this.mesh, dt, speed);
    // ease the camera yaw behind the player while moving (gentle, keeps screenshots readable)
    if (len > 0.05 && !input.looking) {
      const behind = this.heading;
      let d = behind - this.camYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.camYaw += d * dt * 0.7;
    }
  }

  // Position the third-person camera; mode-aware distance and height.
  updateCamera(camera, dt) {
    const inCar = this.mode === 'car';
    const target = inCar ? this.car.mesh.position : this.mesh.position;
    if (inCar) {
      // chase cam eases behind the car
      const behind = this.car.heading;
      let d = behind - this.camYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.camYaw += d * Math.min(1, dt * (2.2 + Math.abs(this.car.speed) * 0.05));
      this.camPitch = lerp(this.camPitch, 0.3, dt * 2);
    }
    const dist = inCar ? 11.5 : 8;
    const ty = target.y + (inCar ? 2.6 : 1.9);
    const cx = target.x - Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cz = target.z - Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cy = ty + Math.sin(this.camPitch) * dist;
    camera.position.set(cx, Math.max(1.1, cy), cz);
    camera.lookAt(target.x, ty - 0.4, target.z);
  }
}
