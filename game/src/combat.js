// HEATWAVE CITY — combat: fists, a hitscan pistol with tracers and muzzle
// flash, ammo pickups, and gang enemies who keep their distance, shoot back
// in bursts and wear floating health bars.

import { THREE, clamp, rr, rnd, dist2d, yawToward, angleLerp } from './config.js';
import { buildHumanoid, animateHumanoid } from './pedestrians.js';
import { addCrime } from './police.js';

export function initCombat(G) {
  G.weapon = 'fist';
  G.pistol = false;
  G.ammo = { mag: 12, reserve: 48 };
  G.reloading = 0;
  G.enemies = [];
  G.pickups = [];
  G.tracers = [];
  G.hurtT = 0;
}

const barBgGeo = new THREE.BoxGeometry(1.1, 0.13, 0.02);
const barFgGeo = new THREE.BoxGeometry(1.04, 0.09, 0.03);
export function spawnEnemy(G, x, z) {
  const h = buildHumanoid(0x8d0801, 0x1a1a1a, 0xc68863);
  G.scene.add(h.group);
  const bg = new THREE.Mesh(barBgGeo, new THREE.MeshBasicMaterial({ color: 0x14181d }));
  bg.position.y = 2.05; h.group.add(bg);
  const fg = new THREE.Mesh(barFgGeo, new THREE.MeshBasicMaterial({ color: 0x51e05e }));
  fg.position.y = 2.05; h.group.add(fg);
  const e = {
    h, barFg: fg, x, z, yaw: rr(0, 6), hp: 100, phase: rr(0, 6),
    state: 'idle', burstCd: rr(1, 2.4), burstLeft: 0, shotCd: 0, strafe: rnd() < 0.5 ? 1 : -1, dead: false,
  };
  h.group.position.set(x, 0.24, z);
  G.enemies.push(e);
  return e;
}

export function damagePlayer(G, n) {
  if (G.mode === 'menu' || G.over) return;
  G.player.hp -= n;
  G.hurtT = 0.55;
  G.audio.hit();
}

function tracer(G, x0, y0, z0, x1, y1, z1, color = 0xffe08a) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }));
  G.scene.add(line);
  G.tracers.push({ line, life: 0.07 });
}

function segmentBlocked(G, x0, z0, x1, z1) {
  // 2D segment vs building AABBs (slab test per box).
  const dx = x1 - x0, dz = z1 - z0;
  for (const b of G.colliders) {
    let t0 = 0, t1 = 1;
    if (Math.abs(dx) < 1e-9) { if (x0 < b.x0 || x0 > b.x1) continue; }
    else {
      let ta = (b.x0 - x0) / dx, tb = (b.x1 - x0) / dx;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    if (Math.abs(dz) < 1e-9) { if (z0 < b.z0 || z0 > b.z1) continue; }
    else {
      let ta = (b.z0 - z0) / dz, tb = (b.z1 - z0) / dz;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    if (t1 > 0.02 && t0 < 0.98) return true;
  }
  return false;
}

export function playerAttack(G) {
  const p = G.player;
  if (G.mode !== 'foot' || p.attackCd > 0) return;
  if (G.weapon === 'pistol' && G.pistol) {
    if (G.reloading > 0) return;
    if (G.ammo.mag <= 0) { G.hud.toast('Empty — R to reload'); p.attackCd = 0.25; return; }
    p.attackCd = 0.17;
    G.ammo.mag--;
    G.audio.shoot();
    addCrime(G, 55, p.x, p.z);
    // Hitscan along the camera's forward.
    const dir = new THREE.Vector3();
    G.camera.getWorldDirection(dir);
    const ox = G.camera.position.x, oy = G.camera.position.y, oz = G.camera.position.z;
    let bestT = 70, hitEnemy = null;
    for (const e of G.enemies) {
      if (e.dead) continue;
      // distance from the ray to the enemy's chest point
      const ex = e.x - ox, ey = 1.25 - oy, ez = e.z - oz;
      const t = ex * dir.x + ey * dir.y + ez * dir.z;
      if (t < 1 || t > 70) continue;
      const px = ox + dir.x * t - e.x, py = oy + dir.y * t - 1.25, pz = oz + dir.z * t - e.z;
      if (px * px + py * py + pz * pz < 0.55 && t < bestT) { bestT = t; hitEnemy = e; }
    }
    let endT = bestT;
    if (!hitEnemy) { // stop the tracer at the first building face (rough: full range unless blocked in 2D)
      endT = segmentBlocked(G, ox, oz, ox + dir.x * 70, oz + dir.z * 70) ? 26 : 70;
    }
    tracer(G, p.x + Math.sin(p.yaw) * 0.4, 1.35, p.z + Math.cos(p.yaw) * 0.4, ox + dir.x * endT, oy + dir.y * endT, oz + dir.z * endT);
    if (hitEnemy) damageEnemy(G, hitEnemy, 34);
    if (G.ammo.mag === 0 && G.ammo.reserve > 0) startReload(G);
  } else {
    p.attackCd = 0.34;
    G.audio.punch();
    p.h.armR.rotation.x = -1.9;
    const fx = p.x + Math.sin(p.yaw) * 1.6, fz = p.z + Math.cos(p.yaw) * 1.6;
    for (const e of G.enemies) if (!e.dead && dist2d(fx, fz, e.x, e.z) < 1.5) damageEnemy(G, e, 30);
    for (const ped of G.peds) {
      if (ped.state !== 'down' && dist2d(fx, fz, ped.x, ped.z) < 1.4) {
        ped.state = 'down'; ped.downT = 6;
        addCrime(G, 90, p.x, p.z);
        G.events.push({ type: 'pedHit', ped, byPlayer: true });
      }
    }
  }
}

export function startReload(G) {
  if (G.reloading > 0 || G.ammo.reserve <= 0 || G.ammo.mag >= 12) return;
  G.reloading = 1.05;
  G.hud.toast('Reloading…');
}

export function damageEnemy(G, e, n) {
  if (e.dead) return;
  e.hp -= n;
  e.state = 'combat';
  G.audio.hit();
  e.barFg.scale.x = clamp(e.hp / 100, 0, 1);
  e.barFg.material.color.setHSL(clamp(e.hp / 100, 0, 1) * 0.33, 0.85, 0.5);
  if (e.hp <= 0) {
    e.dead = true; e.state = 'down';
    e.h.group.rotation.x = -Math.PI / 2;
    e.h.group.position.y = 0.3;
    G.events.push({ type: 'enemyDown', enemy: e });
    if (rnd() < 0.6) dropAmmo(G, e.x, e.z);
  }
}

const pickupGeo = new THREE.BoxGeometry(0.5, 0.22, 0.34);
const pickupMat = new THREE.MeshLambertMaterial({ color: 0xd9a441 });
function dropAmmo(G, x, z) {
  const m = new THREE.Mesh(pickupGeo, pickupMat);
  m.position.set(x, 0.35, z); G.scene.add(m);
  G.pickups.push({ mesh: m, x, z });
}

export function updateCombat(G, dt) {
  const p = G.player;
  p.attackCd = Math.max(0, p.attackCd - dt);
  G.hurtT = Math.max(0, G.hurtT - dt);
  if (G.reloading > 0) {
    G.reloading -= dt;
    if (G.reloading <= 0) {
      const take = Math.min(12 - G.ammo.mag, G.ammo.reserve);
      G.ammo.mag += take; G.ammo.reserve -= take;
    }
  }
  // Tracers fade.
  for (let i = G.tracers.length - 1; i >= 0; i--) {
    const t = G.tracers[i];
    t.life -= dt;
    if (t.life <= 0) { G.scene.remove(t.line); t.line.geometry.dispose(); G.tracers.splice(i, 1); }
  }
  // Pickups.
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const pk = G.pickups[i];
    pk.mesh.rotation.y += dt * 2.4;
    if (G.mode === 'foot' && dist2d(p.x, p.z, pk.x, pk.z) < 1.5) {
      G.ammo.reserve += 24; G.audio.pickup(); G.hud.toast('+24 pistol ammo');
      G.scene.remove(pk.mesh); G.pickups.splice(i, 1);
    }
  }
  // Enemies.
  for (const e of G.enemies) {
    if (e.dead) continue;
    const d = dist2d(e.x, e.z, G.playerPos.x, G.playerPos.z);
    if (e.state === 'idle' && d < 30) e.state = 'combat';
    if (e.state !== 'combat') { e.h.group.position.set(e.x, 0.24, e.z); continue; }
    e.yaw = angleLerp(e.yaw, yawToward(e.x, e.z, G.playerPos.x, G.playerPos.z), dt * 7);
    let mvx = 0, mvz = 0;
    if (d > 12) { mvx = Math.sin(e.yaw); mvz = Math.cos(e.yaw); }
    else if (d < 6.5) { mvx = -Math.sin(e.yaw); mvz = -Math.cos(e.yaw); }
    else { mvx = Math.cos(e.yaw) * e.strafe; mvz = -Math.sin(e.yaw) * e.strafe; if (rnd() < dt * 0.25) e.strafe *= -1; }
    e.x += mvx * 2.6 * dt; e.z += mvz * 2.6 * dt;
    e.phase += dt * 7;
    animateHumanoid(e.h, e.phase, 1.1);
    e.h.group.position.set(e.x, 0.24, e.z);
    e.h.group.rotation.y = e.yaw;
    e.barFg.parent.children.forEach((c) => { if (c.geometry === barBgGeo || c.geometry === barFgGeo) c.rotation.y = G.camYaw + Math.PI - e.yaw; });
    // Shooting bursts.
    e.burstCd -= dt;
    if (e.burstCd <= 0 && d < 30 && !segmentBlocked(G, e.x, e.z, G.playerPos.x, G.playerPos.z)) {
      e.burstLeft = 3; e.burstCd = rr(1.5, 2.7); e.shotCd = 0;
    }
    if (e.burstLeft > 0) {
      e.shotCd -= dt;
      if (e.shotCd <= 0) {
        e.shotCd = 0.14; e.burstLeft--;
        G.audio.shoot();
        const hitChance = clamp(0.55 - d * 0.011, 0.12, 0.5) * (G.mode === 'car' ? 0.7 : 1);
        const ex = e.x, ez = e.z;
        let hx = G.playerPos.x, hz = G.playerPos.z;
        const hit = rnd() < hitChance;
        if (!hit) { hx += rr(-2.4, 2.4); hz += rr(-2.4, 2.4); }
        tracer(G, ex, 1.35, ez, hx, 1.15, hz, 0xff9a5c);
        if (hit) {
          if (G.mode === 'car' && G.playerCar) { G.playerCar.damage = Math.min(1, G.playerCar.damage + 0.03); damagePlayer(G, 3); }
          else damagePlayer(G, rr(4, 8));
        }
      }
    }
  }
}
