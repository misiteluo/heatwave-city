// main.js — Heatwave City's glue. Builds the world (city, traffic,
// pedestrians, police, combat, missions), owns the input, the camera,
// carjacking and helicopter boarding, the crime bookkeeping, the radio
// and the game-state screens, then runs the loop. Nico Serrano's story
// lives in missions.js; this file makes the city breathe around it.

import { City } from './city.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Combat, Enemy, WEAPONS } from './combat.js';
import { Car, Helicopter } from './vehicles.js';
import { Hud } from './hud.js';
import { AudioBand } from './audio.js';
import { Missions } from './missions.js';
import { loadSave, storeSave, wipeSave } from './save.js';
import { setupShot, isShotMode } from './shots.js';
import { PLAYER_START, blockCentre, clamp, dist2d, angleDelta } from './config.js';

const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') || '7', 10) || 7;
const shotName = isShotMode(params);

const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.domElement.classList.add('webgl');
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1100);
camera.position.set(-230, 9, 120);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const hud = new Hud();
const audio = new AudioBand();
let save = loadSave();
audio.muted = !!save.muted;

const world = {
  scene, hud, audio,
  city: null, player: null, traffic: null, peds: null, police: null,
  combat: null, missions: null,
  enemies: [],
  looseCars: [],
  helicopters: [],
  playerCar: null,
  playerHeli: null,
  enemyClass: { Enemy },
  state: 'title',
  time: 0,
  shake: 0,
  shotCrimeCd: 0,
  pedCrimeCd: 0,
  crashCrimeCd: 0,
  cash: save.cash,
};

world.city = new City(scene, seed);
world.player = new Player(scene, PLAYER_START.x, PLAYER_START.z);
world.traffic = new Traffic(scene, world.city, seed);
world.peds = new Pedestrians(scene, seed);
world.police = new Police(scene, world.city);
world.combat = new Combat(scene);
world.combat.spawnPickupRing();
world.missions = new Missions(world);
world.missions.index = save.mission || 0;

// the flyable helicopter, parked on the marina helipad
const marinaHeli = new Helicopter(scene, 0xff7b00, blockCentre(10), blockCentre(5), { heading: -Math.PI / 2 });
world.helicopters.push(marinaHeli);

world.targetCars = () => world.traffic.allCars().concat(world.police.cars, world.police.blocks, world.looseCars);
world.makeCar = (type, color, x, z, heading, opts) => {
  const car = new Car(scene, type, color, x, z, heading, opts);
  world.looseCars.push(car);
  return car;
};

world.addCash = (n) => { world.cash += n; save.cash = world.cash; hud.setCash(world.cash); };
world.saveProgress = () => {
  save.cash = world.cash;
  save.mission = world.missions.index;
  save.completed = world.missions.index;
  save.started = true;
  save.weapons = { smg: world.combat.unlocked.smg, shotgun: world.combat.unlocked.shotgun };
  save.ammo = { ...world.combat.ammo };
  save.muted = audio.muted;
  storeSave(save);
};
world.damagePlayer = (amount) => {
  if (world.state !== 'playing') return;
  const dead = world.player.hurt(amount);
  hud.setHealth(world.player.health);
  hud.setArmor(world.player.armor);
  hud.damageFlash();
  if (dead) doWasted();
};
world.onGunshot = (x, z) => {
  world.peds.scare(x, z, 17);
  if (world.shotCrimeCd <= 0 && world.police.wanted < 5) {
    const witnessed = world.police.cars.length > 0 || world.police.heli || world.peds.countNear(x, z, 26) > 0;
    if (witnessed) { world.police.addWanted(1); hud.toast('Gunfire reported — the heat is up'); }
    world.shotCrimeCd = 4;
  }
};
world.onEnemyDown = (enemy) => {
  save.kills++;
  world.addCash(20);
  const roll = Math.random();
  if (roll < 0.3) world.combat.dropPickup('pistol', enemy.x, enemy.z, 10);
  else if (roll < 0.42) world.combat.dropPickup('smg', enemy.x, enemy.z, 24);
  else if (roll < 0.5) world.combat.dropPickup('shotgun', enemy.x, enemy.z, 5);
  else if (roll < 0.58) world.combat.dropPickup('health', enemy.x, enemy.z, 34);
};
world.onCarDestroyed = (car) => {
  world.combat.explosion(car.x, car.z, world);
};

world.grabNearestCar = (x, z) => {
  let best = null, bd = 1e9;
  for (const car of world.traffic.allCars().concat(world.looseCars)) {
    if (car.dead) continue;
    const d = dist2d(x, z, car.x, car.z);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
};

world.enterCar = (car, silent = false) => {
  const wasOccupied = car.occupied;
  world.traffic.takeParked(car);
  world.traffic.takeMoving(car);
  const li = world.looseCars.indexOf(car);
  car.occupied = true;
  world.playerCar = car;
  world.player.mesh.visible = false;
  world.player.x = car.x; world.player.z = car.z;
  if (!silent) {
    audio.ensure();
    if (wasOccupied && li < 0) {
      world.peds.scare(car.x, car.z, 12);
      const witnessed = world.police.cars.length > 0 || world.peds.countNear(car.x, car.z, 24) > 0;
      if (witnessed && world.police.wanted < 5) {
        world.police.addWanted(1);
        hud.toast('Carjacked in front of witnesses — +1 star');
      } else hud.toast('Carjacked');
      audio.punch();
    } else hud.toast('You are driving — Space is the handbrake, R is the radio');
  }
};

function exitCar() {
  const car = world.playerCar;
  if (!car) return;
  car.speed = 0;
  car.occupied = false;
  if (!world.looseCars.includes(car) && !world.traffic.parked.includes(car)) world.traffic.parked.push(car);
  world.playerCar = null;
  world.player.x = car.x - Math.cos(car.heading) * 2.6;
  world.player.z = car.z + Math.sin(car.heading) * 2.6;
  if (!world.city.isLand(world.player.x, world.player.z)) { world.player.x = car.x; world.player.z = car.z; }
  world.player.mesh.visible = true;
  audio.engine(0, false);
  radioOff();
}

function enterHeli(heli) {
  heli.occupied = true;
  world.playerHeli = heli;
  world.player.mesh.visible = false;
  world.player.x = heli.x; world.player.z = heli.z;
  hud.toast('Rotors hot — W/S pitch, A/D turn, Space climb, Shift descend');
  audio.ensure();
}

function exitHeli() {
  const heli = world.playerHeli;
  if (!heli || !heli.landed) return;
  heli.occupied = false;
  world.playerHeli = null;
  world.player.x = heli.x + 3.2;
  world.player.z = heli.z;
  if (!world.city.isLand(world.player.x, world.player.z)) { world.player.x = heli.x - 3.2; }
  world.player.mesh.visible = true;
  audio.rotor(false);
}

function respawn(x, z) {
  if (world.playerCar) exitCar();
  if (world.playerHeli) { world.playerHeli.occupied = false; world.playerHeli = null; audio.rotor(false); }
  world.player.x = x; world.player.z = z;
  world.player.health = 100;
  world.player.armor = 0;
  world.player.mesh.visible = true;
  world.police.setWanted(0);
  hud.setHealth(100);
  hud.setArmor(0);
  hud.setStars(0);
}

function doBusted() {
  if (world.state !== 'playing') return;
  world.state = 'busted';
  save.busts++;
  const fine = Math.min(world.cash, 150 + world.police.wanted * 70);
  world.cash -= fine;
  document.getElementById('bustedtext').textContent =
    'The Heatwave PD boxed Nico in. Fine paid: $' + fine + '. Val is not impressed.';
  document.getElementById('busted').classList.remove('hidden');
  audio.busted(); audio.siren(false); audio.engine(0, false); audio.rotor(false);
  world.missions.onPlayerDown();
  world.saveProgress();
}
world.police.onBusted = doBusted;

function doWasted() {
  if (world.state !== 'playing') return;
  world.state = 'wasted';
  save.wasted++;
  const bill = Math.min(world.cash, 175);
  world.cash -= bill;
  document.getElementById('wastedtext').textContent =
    'Nico wakes up at Heatwave General. Hospital bill: $' + bill + '.';
  document.getElementById('wasted').classList.remove('hidden');
  audio.siren(false); audio.engine(0, false); audio.rotor(false);
  world.missions.onPlayerDown();
  world.saveProgress();
}

// ---------------------------------------------------------------- radio
let radioStation = -1;
function radioOff() {
  if (radioStation >= 0) { audio.radio(false); radioStation = -1; hud.setRadio(null); }
}
function cycleRadio() {
  audio.ensure();
  if (radioStation < 0) {
    radioStation = audio.radio(true, 0);
  } else if (radioStation >= 2) {
    radioOff();
    hud.toast('Radio off');
    return;
  } else {
    radioStation = audio.radio(true, radioStation + 1);
  }
  if (radioStation >= 0) hud.setRadio(audio.radioStationName(radioStation));
}

// ---------------------------------------------------------------- input
const keys = {};
let camYaw = Math.PI, camPitch = 0.32;
let dragging = false, dragMoved = 0, lastMX = 0, lastMY = 0;
let mouseDownAt = 0, firing = false;

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (world.state === 'playing') {
    if (e.code === 'KeyE') toggleVehicle();
    if (e.code === 'KeyF') firing = true;
    if (e.code === 'KeyM') {
      audio.ensure(); audio.setMuted(!audio.muted);
      save.muted = audio.muted; world.saveProgress();
      hud.toast(audio.muted ? 'Muted' : 'Sound on');
    }
    if (e.code === 'KeyQ') { hud.setWeapon(world.combat); world.combat.cycle(1); hud.setWeapon(world.combat); }
    if (e.code === 'Digit1') { world.combat.select('fist'); hud.setWeapon(world.combat); }
    if (e.code === 'Digit2') { world.combat.select('pistol'); hud.setWeapon(world.combat); }
    if (e.code === 'Digit3') { if (world.combat.select('smg')) hud.setWeapon(world.combat); }
    if (e.code === 'Digit4') { if (world.combat.select('shotgun')) hud.setWeapon(world.combat); }
    if (e.code === 'KeyR' && world.playerCar) cycleRadio();
    if (e.code === 'Enter') {
      if (world.missions.failed) world.missions.retry();
      else if (!world.missions.active && !world.missions.done) world.missions.startNext();
    }
    if (e.code === 'KeyP' || e.code === 'Escape') pauseGame();
  } else if (world.state === 'paused' && (e.code === 'KeyP' || e.code === 'Escape')) resumeGame();
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'KeyF') { firing = false; world.combat.releaseTrigger(); }
});
window.addEventListener('wheel', (e) => {
  if (world.state === 'playing' && !world.playerCar && !world.playerHeli) {
    world.combat.cycle(e.deltaY > 0 ? 1 : -1);
    hud.setWeapon(world.combat);
  }
}, { passive: true });

renderer.domElement.addEventListener('mousedown', (e) => {
  dragging = true; dragMoved = 0; lastMX = e.clientX; lastMY = e.clientY;
  mouseDownAt = performance.now();
  audio.ensure();
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastMX, dy = e.clientY - lastMY;
  lastMX = e.clientX; lastMY = e.clientY;
  dragMoved += Math.abs(dx) + Math.abs(dy);
  camYaw -= dx * 0.0052;
  camPitch = clamp(camPitch + dy * 0.0035, 0.06, 1.15);
});
window.addEventListener('mouseup', () => {
  // a clean click (no drag) is a trigger pull; a drag just orbits
  if (dragging && dragMoved < 6 && performance.now() - mouseDownAt < 400
    && world.state === 'playing' && !world.playerCar && !world.playerHeli) {
    firing = true;
    setTimeout(() => { firing = false; world.combat.releaseTrigger(); }, 90);
  }
  dragging = false;
});

function toggleVehicle() {
  if (world.playerHeli) { exitHeli(); return; }
  if (world.playerCar) { exitCar(); return; }
  // helicopter first if one is close and landed
  for (const heli of world.helicopters) {
    if (heli.landed && dist2d(world.player.x, world.player.z, heli.x, heli.z) < 5.5) { enterHeli(heli); return; }
  }
  const car = world.grabNearestCar(world.player.x, world.player.z);
  if (car && dist2d(world.player.x, world.player.z, car.x, car.z) < 4.8) world.enterCar(car);
}

function pauseGame() {
  world.state = 'paused';
  document.getElementById('pausestats').textContent =
    'Cash $' + world.cash + ' · Jobs done ' + world.missions.index + '/9 · Kills ' + save.kills
    + ' · Busts ' + save.busts + ' · Wasted ' + save.wasted;
  document.getElementById('pause').classList.remove('hidden');
  audio.engine(0, false);
}
function resumeGame() {
  world.state = 'playing';
  document.getElementById('pause').classList.add('hidden');
}

function startGame(fresh) {
  if (fresh) {
    save = wipeSave();
    world.cash = save.cash;
    world.missions.index = 0;
    world.combat.unlocked = { fist: true, pistol: true, smg: false, shotgun: false };
    world.combat.ammo = { pistol: 40, smg: 0, shotgun: 0 };
    respawn(PLAYER_START.x, PLAYER_START.z);
  } else {
    world.cash = save.cash;
    world.missions.index = save.mission || 0;
    world.combat.unlocked.smg = !!save.weapons.smg;
    world.combat.unlocked.shotgun = !!save.weapons.shotgun;
    world.combat.ammo = { ...save.ammo };
  }
  hud.setCash(world.cash);
  hud.setHealth(world.player.health);
  hud.setArmor(world.player.armor);
  hud.setWeapon(world.combat);
  document.getElementById('title').classList.add('hidden');
  world.state = 'playing';
  audio.ensure();
  audio.setMuted(!!save.muted);
  if (!world.missions.done) world.missions.startNext();
  else hud.setObjective('Free roam — Heatwave City is yours');
  hud.toast('Welcome to Heatwave City, Nico');
}

document.getElementById('newgame').addEventListener('click', () => startGame(true));
document.getElementById('continue').addEventListener('click', () => startGame(false));
document.getElementById('resume').addEventListener('click', resumeGame);
document.getElementById('bustedbtn').addEventListener('click', () => {
  document.getElementById('busted').classList.add('hidden');
  respawn(PLAYER_START.x, PLAYER_START.z);
  hud.setCash(world.cash);
  world.state = 'playing';
});
document.getElementById('wastedbtn').addEventListener('click', () => {
  document.getElementById('wasted').classList.add('hidden');
  respawn(115, -138);
  hud.setCash(world.cash);
  world.state = 'playing';
});

// ---------------------------------------------------------------- camera
let chaseYaw = 0;
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  if (world.playerHeli) {
    const h = world.playerHeli;
    chaseYaw += angleDelta(chaseYaw, h.heading) * Math.min(1, dt * 2.2);
    const bx = h.x - Math.sin(chaseYaw) * 15;
    const bz = h.z - Math.cos(chaseYaw) * 15;
    const floorY = world.city.heightAt(h.x, h.z) + h.alt;
    camera.position.lerp(camTarget.set(bx, floorY + 5.5, bz), Math.min(1, dt * 4));
    camera.lookAt(h.x + Math.sin(h.heading) * 8, floorY + 1, h.z + Math.cos(h.heading) * 8);
  } else if (world.playerCar) {
    const car = world.playerCar;
    chaseYaw += angleDelta(chaseYaw, car.heading) * Math.min(1, dt * 3.2);
    const bx = car.x - Math.sin(chaseYaw) * 11.5;
    const bz = car.z - Math.cos(chaseYaw) * 11.5;
    camera.position.lerp(camTarget.set(bx, 4.6, bz), Math.min(1, dt * 5));
    camera.lookAt(car.x + Math.sin(car.heading) * 6, 1.4, car.z + Math.cos(car.heading) * 6);
  } else {
    const p = world.player;
    const dist = 8;
    const cx = p.x + Math.sin(camYaw) * dist * Math.cos(camPitch);
    const cz = p.z + Math.cos(camYaw) * dist * Math.cos(camPitch);
    const cy = 1.6 + Math.sin(camPitch) * dist;
    camera.position.lerp(camTarget.set(cx, cy, cz), Math.min(1, dt * 10));
    camera.lookAt(p.x, 1.5, p.z);
  }
}

// car-vs-car bumps for the player's vehicle
function resolveCarBumps(dt) {
  const mine = world.playerCar;
  if (!mine || mine.dead) return;
  for (const other of world.targetCars()) {
    if (other === mine || other.dead) continue;
    const rr = (mine.spec.radius + other.spec.radius) * 1.25;
    const dx = mine.x - other.x, dz = mine.z - other.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 0.001) {
      const d = Math.sqrt(d2);
      const push = (rr - d) / 2;
      const nx = dx / d, nz = dz / d;
      mine.x += nx * push; mine.z += nz * push;
      const impact = Math.abs(mine.speed);
      if (impact > 6) {
        other.damage((impact - 5) * 1.3);
        mine.damage((impact - 5) * 0.5);
        if (other.dead && world.onCarDestroyed) world.onCarDestroyed(other);
        audio.crash();
        world.shake = 0.3;
        if (world.crashCrimeCd <= 0 && world.police.wanted < 5
          && (world.police.cars.length > 0 || world.peds.countNear(mine.x, mine.z, 24) > 0)) {
          world.police.addWanted(1);
          hud.toast('Collision witnessed — +1 star');
          world.crashCrimeCd = 6;
        }
        mine.speed *= 0.45;
      }
    }
  }
}

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let miniTimer = 0, promptTimer = 0, shotFrames = 0, shotPose = null;

if (shotName) {
  document.getElementById('title').classList.add('hidden');
  world.state = 'playing';
  world.city.fixedTod = 0.7;
  world.cash = 2450;
  hud.setCash(world.cash);
  hud.setHealth(92);
  hud.setArmor(35);
  world.player.armor = 35;
  hud.setWeapon(world.combat);
  shotPose = setupShot(shotName, world);
  hud.drawMinimap(world);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  world.time += dt;
  const t = world.time;
  const focus = world.playerCar || world.player;
  world.city.update(dt, t, focus);
  world.shotCrimeCd = Math.max(0, world.shotCrimeCd - dt);
  world.pedCrimeCd = Math.max(0, world.pedCrimeCd - dt);
  world.crashCrimeCd = Math.max(0, world.crashCrimeCd - dt);
  hud.update(dt);

  if (world.state === 'playing' && shotName) {
    world.traffic.update(dt, world);
    world.peds.update(dt, world.city);
    for (const cop of world.police.cars) cop.flashLights(t);
    if (shotPose) {
      camera.position.set(shotPose.camX, shotPose.camY, shotPose.camZ);
      camera.lookAt(shotPose.lookX, shotPose.lookY, shotPose.lookZ);
    }
    if (shotFrames === 4) hud.drawMinimap(world);
    shotFrames++;
    if (shotFrames > 24) window.__shotReady = true;
  } else if (world.state === 'playing') {
    if (world.playerHeli) {
      const heli = world.playerHeli;
      const input = {
        throttle: (keys.KeyW || keys.ArrowUp ? 1 : 0) + (keys.KeyS || keys.ArrowDown ? -1 : 0),
        turn: (keys.KeyA || keys.ArrowLeft ? 1 : 0) + (keys.KeyD || keys.ArrowRight ? -1 : 0),
        lift: (keys.Space ? 1 : 0) + ((keys.ShiftLeft || keys.ShiftRight) ? -1 : 0),
      };
      heli.update(dt, input, world.city);
      world.player.x = heli.x; world.player.z = heli.z;
      audio.rotor(true, clamp(heli.rotorSpin / 42, 0, 1));
      hud.setSpeed(heli.speed * 3.6, true);
    } else if (world.playerCar) {
      const car = world.playerCar;
      const input = {
        throttle: (keys.KeyW || keys.ArrowUp ? 1 : 0) + (keys.KeyS || keys.ArrowDown ? -1 : 0),
        steer: (keys.KeyA || keys.ArrowLeft ? 1 : 0) + (keys.KeyD || keys.ArrowRight ? -1 : 0),
        handbrake: !!keys.Space,
      };
      const beforeSpeed = car.speed;
      car.drive(dt, input, world.city);
      if (car.crashInfo && Math.abs(beforeSpeed) > 8) {
        audio.crash();
        world.shake = 0.25;
        car.crashInfo = null;
      }
      world.player.x = car.x; world.player.z = car.z;
      audio.engine(car.speed / 40, true);
      hud.setSpeed(car.speed * 3.6, true);
      const victim = world.peds.nearest(car.x, car.z, 2.0);
      if (victim && Math.abs(car.speed) > 5) {
        victim.flee = 3; victim.fleeX = Math.sin(car.heading); victim.fleeZ = Math.cos(car.heading);
        if (world.pedCrimeCd <= 0) {
          world.pedCrimeCd = 5;
          if (world.police.wanted < 5) world.police.addWanted(1);
          hud.toast('You hit a pedestrian — +1 star');
          world.peds.scare(car.x, car.z, 18);
        }
      }
      resolveCarBumps(dt);
      if (car.dead) { hud.toast('This ride is wrecked — find another'); exitCar(); }
    } else {
      const f = { x: -Math.sin(camYaw), z: -Math.cos(camYaw) };
      const r = { x: -f.z, z: f.x };
      const move = { x: 0, z: 0 };
      if (keys.KeyW || keys.ArrowUp) { move.x += f.x; move.z += f.z; }
      if (keys.KeyS || keys.ArrowDown) { move.x -= f.x; move.z -= f.z; }
      if (keys.KeyD || keys.ArrowRight) { move.x += r.x; move.z += r.z; }
      if (keys.KeyA || keys.ArrowLeft) { move.x -= r.x; move.z -= r.z; }
      world.player.update(dt, move, !!(keys.ShiftLeft || keys.ShiftRight), world.city);
      hud.setSpeed(0, false);
      audio.engine(0, false);
      // firing: aim where the camera looks, 30 units ahead of Nico
      const w = world.combat.current;
      world.player.setWeaponDrawn(w !== 'fist');
      world.player.aiming = firing && w !== 'fist';
      if (firing) {
        const tx = world.player.x - Math.sin(camYaw) * 30;
        const tz = world.player.z - Math.cos(camYaw) * 30;
        world.combat.trigger(world, tx, tz);
        hud.setWeapon(world.combat);
      }
    }
    world.traffic.update(dt, world);
    world.peds.update(dt, world.city);
    world.police.update(dt, world, t);
    for (const e of world.enemies) e.update(dt, world);
    world.enemies = world.enemies.filter((e) => !e.dead || e.mesh.rotation.x !== 0);
    world.combat.update(dt, world);
    world.missions.update(dt);
    hud.setStars(world.police.wanted);
    hud.setHealth(world.player.health);
    hud.setArmor(world.player.armor);
    audio.siren(world.police.wanted > 0 && !shotName);
    promptTimer -= dt;
    if (promptTimer <= 0) {
      promptTimer = 0.12;
      if (world.playerHeli) hud.setPrompt(world.playerHeli.landed ? 'E — climb out' : 'Space climb · Shift descend');
      else if (world.playerCar) hud.setPrompt('E — exit · Space — handbrake · R — radio');
      else {
        let nearHeli = false;
        for (const heli of world.helicopters) {
          if (heli.landed && dist2d(world.player.x, world.player.z, heli.x, heli.z) < 5.5) nearHeli = true;
        }
        const car = world.grabNearestCar(world.player.x, world.player.z);
        if (nearHeli) hud.setPrompt('E — board the helicopter');
        else if (car && dist2d(world.player.x, world.player.z, car.x, car.z) < 4.8) hud.setPrompt('E — ' + (car.occupied ? 'carjack this car' : 'enter car'));
        else if (world.missions.failed) hud.setPrompt('Enter — retry the job');
        else if (!world.missions.active && !world.missions.done) hud.setPrompt('Enter — take Val\'s next job');
        else hud.setPrompt('');
      }
    }
    updateCamera(dt);
    if (world.shake > 0) {
      world.shake -= dt;
      camera.position.x += (Math.random() - 0.5) * 0.3;
      camera.position.y += (Math.random() - 0.5) * 0.3;
    }
  } else if (world.state === 'title') {
    const a = t * 0.045;
    camera.position.set(Math.sin(a) * 190, 62, Math.cos(a) * 190 + 60);
    camera.lookAt(0, 8, 60);
    world.peds.update(dt, world.city);
    world.traffic.update(dt, world);
  }

  miniTimer -= dt;
  if (miniTimer <= 0 && world.state !== 'title') {
    miniTimer = 0.12;
    if (!shotName) hud.drawMinimap(world);
  }
  renderer.render(scene, camera);
}
animate();

window.__world = world;
