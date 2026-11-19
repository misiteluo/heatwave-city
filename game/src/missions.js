// missions.js — the twenty-job story of Dex Marlowe, a getaway
// driver who washes up in Heatwave City with a torched past, and
// Sable Quinn, the fixer who turns his wheel into a living. Victor
// Crane's casino empire is the rot under the neon; across five days
// Dex steals, tails, races, robs, boards and shoots his way up the
// ladder — and takes the city.
//
// A mission is a list of stage specs. Spec kinds: goto, getcar,
// deliver, timed, tail, race, holdout, fight, convoy, survive,
// pickup — plus round 7's: choice (two markers, two ways through,
// a flag that later missions read), chase (stop or destroy a
// moving car before it arrives), board (come alongside the yacht
// and climb aboard), heistfight and condfight (fights whose shape
// depends on the choice you made), fightAtCar and pickupAtCar.
// The runner owns dialogue, markers, timers, fail states and
// retry. Between jobs the cast text the player's phone. The same
// file runs the repeatable side work — street races, taxi fares,
// package runs, gang hideouts, briefcases — and the dynamic
// armoured-truck event that rolls through a quiet city.

import { blockCentre, dist2d, clamp } from './config.js';
import { Enemy } from './combat.js';
import { Car } from './vehicles.js';
import { buildHumanoid } from './player.js';

const GARAGE = { x: blockCentre(2), z: blockCentre(6) };       // Rosa's chop shop
const GARAGE_FRONT = { x: GARAGE.x, z: GARAGE.z + 15 };
const PLAZA = { x: blockCentre(6), z: blockCentre(6) };        // Meridian plaza
const CASINO = { x: blockCentre(5), z: blockCentre(10) };
const CASINO_FRONT = { x: CASINO.x, z: CASINO.z + 13 };
const PARKING = { x: blockCentre(7), z: blockCentre(11) };
const HELIPAD = { x: blockCentre(12), z: blockCentre(6) };
const HOTEL = { x: blockCentre(11), z: blockCentre(12) + 13 };
const CLUB = { x: blockCentre(6), z: blockCentre(10) + 13 };
const PARK = { x: blockCentre(8), z: blockCentre(4) };
const HOSPITAL = { x: blockCentre(9), z: blockCentre(3) + 13 };
const PIER = { x: 396, z: 0 };
const DOCKS = { x: 207, z: 344 };
const BOAT_DOCKS = { x: 207, z: 350 };
const ISLAND_PAD = { x: -40, z: 512 };
const SAFEHOUSE_DOOR = { x: 24, z: 496 };
const CAY_DOCK = { x: 344, z: 524 };
const CAY_SHACK = { x: 356, z: 512 };
const HQ_FRONT = { x: -171, z: -128 };
const TERMINAL = { x: -310, z: 496 };
const JET = { x: -276, z: 529 };
const YACHT_POS = { x: 430, z: 392 };

// ------------------------------------------------------------ route driver
// Kinematic road-following for scripted cars (tail targets, convoys,
// chases, decoys): steers between waypoints at a steady pace.
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
const S = 'Sable Quinn', R = 'Rosa Vega', D = 'Dex Marlowe', P = 'Jonah Pierce',
  B = 'Det. Brandt', M = 'Marco Vega', V = 'Victor Crane';

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
    phone: [[R, 'btw the shop door sticks. kick it. everyone does']],
  },
  {
    day: 1, dayTitle: 'Arrival', title: 'Hot Boxes', from: R, reward: 850,
    intro: [
      [R, 'A crate of "machine parts" is sitting at the port. Take it to the Hotel Azure — and Dex? The police scanner just woke up.'],
    ],
    stages: [
      { k: 'goto', x: -230, z: -60, r: 10, mode: 'car', text: 'Pick up the crate at the portside yard gate (in a car)' },
      { k: 'timed', x: HOTEL.x, z: HOTEL.z, r: 9, mode: 'car', time: 120, wanted: 2, text: 'Deliver to the Hotel Azure — fast' },
    ],
    outro: [S, 'Crane\'s people own that hotel. Whatever was in the crate, he wanted it. Interesting.'],
    phone: [[S, 'hotel job smelled wrong. crane wrong. remember that']],
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
      { k: 'tail', route: [[CASINO.x, CASINO.z + 20], [-46, 184], [92, 184], [230, 184], [276, 138], [322, 92]], speed: 10.5, text: 'Tail Pierce — stay in the pocket' },
    ],
    outro: [S, 'The pier count room. That\'s where Crane\'s money sleeps. Take this SMG — tomorrow we knock.'],
    phone: [[P, 'whoever tailed me tonight: nice driving. shame about what happens next']],
  },
  {
    day: 1, dayTitle: 'Arrival', title: 'Pier Pressure', from: S, reward: 1100,
    intro: [
      [S, 'Pierce\'s crew counts cash at the east pier after dark. Five guns, one ledger. I want the ledger.'],
    ],
    stages: [
      { k: 'goto', x: PIER.x - 14, z: PIER.z, r: 8, mode: 'foot', text: 'Approach the east pier on foot' },
      { k: 'fight', spawns: [[390, -6, 1], [398, 4, 1], [388, 8, 1], [402, -8, 1], [394, 0, 1.3]], text: 'Clear Pierce\'s crew from the pier' },
      { k: 'pickup', x: 396, z: 2, text: 'Grab the ledger from the count table' },
      { k: 'deliverfoot', x: CLUB.x, z: CLUB.z, r: 7, text: 'Bring the ledger to Club Sable' },
    ],
    outro: [S, 'Names, dates, bribes — Brandt\'s whole precinct is in here. Day one and you\'re already dangerous.'],
    phone: [[B, 'pier shooting. five witnesses, zero descriptions. this city protects its own, marlowe']],
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
    phone: [[R, 'your brother says hi btw. marco. he\'s doing a stretch upstate, poor kid']],
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
    phone: [[S, 'crew got clear. you held a plaza against pierce\'s best. noted']],
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
      { k: 'pickup', x: SAFEHOUSE_DOOR.x, z: SAFEHOUSE_DOOR.z + 2, text: 'Take the ledger from the safehouse door' },
      { k: 'goto', x: HELIPAD.x, z: HELIPAD.z, r: 13, mode: 'heli', wanted: 3, text: 'Fly the ledger back to the marina' },
    ],
    outro: [S, 'Two ledgers. Crane\'s whole empire, in my hands. He\'s going to war tomorrow — be ready.'],
    phone: [[S, 'two ledgers. if i vanish, the third copy is under the club bar. burn it']],
  },
  {
    day: 2, dayTitle: 'The Crew', title: 'Convoy Funeral', from: S, reward: 1700,
    intro: [
      [S, 'Crane\'s moving his cash out by truck — three box trucks, port to casino. None of them arrive. None.'],
    ],
    stages: [
      { k: 'convoy', route: [[-276, -184], [-276, -46], [-138, -46], [-138, 46], [-46, 46], [-46, 92], [-69, 150]], count: 3, text: 'Destroy all three convoy trucks' },
    ],
    outro: [S, 'Crane just lost a season\'s take in one morning. He\'ll come at us with everything now.'],
    phone: [[V, 'you are costing me a fortune, mr marlowe. fortunes buy funerals']],
  },
  {
    day: 3, dayTitle: 'High Water', title: 'Bay Runner', from: R, reward: 1500,
    intro: [
      [R, 'Roads are watched, so we go by water. Take the boat at the marina, run this package to Pelican Cay, come home wet and rich.'],
    ],
    stages: [
      { k: 'goto', x: DOCKS.x, z: DOCKS.z, r: 10, mode: 'any', text: 'Reach the marina docks' },
      { k: 'goto', x: CAY_DOCK.x, z: CAY_DOCK.z, r: 12, mode: 'boat', text: 'Run the package across the bay to Pelican Cay' },
      { k: 'pickup', x: CAY_SHACK.x, z: CAY_SHACK.z, text: 'Drop the package at the cay shack' },
      { k: 'goto', x: BOAT_DOCKS.x, z: BOAT_DOCKS.z, r: 12, mode: 'boat', text: 'Bring the boat home to the marina' },
    ],
    outro: [R, 'Salt in your hair and cash in your pocket. The bay is a road now, Dex.'],
    phone: [[R, 'harbormaster owes me. marine unit launches slower near the marina. mostly']],
  },
  {
    day: 3, dayTitle: 'High Water', title: 'Yacht Club', from: S, reward: 2100,
    intro: [
      [S, 'Crane\'s accountant keeps the real books on a yacht anchored off the east shore — the Meridian Star. Sail up quiet, board her, take the books, leave loud.'],
      [D, 'Board a yacht. In the dark. Armed crew.'],
      [S, 'You\'re not paid for the easy water, Dex.'],
    ],
    stages: [
      { k: 'goto', x: DOCKS.x, z: DOCKS.z, r: 10, mode: 'any', text: 'Reach the marina docks' },
      { k: 'goto', x: YACHT_POS.x - 24, z: YACHT_POS.z, r: 16, mode: 'boat', text: 'Sail to the Meridian Star, anchored off the east shore' },
      { k: 'board', text: 'Ease alongside the yacht\'s stern ladder — you\'ll climb aboard automatically' },
      { k: 'fight', deckSpawns: [[3, 4, 1], [-3, -2, 1.1], [2, -6, 1.2], [-2, 7, 1.3]], text: 'Clear the yacht\'s deck crew' },
      { k: 'pickup', deck: [0.5, 1], text: 'Take the accountant\'s books from the deck table' },
      { k: 'goto', x: BOAT_DOCKS.x, z: BOAT_DOCKS.z, r: 12, mode: 'boat', wanted: 3, text: 'Escape by boat to the marina — the marine unit is coming' },
    ],
    outro: [S, 'The real books. Crane\'s accountant just became a very nervous swimmer. Superb work.'],
    phone: [[S, 'the books name a buyer for the casino. guess who. initials V.C. he\'s selling to himself. laundering']],
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
    phone: [[B, 'a pink sedan. you mock my task force in pastels now. noted, marlowe']],
  },
  {
    day: 3, dayTitle: 'High Water', title: 'Crane\'s Vault', from: S, reward: 2600, unlock: 'grenade',
    intro: [
      [S, 'Tonight we rob the robber. The Coral Casino\'s cash cage. Two ways in: the front door, loud and proud — or the service door off the south alley, quiet. Your call, Dex. Grenades in the locker either way.'],
    ],
    stages: [
      { k: 'goto', x: CASINO_FRONT.x, z: CASINO_FRONT.z + 4, r: 11, mode: 'foot', text: 'Case the Coral Casino on foot' },
      {
        k: 'choice', flag: 'vaultEntry',
        a: { x: CASINO.x, z: CASINO.z + 27, value: 'front', label: 'FRONT DOOR — loud', line: 'Front door it is. Everybody sees a legend walk in.' },
        b: { x: CASINO.x, z: CASINO.z - 27, value: 'docks', label: 'SERVICE DOOR — quiet', line: 'Service door. In and out like weather.' },
        text: 'Choose your entry: gold = FRONT DOOR (loud) · cyan = SERVICE DOOR (quiet)',
      },
      { k: 'heistfight', text: 'Clear the cash-cage guards' },
      { k: 'pickup', x: CASINO.x, z: CASINO.z + 9, vaultWanted: true, text: 'Grab the cash-cage money' },
      { k: 'deliverfoot', x: GARAGE_FRONT.x, z: GARAGE_FRONT.z, r: 8, text: 'Get the money to Rosa\'s shop' },
    ],
    outro: [S, 'That was Crane\'s payroll, his bribes and his pride, all in one bag. He\'s finished — he just doesn\'t know it.'],
    phone: [[V, 'my own casino. robbed. the cameras got nothing but a silhouette and excellent posture']],
  },
  {
    day: 3, dayTitle: 'High Water', title: 'Blackout', from: S, reward: 1800, weather: 'rain',
    intro: [
      [S, 'Storm\'s rolling in — perfect cover. Three substations feed Crane\'s towers. Pull every plug in the rain. His guards won\'t love it.'],
    ],
    stages: [
      { k: 'pickup', x: -92, z: -92, guards: [[-86, -98, 1], [-98, -86, 1]], text: 'Cut substation one (Downtown)' },
      { k: 'pickup', x: 138, z: 46, guards: [[144, 40, 1], [132, 52, 1]], text: 'Cut substation two (Midtown)' },
      { k: 'pickup', x: -46, z: 230, guards: [[-40, 224, 1.2], [-52, 236, 1.2]], text: 'Cut substation three (Neon Mile)' },
      { k: 'deliverfoot', x: CLUB.x, z: CLUB.z, r: 7, text: 'Report back to Club Sable' },
    ],
    outro: [S, 'Half the skyline just went dark. Crane\'s empire runs on neon, Dex — and we own the switch.'],
    phone: [[S, 'city engineers blame the storm. the storm blames you. stay dry-ish']],
  },
  {
    day: 4, dayTitle: 'The Reckoning', title: 'Regatta Run', from: R, reward: 1600,
    intro: [
      [R, 'The yacht club\'s dawn regatta is a rich men\'s parade. Crash it in my boat, take every buoy, take their money.'],
    ],
    stages: [
      { k: 'race', mode: 'boat', time: 175, points: [[250, 385], [322, 428], [352, 472], [305, 522], [205, 478], [168, 392]], text: 'Regatta Run — round every buoy' },
    ],
    outro: [R, 'You beat commodores in a fishing boat. I\'m putting that on the shop wall.'],
    phone: [[M, 'rosa says you\'re the real deal. i get out soon, dex. one way or another']],
  },
  {
    day: 4, dayTitle: 'The Reckoning', title: 'Spring Break', from: R, reward: 2200,
    intro: [
      [R, 'Marco — your brother — is being moved from police HQ to the courthouse today. Armoured transport, two guards, one chance. Stop that truck, Dex. Family.'],
      [D, 'Say less. Where does it roll?'],
      [R, 'East on the Heights road. Ram it, shoot it, park on it — just stop it.'],
    ],
    stages: [
      { k: 'goto', x: HQ_FRONT.x, z: HQ_FRONT.z, r: 13, mode: 'any', text: 'Get to police HQ before the transport leaves' },
      { k: 'chase', carType: 'armor', color: 0x3a4b5c, route: [[-184, -161], [-46, -161], [92, -161], [230, -161], [299, -168]], speed: 11.5, hp: 300, text: 'Stop Marco\'s prison transport before the courthouse' },
      { k: 'fightAtCar', count: 3, text: 'Drop the transport guards' },
      { k: 'pickupAtCar', text: 'Free Marco from the transport' },
      { k: 'deliver', x: GARAGE_FRONT.x, z: GARAGE_FRONT.z, r: 9, anyCar: true, text: 'Get Marco to Rosa\'s shop — any wheels' },
    ],
    outro: [M, 'Fourteen months in a cell dreaming about this sky. You came, brother. You actually came.'],
    phone: [[M, 'rosa\'s couch, rosa\'s rules. i owe you my life. spend it well, i\'ll cover you']],
  },
  {
    day: 4, dayTitle: 'The Reckoning', title: 'The Offer', from: S, reward: 1800, bonusFlag: 'pierce', bonusValue: 'smoked', bonus: 600,
    intro: (flags) => [
      [S, 'Pierce is waiting at the casino forecourt. Alone. Unarmed, he says. He wants to talk surrender — or it\'s a trap with good tailoring.'],
      [D, 'And what do I do with him?'],
      [S, flags.vaultEntry === 'docks'
        ? 'You ghosted his casino and he respects it. Talk (gold) or end it (cyan). Either way, it ends tonight.'
        : 'You walked through his front door like you owned it. He\'s terrified. Talk (gold) or end it (cyan).'],
    ],
    stages: [
      { k: 'goto', x: CASINO_FRONT.x, z: CASINO_FRONT.z + 2, r: 10, mode: 'foot', text: 'Meet Pierce at the casino forecourt' },
      {
        k: 'choice', flag: 'pierce',
        a: { x: CASINO.x - 8, z: CASINO.z + 15, value: 'spared', label: 'SPARE HIM — hear him out', line: 'Smart. I know every Crane safehouse, every boat, every bribe. In the finale, my guns are yours.' },
        b: { x: CASINO.x + 8, z: CASINO.z + 15, value: 'smoked', label: 'SMOKE HIM — no loose ends', line: 'Marlowe— wait—' },
        awho: P, bwho: P,
        text: 'Pierce, unarmed, hands up. Gold = SPARE HIM · Cyan = SMOKE HIM',
      },
      { k: 'condfight', spawns: [[-80, 168, 1.3], [-58, 168, 1.3], [-69, 150, 1.5], [-69, 182, 1.4]], text: 'His "unarmed" escort opens fire — finish it' },
    ],
    outro: [S, 'However that ended, Crane just lost his right hand. One day left, Dex.'],
    phone: [[S, 'pierce situation resolved. crane is alone now. truly alone']],
  },
  {
    day: 4, dayTitle: 'The Reckoning', title: 'Armored Might', from: S, reward: 2400, unlock: 'rpg',
    intro: [
      [S, 'Crane\'s last insurance policy: an armoured cash truck, military grade, rolling the long way round. Crack it and the city is ours. I left you a present in the locker — the RPG.'],
    ],
    stages: [
      { k: 'chase', carType: 'armor', color: 0x5c6650, route: [[276, 276], [276, 46], [138, 46], [138, -138], [0, -138], [0, -276]], speed: 12, hp: 300, mustDestroy: true, text: 'Destroy Crane\'s armoured truck (RPG recommended — locker)' },
    ],
    outro: [S, 'Military grade, my foot. Nothing armoured survives a motivated Marlowe.'],
    phone: [[B, 'an RPG. in my city. marlowe, you have officially become a paperwork event']],
  },
  {
    day: 5, dayTitle: 'Coronation', title: 'The Crane Falls', from: S, reward: 2600,
    intro: (flags) => [
      [S, 'Crane\'s making his stand at the casino — his best guns, everything left. End it in his own forecourt.'],
      flags.pierce === 'spared'
        ? [P, 'Marlowe. My boys are inside his line — half his guns won\'t fire tonight. For the pier. For mercy.']
        : [P, 'Marlowe! You took my city apart piece by piece. Come and finish it, then.'],
    ],
    stages: [
      { k: 'goto', x: CASINO_FRONT.x, z: CASINO_FRONT.z + 4, r: 11, mode: 'foot', text: 'Enter the casino forecourt' },
      { k: 'holdout', x: CASINO_FRONT.x, z: CASINO_FRONT.z, r: 24, dur: 90, waves: [4, 5, 1], toughLast: 3.2, allyDiscount: true, text: 'Break Crane\'s last stand' },
    ],
    outro: [S, 'The casino\'s dark, and Crane just ran for his jet with one suitcase. It\'s nearly over.'],
    phone: [[V, 'one suitcase. forty years of empire, one suitcase. you did this, marlowe']],
  },
  {
    day: 5, dayTitle: 'Coronation', title: 'Five-Star Goodbye', from: S, reward: 3000,
    intro: [
      [B, 'Marlowe — Brandt. Crane\'s finished, but you\'re still my white whale. Every unit in the city is coming for you. Run, and I\'ll make it interesting.'],
      [S, 'Get to the Gull Island safehouse, Dex. If you make it, even Brandt can\'t touch you out there.'],
    ],
    stages: [
      { k: 'goto', x: SAFEHOUSE_DOOR.x, z: SAFEHOUSE_DOOR.z, r: 11, mode: 'any', wanted: 5, clearOnDone: true, text: 'Escape to the Gull Island safehouse — five stars' },
    ],
    outro: [B, '(scanner, quietly) …Stand down. All units stand down. Some fish you don\'t land. You just watch them swim.'],
    phone: [[B, 'off the record: the safehouse coffee is terrible. drink it anyway. you earned terrible coffee']],
  },
  {
    day: 5, dayTitle: 'Coronation', title: 'Coronation', from: S, reward: 5000, final: true,
    intro: [
      [V, 'Marlowe. My jet is fuelled, my empire is ash, and you are the only thing I have left to kill. The limousine is coming for you. Personally.'],
      [S, 'He\'s running for Gullwing Field with his last guns. Stop the limo, clear the terminal, take the jet. Take everything, Dex.'],
    ],
    stages: [
      { k: 'chase', carType: 'sedan', color: 0x14151c, route: [[-69, 184], [-138, 184], [-276, 184], [-276, 322], [-290, 430], [-306, 490]], speed: 13, hp: 240, text: 'Stop Crane\'s limousine before the airport' },
      { k: 'fight', spawns: [[-330, 492, 1.2], [-292, 496, 1.2], [-310, 478, 1.3], [-276, 500, 1.4], [-340, 470, 1.2]], text: 'Clear the terminal apron — Crane\'s last guns' },
      { k: 'goto', x: JET.x, z: JET.z, r: 10, mode: 'any', text: 'Reach Crane\'s jet on the apron' },
    ],
    outro: [S, 'Casino, hotel, club, the sky itself — Heatwave City has a new name on the door, Dex. Yours.'],
    phone: [[S, 'the jet has wifi, apparently. wherever you land, this city keeps your name']],
  },
];

// ------------------------------------------------------------ side work
const RACES = [
  { name: 'Neon Sprint', x: 46, z: 184, par: 95, points: [[46, 92], [138, 92], [138, 0], [46, 0], [-46, 0], [-46, 92], [-46, 184], [46, 184]] },
  { name: 'Port Run', x: -230, z: -161, par: 100, points: [[-230, -46], [-138, -46], [-138, 92], [-46, 92], [-46, 184], [-138, 184], [-230, 92], [-230, -161]] },
  { name: 'Island Dash', x: 0, z: 262, par: 88, points: [[0, 340], [0, 428], [-30, 478], [0, 522], [30, 478], [0, 428], [0, 340], [0, 262]] },
  { name: 'Runway Run', x: -394, z: 563, par: 70, points: [[-226, 563], [-226, 470], [-310, 440], [-394, 470], [-394, 563]] },
];
const HIDEOUTS = [
  { x: blockCentre(1), z: blockCentre(5), name: 'Portside hideout' },
  { x: blockCentre(12), z: blockCentre(10), name: 'Marina hideout' },
  { x: blockCentre(7), z: blockCentre(1), name: 'Heights hideout' },
];
const DEST_POINTS = [
  { x: HOTEL.x, z: HOTEL.z, name: 'Hotel Azure' },
  { x: CASINO_FRONT.x, z: CASINO_FRONT.z, name: 'Coral Casino' },
  { x: CLUB.x, z: CLUB.z, name: 'Club Sable' },
  { x: HOSPITAL.x, z: HOSPITAL.z, name: 'Heatwave General' },
  { x: -230, z: -46, name: 'the port yard' },
  { x: blockCentre(0), z: blockCentre(12), name: 'the beach lot' },
  { x: PARK.x, z: PARK.z, name: 'Palms Park' },
  { x: PLAZA.x, z: PLAZA.z + 8, name: 'Meridian Bank' },
  { x: DOCKS.x, z: DOCKS.z - 6, name: 'the marina' },
  { x: TERMINAL.x, z: TERMINAL.z, name: 'Gullwing Field' },
  { x: blockCentre(10), z: blockCentre(2) + 13, name: 'Coral Stadium' },
  { x: blockCentre(10), z: blockCentre(7) + 13, name: 'the Meridian Mall' },
];
const BRIEFCASES = [
  [-23, -16], [-60, 128], [-232, -100], [100, 318], [305, 0], [396, 8], [175, 342],
  [14, 506], [-56, 468], [344, 500], [368, 522], [0, -276], [92, 184], [-180, -23],
  [132, -161], [161, 172], [207, 115], [-92, -230], [-200, 316], [-310, 470],
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
    this.phoneQ = [];
    this.phoneT = 6;
    // Side-work state.
    this.act = null;
    this.actCd = 0;
    this.hideoutCd = [0, 0, 0];
    this.taxiState = null;
    // Dynamic event state.
    this.event = null;
    this.eventT = 80;
    // Briefcases (skipping the ones the save already collected).
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
    const intro = typeof def.intro === 'function' ? def.intro(this.world.saveData.flags || {}) : def.intro;
    this.active = { def, stageIdx: -1, stage: null, dlg: intro.slice(), dlgT: 0 };
    if (def.weather) this.world.city.setWeather(def.weather);
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
      case 'goto': case 'deliverfoot': case 'timed': {
        w.city.setMarker(spec.x, spec.z, 0xffd23f);
        break;
      }
      case 'pickup': {
        // Deck pickups resolve through the yacht's local frame.
        if (spec.deck && w.yacht) {
          const p = w.yacht.deckSpot(spec.deck[0], spec.deck[1]);
          st.extra.rx = p.x; st.extra.rz = p.z;
          w.city.setMarker(p.x, p.z, 0x7bf1a8);
        } else {
          w.city.setMarker(spec.x, spec.z, 0x7bf1a8);
          if (spec.guards) for (const [gx, gz, tg] of spec.guards) this.spawnEnemy(st, gx, gz, tg);
        }
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
      case 'choice': {
        w.city.setMarker(spec.a.x, spec.a.z, 0xffd23f);
        w.city.setMarker2(spec.b.x, spec.b.z, 0x39d5ee);
        // Arm delay: arriving from the previous stage must never
        // trip a choice by momentum — the player commits on purpose.
        st.extra.armT = 0.8;
        break;
      }
      case 'board': {
        if (w.yacht) w.city.setMarker(w.yacht.x, w.yacht.z, 0x7bf1a8);
        break;
      }
      case 'chase': {
        const [sx, sz] = spec.route[0];
        const car = new Car(w.scene, spec.carType, spec.color, sx, sz, 0);
        if (spec.hp) { car.maxHealth = spec.hp; car.health = spec.hp; }
        w.looseCars.push(car);
        st.cars.push(car);
        this.shared.car = car;
        st.drivers.push(new RouteDriver(car, spec.route, spec.speed));
        w.city.setMarker(sx, sz, 0xff5566);
        st.extra.markX = sx; st.extra.markZ = sz;
        break;
      }
      case 'fightAtCar': {
        const car = this.shared.car;
        if (car) {
          for (let i = 0; i < (spec.count || 3); i++) {
            const a = (i / (spec.count || 3)) * Math.PI * 2 + 0.6;
            this.spawnEnemy(st, car.x + Math.sin(a) * 6, car.z + Math.cos(a) * 6, 1.15);
          }
          w.city.setMarker(car.x, car.z, 0xff5566);
        }
        break;
      }
      case 'pickupAtCar': {
        const car = this.shared.car;
        if (car) w.city.setMarker(car.x, car.z, 0x7bf1a8);
        break;
      }
      case 'condfight': {
        // Spared Pierce: his escort stands down, the stage is a talk.
        if (w.saveData.flags && w.saveData.flags.pierce === 'spared') {
          st.extra.skip = true;
          w.hud.setDialogue(P, 'My escort\'s holstered, Marlowe. Crane\'s finale, I bleed for you. Remember that.');
        } else {
          for (const [gx, gz, tg] of spec.spawns) this.spawnEnemy(st, gx, gz, tg);
          const [mx, mz] = spec.spawns[0];
          w.city.setMarker(mx, mz, 0xff5566);
        }
        break;
      }
      case 'heistfight': {
        // The vault entry choice shapes the guard roster: the front
        // door is a brawl, the service door a skeleton crew.
        const quiet = w.saveData.flags && w.saveData.flags.vaultEntry === 'docks';
        const spawns = quiet
          ? [[-80, 150, 1.1], [-58, 150, 1.1], [-69, 138, 1.2]]
          : [[-80, 168, 1.2], [-58, 168, 1.2], [-69, 150, 1.4], [-84, 158, 1.2], [-54, 158, 1.2], [-69, 176, 1.5]];
        for (const [gx, gz, tg] of spawns) this.spawnEnemy(st, gx, gz, tg);
        w.city.setMarker(-69, 161, 0xff5566);
        if (quiet) w.hud.toast('Service door — skeleton crew inside');
        else w.hud.toast('Front door — the whole floor knows you\'re here');
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
        if (spec.allyDiscount && w.saveData.flags && w.saveData.flags.pierce === 'spared') {
          st.extra.waves = spec.waves.map((n) => Math.max(1, n - 1));
          w.hud.toast('Pierce\'s defectors thin Crane\'s line tonight');
        } else st.extra.waves = spec.waves;
        break;
      }
      case 'fight': {
        if (spec.deckSpawns && w.yacht) {
          for (const [lx, lz, tg] of spec.deckSpawns) {
            const p = w.yacht.deckSpot(lx, lz);
            this.spawnEnemy(st, p.x, p.z, tg);
          }
          w.city.setMarker(w.yacht.x, w.yacht.z, 0xff5566);
        } else if (spec.spawns) {
          for (const [gx, gz, tg] of spec.spawns) this.spawnEnemy(st, gx, gz, tg);
          if (spec.spawns.length) {
            const [mx, mz] = spec.spawns[0];
            w.city.setMarker(mx, mz, 0xff5566);
          }
        }
        break;
      }
      case 'convoy': {
        for (let i = 0; i < spec.count; i++) {
          const [sx, sz] = spec.route[0];
          const car = new Car(w.scene, 'truck', 0xe8e4da, sx, sz - i * 13, 0);
          w.looseCars.push(car);
          st.cars.push(car);
          st.drivers.push(new RouteDriver(car, spec.route, 8.5));
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
          car.remove(w.scene);
          const i = w.looseCars.indexOf(car); if (i >= 0) w.looseCars.splice(i, 1);
        }
      }
    }
    w.city.clearMarker();
  }

  failMission(text) {
    const w = this.world;
    if (this.active && this.active.stage) this.cleanupStage(this.active.stage);
    if (this.active && this.active.def.weather) w.city.setWeather(null);
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
      if (this.active.def.weather) this.world.city.setWeather(null);
      this.cleanupStage(this.active.stage);
      this.active = null;
      this.failed = true;
      this.failText = 'Job blown';
    }
    if (this.act) this.endActivity(false);
  }

  completeMission() {
    const w = this.world, def = this.active.def;
    if (this.active.stage) this.cleanupStage(this.active.stage, true);
    if (def.weather) w.city.setWeather(null);
    this.active = null;
    this.index++;
    w.addCash(def.reward);
    w.audio.chime();
    w.hud.toast('Job complete: ' + def.title + ' — +$' + def.reward.toLocaleString('en-US'));
    if (def.bonusFlag && w.saveData.flags && w.saveData.flags[def.bonusFlag] === def.bonusValue) {
      w.addCash(def.bonus);
      w.hud.toast('Loose end tied off — +$' + def.bonus + ' from Pierce\'s pockets');
    }
    if (def.outro) w.hud.setDialogue(def.outro[0], def.outro[1]);
    if (def.phone) { this.phoneQ.push(...def.phone); this.phoneT = Math.min(this.phoneT, 5); }
    if (def.unlock) {
      w.combat.unlock(def.unlock);
      w.hud.toast(def.unlock.toUpperCase() + ' unlocked — weapon keys 1–7');
      w.hud.setWeapon(w.combat);
    }
    if (this.index >= MISSIONS.length) {
      this.done = true;
      w.hud.showDay('EMPIRE BUILT', 'All 20 jobs done — Heatwave City is yours');
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
    const spec = st.spec, e = st.extra;
    const base = spec.text || '';
    switch (spec.k) {
      case 'timed': return base + ' — ' + Math.max(0, Math.ceil(e.left ?? spec.time)) + 's';
      case 'race': return base + ' — gate ' + Math.min(e.i + 1, spec.points.length) + '/' + spec.points.length + ' · ' + Math.max(0, Math.ceil(e.timeLeft)) + 's';
      case 'tail': return base + ' — spook ' + Math.round(e.spook) + '% · losing him ' + Math.round(e.lose) + '%';
      case 'holdout': return base + ' — ' + Math.max(0, Math.ceil(e.left)) + 's' + (e.inside === false ? ' (GET BACK TO THE MARKER)' : '');
      case 'survive': return base + ' — ' + Math.max(0, Math.ceil(e.left)) + 's of heat left';
      case 'fight': case 'condfight': case 'heistfight': case 'fightAtCar': {
        const alive = st.enemies.filter((x) => !x.dead).length;
        return base + ' — ' + alive + ' left';
      }
      case 'convoy': {
        const alive = st.cars.filter((c) => !c.dead).length;
        return base + ' — ' + alive + '/' + e.total + ' trucks rolling';
      }
      case 'chase': {
        const car = st.cars[0];
        if (car) return base + ' — hull ' + Math.max(0, Math.round((car.health / car.maxHealth) * 100)) + '%';
        return base;
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
        const px = e.rx !== undefined ? e.rx : spec.x;
        const pz = e.rz !== undefined ? e.rz : spec.z;
        if (!w.playerCar && !w.playerHeli && !w.playerBoat && dist2d(w.player.x, w.player.z, px, pz) < 3.4) {
          if (spec.wanted) w.police.setWanted(Math.max(w.police.wanted, spec.wanted));
          if (spec.vaultWanted) {
            const loud = w.saveData.flags && w.saveData.flags.vaultEntry === 'front';
            w.police.setWanted(Math.max(w.police.wanted, loud ? 4 : 2));
          }
          return 'done';
        }
        return null;
      }
      case 'pickupAtCar': {
        const car = this.shared.car;
        if (!car) return 'done';
        if (Math.abs(car.x - (e.markX ?? 1e9)) > 6 || Math.abs(car.z - (e.markZ ?? 1e9)) > 6) {
          e.markX = car.x; e.markZ = car.z;
          w.city.setMarker(car.x, car.z, 0x7bf1a8);
        }
        if (!w.playerCar && !w.playerBoat && dist2d(w.player.x, w.player.z, car.x, car.z) < 4.5) return 'done';
        return null;
      }
      case 'getcar': {
        if (w.playerCar && w.playerCar === this.shared.car) return 'done';
        return null;
      }
      case 'deliver': {
        const car = spec.anyCar ? w.playerCar : this.shared.car;
        if (car && w.playerCar === car && Math.abs(car.speed) < 3 && dist2d(car.x, car.z, spec.x, spec.z) < (spec.r || 8)) return 'done';
        if (!spec.anyCar && this.shared.car && this.shared.car.dead) return 'fail:The car is wrecked';
        return null;
      }
      case 'timed': {
        e.left = (e.left === undefined ? spec.time : e.left) - dt;
        if (e.left <= 0) return 'fail:Out of time';
        if (this.modeOk(spec, w) && dist2d(focus.x, focus.z, spec.x, spec.z) < (spec.r || 8)) return 'done';
        return null;
      }
      case 'choice': {
        if (e.armT > 0) { e.armT -= dt; return null; }
        const da = dist2d(focus.x, focus.z, spec.a.x, spec.a.z);
        const db = dist2d(focus.x, focus.z, spec.b.x, spec.b.z);
        const pick = da < 5.5 ? 'a' : db < 5.5 ? 'b' : null;
        if (pick) {
          const c = spec[pick];
          if (!w.saveData.flags) w.saveData.flags = {};
          w.saveData.flags[spec.flag] = c.value;
          if (c.line) this.active.dlg.push([pick === 'a' ? (spec.awho || S) : (spec.bwho || S), c.line]);
          w.hud.toast('Choice made: ' + c.label);
          w.audio.sting();
          w.saveProgress();
          return 'done';
        }
        return null;
      }
      case 'board': {
        if (!w.yacht) return 'done';
        if (w.playerBoat && dist2d(w.playerBoat.x, w.playerBoat.z, w.yacht.x, w.yacht.z) < 13) {
          w.boardYacht();
          return 'done';
        }
        return null;
      }
      case 'chase': {
        const car = st.cars[0], drv = st.drivers[0];
        if (!car) return 'done';
        if (Math.abs(car.x - (e.markX ?? 1e9)) > 8 || Math.abs(car.z - (e.markZ ?? 1e9)) > 8) {
          e.markX = car.x; e.markZ = car.z;
          w.city.setMarker(car.x, car.z, 0xff5566);
        }
        if (car.dead) return 'done';
        if (!spec.mustDestroy && car.health <= car.maxHealth * 0.42) {
          drv.done = true; car.speed = 0; car.syncMesh();
          return 'done';
        }
        if (drv.update(dt)) return 'fail:The target got away';
        return null;
      }
      case 'fightAtCar': case 'condfight': case 'heistfight': {
        if (e.skip) return 'done';
        if (st.enemies.every((x) => x.dead)) return 'done';
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
        const waves = e.waves || spec.waves;
        if (e.wave < waves.length && e.nextWave <= 0) {
          const count = waves[e.wave];
          const isLast = e.wave === waves.length - 1;
          for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2 + st.t;
            const sx = spec.x + Math.sin(a) * 30, sz = spec.z + Math.cos(a) * 30;
            if (w.city.isLand(sx, sz)) {
              const tough = isLast && spec.toughLast && i === 0 ? spec.toughLast : 1 + e.wave * 0.35;
              this.spawnEnemy(st, sx, sz, tough);
            }
          }
          e.wave++;
          e.nextWave = Math.max(14, spec.dur / waves.length);
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
    const enemies = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const e = new Enemy(w.scene, h.x + Math.sin(a) * 9, h.z + Math.cos(a) * 9, 1.15);
      e.active = true;
      w.enemies.push(e);
      enemies.push(e);
    }
    this.act = { kind: 'hideout', idx, enemies };
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

  // The dynamic event: an armoured cash truck rolls a cross-city
  // route. Crack it open for a payday; ignore it and it leaves.
  updateEvent(dt) {
    const w = this.world;
    if (this.event) {
      const ev = this.event;
      ev.t -= dt;
      if (ev.car.dead) {
        for (let i = 0; i < 3; i++) {
          w.combat.dropPickup('cash', ev.car.x + (Math.random() - 0.5) * 6, ev.car.z + (Math.random() - 0.5) * 6, 400);
        }
        w.hud.toast('Armoured truck cracked — grab the cash!');
        w.audio.chime();
        this.event = null;
        return;
      }
      const finished = ev.driver.update(dt);
      if (finished || ev.t <= 0) {
        ev.car.remove(w.scene);
        const i = w.looseCars.indexOf(ev.car);
        if (i >= 0) w.looseCars.splice(i, 1);
        this.event = null;
      }
      return;
    }
    if (this.active || this.act || w.state !== 'playing') return;
    this.eventT -= dt;
    if (this.eventT > 0) return;
    this.eventT = 130 + Math.random() * 70;
    const routes = [
      [[-276, 276], [-276, 46], [-46, 46], [-46, -138], [92, -138]],
      [[276, -276], [276, -46], [46, -46], [46, 138], [-92, 138]],
      [[-276, -230], [-46, -230], [-46, -46], [138, -46], [138, 92]],
    ];
    const route = routes[Math.floor(Math.random() * routes.length)];
    const car = new Car(w.scene, 'armor', 0x707a68, route[0][0], route[0][1], 0, { marker: true });
    car.maxHealth = 320; car.health = 320;
    w.looseCars.push(car);
    this.event = { car, driver: new RouteDriver(car, route, 11), t: 150 };
    w.hud.toast('An armoured cash truck is rolling through the city — crack it for a payday');
    w.audio.sting();
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
    // Proximity triggers for new side work.
    if (w.playerCar) {
      for (const r of RACES) {
        if (dist2d(w.playerCar.x, w.playerCar.z, r.x, r.z) < 7) { this.startRaceActivity(r); return; }
      }
      // Taxi work begins whenever you sit in a cab.
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
    // Dialogue playback (non-blocking: lines advance on a timer).
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
    // Phone messages from the last job arrive while you roam.
    if (!this.active && this.phoneQ.length) {
      this.phoneT -= dt;
      if (this.phoneT <= 0) {
        const [who, text] = this.phoneQ.shift();
        w.hud.showPhone(who, text);
        w.audio.phoneBuzz();
        this.phoneT = 8;
      }
    }
    this.updateEvent(dt);
    if (this.active && this.active.stage) {
      const st = this.active.stage;
      st.t += dt;
      const def = this.active.def;
      w.hud.setObjective('Job ' + (this.index + 1) + ' — ' + def.title + ': ' + this.stageText(st));
      const res = this.updateStage(dt, st);
      if (res === 'done') this.nextStage();
      else if (res && res.startsWith('fail:')) this.failMission(res.slice(5));
    } else if (this.act || (!this.failed)) {
      this.updateActivities(dt);
    }
  }
}
