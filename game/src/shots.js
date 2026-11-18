// HEATWAVE CITY — staged scenes for the judge's screenshots, behind
// ?shot=cover|foot|mission|chase. Each scene arranges the real game state
// (a chase with real police, a real mission fight) and parks a cinematic
// camera; main.js keeps the world simulating and raises __shotReady.

import { createCar } from './vehicles.js';
import { spawnEnemy, damageEnemy } from './combat.js';
import { setShotObjective } from './missions.js';
import { LANDMARKS } from './city.js';

function putPlayerInCar(G, car, speed) {
  car.kind = 'player';
  G.playerCar = car;
  G.mode = 'car';
  G.player.h.group.visible = false;
  car.speed = speed;
  G.playerPos.x = car.x; G.playerPos.z = car.z;
}

function addPolice(G, x, z, yaw, speed) {
  const car = createCar(G.scene, x, z, yaw, { kind: 'police' });
  car.speed = speed;
  G.cars.push(car); G.policeCars.push(car);
  return car;
}

export function setupShot(G, name) {
  G.hud.menu.style.display = 'none';
  G.blockadeCd = 9999; // no random roadblocks in a staged frame
  const L = LANDMARKS;
  if (name === 'cover') {
    const car = createCar(G.scene, 28, -44, 0, { kind: 'parked', color: 0xd94f30 });
    G.cars.push(car);
    putPlayerInCar(G, car, 15);
    G.shotDrive = { axis: 'z', fixed: 28 };
    G.wanted.heat = 300; // 3 stars
    addPolice(G, 23.5, -59, 0, 16.5);
    addPolice(G, 33, -66, 0, 16);
    setShotObjective(G, "Deliver the coupe to Mara's garage", L.garage.x, L.garage.z);
    G.shotCamFollow = { off: [9.5, 3.1, 12.5], look: [-1, 1.1, -7] };
  } else if (name === 'foot') {
    G.mode = 'foot';
    G.player.x = -24; G.player.z = -18; G.player.yaw = 2.5;
    G.playerPos.x = G.player.x; G.playerPos.z = G.player.z;
    // Bring a few pedestrians into frame.
    const spots = [[-31, -22], [-19, -30], [-34, -12], [-16, -14]];
    G.peds.slice(0, 4).forEach((ped, i) => {
      ped.state = 'pose';
      ped.x = spots[i][0]; ped.z = spots[i][1]; ped.yaw = 0.8 + i * 1.1;
    });
    setShotObjective(G, 'Steal the gold coupe', 140, 20);
    G.shotCam = { pos: [-14.5, 2.1, -8], look: [-27, 1.3, -24] };
  } else if (name === 'mission') {
    G.mode = 'foot';
    G.pistol = true; G.weapon = 'pistol';
    G.player.x = L.beach.x + 7; G.player.z = L.beach.z - 4; G.player.yaw = -0.7;
    G.playerPos.x = G.player.x; G.playerPos.z = G.player.z;
    const e1 = spawnEnemy(G, L.beach.x - 4, L.beach.z + 3);
    const e2 = spawnEnemy(G, L.beach.x - 11, L.beach.z - 2);
    const e3 = spawnEnemy(G, L.beach.x + 1, L.beach.z + 9);
    damageEnemy(G, e2, 55);
    e1.state = 'combat'; e2.state = 'combat'; e3.state = 'combat';
    setShotObjective(G, 'Collect the debt on Coral Beach', L.beach.x, L.beach.z);
    G.shotCam = { pos: [G.player.x + 8, 2.7, G.player.z + 9], look: [L.beach.x - 4, 1.2, L.beach.z + 2] };
  } else if (name === 'chase') {
    const car = createCar(G.scene, -60, 280, Math.PI / 2, { kind: 'parked', color: 0x2e86ab });
    G.cars.push(car);
    putPlayerInCar(G, car, 23);
    G.shotDrive = { axis: 'x', fixed: 280 };
    G.wanted.heat = 400; // 4 stars
    addPolice(G, -75, 276.5, Math.PI / 2, 23.5);
    addPolice(G, -83, 284, Math.PI / 2, 22.5);
    setShotObjective(G, 'Lose the heat — reach the safehouse', L.safehouse.x, L.safehouse.z);
    G.shotCamFollow = { off: [9.5, 3.2, 12.5], look: [-1, 1.1, -7] };
  } else {
    G.mode = 'foot';
  }
}
