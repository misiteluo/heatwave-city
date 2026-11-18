// HEATWAVE CITY — boot and glue: renderer, sun and sky, the game loop, input,
// crime & wanted bookkeeping, bust/waste/respawn, pickups, HUD wiring and the
// hooks the mission runner talks to. Systems live in their own modules; this
// file only connects them.

import { CITY, WORLD, COLORS, CRIMES, WANTED, clamp, dist2d, makeRng } from './config.js';
import { buildCity } from './city.js';
import { createCar, placeCar, stepCar, resolveCarCollisions, initSmoke, updateSmoke } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Player } from './player.js';
import { Combat } from './combat.js';
import { MissionRunner, MISSIONS } from './missions.js';
import { HUD } from './hud.js';
import { AudioSys } from './audio.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { createShotDirector } from './shots.js';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') || 1234);

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(COLORS.fog, 130, 640);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2600);
camera.position.set(0, 30, 320);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// sky dome: sunset gradient, plus a low sun glow sprite
{
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#3a6ea8'); grad.addColorStop(0.45, '#c97a6b');
  grad.addColorStop(0.72, '#ffb36b'); grad.addColorStop(1, '#ff9a5e');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 24, 14),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);
}
const hemi = new THREE.HemisphereLight(0xffd9b0, 0x7a4a3a, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffc98a, 1.25);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -150; sun.shadow.camera.right = 150;
sun.shadow.camera.top = 150; sun.shadow.camera.bottom = -150;
sun.shadow.camera.far = 900;
sun.shadow.bias = -0.0006;
scene.add(sun); scene.add(sun.target);

// ---------------------------------------------------------------- world
const rng = makeRng(seed);
const city = buildCity(scene, rng);
const traffic = new Traffic(scene, city, rng);
const peds = new Pedestrians(scene, city, rng);
const police = new Police(scene, city, rng);
const combat = new Combat(scene, rng);
const player = new Player(scene, rng);
const hud = new HUD();
const audio = new AudioSys();
initSmoke(scene);

const world = { colliders: city.colliders, bounds: city.bounds };
const extraCars = []; // mission cars and anything not in the traffic fleet

player.teleport(city.landmarks.spawn.x, city.landmarks.spawn.z, Math.PI);

// mission objective beam
const beam = new THREE.Mesh(
  new THREE.CylinderGeometry(1.7, 1.7, 90, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.33, side: THREE.DoubleSide, depthWrite: false }),
);
beam.position.y = 45;
beam.visible = false;
scene.add(beam);

// ---------------------------------------------------------------- state
const state = {
  mode: shotName ? 'playing' : 'menu', // menu | playing | paused | ended
  cash: 120,
  heat: 0,
  stars: 0,
  hasGun: false,
  ammo: 0,
  bustT: 0,
  time: 0,
  endKind: null, // 'busted' | 'wasted' | 'done'
  gunGranted: false,
};
let lastPlayerPos = { x: player.pos.x, z: player.pos.z };
let playerVel = { x: 0, z: 0 };
const pickups = [];

function allCars() {
  return traffic.allCars().concat(police.activeCars(), extraCars);
}

function saveGame() {
  writeSave({ cash: state.cash, mission: runner.index, hasGun: state.hasGun, storyDone: runner.done });
}

function reportCrime(points) {
  if (state.mode !== 'playing') return;
  state.heat = clamp(state.heat + points, 0, WANTED.maxStars * WANTED.heatPerStar);
}

function setWantedAtLeast(n) {
  const target = (n - 1) * WANTED.heatPerStar + WANTED.heatPerStar * 0.5;
  state.heat = Math.max(state.heat, target);
}

// ---------------------------------------------------------------- missions
const runner = new MissionRunner({
  toast: (t) => hud.toast(t),
  dialog: (who, text) => hud.dialog(who, text),
  addCash: (n) => { state.cash += n; },
  setWantedAtLeast,
  spawnMissionCar: (x, z, heading, color) => {
    const car = createCar(scene, { color, kind: 'civilian' });
    car.driver = 'mission';
    placeCar(car, x, z, heading);
    extraCars.push(car);
    return car;
  },
  spawnFight: (count, x, z) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      combat.spawnEnemy(x + Math.sin(a) * (6 + i * 2), z + Math.cos(a) * (6 + i * 2));
    }
    peds.scare(x, z, 6);
  },
  aliveEnemies: () => combat.aliveCount(),
  clearEnemies: () => combat.clearEnemies(),
  save: () => saveGame(),
  sfx: (name) => { if (audio[name]) audio[name](); },
  onStoryComplete: () => showEnd('done'),
}, city.landmarks);

// ---------------------------------------------------------------- input
const keys = new Set();
let lookDX = 0, lookDY = 0, dragging = false, dragMoved = 0, mouseDownAt = 0, attackQueued = false;
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'KeyF') attackQueued = true;
  if (e.code === 'KeyE') actionQueued = true;
  if (e.code === 'KeyM') { const m = audio.toggleMute(); hud.toast(m ? 'Sound off' : 'Sound on'); }
  if ((e.code === 'KeyP' || e.code === 'Escape') && (state.mode === 'playing' || state.mode === 'paused')) togglePause();
});
addEventListener('keyup', (e) => keys.delete(e.code));
let actionQueued = false;
const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', (e) => { dragging = true; dragMoved = 0; mouseDownAt = performance.now(); canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  dragMoved += Math.abs(e.movementX) + Math.abs(e.movementY);
  if (dragMoved > 7) { lookDX += e.movementX; lookDY += e.movementY; }
});
canvas.addEventListener('pointerup', () => {
  dragging = false;
  if (dragMoved <= 7 && performance.now() - mouseDownAt < 350) attackQueued = true;
});

function readInput() {
  const z = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  return {
    z, x,
    sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    throttle: z,
    steer: (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0),
    handbrake: keys.has('Space'),
    lookDX, lookDY, looking: dragMoved > 7 && dragging,
  };
}

// ---------------------------------------------------------------- flow
const menuEl = document.getElementById('menu');
const pauseEl = document.getElementById('pause');
const endEl = document.getElementById('endscreen');
const continueBtn = document.getElementById('btnContinue');

function refreshContinue() {
  continueBtn.style.display = loadSave() ? '' : 'none';
}
refreshContinue();

function startPlaying(fresh) {
  audio.init();
  menuEl.classList.add('hidden');
  endEl.classList.add('hidden');
  hud.show();
  state.mode = 'playing';
  if (fresh) {
    clearSave();
    state.cash = 120; state.heat = 0; state.hasGun = false; state.ammo = 0; state.gunGranted = false;
    player.health = 100;
    police.clearAll(); combat.clearEnemies();
    if (player.mode === 'car') player.exitCar();
    player.teleport(city.landmarks.spawn.x, city.landmarks.spawn.z, Math.PI);
    runner.start(0);
    audio.sting();
  }
  document.getElementById('status').textContent = 'Playing HEATWAVE CITY';
}

document.getElementById('btnNew').addEventListener('click', () => startPlaying(true));
continueBtn.addEventListener('click', () => {
  const save = loadSave();
  audio.init();
  if (save) {
    state.cash = save.cash;
    state.hasGun = save.hasGun; state.gunGranted = save.hasGun;
    state.ammo = save.hasGun ? 36 : 0;
    menuEl.classList.add('hidden'); hud.show(); state.mode = 'playing';
    player.teleport(city.landmarks.spawn.x, city.landmarks.spawn.z, Math.PI);
    if (save.storyDone) { runner.done = true; hud.toast('Story complete — free roam. The city is yours.'); }
    else { runner.start(save.mission); audio.sting(); }
  }
});
document.getElementById('btnResume').addEventListener('click', togglePause);
document.getElementById('btnQuit').addEventListener('click', () => {
  pauseEl.classList.add('hidden');
  state.mode = 'menu';
  hud.hide();
  menuEl.classList.remove('hidden');
  refreshContinue();
});
document.getElementById('btnRespawn').addEventListener('click', respawn);

function togglePause() {
  if (state.mode === 'playing') {
    state.mode = 'paused';
    document.getElementById('pauseStats').textContent =
      `Cash $${Math.floor(state.cash)} · Job ${Math.min(runner.index + 1, MISSIONS.length)} of ${MISSIONS.length}: ${runner.mission ? runner.mission.title : '—'}`;
    pauseEl.classList.remove('hidden');
  } else if (state.mode === 'paused') {
    state.mode = 'playing';
    pauseEl.classList.add('hidden');
  }
}

function showEnd(kind) {
  state.mode = 'ended';
  state.endKind = kind;
  endEl.className = `overlay ${kind === 'busted' ? 'busted' : kind === 'wasted' ? 'wasted' : 'done'}`;
  const title = document.getElementById('endTitle');
  const text = document.getElementById('endText');
  const btn = document.getElementById('btnRespawn');
  if (kind === 'busted') {
    title.textContent = 'BUSTED';
    const fine = Math.min(state.cash, 150 + state.stars * 60);
    text.textContent = `The CBPD got you. Bail and fines cost you $${fine}.`;
    btn.textContent = 'RESPAWN';
    audio.bustedJingle();
  } else if (kind === 'wasted') {
    title.textContent = 'WASTED';
    const fine = Math.min(state.cash, 120);
    text.textContent = `You wake up at Caldera General. The bill is $${fine}.`;
    btn.textContent = 'RESPAWN';
    audio.bustedJingle();
  } else {
    title.textContent = 'CITY LEGEND';
    text.textContent = 'Every job done. Mara\'s money is home, the Solanos are finished, and Caldera Bay is yours. Free roam unlocked.';
    btn.textContent = 'KEEP ROAMING';
  }
  endEl.classList.remove('hidden');
  audio.setEngine(false); audio.setSiren(false);
}

function respawn() {
  const kind = state.endKind;
  endEl.classList.add('hidden');
  if (kind === 'done') { state.mode = 'playing'; return; }
  const fine = kind === 'busted' ? Math.min(state.cash, 150 + state.stars * 60) : Math.min(state.cash, 120);
  state.cash -= fine;
  state.heat = 0; state.bustT = 0;
  player.health = 100;
  police.clearAll(); combat.clearEnemies();
  if (player.mode === 'car') { const c = player.car; player.exitCar(); if (c) c.driver = 'parked'; }
  const spot = kind === 'busted' ? city.landmarks.station : city.landmarks.hospital;
  player.teleport(spot.x + 14, spot.z + 10, Math.PI);
  state.mode = 'playing';
  saveGame();
}

// ---------------------------------------------------------------- pickups
const pickupGeo = new THREE.BoxGeometry(0.7, 0.45, 0.7);
const pickupMat = new THREE.MeshLambertMaterial({ color: 0x2f9e44, emissive: 0x0d3316 });
function dropAmmoPickup(x, z) {
  const m = new THREE.Mesh(pickupGeo, pickupMat);
  m.position.set(x, 0.5, z);
  scene.add(m);
  pickups.push({ mesh: m, kind: 'ammo' });
}

// ---------------------------------------------------------------- combat hooks
const combatHooks = {
  onEnemyDown: (e) => {
    state.cash += 20;
    reportCrime(CRIMES.killEnemy);
    peds.scare(e.mesh.position.x, e.mesh.position.z, 3);
    if (rng() < 0.45) dropAmmoPickup(e.mesh.position.x, e.mesh.position.z);
    audio.pickup();
  },
};

function onPlayerHit(dmg) {
  if (state.mode !== 'playing') return;
  if (player.mode === 'car' && player.car) {
    player.car.health = Math.max(0, player.car.health - dmg * 0.8);
    player.health -= dmg * 0.2;
  } else {
    player.health -= dmg;
  }
  hud.damagePulse();
  audio.hit();
  if (player.health <= 0 && state.mode === 'playing') showEnd('wasted');
}

// ---------------------------------------------------------------- per-frame systems
function handleAction() {
  if (player.mode === 'foot') {
    const car = player.findNearbyCar(allCars());
    if (!car) return;
    const wasDriver = car.driver;
    if (wasDriver === 'traffic') {
      // yank the driver out: they become a fleeing pedestrian
      peds.releaseDriver(car.mesh.position.x + 2, car.mesh.position.z + 1);
      const copNear = police.nearestCopDist(car.mesh.position) < WANTED.sightRange;
      reportCrime(copNear ? CRIMES.stealCarWitnessed : CRIMES.stealCar);
      peds.scare(car.mesh.position.x, car.mesh.position.z, 2.5);
    } else if (wasDriver === 'parked' || wasDriver === 'mission') {
      const copNear = police.nearestCopDist(car.mesh.position) < WANTED.sightRange;
      reportCrime(copNear ? CRIMES.stealCarWitnessed : CRIMES.stealCar * 0.7);
    }
    player.enterCar(car);
    audio.sting();
  } else {
    if (Math.abs(player.car.speed) < 2.2) player.exitCar();
  }
}

function handleAttack() {
  if (player.mode === 'car') { audio.honk(); return; }
  player.heading = player.camYaw;
  player.mesh.rotation.y = player.heading;
  const aim = { x: Math.sin(player.camYaw), z: Math.cos(player.camYaw) };
  if (state.hasGun && state.ammo > 0) {
    state.ammo--;
    audio.shot();
    combat.playerShoot(player.pos, aim, combatHooks);
    reportCrime(CRIMES.shootNear);
    peds.scare(player.pos.x, player.pos.z, 3);
  } else if (state.hasGun && state.ammo <= 0) {
    audio.empty();
  } else {
    audio.punch();
    const hit = combat.playerPunch(player.pos, player.heading, combatHooks);
    if (!hit) {
      // swing at a pedestrian or a car?
      let bestPed = null, bd = 2.1;
      for (const ped of peds.peds) {
        const d = dist2d(player.pos.x, player.pos.z, ped.mesh.position.x, ped.mesh.position.z);
        if (d < bd) { bd = d; bestPed = ped; }
      }
      if (bestPed) {
        peds.knockDown(bestPed);
        reportCrime(police.nearestCopDist(player.pos) < WANTED.sightRange ? 40 : 12);
        peds.scare(player.pos.x, player.pos.z, 2.5);
      }
    } else {
      peds.scare(player.pos.x, player.pos.z, 2.5);
    }
  }
}

const shotDirector = shotName ? createShotDirector(shotName, {
  player, traffic, police, combat, runner, state, city, peds,
  setWantedAtLeast, reportCrime,
  startMission: (i) => runner.start(i),
}) : null;
if (shotDirector) {
  hud.show();
  menuEl.classList.add('hidden');
}

// Debug/testing handle (also handy for automated playtests).
window.__heatwave = { player, traffic, police, combat, runner, state, city, THREE };

let prevT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - prevT) / 1000);
  prevT = now;
  const running = state.mode === 'playing';
  if (running) state.time += dt;
  const input = readInput();
  lookDX = 0; lookDY = 0;
  let shotInput = null;
  if (shotDirector && running) shotInput = shotDirector.update(dt);
  const eff = shotInput || input;

  if (running) {
    // --- player / driving
    if (player.mode === 'foot') {
      player.updateFoot(dt, eff, world);
      audio.setEngine(false);
    } else {
      const car = player.car;
      const impact = stepCar(car, dt, { throttle: eff.throttle, steer: eff.steer, handbrake: eff.handbrake }, world);
      if (impact > 7) {
        audio.crash(clamp(impact / 16, 0.4, 1.4));
        reportCrime(CRIMES.hitCar);
        hud.damagePulse();
      }
      audio.setEngine(true, car.speed / 34);
      if (car.health <= 0 && !car.dead) {
        car.dead = true;
        hud.toast('Engine dead. This ride is finished.');
        player.exitCar();
      }
    }
    player.updateCamera(camera, dt);

    // --- world systems
    city.update(dt);
    traffic.update(dt, { ...world, onHonk: (p) => { if (dist2d(p.x, p.z, player.pos.x, player.pos.z) < 42) audio.honk(); } }, player.mode === 'foot' ? player.pos : null);
    resolveCarCollisions(allCars(), (a, b, sev) => {
      if ((a === player.car || b === player.car) && sev > 5) { audio.crash(clamp(sev / 15, 0.4, 1.2)); hud.damagePulse(); }
    });
    updateSmoke(dt, allCars());

    // player velocity (for police prediction + minimap)
    playerVel = { x: (player.pos.x - lastPlayerPos.x) / Math.max(dt, 0.001), z: (player.pos.z - lastPlayerPos.z) / Math.max(dt, 0.001) };
    lastPlayerPos = { x: player.pos.x, z: player.pos.z };

    // --- wanted bookkeeping
    const seen = police.anySees(player.pos);
    if (!seen && state.heat > 0) {
      let decay = WANTED.decayPerSec;
      const s = runner.step;
      if (s && s.type === 'escape' && dist2d(player.pos.x, player.pos.z, s.x, s.z) < s.r) decay += WANTED.hiddenDecayBonus;
      state.heat = Math.max(0, state.heat - decay * dt);
    }
    const newStars = state.heat <= 0 ? 0 : clamp(Math.ceil(state.heat / WANTED.heatPerStar), 0, WANTED.maxStars);
    if (newStars !== state.stars) { state.stars = newStars; }
    police.update(dt, state.stars, player.pos, playerVel, world);
    const nearestCop = police.nearestCopDist(player.pos);
    audio.setSiren(state.stars > 0 && nearestCop < 80, clamp(0.09 - nearestCop * 0.0008, 0.015, 0.09));

    // --- bust check (on foot, cop car close, not moving fast)
    if (player.mode === 'foot' && state.stars > 0 && nearestCop < 4.8 && player.speedNow < 3.4) {
      state.bustT += dt;
      hud.setBust(state.bustT / 3);
      if (state.bustT >= 3) { hud.setBust(null); showEnd('busted'); }
    } else {
      state.bustT = Math.max(0, state.bustT - dt * 1.6);
      hud.setBust(state.bustT > 0.05 ? state.bustT / 3 : null);
    }

    // --- pedestrians & car strikes
    peds.update(dt, state.time);
    for (const ped of peds.peds) {
      if (ped.fallenT > 0) continue;
      for (const car of allCars()) {
        if (Math.abs(car.speed) < 3.5) continue;
        if (dist2d(ped.mesh.position.x, ped.mesh.position.z, car.mesh.position.x, car.mesh.position.z) < 1.8) {
          peds.knockDown(ped);
          if (car === player.car) { reportCrime(CRIMES.hitPed); hud.damagePulse(); audio.crash(0.5); }
          break;
        }
      }
      // walking into the player's car path is handled above; on-foot player collision:
      if (player.mode === 'foot' && dist2d(ped.mesh.position.x, ped.mesh.position.z, player.pos.x, player.pos.z) < 0.8) {
        ped.mesh.position.x += (ped.mesh.position.x - player.pos.x) * 0.2 + 0.15;
        ped.mesh.position.z += (ped.mesh.position.z - player.pos.z) * 0.2;
      }
    }

    // --- combat + missions
    combat.update(dt, { playerPos: player.pos, playerInCar: player.mode === 'car', onPlayerHit, onEnemyShot: () => audio.enemyShot() });
    runner.update(dt, { playerPos: player.pos, currentCar: player.car, wanted: state.stars });

    // gun grant: Mara arms Jett from the second job onward
    if (!state.hasGun && runner.index >= 1) {
      state.hasGun = true; state.ammo = 42; state.gunGranted = true;
      hud.toast('Mara left a pistol under the seat — LMB / F to shoot');
      saveGame();
    }

    // --- queued one-shot inputs
    if (actionQueued) { actionQueued = false; handleAction(); }
    if (attackQueued) { attackQueued = false; handleAttack(); }

    // --- pickups
    for (let i = pickups.length - 1; i >= 0; i--) {
      const pk = pickups[i];
      pk.mesh.rotation.y += dt * 2.4;
      pk.mesh.position.y = 0.5 + Math.sin(state.time * 3 + i) * 0.08;
      if (player.mode === 'foot' && dist2d(player.pos.x, player.pos.z, pk.mesh.position.x, pk.mesh.position.z) < 1.5) {
        state.ammo += 12;
        hud.toast('+12 pistol rounds');
        audio.pickup();
        scene.remove(pk.mesh);
        pickups.splice(i, 1);
      }
    }

    // --- HUD
    hud.setCash(state.cash);
    hud.setHealth(player.health / 100);
    hud.setWanted(state.stars);
    if (player.mode === 'car') {
      hud.setInfo(`VEHICLE INTEGRITY ${Math.max(0, Math.round(player.car.health))}%`);
      hud.setSpeed(player.car.speed * 2.24);
      hud.setCrosshair(false);
    } else {
      hud.setInfo(state.hasGun ? `PISTOL · ${state.ammo} ROUNDS` : '');
      hud.setSpeed(null);
      hud.setCrosshair(state.hasGun);
    }
    const marker = runner.marker();
    if (runner.active && marker) {
      hud.setObjective(`${runner.mission.title} — ${runner.objectiveText()}`, dist2d(player.pos.x, player.pos.z, marker.x, marker.z));
      beam.visible = true;
      beam.position.x = marker.x; beam.position.z = marker.z;
      beam.material.opacity = 0.26 + Math.sin(state.time * 3.2) * 0.09;
    } else {
      hud.setObjective(runner.done ? 'Free roam — the city is yours' : '', null);
      beam.visible = false;
    }
    const nearCar = player.mode === 'foot' ? player.findNearbyCar(allCars()) : null;
    if (nearCar) hud.setPrompt(nearCar.driver === 'traffic' || nearCar.driver === 'parked' || nearCar.driver === 'mission' ? '<b>E</b>Steal / enter car' : '<b>E</b>Enter car');
    else if (player.mode === 'car' && Math.abs(player.car.speed) < 2.2) hud.setPrompt('<b>E</b>Exit car');
    else hud.setPrompt(null);
    hud.drawMinimap({ city, playerPos: player.pos, playerHeading: player.mode === 'car' ? player.car.heading : player.heading, cops: police.units, mission: marker, inCar: player.mode === 'car' });
    hud.update(dt);
  } else if (state.mode === 'menu') {
    // slow menu orbit over the bay
    const t = now * 0.00005;
    camera.position.set(Math.sin(t) * 260, 120, Math.cos(t) * 260 + 60);
    camera.lookAt(0, 10, 40);
    city.update(dt);
    traffic.update(dt, { ...world, onHonk: null }, null);
    peds.update(dt, now / 1000);
  }

  // sun shadow follows the action
  const focus = state.mode === 'menu' ? { x: 0, z: 40 } : player.pos;
  sun.position.set(focus.x - 260, 300, focus.z + 170);
  sun.target.position.set(focus.x, 0, focus.z);

  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
