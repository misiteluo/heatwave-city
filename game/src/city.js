// HEATWAVE CITY — the city of Caldera Bay: street grid, procedural towers, palms,
// streetlights, landmark buildings with signs, the beach and the ocean.
// Exports the road network and collision boxes every other system navigates by.

import { CITY, WORLD, makeRng } from './config.js';
import { makeFacadeTexture, makeRoadTexture, makeSidewalkTexture, makeSandTexture, makeWaterTexture, makeSignTexture } from './textures.js';

const FACADE_PALETTES = [
  ['#e8b48c', '#b3543f'], ['#f2d5a0', '#7a9e9f'], ['#e59a7a', '#5d7d8c'],
  ['#f0e0b6', '#c96f4a'], ['#d98c6a', '#4f6f7a'], ['#ecc39a', '#8c5a72'],
];

export function buildCity(scene, rng) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const half = WORLD.half;

  // --- road network data -------------------------------------------------
  const roadsX = []; // vertical roads: constant x, traffic runs along z
  const roadsZ = []; // horizontal roads: constant z, traffic runs along x
  for (let i = 0; i <= CITY.blocks; i++) {
    const c = -half + i * CITY.pitch;
    roadsX.push(c); roadsZ.push(c);
  }
  const intersections = [];
  for (const x of roadsX) for (const z of roadsZ) intersections.push({ x, z });

  // --- ground base -------------------------------------------------------
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 1400),
    new THREE.MeshLambertMaterial({ color: 0x8d7f6e }),
  );
  base.rotation.x = -Math.PI / 2;
  base.position.set(0, -0.05, 120);
  base.receiveShadow = true;
  group.add(base);

  // --- roads --------------------------------------------------------------
  const roadTex = makeRoadTexture();
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const roadLen = half * 2 + CITY.road;
  function roadStrip(x, z, alongZ) {
    const tex = roadTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(1, roadLen / CITY.road * 2);
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const geo = new THREE.PlaneGeometry(CITY.road, roadLen);
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    if (!alongZ) m.rotation.z = Math.PI / 2;
    m.position.set(x, 0.02, z);
    m.receiveShadow = true;
    group.add(m);
    return m;
  }
  for (const x of roadsX) roadStrip(x, 0, true);
  for (const z of roadsZ) roadStrip(0, z, false);
  void roadMat;

  // --- blocks: sidewalk slab + buildings ---------------------------------
  const sidewalkTex = makeSidewalkTexture();
  const sidewalkMat = new THREE.MeshLambertMaterial({ map: sidewalkTex });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6e5648 });
  const facadeMats = FACADE_PALETTES.map(([baseCol, accent]) => {
    const tex = makeFacadeTexture(rng, baseCol, accent);
    return new THREE.MeshLambertMaterial({ map: tex });
  });

  const blockHalf = CITY.block / 2;
  for (let i = 0; i < CITY.blocks; i++) {
    for (let j = 0; j < CITY.blocks; j++) {
      const cx = -half + CITY.pitch / 2 + i * CITY.pitch + CITY.pitch / 2 - CITY.pitch / 2; // block centre
      const bx = (i - (CITY.blocks - 1) / 2) * CITY.pitch;
      const bz = (j - (CITY.blocks - 1) / 2) * CITY.pitch;
      void cx;
      // sidewalk quad
      const slab = new THREE.Mesh(new THREE.PlaneGeometry(CITY.block + 7, CITY.block + 7), sidewalkMat);
      slab.rotation.x = -Math.PI / 2;
      slab.position.set(bx, 0.04, bz);
      slab.receiveShadow = true;
      group.add(slab);

      // buildings: one tower or a pair per block
      const layout = rng();
      const spots = layout < 0.45
        ? [{ dx: 0, dz: 0, w: 30 + rng() * 8, d: 30 + rng() * 8 }]
        : [{ dx: -11, dz: -11, w: 19, d: 19 }, { dx: 11, dz: 11, w: 19, d: 19 }, ...(layout > 0.8 ? [{ dx: 11, dz: -11, w: 19, d: 19 }] : [])];
      for (const s of spots) {
        const downtown = Math.hypot(bx, bz) < 190;
        const h = downtown ? 26 + rng() * 42 : 11 + rng() * 22;
        const mat = facadeMats[Math.floor(rng() * facadeMats.length)];
        const geo = new THREE.BoxGeometry(s.w, h, s.d);
        const b = new THREE.Mesh(geo, [mat, mat, roofMat, roofMat, mat, mat]);
        b.position.set(bx + s.dx, h / 2, bz + s.dz);
        b.castShadow = true; b.receiveShadow = true;
        group.add(b);
        colliders.push({ minX: bx + s.dx - s.w / 2, maxX: bx + s.dx + s.w / 2, minZ: bz + s.dz - s.d / 2, maxZ: bz + s.dz + s.d / 2 });
        // rooftop box (lift housing / AC) for silhouette
        if (rng() < 0.6) {
          const cap = new THREE.Mesh(new THREE.BoxGeometry(s.w * 0.34, 2.4, s.d * 0.34), roofMat);
          cap.position.set(bx + s.dx, h + 1.2, bz + s.dz);
          cap.castShadow = true;
          group.add(cap);
        }
      }
    }
  }

  // --- palms ---------------------------------------------------------------
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6642 });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3e9e4f });
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 7, 5);
  const crownGeo = new THREE.ConeGeometry(2.9, 1.5, 7);
  function palm(x, z, lean) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 3.5; trunk.rotation.z = lean; trunk.castShadow = true;
    g.add(trunk);
    const crown = new THREE.Mesh(crownGeo, frondMat);
    crown.position.set(lean * -3.4, 7.3, 0);
    crown.rotation.x = Math.PI; // cone tip down reads as drooping fronds
    crown.castShadow = true;
    g.add(crown);
    g.position.set(x, 0, z);
    group.add(g);
  }
  for (let x = -half + 12; x < half; x += 30 + rng() * 16) palm(x, half + 34 + rng() * 8, (rng() - 0.5) * 0.16); // beach row
  for (let k = 0; k < 22; k++) { // scattered on block corners
    const bx = (Math.floor(rng() * CITY.blocks) - 4) * CITY.pitch + (rng() < 0.5 ? -25 : 25);
    const bz = (Math.floor(rng() * CITY.blocks) - 4) * CITY.pitch + (rng() < 0.5 ? -25 : 25);
    palm(bx, bz, (rng() - 0.5) * 0.2);
  }

  // --- streetlights ----------------------------------------------------------
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe6b0 });
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6.4, 5);
  const lampGeo = new THREE.BoxGeometry(1.5, 0.18, 0.4);
  for (const ix of intersections) {
    if (rng() < 0.68) continue;
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(ix.x + CITY.road / 2 - 0.6, 3.2, ix.z + CITY.road / 2 - 0.6);
    group.add(pole);
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(pole.position.x - 0.6, 6.4, pole.position.z);
    group.add(lamp);
  }

  // --- beach + ocean ---------------------------------------------------------
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 + 260, CITY.beachDepth), new THREE.MeshLambertMaterial({ map: makeSandTexture(), color: 0xdcc493 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.03, half + CITY.road / 2 + CITY.beachDepth / 2);
  sand.receiveShadow = true;
  group.add(sand);
  const waterTex = makeWaterTexture();
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 700, CITY.waterDepth),
    new THREE.MeshPhongMaterial({ map: waterTex, shininess: 90, specular: 0x99ccdd }),
  );
  water.rotation.x = -Math.PI / 2;
  const waterZ = half + CITY.road / 2 + CITY.beachDepth + CITY.waterDepth / 2;
  water.position.set(0, 0.12, waterZ);
  group.add(water);

  // --- landmark signs ---------------------------------------------------------
  function sign(text, x, z, ry, bg = '#263238', fg = '#ffd23e', w = 17) {
    const tex = makeSignTexture(text, bg, fg);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    m.position.set(x, 7.6, z); m.rotation.y = ry;
    group.add(m);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 7.4, 6), poleMat);
    post.position.set(x, 3.7, z);
    group.add(post);
    return m;
  }
  const landmarks = {
    spawn: { x: 30, z: 252 },
    safehouse: { x: 238, z: -208 },
    garage: { x: -238, z: 32 },
    bank: { x: 2, z: -238 },
    docks: { x: -225, z: 316 },
    beach: { x: 66, z: 314 },
    hospital: { x: 238, z: 208 },
    station: { x: -238, z: -208 },
  };
  sign('BANK OF CALDERA', landmarks.bank.x, landmarks.bank.z + 12, 0, '#1d3a5f', '#ffd23e', 24);
  sign('VOSS GARAGE', landmarks.garage.x + 10, landmarks.garage.z, Math.PI / 2, '#5d2f16', '#ffb45e', 19);
  sign('SAFEHOUSE', landmarks.safehouse.x - 10, landmarks.safehouse.z, -Math.PI / 2, '#274435', '#9fe8b0', 17);
  sign('HOSPITAL', landmarks.hospital.x - 10, landmarks.hospital.z, -Math.PI / 2, '#e8e8e8', '#d23b2e', 18);
  sign('CBPD', landmarks.station.x + 10, landmarks.station.z, Math.PI / 2, '#1d3a5f', '#bcd8ff', 13);

  // dock crates + a crane silhouette
  const crateMat = new THREE.MeshLambertMaterial({ color: 0xb3702f });
  const crate2Mat = new THREE.MeshLambertMaterial({ color: 0x3f6d8e });
  for (let k = 0; k < 9; k++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(5, 2.6, 2.6), k % 2 ? crateMat : crate2Mat);
    crate.position.set(landmarks.docks.x - 16 + (k % 3) * 7, 1.3 + Math.floor(k / 3) * 2.6 * (k > 5 ? 1 : 0), landmarks.docks.z - 6 + Math.floor(k / 3) * 6);
    crate.castShadow = true;
    group.add(crate);
    if (k < 3) colliders.push({ minX: crate.position.x - 2.5, maxX: crate.position.x + 2.5, minZ: crate.position.z - 1.3, maxZ: crate.position.z + 1.3 });
  }

  return {
    group, colliders, roadsX, roadsZ, intersections, landmarks,
    bounds: { minX: -half - 8, maxX: half + 8, minZ: -half - 8, maxZ: half + CITY.road / 2 + CITY.beachDepth - 2 },
    update(dt) { waterTex.offset.y -= dt * 0.014; waterTex.offset.x = Math.sin(performance.now() * 0.00006) * 0.02; },
  };
}

// Nearest point helpers used by AI drivers.
export function nearestRoadCoord(roads, v) {
  let best = roads[0], bd = Infinity;
  for (const r of roads) { const d = Math.abs(r - v); if (d < bd) { bd = d; best = r; } }
  return best;
}
