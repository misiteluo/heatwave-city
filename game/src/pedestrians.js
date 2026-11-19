// pedestrians.js — the citizens of Heatwave City. Most stroll a
// loop around their home block at kerb distance; a few walk the
// beachfront promenade or the boardwalk end to end, and a handful
// live out on Gull Island and at the airport. They wear the
// articulated bodies: varied hair, caps on some, and a walk cycle
// with knees and elbows that bend.
//
// Round 7's crowd reacts like a crowd. Gunfire close by: sprint.
// Gunfire closer: some drop into a cower, arms over their heads.
// Gunfire at a spectacle's distance: the ones with phones stop and
// film — and a citizen who films a crime for a few seconds does
// what citizens do, and calls it in. Carjacked drivers bail out
// and run. All of them still count as witnesses for the crime
// system.

import { buildHumanoid, animateHumanoid, posePhone, poseCower } from './player.js';
import { BLOCK, ISLAND, AIRPORT, SKIN_TONES, SHIRT_COLORS, HAIR_COLORS, blockCentre, clamp, dist2d, makeRng } from './config.js';

const PANTS = [0x2b2d42, 0x6c5849, 0x274156, 0x772e25, 0x3d405b];

export class Pedestrians {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = makeRng(seed * 97 + 3);
    this.peds = [];
    this.runners = []; // carjacked drivers and other temporary runners
    const rng = this.rng;
    const addPed = (x, z, waypoints, speed) => {
      // One in three wears a cap; the rest get a hair colour.
      // Two in five carry a phone — it changes what they do at a crime.
      const opts = rng() < 0.34
        ? { capColor: [0x555f6e, 0xe63946, 0x118ab2, 0xffd23f][Math.floor(rng() * 4)] }
        : { hair: HAIR_COLORS[Math.floor(rng() * HAIR_COLORS.length)] };
      if (rng() < 0.42) opts.phone = true;
      const mesh = buildHumanoid(
        SHIRT_COLORS[Math.floor(rng() * SHIRT_COLORS.length)],
        PANTS[Math.floor(rng() * PANTS.length)],
        SKIN_TONES[Math.floor(rng() * SKIN_TONES.length)],
        opts,
      );
      mesh.position.set(x, 0, z);
      scene.add(mesh);
      this.peds.push({
        mesh, x, z, heading: rng() * Math.PI * 2, phase: rng() * 6,
        waypoints, wi: Math.floor(rng() * waypoints.length),
        speed: speed || (1.1 + rng() * 0.9),
        flee: 0, fleeX: 0, fleeZ: 0,
        mode: 'stroll', modeT: 0, watchX: 0, watchZ: 0, called: false,
        hasPhone: !!opts.phone,
      });
    };
    // Block-loop strollers.
    for (let i = 0; i < 34; i++) {
      const cx = blockCentre(Math.floor(rng() * 14));
      const cz = blockCentre(Math.floor(rng() * 14));
      const o = BLOCK / 2 + 3.6;
      const wps = [
        [cx - o, cz - o], [cx + o, cz - o], [cx + o, cz + o], [cx - o, cz + o],
      ];
      if (rng() < 0.5) wps.reverse();
      addPed(wps[0][0], wps[0][1], wps);
    }
    // Beachfront promenade walkers.
    for (let i = 0; i < 6; i++) {
      const z = 342 + rng() * 10;
      addPed(-280 + rng() * 560, z, [[-310, z], [310, z]]);
    }
    // Boardwalk walkers on the east strip.
    for (let i = 0; i < 4; i++) {
      const x = 346 + rng() * 8;
      addPed(x, -280 + rng() * 560, [[x, -310], [x, 310]]);
    }
    // Islanders.
    for (let i = 0; i < 4; i++) {
      const a = rng() * Math.PI * 2;
      const x = ISLAND.x + Math.cos(a) * 26, z = ISLAND.z + Math.sin(a) * 26;
      addPed(x, z, [[ISLAND.x - 24, ISLAND.z + 10], [ISLAND.x + 20, ISLAND.z - 14], [ISLAND.x + 4, ISLAND.z + 26]]);
    }
    // Airport staff and travellers crossing the apron.
    for (let i = 0; i < 4; i++) {
      const x = AIRPORT.x - 40 + rng() * 80, z = AIRPORT.z - 26 + rng() * 10;
      addPed(x, z, [[AIRPORT.x - 46, AIRPORT.z - 24], [AIRPORT.x + 40, AIRPORT.z - 24], [AIRPORT.x, AIRPORT.z - 30]]);
    }
  }

  scare(x, z, radius = 16) {
    for (const p of this.peds) {
      const d = dist2d(p.x, p.z, x, z);
      if (d >= radius) continue;
      const dx = p.x - x, dz = p.z - z;
      const m = Math.hypot(dx, dz) || 1;
      if (d < 5.5 && this.rng() < 0.42) {
        // Too close to run cleanly: drop and cover.
        p.mode = 'cower'; p.modeT = 2 + this.rng() * 1.4;
        p.flee = 0;
      } else if (p.hasPhone && d > 7 && this.rng() < 0.65) {
        // At a spectacle's distance, the phone comes out.
        p.mode = 'film'; p.modeT = 2.6 + this.rng();
        p.watchX = x; p.watchZ = z; p.called = false;
        p.flee = 0;
      } else {
        p.mode = 'stroll';
        p.flee = 2.6;
        p.fleeX = dx / m; p.fleeZ = dz / m;
      }
    }
  }

  // A driver whose car just got taken: bail, run, vanish into the city.
  spawnRunner(x, z, fromX, fromZ) {
    const rng = this.rng;
    const mesh = buildHumanoid(
      SHIRT_COLORS[Math.floor(rng() * SHIRT_COLORS.length)],
      PANTS[Math.floor(rng() * PANTS.length)],
      SKIN_TONES[Math.floor(rng() * SKIN_TONES.length)],
      { hair: HAIR_COLORS[Math.floor(rng() * HAIR_COLORS.length)] },
    );
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const dx = x - fromX, dz = z - fromZ;
    const m = Math.hypot(dx, dz) || 1;
    this.runners.push({
      mesh, x, z, heading: Math.atan2(dx / m, dz / m), phase: rng() * 6,
      fx: dx / m, fz: dz / m, life: 4.5,
    });
  }

  update(dt, world) {
    const city = world.city;
    const focus = world.playerCar || world.player;
    for (const p of this.peds) {
      // Distance culling: a stroller two districts away is not drawn.
      p.mesh.visible = dist2d(p.x, p.z, focus.x, focus.z) < 250;
      let mx = 0, mz = 0, speed = p.speed;
      if (p.mode === 'cower') {
        p.modeT -= dt;
        poseCower(p.mesh);
        p.mesh.position.set(p.x, city.groundY(p.x, p.z), p.z);
        if (p.modeT <= 0) { p.mode = 'stroll'; p.flee = 1.6; p.fleeX = Math.sin(p.heading); p.fleeZ = Math.cos(p.heading); }
        continue;
      }
      if (p.mode === 'film') {
        p.modeT -= dt;
        // Stand, face the spectacle, phone up.
        p.heading = Math.atan2(p.watchX - p.x, p.watchZ - p.z);
        posePhone(p.mesh);
        p.mesh.position.set(p.x, city.groundY(p.x, p.z), p.z);
        p.mesh.rotation.y = p.heading;
        if (p.modeT <= 0) {
          p.mode = 'stroll';
          if (!p.called) {
            p.called = true;
            if (world.onWitnessCall) world.onWitnessCall(p.x, p.z);
          }
        }
        continue;
      }
      if (p.flee > 0) {
        p.flee -= dt;
        mx = p.fleeX; mz = p.fleeZ; speed = 6.4;
      } else {
        const [tx, tz] = p.waypoints[p.wi];
        const dx = tx - p.x, dz = tz - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.4) { p.wi = (p.wi + 1) % p.waypoints.length; continue; }
        mx = dx / d; mz = dz / d;
      }
      const want = Math.atan2(mx, mz);
      let dh = want - p.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      p.heading += clamp(dh, -6 * dt, 6 * dt);
      const nx = p.x + mx * speed * dt;
      const nz = p.z + mz * speed * dt;
      if (city.isLand(nx, nz)) { p.x = nx; p.z = nz; }
      const probe = { x: p.x, z: p.z };
      city.collide(probe, 0.5);
      p.x = probe.x; p.z = probe.z;
      p.phase += dt * speed * 2.1;
      animateHumanoid(p.mesh, p.phase, p.flee > 0 ? 0.95 : 0.6);
      p.mesh.position.set(p.x, city.groundY(p.x, p.z), p.z);
      p.mesh.rotation.y = p.heading;
    }
    // Temporary runners burn out fast and fade into the crowd.
    this.runners = this.runners.filter((r) => {
      r.life -= dt;
      if (r.life <= 0) { this.scene.remove(r.mesh); return false; }
      const nx = r.x + r.fx * 6.8 * dt;
      const nz = r.z + r.fz * 6.8 * dt;
      if (city.isLand(nx, nz)) { r.x = nx; r.z = nz; }
      r.phase += dt * 13;
      animateHumanoid(r.mesh, r.phase, 0.95);
      r.mesh.position.set(r.x, city.groundY(r.x, r.z), r.z);
      r.mesh.rotation.y = r.heading;
      return true;
    });
  }

  nearest(x, z, maxD) {
    let best = null, bd = maxD;
    for (const p of this.peds) {
      const d = dist2d(p.x, p.z, x, z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  countNear(x, z, r) {
    let n = 0;
    for (const p of this.peds) if (dist2d(p.x, p.z, x, z) < r) n++;
    return n;
  }
}
