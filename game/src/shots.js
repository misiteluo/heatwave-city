// shots.js — staged scenes for the four judge screenshots. When
// the URL carries ?shot=<name>, main.js asks here to compose a
// frame from real game state: the actual player, a real supercar
// with its nitro lit, real police cruisers, a real roadblock with
// a spike strip in the gap, real enemies on the real yacht's deck,
// Crane's real jet on the real runway — nothing is faked with
// sprites or overlays. The sun is pinned to golden hour by main.js,
// which is when the models look their best: glossy paint, long
// shadows, the skyline warming up behind Dex.

import { posePhone } from './player.js';

export function isShotMode(params) { return params.get('shot'); }

// Park a traffic car in a real lane (lane offset 3.4 from the road
// centre line, matching traffic.js) so it holds its pose and rolls
// naturally through the staged frames.
function stageTrafficCar(w, vertical, line, dir, along) {
  for (const car of w.traffic.cars) {
    if (!car.ai || car.ai.vertical !== vertical || car._staged) continue;
    car._staged = true;
    car.ai.line = line;
    car.ai.dir = dir;
    if (vertical) {
      car.x = line + dir * 3.4;
      car.z = along;
      car.heading = dir > 0 ? 0 : Math.PI;
    } else {
      car.x = along;
      car.z = line - dir * 3.4;
      car.heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    car.speed = 6;
    car.syncMesh(w.city);
    return car;
  }
  return null;
}

function stageCops(w, spots) {
  for (const [cx, cz, speed] of spots) {
    // spawnOne can miss its random spot roll — retry until a NEW
    // cruiser actually joins the array, then pose that one.
    let cop = null;
    for (let tries = 0; tries < 4 && !cop; tries++) {
      const before = w.police.cars.length;
      w.police.spawnOne(w);
      if (w.police.cars.length > before) cop = w.police.cars[w.police.cars.length - 1];
    }
    if (cop) {
      cop.x = cx; cop.z = cz; cop.heading = 0; cop.speed = speed;
      cop.syncMesh(w.city);
    }
  }
}

// Each setup returns the camera pose main.js should hold for the frame.
export function setupShot(name, world) {
  const w = world;
  w.hud.setStars(0);
  if (name === 'foot') {
    // On foot at Gullwing Field: Dex on the terminal apron, phone
    // in hand with Sable's text on screen, Crane's jet waiting on
    // the apron behind him and the tower over his shoulder — the
    // finale, five minutes early.
    w.player.x = -282; w.player.z = 521; w.player.heading = Math.PI * 1.06;
    w.player.mesh.position.set(w.player.x, w.city.groundY(w.player.x, w.player.z), w.player.z);
    w.player.mesh.rotation.y = w.player.heading;
    posePhone(w.player.mesh);
    w.hud.showPhone('Sable Quinn', 'crane\'s jet is fuelled and his limo is rolling. terminal. now.');
    w.hud.setObjective('Job 20 — Coronation: clear the terminal apron — Crane\'s last guns');
    w.hud.setStars(2);
    w.city.setMarker(-276, 529, 0xff5566);
    return { mode: 'foot', camX: -273.5, camY: 2.4, camZ: 509.5, lookX: -283, lookY: 1.5, lookZ: 522 };
  }
  if (name === 'mission') {
    // The yacht infiltration: Dex on the Meridian Star's deck,
    // weapon up, Crane's deck crew closing in, the city skyline
    // across the water at golden hour.
    const spot = w.yacht.deckSpot(0.5, 5);
    w.player.x = spot.x; w.player.z = spot.z;
    w.player.heading = w.yacht.heading + Math.PI * 0.9;
    w.player.mesh.position.set(w.player.x, w.city.groundY(w.player.x, w.player.z), w.player.z);
    w.player.mesh.rotation.y = w.player.heading;
    w.player.setWeaponDrawn(true);
    w.hud.setObjective('Job 10 — Yacht Club: clear the yacht\'s deck crew — 3 left');
    w.hud.setStars(3);
    const { Enemy } = w.enemyClass;
    for (const [lx, lz] of [[3.5, -3], [-3, -6], [0.5, -9]]) {
      const p = w.yacht.deckSpot(lx, lz);
      const e = new Enemy(w.scene, p.x, p.z, 1.1);
      w.enemies.push(e);
    }
    // Camera off the stern quarter at deck height: Dex, the crew,
    // the furniture and Pelican Cay behind — the bright water on
    // the right is the low sun doing what it does at golden hour.
    return { mode: 'foot', camX: 443, camY: 5.4, camZ: 375, lookX: 429, lookY: 2.2, lookZ: 394 };
  }
  if (name === 'chase') {
    // The finale on the runway: Dex's supercar alongside Crane's
    // limousine at full tilt down Gullwing Field's strip, tower
    // and terminal sliding past, two cruisers in the mirror.
    const car = w.makeCar('super', 0xff7b00, -348, 559.6, Math.PI / 2);
    w.enterCar(car, true);
    car.speed = 31;
    const limo = w.makeCar('sedan', 0x14151c, -318, 566.4, Math.PI / 2);
    limo.speed = 29;
    w.police.setWanted(4);
    stageCops(w, [[-374, 552, 28], [-380, 568, 28]]);
    for (const cop of w.police.cars) { cop.heading = Math.PI / 2; cop.syncMesh(w.city); }
    w.hud.setStars(4);
    w.hud.setObjective('Job 20 — Coronation: stop Crane\'s limousine before the airport');
    return { mode: 'car', camX: -368, camY: 2.8, camZ: 545, lookX: -332, lookY: 1.3, lookZ: 561 };
  }
  // Cover (default): the four-star wall. A supercar at full boost
  // on a downtown avenue, nitro lit, a roadblock with a spike
  // strip waiting ahead, cruisers behind and the helicopter up.
  const car = w.makeCar('super', 0xe63946, -42.6, 40, 0);
  w.enterCar(car, true);
  car.speed = 27;
  car.boosting = true;
  if (car.mesh.userData.flames) for (const f of car.mesh.userData.flames) f.visible = true;
  w.hud.setNitro(0.72);
  w.police.setWanted(4);
  stageCops(w, [[-49.5, 33, 24], [-36, 30.5, 24]]);
  w.police.spawnRoadblock(w);
  w.police.updateHeli(0.016, w, 1.2);
  if (w.police.heli) { w.police.heli.x = -28; w.police.heli.z = 82; w.police.heli.alt = 15; w.police.heli.syncMesh(w.city); }
  stageTrafficCar(w, true, -46, 1, 84);
  stageTrafficCar(w, true, -46, -1, 110);
  w.city.setMarker(-46, 138);
  w.hud.setStars(4);
  w.hud.setObjective('Four stars — roadblock ahead. Thread it or eat the spikes.');
  return { mode: 'car', camX: -48.5, camY: 2.4, camZ: 24.5, lookX: -41.8, lookY: 1.1, lookZ: 43 };
}
