// HEATWAVE CITY — combat: the player's punch and pistol (hitscan with tracers and
// muzzle flash), plus rival gang members who shoot back and wear health bars.

import { PLAYER, clamp, dist2d, angleDiff } from './config.js';
import { buildPersonMesh, animatePerson } from './pedestrians.js';
import { makeGlowTexture } from './textures.js';

const ENEMY_HP = 100;

export class Combat {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.enemies = [];
    this.tracers = [];
    this.flashTex = makeGlowTexture('rgba(255,220,130,1)', 'rgba(255,140,40,0)');
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, transparent: true, opacity: 0, depthWrite: false }));
    this.flash.scale.set(1.4, 1.4, 1);
    scene.add(this.flash);
    this.flashT = 0;
  }

  spawnEnemy(x, z) {
    const mesh = buildPersonMesh(this.rng, { shirt: 0x22252b, pants: 0x17181c, skin: 0x8a5a3b });
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    // health bar sprite
    const c = document.createElement('canvas'); c.width = 64; c.height = 10;
    const bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false }));
    bar.scale.set(1.7, 0.27, 1);
    bar.position.y = 2.05;
    mesh.add(bar);
    const e = { mesh, health: ENEMY_HP, shootCd: 1 + this.rng() * 1.4, strafeDir: this.rng() < 0.5 ? 1 : -1, strafeT: 2, bar, barCanvas: c, dead: false };
    this.drawBar(e);
    this.enemies.push(e);
    return e;
  }

  drawBar(e) {
    const g = e.barCanvas.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(0, 0, 64, 10);
    g.fillStyle = e.health > 40 ? '#7dff8a' : '#ff5147';
    g.fillRect(1, 1, 62 * clamp(e.health / ENEMY_HP, 0, 1), 8);
    e.bar.material.map.needsUpdate = true;
  }

  clearEnemies() {
    for (const e of this.enemies) this.scene.remove(e.mesh);
    this.enemies = [];
  }

  aliveCount() { return this.enemies.filter((e) => !e.dead).length; }

  damageEnemy(e, dmg, hooks) {
    if (e.dead) return;
    e.health -= dmg;
    this.drawBar(e);
    if (e.health <= 0) {
      e.dead = true;
      e.mesh.rotation.x = -Math.PI / 2;
      e.mesh.position.y = 0.12;
      e.bar.visible = false;
      if (hooks && hooks.onEnemyDown) hooks.onEnemyDown(e);
    }
  }

  // Punch: hits the closest enemy (or reports a car/ped in range) in front of the player.
  playerPunch(playerPos, heading, hooks) {
    let best = null, bd = PLAYER.punchRange;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = dist2d(playerPos.x, playerPos.z, e.mesh.position.x, e.mesh.position.z);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) {
      this.damageEnemy(best, PLAYER.punchDamage, hooks);
      // knockback
      best.mesh.position.x += Math.sin(heading) * 0.7;
      best.mesh.position.z += Math.cos(heading) * 0.7;
      return 'enemy';
    }
    return null;
  }

  // Pistol hitscan along the camera's aim. aimDir: {x,z} unit vector on the ground plane.
  playerShoot(playerPos, aimDir, hooks) {
    const origin = { x: playerPos.x + aimDir.x * 0.5, z: playerPos.z + aimDir.z * 0.5 };
    let best = null, bestAlong = 65;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.mesh.position.x - origin.x, dz = e.mesh.position.z - origin.z;
      const along = dx * aimDir.x + dz * aimDir.z;
      if (along < 0 || along > bestAlong) continue;
      const side = Math.abs(dx * aimDir.z - dz * aimDir.x);
      if (side < 0.85) { best = e; bestAlong = along; }
    }
    const end = best
      ? { x: best.mesh.position.x, z: best.mesh.position.z }
      : { x: origin.x + aimDir.x * 55, z: origin.z + aimDir.z * 55 };
    this.spawnTracer(origin, end, 0xffd98a);
    this.flash.position.set(origin.x, 1.42, origin.z);
    this.flash.material.opacity = 0.95;
    this.flashT = 0.05;
    if (best) this.damageEnemy(best, 34, hooks);
    return best;
  }

  spawnTracer(a, b, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(a.x, 1.42, a.z), new THREE.Vector3(b.x, 1.35, b.z),
    ]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.07 });
  }

  // Enemy behaviour: keep 10–18 m from the player, strafe, fire in bursts.
  update(dt, ctx) {
    // ctx: { playerPos, playerInCar, onPlayerHit(dmg), world }
    for (const e of this.enemies) {
      if (e.dead) continue;
      const p = e.mesh.position;
      const d = dist2d(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z);
      e.mesh.rotation.y = Math.atan2(ctx.playerPos.x - p.x, ctx.playerPos.z - p.z);
      let speed = 0;
      if (d < 42) {
        // range keeping + strafe
        let mx = 0, mz = 0;
        const away = Math.atan2(p.x - ctx.playerPos.x, p.z - ctx.playerPos.z);
        if (d > 19) { mx = -Math.sin(away); mz = -Math.cos(away); speed = 3.4; }
        else if (d < 9) { mx = Math.sin(away); mz = Math.cos(away); speed = 3; }
        e.strafeT -= dt;
        if (e.strafeT <= 0) { e.strafeDir *= -1; e.strafeT = 1.4 + this.rng() * 1.6; }
        mx += Math.cos(away) * e.strafeDir * 0.7; mz += -Math.sin(away) * e.strafeDir * 0.7;
        const l = Math.hypot(mx, mz) || 1;
        p.x += (mx / l) * speed * dt;
        p.z += (mz / l) * speed * dt;
        animatePerson(e.mesh, dt, speed);
        // shooting
        e.shootCd -= dt;
        if (e.shootCd <= 0 && d < 36) {
          e.shootCd = 1.05 + this.rng() * 1.1;
          const hitChance = clamp(0.62 - d * 0.011, 0.16, 0.6);
          this.spawnTracer({ x: p.x, z: p.z }, { x: ctx.playerPos.x, z: ctx.playerPos.z }, 0xff7a5e);
          if (this.rng() < hitChance) ctx.onPlayerHit(5 + this.rng() * 6);
          if (ctx.onEnemyShot) ctx.onEnemyShot(p);
        }
      }
    }
    // tracers + muzzle flash decay
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
      if (t.life <= 0) { this.scene.remove(t.line); this.tracers.splice(i, 1); }
    }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.material.opacity = 0; }
  }
}
