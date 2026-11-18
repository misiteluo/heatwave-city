// HEATWAVE CITY — the story: five jobs for fixer Mara Voss, played by Jett.
// Each mission is a list of stages (goto / steal / deliver / fight / hold /
// escape) with a gold beacon in the world, a gold dot on the minimap and an
// objective line on the HUD. Completing one unlocks the next and banks cash.

import { THREE, clamp, dist2d, rr } from './config.js';
import { LANDMARKS } from './city.js';
import { createCar } from './vehicles.js';
import { spawnEnemy } from './combat.js';
import { addCrime } from './police.js';
import { glowTexture } from './textures.js';

export const MISSIONS = [
  { title: 'First Wheels', reward: 300, intro: 'Mara Voss: "Jett, lift the gold coupe by the Palms Hotel and bring it to my garage. Quietly."' },
  { title: 'Hot Package', reward: 450, intro: 'Mara Voss: "Pick up a package at the dock warehouse. Drop it at the Palms Hotel. Expect company."' },
  { title: 'Beach Debt', reward: 600, intro: 'Mara Voss: "A crew on Coral Beach owes me. Collect — then bring me their car."' },
  { title: 'Heat Run', reward: 800, intro: 'Mara Voss: "Grab the cash drop at Heatwave Bank and lose the heat. Reach the safehouse."' },
  { title: 'The Big Score', reward: 1500, intro: 'Mara Voss: "One last job. Hold the bank plaza while we crack the vault, then run for the marina."' },
];

export function initMissions(G) {
  G.mission = { index: -1, stage: 0, active: false, markedCar: null, holdT: 0, waveT: 0, delay: 0, fightSet: [] };
  G.objective = null;
  // Gold beacon: a translucent pillar + ground ring + glow sprite.
  const geo = new THREE.CylinderGeometry(1.5, 1.5, 70, 12, 1, true);
  const m = new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
  G.beacon = new THREE.Mesh(geo, m); G.beacon.position.y = 35; G.beacon.visible = false; G.scene.add(G.beacon);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3, 24), new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15; G.beaconRing = ring; ring.visible = false; G.scene.add(ring);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc93c, transparent: true, opacity: 0.75, depthWrite: false }));
  spr.scale.set(9, 9, 1); spr.position.y = 3; G.beaconGlow = spr; spr.visible = false; G.scene.add(spr);
}

function setBeacon(G, x, z) {
  for (const o of [G.beacon, G.beaconRing, G.beaconGlow]) { o.visible = true; o.position.x = x; o.position.z = z; }
  G.beacon.position.y = 35; G.beaconRing.position.y = 0.15; G.beaconGlow.position.y = 3;
}
function hideBeacon(G) { G.beacon.visible = G.beaconRing.visible = G.beaconGlow.visible = false; }

function markCar(G, car) {
  car.marked = true;
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.1, 24), new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12;
  car.mesh.add(ring); car.ring = ring;
  G.mission.markedCar = car;
}

function stageDef(G) {
  const L = LANDMARKS, m = G.mission;
  const table = [
    [ // M1
      { type: 'steal', text: 'Steal the gold coupe', at: { x: 140, z: 20 } },
      { type: 'deliver', text: "Deliver the coupe to Mara's garage", at: L.garage, needMarked: true },
    ],
    [ // M2
      { type: 'goto', text: 'Pick up the package at the warehouse', at: L.warehouse, r: 11 },
      { type: 'deliver', text: 'Drop the package at the Palms Hotel', at: L.hotel },
    ],
    [ // M3
      { type: 'fight', text: 'Collect the debt on Coral Beach', at: L.beach, count: 3 },
      { type: 'deliver', text: "Take the crew's car to Mara's garage", at: L.garage, needMarked: true },
    ],
    [ // M4
      { type: 'goto', text: 'Grab the cash drop at Heatwave Bank', at: L.bank, r: 11 },
      { type: 'escape', text: 'Lose the heat — reach the safehouse', at: L.safehouse, r: 11 },
    ],
    [ // M5
      { type: 'goto', text: 'Get to Heatwave Bank', at: L.bank, r: 12 },
      { type: 'hold', text: 'Hold the bank plaza', at: L.bank, r: 14, sec: 40 },
      { type: 'escape', text: 'Run for the marina dock', at: L.dock, r: 12 },
    ],
  ];
  return table[m.index]?.[m.stage] || null;
}

export function startMission(G, index) {
  const m = G.mission;
  m.index = index; m.stage = 0; m.active = true; m.markedCar = null; m.fightSet = [];
  const def = MISSIONS[index];
  G.hud.toast(`${def.title} — ${def.intro}`, 6);
  G.audio.sting();
  setupStage(G);
}

function setupStage(G) {
  const m = G.mission, def = stageDef(G);
  if (!def) return;
  m.holdT = 0; m.waveT = 4;
  if (m.index === 0 && m.stage === 0) {
    const car = createCar(G.scene, 140, 20, Math.PI / 2, { kind: 'parked', color: 0xffc93c });
    car.parked = true; G.cars.push(car); G.parkedCars.push(car);
    markCar(G, car);
  }
  if (m.index === 2 && m.stage === 0) {
    m.fightSet = [];
    for (let i = 0; i < def.count; i++) {
      const e = spawnEnemy(G, def.at.x + rr(-9, 9), def.at.z + rr(-7, 7));
      m.fightSet.push(e);
    }
    const car = createCar(G.scene, -38, 283, Math.PI / 2, { kind: 'parked', color: 0x8d0801 });
    car.parked = true; G.cars.push(car); G.parkedCars.push(car);
    markCar(G, car);
  }
  if (m.index === 4 && m.stage === 1) { m.holdT = def.sec; }
}

function advance(G) {
  const m = G.mission;
  m.stage++;
  if (!stageDef(G)) completeMission(G);
  else { setupStage(G); G.audio.sting(); }
}

function completeMission(G) {
  const m = G.mission, def = MISSIONS[m.index];
  m.active = false;
  G.wanted.floor = 0;
  G.cash += def.reward;
  G.audio.reward(def.reward);
  G.hud.toast(`Mission complete — +$${def.reward}`, 4.5);
  if (m.index === 1 && !G.pistol) {
    G.pistol = true;
    G.hud.toast('Mara left you a pistol — press 2 to draw it', 5);
  }
  G.missionIndex = m.index + 1;
  if (m.index >= MISSIONS.length - 1) {
    G.storyDone = true;
    G.hud.toast('Story complete — Heatwave City is yours. Free roam!', 6);
  } else {
    m.delay = 3; // next mission starts shortly
  }
  hideBeacon(G);
  G.objective = null;
  G.saveGame();
}

export function updateMissions(G, dt) {
  const m = G.mission;
  if (!m.active) {
    if (m.delay > 0) { m.delay -= dt; if (m.delay <= 0 && G.missionIndex < MISSIONS.length) startMission(G, G.missionIndex); }
    return;
  }
  const def = stageDef(G);
  if (!def) return;
  // Objective + beacon follow the stage target (the marked car can move).
  let tx = def.at.x, tz = def.at.z;
  if (def.type === 'steal' && m.markedCar) { tx = m.markedCar.x; tz = m.markedCar.z; }
  if (def.type === 'deliver' && def.needMarked && G.mode === 'car' && G.playerCar === m.markedCar) { tx = def.at.x; tz = def.at.z; }
  let text = def.text;
  if (def.type === 'hold') text = `${def.text} — ${Math.ceil(m.holdT)}s`;
  G.objective = { text, x: tx, z: tz };
  setBeacon(G, tx, tz);

  const d = dist2d(G.playerPos.x, G.playerPos.z, def.at.x, def.at.z);
  switch (def.type) {
    case 'goto':
      if (d < (def.r || 10)) {
        if (G.mission.index === 1) { addCrime(G, 200, G.playerPos.x, G.playerPos.z); G.hud.toast('Package on board — you have heat!', 3.5); }
        if (G.mission.index === 3) { G.wanted.floor = 400; addCrime(G, 400, G.playerPos.x, G.playerPos.z); G.hud.toast('Four stars — run!', 3.5); }
        if (G.mission.index === 4 && G.mission.stage === 0) G.hud.toast('The vault team is in — hold the plaza!', 3.5);
        advance(G);
      }
      break;
    case 'steal':
      break; // completed by the 'stoleMarked' event in enterCar
    case 'deliver':
      G.missionPrompt = (d < 11 && def.needMarked && !(G.mode === 'car' && G.playerCar === m.markedCar)) ? 'You need the marked car' : '';
      if (d < 11 && !G.missionPrompt) advance(G);
      break;
    case 'fight':
      if (m.fightSet.every((e) => e.dead)) { G.hud.toast("Debt collected — now take their car", 3.5); advance(G); }
      break;
    case 'hold': {
      if (d < def.r) {
        m.holdT -= dt;
        m.waveT -= dt;
        if (m.waveT <= 0) {
          m.waveT = 11;
          spawnEnemy(G, def.at.x + rr(-26, 26), def.at.z + rr(-26, 26));
          spawnEnemy(G, def.at.x + rr(-26, 26), def.at.z + rr(-26, 26));
          G.hud.toast('More of them — hold on!', 2.5);
        }
        if (m.holdT <= 0) { addCrime(G, 300, G.playerPos.x, G.playerPos.z); advance(G); }
      }
      break;
    }
    case 'escape':
      if (d < (def.r || 11)) advance(G);
      break;
  }
}

// Events coming from player/combat via G.events.
export function handleMissionEvent(G, ev) {
  const m = G.mission;
  if (!m.active) return;
  const def = stageDef(G);
  if (ev.type === 'stoleMarked' && def?.type === 'steal') advance(G);
  else if (ev.type === 'stoleMarked' && def?.type === 'deliver' && def.needMarked) { /* just got in the car; deliver check runs per-frame */ }
}

// Display-only objective for staged screenshots.
export function setShotObjective(G, text, x, z) {
  G.objective = { text, x, z };
  setBeacon(G, x, z);
}
