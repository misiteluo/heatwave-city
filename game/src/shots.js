// HEATWAVE CITY — staged screenshot scenes. Each ?shot=<name> load arranges a
// real, playable moment (no compositing): the cover chase downtown, a street
// corner on foot, a beach fight mid-mission, and a highway run at a roadblock.
// An autopilot drives/walks for a few seconds, then window.__shotReady flips.

import { clamp, angleDiff } from './config.js';
import { placeCar } from './vehicles.js';

function driveInput(car, tx, tz, topSpeed) {
  const p = car.mesh.position;
  const desired = Math.atan2(tx - p.x, tz - p.z);
  const steer = clamp(angleDiff(car.heading, desired) * 2.4, -1, 1);
  let throttle = 0;
  if (car.speed < topSpeed) throttle = 1;
  else if (car.speed > topSpeed + 2) throttle = -0.4;
  return { z: 0, x: 0, sprint: false, throttle, steer, handbrake: false, lookDX: 0, lookDY: 0, looking: false };
}

const IDLE = { z: 0, x: 0, sprint: false, throttle: 0, steer: 0, handbrake: false, lookDX: 0, lookDY: 0, looking: false };

export function createShotDirector(name, ctx) {
  const { player, traffic, police, runner, state } = ctx;
  let elapsed = 0;
  let setUp = false;
  let readyAt = 3;
  let drive = null; // {car, tx, tz, speed} for car scenes

  function setup() {
    if (name === 'cover') {
      ctx.startMission(0);
      const car = traffic.cars[0];
      placeCar(car, 30, 128, Math.PI);
      player.enterCar(car);
      ctx.setWantedAtLeast(3);
      const c1 = police.spawnCop(car.mesh.position); placeCar(c1, 23, 152, Math.PI);
      const c2 = police.spawnCop(car.mesh.position); placeCar(c2, 38, 160, Math.PI);
      // a third cruiser ahead, swinging in off the cross street — visible in frame
      const c3 = police.spawnCop(car.mesh.position); placeCar(c3, 20, 44, Math.PI * 0.82);
      // traffic ahead in the same street so the road feels alive (northbound lane x=34)
      const t1 = traffic.cars[1];
      placeCar(t1, 34, 64, Math.PI);
      t1.navDir = { x: 0, z: -1 }; traffic.pickNext(t1, 30, 30);
      const t2 = traffic.cars[2];
      placeCar(t2, 34, -34, Math.PI);
      t2.navDir = { x: 0, z: -1 }; traffic.pickNext(t2, 30, -30);
      drive = { car, tx: 30, tz: -500, speed: 17 };
      readyAt = 3.4;
    } else if (name === 'foot') {
      ctx.startMission(0);
      player.teleport(41, 109, -2.05);
      player.camYaw = -2.05; player.camPitch = 0.3;
      // dress the corner: a few pedestrians near the player
      const spots = [[36, 100], [44, 96], [31, 106], [47, 112]];
      ctx.peds.peds.slice(0, 4).forEach((ped, i) => ped.mesh.position.set(spots[i][0], 0, spots[i][1]));
      // traffic crossing the intersection in front of the player
      const x1 = traffic.cars[3];
      placeCar(x1, 2, 94, Math.PI / 2);
      x1.navDir = { x: 1, z: 0 }; traffic.pickNext(x1, 30, 90);
      const x2 = traffic.cars[4];
      placeCar(x2, 74, 86, -Math.PI / 2);
      x2.navDir = { x: -1, z: 0 }; traffic.pickNext(x2, 30, 90);
      // a parked car on the far kerb, in front of the shopfronts
      placeCar(traffic.parked[0], 55, 95.5, Math.PI / 2);
      readyAt = 2.1;
    } else if (name === 'mission') {
      state.hasGun = true; state.ammo = 30;
      runner.index = 2; runner.stepIndex = 1; runner.active = true; runner.done = false;
      runner.beginStep(); // spawns the Solano crew fight at the beach
      player.teleport(55, 299, 0.59);
      player.camYaw = 0.59; player.camPitch = 0.3;
      readyAt = 1.7;
    } else if (name === 'chase') {
      ctx.startMission(3);
      const car = traffic.cars[1];
      placeCar(car, -150, 270, Math.PI / 2);
      car.speed = 19;
      player.enterCar(car);
      ctx.setWantedAtLeast(4);
      const c1 = police.spawnCop(car.mesh.position); placeCar(c1, -169, 264, Math.PI / 2);
      const c2 = police.spawnCop(car.mesh.position); placeCar(c2, -174, 277, Math.PI / 2);
      police.setRoadblock({ x: -150, z: 270 }, Math.PI / 2);
      drive = { car, tx: 600, tz: 270, speed: 23 };
      readyAt = 2.9;
    }
  }

  return {
    update(dt) {
      if (!setUp) { setUp = true; setup(); }
      elapsed += dt;
      if (elapsed >= readyAt && !window.__shotReady) window.__shotReady = true;
      if (drive) return driveInput(drive.car, drive.tx, drive.tz, drive.speed);
      if (name === 'foot') return { ...IDLE, z: 1 }; // stroll toward the intersection
      return IDLE;
    },
  };
}
