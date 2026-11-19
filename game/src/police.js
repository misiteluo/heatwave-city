// police.js — the Heatwave PD. Owns the wanted level (0–5 stars),
// spawns cruisers in proportion to the heat, steers them in pursuit
// with a little target prediction, plants roadblocks at four stars,
// and from three stars puts a helicopter over the player whose
// spotlight keeps the stars from decaying. Busts happen when cruisers
// pin a slow or on-foot player long enough.

import { Car, Helicopter } from './vehicles.js';
import { HALF, WANTED_DECAY_SECONDS, BUSTED_RADIUS, BUSTED_SECONDS, angleDelta, clamp, dist2d } from './config.js';

export class Police {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.cars = [];
    this.blocks = [];
    this.heli = null;
    this.wanted = 0;
    this.unseenTimer = 0;
    this.spawnTimer = 0;
    this.bustTimer = 0;
    this.blockTimer = 0;
    this.onBusted = null;
    // spotlight rig for the heli
    this.spot = new THREE.SpotLight(0xfff2c0, 0, 90, 0.42, 0.5, 0.6);
    this.spot.position.set(0, -100, 0);
    scene.add(this.spot);
    scene.add(this.spot.target);
    const coneGeo = new THREE.ConeGeometry(9, 30, 14, 1, true);
    this.spotCone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({
      color: 0xfff2a8, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
    }));
    scene.add(this.spotCone);
  }

  setWanted(n) {
    this.wanted = clamp(Math.round(n), 0, 5);
    if (this.wanted === 0) {
      for (const c of this.cars) c.remove();
      for (const c of this.blocks) c.remove();
      this.cars = []; this.blocks = [];
      this.bustTimer = 0;
      if (this.heli) { this.heli.remove(); this.heli = null; }
      this.spot.intensity = 0;
      this.spotCone.material.opacity = 0;
    }
  }

  addWanted(n) {
    this.setWanted(this.wanted + n);
    this.unseenTimer = 0;
  }

  targetCount() { return [0, 2, 3, 5, 6, 8][this.wanted] || 0; }

  spawnOne(world) {
    const px = world.playerCar ? world.playerCar.x : world.player.x;
    const pz = world.playerCar ? world.playerCar.z : world.player.z;
    let x, z;
    if (pz > HALF - 10) {
      // player is on the causeway or Gull Island: come down the causeway
      x = (Math.random() < 0.5 ? -3.4 : 3.4);
      z = Math.max(HALF + 6, pz - 95);
    } else {
      const side = Math.floor(Math.random() * 4);
      x = px; z = pz;
      if (side === 0) { x = px - 100; z = pz + (Math.random() - 0.5) * 56; }
      if (side === 1) { x = px + 100; z = pz + (Math.random() - 0.5) * 56; }
      if (side === 2) { z = pz - 100; x = px + (Math.random() - 0.5) * 56; }
      if (side === 3) { z = pz + 100; x = px + (Math.random() - 0.5) * 56; }
      x = clamp(x, -HALF - 12, HALF + 12); z = clamp(z, -HALF - 12, HALF + 12);
      const snap = (v) => {
        let best = this.city.roadsX[0], bd = 1e9;
        for (const l of this.city.roadsX) { const d = Math.abs(l - v); if (d < bd) { bd = d; best = l; } }
        return best;
      };
      if (side < 2) x = snap(x); else z = snap(z);
    }
    const car = new Car(this.scene, 'police', 0x1c2733, x, z, Math.atan2(px - x, pz - z));
    car.occupied = true;
    this.cars.push(car);
  }

  spawnRoadblock(world) {
    const px = world.playerCar ? world.playerCar.x : world.player.x;
    const pz = world.playerCar ? world.playerCar.z : world.player.z;
    const heading = world.playerCar ? world.playerCar.heading : world.player.heading;
    const bx = px + Math.sin(heading) * 58;
    const bz = pz + Math.cos(heading) * 58;
    if (!this.city.isLand(bx, bz)) return;
    for (let i = -1; i <= 1; i++) {
      const car = new Car(this.scene, 'police', 0x1c2733,
        bx + Math.cos(heading) * i * 4.8, bz - Math.sin(heading) * i * 4.8,
        heading + Math.PI / 2);
      car.occupied = true;
      this.blocks.push(car);
    }
  }

  updateHeli(dt, world, t) {
    if (this.wanted >= 3 && !this.heli) {
      const px = world.player.x, pz = world.player.z;
      this.heli = new Helicopter(this.scene, 0x1c2733, px + 60, pz - 60, { police: true, heading: 0 });
      this.heli.occupied = true;
    }
    if (!this.heli) return;
    const h = this.heli;
    if (this.wanted < 3) { h.remove(); this.heli = null; this.spot.intensity = 0; this.spotCone.material.opacity = 0; return; }
    const tx = world.playerCar ? world.playerCar.x : world.player.x;
    const tz = world.playerCar ? world.playerCar.z : world.player.z;
    // hover pursuit: circle the player at altitude, nose into the orbit
    const orbitA = t * 0.35;
    const gx = tx + Math.cos(orbitA) * 16, gz = tz + Math.sin(orbitA) * 16;
    const dx = gx - h.x, dz = gz - h.z;
    const d = Math.hypot(dx, dz) || 1;
    const wantHeading = Math.atan2(dx, dz);
    h.heading += angleDelta(h.heading, wantHeading) * Math.min(1, dt * 1.6);
    const spd = clamp(d * 0.7, 0, 26);
    h.x += Math.sin(h.heading) * spd * dt;
    h.z += Math.cos(h.heading) * spd * dt;
    h.alt += (26 - h.alt) * Math.min(1, dt * 0.8);
    h.rotorSpin = 42;
    h.mesh.userData.rotor.rotation.y += 42 * dt;
    h.mesh.userData.tailRotor.rotation.x += 58 * dt;
    const floor = this.city.heightAt(h.x, h.z);
    h.mesh.position.set(h.x, floor + h.alt, h.z);
    h.mesh.rotation.y = h.heading;
    h.mesh.rotation.x = clamp(spd * 0.008, 0, 0.2);
    // spotlight on the player
    this.spot.position.set(h.x, floor + h.alt - 1, h.z);
    this.spot.target.position.set(tx, 0, tz);
    this.spot.intensity = 1.6;
    this.spotCone.position.set((h.x + tx) / 2, (floor + h.alt) / 2, (h.z + tz) / 2);
    this.spotCone.material.opacity = 0.13;
    this.heliSees = dist2d(h.x, h.z, tx, tz) < 55;
  }

  update(dt, world, t) {
    this.updateHeli(dt, world, t);
    if (this.wanted <= 0) { this.bustTimer = 0; return; }
    this.spawnTimer -= dt;
    if (this.cars.length < this.targetCount() && this.spawnTimer <= 0) {
      this.spawnTimer = 1.3;
      this.spawnOne(world);
    }
    if (this.wanted >= 4) {
      this.blockTimer -= dt;
      if (this.blockTimer <= 0 && this.blocks.length === 0) {
        this.blockTimer = 30;
        this.spawnRoadblock(world);
      }
    } else if (this.blocks.length) {
      for (const c of this.blocks) c.remove();
      this.blocks = [];
    }

    const inCar = !!world.playerCar;
    const tx = inCar ? world.playerCar.x : world.player.x;
    const tz = inCar ? world.playerCar.z : world.player.z;
    let anySees = !!this.heliSees && !!this.heli;
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      if (car.dead) { car.speed = 0; continue; }
      const d = dist2d(car.x, car.z, tx, tz);
      if (d < 75) anySees = true;
      if (d > 340) { car.remove(); this.cars.splice(i, 1); continue; }
      // predict where the target is going and drive at that point
      let ax = tx, az = tz;
      if (inCar) {
        ax += Math.sin(world.playerCar.heading) * world.playerCar.speed * 0.45;
        az += Math.cos(world.playerCar.heading) * world.playerCar.speed * 0.45;
      }
      const wantHeading = Math.atan2(ax - car.x, az - car.z);
      const delta = angleDelta(car.heading, wantHeading);
      const input = { throttle: 0, steer: clamp(delta * 1.6, -1, 1), handbrake: false };
      const cruise = inCar ? 34 : 19;
      if (d > 7.5) input.throttle = car.speed < cruise ? 0.95 : 0;
      else if (inCar) input.throttle = Math.abs(world.playerCar.speed) > 3 ? 0.5 : 0;
      else input.throttle = car.speed > 2 ? -0.5 : 0;
      if (Math.abs(delta) > 2.4 && d < 16) input.throttle = -0.7;
      car.drive(dt, input, this.city);
      car.flashLights(t);
    }
    for (const b of this.blocks) b.flashLights(t);

    if (anySees) this.unseenTimer = 0;
    else {
      this.unseenTimer += dt;
      if (this.unseenTimer >= WANTED_DECAY_SECONDS) {
        this.unseenTimer = 0;
        this.setWanted(this.wanted - 1);
        if (world.hud) world.hud.toast('You lost the heat — one star gone');
      }
    }

    // bust: pinned on foot by a close slow cruiser, or boxed in a stopped car
    let busting = false;
    if (!inCar) {
      for (const car of this.cars) {
        if (dist2d(car.x, car.z, tx, tz) < BUSTED_RADIUS + 1.8 && Math.abs(car.speed) < 6) busting = true;
      }
    } else if (Math.abs(world.playerCar.speed) < 1.6) {
      let near = 0;
      for (const car of this.cars) if (dist2d(car.x, car.z, tx, tz) < 8) near++;
      if (near >= 2) busting = true;
    }
    if (busting) {
      this.bustTimer += dt;
      if (world.hud) world.hud.setBustProgress(this.bustTimer / BUSTED_SECONDS);
      if (this.bustTimer >= BUSTED_SECONDS && this.onBusted) this.onBusted();
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 1.6);
      if (world.hud) world.hud.setBustProgress(this.bustTimer / BUSTED_SECONDS);
    }
  }
}
