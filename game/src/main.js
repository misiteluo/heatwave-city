// main.js — Heatwave City's glue for the Dex Marlowe campaign.
// Builds the world (city, traffic, pedestrians, police, combat,
// missions), owns input, the camera, carjacking, helicopter
// boarding, boat handling and yacht boarding, the crime
// bookkeeping, the six-station radio and the game-state screens,
// then runs the loop. Dex's twenty jobs live in missions.js; this
// file makes the city breathe around them — feeding the day-night
// cycle into the vehicles' headlight cones, the weather into the
// radio's rain hiss, and the player's deeds into the stats,
// achievements and the garage.
//
// Round 7 systems that live here: the intro sweep and the finale
// outro, hit-stop and slow-mo, nitro with its FOV kick, the
// witness-call hook from filming pedestrians, bribes, the garage
// (store up to three cars at Rosa's, take them back out), and the
// Gull Island safehouse interior — door, locker, bed.

import { City } from './city.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Combat, Enemy } from './combat.js';
import { Car, Helicopter, Boat, Yacht, vehicleFx, updateVehicleFx } from './vehicles.js';
import { Hud } from './hud.js';
import { AudioBand } from './audio.js';
import { Missions } from './missions.js';
import { loadSave, writeSave, clearSave, defaultSave } from './save.js';
import { setupShot, isShotMode } from './shots.js';
import { PLAYER_START, blockCentre, clamp, dist2d, angleDelta } from './config.js';

const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') || '11', 10) || 11;
const shotName = isShotMode(params);

const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.domElement.classList.add('webgl');
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 3400);
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
let lastSaveT = 0;

const world = {
  scene, hud, audio,
  city: null, player: null, traffic: null, peds: null, police: null,
  combat: null, missions: null, yacht: null,
  enemies: [],
  looseCars: [],
  helicopters: [],
  boats: [],
  playerCar: null,
  playerHeli: null,
  playerBoat: null,
  enemyClass: { Enemy },
  state: 'title',
  time: 0,
  shake: 0,
  hitStop: 0,
  slowmoT: 0,
  shotCrimeCd: 0,
  pedCrimeCd: 0,
  crashCrimeCd: 0,
  witnessCd: 0,
  bribeCd: 0,
  insideSafehouse: false,
  cash: save.cash,
  saveData: save,
};

world.city = new City(scene, seed);
world.player = new Player(scene, PLAYER_START.x, PLAYER_START.z);
world.traffic = new Traffic(scene, world.city, seed);
world.peds = new Pedestrians(scene, seed);
world.police = new Police(scene, world.city);
world.combat = new Combat(scene);
world.combat.spawnPickupRing();

// The Meridian Star, Crane's accountant's yacht, at anchor.
world.yacht = new Yacht(scene, 430, 392, -0.9);
world.city.addDeckZone(world.yacht, world.yacht.deckY);

world.missions = new Missions(world);
world.missions.index = save.mission || 0;

// The flyable helicopter, parked on the marina helipad.
const marinaHeli = new Helicopter(scene, 0xff7b00, blockCentre(12), blockCentre(6), -Math.PI / 2);
world.helicopters.push(marinaHeli);

// Four moored boats the player can take: marina, east pier,
// Gull Island's west dock, Gullwing Field's dock.
world.boats.push(new Boat(scene, 0x3ec1d3, 224, 350, Math.PI / 2));
world.boats.push(new Boat(scene, 0xff5964, 424, 30, -Math.PI / 2));
world.boats.push(new Boat(scene, 0xffd23f, -74, 470, Math.PI / 2));
world.boats.push(new Boat(scene, 0x9bf00b, -322, 470, Math.PI / 2));

world.targetCars = () => world.traffic.allCars().concat(world.police.cars, world.police.blocks, world.looseCars);
world.makeCar = (type, color, x, z, heading, opts) => {
  const car = new Car(scene, type, color, x, z, heading, opts);
  world.looseCars.push(car);
  return car;
};

world.addCash = (n) => {
  world.cash += n;
  if (n > 0) save.earnings = (save.earnings || 0) + n;
  save.cash = world.cash;
  hud.setCash(world.cash);
};
world.saveProgress = () => {
  save.cash = world.cash;
  save.mission = world.missions.index;
  save.completed = world.missions.index;
  save.started = true;
  save.weapons = {
    smg: world.combat.unlocked.smg,
    shotgun: world.combat.unlocked.shotgun,
    carbine: world.combat.unlocked.carbine,
    rpg: world.combat.unlocked.rpg,
    grenade: world.combat.unlocked.grenade,
  };
  save.ammo = { ...world.combat.ammo };
  save.ownedCars = (save.ownedCars || []).slice(-3);
  save.muted = audio.muted;
  save.playSeconds = (save.playSeconds || 0) + Math.max(0, Math.round(world.time - lastSaveT));
  lastSaveT = world.time;
  writeSave(save);
};
world.onBriefcase = (id) => {
  if (!save.briefcases.includes(id)) {
    save.briefcases.push(id);
    world.saveProgress();
    checkAchievements();
  }
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
// A pedestrian filmed a crime and finished dialling.
world.onWitnessCall = (x, z) => {
  if (world.witnessCd > 0 || world.state !== 'playing') return;
  world.witnessCd = 18;
  if (world.police.wanted < 5 && (world.missions.active || world.police.wanted > 0 || Math.random() < 0.75)) {
    world.police.addWanted(1);
    hud.toast('A witness called it in — +1 star');
  }
};
world.onEnemyDown = (enemy) => {
  save.kills++;
  world.addCash(20);
  const roll = Math.random();
  if (roll < 0.26) world.combat.dropPickup('pistol', enemy.x, enemy.z, 10);
  else if (roll < 0.38) world.combat.dropPickup('smg', enemy.x, enemy.z, 24);
  else if (roll < 0.45) world.combat.dropPickup('shotgun', enemy.x, enemy.z, 5);
  else if (roll < 0.51) world.combat.dropPickup('carbine', enemy.x, enemy.z, 12);
  else if (roll < 0.55) world.combat.dropPickup('grenade', enemy.x, enemy.z, 2);
  else if (roll < 0.63) world.combat.dropPickup('health', enemy.x, enemy.z, 34);
  checkAchievements();
};
world.onCarDestroyed = (car) => {
  world.combat.explosion(car.x, car.z, world);
};
// Climb from the boat onto the yacht's deck (missions call this).
world.boardYacht = () => {
  const yacht = world.yacht;
  if (!yacht || !world.playerBoat) return;
  const boat = world.playerBoat;
  boat.occupied = false;
  boat.speed = 0;
  world.playerBoat = null;
  audio.boat(0, false);
  // The ladder hangs in the water off the port quarter; Dex comes
  // over the rail and lands ON the deck, just inside it.
  const spot = yacht.deckSpot(-2.0, -6);
  world.player.x = spot.x;
  world.player.z = spot.z;
  world.player.heading = yacht.heading + Math.PI;
  world.player.mesh.visible = true;
  hud.toast('Aboard the Meridian Star — quiet feet, loud intentions');
  audio.sting();
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
      world.peds.spawnRunner(car.x + 2, car.z + 1, car.x, car.z);
      const witnessed = world.police.cars.length > 0 || world.peds.countNear(car.x, car.z, 24) > 0;
      if (witnessed && world.police.wanted < 5) {
        world.police.addWanted(1);
        hud.toast('Carjacked in front of witnesses — +1 star');
      } else hud.toast('Carjacked — the driver bails and runs');
      audio.punch();
    } else hud.toast('You are driving — Space handbrake, Shift nitro, R radio');
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

function enterBoat(boat) {
  boat.occupied = true;
  world.playerBoat = boat;
  world.player.mesh.visible = false;
  world.player.x = boat.x; world.player.z = boat.z;
  hud.toast('Cast off — W/S throttle, A/D rudder. Mind the shoreline');
  audio.ensure();
}

function exitBoat() {
  const boat = world.playerBoat;
  if (!boat) return;
  boat.occupied = false;
  boat.speed = 0;
  world.playerBoat = null;
  // Step ashore: first dry spot in a ring around the boat wins —
  // and if the yacht is alongside, her deck counts as ashore.
  let placed = false;
  for (let i = 0; i < 8 && !placed; i++) {
    const a = (i / 8) * Math.PI * 2;
    const nx = boat.x + Math.sin(a) * 3.6, nz = boat.z + Math.cos(a) * 3.6;
    if (world.city.isLand(nx, nz)) {
      world.player.x = nx; world.player.z = nz;
      placed = true;
    }
  }
  if (!placed) { world.player.x = boat.x; world.player.z = boat.z; }
  world.player.mesh.visible = true;
  audio.boat(0, false);
}

function respawn(x, z) {
  if (world.playerCar) exitCar();
  if (world.playerBoat) exitBoat();
  if (world.playerHeli) { world.playerHeli.occupied = false; world.playerHeli = null; audio.rotor(false); }
  world.insideSafehouse = false;
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
    'Detective Brandt finally boxed Dex in. Fine paid: $' + fine + '. Sable is not impressed.';
  document.getElementById('busted').classList.remove('hidden');
  audio.busted(); audio.siren(false); audio.engine(0, false); audio.rotor(false); audio.boat(0, false);
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
    'Dex wakes up at Heatwave General with a headache and a bill: $' + bill + '.';
  document.getElementById('wasted').classList.remove('hidden');
  audio.siren(false); audio.engine(0, false); audio.rotor(false); audio.boat(0, false);
  world.missions.onPlayerDown();
  world.saveProgress();
}

// ------------------------------------------------------------ achievements
const ACHIEVEMENTS = [
  ['first-grand', 'First Grand — hold $1,000', () => world.cash >= 1000],
  ['high-roller', 'High Roller — hold $10,000', () => world.cash >= 10000],
  ['warm-up', 'Warm-Up — 25 kills', () => save.kills >= 25],
  ['cleaner', 'The Cleaner — 100 kills', () => save.kills >= 100],
  ['curious', 'Curious — 10 briefcases', () => save.briefcases.length >= 10],
  ['collector', 'Collector — all 20 briefcases', () => save.briefcases.length >= 20],
  ['most-wanted', 'Most Wanted — reach five stars', () => world.police.wanted >= 5],
  ['road-trip', 'Road Trip — 10 km travelled', () => (save.distance || 0) >= 10000],
  ['halfway', 'Halfway Up — 10 jobs done', () => world.missions.index >= 10],
  ['empire', 'Empire — all 20 jobs done', () => world.missions.index >= 20],
];
function checkAchievements() {
  if (!Array.isArray(save.achievements)) save.achievements = [];
  for (const [id, label, test] of ACHIEVEMENTS) {
    if (!save.achievements.includes(id) && test()) {
      save.achievements.push(id);
      hud.toast('Achievement — ' + label);
      audio.chime();
      world.saveProgress();
    }
  }
}

// ------------------------------------------------------------ garage & safehouse
function inGarage(x, z) {
  const g = world.city.garageZone;
  return g && x > g.x0 && x < g.x1 && z > g.z0 && z < g.z1;
}
function storeCurrentCar() {
  const car = world.playerCar;
  if (!car) return;
  if (!Array.isArray(save.ownedCars)) save.ownedCars = [];
  save.ownedCars.push({ type: car.type, color: car.colorHex });
  if (save.ownedCars.length > 3) save.ownedCars.shift();
  // The car leaves the world; Dex steps out where it stood.
  car.occupied = false;
  world.playerCar = null;
  world.player.x = car.x - Math.cos(car.heading) * 2.6;
  world.player.z = car.z + Math.sin(car.heading) * 2.6;
  world.player.mesh.visible = true;
  car.remove(scene);
  const li = world.looseCars.indexOf(car);
  if (li >= 0) world.looseCars.splice(li, 1);
  world.traffic.takeParked(car);
  world.traffic.takeMoving(car);
  audio.engine(0, false);
  radioOff();
  hud.toast('Stored in Rosa\'s garage — ' + save.ownedCars.length + '/3 cars kept');
  world.saveProgress();
}
function takeGarageCar() {
  const owned = save.ownedCars || [];
  if (!owned.length) return;
  const spec = owned.pop();
  const g = world.city.garageZone;
  const car = world.makeCar(spec.type, spec.color, (g.x0 + g.x1) / 2, (g.z0 + g.z1) / 2 + 4, 0);
  world.enterCar(car, true);
  hud.toast('Your ' + spec.type.toUpperCase() + ' — Rosa kept her polished');
  world.saveProgress();
}
function enterSafehouse() {
  world.insideSafehouse = true;
  world.player.x = world.city.interiorSpawn.x;
  world.player.z = world.city.interiorSpawn.z;
  world.player.heading = Math.PI;
  hud.toast('Gull Island safehouse — the locker sells ammo and armor, the bed heals');
  audio.ensure();
}
function leaveSafehouse() {
  world.insideSafehouse = false;
  world.player.x = world.city.safehouseDoor.x + 2;
  world.player.z = world.city.safehouseDoor.z - 3;
  hud.toast('Back outside — the bay is yours');
}
function buyAtLocker(kind) {
  if (kind === 'ammo') {
    if (world.cash < 200) { hud.toast('Ammo pack is $200 — you\'re short'); return; }
    world.addCash(-200);
    world.combat.ammo.pistol += 24;
    world.combat.ammo.smg += 30;
    world.combat.ammo.shotgun += 6;
    world.combat.ammo.carbine += 20;
    world.combat.ammo.rpg += 1;
    world.combat.ammo.grenade += 2;
    hud.toast('Ammo pack bought — locker restocked');
  } else {
    if (world.cash < 250) { hud.toast('Body armor is $250 — you\'re short'); return; }
    world.addCash(-250);
    world.player.armor = 100;
    hud.setArmor(100);
    hud.toast('Fresh armor — 100 points of second chances');
  }
  audio.pickup();
  hud.setWeapon(world.combat);
  world.saveProgress();
}
function tryBribe() {
  if (world.bribeCd > 0) return;
  if (world.police.wanted <= 0) { hud.toast('No heat to buy off'); return; }
  for (const car of world.police.cars) {
    if (!car.dead && dist2d(car.x, car.z, world.player.x, world.player.z) < 15) {
      hud.toast('Too hot — they\'re right on you. Lose them first');
      return;
    }
  }
  if (world.cash < 300) { hud.toast('A star costs $300 in quiet money'); return; }
  world.addCash(-300);
  world.police.setWanted(world.police.wanted - 1);
  world.bribeCd = 15;
  hud.toast('Bribe paid — one star quietly forgotten');
  audio.pickup();
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
  } else if (radioStation >= audio.stationCount() - 1) {
    radioOff();
    hud.toast('Radio off');
    return;
  } else {
    radioStation = audio.radio(true, radioStation + 1);
  }
  if (radioStation >= 0) hud.setRadio(audio.radioStationName(radioStation));
}

// ---------------------------------------------------------------- cinematics
let introT = -1, outroT = -1, outroDone = false;
function startIntro() {
  world.state = 'intro';
  introT = 0;
  hud.showDay('HEATWAVE CITY', 'Dex Marlowe arrives with nothing but a name');
  hud.setDialogue('Sable Quinn', 'Dex Marlowe. Heard you can drive. Welcome to my city — try not to die in it before lunch.');
}
function endIntro() {
  if (world.state !== 'intro') return;
  introT = -1;
  world.state = 'playing';
  hud.clearDialogue();
  if (!world.missions.done && !world.missions.active) world.missions.startNext();
  hud.toast('Welcome to Heatwave City, Dex');
}
function startOutro() {
  outroDone = true;
  world.state = 'outro';
  outroT = 0;
  hud.showDay('HEATWAVE CITY', 'An empire, built in five days');
  hud.setDialogue('Sable Quinn', 'Casino, hotel, club, the sky itself. Whatever you do next, Dex — do it like you own it. You do.');
}
function endOutro() {
  if (world.state !== 'outro') return;
  outroT = -1;
  world.state = 'playing';
  hud.clearDialogue();
  hud.setObjective('Free roam — Heatwave City is yours. Side work still pays.');
}

// ---------------------------------------------------------------- input
const keys = {};
let camYaw = Math.PI, camPitch = 0.32;
let dragging = false, dragMoved = 0, lastMX = 0, lastMY = 0;
let mouseDownAt = 0, firing = false;

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (world.state === 'intro') { endIntro(); return; }
  if (world.state === 'outro') { endOutro(); return; }
  if (world.state === 'playing') {
    if (e.code === 'KeyE') toggleVehicle();
    if (e.code === 'KeyF') firing = true;
    if (e.code === 'KeyM') {
      audio.ensure(); audio.setMuted(!audio.muted);
      save.muted = audio.muted; world.saveProgress();
      hud.toast(audio.muted ? 'Muted' : 'Sound on');
    }
    if (e.code === 'KeyQ') { world.combat.cycle(1); hud.setWeapon(world.combat); }
    if (e.code === 'Digit1') { world.combat.select('fist'); hud.setWeapon(world.combat); }
    if (e.code === 'Digit2') { world.combat.select('pistol'); hud.setWeapon(world.combat); }
    if (e.code === 'Digit3') { if (world.combat.select('smg')) hud.setWeapon(world.combat); }
    if (e.code === 'Digit4') { if (world.combat.select('shotgun')) hud.setWeapon(world.combat); }
    if (e.code === 'Digit5') { if (world.combat.select('carbine')) hud.setWeapon(world.combat); }
    if (e.code === 'Digit6') { if (world.combat.select('rpg')) hud.setWeapon(world.combat); }
    if (e.code === 'Digit7') { if (world.combat.select('grenade')) hud.setWeapon(world.combat); }
    if (e.code === 'KeyR' && world.playerCar) cycleRadio();
    if (e.code === 'KeyR' && !world.playerCar && world.insideSafehouse
      && dist2d(world.player.x, world.player.z, world.city.lockerPos.x, world.city.lockerPos.z) < 3.2) buyAtLocker('armor');
    if (e.code === 'KeyB' && !world.playerCar && !world.playerHeli && !world.playerBoat) tryBribe();
    if (e.code === 'KeyC' && world.playerCar && inGarage(world.playerCar.x, world.playerCar.z)) {
      const car = world.playerCar;
      if (car.health < car.maxHealth - 1) {
        if (world.cash >= 120) {
          world.addCash(-120);
          car.health = car.maxHealth;
          car.dead = false;
          hud.toast('Rosa\'s crew patched her up — $120');
          audio.pickup();
          world.saveProgress();
        } else hud.toast('Repairs are $120 — you\'re short');
      } else storeCurrentCar();
    }
    if (e.code === 'Enter') {
      if (world.missions.failed) world.missions.retry();
      else if (!world.missions.active && !world.missions.act && !world.missions.done) world.missions.startNext();
    }
    if (e.code === 'KeyP' || e.code === 'Escape') pauseGame();
  } else if (world.state === 'paused' && (e.code === 'KeyP' || e.code === 'Escape')) resumeGame();
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'KeyF') { firing = false; world.combat.releaseTrigger(); }
});
window.addEventListener('wheel', (e) => {
  if (world.state === 'playing' && !world.playerCar && !world.playerHeli && !world.playerBoat) {
    world.combat.cycle(e.deltaY > 0 ? 1 : -1);
    hud.setWeapon(world.combat);
  }
}, { passive: true });

renderer.domElement.addEventListener('mousedown', (e) => {
  dragging = true; dragMoved = 0; lastMX = e.clientX; lastMY = e.clientY;
  mouseDownAt = performance.now();
  audio.ensure();
  if (world.state === 'intro') endIntro();
  else if (world.state === 'outro') endOutro();
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
  // A clean click (no drag) is a trigger pull; a drag just orbits.
  if (dragging && dragMoved < 6 && performance.now() - mouseDownAt < 400
    && world.state === 'playing' && !world.playerCar && !world.playerHeli && !world.playerBoat) {
    firing = true;
    setTimeout(() => { firing = false; world.combat.releaseTrigger(); }, 90);
  }
  dragging = false;
});

function toggleVehicle() {
  if (world.playerHeli) { exitHeli(); return; }
  if (world.playerBoat) { exitBoat(); return; }
  if (world.playerCar) { exitCar(); return; }
  // Safehouse interior: door, locker, bed.
  if (world.insideSafehouse) {
    const p = world.player;
    if (dist2d(p.x, p.z, world.city.interiorExit.x, world.city.interiorExit.z) < 3) { leaveSafehouse(); return; }
    if (dist2d(p.x, p.z, world.city.lockerPos.x, world.city.lockerPos.z) < 3.2) { buyAtLocker('ammo'); return; }
    if (dist2d(p.x, p.z, world.city.bedPos.x, world.city.bedPos.z) < 3.2) {
      world.player.health = 100;
      hud.setHealth(100);
      hud.toast('You sleep like the city owes you. It does. (Healed)');
      world.saveProgress();
      return;
    }
    return;
  }
  // The safehouse door on Gull Island.
  if (dist2d(world.player.x, world.player.z, world.city.safehouseDoor.x, world.city.safehouseDoor.z) < 3.6) {
    enterSafehouse();
    return;
  }
  // Rosa's garage: take a stored car back out.
  if (inGarage(world.player.x, world.player.z) && (save.ownedCars || []).length) {
    takeGarageCar();
    return;
  }
  // Helicopter first if one is close and landed.
  for (const heli of world.helicopters) {
    if (heli.landed && dist2d(world.player.x, world.player.z, heli.x, heli.z) < 5.5) { enterHeli(heli); return; }
  }
  // Then a moored boat, if Dex is standing on its dock.
  for (const boat of world.boats) {
    if (!boat.dead && dist2d(world.player.x, world.player.z, boat.x, boat.z) < 5.5) { enterBoat(boat); return; }
  }
  const car = world.grabNearestCar(world.player.x, world.player.z);
  if (car && dist2d(world.player.x, world.player.z, car.x, car.z) < 4.8) world.enterCar(car);
}

function pauseGame() {
  world.state = 'paused';
  const km = ((save.distance || 0) / 1000).toFixed(1);
  document.getElementById('pausestats').textContent =
    'Cash $' + world.cash.toLocaleString('en-US') + ' · Jobs done ' + world.missions.index + '/20 · Kills ' + save.kills
    + ' · Earned $' + (save.earnings || 0).toLocaleString('en-US') + ' · Driven ' + km + ' km'
    + ' · Busts ' + save.busts + ' · Wasted ' + save.wasted
    + ' · Briefcases ' + save.briefcases.length + '/20'
    + ' · Achievements ' + (save.achievements || []).length + '/' + ACHIEVEMENTS.length;
  hud.drawBigMap(world);
  document.getElementById('pause').classList.remove('hidden');
  audio.engine(0, false);
}
function resumeGame() {
  world.state = 'playing';
  document.getElementById('pause').classList.add('hidden');
}

function startGame(fresh) {
  if (fresh) {
    clearSave();
    save = defaultSave();
    world.saveData = save;
    world.cash = save.cash;
    world.missions.index = 0;
    world.combat.unlocked = { fist: true, pistol: true, smg: false, shotgun: false, carbine: false, rpg: false, grenade: false };
    world.combat.ammo = { pistol: 48, smg: 0, shotgun: 0, carbine: 0, rpg: 0, grenade: 0 };
    respawn(PLAYER_START.x, PLAYER_START.z);
  } else {
    world.cash = save.cash;
    world.missions.index = save.mission || 0;
    world.combat.unlocked.smg = !!save.weapons.smg;
    world.combat.unlocked.shotgun = !!save.weapons.shotgun;
    world.combat.unlocked.carbine = !!save.weapons.carbine;
    world.combat.unlocked.rpg = !!save.weapons.rpg;
    world.combat.unlocked.grenade = !!save.weapons.grenade;
    world.combat.ammo = { pistol: 48, smg: 0, shotgun: 0, carbine: 0, rpg: 0, grenade: 0, ...save.ammo };
  }
  hud.setCash(world.cash);
  hud.setHealth(world.player.health);
  hud.setArmor(world.player.armor);
  hud.setWeapon(world.combat);
  document.getElementById('title').classList.add('hidden');
  audio.ensure();
  audio.setMuted(!!save.muted);
  if (fresh) {
    startIntro();
  } else {
    world.state = 'playing';
    if (!world.missions.done) world.missions.startNext();
    else hud.setObjective('Free roam — Heatwave City is yours');
    hud.toast('Welcome back to Heatwave City, Dex');
  }
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
  respawn(blockCentre(9), blockCentre(3) + 13);
  hud.setCash(world.cash);
  world.state = 'playing';
});

// ---------------------------------------------------------------- camera
let chaseYaw = 0;
let camFov = 62;
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  // Nitro stretches the world a little: FOV kicks out under boost.
  const boosting = world.playerCar && world.playerCar.boosting;
  const targetFov = boosting ? 71 : 62;
  camFov += (targetFov - camFov) * Math.min(1, dt * 5);
  if (Math.abs(camFov - camera.fov) > 0.05) {
    camera.fov = camFov;
    camera.updateProjectionMatrix();
  }
  if (world.playerHeli) {
    const h = world.playerHeli;
    chaseYaw += angleDelta(chaseYaw, h.heading) * Math.min(1, dt * 2.2);
    const bx = h.x - Math.sin(chaseYaw) * 15;
    const bz = h.z - Math.cos(chaseYaw) * 15;
    const floorY = world.city.heightAt(h.x, h.z) + h.alt;
    camera.position.lerp(camTarget.set(bx, floorY + 5.5, bz), Math.min(1, dt * 4));
    camera.lookAt(h.x + Math.sin(h.heading) * 8, floorY + 1, h.z + Math.cos(h.heading) * 8);
  } else if (world.playerCar || world.playerBoat) {
    const veh = world.playerCar || world.playerBoat;
    chaseYaw += angleDelta(chaseYaw, veh.heading) * Math.min(1, dt * 3.2);
    const bx = veh.x - Math.sin(chaseYaw) * 11.5;
    const bz = veh.z - Math.cos(chaseYaw) * 11.5;
    const by = world.playerBoat ? 3.6 : 4.6;
    camera.position.lerp(camTarget.set(bx, by, bz), Math.min(1, dt * 5));
    camera.lookAt(veh.x + Math.sin(veh.heading) * 6, 1.2, veh.z + Math.cos(veh.heading) * 6);
  } else {
    const p = world.player;
    const dist = 8;
    const cx = p.x + Math.sin(camYaw) * dist * Math.cos(camPitch);
    const cz = p.z + Math.cos(camYaw) * dist * Math.cos(camPitch);
    const cy = (world.insideSafehouse ? 0.4 : 0) + 1.6 + Math.sin(camPitch) * dist;
    camera.position.lerp(camTarget.set(cx, cy, cz), Math.min(1, dt * 10));
    camera.lookAt(p.x, (world.insideSafehouse ? 0.4 : 0) + 1.5, p.z);
  }
}

// Car-vs-car bumps for the player's vehicle.
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
let lastWanted = 0, lastHealth = 100, lastFocusX = PLAYER_START.x, lastFocusZ = PLAYER_START.z, achTimer = 0;

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
  const rawDt = Math.min(clock.getDelta(), 0.05);
  // Hit-stop and slow-mo bend the world's clock, never the camera's.
  let dt = rawDt;
  if (world.hitStop > 0) { world.hitStop -= rawDt; dt = rawDt * 0.06; }
  else if (world.slowmoT > 0) { world.slowmoT -= rawDt; dt = rawDt * 0.35; }
  world.time += dt;
  const t = world.time;
  const focus = world.playerCar || world.playerBoat || world.playerHeli || world.player;
  world.city.update(dt, t, focus);
  vehicleFx.night = world.city.nightF;
  updateVehicleFx();
  world.shotCrimeCd = Math.max(0, world.shotCrimeCd - dt);
  world.pedCrimeCd = Math.max(0, world.pedCrimeCd - dt);
  world.crashCrimeCd = Math.max(0, world.crashCrimeCd - dt);
  world.witnessCd = Math.max(0, world.witnessCd - dt);
  world.bribeCd = Math.max(0, world.bribeCd - dt);
  hud.update(rawDt);

  // Lifetime distance, from the focus point's wanderings.
  const moved = Math.hypot(focus.x - lastFocusX, focus.z - lastFocusZ);
  if (moved < 60) save.distance = (save.distance || 0) + moved;
  lastFocusX = focus.x; lastFocusZ = focus.z;

  // Wanted rising stings time; so does nearly dying.
  if (world.police.wanted > lastWanted && world.state === 'playing') world.slowmoT = Math.max(world.slowmoT, 0.55);
  lastWanted = world.police.wanted;
  if (world.player.health < 25 && lastHealth >= 25 && world.state === 'playing') world.slowmoT = Math.max(world.slowmoT, 0.8);
  lastHealth = world.player.health;

  if (world.state === 'playing' && shotName) {
    world.traffic.update(dt, world);
    world.peds.update(dt, world);
    for (const cop of world.police.cars) cop.flashLights(true, t);
    if (world.police.heli) world.police.heli.syncMesh(world.city);
    if (shotPose) {
      camera.position.set(shotPose.camX, shotPose.camY, shotPose.camZ);
      camera.lookAt(shotPose.lookX, shotPose.lookY, shotPose.lookZ);
    }
    if (shotFrames === 4) hud.drawMinimap(world);
    shotFrames++;
    if (shotFrames > 24) window.__shotReady = true;
  } else if (world.state === 'intro') {
    introT += rawDt;
    world.traffic.update(dt, world);
    world.peds.update(dt, world);
    // A slow crane shot: airport bay → marina → down to Dex.
    const k = clamp(introT / 9, 0, 1);
    const ease = k * k * (3 - 2 * k);
    const pts = [
      [-330, 95, 660], [120, 64, 470], [-120, 30, 300],
      [PLAYER_START.x + 14, 7, PLAYER_START.z + 16],
    ];
    const seg = Math.min(2, Math.floor(ease * 3));
    const f = ease * 3 - seg;
    const a = pts[seg], b = pts[seg + 1];
    camera.position.set(
      a[0] + (b[0] - a[0]) * f,
      a[1] + (b[1] - a[1]) * f,
      a[2] + (b[2] - a[2]) * f,
    );
    camera.lookAt(world.player.x, 2, world.player.z);
    if (introT > 9.5) endIntro();
  } else if (world.state === 'outro') {
    outroT += rawDt;
    world.traffic.update(dt, world);
    world.peds.update(dt, world);
    // One last slow orbit around Crane's jet on the apron.
    const a = outroT * 0.16;
    camera.position.set(-276 + Math.sin(a) * 26, 7 + Math.sin(outroT * 0.3) * 1.5, 529 + Math.cos(a) * 26);
    camera.lookAt(-276, 3, 529);
    if (outroT > 11) endOutro();
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
      hud.setNitro(0);
    } else if (world.playerBoat) {
      const boat = world.playerBoat;
      const input = {
        throttle: (keys.KeyW || keys.ArrowUp ? 1 : 0) + (keys.KeyS || keys.ArrowDown ? -1 : 0),
        steer: (keys.KeyA || keys.ArrowLeft ? 1 : 0) + (keys.KeyD || keys.ArrowRight ? -1 : 0),
      };
      boat.drive(dt, input, world.city);
      world.player.x = boat.x; world.player.z = boat.z;
      audio.boat(clamp(Math.abs(boat.speed) / 21, 0, 1), true);
      hud.setSpeed(boat.speed * 3.6, true);
      hud.setNitro(0);
      if (boat.dead) { hud.toast('The boat is sinking — swim for it'); exitBoat(); }
    } else if (world.playerCar) {
      const car = world.playerCar;
      const input = {
        throttle: (keys.KeyW || keys.ArrowUp ? 1 : 0) + (keys.KeyS || keys.ArrowDown ? -1 : 0),
        steer: (keys.KeyA || keys.ArrowLeft ? 1 : 0) + (keys.KeyD || keys.ArrowRight ? -1 : 0),
        handbrake: !!keys.Space,
        nitro: !!(keys.ShiftLeft || keys.ShiftRight),
      };
      const beforeSpeed = car.speed;
      car.drive(dt, input, world.city);
      if (car.crashInfo && Math.abs(beforeSpeed) > 8) {
        audio.crash();
        world.shake = 0.25;
        car.crashInfo = null;
      }
      world.player.x = car.x; world.player.z = car.z;
      audio.engine(car.rpm, true);
      hud.setSpeed(car.speed * 3.6, true);
      hud.setNitro(car.nitro);
      const victim = world.peds.nearest(car.x, car.z, 2.0);
      if (victim && Math.abs(car.speed) > 5) {
        victim.flee = 3; victim.fleeX = Math.sin(car.heading); victim.fleeZ = Math.cos(car.heading);
        victim.mode = 'stroll';
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
      hud.setNitro(0);
      audio.engine(0, false);
      // Firing: aim where the camera looks, 30 units ahead of Dex.
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
    world.peds.update(dt, world);
    world.police.update(dt, world, t);
    for (const e of world.enemies) e.update(dt, world);
    world.enemies = world.enemies.filter((e) => !e.dead || e.mesh.rotation.x !== 0);
    world.combat.update(dt, world);
    world.missions.update(dt);
    hud.setStars(world.police.wanted);
    hud.setHealth(world.player.health);
    hud.setArmor(world.player.armor);
    audio.siren(world.police.wanted > 0 && !shotName);
    audio.rain(world.city.raining ? world.city.wet : 0);
    achTimer -= dt;
    if (achTimer <= 0) { achTimer = 2.5; checkAchievements(); }
    // The finale's outro plays once, when the last job lands.
    if (world.missions.done && !outroDone && !shotName) startOutro();
    promptTimer -= dt;
    if (promptTimer <= 0) {
      promptTimer = 0.12;
      if (world.playerHeli) hud.setPrompt(world.playerHeli.landed ? 'E — climb out' : 'Space climb · Shift descend');
      else if (world.playerBoat) hud.setPrompt('E — step ashore · W/S — throttle');
      else if (world.playerCar) {
        hud.setPrompt(inGarage(world.playerCar.x, world.playerCar.z)
          ? 'E — exit · C — repair $120 / store car · Shift — nitro'
          : 'E — exit · Space — handbrake · Shift — nitro · R — radio');
      } else if (world.insideSafehouse) {
        const p = world.player;
        if (dist2d(p.x, p.z, world.city.interiorExit.x, world.city.interiorExit.z) < 3) hud.setPrompt('E — step back outside');
        else if (dist2d(p.x, p.z, world.city.lockerPos.x, world.city.lockerPos.z) < 3.2) hud.setPrompt('E — ammo pack $200 · R — body armor $250');
        else if (dist2d(p.x, p.z, world.city.bedPos.x, world.city.bedPos.z) < 3.2) hud.setPrompt('E — sleep it off (heal)');
        else hud.setPrompt('');
      } else {
        let nearHeli = false;
        for (const heli of world.helicopters) {
          if (heli.landed && dist2d(world.player.x, world.player.z, heli.x, heli.z) < 5.5) nearHeli = true;
        }
        let nearBoat = false;
        for (const boat of world.boats) {
          if (!boat.dead && dist2d(world.player.x, world.player.z, boat.x, boat.z) < 5.5) nearBoat = true;
        }
        const car = world.grabNearestCar(world.player.x, world.player.z);
        if (dist2d(world.player.x, world.player.z, world.city.safehouseDoor.x, world.city.safehouseDoor.z) < 3.6) hud.setPrompt('E — enter the safehouse');
        else if (inGarage(world.player.x, world.player.z) && (save.ownedCars || []).length) hud.setPrompt('E — take your stored car');
        else if (nearHeli) hud.setPrompt('E — board the helicopter');
        else if (nearBoat) hud.setPrompt('E — take the boat');
        else if (car && dist2d(world.player.x, world.player.z, car.x, car.z) < 4.8) hud.setPrompt('E — ' + (car.occupied ? 'carjack this car' : 'enter car'));
        else if (world.missions.failed) hud.setPrompt('Enter — retry the job');
        else if (!world.missions.active && !world.missions.act && !world.missions.done) hud.setPrompt('Enter — take Sable\'s next job');
        else hud.setPrompt(world.police.wanted > 0 ? 'B — bribe a star away ($300)' : '');
      }
    }
    updateCamera(rawDt);
    if (world.shake > 0) {
      world.shake -= rawDt;
      camera.position.x += (Math.random() - 0.5) * 0.3;
      camera.position.y += (Math.random() - 0.5) * 0.3;
    }
  } else if (world.state === 'title') {
    const a = t * 0.045;
    camera.position.set(Math.sin(a) * 190, 62, Math.cos(a) * 190 + 60);
    camera.lookAt(0, 8, 60);
    world.peds.update(dt, world);
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
