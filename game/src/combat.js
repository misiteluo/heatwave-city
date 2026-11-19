// combat.js — fists, the pistol, gang shooters and ammo pickups.
// Hitscan shooting with a visible tracer and muzzle flash; enemies are
// blocky gunmen with a floating health bar who strafe, take cover-ish
// pauses and shoot back on a timer the player can dodge by moving.

import { buildHumanoid, animateHumanoid } from './player.js';
import { SKIN_TONES, clamp, dist2d } from './config.js';
import { dotTexture } from './textures.js';

export class Enemy {
  constructor(scene, x, z, tough = 1) {
    this.mesh = buildHumanoid(0x772e25, 0x1d1d24, SKIN_TONES[3]);
    // a dark bandana instead of the hero cap colours
    this.mesh.children.forEach((c) => { if (c.position.y > 1.9) c.material = new THREE.MeshLambertMaterial({ color: 0x222222 }); });
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.scene = scene;
    this.x = x; this.z = z;
    this.health = 60 * tough;
    this.maxHealth = this.health;
    this.shootTimer = 1 + Math.random() * 1.6;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.phase = Math.random() * 6;
    this.dead = false;
    // health bar: two small sprites above the head
    const barBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x330000, depthTest: false }));
    barBg.scale.set(1.5, 0.18, 1); barBg.position.set(x, 2.5, z);
    const barFg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff4455, depthTest: false }));
    barFg.scale.set(1.44, 0.12, 1); barFg.position.set(x, 2.5, z);
    scene.add(barBg); scene.add(barFg);
    this.barBg = barBg; this.barFg = barFg;
  }

  hurt(amount, world) {
    this.health -= amount;
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.3;
      this.scene.remove(this.barBg); this.scene.remove(this.barFg);
      if (world) {
        world.onEnemyDown(this);
        // sometimes drops ammo
        if (Math.random() < 0.55 && world.combat) world.combat.dropAmmo(this.x, this.z);
      }
    }
  }

  update(dt, world) {
    if (this.dead) return;
    const px = world.player.x, pz = world.player.z;
    const d = dist2d(this.x, this.z, px, pz);
    const heading = Math.atan2(px - this.x, pz - this.z);
    this.mesh.rotation.y = heading;
    if (d > 15) { // close in
      this.x += Math.sin(heading) * 3.6 * dt;
      this.z += Math.cos(heading) * 3.6 * dt;
      this.phase += dt * 9;
    } else if (d < 7) { // back off a little
      this.x -= Math.sin(heading) * 2.2 * dt;
      this.z -= Math.cos(heading) * 2.2 * dt;
      this.phase += dt * 7;
    } else { // strafe
      this.x += Math.cos(heading) * this.strafeDir * 1.7 * dt;
      this.z -= Math.sin(heading) * this.strafeDir * 1.7 * dt;
      this.phase += dt * 6;
      if (Math.random() < dt * 0.4) this.strafeDir *= -1;
    }
    const probe = { x: this.x, z: this.z };
    if (world.city) world.city.collide(probe, 0.55);
    this.x = probe.x; this.z = probe.z;
    this.mesh.position.set(this.x, Math.abs(Math.sin(this.phase)) * 0.05, this.z);
    animateHumanoid(this.mesh, this.phase, 0.5);
    this.barBg.position.set(this.x, 2.5, this.z);
    this.barFg.position.set(this.x, 2.5, this.z);
    const ratio = clamp(this.health / this.maxHealth, 0, 1);
    this.barFg.scale.x = 1.44 * ratio;
    this.shootTimer -= dt;
    if (this.shootTimer <= 0 && d < 30 && !world.playerCar) {
      this.shootTimer = 1.1 + Math.random() * 1.3;
      world.combat.enemyShoot(this, world);
    } else if (this.shootTimer <= 0 && d < 34 && world.playerCar) {
      this.shootTimer = 1.4 + Math.random() * 1.2;
      world.combat.enemyShootCar(this, world);
    }
  }

  remove() {
    this.scene.remove(this.mesh);
    this.scene.remove(this.barBg); this.scene.remove(this.barFg);
  }
}

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.ammo = 24;
    this.tracers = [];
    this.pickups = [];
    this.flash = null;
    this.dot = dotTexture();
  }

  dropAmmo(x, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.55),
      new THREE.MeshBasicMaterial({ color: 0xffe440 }));
    m.position.set(x, 0.5, z);
    this.scene.add(m);
    this.pickups.push({ mesh: m, x, z, spin: Math.random() * 6 });
  }

  spawnPickupRing() {
    const spots = [[-176, 88], [-44, -44], [44, 44], [132, -88], [176, 176], [-88, 176], [0, 228], [88, -176]];
    for (const [x, z] of spots) this.dropAmmo(x, z);
  }

  // Player fires toward (tx,tz) from the player position. Returns hit info.
  shoot(world, tx, tz) {
    if (this.ammo <= 0) return false;
    this.ammo--;
    const px = world.player.x, pz = world.player.z;
    const from = new THREE.Vector3(px, 1.45, pz);
    let best = null, bestD = 46;
    for (const e of world.enemies) {
      if (e.dead) continue;
      const d = dist2d(px, pz, e.x, e.z);
      if (d > bestD) continue;
      // generous aim cone toward the clicked/aimed direction
      const ang = Math.abs(Math.atan2(e.x - px, e.z - pz) - Math.atan2(tx - px, tz - pz));
      const wrapped = Math.min(ang, Math.PI * 2 - ang);
      if (wrapped < 0.16 + 3.2 / Math.max(6, d)) { best = e; bestD = d; }
    }
    let end;
    if (best) {
      best.hurt(34, world);
      end = new THREE.Vector3(best.x, 1.2, best.z);
      if (world.audio) world.audio.punch();
    } else {
      const dir = new THREE.Vector3(tx - px, 0, tz - pz).normalize();
      end = from.clone().add(dir.multiplyScalar(40)); end.y = 1.1;
    }
    this.tracer(from, end, 0xfff2a0);
    this.muzzle(world);
    if (world.audio) world.audio.shot();
    world.onGunshot(px, pz);
    return true;
  }

  melee(world) {
    world.player.punch();
    if (world.audio) world.audio.punch();
    let hit = false;
    for (const e of world.enemies) {
      if (!e.dead && dist2d(world.player.x, world.player.z, e.x, e.z) < 2.3) {
        e.hurt(26, world); hit = true;
      }
    }
    for (const car of world.traffic.allCars()) {
      if (dist2d(world.player.x, world.player.z, car.x, car.z) < 3) { car.damage(4); hit = true; }
    }
    return hit;
  }

  enemyShoot(enemy, world) {
    const from = new THREE.Vector3(enemy.x, 1.45, enemy.z);
    const to = new THREE.Vector3(world.player.x, 1.2, world.player.z);
    this.tracer(from, to, 0xff8866);
    if (world.audio) world.audio.shot();
    const d = dist2d(enemy.x, enemy.z, world.player.x, world.player.z);
    const chance = clamp(0.62 - d * 0.012, 0.18, 0.6);
    if (Math.random() < chance) world.damagePlayer(7 + Math.random() * 6);
    world.peds.scare(world.player.x, world.player.z, 13);
  }

  enemyShootCar(enemy, world) {
    if (!world.playerCar) return;
    const from = new THREE.Vector3(enemy.x, 1.45, enemy.z);
    const to = new THREE.Vector3(world.playerCar.x, 1, world.playerCar.z);
    this.tracer(from, to, 0xff8866);
    if (world.audio) world.audio.shot();
    if (Math.random() < 0.45) {
      world.playerCar.damage(3.5);
      if (Math.random() < 0.5) world.damagePlayer(2.5);
    }
  }

  tracer(from, to, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  muzzle(world) {
    if (this.flash) this.scene.remove(this.flash);
    const mat = new THREE.SpriteMaterial({ map: this.dot, color: 0xffcc33, transparent: true, opacity: 0.95, depthWrite: false });
    const s = new THREE.Sprite(mat);
    const fx = Math.sin(world.player.heading), fz = Math.cos(world.player.heading);
    s.position.set(world.player.x + fx * 0.7, 1.45, world.player.z + fz * 0.7);
    s.scale.set(0.85, 0.85, 1);
    this.scene.add(s);
    this.flash = s;
    this.flashLife = 0.05;
  }

  update(dt, world) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) { this.scene.remove(t.line); this.tracers.splice(i, 1); }
    }
    if (this.flash) {
      this.flashLife -= dt;
      if (this.flashLife <= 0) { this.scene.remove(this.flash); this.flash = null; }
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.spin += dt * 3;
      p.mesh.rotation.y = p.spin;
      p.mesh.position.y = 0.5 + Math.sin(p.spin * 2) * 0.12;
      if (!world.playerCar && dist2d(world.player.x, world.player.z, p.x, p.z) < 1.7) {
        this.ammo += 12;
        if (world.audio) world.audio.pickup();
        if (world.hud) world.hud.toast('+12 pistol ammo');
        this.scene.remove(p.mesh);
        this.pickups.splice(i, 1);
      }
    }
  }
}
