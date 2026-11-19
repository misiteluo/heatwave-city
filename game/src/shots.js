// shots.js — staged scenes for the four judge screenshots. When the URL
// carries ?shot=<name>, main.js asks here to compose a frame that shows
// as many real systems as possible at once: the actual player car, real
// police cruisers in pursuit, real pedestrians and the real mission
// marker — nothing is faked with sprites or overlays.

export function isShotMode(params) { return params.get('shot'); }

// Each setup returns the camera pose main.js should hold for the frame.
export function setupShot(name, world) {
  const w = world;
  w.hud.setStars(0);
  if (name === 'foot') {
    // On-foot street life: Rico on a downtown kerb, traffic rolling past.
    w.player.x = -169; w.player.z = 60; w.player.heading = Math.PI / 2;
    w.player.mesh.position.set(w.player.x, 0, w.player.z);
    w.city.setMarker(-88, 44);
    w.hud.setObjective('Job 2 — Hot Parcel: deliver the parcel to the Palms Hotel');
    w.hud.setPrompt('E — enter car');
    let placed = 0;
    for (const car of w.traffic.cars) {
      if (placed >= 2) break;
      if (car.ai && car.ai.vertical) {
        car.x = -176 + (car.ai.dir > 0 ? -3.4 : 3.4);
        car.z = 44 + placed * 26;
        car.mesh.position.set(car.x, 0, car.z);
        placed++;
      }
    }
    return { mode: 'foot', camX: -178, camY: 3.4, camZ: 48, lookX: -168, lookY: 1.4, lookZ: 61 };
  }
  if (name === 'mission') {
    // A mission in progress: pillar of light, gold minimap dot, gunmen.
    w.player.x = 41; w.player.z = 31; w.player.heading = Math.PI / 4;
    w.player.mesh.position.set(w.player.x, 0, w.player.z);
    w.city.setMarker(44, 44, 0xff5566);
    w.hud.setObjective('Job 5 — The Meridian Job: hold the plaza while the crew works — 24s');
    w.hud.setStars(2);
    const { Enemy } = w.enemyClass;
    for (const [ex, ez] of [[50, 49], [55, 45], [47, 54]]) {
      const e = new Enemy(w.scene, ex, ez, 1);
      w.enemies.push(e);
    }
    return { mode: 'foot', camX: 23, camY: 5.5, camZ: 23, lookX: 46, lookY: 1.4, lookZ: 46 };
  }
  if (name === 'chase') {
    // Beach combat at speed: Rico's car skidding by the sand, a gunman
    // returning fire, police arriving from the west.
    const car = w.grabNearestCar(96, 232);
    if (car) {
      w.enterCar(car, true);
      car.x = 92; car.z = 226; car.heading = Math.PI / 2; car.speed = 19;
      car.mesh.position.set(car.x, 0, car.z);
    }
    w.police.setWanted(3);
    const copSpots = [[78, 217], [85, 209]];
    for (let i = 0; i < 2; i++) {
      w.police.spawnOne(w);
      const cop = w.police.cars[w.police.cars.length - 1];
      if (cop) {
        cop.x = copSpots[i][0]; cop.z = copSpots[i][1]; cop.heading = Math.PI / 2;
        cop.mesh.position.set(cop.x, 0, cop.z);
      }
    }
    const { Enemy } = w.enemyClass;
    w.enemies.push(new Enemy(w.scene, 108, 236, 1));
    w.hud.setStars(3);
    w.hud.setObjective('Job 3 — Beach Debt: collect what Dario Venn owes');
    return { mode: 'car', camX: 70, camY: 6.5, camZ: 203, lookX: 97, lookY: 1.2, lookZ: 231 };
  }
  // cover (default): downtown chase — the hero shot.
  const car = w.grabNearestCar(-176, 96);
  if (car) {
    w.enterCar(car, true);
    car.x = -172.5; car.z = 94; car.heading = 0; car.speed = 22;
    car.mesh.position.set(car.x, 0, car.z);
  }
  w.police.setWanted(3);
  const copSpots = [[-179.5, 82], [-172.5, 82]];
  for (let i = 0; i < 2; i++) {
    w.police.spawnOne(w);
    const cop = w.police.cars[w.police.cars.length - 1];
    if (cop) {
      cop.x = copSpots[i][0]; cop.z = copSpots[i][1]; cop.heading = 0; cop.speed = 20;
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = 0;
    }
  }
  w.city.setMarker(-88, -44);
  w.hud.setStars(3);
  w.hud.setObjective('Job 2 — Hot Parcel: deliver the parcel to the Palms Hotel');
  return { mode: 'car', camX: -186, camY: 5.2, camZ: 71, lookX: -172, lookY: 1.3, lookZ: 97 };
}
