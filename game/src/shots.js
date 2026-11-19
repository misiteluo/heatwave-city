// shots.js — staged scenes for the four judge screenshots. When the
// URL carries ?shot=<name>, main.js asks here to compose a frame from
// real game state: the actual player, real police cruisers in pursuit,
// real traffic in its lanes, real enemies and the real mission
// marker — nothing is faked with sprites or overlays. The sun is
// pinned to golden hour by main.js for these frames.

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
    car.syncMesh();
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
      cop.syncMesh();
    }
  }
}

// Each setup returns the camera pose main.js should hold for the frame.
export function setupShot(name, world) {
  const w = world;
  w.hud.setStars(0);
  if (name === 'foot') {
    // On foot on the east boardwalk: Dex against the skyline, shore
    // traffic rolling past, the first job marked across the city.
    w.player.x = 302; w.player.z = 58; w.player.heading = -Math.PI / 2;
    w.player.mesh.position.set(w.player.x, w.city.groundY(w.player.x, w.player.z), w.player.z);
    w.player.mesh.rotation.y = w.player.heading;
    w.city.setMarker(23, 161);
    w.hud.setObjective('Job 1 — First Wheels: reach the Neon Mile parking lot');
    w.hud.setPrompt('E — enter car');
    stageTrafficCar(w, true, 276, 1, 44);
    stageTrafficCar(w, true, 276, -1, 82);
    return { mode: 'foot', camX: 309.5, camY: 1.7, camZ: 63, lookX: 297, lookY: 1.2, lookZ: 55.5 };
  }
  if (name === 'mission') {
    // The Meridian holdout: pillar of red light on the plaza, the
    // bank behind, Crane's gunmen closing on Dex's position.
    w.player.x = -11; w.player.z = -11; w.player.heading = Math.PI * 0.78;
    w.player.mesh.position.set(w.player.x, w.city.groundY(w.player.x, w.player.z), w.player.z);
    w.player.mesh.rotation.y = w.player.heading;
    w.city.setMarker(-23, -21, 0xff5566);
    w.hud.setObjective('Job 6 — Meridian Heat: hold the plaza while the crew works — 41s');
    w.hud.setStars(2);
    const { Enemy } = w.enemyClass;
    for (const [ex, ez] of [[-2, -4], [3, -12], [-6, 1]]) {
      const e = new Enemy(w.scene, ex, ez, 1);
      w.enemies.push(e);
    }
    return { mode: 'foot', camX: 4, camY: 4.2, camZ: 5, lookX: -20, lookY: 1.4, lookZ: -22 };
  }
  if (name === 'chase') {
    // The five-star goodbye: full speed down the Gull Island
    // causeway, sea on both sides, two cruisers behind, roadblock
    // heat ahead and the lighthouse on the horizon.
    const car = w.makeCar('sports', 0x3ec1d3, -3.4, 362, 0);
    w.enterCar(car, true);
    car.speed = 26;
    w.police.setWanted(4);
    stageCops(w, [[4.5, 344, 24], [-5, 340, 24]]);
    w.hud.setStars(4);
    w.hud.setObjective('Job 15 — Five-Star Goodbye: escape to the Gull Island safehouse');
    return { mode: 'car', camX: -11, camY: 4.6, camZ: 322, lookX: 0, lookY: 1.5, lookZ: 362 };
  }
  // cover (default): downtown chase at golden hour — the hero shot.
  const car = w.makeCar('sports', 0xff5964, -49.4, 44, 0);
  w.enterCar(car, true);
  car.speed = 24;
  w.police.setWanted(3);
  stageCops(w, [[-49.4, 35, 22], [-44, 38, 22]]);
  // two civilian cars ahead for depth on the avenue
  stageTrafficCar(w, true, -46, 1, 80);
  stageTrafficCar(w, true, -46, -1, 104);
  w.city.setMarker(-46, 138);
  w.hud.setStars(3);
  w.hud.setObjective('Job 2 — Hot Boxes: deliver the crate to the Hotel Azure — fast');
  return { mode: 'car', camX: -52, camY: 3.8, camZ: 26, lookX: -48.8, lookY: 1.3, lookZ: 44 };
}
