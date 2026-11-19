// shots.js — staged scenes for the four judge screenshots. When the
// URL carries ?shot=<name>, main.js asks here to compose a frame from
// real game state: the actual player car, real police cruisers in
// pursuit, real pedestrians, real enemies and the real mission
// marker — nothing is faked with sprites or overlays. The sun is
// pinned to golden hour by main.js for these frames.

export function isShotMode(params) { return params.get('shot'); }

// Each setup returns the camera pose main.js should hold for the frame.
export function setupShot(name, world) {
  const w = world;
  w.hud.setStars(0);
  if (name === 'foot') {
    // On foot on the beachfront promenade, the skyline behind Nico,
    // traffic rolling along the shore road, the next job marked inland.
    w.player.x = 60; w.player.z = 297; w.player.heading = Math.PI;
    w.player.mesh.position.set(w.player.x, 0, w.player.z);
    w.player.mesh.rotation.y = Math.PI;
    w.city.setMarker(23, 161);
    w.hud.setObjective('Job 2 — Hot Freight: deliver the crate to the Marina Hotel');
    w.hud.setPrompt('E — enter car');
    let placed = 0;
    for (const car of w.traffic.cars) {
      if (placed >= 2) break;
      if (car.ai && !car.ai.vertical) {
        car.x = 26 + placed * 62;
        car.z = car.ai.dir > 0 ? 279.4 : 272.6;
        car.heading = car.ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        car.mesh.position.set(car.x, 0, car.z);
        car.mesh.rotation.y = car.heading;
        placed++;
      }
    }
    return { mode: 'foot', camX: 64.5, camY: 2.4, camZ: 306.5, lookX: 58.5, lookY: 1.6, lookZ: 293 };
  }
  if (name === 'mission') {
    // The Meridian holdout: pillar of red light, the bank behind,
    // Delgado gunmen closing on the plaza fountain.
    w.player.x = -11; w.player.z = -11; w.player.heading = Math.PI * 0.78;
    w.player.mesh.position.set(w.player.x, 0, w.player.z);
    w.player.mesh.rotation.y = w.player.heading;
    w.city.setMarker(-23, -23, 0xff5566);
    w.hud.setObjective('Job 6 — Meridian Heat: hold the plaza while the crew works — 41s');
    w.hud.setStars(2);
    const { Enemy } = w.enemyClass;
    for (const [ex, ez] of [[-2, -4], [3, -12], [-6, 1]]) {
      const e = new Enemy(w.scene, ex, ez, 1);
      w.enemies.push(e);
    }
    return { mode: 'foot', camX: 3, camY: 4.6, camZ: 4, lookX: -21, lookY: 1.5, lookZ: -23 };
  }
  if (name === 'chase') {
    // The finale run: full speed down the Gull Island causeway, sea on
    // both sides, two cruisers behind, the lighthouse ahead.
    const car = w.makeCar('sports', 0x3ec1d3, -3.4, 362, 0);
    w.enterCar(car, true);
    car.speed = 26;
    w.police.setWanted(4);
    const copSpots = [[3.4, 344], [-3.4, 336]];
    for (let i = 0; i < 2; i++) {
      w.police.spawnOne(w);
      const cop = w.police.cars[w.police.cars.length - 1];
      if (cop) {
        cop.x = copSpots[i][0]; cop.z = copSpots[i][1]; cop.heading = 0; cop.speed = 24;
        cop.mesh.position.set(cop.x, 0, cop.z);
        cop.mesh.rotation.y = 0;
      }
    }
    w.hud.setStars(4);
    w.hud.setObjective('Job 9 — Heatwave Finale: escape to the Gull Island safehouse');
    return { mode: 'car', camX: -9, camY: 4.4, camZ: 326, lookX: 0, lookY: 1.5, lookZ: 366 };
  }
  // cover (default): downtown chase at golden hour — the hero shot.
  const car = w.makeCar('sports', 0xff5964, -49.4, 44, 0);
  w.enterCar(car, true);
  car.speed = 24;
  w.police.setWanted(3);
  const copSpots = [[-49.4, 35], [-44, 38]];
  for (let i = 0; i < 2; i++) {
    w.police.spawnOne(w);
    const cop = w.police.cars[w.police.cars.length - 1];
    if (cop) {
      cop.x = copSpots[i][0]; cop.z = copSpots[i][1]; cop.heading = 0; cop.speed = 22;
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = 0;
    }
  }
  // two civilian cars ahead for depth on the avenue
  let placed = 0;
  for (const tc of w.traffic.cars) {
    if (placed >= 2) break;
    if (tc.ai && tc.ai.vertical) {
      tc.x = placed === 0 ? -42.6 : -49.4;
      tc.z = placed === 0 ? 80 : 104;
      tc.heading = placed === 0 ? 0 : Math.PI;
      tc.mesh.position.set(tc.x, 0, tc.z);
      tc.mesh.rotation.y = tc.heading;
      placed++;
    }
  }
  w.city.setMarker(-46, 138);
  w.hud.setStars(3);
  w.hud.setObjective('Job 2 — Hot Freight: deliver the crate to the Marina Hotel');
  return { mode: 'car', camX: -52, camY: 3.8, camZ: 26, lookX: -48.8, lookY: 1.3, lookZ: 44 };
}
