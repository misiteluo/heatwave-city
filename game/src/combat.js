// combat.js — fists and firearms. Five weapons on a wheel: fists, a
// pistol, a full-auto SMG, a seven-pellet shotgun and a carbine, each
// with its own ammo pool, spread, tracer colour and sound. Enemies are
// blocky gunmen who strafe, fall back to cover when hurt, fire in
// bursts and drop pickups. Also owns the shared effects: tracers,
// muzzle flash, impact puffs, hit sparks and explosions.

import { buildHumanoid, animateHumanoid } from './player.js';
import { SKIN_TONES, clamp, dist2d } from './config.js';
import { dotTexture } from './textures.js';

export const WEAPONS = {
  fist:    { name: 'Fists',   rate: 0.36, auto: false, damage: 34, range: 2.6, spread: 0, pellets: 0, melee: true },
  pistol:  { name: 'Pistol',  rate: 0.27, auto: false, damage: 34, range: 72, spread: 0.012, pellets: 1, ammoKey: 'pistol' },
  smg:     { name: 'SMG',     rate: 0.085, auto: true, damage: 15, range: 58, spread: 0.038, pellets: 1, ammoKey: 'smg' },
  shotgun: { name: 'Shotgun', rate: 0.85, auto: false, damage: 11, range: 34, spread: 0.085, pellets: 7, ammoKey: 'shotgun' },
  carbine: { name: 'Carbine', rate: 0.15, auto: true, damage: 26, range: 88, spread: 0.02, pellets: 1, ammoKey: 'carbine' },
};
export const WEAPON_ORDER = ['fist', 'pistol', 'smg', 'shotgun', 'carbine'];

let dotTex = null;
function getDot() { if (!dotTex) dotTex = dotTexture(); return dotTex; }

export class Enemy {
  constructor(scene, x, z, tough = 1, opts = {}) {
    this.x = x; this.z = z;
    this.heading = Math.random() * Math.PI * 2;
    this.maxHealth = 62 * tough;
    this.health = this.maxHealth;
    this.tough = tough;
    this.dead = false;
    this.active = opts.active !== false; // mission gunmen start hot; ambient ones wait
    this.phase = Math.random() * 6;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 1 + Math.random() * 2;
    this.burstLeft = 0; this.burstCd = 0.6 + Math.random();
    this.coverT = 0; this.coverPos = null;
    this.fallT = 0;
    this.mesh = buildHumanoid(opts.shirt || 0x40222e, 0x1e2126, SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)],
      { capColor: 0x14161a, jacket: opts.jacket || 0x8c2f39 });
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.scene = scene;
    // health bar: two thin sprites riding above the head
    const mkBar = (color) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ color, depthTest: false, transparent: true, opacity: 0.92 }));
      s.scale.set(1.3, 0.14, 1); s.position.y = 2.45;
      this.mesh.add(s); return s;
    };
    this.barBg = mkBar(0x3a0d12);
    this.barFg = mkBar(0x7bf1a8);
  }

  hurt(amount, world) {
    if (this.dead) return;
    this.health -= amount;
    this.active = true;
    this.mesh.traverse((o) => { if (o.isMesh && o.material && o.material.emissive) o.material.emissive.setHex(0x881111); });
    this.flashT = 0.09;
    if (this.health <= 0) {
      this.dead = true;
      this.fallT = 0.0001;
      if (world && world.onEnemyDown) world.onEnemyDown(this);
    } else if (this.health < this.maxHealth * 0.55 && this.coverT <= 0) {
      // hurt gunmen break for the nearest building corner
      this.coverT = 2.6;
      this.coverPos = null;
      if (world) {
        let bd = 1e9, bp = null;
        for (const b of world.city.colliders) {
          const nx = clamp(this.x, b.minX, b.maxX), nz = clamp(this.z, b.minZ, b.maxZ);
          const d = dist2d(this.x, this.z, nx, nz);
          if (d < bd) { bd = d; bp = { x: nx, z: nz, b }; }
        }
        if (bp) {
          const cx = (bp.b.minX + bp.b.maxX) / 2, cz = (bp.b.minZ + bp.b.maxZ) / 2;
          const dx = bp.x - cx, dz = bp.z - cz;
          const m = Math.hypot(dx, dz) || 1;
          this.coverPos = { x: bp.x + (dx / m) * 1.6, z: bp.z + (dz / m) * 1.6 };
        }
      }
    }
  }

  update(dt, world) {
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.mesh.traverse((o) => { if (o.isMesh && o.material && o.material.emissive) o.material.emissive.setHex(0x000000); });
    }
    if (this.dead) {
      if (this.fallT > 0 && this.fallT < 0.45) {
        this.fallT += dt;
        this.mesh.rotation.x = -Math.min(1, this.fallT / 0.45) * Math.PI / 2;
        this.mesh.position.y = world.city.groundY(this.x, this.z) + Math.min(1, this.fallT / 0.45) * 0.3;
      }
      this.barBg.visible = this.barFg.visible = false;
      return;
    }
    const p = world.player;
    const target = world.playerCar || world.playerHeli || p;
    const d = dist2d(this.x, this.z, target.x, target.z);
    if (!this.active && d < 30) this.active = true;
    const ratio = Math.max(0, this.health / this.maxHealth);
    this.barFg.scale.x = 1.3 * ratio;
    this.barFg.position.x = -0.65 * (1 - ratio);
    this.barFg.material.color.setHex(ratio > 0.5 ? 0x7bf1a8 : ratio > 0.25 ? 0xffd23f : 0xff5964);
    if (!this.active) { this.mesh.position.set(this.x, world.city.groundY(this.x, this.z), this.z); return; }
    // face the target
    this.heading = Math.atan2(target.x - this.x, target.z - this.z);
    let mx = 0, mz = 0, speed = 0;
    this.coverT -= dt;
    if (this.coverPos && this.coverT > 0) {
      const dx = this.coverPos.x - this.x, dz = this.coverPos.z - this.z;
      const dd = Math.hypot(dx, dz);
      if (dd > 0.8) { mx = dx / dd; mz = dz / dd; speed = 5.6; }
    } else {
      this.coverPos = null;
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeT = 1.2 + Math.random() * 2; this.strafeDir *= -1; }
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      const sx = fz * this.strafeDir, sz = -fx * this.strafeDir;
      if (d > 17) { mx = fx + sx * 0.4; mz = fz + sz * 0.4; speed = 4.4; }
      else if (d < 8) { mx = -fx + sx * 0.5; mz = -fz + sz * 0.5; speed = 4.6; }
      else { mx = sx; mz = sz; speed = 2.6; }
    }
    if (speed > 0) {
      const m = Math.hypot(mx, mz) || 1;
      const nx = this.x + (mx / m) * speed * dt;
      const nz = this.z + (mz / m) * speed * dt;
      if (world.city.isLand(nx, nz)) { this.x = nx; this.z = nz; }
      const probe = { x: this.x, z: this.z };
      world.city.collide(probe, 0.5);
      this.x = probe.x; this.z = probe.z;
      this.phase += dt * speed * 2;
      animateHumanoid(this.mesh, this.phase, 0.7);
    }
    this.mesh.position.set(this.x, world.city.groundY(this.x, this.z), this.z);
    this.mesh.rotation.y = this.heading;
    // fire in bursts
    this.burstCd -= dt;
    if (this.burstCd <= 0 && d < 46 && world.state === 'playing') {
      if (this.burstLeft <= 0) { this.burstLeft = 3; this.burstCd = 0.85 + Math.random() * 0.8; }
      else {
        this.burstLeft--;
        this.burstCd = 0.13;
        world.combat.enemyShoot(this, world);
      }
    }
  }

  remove() { this.scene.remove(this.mesh); }
}

const PICKUP_STYLE = {
  pistol: { color: 0x9fd8ef, label: 'ammo' },
  smg: { color: 0x4cc9f0, label: 'ammo' },
  shotgun: { color: 0xf15bb5, label: 'ammo' },
  carbine: { color: 0xffd23f, label: 'ammo' },
  health: { color: 0x06d6a0, label: 'health' },
  armor: { color: 0x9b5de5, label: 'armor' },
  cash: { color: 0xffe45e, label: 'cash' },
};

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.current = 'pistol';
    this.ammo = { pistol: 48, smg: 0, shotgun: 0, carbine: 0 };
    this.unlocked = { fist: true, pistol: true, smg: false, shotgun: false, carbine: false };
    this.cool = 0;
    this.latched = false;
    this.pickups = [];
    this.pendingBooms = [];
    // particle pool
    this.parts = [];
    for (let i = 0; i < 110; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getDot(), transparent: true, opacity: 0, depthWrite: false,
      }));
      s.visible = false;
      scene.add(s);
      this.parts.push({ s, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, grow: 0 });
    }
    this.partIdx = 0;
    // tracer pool
    this.tracers = [];
    for (let i = 0; i < 26; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a3, transparent: true, opacity: 0 }));
      line.visible = false; line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    this.tracerIdx = 0;
  }

  unlock(key) {
    this.unlocked[key] = true;
    if (WEAPONS[key] && WEAPONS[key].ammoKey && this.ammo[WEAPONS[key].ammoKey] <= 0) {
      this.ammo[WEAPONS[key].ammoKey] = key === 'shotgun' ? 10 : key === 'carbine' ? 40 : 60;
    }
  }

  cycle(dir) {
    let i = WEAPON_ORDER.indexOf(this.current);
    for (let k = 0; k < WEAPON_ORDER.length; k++) {
      i = (i + dir + WEAPON_ORDER.length) % WEAPON_ORDER.length;
      if (this.unlocked[WEAPON_ORDER[i]]) { this.current = WEAPON_ORDER[i]; return; }
    }
  }

  select(key) {
    if (!this.unlocked[key]) return false;
    this.current = key;
    return true;
  }

  ammoText() {
    const w = WEAPONS[this.current];
    if (w.melee) return '∞';
    return String(this.ammo[w.ammoKey]);
  }

  // ---------------------------------------------------------- pickups
  dropPickup(kind, x, z, amount, opts = {}) {
    const style = PICKUP_STYLE[kind] || PICKUP_STYLE.pistol;
    const grp = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.4, 0.62),
      new THREE.MeshLambertMaterial({ color: style.color, emissive: style.color, emissiveIntensity: 0.35 }));
    box.position.y = 0.55;
    grp.add(box);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getDot(), color: style.color, transparent: true, opacity: 0.55, depthWrite: false,
    }));
    glow.scale.set(2.2, 2.2, 1); glow.position.y = 0.6;
    grp.add(glow);
    grp.position.set(x, 0, z);
    this.scene.add(grp);
    this.pickups.push({
      kind, x, z, amount, mesh: grp, bobT: Math.random() * 6,
      id: opts.id || null, sticky: !!opts.sticky, dead: false,
    });
  }

  spawnPickupRing() {
    const spots = [
      ['health', -207, -115, 50], ['armor', 23, -207, 60], ['pistol', -161, 69, 18],
      ['smg', 115, 161, 40], ['shotgun', -69, -161, 6], ['health', 0, 452, 50],
      ['armor', 330, 486, 60], ['carbine', 207, -69, 30], ['pistol', -23, 253, 18],
      ['health', 184, 207, 50], ['smg', -253, -23, 40],
    ];
    for (const [kind, x, z, amt] of spots) this.dropPickup(kind, x, z, amt);
    this.ringSpots = spots;
    this.ringTimer = 0;
  }

  // ---------------------------------------------------------- effects
  puff(x, y, z, color, scale, life, vy = 1.6, n = 1) {
    for (let i = 0; i < n; i++) {
      const p = this.parts[this.partIdx];
      this.partIdx = (this.partIdx + 1) % this.parts.length;
      p.s.visible = true;
      p.s.position.set(x + (Math.random() - 0.5) * 0.5, y + (Math.random() - 0.5) * 0.4, z + (Math.random() - 0.5) * 0.5);
      p.s.material.color.setHex(color);
      p.s.material.opacity = 0.85;
      const sc = scale * (0.7 + Math.random() * 0.6);
      p.s.scale.set(sc, sc, 1);
      p.vx = (Math.random() - 0.5) * 2.4; p.vz = (Math.random() - 0.5) * 2.4;
      p.vy = vy * (0.6 + Math.random() * 0.8);
      p.life = p.maxLife = life * (0.7 + Math.random() * 0.6);
      p.grow = scale * 1.6;
    }
  }

  tracer(x1, y1, z1, x2, y2, z2, color) {
    const t = this.tracers[this.tracerIdx];
    this.tracerIdx = (this.tracerIdx + 1) % this.tracers.length;
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, x1, y1, z1); pos.setXYZ(1, x2, y2, z2);
    pos.needsUpdate = true;
    t.line.material.color.setHex(color);
    t.line.material.opacity = 0.9;
    t.line.visible = true;
    t.life = 0.07;
  }

  explosion(x, z, world) {
    const gy = world.city.groundY(x, z);
    this.puff(x, gy + 1.2, z, 0xff7b33, 3.4, 0.5, 3.4, 10);
    this.puff(x, gy + 1.6, z, 0xffd23f, 2.4, 0.38, 4.4, 8);
    this.puff(x, gy + 1, z, 0x3a3f46, 3, 1.1, 2.2, 8);
    world.audio.explosion();
    world.shake = Math.max(world.shake || 0, 0.55);
    const R = 9.5;
    const hurt = (tx, tz) => dist2d(x, z, tx, tz);
    if (!world.playerCar && !world.playerHeli && hurt(world.player.x, world.player.z) < R) {
      world.damagePlayer(46 * (1 - hurt(world.player.x, world.player.z) / R) + 8);
    }
    if (world.playerCar && hurt(world.playerCar.x, world.playerCar.z) < R) world.playerCar.damage(38);
    for (const e of world.enemies) {
      if (!e.dead && hurt(e.x, e.z) < R) e.hurt(70 * (1 - hurt(e.x, e.z) / R) + 10, world);
    }
    for (const car of world.targetCars()) {
      if (car === world.playerCar) continue;
      const d = hurt(car.x, car.z);
      if (d < R) {
        const was = car.dead;
        car.damage(85 * (1 - d / R) + 12);
        if (!was && car.dead && !car._exploded) {
          car._exploded = true;
          this.pendingBooms.push({ x: car.x, z: car.z, t: 0.28 });
        }
      }
    }
    world.peds.scare(x, z, 26);
  }

  // ---------------------------------------------------------- firing
  trigger(world, tx, tz) {
    const w = WEAPONS[this.current];
    if (this.cool > 0) return;
    if (!w.auto && this.latched) return;
    if (w.melee) { this.melee(world); this.cool = w.rate; this.latched = true; return; }
    if (this.ammo[w.ammoKey] <= 0) {
      this.cool = 0.25; this.latched = true;
      world.audio.tone(1180, 0.05, 'square', 0.06);
      world.hud.toast('Out of ' + w.name + ' ammo — find a glowing pickup');
      return;
    }
    this.ammo[w.ammoKey]--;
    this.cool = w.rate;
    this.latched = true;
    this.shoot(world, tx, tz, w);
  }

  releaseTrigger() { this.latched = false; }

  shoot(world, tx, tz, w) {
    const p = world.player;
    const gy = world.city.groundY(p.x, p.z);
    const ox = p.x, oz = p.z, oy = gy + 1.45;
    const baseAng = Math.atan2(tx - ox, tz - oz);
    world.audio.shot(this.current);
    this.puff(ox + Math.sin(baseAng) * 0.7, oy + 0.1, oz + Math.cos(baseAng) * 0.7, 0xffd76a, 0.5, 0.09, 0.4, 1);
    if (world.onGunshot) world.onGunshot(ox, oz);
    for (let pellet = 0; pellet < w.pellets; pellet++) {
      const ang = baseAng + (Math.random() - 0.5) * 2 * w.spread * 8;
      const dx = Math.sin(ang), dz = Math.cos(ang);
      // best enemy along the ray
      let bestE = null, bestT = 1e9;
      for (const e of world.enemies) {
        if (e.dead) continue;
        const ex = e.x - ox, ez = e.z - oz;
        const t = ex * dx + ez * dz;
        if (t < 1 || t > w.range) continue;
        const side = Math.abs(ex * dz - ez * dx);
        if (side < 0.85 && t < bestT) { bestT = t; bestE = e; }
      }
      let bestC = null, bestCT = 1e9;
      for (const car of world.targetCars()) {
        if (car.dead || car === world.playerCar) continue;
        const ex = car.x - ox, ez = car.z - oz;
        const t = ex * dx + ez * dz;
        if (t < 1.5 || t > w.range) continue;
        const side = Math.abs(ex * dz - ez * dx);
        if (side < car.spec.radius + 0.4 && t < bestCT) { bestCT = t; bestC = car; }
      }
      if (bestE && bestT <= bestCT) {
        const hx = ox + dx * bestT, hz = oz + dz * bestT;
        this.tracer(ox, oy, oz, hx, gy + 1.2, hz, 0xffe9a3);
        this.puff(hx, gy + 1.2, hz, 0xff5964, 0.55, 0.22, 1.2, 2);
        bestE.hurt(w.damage, world);
      } else if (bestC) {
        const hx = ox + dx * bestCT, hz = oz + dz * bestCT;
        this.tracer(ox, oy, oz, hx, 1, hz, 0xffe9a3);
        this.puff(hx, 1, hz, 0xffc93c, 0.5, 0.18, 1.6, 2);
        const was = bestC.dead;
        bestC.damage(w.damage * 0.7);
        if (!was && bestC.dead && world.onCarDestroyed) world.onCarDestroyed(bestC);
      } else {
        const ex = ox + dx * w.range, ez = oz + dz * w.range;
        this.tracer(ox, oy, oz, ex, oy, ez, 0xffe9a3);
      }
    }
  }

  melee(world) {
    const p = world.player;
    p.punch();
    world.audio.punch();
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    let hit = false;
    for (const e of world.enemies) {
      if (e.dead) continue;
      const d = dist2d(p.x, p.z, e.x, e.z);
      if (d < 2.6 && (e.x - p.x) * fx + (e.z - p.z) * fz > 0) { e.hurt(WEAPONS.fist.damage, world); hit = true; }
    }
    if (!hit) {
      for (const car of world.targetCars()) {
        if (dist2d(p.x, p.z, car.x, car.z) < car.spec.radius + 1.4) { car.damage(6); hit = true; break; }
      }
    }
    if (hit) world.peds.scare(p.x, p.z, 9);
  }

  enemyShoot(enemy, world) {
    const p = world.player;
    const target = world.playerCar || p;
    const gy = world.city.groundY(enemy.x, enemy.z);
    const d = dist2d(enemy.x, enemy.z, target.x, target.z);
    const aimErr = clamp(d / 46, 0.12, 1) * (world.playerCar ? 0.8 : 1);
    const hitRoll = Math.random();
    const tgy = world.city.groundY(target.x, target.z);
    const ex = target.x + (Math.random() - 0.5) * 6 * aimErr;
    const ez = target.z + (Math.random() - 0.5) * 6 * aimErr;
    this.tracer(enemy.x, gy + 1.45, enemy.z, ex, tgy + 1.1, ez, 0xff8fa3);
    world.audio.enemyShot();
    if (hitRoll > aimErr + 0.18) {
      if (world.playerCar) {
        world.playerCar.damage(5.5);
        if (world.playerCar.dead && world.onCarDestroyed) { /* handled by main loop */ }
      } else if (!world.playerHeli) {
        world.damagePlayer(6.5);
      }
    } else {
      this.puff(ex, tgy + 0.6, ez, 0xd8d2c4, 0.4, 0.2, 1, 1);
    }
  }

  // ---------------------------------------------------------- update
  update(dt, world) {
    this.cool = Math.max(0, this.cool - dt);
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      p.s.position.x += p.vx * dt;
      p.s.position.y += p.vy * dt;
      p.s.position.z += p.vz * dt;
      p.vy -= 1.1 * dt;
      const k = p.life / p.maxLife;
      p.s.material.opacity = 0.85 * k;
      const sc = p.s.scale.x + p.grow * dt;
      p.s.scale.set(sc, sc, 1);
    }
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) t.line.visible = false;
      else t.line.material.opacity = 0.9 * (t.life / 0.07);
    }
    // chained explosions
    for (const b of this.pendingBooms) b.t -= dt;
    const ready = this.pendingBooms.filter((b) => b.t <= 0);
    this.pendingBooms = this.pendingBooms.filter((b) => b.t > 0);
    for (const b of ready) this.explosion(b.x, b.z, world);
    // pickups
    const p = world.player;
    for (const pk of this.pickups) {
      if (pk.dead) continue;
      pk.bobT += dt;
      pk.mesh.position.y = world.city.groundY(pk.x, pk.z) + Math.sin(pk.bobT * 2.4) * 0.16;
      pk.mesh.rotation.y = pk.bobT * 1.4;
      if (!world.playerCar && !world.playerHeli && dist2d(p.x, p.z, pk.x, pk.z) < 1.9) {
        pk.dead = true;
        this.scene.remove(pk.mesh);
        world.audio.pickup();
        if (pk.kind === 'health') { p.heal(pk.amount); world.hud.toast('First aid +' + pk.amount); }
        else if (pk.kind === 'armor') { p.addArmor(pk.amount); world.hud.toast('Armor +' + pk.amount); }
        else if (pk.kind === 'cash') {
          world.addCash(pk.amount);
          world.hud.toast('Briefcase: +$' + pk.amount);
          if (pk.id && world.onBriefcase) world.onBriefcase(pk.id);
        } else {
          this.unlock(pk.kind);
          this.ammo[WEAPONS[pk.kind].ammoKey] += pk.amount;
          world.hud.toast(WEAPONS[pk.kind].name + ' ammo +' + pk.amount);
          world.hud.setWeapon(this);
        }
        world.hud.setHealth(p.health);
        world.hud.setArmor(p.armor);
      }
    }
    // respawn the utility ring slowly (not sticky collectibles)
    this.ringTimer = (this.ringTimer || 0) - dt;
    if (this.ringTimer <= 0 && this.ringSpots) {
      this.ringTimer = 20;
      for (const [kind, x, z, amt] of this.ringSpots) {
        const alive = this.pickups.some((pk) => !pk.dead && !pk.sticky && pk.x === x && pk.z === z);
        if (!alive) this.dropPickup(kind, x, z, amt);
      }
    }
  }
}
