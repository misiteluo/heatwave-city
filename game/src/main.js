// main.js — Heatwave City's glue. Builds the world (city, traffic,
// pedestrians, police, combat, missions), owns the input, the camera,
// the carjacking, the crime bookkeeping and the game-state screens,
// then runs the loop. Rico Vale's story lives in missions.js; this
// file just makes the city breathe around it.

import { City } from './city.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Combat, Enemy } from './combat.js';
import { Hud } from './hud.js';
import { AudioBand } from './audio.js';
import { Missions } from './missions.js';
import { loadSave, storeSave, wipeSave } from './save.js';
import { setupShot, isShotMode } from './shots.js';
import { PLAYER_START, clamp, dist2d, angleDelta } from './config.js';

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
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(-190, 8, 100);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const hud = new Hud();
const audio = new AudioBand();
let save = loadSave();

const world = {
  scene, hud, audio,
  city: null, player: null, traffic: null, peds: null, police: null,
  combat: null, missions: null,
  enemies: [],
  playerCar: null,
  enemyClass: { Enemy },
  state: 'title',
  time: 0,
  shotCrimeCd: 0,
  pedCrimeCd: 0,
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

world.addCash = (n) => { world.cash += n; save.cash = world.cash; hud.setCash(world.cash); };
world.saveProgress = () => {
  save.cash = world.cash;
  save.mission = world.missions.index;
  save.completed = world.missions.index;
  save.started = true;
  storeSave(save);
};
world.damagePlayer = (amount) => {
  if (world.state !== 'playing') return;
  const dead = world.player.hurt(amount);
  hud.setHealth(world.player.health);
  hud.damageFlash();
  if (dead) doWasted();
};
world.onGunshot = (x, z) => {
  world.peds.scare(x, z, 17);
  if (world.shotCrimeCd <= 0 && world.police.wanted < 5) {
    const witnessed = world.police.cars.length > 0 || world.peds.countNear(x, z, 26) > 0;
    if (witnessed) { world.police.addWanted(1); hud.toast('Gunfire reported — the heat is up'); }
    world.shotCrimeCd = 4;
  }
};
world.onEnemyDown = () => { world.addCash(15); };

world.grabNearestCar = (x, z) => {
  let best = null, bd = 1e9;
  for (const car of world.traffic.allCars()) {
    const d = dist2d(x, z, car.x, car.z);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
};

world.enterCar = (car, silent = false) => {
  const wasOccupied = car.occupied;
  world.traffic.takeParked(car);
  world.traffic.takeMoving(car);
  car.occupied = true;
  world.playerCar = car;
  world.player.mesh.visible = false;
  if (!silent) {
    if (audio) audio.ensure();
    if (wasOccupied) {
      // carjacking: a driver is hauled out and runs, witnesses remember
      world.peds.scare(car.x, car.z, 12);
      const witnessed = world.police.cars.length > 0 || world.peds.countNear(car.x, car.z, 24) > 0;
      if (witnessed && world.police.wanted < 5) {
        world.police.addWanted(1);
        hud.toast('Carjacked in front of witnesses — +1 star');
      } else hud.toast('Carjacked');
      if (audio) audio.punch();
    } else hud.toast('You are driving — Space is the handbrake');
  }
};

function exitCar() {
  const car = world.playerCar;
  if (!car) return;
  car.speed = 0;
  car.occupied = false;
  world.traffic.parked.push(car);
  world.playerCar = null;
  world.player.x = car.x - Math.cos(car.heading) * 2.4;
  world.player.z = car.z + Math.sin(car.heading) * 2.4;
  world.player.mesh.visible = true;
  audio.engine(0, false);
}

function respawn(x, z) {
  if (world.playerCar) exitCar();
  world.player.x = x; world.player.z = z;
  world.player.health = 100;
  world.player.mesh.visible = true;
  world.police.setWanted(0);
  hud.setHealth(100);
  hud.setStars(0);
}

function doBusted() {
  if (world.state !== 'playing') return;
  world.state = 'busted';
  save.busts++;
  const fine = Math.min(world.cash, 120 + world.police.wanted * 60);
  world.cash -= fine;
  document.getElementById('bustedtext').textContent =
    'The Heatwave PD boxed Rico in. Fine paid: $' + fine + '. Sable is not impressed.';
  document.getElementById('busted').classList.remove('hidden');
  audio.busted(); audio.siren(false); audio.engine(0, false);
  world.saveProgress();
}
world.police.onBusted = doBusted;

function doWasted() {
  if (world.state !== 'playing') return;
  world.state = 'wasted';
  save.wasted++;
  const bill = Math.min(world.cash, 150);
  world.cash -= bill;
  document.getElementById('wastedtext').textContent =
    'Rico wakes up at Heatwave General. Hospital bill: $' + bill + '.';
  document.getElementById('wasted').classList.remove('hidden');
  audio.siren(false); audio.engine(0, false);
  world.saveProgress();
}

// ---------------------------------------------------------------- input
const keys = {};
let camYaw = Math.PI, camPitch = 0.32;
let dragging = false, dragMoved = 0, lastMX = 0, lastMY = 0;
let mouseDownAt = 0;

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (world.state === 'playing') {
    if (e.code === 'KeyE') toggleCar();
    if (e.code === 'KeyF') doAttack();
    if (e.code === 'KeyM') { audio.ensure(); audio.setMuted(!audio.muted); hud.toast(audio.muted ? 'Muted' : 'Sound on'); }
    if (e.code === 'Enter' && !world.missions.active && !world.missions.done) world.missions.startNext();
    if (e.code === 'KeyP' || e.code === 'Escape') pauseGame();
  } else if (world.state === 'paused' && (e.code === 'KeyP' || e.code === 'Escape')) resumeGame();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

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
  if (dragging && dragMoved < 6 && performance.now() - mouseDownAt < 350
    && world.state === 'playing' && !world.playerCar) doAttack();
  dragging = false;
});

function toggleCar() {
  if (world.playerCar) { exitCar(); return; }
  const car = world.grabNearestCar(world.player.x, world.player.z);
  if (car && dist2d(world.player.x, world.player.z, car.x, car.z) < 4.6) world.enterCar(car);
}

function doAttack() {
  audio.ensure();
  if (world.playerCar) return;
  // aim where the camera looks: a point ahead of Rico on the ground
  const tx = world.player.x - Math.sin(camYaw) * 26;
  const tz = world.player.z - Math.cos(camYaw) * 26;
  // prefer a shot when an enemy is roughly ahead, else throw a punch
  let enemyAhead = false;
  for (const e of world.enemies) {
    if (e.dead) continue;
    const d = dist2d(world.player.x, world.player.z, e.x, e.z);
    if (d < 44 && d > 2.4) enemyAhead = true;
  }
  if (enemyAhead || world.combat.ammo > 0 && keys.ShiftLeft) {
    if (!world.combat.shoot(world, tx, tz)) hud.toast('Out of ammo — find a yellow ammo box');
  } else {
    world.combat.melee(world);
  }
  hud.setAmmo(world.combat.ammo);
}

function pauseGame() {
  world.state = 'paused';
  document.getElementById('pausestats').textContent =
    'Cash $' + world.cash + ' · Jobs done ' + world.missions.index + '/5 · Wanted ' + world.police.wanted + ' stars';
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
    respawn(PLAYER_START.x, PLAYER_START.z);
  } else {
    world.cash = save.cash;
    world.missions.index = save.mission || 0;
  }
  hud.setCash(world.cash);
  hud.setHealth(world.player.health);
  hud.setAmmo(world.combat.ammo);
  document.getElementById('title').classList.add('hidden');
  world.state = 'playing';
  audio.ensure();
  if (!world.missions.done) {
    world.missions.startNext();
  } else hud.setObjective('Free roam — Heatwave City is yours');
  hud.toast('Welcome to Heatwave City, Rico');
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
  respawn(-44, -44);
  hud.setCash(world.cash);
  world.state = 'playing';
});

// ---------------------------------------------------------------- camera
let chaseYaw = 0;
function updateCamera(dt) {
  if (world.playerCar) {
    const car = world.playerCar;
    chaseYaw += angleDelta(chaseYaw, car.heading) * Math.min(1, dt * 3.2);
    const bx = car.x - Math.sin(chaseYaw) * 11.5;
    const bz = car.z - Math.cos(chaseYaw) * 11.5;
    camera.position.lerp(new THREE.Vector3(bx, 4.6, bz), Math.min(1, dt * 5));
    camera.lookAt(car.x + Math.sin(car.heading) * 6, 1.4, car.z + Math.cos(car.heading) * 6);
  } else {
    const p = world.player;
    const dist = 8;
    const cx = p.x + Math.sin(camYaw) * dist * Math.cos(camPitch);
    const cz = p.z + Math.cos(camYaw) * dist * Math.cos(camPitch);
    const cy = 1.6 + Math.sin(camPitch) * dist;
    camera.position.lerp(new THREE.Vector3(cx, cy, cz), Math.min(1, dt * 10));
    camera.lookAt(p.x, 1.5, p.z);
  }
}

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let miniTimer = 0, promptTimer = 0, shotFrames = 0, shotPose = null;

if (shotName) {
  document.getElementById('title').classList.add('hidden');
  world.state = 'playing';
  world.cash = 2450;
  hud.setCash(world.cash);
  hud.setHealth(92);
  hud.setAmmo(18);
  shotPose = setupShot(shotName, world);
  hud.drawMinimap(world);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  world.time += dt;
  const t = world.time;
  world.city.update(dt, t);
  world.shotCrimeCd = Math.max(0, world.shotCrimeCd - dt);
  world.pedCrimeCd = Math.max(0, world.pedCrimeCd - dt);
  hud.update(dt);

  if (world.state === 'playing' && shotName) {
    // staged frame: keep the world alive but hold the composed pose
    world.traffic.update(dt, world);
    for (const cop of world.police.cars) cop.flashLights(t);
    if (shotPose) {
      camera.position.set(shotPose.camX, shotPose.camY, shotPose.camZ);
      camera.lookAt(shotPose.lookX, shotPose.lookY, shotPose.lookZ);
    }
    if (shotFrames === 4) hud.drawMinimap(world);
    shotFrames++;
    if (shotFrames > 24) window.__shotReady = true;
  } else if (world.state === 'playing') {
    // --- player / driving
    if (world.playerCar) {
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
      audio.engine(car.speed / 34, true);
      hud.setSpeed(car.speed * 3.6, true);
      // running someone down is a crime and a tragedy
      const victim = world.peds.nearest(car.x, car.z, 1.9);
      if (victim && Math.abs(car.speed) > 5) {
        victim.flee = 3; victim.fleeX = Math.sin(car.heading); victim.fleeZ = Math.cos(car.heading);
        world.damagePlayer(0);
        if (world.pedCrimeCd <= 0) {
          world.pedCrimeCd = 5;
          if (world.police.wanted < 5) world.police.addWanted(1);
          hud.toast('You hit a pedestrian — +1 star');
          world.peds.scare(car.x, car.z, 18);
        }
      }
      if (car.dead) { hud.toast('This car is wrecked — find another'); exitCar(); }
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
    }
    // --- world systems
    world.traffic.update(dt, world);
    world.peds.update(dt, world.city);
    world.police.update(dt, world, t);
    for (const e of world.enemies) e.update(dt, world);
    world.enemies = world.enemies.filter((e) => !e.dead || e.mesh.rotation.x !== 0);
    world.combat.update(dt, world);
    world.missions.update(dt);
    hud.setStars(world.police.wanted);
    hud.setHealth(world.player.health);
    hud.setAmmo(world.combat.ammo);
    audio.siren(world.police.wanted > 0);
    // contextual prompt
    promptTimer -= dt;
    if (promptTimer <= 0) {
      promptTimer = 0.12;
      if (world.playerCar) hud.setPrompt('E — exit car · Space — handbrake');
      else {
        const car = world.grabNearestCar(world.player.x, world.player.z);
        if (car && dist2d(world.player.x, world.player.z, car.x, car.z) < 4.6) hud.setPrompt('E — ' + (car.occupied ? 'carjack this car' : 'enter car'));
        else if (!world.missions.active && !world.missions.done) hud.setPrompt('Enter — take Sable\'s next job');
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
    // slow orbit over downtown for the title backdrop
    const a = t * 0.05;
    camera.position.set(Math.sin(a) * 150, 55, Math.cos(a) * 150);
    camera.lookAt(0, 10, 0);
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
