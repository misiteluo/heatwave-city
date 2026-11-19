// police.js — the Heatwave PD. Owns the wanted level (0–5 stars),
// spawns cruisers in proportion to the heat, steers them in pursuit
// with a little target prediction, plants roadblocks at four stars,
// and from three stars puts a helicopter over the player whose
// searchlight keeps the stars from decaying. Busts happen when
// cruisers pin a slow or on-foot player long enough. The cruisers
// wear the black-and-white livery with a working light bar.
//
// Round 7 makes them mean: at four stars they throw spike strips
// across your line and the bold ones try a PIT — a nudge on your
// rear quarter at speed to spin you out. At five the roadblocks
// become checkpoints, spikes in the gap. And the bay is no longer
// safe: take to the water at two stars and the marine unit launches
// pursuit boats that ram.

import { Car, Helicopter, Boat } from './vehicles.js';
import { GRID, HALF, WANTED_DECAY_SECONDS, BUSTED_RADIUS, BUSTED_SECONDS, angleDelta, clamp, dist2d } from './config.js';

export class Police {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.wanted = 0;
    this.cars = [];
    this.blocks = [];
    this.boats = [];
    this.spikes = [];
    this.heli = null;
    this.hiddenTimer = 0;
    this.bustTimer = 0;
    this.spawnTimer = 0;
    this.blockCd = 0;
    this.spikeCd = 8;
    this.boatCd = 0;
    this.onBusted = null;
    this.lastTX = 0; this.lastTZ = 0;
    this.velX = 0; this.velZ = 0;
  }

  setWanted(n) {
    const next = clamp(Math.round(n), 0, 5);
    if (next > this.wanted) this.hiddenTimer = 0;
    this.wanted = next;
  }

  addWanted(n) { this.setWanted(this.wanted + n); }

  targetCount() { return [0, 2, 3, 5, 6, 8][this.wanted] || 0; }

  spawnOne(world) {
    const target = world.playerCar || world.player;
    for (let tries = 0; tries < 8; tries++) {
      const vertical = Math.random() < 0.5;
      const li = Math.floor(Math.random() * (GRID + 1));
      const line = -HALF + li * 46;
      const along = -HALF + Math.random() * HALF * 2;
      const x = vertical ? line : along;
      const z = vertical ? along : line;
      const d = dist2d(x, z, target.x, target.z);
      if (d < 48 || d > 150) continue;
      const car = new Car(this.scene, 'police', 0xf4f6f8, x, z, Math.random() * Math.PI * 2, { police: true });
      this.cars.push(car);
      return car;
    }
    return null;
  }

  spawnRoadblock(world) {
    const target = world.playerCar || world.player;
    const heading = world.playerCar ? world.playerCar.heading : world.player.heading;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const bx = target.x + fx * 58, bz = target.z + fz * 58;
    if (!this.city.isLand(bx, bz)) return;
    const perp = heading + Math.PI / 2;
    for (let i = -1; i <= 1; i++) {
      const x = bx + Math.sin(perp) * i * 5.2;
      const z = bz + Math.cos(perp) * i * 5.2;
      if (!this.city.isLand(x, z)) continue;
      const car = new Car(this.scene, 'police', 0xf4f6f8, x, z, perp, { police: true });
      car.ai = null;
      this.blocks.push(car);
    }
    // At five stars the gap in the middle gets a spike strip:
    // a checkpoint you cannot simply thread.
    if (this.wanted >= 5) this.dropSpikes(bx, bz, perp);
    this.blockCd = 26;
  }

  dropSpikes(x, z, heading) {
    if (!this.city.isLand(x, z)) return;
    const grp = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x22242a });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.1, 1.15), mat);
    strip.position.y = 0.06;
    grp.add(strip);
    const spikeMat = new THREE.MeshBasicMaterial({ color: 0xd8dde2 });
    for (let i = -3; i <= 3; i++) {
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 5), spikeMat);
      s.position.set(i * 1.0, 0.2, 0);
      grp.add(s);
    }
    grp.position.set(x, this.city.groundY(x, z), z);
    grp.rotation.y = heading;
    this.scene.add(grp);
    this.spikes.push({ x, z, heading, mesh: grp, life: 30 });
  }

  updateSpikes(dt, world) {
    const pc = world.playerCar;
    this.spikeCd -= dt;
    if (this.wanted >= 4 && pc && !pc.dead && this.spikeCd <= 0 && this.spikes.length < 2) {
      // Throw a strip across the player's line, a few seconds ahead.
      const fx = Math.sin(pc.heading), fz = Math.cos(pc.heading);
      const sx = pc.x + fx * 52, sz = pc.z + fz * 52;
      if (this.city.isLand(sx, sz)) {
        this.dropSpikes(sx, sz, pc.heading + Math.PI / 2);
        this.spikeCd = 24;
      } else this.spikeCd = 5;
    }
    this.spikes = this.spikes.filter((sp) => {
      sp.life -= dt;
      let gone = sp.life <= 0;
      if (pc && !pc.dead && pc.spikeT <= 0 && Math.abs(pc.speed) > 5
        && dist2d(pc.x, pc.z, sp.x, sp.z) < 3.6) {
        pc.shredTyres(12);
        world.hud.toast('Spike strip! Your tyres are shredded');
        world.audio.crash();
        world.shake = Math.max(world.shake || 0, 0.3);
        gone = true;
      }
      if (gone) this.scene.remove(sp.mesh);
      return !gone;
    });
  }

  updateBoats(dt, world) {
    const pb = world.playerBoat;
    const want = pb && !pb.dead && this.wanted >= 2 ? (this.wanted >= 4 ? 2 : 1) : 0;
    this.boatCd -= dt;
    if (this.boats.length < want && this.boatCd <= 0) {
      this.boatCd = 3;
      // Launch from open water somewhere off the player's bow.
      for (let tries = 0; tries < 8; tries++) {
        const a = Math.random() * Math.PI * 2;
        const x = pb.x + Math.sin(a) * (55 + Math.random() * 30);
        const z = pb.z + Math.cos(a) * (55 + Math.random() * 30);
        if (!this.city.isWater(x, z)) continue;
        const boat = new Boat(this.scene, 0x2456c8, x, z, a, { police: true });
        boat.ramCd = 0;
        this.boats.push(boat);
        break;
      }
    }
    this.boats = this.boats.filter((boat) => {
      if (boat.dead || !pb || dist2d(boat.x, boat.z, pb.x, pb.z) > 380) {
        boat.remove(this.scene);
        return false;
      }
      boat.aiDrive(dt, pb.x, pb.z, this.city);
      boat.ramCd = Math.max(0, (boat.ramCd || 0) - dt);
      if (boat.ramCd <= 0 && dist2d(boat.x, boat.z, pb.x, pb.z) < 4.6) {
        boat.ramCd = 1.4;
        pb.damage(9);
        pb.speed *= 0.55;
        world.shake = Math.max(world.shake || 0, 0.22);
        world.audio.crash();
        world.hud.toast('Marine unit rammed your boat!');
        if (pb.dead) world.hud.toast('The boat is going down — swim for it');
      }
      return true;
    });
  }

  updateHeli(dt, world, t) {
    const target = world.playerCar || world.player;
    if (this.wanted >= 3) {
      if (!this.heli) {
        this.heli = new Helicopter(this.scene, 0x2456c8, target.x + 60, target.z - 60, 0, { police: true });
        this.heli.alt = 20;
      }
      const near = dist2d(this.heli.x, this.heli.z, target.x, target.z) < 60;
      this.heli.spotlightOn = near && this.city.nightF > 0.25;
      this.heli.aiMove(dt, target.x + this.velX * 0.5, target.z + this.velZ * 0.5, 15 + Math.sin(t * 0.4) * 2, this.city);
    } else if (this.heli) {
      this.heli.spotlightOn = false;
      this.heli.aiMove(dt, this.heli.x + 300, this.heli.z - 300, 26, this.city);
      if (dist2d(this.heli.x, this.heli.z, target.x, target.z) > 260) {
        this.heli.remove(this.scene);
        this.heli = null;
      }
    }
  }

  update(dt, world, t) {
    const target = world.playerCar || world.playerHeli || world.player;
    // Target velocity estimate, for pursuit prediction + heli lead.
    if (dt > 0) {
      this.velX = (target.x - this.lastTX) / dt;
      this.velZ = (target.z - this.lastTZ) / dt;
      const m = Math.hypot(this.velX, this.velZ);
      if (m > 60) { this.velX *= 60 / m; this.velZ *= 60 / m; }
    }
    this.lastTX = target.x; this.lastTZ = target.z;

    if (this.wanted <= 0) {
      // Stand down: cruisers leave, blocks clear, boats head home.
      for (const car of this.cars) car.remove(this.scene);
      for (const car of this.blocks) car.remove(this.scene);
      for (const boat of this.boats) boat.remove(this.scene);
      for (const sp of this.spikes) this.scene.remove(sp.mesh);
      this.cars = []; this.blocks = []; this.boats = []; this.spikes = [];
      if (this.heli) this.updateHeli(dt, world, t);
      this.bustTimer = 0;
      world.hud.setBustProgress(0);
      return;
    }

    // Who can see the player?
    let seen = false;
    for (const car of this.cars) {
      if (!car.dead && dist2d(car.x, car.z, target.x, target.z) < 58) { seen = true; break; }
    }
    if (!seen && this.heli && dist2d(this.heli.x, this.heli.z, target.x, target.z) < 78) seen = true;
    if (!seen) {
      for (const boat of this.boats) {
        if (dist2d(boat.x, boat.z, target.x, target.z) < 55) { seen = true; break; }
      }
    }
    if (seen) this.hiddenTimer = 0;
    else {
      this.hiddenTimer += dt;
      if (this.hiddenTimer > WANTED_DECAY_SECONDS) {
        this.hiddenTimer = 0;
        this.setWanted(this.wanted - 1);
        if (this.wanted > 0) world.hud.toast('The heat cools — ' + this.wanted + ' star' + (this.wanted > 1 ? 's' : ''));
        else world.hud.toast('You lost the heat');
      }
    }

    // Maintain cruiser strength.
    this.spawnTimer -= dt;
    const alive = this.cars.filter((c) => !c.dead).length;
    if (alive < this.targetCount() && this.spawnTimer <= 0) {
      this.spawnTimer = 1.6;
      this.spawnOne(world);
    }
    // Recycle cruisers that fell too far behind.
    this.cars = this.cars.filter((car) => {
      if (dist2d(car.x, car.z, target.x, target.z) > 430) { car.remove(this.scene); return false; }
      return true;
    });

    // Pursuit driving, aimed a touch ahead of the target.
    const px = target.x + this.velX * 0.42;
    const pz = target.z + this.velZ * 0.42;
    for (const car of this.cars) {
      car.flashLights(true, t);
      if (car.dead || car.occupied) continue;
      const d = dist2d(car.x, car.z, px, pz);
      const want = Math.atan2(px - car.x, pz - car.z);
      const dh = angleDelta(car.heading, want);
      const input = { throttle: 1, steer: clamp(dh * 2.1, -1, 1), handbrake: Math.abs(dh) > 1.9 && d < 16 };
      if (Math.abs(dh) > 2.5 && d < 9) input.throttle = -1;
      if (d < 3.4) input.throttle = 0.2;
      car.drive(dt, input, this.city);
      // The PIT: alongside the player's rear quarter at speed, a
      // trained nudge that walks the tail out.
      const pc = world.playerCar;
      if (pc && !pc.dead && Math.abs(pc.speed) > 9 && this.wanted >= 3) {
        car.pitCd = Math.max(0, (car.pitCd || 0) - dt);
        if (car.pitCd <= 0) {
          const rx = pc.x - Math.sin(pc.heading) * 2.2, rz = pc.z - Math.cos(pc.heading) * 2.2;
          if (dist2d(car.x, car.z, rx, rz) < 3.4 && Math.abs(car.speed) > 8) {
            car.pitCd = 3;
            const side = (car.x - pc.x) * Math.cos(pc.heading) - (car.z - pc.z) * Math.sin(pc.heading) > 0 ? 1 : -1;
            pc.heading -= side * 0.16;
            pc.speed *= 0.86;
            world.shake = Math.max(world.shake || 0, 0.2);
            world.audio.crash();
            world.hud.toast('PIT manoeuvre — they\'re trying to spin you!');
          }
        }
      }
    }

    // Roadblocks at four stars.
    this.blockCd -= dt;
    if (this.wanted >= 4 && this.blocks.length === 0 && this.blockCd <= 0 && world.playerCar) {
      this.spawnRoadblock(world);
    }
    for (const car of this.blocks) car.flashLights(true, t);
    if (this.blocks.length && (this.wanted < 4 || dist2d(this.blocks[0].x, this.blocks[0].z, target.x, target.z) > 150)) {
      for (const car of this.blocks) car.remove(this.scene);
      this.blocks = [];
    }

    this.updateSpikes(dt, world);
    this.updateBoats(dt, world);
    this.updateHeli(dt, world, t);

    // Bust logic: pinned and surrounded in a car, cornered on foot,
    // or held by the marine unit in a boat.
    let pinned = false;
    if (!world.playerHeli) {
      if (world.playerCar) {
        if (Math.abs(world.playerCar.speed) < 2.6) {
          let near = 0;
          for (const car of this.cars) if (!car.dead && dist2d(car.x, car.z, target.x, target.z) < 9) near++;
          pinned = near >= 2;
        }
      } else if (world.playerBoat) {
        if (Math.abs(world.playerBoat.speed) < 2) {
          let near = 0;
          for (const boat of this.boats) if (!boat.dead && dist2d(boat.x, boat.z, target.x, target.z) < 9) near++;
          pinned = near >= 1;
        }
      } else {
        for (const car of this.cars) {
          if (!car.dead && dist2d(car.x, car.z, target.x, target.z) < BUSTED_RADIUS + 1.2) { pinned = true; break; }
        }
      }
    }
    if (pinned) {
      this.bustTimer += dt;
      world.hud.setBustProgress(this.bustTimer / BUSTED_SECONDS);
      if (this.bustTimer >= BUSTED_SECONDS && this.onBusted) {
        this.bustTimer = 0;
        world.hud.setBustProgress(0);
        this.onBusted();
      }
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 1.6);
      world.hud.setBustProgress(this.bustTimer / BUSTED_SECONDS);
    }
  }
}
