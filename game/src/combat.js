// combat.js — fists and firearms. Four weapons on a wheel: fists, a
// pistol, a full-auto SMG and a seven-pellet shotgun, each with its own
// ammo pool, spread, tracer colour and sound. Enemies are blocky
// gunmen who keep their distance, fire in bursts and drop pickups.
// Also owns the shared effects: tracers, muzzle flash, impact puffs
// and explosions.

import { buildHumanoid, animateHumanoid } from './player.js';
import { SKIN_TONES, clamp, dist2d } from './config.js';
import { dotTexture } from './textures.js';

export const WEAPONS = {
  fist:    { name: 'Fists',   rate: 0.38, auto: false, damage: 30, range: 2.5, spread: 0, pellets: 0, melee: true },
  pistol:  { name: 'Pistol',  rate: 0.3,  auto: false, damage: 34, range: 64, spread: 0.012, pellets: 1, ammoKey: 'pistol' },
  smg:     { name: 'SMG',     rate: 0.095, auto: true, damage: 15, range: 56, spread: 0.05, pellets: 1, ammoKey: 'smg' },
  shotgun: { name: 'Shotgun', rate: 0.9,  auto: false, damage: 11, range: 34, spread: 0.13, pellets: 7, ammoKey: 'shotgun' },
};
export const WEAPON_ORDER = ['fist', 'pistol', 'smg', 'shotgun'];

export class Enemy {
  constructor(scene, x, z, tough = 1) {
    this.mesh = buildHumanoid(0x772e25, 0x1d1d24, SKIN_TONES[3], { capColor: 0x222222 });
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.scene = scene;
    this.x = x; this.z = z;
    this.health = 65 * tough;
    this.maxHealth = this.health;
    this.burstLeft = 0;
    this.shootTimer = 1 + Math.random() * 1.6;
    this.burstTimer = 0;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.phase = Math.random() * 6;
    this.dead = false;
    this.flashTimer = 0;
    const barBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x330000, depthTest: false }));
    barBg.scale.set(1.5, 0.18, 1); barBg.position.set(x, 2.55, z);
    const barFg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff4455, depthTest: false }));
    barFg.scale.set(1.44, 0.12, 1); barFg.position.set(x, 2.55, z);
    scene.add(barBg); scene.add(barFg);
    this.barBg = barBg; this.barFg = barFg;
  }

  hurt(amount, world) {
    if (this.dead) return;
    this.health -= amount;
    this.flashTimer = 0.08;
    if (this.health <= 0) {
      this.dead = true;
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.3;
      this.scene.remove(this.barBg); this.scene.remove(this.barFg);
      if (world) world.onEnemyDown(this);
    }
  }

  update(dt, world) {
    if (this.dead) return;
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      this.mesh.children[0].material.emissive.setHex(this.flashTimer > 0 ? 0x661111 : 0x000000);
    }
    const px = world.player.x, pz = world.player.z;
    const d = dist2d(this.x, this.z, px, pz);
    const heading = Math.atan2(px - this.x, pz - this.z);
    this.mesh.rotation.y = heading;
    let moving = false;
    if (d > 17) {
      this.x += Math.sin(heading) * 3.8 * dt;
      this.z += Math.cos(heading) * 3.8 * dt;
      moving = true;
    } else if (d < 8) {
      this.x -= Math.sin(heading) * 2.4 * dt;
      this.z -= Math.cos(heading) * 2.4 * dt;
      moving = true;
    } else {
      this.x += Math.cos(heading) * this.strafeDir * 1.8 * dt;
      this.z -= Math.sin(heading) * this.strafeDir * 1.8 * dt;
      if (Math.random() < dt * 0.4) this.strafeDir *= -1;
    }
    if (moving) this.phase += dt * 9;
    const probe = { x: this.x, z: this.z };
    if (world.city) world.city.collide(probe, 0.55);
    this.x = probe.x; this.z = probe.z;
    this.mesh.position.set(this.x, Math.abs(Math.sin(this.phase)) * 0.05, this.z);
    animateHumanoid(this.mesh, this.phase, moving ? 0.5 : 0.15);
    this.barBg.position.set(this.x, 2.55, this.z);
    this.barFg.position.set(this.x, 2.55, this.z);
    this.barFg.scale.x = 1.44 * clamp(this.health / this.maxHealth, 0, 1);

    // burst fire: three rounds, a breath, three more
    this.shootTimer -= dt;
    this.burstTimer -= dt;
    const inRange = world.playerCar ? d < 36 : d < 32;
    if (this.burstLeft > 0 && this.burstTimer <= 0 && inRange) {
      this.burstLeft--;
      this.burstTimer = 0.13;
      if (world.playerCar) world.combat.enemyShootCar(this, world);
      else world.combat.enemyShoot(this, world);
    } else if (this.shootTimer <= 0 && inRange) {
      this.shootTimer = 1.2 + Math.random() * 1.4;
      this.burstLeft = 3;
      this.burstTimer = 0;
    }
  }

  remove() {
    this.scene.remove(this.mesh);
    this.scene.remove(this.barBg); this.scene.remove(this.barFg);
  }
}

const PICKUP_STYLE = {
  pistol: { color: 0xffe440, label: 'pistol ammo' },
  smg: { color: 0x4cc9f0, label: 'SMG ammo' },
  shotgun: { color: 0xff5964, label: 'shells' },
  health: { color: 0x06d6a0, label: 'first aid' },
  armor: { color: 0x9b5de5, label: 'body armor' },
};

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.current = 'pistol';
    this.unlocked = { fist: true, pistol: true, smg: false, shotgun: false };
    this.ammo = { pistol: 40, smg: 0, shotgun: 0 };
    this.cool = 0;
    this.latched = false;
    this.tracers = [];
    this.puffs = [];
    this.pickups = [];
    this.flash = null;
    this.flashLife = 0;
    this.dot = dotTexture();
  }

  unlock(key) {
    this.unlocked[key] = true;
    if (key === 'smg') this.ammo.smg += 60;
    if (key === 'shotgun') this.ammo.shotgun += 14;
  }

  cycle(dir) {
    let i = WEAPON_ORDER.indexOf(this.current);
    for (let n = 0; n < WEAPON_ORDER.length; n++) {
      i = (i + dir + WEAPON_ORDER.length) % WEAPON_ORDER.length;
      if (this.unlocked[WEAPON_ORDER[i]]) { this.current = WEAPON_ORDER[i]; break; }
    }
    this.latched = false;
    return this.current;
  }

  select(key) {
    if (this.unlocked[key]) { this.current = key; this.latched = false; return true; }
    return false;
  }

  ammoText() {
    const w = WEAPONS[this.current];
    if (w.melee) return '—';
    return String(this.ammo[w.ammoKey]);
  }

  dropPickup(kind, x, z, amount) {
    const style = PICKUP_STYLE[kind];
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.55),
      new THREE.MeshBasicMaterial({ color: style.color }));
    m.position.set(x, 0.5, z);
    this.scene.add(m);
    this.pickups.push({ mesh: m, x, z, kind, amount, spin: Math.random() * 6 });
  }

  dropAmmo(x, z) { this.dropPickup('pistol', x, z, 12); }

  spawnPickupRing() {
    const spots = [
      ['pistol', -207, 88], ['pistol', -44, -44], ['smg', 44, 44], ['shotgun', 132, -88],
      ['health', 176, 176], ['pistol', -88, 176], ['health', 0, 250], ['smg', 88, -176],
      ['armor', -160, -160], ['shotgun', 200, 40], ['health', -30, 470], ['pistol', 60, 300],
    ];
    for (const [kind, x, z] of spots) {
      const amt = kind === 'health' || kind === 'armor' ? 50 : (kind === 'smg' ? 40 : kind === 'shotgun' ? 8 : 14);
      this.dropPickup(kind, x, z, amt);
    }
  }

  puff(x, y, z, color, scale, life, vy = 1.6) {
    const mat = new THREE.SpriteMaterial({ map: this.dot, color, transparent: true, opacity: 0.7, depthWrite: false });
    const s = new THREE.Sprite(mat);
    s.position.set(x, y, z);
    s.scale.set(scale, scale, 1);
    this.scene.add(s);
    this.puffs.push({ s, life, maxLife: life, vy, grow: 1.6 });
  }

  explosion(x, z, world) {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 2.4;
      this.puff(x + Math.cos(a) * r, 0.8 + Math.random() * 1.6, z + Math.sin(a) * r,
        i < 5 ? 0xff8c33 : 0x444444, 1.6 + Math.random() * 1.6, 0.7 + Math.random() * 0.5, 2.4);
    }
    this.puff(x, 1.4, z, 0xffe9a3, 5.5, 0.28, 0.6);
    if (world.audio) world.audio.explosion();
    if (world.shake !== undefined) world.shake = Math.max(world.shake, 0.4);
    for (const e of world.enemies) {
      if (!e.dead && dist2d(x, z, e.x, e.z) < 6) e.hurt(70, world);
    }
    for (const car of world.traffic.allCars()) {
      if (dist2d(x, z, car.x, car.z) < 6.5) car.damage(55);
    }
    if (dist2d(x, z, world.player.x, world.player.z) < 5.5 && !world.playerCar) world.damagePlayer(26);
    if (world.playerCar && dist2d(x, z, world.playerCar.x, world.playerCar.z) < 6) {
      world.playerCar.damage(30);
      world.damagePlayer(10);
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
    s.position.set(world.player.x + fx * 0.75, 1.45, world.player.z + fz * 0.75);
    s.scale.set(0.9, 0.9, 1);
    this.scene.add(s);
    this.flash = s;
    this.flashLife = 0.05;
  }

  // Called every frame the fire input is held. tx/tz: aim point.
  trigger(world, tx, tz) {
    if (this.cool > 0) return;
    const w = WEAPONS[this.current];
    if (!w.auto && this.latched) return;
    this.latched = true;
    this.cool = w.rate;
    if (w.melee) { this.melee(world); return; }
    if (this.ammo[w.ammoKey] <= 0) {
      if (world.hud) world.hud.toast('Out of ' + w.name + ' ammo — Q to switch');
      this.cool = 0.4;
      return;
    }
    this.ammo[w.ammoKey]--;
    this.shoot(world, tx, tz, w);
  }

  releaseTrigger() { this.latched = false; }

  shoot(world, tx, tz, w) {
    const px = world.player.x, pz = world.player.z;
    const from = new THREE.Vector3(px, 1.45, pz);
    const baseAng = Math.atan2(tx - px, tz - pz);
    for (let p = 0; p < w.pellets; p++) {
      const ang = baseAng + (Math.random() - 0.5) * 2 * w.spread * 8;
      // best enemy inside a generous cone around this pellet's direction
      let best = null, bestD = w.range;
      for (const e of world.enemies) {
        if (e.dead) continue;
        const d = dist2d(px, pz, e.x, e.z);
        if (d > bestD) continue;
        const ea = Math.atan2(e.x - px, e.z - pz);
        let wrapped = Math.abs(ea - ang) % (Math.PI * 2);
        if (wrapped > Math.PI) wrapped = Math.PI * 2 - wrapped;
        if (wrapped < 0.1 + 3.4 / Math.max(6, d)) { best = e; bestD = d; }
      }
      // vehicles can be shot too
      let bestCar = null, bestCarD = w.range;
      for (const car of world.targetCars()) {
        if (car.dead) continue;
        const d = dist2d(px, pz, car.x, car.z);
        if (d > bestCarD) continue;
        const ea = Math.atan2(car.x - px, car.z - pz);
        let wrapped = Math.abs(ea - ang) % (Math.PI * 2);
        if (wrapped > Math.PI) wrapped = Math.PI * 2 - wrapped;
        if (wrapped < 0.12 + 4 / Math.max(6, d)) { bestCar = car; bestCarD = d; }
      }
      let end;
      if (best && bestD <= bestCarD) {
        best.hurt(w.damage, world);
        end = new THREE.Vector3(best.x, 1.2, best.z);
        this.puff(best.x, 1.2, best.z, 0xff6655, 0.5, 0.25, 0.8);
      } else if (bestCar) {
        const wasDead = bestCar.dead;
        bestCar.damage(w.damage * 0.8);
        end = new THREE.Vector3(bestCar.x, 0.9, bestCar.z);
        this.puff(bestCar.x, 1, bestCar.z, 0xffcc66, 0.5, 0.22, 0.8);
        if (!wasDead && bestCar.dead && world.onCarDestroyed) world.onCarDestroyed(bestCar);
      } else {
        const dir = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
        end = from.clone().add(dir.multiplyScalar(w.range * 0.8));
        end.y = 1.05;
      }
      this.tracer(from, end, this.current === 'shotgun' ? 0xffb37a : 0xfff2a0);
    }
    this.muzzle(world);
    if (world.audio) world.audio.shot(this.current);
    world.onGunshot(px, pz);
  }

  melee(world) {
    world.player.punch();
    if (world.audio) world.audio.punch();
    const fx = Math.sin(world.player.heading), fz = Math.cos(world.player.heading);
    for (const e of world.enemies) {
      if (!e.dead && dist2d(world.player.x, world.player.z, e.x, e.z) < 2.4) e.hurt(30, world);
    }
    for (const car of world.targetCars()) {
      if (dist2d(world.player.x, world.player.z, car.x, car.z) < 3.2) car.damage(5);
    }
    world.peds.scare(world.player.x + fx, world.player.z + fz, 7);
  }

  enemyShoot(enemy, world) {
    const from = new THREE.Vector3(enemy.x, 1.45, enemy.z);
    const to = new THREE.Vector3(world.player.x, 1.2, world.player.z);
    this.tracer(from, to, 0xff8866);
    if (world.audio && dist2d(enemy.x, enemy.z, world.player.x, world.player.z) < 42) world.audio.enemyShot();
    const d = dist2d(enemy.x, enemy.z, world.player.x, world.player.z);
    const chance = clamp(0.6 - d * 0.011, 0.16, 0.58);
    if (Math.random() < chance) world.damagePlayer(6 + Math.random() * 6);
    world.peds.scare(world.player.x, world.player.z, 12);
  }

  enemyShootCar(enemy, world) {
    if (!world.playerCar) return;
    const from = new THREE.Vector3(enemy.x, 1.45, enemy.z);
    const to = new THREE.Vector3(world.playerCar.x, 1, world.playerCar.z);
    this.tracer(from, to, 0xff8866);
    if (world.audio) world.audio.enemyShot();
    if (Math.random() < 0.45) {
      world.playerCar.damage(3.2);
      if (Math.random() < 0.5) world.damagePlayer(2.2);
    }
  }

  update(dt, world) {
    this.cool = Math.max(0, this.cool - dt);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) { this.scene.remove(t.line); this.tracers.splice(i, 1); }
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life -= dt;
      p.s.position.y += p.vy * dt;
      p.s.scale.multiplyScalar(1 + dt * p.grow);
      p.s.material.opacity = Math.max(0, (p.life / p.maxLife) * 0.7);
      if (p.life <= 0) { this.scene.remove(p.s); this.puffs.splice(i, 1); }
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
      if (!world.playerCar && !world.playerHeli && dist2d(world.player.x, world.player.z, p.x, p.z) < 1.8) {
        if (p.kind === 'health') { world.player.heal(p.amount); world.hud.toast('+ first aid — health up'); }
        else if (p.kind === 'armor') { world.player.armor = Math.min(100, world.player.armor + p.amount); world.hud.toast('+ body armor'); }
        else {
          this.ammo[p.kind] += p.amount;
          world.hud.toast('+' + p.amount + ' ' + PICKUP_STYLE[p.kind].label);
        }
        if (world.audio) world.audio.pickup();
        world.hud.setWeapon(this);
        this.scene.remove(p.mesh);
        this.pickups.splice(i, 1);
      }
    }
  }
}
