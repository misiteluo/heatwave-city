// missions.js — the sixteen-job story of Dex Marlowe, a getaway driver
// who washes up in Heatwave City with a torched past, and Sable Quinn,
// the fixer who turns his wheel into a living. Victor Crane's casino
// empire is the rot under the neon; across four days Dex steals, tails,
// races, shoots and sails his way up the ladder — and takes the city.
//
// A mission is a list of stage specs. Spec kinds: goto, getcar,
// deliver, timed, tail, race, holdout, fight, convoy, survive, pickup.
// The runner owns dialogue, markers, timers, fail states and retry.
// The same file runs the repeatable side work: street races, taxi
// fares, package runs, gang hideouts and cash briefcases.

import { blockCentre, dist2d, clamp } from './config.js';
import { Enemy } from './combat.js';
import { Car } from './vehicles.js';
import { buildHumanoid } from './player.js';

const GARAGE = { x: blockCentre(2), z: blockCentre(5) };       // Rosa's chop shop
const GARAGE_FRONT = { x: GARAGE.x, z: GARAGE.z + 15 };
const PLAZA = { x: blockCentre(5), z: blockCentre(5) };
const CASINO = { x: blockCentre(4), z: blockCentre(8) };
const CASINO_FRONT = { x: CASINO.x, z: CASINO.z + 13 };
const PARKING = { x: blockCentre(6), z: blockCentre(9) };
const HELIPAD = { x: blockCentre(10), z: blockCentre(5) };
const HOTEL = { x: blockCentre(10), z: 44 };
const CLUB = { x: blockCentre(6), z: 136 };
const PARK = { x: blockCentre(7), z: blockCentre(3) };
const HOSPITAL = { x: blockCentre(8), z: blockCentre(2) + 13 };
const PIER = { x: 348, z: 44 };
const DOCKS = { x: 175, z: 330 };
const ISLAND_PAD = { x: -2, z: 500 };
const SAFEHOUSE = { x: -20, z: 472 };
const CAY_DOCK = { x: 350, z: 562 };
const CAY_SHACK = { x: 358, z: 518 };
const BOAT_DOCKS = { x: 175, z: 352 };

// ------------------------------------------------------------ route driver
// Kinematic road-following for scripted cars (tail targets, convoys,
// decoys): steers between waypoints at a steady pace.
class RouteDriver {
  constructor(car, points, speed, loop = false) {
    this.car = car; this.points = points; this.speed = speed;
    this.i = 1; this.loop = loop; this.done = false;
  }
  update(dt) {
    if (this.done) return true;
    const car = this.car;
    if (car.dead) { this.done = true; return true; }
    const [tx, tz] = this.points[this.i];
    const dx = tx - car.x, dz = tz - car.z;
    const d = Math.hypot(dx, dz);
    if (d < 6) {
      this.i++;
      if (this.i >= this.points.length) {
        if (this.loop) this.i = 0;
        else { this.done = true; car.speed = 0; car.syncMesh(); return true; }
      }
      return false;
    }
    const want = Math.atan2(dx, dz);
    let dh = want - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    car.heading += clamp(dh, -1.9 * dt, 1.9 * dt);
    car.speed = this.speed;
    car.x += Math.sin(car.heading) * this.speed * dt;
    car.z += Math.cos(car.heading) * this.speed * dt;
    car.wheelSpin += this.speed * dt * 2.2;
    car.syncMesh();
    return false;
  }
}

// ------------------------------------------------------------ the story
const S = 'Sable Quinn', R = 'Rosa Vega', D = 'Dex Marlowe', P = 'Jonah Pierce', B = 'Det. Brandt';

const MISSIONS = [
  {
    day: 1, dayTitle: 'Arrival', title: 'First Wheels', from: S, reward: 700,
    intro: [
      [S, 'Dex Marlowe. Heard you can drive. There\'s a yellow Zephyr GT in the Neon Mile lot with your name on it — take it to Rosa\'s chop shop.'],
      [D, 'And if the owner objects?'],
      [S, 'Then drive faster, sweetheart.'],
    ],
    stages: [
      { k: 'goto', x: PARKING.x, z: PARKING.z, r: 12, mode: 'any', text: 'Reach the Neon Mile parking lot' },
      { k: 'getcar', type: 'sports', color: 0xfee440, x: PARKING.x + 3, z: PARKING.z, heading: 0, text: 'Steal the yellow Zephyr GT (walk up, press E)' },
      { k: 'deliver', x: GARAGE_FRONT.x, z: GARAGE_FRONT.z, r: 8, text: 'Deliver the Zephyr to Rosa\'s chop shop' },
    ],
    outro: [R, 'Clean lift, no scratches that matter. I\'ll move it by Friday.'],
  },
  {
    day: 1, dayTitle: 'Arrival', title: 'Hot Boxes', from: R, reward: 850,
    intro: [
      [R, 'A crate of "machine parts" is sitting at the port. Take it to the Hotel Azure — and Dex? The police scanner just woke up.'],
    ],
    stages: [
      { k: 'goto', x: -228, z: -60, r: 10, mode: 'car', text: 'Pick up the crate at the portside yard gate (in a car)' },
      { k: 'timed', x: HOTEL.x, z: HOTEL.z, r: 9, mode: 'car', time: 105, wanted: 2, text: 'Deliver to the Hotel Azure — fast' },
    ],
    outro: [S, 'Crane\'s people own that hotel. Whatever was in the crate, he wanted it. Interesting.'],
  },
  {
    day: 1, dayTitle: 'Arrival', title: 'Shadow Run', from: S, reward: 900, unlock: 'smg',
    intro: [
      [S, 'Crane\'s lieutenant, Jonah Pierce, leaves the casino at night and drives somewhere he shouldn\'t. Follow him. Not close. Not far.'],
      [D, 'And if he makes me?'],
      [S, 'Then you\'re just traffic, Dex. Be traffic.'],
    ],
    stages: [
      { k: 'goto', x: CASINO_FRONT.x, z: CASINO_FRONT.z + 16, r: 14, mode: 'car', text: 'Pick up Pierce\'s tail outside the Coral Casino (in a car)' },
      { k: 'tail', route: [[CASINO.x, CASINO.z + 20], [-46, 138], [92, 138], [230, 138], [276, 92], [300, 44]], speed: 10.5, text: 'Tail Pierce — stay in the pocket' },
    ],
    outro: [S, 'The pier count room. That\'s where Crane\'s money sleeps. Take this SMG — tomorrow we knock.'],
  },
  {
    day: 1, dayTitle: 'Arrival', title: 'Pier Pressure', from: S, reward: 1100,
    intro: [
      [S, 'Pierce\'s crew counts cash at the east pier after dark. Five guns, one ledger. I want the ledger.'],
    ],
    stages: [
      { k: 'goto', x: PIER.x - 14, z: PIER.z, r: 8, mode: 'foot', text: 'Approach the east pier on foot' },
      { k: 'fight', spawns: [[352, 38, 1], [356, 42, 1], [344, 40, 1], [338, 38, 1], [350, 43, 1.3]], text: 'Clear Pierce\'s crew from the pier' },
      { k: 'pickup', x: 354, z: 41, text: 'Grab the ledger from the count table' },
      { k: 'deliverfoot', x: CLUB.x, z: CLUB.z, r: 7, text: 'Bring the ledger to Club Sable' },
    ],
    outro: [S, 'Names, dates, bribes — Brandt\'s whole precinct is in here. Day one and you\'re already dangerous.'],
  },
  {
    day: 2, dayTitle: 'The Crew', title: 'Neon Grand Prix', from: R, reward: 1200,
    intro: [
      [R, 'The Mile runs an unsanctioned Grand Prix tonight. Eight gates, one clock, my reputation. Win it and the street is yours.'],
    ],
    stages: [
      { k: 'race', mode: 'car', time: 150, points: [[46, 92], [138, 92], [184, 0], [92, -46], [0, -46], [-46, 46], [-46, 138], [46, 230]], text: 'Neon Grand Prix — hit every gate' },
    ],
    outro: [R, 'Ha! Crane\'s boy ate your dust. The whole Mile saw it.'],
  },
  {
    day: 2, dayTitle: 'The Crew', title: 'Meridian Heat', from: S, reward: 1400, unlock: 'shotgun',
    intro: [
      [S, 'My vault crew needs 75 seconds inside Meridian Bank. Pierce will try to stop them. You\'re the wall, Dex.'],
    ],
    stages: [
      { k: 'goto', x: PLAZA.x, z: PLAZA.z + 4, r: 10, mode: 'foot', text: 'Take position on the Meridian plaza' },
      { k: 'holdout', x: PLAZA.x, z: PLAZA.z + 2, r: 21, dur: 75, waves: [3, 4, 5], text: 'Hold the plaza while the crew works' },
    ],
    outro: [S, 'Vault\'s empty, crew\'s gone, you\'re standing. Take the shotgun — you\'ve earned the noise.'],
  },
  {
    day: 2, dayTitle: 'The Crew', title: 'Sky Ledger', from: S, reward: 1600,
    intro: [
      [S, 'Crane keeps a second ledger in the Gull Island safehouse. The marina helicopter is fuelled. Fly it over, grab it, fly home.'],
      [B, '(scanner) All units — Brandt. Whoever\'s been hitting Crane\'s operations: I\'m coming for you personally.'],
    ],
    stages: [
      { k: 'goto', x: HELIPAD.x, z: HELIPAD.z, r: 9, mode: 'foot', text: 'Reach the marina helipad' },
      { k: 'goto', x: ISLAND_PAD.x, z: ISLAND_PAD.z, r: 13, mode: 'heli', text: 'Fly to the Gull Island pad' },
      { k: 'pickup', x: SAFEHOUSE.x + 4, z: SAFEHOUSE.z + 6, text: 'Take the ledger from the safehouse door' },
      { k: 'goto', x: HELIPAD.x, z: HELIPAD.z, r: 13, mode: 'heli', wanted: 3, text: 'Fly the ledger back to the marina' },
    ],
    outro: [S, 'Two ledgers. Crane\'s whole empire, in my hands. He\'s going to war tomorrow — be ready.'],
  },
  {
    day: 2, dayTitle: 'The Crew', title: 'Convoy Funeral', from: S, reward: 1700,
    intro: [
      [S, 'Crane\'s moving his cash out by truck — three box trucks, port to casino. None of them arrive. None.'],
    ],
    stages: [
      { k: 'convoy', route: [[-276, -184], [-276, -46], [-138, -46], [-138, 46], [-46, 46], [-46, 92], [-69, 100]], count: 3, text: 'Destroy all three convoy trucks' },
    ],
    outro: [S, 'Crane just lost a season\'s take in one morning. He\'ll come at us with everything now.'],
  },
  {
    day: 3, dayTitle: 'High Water', title: 'Yacht Club', from: R, reward: 1500,
    intro: [
      [R, 'Roads are watched, so we go by water. Take the boat at the south docks, run this package to Pelican Cay, come home wet and rich.'],
    ],
    stages: [
      { k: 'goto', x: DOCKS.x, z: DOCKS.z, r: 10, mode: 'any', text: 'Reach the south boat docks' },
      { k: 'goto', x: CAY_DOCK.x, z: CAY_DOCK.z, r: 12, mode: 'boat', text: 'Run the package across the bay to Pelican Cay' },
      { k: 'pickup', x: CAY_SHACK.x, z: CAY_SHACK.z, text: 'Drop the package at the cay shack' },
      { k: 'goto', x: BOAT_DOCKS.x, z: BOAT_DOCKS.z, r: 12, mode: 'boat', text: 'Bring the boat home to the south docks' },
    ],
    outro: [R, 'Salt in your hair and cash in your pocket. The bay is a road now, Dex.'],
  },
  {
    day: 3, dayTitle: 'High Water', title: 'Decoy', from: S, reward: 1500, unlock: 'carbine',
    intro: [
      [S, 'Brandt\'s task force is watching Rosa\'s shop. Take the marked sedan, draw three stars, keep them busy a full minute, then ditch it at the shop.'],
      [D, 'You want me to be bait.'],
      [S, 'I want you to be a parade.'],
    ],
    stages: [
      { k: 'getcar', type: 'sedan', color: 0xf15bb5, x: PARK.x, z: PARK.z + 8, heading: Math.PI / 2, text: 'Take the pink decoy sedan in Palms Park' },
      { k: 'survive', stars: 3, dur: 60, carRef: true, text: 'Draw the heat — stay in the decoy, stay rolling' },
      { k: 'deliver', x: GARAGE_FRONT.x, z: GARAGE_FRONT.z, r: 8, text: 'Ditch the decoy at Rosa\'s shop' },
    ],
    outro: [S, 'The task force chased a ghost while Rosa moved everything. Take the carbine — parade\'s over, war\'s on.'],
  },
  {
    day: 3, dayTitle: 'High Water', title: 'Crane\'s Vault', from: S, reward: 2200,
    intro: [
      [S, 'Tonight we rob the robber. The Coral Casino\'s cash cage, front door, broad neon. Hit it, grab the cage money, run.'],
    ],
    stages: [
      { k: 'goto', x: CASINO_FRONT.x, z: CASINO_FRONT.z, r: 9, mode: 'foot', text: 'Walk into the Coral Casino forecourt' },
      { k: 'fight', spawns: [[-80, 122, 1.2], [-58, 122, 1.2], [-69, 98, 1.4], [-84, 108, 1.2], [-54, 108, 1.2], [-69, 132, 1.5]], text: 'Clear the casino guards' },
      { k: 'pickup', x: CASINO.x, z: CASINO.z + 9, wanted: 4, text: 'Grab the cash-cage money' },
      { k: 'deliverfoot', x: GARAGE_FRONT.x, z: GARAGE_FRONT.z, r: 8, text: 'Get the money to Rosa\'s shop' },
    ],
    outro: [S, 'That was Crane\'s payroll, his bribes and his pride, all in one bag. He\'s finished — he just doesn\'t know it.'],
  },
  {
    day: 3, dayTitle: 'High Water', title: 'Blackout', from: S, reward: 1800,
    intro: [
      [S, 'Before the end, we blind the city. Three substations feed Crane\'s towers. Pull every plug — his guards won\'t love it.'],
    ],
    stages: [
      { k: 'pickup', x: -92, z: -92, guards: [[-86, -98, 1], [-98, -86, 1]], text: 'Cut substation one (Downtown)' },
      { k: 'pickup', x: 138, z: 46, guards: [[144, 40, 1], [132, 52, 1]], text: 'Cut substation two (Midtown)' },
      { k: 'pickup', x: -46, z: 230, guards: [[-40, 224, 1.2], [-52, 236, 1.2]], text: 'Cut substation three (Neon Mile)' },
      { k: 'deliverfoot', x: CLUB.x, z: CLUB.z, r: 7, text: 'Report back to Club Sable' },
    ],
    outro: [S, 'Half the skyline just went dark. Crane\'s empire runs on neon, Dex — and we own the switch.'],
  },
  {
    day: 4, dayTitle: 'Empire', title: 'Regatta Run', from: R, reward: 1600,
    intro: [
      [R, 'The yacht club\'s dawn regatta is a rich men\'s parade. Crash it in my boat, take every buoy, take their money.'],
    ],
    stages: [
      { k: 'race', mode: 'boat', time: 175, points: [[250, 385], [322, 428], [352, 472], [305, 522], [205, 478], [168, 392]], text: 'Regatta Run — round every buoy' },
    ],
    outro: [R, 'You beat commodores in a fishing boat. I\'m putting that on the shop wall.'],
  },
  {
    day: 4, dayTitle: 'Empire', title: 'The Crane Falls', from: S, reward: 2600,
    intro: [
      [S, 'Crane\'s making his stand at the casino — Pierce, his best guns, everything. End it in his own forecourt.'],
      [P, 'Marlowe! You took my city apart piece by piece. Come and finish it, then.'],
    ],
    stages: [
      { k: 'goto', x: CASINO_FRONT.x, z: CASINO_FRONT.z + 4, r: 11, mode: 'foot', text: 'Enter the casino forecourt' },
      { k: 'holdout', x: CASINO_FRONT.x, z: CASINO_FRONT.z, r: 24, dur: 90, waves: [4, 5, 1], toughLast: 3.2, text: 'Break Crane\'s last stand' },
    ],
    outro: [S, 'Pierce is down, the casino\'s dark, and Crane just boarded a plane with one suitcase. It\'s over.'],
  },
  {
    day: 4, dayTitle: 'Empire', title: 'Five-Star Goodbye', from: S, reward: 3000,
    intro: [
      [B, 'Marlowe — Brandt. Crane\'s gone, but you\'re still my white whale. Every unit in the city is coming for you. Run, and I\'ll make it interesting.'],
      [S, 'Get to the Gull Island safehouse, Dex. If you make it, even Brandt can\'t touch you out there.'],
    ],
    stages: [
      { k: 'goto', x: SAFEHOUSE.x, z: SAFEHOUSE.z, r: 11, mode: 'any', wanted: 5, clearOnDone: true, text: 'Escape to the Gull Island safehouse — five stars' },
    ],
    outro: [B, '(scanner, quietly) …Stand down. All units stand down. Some fish you don\'t land. You just watch them swim.'],
  },
  {
    day: 4, dayTitle: 'Empire', title: 'New Management', from: S, reward: 4000,
    intro: [
      [S, 'Crane\'s gone. His casino, his hotel, my club — the city needs a signature on the new paperwork. Yours. Drive the route, shake the hands, take the keys.'],
    ],
    stages: [
      { k: 'fight', spawns: [[-80, 124, 1.2], [-58, 124, 1.2]], text: 'Clear the last Crane loyalists at the casino' },
      { k: 'deliverfoot', x: CASINO_FRONT.x, z: CASINO_FRONT.z, r: 8, text: 'Claim the Coral Casino' },
      { k: 'deliverfoot', x: HOTEL.x, z: HOTEL.z, r: 8, text: 'Claim the Hotel Azure' },
      { k: 'deliverfoot', x: CLUB.x, z: CLUB.z, r: 8, text: 'Claim Club Sable — and the city' },
    ],
    outro: [S, 'Casino, hotel, club — Heatwave City has a new name on the door, Dex. Yours. Now go enjoy your empire.'],
  },
];

// ------------------------------------------------------------ side work
const RACES = [
  { name: 'Neon Sprint', x: 46, z: 184, par: 95, points: [[46, 92], [138, 92], [138, 0], [46, 0], [-46, 0], [-46, 92], [-46, 184], [46, 184]] },
  { name: 'Port Run', x: -230, z: -161, par: 100, points: [[-230, -46], [-138, -46], [-138, 92], [-46, 92], [-46, 184], [-138, 184], [-230, 92], [-230, -161]] },
  { name: 'Island Dash', x: 0, z: 262, par: 88, points: [[0, 340], [0, 428], [-30, 478], [0, 522], [30, 478], [0, 428], [0, 340], [0, 262]] },
];
const HIDEOUTS = [
  { x: blockCentre(1), z: blockCentre(4), name: 'Portside hideout' },
  { x: blockCentre(10), z: blockCentre(8), name: 'Marina hideout' },
  { x: blockCentre(6), z: blockCentre(1), name: 'Heights hideout' },
];
const DEST_POINTS = [
  { x: HOTEL.x, z: HOTEL.z, name: 'Hotel Azure' },
  { x: CASINO_FRONT.x, z: CASINO_FRONT.z, name: 'Coral Casino' },
  { x: CLUB.x, z: CLUB.z, name: 'Club Sable' },
  { x: HOSPITAL.x, z: HOSPITAL.z, name: 'Heatwave General' },
  { x: -228, z: -46, name: 'the port yard' },
  { x: blockCentre(0), z: blockCentre(10), name: 'the beach lot' },
  { x: PARK.x, z: PARK.z, name: 'Palms Park' },
  { x: PLAZA.x, z: PLAZA.z + 8, name: 'Meridian Bank' },
  { x: DOCKS.x, z: DOCKS.z - 6, name: 'the south docks' },
];
const BRIEFCASES = [
  [-23, -16], [-60, 128], [-232, -100], [100, 318], [305, 0], [352, 40], [175, 342],
  [14, 506], [-56, 468], [344, 500], [368, 522], [0, -276], [92, 184], [-180, -23],
  [132, -161], [161, 172], [207, 115], [-92, -230], [-200, 316], [69, -100],
];

export class Missions {
  constructor(world) {
    this.world = world;
    this.index = 0;
    this.active = null;   // { def, stageIdx, stage, dlg: [], dlgT }
    this.failed = false;
    this.done = false;
    this.failText = '';
    this.lastDay = 0;
    this.shared = {};
    // side work
    this.act = null;
    this.actCd = 0;
    this.hideoutCd = [0, 0, 0];
    this.taxiState = null;
    // briefcases (skip ones the save already collected)
    const collected = new Set(world.saveData.briefcases || []);
    BRIEFCASES.forEach(([x, z], i) => {
      const id = 'case' + i;
      if (!collected.has(id)) world.combat.dropPickup('cash', x, z, 250, { id, sticky: true });
    });
  }

  get currentDef() { return this.active ? this.active.def : null; }

  // ---------------------------------------------------------- story flow
  startNext() {
    if (this.active || this.done || this.failed) return;
    if (this.index >= MISSIONS.length) { this.done = true; return; }
    const def = MISSIONS[this.index];
    this.shared = {};
    this.active = { def, stageIdx: -1, stage: null, dlg: def.intro.slice(), dlgT: 0 };
    if (def.day !== this.lastDay) {
      this.lastDay = def.day;
      this.world.hud.showDay('DAY ' + def.day, def.dayTitle + ' — ' + def.title);
    }
    this.nextStage();
  }

  nextStage() {
    const a = this.active;
    a.stageIdx++;
    if (a.stageIdx >= a.def.stages.length) { this.completeMission(); return; }
    a.stage = this.buildStage(a.def.stages[a.stageIdx]);
    this.startStage(a.stage);
  }

  buildStage(spec) {
    return { spec, t: 0, started: false, enemies: [], cars: [], drivers: [], extra: {} };
  }

  startStage(st) {
    const w = this.world, spec = st.spec;
    st.started = true;
    if (spec.wanted) w.police.setWanted(Math.max(w.police.wanted, spec.wanted));
    switch (spec.k) {
      case 'goto': case 'deliverfoot': case 'pickup': case 'timed': {
        w.city.setMarker(spec.x, spec.z, spec.k === 'pickup' ? 0x7bf1a8 : 0xffd23f);
        if (spec.guards) for (const [gx, gz, tg] of spec.guards) this.spawnEnemy(st, gx, gz, tg);
        break;
      }
      case 'getcar': {
        const car = new Car(w.scene, spec.type, spec.color, spec.x, spec.z, spec.heading, { marker: true });
        w.looseCars.push(car);
        st.cars.push(car);
        this.shared.car = car;
        w.city.setMarker(spec.x, spec.z);
        break;
      }
      case 'deliver': {
        w.city.setMarker(spec.x, spec.z);
        break;
      }
      case 'tail': {
        const [sx, sz] = spec.route[0];
        const car = new Car(w.scene, 'sedan', 0x8c2f39, sx, sz, 0);
        w.looseCars.push(car);
        st.cars.push(car);
        st.drivers.push(new RouteDriver(car, spec.route, spec.speed));
        st.extra.spook = 0; st.extra.lose = 0; st.extra.warnT = 0;
        break;
      }
      case 'race': {
        st.extra.i = 0;
        st.extra.timeLeft = spec.time;
        const [x, z] = spec.points[0];
        w.city.setMarker(x, z, 0x39d5ee);
        break;
      }
      case 'holdout': {
        w.city.setMarker(spec.x, spec.z, 0xff5566);
        st.extra.left = spec.dur;
        st.extra.wave = 0;
        st.extra.nextWave = 0;
        break;
      }
      case 'fight': {
        for (const [gx, gz, tg] of spec.spawns) this.spawnEnemy(st, gx, gz, tg);
        if (spec.spawns.length) {
          const [mx, mz] = spec.spawns[0];
          w.city.setMarker(mx, mz, 0xff5566);
        }
        break;
      }
      case 'convoy': {
        for (let i = 0; i < spec.count; i++) {
          const [sx, sz] = spec.route[0];
          const car = new Car(w.scene, 'truck', 0xe8e4da, sx, sz - i * 13, 0, { boxColor: 0xc9ced6 });
          w.looseCars.push(car);
          st.cars.push(car);
          st.drivers.push(new RouteDriver(car, spec.route, 8.5));
          st.drivers[st.drivers.length - 1].i = 1;
        }
        st.extra.total = spec.count;
        break;
      }
      case 'survive': {
        w.police.setWanted(Math.max(w.police.wanted, spec.stars));
        st.extra.left = spec.dur;
        break;
      }
    }
  }

  spawnEnemy(st, x, z, tough = 1) {
    const e = new Enemy(this.world.scene, x, z, tough);
    e.active = true;
    this.world.enemies.push(e);
    st.enemies.push(e);
    return e;
  }

  cleanupStage(st, keepCar = false) {
    const w = this.world;
    for (const e of st.enemies) {
      if (!e.dead) { e.remove(); const i = w.enemies.indexOf(e); if (i >= 0) w.enemies.splice(i, 1); }
    }
    if (!keepCar) {
      for (const car of st.cars) {
        if (car !== this.shared.car) {
          car.remove();
          const i = w.looseCars.indexOf(car); if (i >= 0) w.looseCars.splice(i, 1);
        }
      }
    }
    w.city.clearMarker();
  }

  failMission(text) {
    const w = this.world;
    if (this.active && this.active.stage) this.cleanupStage(this.active.stage);
    this.active = null;
    this.failed = true;
    this.failText = text;
    w.hud.showFail(text + ' — press Enter to retry');
    w.hud.clearDialogue();
    w.audio.fail();
  }

  retry() {
    if (!this.failed) return;
    this.failed = false;
    this.startNext();
  }

  onPlayerDown() {
    if (this.active) {
      this.cleanupStage(this.active.stage);
      this.active = null;
      this.failed = true;
      this.failText = 'Job blown';
    }
    if (this.act) { this.endActivity(false); }
  }

  completeMission() {
    const w = this.world, def = this.active.def;
    if (this.active.stage) this.cleanupStage(this.active.stage, true);
    this.active = null;
    this.index++;
    w.addCash(def.reward);
    w.audio.chime();
    w.hud.toast('Job complete: ' + def.title + ' — +$' + def.reward.toLocaleString('en-US'));
    if (def.outro) w.hud.setDialogue(def.outro[0], def.outro[1]);
    if (def.unlock) {
      w.combat.unlock(def.unlock);
      w.hud.toast(def.unlock.toUpperCase() + ' unlocked — check the weapon wheel (Q)');
      w.hud.setWeapon(w.combat);
    }
    if (this.index >= MISSIONS.length) {
      this.done = true;
      w.hud.showDay('EMPIRE BUILT', 'All 16 jobs done — Heatwave City is yours');
      w.hud.setObjective('Free roam — Heatwave City is yours. Side work still pays.');
    }
    w.saveProgress();
  }

  // ---------------------------------------------------------- stage logic
  focusOf(w) { return w.playerCar || w.playerHeli || w.playerBoat || w.player; }

  modeOk(spec, w) {
    switch (spec.mode) {
      case 'foot': return !w.playerCar && !w.playerHeli && !w.playerBoat;
      case 'car': return !!w.playerCar;
      case 'heli': return !!w.playerHeli;
      case 'boat': return !!w.playerBoat;
      default: return true;
    }
  }

  stageText(st) {
    const w = this.world, spec = st.spec, e = st.extra;
    const base = spec.text || '';
    switch (spec.k) {
      case 'timed': return base + ' — ' + Math.max(0, Math.ceil(e.left ?? spec.time)) + 's';
      case 'race': return base + ' — gate ' + Math.min(e.i + 1, spec.points.length) + '/' + spec.points.length + ' · ' + Math.max(0, Math.ceil(e.timeLeft)) + 's';
      case 'tail': return base + ' — spook ' + Math.round(e.spook) + '% · losing him ' + Math.round(e.lose) + '%';
      case 'holdout': return base + ' — ' + Math.max(0, Math.ceil(e.left)) + 's' + (e.inside === false ? ' (GET BACK TO THE MARKER)' : '');
      case 'survive': return base + ' — ' + Math.max(0, Math.ceil(e.left)) + 's of heat left';
      case 'fight': {
        const alive = st.enemies.filter((x) => !x.dead).length;
        return base + ' — ' + alive + ' left';
      }
      case 'convoy': {
        const alive = st.cars.filter((c) => !c.dead).length;
        return base + ' — ' + alive + '/' + e.total + ' trucks rolling';
      }
      default: return base;
    }
  }

  updateStage(dt, st) {
    const w = this.world, spec = st.spec, e = st.extra;
    const focus = this.focusOf(w);
    switch (spec.k) {
      case 'goto': case 'deliverfoot': {
        if (this.modeOk(spec, w) && dist2d(focus.x, focus.z, spec.x, spec.z) < (spec.r || 7)) {
          if (spec.clearOnDone) w.police.setWanted(0);
          return 'done';
        }
        return null;
      }
      case 'pickup': {
        if (!w.playerCar && !w.playerHeli && !w.playerBoat && dist2d(w.player.x, w.player.z, spec.x, spec.z) < 3.4) {
          if (spec.wanted) w.police.setWanted(Math.max(w.police.wanted, spec.wanted));
          return 'done';
        }
        return null;
      }
      case 'getcar': {
        if (w.playerCar && w.playerCar === this.shared.car) return 'done';
        return null;
      }
      case 'deliver': {
        const car = this.shared.car;
        if (car && w.playerCar === car && Math.abs(car.speed) < 3 && dist2d(car.x, car.z, spec.x, spec.z) < (spec.r || 8)) return 'done';
        if (car && car.dead) return 'fail:The car is wrecked';
        return null;
      }
      case 'timed': {
        e.left = (e.left === undefined ? spec.time : e.left) - dt;
        if (e.left <= 0) return 'fail:Out of time';
        if (this.modeOk(spec, w) && dist2d(focus.x, focus.z, spec.x, spec.z) < (spec.r || 8)) return 'done';
        return null;
      }
      case 'tail': {
        const drv = st.drivers[0], car = st.cars[0];
        if (car.dead) return 'fail:Pierce\'s car is wrecked — the trail is cold';
        const finished = drv.update(dt);
        const d = dist2d(focus.x, focus.z, car.x, car.z);
        if (d < 13) e.spook += dt * (13 - d) * 5.2;
        else if (d > 58) e.lose += dt * (d - 58) * 1.15;
        else { e.spook = Math.max(0, e.spook - dt * 4); e.lose = Math.max(0, e.lose - dt * 5); }
        e.warnT -= dt;
        if (e.spook > 72 && e.warnT <= 0) { w.audio.spook(); e.warnT = 3; }
        if (e.spook >= 100) return 'fail:Pierce made you — tail blown';
        if (e.lose >= 100) return 'fail:You lost Pierce in traffic';
        if (finished) return 'done';
        return null;
      }
      case 'race': {
        e.timeLeft -= dt;
        if (e.timeLeft <= 0) return 'fail:Out of time';
        const wantMode = spec.mode === 'boat' ? w.playerBoat : w.playerCar;
        if (wantMode) {
          const [gx, gz] = spec.points[e.i];
          if (dist2d(wantMode.x, wantMode.z, gx, gz) < 13) {
            e.i++;
            w.audio.pickup();
            if (e.i >= spec.points.length) return 'done';
            const [nx, nz] = spec.points[e.i];
            w.city.setMarker(nx, nz, 0x39d5ee);
          }
        }
        return null;
      }
      case 'holdout': {
        const inside = dist2d(focus.x, focus.z, spec.x, spec.z) < spec.r;
        e.inside = inside;
        if (inside) e.left -= dt;
        e.nextWave -= dt;
        if (e.wave < spec.waves.length && e.nextWave <= 0) {
          const count = spec.waves[e.wave];
          const isLast = e.wave === spec.waves.length - 1;
          for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2 + st.t;
            const sx = spec.x + Math.sin(a) * 30, sz = spec.z + Math.cos(a) * 30;
            if (w.city.isLand(sx, sz)) {
              const tough = isLast && spec.toughLast && i === 0 ? spec.toughLast : 1 + e.wave * 0.35;
              this.spawnEnemy(st, sx, sz, tough);
            }
          }
          e.wave++;
          e.nextWave = Math.max(14, spec.dur / spec.waves.length);
        }
        if (e.left <= 0) return 'done';
        return null;
      }
      case 'fight': {
        if (st.enemies.every((x) => x.dead)) return 'done';
        return null;
      }
      case 'convoy': {
        let anyRolling = false;
        for (let i = 0; i < st.drivers.length; i++) {
          const car = st.cars[i];
          if (car.dead) continue;
          anyRolling = true;
          if (st.drivers[i].update(dt)) return 'fail:A convoy truck reached the casino';
        }
        if (!anyRolling) return 'done';
        return null;
      }
      case 'survive': {
        if (spec.carRef && w.playerCar !== this.shared.car) {
          w.hud.setObjective(this.stageText(st) + ' (GET BACK IN THE DECOY)');
          return null;
        }
        if (w.police.wanted < spec.stars) w.police.setWanted(spec.stars);
        e.left -= dt;
        if (e.left <= 0) return 'done';
        return null;
      }
    }
    return null;
  }

  // ---------------------------------------------------------- side work
  activityMarkers() {
    if (this.active || this.act) return [];
    const out = RACES.map((r) => ({ x: r.x, z: r.z }));
    out.push({ x: GARAGE_FRONT.x, z: GARAGE_FRONT.z });
    HIDEOUTS.forEach((h, i) => { if (this.hideoutCd[i] <= 0) out.push({ x: h.x, z: h.z }); });
    return out;
  }

  startRaceActivity(def) {
    this.act = { kind: 'race', def, i: 0, timeLeft: def.par + 45, phase: 'run' };
    const [x, z] = def.points[0];
    this.world.city.setMarker(x, z, 0x39d5ee);
    this.world.hud.toast(def.name + ' — beat ' + def.par + 's for the bonus');
    this.world.audio.sting();
  }

  startPackageActivity() {
    const w = this.world;
    const dest = DEST_POINTS[Math.floor(Math.random() * DEST_POINTS.length)];
    const dist = dist2d(GARAGE_FRONT.x, GARAGE_FRONT.z, dest.x, dest.z);
    this.act = { kind: 'package', dest, timeLeft: Math.round(dist / 9) + 25 };
    w.city.setMarker(dest.x, dest.z, 0x39d5ee);
    w.hud.toast('Package run — deliver to ' + dest.name);
    w.audio.sting();
  }

  startHideoutActivity(idx) {
    const w = this.world, h = HIDEOUTS[idx];
    const st = { enemies: [] };
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const e = new Enemy(w.scene, h.x + Math.sin(a) * 9, h.z + Math.cos(a) * 9, 1.15);
      e.active = true;
      w.enemies.push(e);
      st.enemies.push(e);
    }
    this.act = { kind: 'hideout', idx, enemies: st.enemies };
    w.hud.toast(h.name + ' — clear them out');
    w.audio.sting();
  }

  endActivity(success, reward = 0, label = '') {
    const w = this.world;
    if (this.act && this.act.kind === 'hideout') {
      for (const e of this.act.enemies) {
        if (!e.dead) { e.remove(); const i = w.enemies.indexOf(e); if (i >= 0) w.enemies.splice(i, 1); }
      }
      this.hideoutCd[this.act.idx] = 240;
    }
    if (this.taxiState && this.taxiState.mesh) { /* passenger mesh handled below */ }
    this.act = null;
    this.actCd = 2.5;
    w.city.clearMarker();
    if (success) {
      w.addCash(reward);
      w.audio.chime();
      w.hud.toast(label + ' — +$' + reward.toLocaleString('en-US'));
      w.saveProgress();
    }
  }

  updateActivities(dt) {
    const w = this.world;
    this.actCd = Math.max(0, this.actCd - dt);
    for (let i = 0; i < 3; i++) this.hideoutCd[i] = Math.max(0, this.hideoutCd[i] - dt);
    const focus = this.focusOf(w);
    if (this.act) {
      const act = this.act;
      if (act.kind === 'race') {
        act.timeLeft -= dt;
        if (act.timeLeft <= 0) { w.hud.showFail('Race over — out of time'); this.endActivity(false); return; }
        const [gx, gz] = act.def.points[act.i];
        w.hud.setObjective('SIDE — ' + act.def.name + ': gate ' + (act.i + 1) + '/' + act.def.points.length + ' · ' + Math.ceil(act.timeLeft) + 's');
        if (w.playerCar && dist2d(w.playerCar.x, w.playerCar.z, gx, gz) < 13) {
          act.i++;
          w.audio.pickup();
          if (act.i >= act.def.points.length) {
            const elapsed = act.def.par + 45 - act.timeLeft;
            const bonus = elapsed <= act.def.par ? 500 : 0;
            w.saveData.activities.races++;
            this.endActivity(true, 800 + bonus, 'Race won in ' + Math.round(elapsed) + 's' + (bonus ? ' (par bonus!)' : ''));
            return;
          }
          const [nx, nz] = act.def.points[act.i];
          w.city.setMarker(nx, nz, 0x39d5ee);
        }
      } else if (act.kind === 'package') {
        act.timeLeft -= dt;
        if (act.timeLeft <= 0) { w.hud.showFail('Package run failed — too slow'); this.endActivity(false); return; }
        w.hud.setObjective('SIDE — Package for ' + act.dest.name + ' · ' + Math.ceil(act.timeLeft) + 's');
        if (dist2d(focus.x, focus.z, act.dest.x, act.dest.z) < 9) {
          w.saveData.activities.packages++;
          this.endActivity(true, 550, 'Package delivered');
          return;
        }
      } else if (act.kind === 'hideout') {
        const alive = act.enemies.filter((e) => !e.dead).length;
        w.hud.setObjective('SIDE — Hideout clearout: ' + alive + ' left');
        if (alive === 0) {
          w.saveData.activities.hideouts++;
          this.endActivity(true, 750, 'Hideout cleared');
          return;
        }
      } else if (act.kind === 'taxi') {
        this.updateTaxi(dt);
      }
      return;
    }
    if (this.active || this.failed || this.actCd > 0 || w.state !== 'playing') return;
    // proximity triggers
    if (w.playerCar) {
      for (const r of RACES) {
        if (dist2d(w.playerCar.x, w.playerCar.z, r.x, r.z) < 7) { this.startRaceActivity(r); return; }
      }
      // taxi work begins whenever you sit in a cab
      if (w.playerCar.type === 'taxi' && !this.taxiState) this.beginTaxi();
    }
    if (!w.playerCar && !w.playerHeli && !w.playerBoat) {
      if (dist2d(w.player.x, w.player.z, GARAGE_FRONT.x, GARAGE_FRONT.z) < 5.5) { this.startPackageActivity(); return; }
      HIDEOUTS.forEach((h, i) => {
        if (this.hideoutCd[i] <= 0 && dist2d(w.player.x, w.player.z, h.x, h.z) < 20) this.startHideoutActivity(i);
      });
    }
    if (this.taxiState && !w.playerCar) this.cancelTaxi();
  }

  beginTaxi() {
    const w = this.world;
    const spots = DEST_POINTS.filter((d) => dist2d(w.player.x, w.player.z, d.x, d.z) > 60);
    const pickup = spots[Math.floor(Math.random() * spots.length)];
    const mesh = buildHumanoid(0xffd166, 0x274156, 0xe0ac69, { capColor: 0x118ab2 });
    mesh.position.set(pickup.x, w.city.groundY(pickup.x, pickup.z), pickup.z);
    w.scene.add(mesh);
    this.taxiState = { phase: 'pickup', at: pickup, mesh, dest: null, fareBase: 0 };
    this.act = { kind: 'taxi' };
    w.city.setMarker(pickup.x, pickup.z, 0x39d5ee);
    w.hud.toast('Taxi fare — pick up at ' + pickup.name);
  }

  updateTaxi(dt) {
    const w = this.world, ts = this.taxiState;
    if (!ts) { this.act = null; return; }
    if (!w.playerCar || w.playerCar.type !== 'taxi') { this.cancelTaxi(); return; }
    if (ts.phase === 'pickup') {
      w.hud.setObjective('SIDE — Taxi: pick up your fare at ' + ts.at.name);
      if (dist2d(w.playerCar.x, w.playerCar.z, ts.at.x, ts.at.z) < 8 && Math.abs(w.playerCar.speed) < 1.5) {
        w.scene.remove(ts.mesh);
        ts.mesh = null;
        const dests = DEST_POINTS.filter((d) => dist2d(ts.at.x, ts.at.z, d.x, d.z) > 80);
        ts.dest = dests[Math.floor(Math.random() * dests.length)];
        ts.fareBase = 120 + Math.round(dist2d(ts.at.x, ts.at.z, ts.dest.x, ts.dest.z) * 0.9);
        ts.t = 0; ts.dmg = w.playerCar.health;
        ts.phase = 'deliver';
        w.city.setMarker(ts.dest.x, ts.dest.z, 0x39d5ee);
        w.hud.toast('Fare aboard — take them to ' + ts.dest.name);
        w.audio.pickup();
      }
    } else {
      ts.t += dt;
      w.hud.setObjective('SIDE — Taxi: ' + ts.dest.name + ' · fare $' + ts.fareBase);
      if (dist2d(w.playerCar.x, w.playerCar.z, ts.dest.x, ts.dest.z) < 9 && Math.abs(w.playerCar.speed) < 1.5) {
        const tip = Math.max(0, 160 - Math.round(ts.t * 1.4)) + (w.playerCar.health >= ts.dmg - 2 ? 60 : 0);
        w.saveData.activities.fares++;
        this.taxiState = null;
        this.endActivity(true, ts.fareBase + tip, 'Fare paid' + (tip > 40 ? ' — nice tip!' : ''));
      }
    }
  }

  cancelTaxi() {
    const w = this.world;
    if (this.taxiState && this.taxiState.mesh) w.scene.remove(this.taxiState.mesh);
    this.taxiState = null;
    if (this.act && this.act.kind === 'taxi') this.act = null;
    w.city.clearMarker();
  }

  // ---------------------------------------------------------- main update
  update(dt) {
    const w = this.world;
    // dialogue playback (non-blocking)
    if (this.active && this.active.dlg.length) {
      const a = this.active;
      a.dlgT -= dt;
      if (a.dlgT <= 0) {
        const [who, text] = a.dlg[0];
        w.hud.setDialogue(who, text);
        a.dlgT = 3.6;
        a.dlg.shift();
        if (!a.dlg.length) setTimeout(() => { if (!this.active) w.hud.clearDialogue(); }, 3600);
      }
    }
    if (this.active && this.active.stage) {
      const st = this.active.stage;
      st.t += dt;
      const def = this.active.def;
      w.hud.setObjective('Job ' + (this.index + 1) + ' — ' + def.title + ': ' + this.stageText(st));
      const res = this.updateStage(dt, st);
      if (res === 'done') this.nextStage();
      else if (res && res.startsWith('fail:')) this.failMission(res.slice(5));
    } else if (!this.failed && !this.act) {
      this.updateActivities(dt);
      if (!this.act && !this.done) {
        // keep the next job's giver area hinted on the objective line
      }
    } else if (this.act) {
      this.updateActivities(dt);
    }
  }
}
