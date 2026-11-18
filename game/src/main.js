// HEATWAVE CITY — boot and the main loop. Assembles the world (city, traffic,
// pedestrians, police, combat, missions, HUD), owns input, the menu / pause /
// BUSTED / WASTED flow, and the debug handles the automated playtest uses.
//
// ?seed=N fixes the city generation. ?shot=cover|foot|mission|chase stages a
// screenshot scene and raises window.__shotReady when it is composed.

import { THREE, seedRng, clamp, angleWrap, dist2d } from './config.js';
import { buildCity, LANDMARKS } from './city.js';
import { spawnTraffic, updateTraffic } from './traffic.js';
import { spawnPeds, updatePeds, buildHumanoid } from './pedestrians.js';
import { initWanted, addCrime, updateWanted, updatePolice, clearPolice } from './police.js';
import { createPlayer, nearestCar, enterCar, exitCar, updatePlayerFoot, updatePlayerCar } from './player.js';
import { initCombat, playerAttack, startReload, updateCombat } from './combat.js';
import { initMissions, startMission, updateMissions, handleMissionEvent } from './missions.js';
import { initHud, updateHud } from './hud.js';
import { initSmoke, updateSmoke, separateCars, stepCar } from './vehicles.js';
import { AudioSys } from './audio.js';
import { loadSave, storeSave, clearSave } from './save.js';
import { setupShot } from './shots.js';

const params = new URLSearchParams(location.search);
seedRng(parseInt(params.get('seed') || '7', 10) || 7);
const shotName = params.get('shot');

// --- renderer / scene ---------------------------------------------------------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd3e8);
scene.fog = new THREE.Fog(0xf6cf9e, 160, 720);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1600);
camera.position.set(-160, 70, -160);

const hemi = new THREE.HemisphereLight(0xcfe8ff, 0xffe0b3, 0.8);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe3b3, 1.25);
sun.position.set(150, 230, 90);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -310; sun.shadow.camera.right = 310;
sun.shadow.camera.top = 310; sun.shadow.camera.bottom = -310;
sun.shadow.camera.near = 20; sun.shadow.camera.far = 640;
sun.shadow.bias = -0.0009;
scene.add(sun); scene.add(sun.target);

// --- shared game state ----------------------------------------------------------
const G = {
  scene, camera, renderer, time: 0,
  keys: {}, lookDX: 0, lookDY: 0,
  cars: [], parkedCars: [], trafficCars: [], policeCars: [], peds: [],
  events: [], cash: 0, missionIndex: 0, storyDone: false,
  paused: false, over: null, prompt: '', missionPrompt: '', shake: 0,
  policeSpawnCd: 0, blockadeCd: 24, threat: null, bustedT: 0,
  mode: 'menu', playerCar: null, shotDrive: null, shotCam: null,
};
G.audio = new AudioSys();
const city = buildCity(scene);
G.colliders = city.colliders;
initWanted(G);
createPlayer(G);
initCombat(G);
initMissions(G);
spawnTraffic(G);
spawnPeds(G);
initSmoke(scene);

G.spawnEjectedDriver = (car) => {
  const h = buildHumanoid();
  scene.add(h.group);
  const ped = {
    h, x: car.x + 2, z: car.z, yaw: car.yaw, bi: 0, bj: 0, s: 0, dirSign: 1,
    speed: 1.4, phase: 0, state: 'flee', fleeT: 3, downT: 0, threatX: car.x, threatZ: car.z,
  };
  G.peds.push(ped);
};
G.saveGame = () => storeSave({ cash: G.cash, missionIndex: G.missionIndex, pistol: G.pistol, storyDone: G.storyDone });

// --- game flow -------------------------------------------------------------------
function resetRun(cash, missionIndex, pistol, storyDone) {
  G.cash = cash; G.missionIndex = missionIndex; G.pistol = pistol; G.storyDone = storyDone;
  G.weapon = 'fist'; G.ammo = { mag: 12, reserve: 48 };
  G.player.hp = 100; G.hurtT = 0;
  G.wanted.heat = 0; G.wanted.floor = 0;
  clearPolice(G);
  if (G.playerCar) { G.playerCar.kind = 'parked'; G.playerCar = null; }
  G.player.x = -246; G.player.z = -246; G.player.yaw = 0.6;
  G.player.h.group.visible = true;
  G.playerPos.x = G.player.x; G.playerPos.z = G.player.z;
  G.mission.active = false; G.mission.delay = 0;
  G.over = null;
}

function startFresh() {
  G.audio.init();
  clearSave();
  resetRun(0, 0, false, false);
  G.hud.menu.style.display = 'none';
  G.mode = 'foot';
  startMission(G, 0);
}
function startContinue() {
  G.audio.init();
  const s = loadSave();
  if (!s) { startFresh(); return; }
  resetRun(s.cash, s.mission, s.pistol, s.done);
  G.hud.menu.style.display = 'none';
  G.mode = 'foot';
  if (!s.done && s.mission < 5) startMission(G, s.mission);
  else G.hud.toast('Welcome back to Heatwave City — free roam', 3.5);
}
function doRespawn() {
  const wasBusted = G.over === 'busted';
  G.hud.hideEnd();
  G.over = null;
  G.wanted.heat = 0; G.wanted.floor = 0;
  clearPolice(G);
  if (G.playerCar) { G.playerCar.kind = 'parked'; G.playerCar.speed = 0; G.playerCar = null; }
  const at = wasBusted ? LANDMARKS.safehouse : LANDMARKS.hotel;
  G.player.x = at.x; G.player.z = at.z;
  G.player.hp = 100;
  G.player.h.group.visible = true;
  G.playerPos.x = at.x; G.playerPos.z = at.z;
  G.mode = 'foot';
  G.saveGame();
}
function doBusted() {
  G.over = 'busted';
  const fine = Math.min(G.cash, 100 + G.wanted.stars * 120);
  G.cash -= fine;
  G.audio.busted(); G.audio.engine(0, false); G.audio.siren(0);
  G.hud.showEnd('busted', `Heatwave PD got you on foot. Fine: $${fine}. You walk out of the safehouse with a clean record — and a lighter wallet.`);
  G.saveGame();
}
function doWasted() {
  G.over = 'wasted';
  const loss = Math.min(G.cash, 150);
  G.cash -= loss;
  G.audio.wasted(); G.audio.engine(0, false); G.audio.siren(0);
  G.hud.showEnd('wasted', `You wake up on a bench outside the Palms Hotel, $${loss} lighter. The city shrugs and moves on.`);
  G.saveGame();
}

const hud = initHud(G, { onNew: startFresh, onContinue: startContinue, onRespawn: doRespawn, onResume: () => { G.paused = false; hud.pause.style.display = 'none'; } });
if (!loadSave()) hud.contBtn.disabled = true;

// --- input -------------------------------------------------------------------------
addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  G.keys[e.code] = true;
  const playing = (G.mode === 'foot' || G.mode === 'car') && !G.over;
  if (!playing) return;
  if (e.code === 'KeyP' || e.code === 'Escape') {
    G.paused = !G.paused;
    hud.pause.style.display = G.paused ? 'flex' : 'none';
    return;
  }
  if (G.paused) return;
  if (e.code === 'KeyM') { G.hud.toast(G.audio.toggleMute() ? 'Muted' : 'Sound on', 1.2); return; }
  if (e.code === 'KeyE') {
    if (G.mode === 'foot') { const car = nearestCar(G); if (car) enterCar(G, car); }
    else if (G.playerCar && Math.abs(G.playerCar.speed) < 3) exitCar(G);
  }
  if (e.code === 'KeyF') playerAttack(G);
  if (e.code === 'Digit1') G.weapon = 'fist';
  if (e.code === 'Digit2' && G.pistol) G.weapon = 'pistol';
  if (e.code === 'KeyR') startReload(G);
});
addEventListener('keyup', (e) => { G.keys[e.code] = false; });
let dragging = false;
canvas.addEventListener('mousedown', (e) => {
  dragging = true;
  if ((G.mode === 'foot') && !G.paused && !G.over) playerAttack(G);
});
addEventListener('mouseup', () => { dragging = false; });
addEventListener('mousemove', (e) => {
  if (!dragging) return;
  G.lookDX += e.movementX || 0; G.lookDY += e.movementY || 0;
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// --- per-frame step ------------------------------------------------------------------
function step(dt) {
  G.time += dt;
  if (G.mode === 'foot') updatePlayerFoot(G, dt);
  else if (G.mode === 'car') {
    if (G.shotDrive && G.playerCar) { // staged driving for screenshots
      const car = G.playerCar;
      const ahead = G.shotDrive.axis === 'z' ? { x: G.shotDrive.fixed, z: car.z + 30 } : { x: car.x + 30, z: G.shotDrive.fixed };
      const desired = Math.atan2(ahead.x - car.x, ahead.z - car.z);
      const steer = clamp(angleWrap(desired - car.yaw) * 2.4, -1, 1);
      stepCar(car, { throttle: car.speed < 17 ? 0.8 : 0, steer, brake: false }, dt, G.colliders);
      G.playerPos.x = car.x; G.playerPos.z = car.z;
      G.playerVel.x = Math.sin(car.yaw) * car.speed; G.playerVel.z = Math.cos(car.yaw) * car.speed;
    } else updatePlayerCar(G, dt);
  }
  if (G.mode === 'foot') G.audio.engine(0, false);
  updateTraffic(G, dt);
  const pedEvents = updatePeds(G, dt);
  for (const ev of pedEvents) {
    if (ev.type === 'pedHit' && ev.byPlayer) addCrime(G, 170, ev.ped.x, ev.ped.z);
  }
  updateCombat(G, dt);
  updateMissions(G, dt);
  updateWanted(G, dt);
  const nearestPolice = updatePolice(G, dt);
  const bump = separateCars(G.cars);
  if (bump > 0.3 && G.playerCar && Math.abs(G.playerCar.speed) > 4) { G.audio.crash(bump * 0.8); G.shake = Math.max(G.shake, bump * 0.5); }
  updateSmoke(G.cars, dt);
  city.update(dt);
  // Context prompt.
  if (G.mode === 'foot') {
    const car = nearestCar(G);
    G.prompt = car ? (car.kind === 'traffic' ? 'E — Steal car' : 'E — Get in car') : '';
  } else if (G.mode === 'car') {
    G.prompt = G.playerCar && Math.abs(G.playerCar.speed) < 3 ? 'E — Exit car' : '';
  }
  // Drain the shared event queue into missions.
  for (const ev of G.events.splice(0)) handleMissionEvent(G, ev);
  // BUSTED: a police car pinning you on foot.
  if (G.mode === 'foot' && !G.over) {
    if (nearestPolice < 3.6 && G.wanted.stars > 0) {
      G.bustedT += dt;
      if (G.bustedT >= 3) { G.bustedT = 0; doBusted(); }
    } else G.bustedT = Math.max(0, G.bustedT - dt * 2);
  }
  if (G.player.hp <= 0 && !G.over && G.mode !== 'menu') doWasted();
  updateHud(G, dt);
}

// --- shot mode -----------------------------------------------------------------------
let shotFrames = 0;
if (shotName) {
  G.mode = 'foot';
  setupShot(G, shotName);
}

// Debug handles for the automated playtest.
window.__hw = {
  G,
  teleport(x, z) {
    if (G.mode === 'car' && G.playerCar) { G.playerCar.x = x; G.playerCar.z = z; G.playerCar.speed = 0; }
    else { G.player.x = x; G.player.z = z; }
    G.playerPos.x = x; G.playerPos.z = z;
  },
  setHeat(n) { G.wanted.heat = n; },
  givePistol() { G.pistol = true; G.weapon = 'pistol'; },
  startMission(i) { startMission(G, i); },
  press(code) { // one synthetic key tap through the real handler path
    G.keys[code] = true;
    setTimeout(() => { G.keys[code] = false; }, 120);
  },
  state() {
    return {
      mode: G.mode, over: G.over, cash: G.cash, hp: Math.round(G.player.hp),
      stars: G.wanted.stars, heat: Math.round(G.wanted.heat),
      mission: G.mission.index, stage: G.mission.stage, missionActive: G.mission.active,
      weapon: G.weapon, ammo: { ...G.ammo },
      enemiesAlive: G.enemies.filter((e) => !e.dead).length,
      police: G.policeCars.length,
      pos: { x: Math.round(G.playerPos.x), z: Math.round(G.playerPos.z) },
      saved: !!loadSave(),
    };
  },
};

// --- main loop ---------------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!G.paused && !G.over) {
    if (G.mode === 'menu') {
      // Living backdrop behind the title: traffic and crowds keep moving.
      G.time += dt;
      updateTraffic(G, dt);
      updatePeds(G, dt);
      city.update(dt);
      const t = now / 1000;
      camera.position.set(Math.sin(t * 0.045) * 165, 62, Math.cos(t * 0.045) * 165);
      camera.lookAt(0, 8, 40);
      updateHud(G, dt);
    } else if (shotName && (G.shotCam || G.shotCamFollow)) {
      step(dt);
      if (G.shotCamFollow && G.playerCar) {
        // Tracking camera: offset in the player car's local frame.
        const car = G.playerCar, { off, look } = G.shotCamFollow;
        const cy = Math.cos(car.yaw), sy = Math.sin(car.yaw);
        const rot = (v) => [car.x + v[0] * cy + v[2] * sy, v[1], car.z - v[0] * sy + v[2] * cy];
        const p = rot(off); p[1] += 0; p[1] = off[1];
        camera.position.set(p[0], off[1], p[2]);
        const l = rot(look);
        camera.lookAt(l[0], look[1], l[2]);
      } else if (G.shotCam) {
        camera.position.set(...G.shotCam.pos);
        camera.lookAt(...G.shotCam.look);
      }
    } else {
      step(dt);
    }
  }
  renderer.render(scene, camera);
  if (shotName) {
    shotFrames++;
    if (shotFrames >= 55) window.__shotReady = true;
  }
}
requestAnimationFrame(frame);
