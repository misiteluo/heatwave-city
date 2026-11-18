// HEATWAVE CITY — procedural city: 9x9 blocks of canvas-textured buildings,
// roads with lane dashes, sidewalks, palms, lamps, the beach, the ocean and a
// marina dock. Returns building colliders and the named landmark points the
// missions use.

import { THREE, PITCH, BLOCK_HALF, GRID, BEACH_Z, WATER_Z, WORLD_HALF, ROADS, rr, ri, rnd, pick } from './config.js';
import { buildingTexture, roofTexture, roadTexture, sidewalkTexture, sandTexture, grassTexture } from './textures.js';

export const LANDMARKS = {
  safehouse: { x: -248, z: -224, name: 'Safehouse' },
  garage: { x: 238, z: -84, name: "Mara's Garage" },
  bank: { x: 0, z: -140, name: 'Heatwave Bank' },
  hotel: { x: -140, z: 84, name: 'Palms Hotel' },
  warehouse: { x: 224, z: 196, name: 'Dock Warehouse' },
  beach: { x: -60, z: 302, name: 'Coral Beach' },
  dock: { x: 180, z: 352, name: 'Marina Dock' },
};

const mat = (opts) => new THREE.MeshLambertMaterial(opts);

export function buildCity(scene) {
  const colliders = [];
  const group = new THREE.Group(); scene.add(group);

  // --- ground base -------------------------------------------------------
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2), mat({ map: grassTexture() }));
  grass.rotation.x = -Math.PI / 2; grass.position.y = -0.05; grass.receiveShadow = true; group.add(grass);

  // --- roads ---------------------------------------------------------------
  const roadTex = roadTexture();
  const roadMat = mat({ map: roadTex });
  const plainMat = mat({ color: 0x3c4148 });
  const cityLen = 560; // z from -280 to 280
  for (const x of ROADS) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(16, cityLen), roadMat);
    p.rotation.x = -Math.PI / 2; p.position.set(x, 0.02, 0); p.receiveShadow = true; group.add(p);
  }
  for (const z of ROADS) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(cityLen, 16), roadMat);
    p.rotation.x = -Math.PI / 2; p.rotation.z = Math.PI / 2; p.position.set(0, 0.03, z); p.receiveShadow = true; group.add(p);
    for (const x of ROADS) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(16.4, 16.4), plainMat);
      s.rotation.x = -Math.PI / 2; s.position.set(x, 0.045, z); s.receiveShadow = true; group.add(s);
    }
  }
  // coast road along the beach
  const coast = new THREE.Mesh(new THREE.PlaneGeometry(cityLen, 16), roadMat);
  coast.rotation.x = -Math.PI / 2; coast.rotation.z = Math.PI / 2; coast.position.set(0, 0.03, 280); coast.receiveShadow = true; group.add(coast);

  // --- beach + ocean ---------------------------------------------------------
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_HALF * 2, WATER_Z - 244 + 40), mat({ map: sandTexture() }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.01, (244 + WATER_Z + 36) / 2); sand.receiveShadow = true; group.add(sand);
  const waterMat = mat({ color: 0x2e8fb8, transparent: true, opacity: 0.92 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF - WATER_Z + 200), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.12, (WATER_Z + WORLD_HALF + 180) / 2); group.add(water);

  // --- blocks: sidewalks + buildings -----------------------------------------
  const roofTex = roofTexture();
  const sideMat = mat({ map: sidewalkTexture() });
  const roofMat = mat({ map: roofTex });
  for (let i = -GRID; i <= GRID; i++) for (let j = -GRID; j <= GRID; j++) {
    const cx = i * PITCH, cz = j * PITCH;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(BLOCK_HALF * 2 + 4, 0.24, BLOCK_HALF * 2 + 4), sideMat);
    slab.position.set(cx, 0.12, cz); slab.receiveShadow = true; group.add(slab);
    const layout = rnd();
    const spots = layout < 0.4
      ? [{ dx: 0, dz: 0, s: rr(24, 33) }]
      : layout < 0.75
        ? [{ dx: -10, dz: -10, s: rr(13, 17) }, { dx: 10, dz: -10, s: rr(13, 17) }, { dx: -10, dz: 10, s: rr(13, 17) }, { dx: 10, dz: 10, s: rr(13, 17) }]
        : [{ dx: -10, dz: 0, s: rr(14, 18) }, { dx: 10, dz: 0, s: rr(14, 18) }];
    for (const sp of spots) {
      const floors = ri(4, 14);
      const h = floors * rr(2.6, 3.2);
      const face = mat({ map: buildingTexture(floors) });
      const b = new THREE.Mesh(new THREE.BoxGeometry(sp.s, h, sp.s), [face, face, roofMat, roofMat, face, face]);
      b.position.set(cx + sp.dx, h / 2 + 0.24, cz + sp.dz);
      b.castShadow = true; b.receiveShadow = true; group.add(b);
      colliders.push({ x0: cx + sp.dx - sp.s / 2, z0: cz + sp.dz - sp.s / 2, x1: cx + sp.dx + sp.s / 2, z1: cz + sp.dz + sp.s / 2 });
      if (h > 26 && rnd() < 0.7) { // rooftop clutter on towers
        const ac = new THREE.Mesh(new THREE.BoxGeometry(sp.s * 0.3, 1.6, sp.s * 0.3), mat({ color: 0x9a8d7c }));
        ac.position.set(cx + sp.dx + rr(-4, 4), h + 1, cz + sp.dz + rr(-4, 4)); group.add(ac);
      }
    }
    // palms on some block corners
    if (rnd() < 0.55) addPalm(group, cx + (rnd() < 0.5 ? -BLOCK_HALF - 1 : BLOCK_HALF + 1), cz + rr(-BLOCK_HALF, BLOCK_HALF));
  }

  // --- beach palms + dock -------------------------------------------------------
  for (let x = -260; x <= 260; x += 26) if (rnd() < 0.8) addPalm(group, x + rr(-5, 5), 300 + rr(-4, 6));
  const dockMat = mat({ color: 0x8a6844 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 64), dockMat);
  pier.position.set(LANDMARKS.dock.x, 0.6, 348); pier.castShadow = true; group.add(pier);
  for (let z = 322; z <= 378; z += 14) for (const dx of [-4.4, 4.4]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.4, 6), dockMat);
    post.position.set(LANDMARKS.dock.x + dx, 0.4, z); group.add(post);
  }

  // --- street lamps at intersections ----------------------------------------------
  const lampPole = mat({ color: 0x444a52 });
  const lampHead = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 5.6, 5);
  const headGeo = new THREE.BoxGeometry(0.7, 0.22, 0.7);
  for (const x of ROADS) for (const z of ROADS) {
    if ((Math.round(x / 28) + Math.round(z / 28)) % 2 !== 0) continue;
    const pole = new THREE.Mesh(poleGeo, lampPole);
    pole.position.set(x + 9, 2.8, z + 9); group.add(pole);
    const head = new THREE.Mesh(headGeo, lampHead);
    head.position.set(x + 9, 5.7, z + 9); group.add(head);
  }

  // --- backdrop skyline silhouettes ---------------------------------------------------
  const skyMat = mat({ color: 0x7d94a8 });
  for (let k = 0; k < 26; k++) {
    const a = (k / 26) * Math.PI * 2;
    if (Math.sin(a) > 0.55) continue; // keep the sea horizon clear
    const d = rr(430, 520), h = rr(30, 95), w = rr(22, 44);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), skyMat);
    b.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d); group.add(b);
  }

  let t = 0;
  return {
    colliders,
    landmarks: LANDMARKS,
    update(dt) { t += dt; waterMat.color.setHSL(0.55, 0.62, 0.42 + Math.sin(t * 0.7) * 0.03); },
  };
}

const trunkMat = mat({ color: 0x8a6844 });
const frondMat = mat({ color: 0x3f9e4d });
const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 5.4, 6);
const frondGeo = new THREE.BoxGeometry(0.5, 0.08, 3.6);
function addPalm(group, x, z) {
  const palm = new THREE.Group();
  const lean = rr(-0.14, 0.14);
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 2.7; trunk.rotation.z = lean; trunk.castShadow = true; palm.add(trunk);
  const topX = -Math.sin(lean) * 5.2;
  for (let k = 0; k < 6; k++) {
    const f = new THREE.Mesh(frondGeo, frondMat);
    const a = (k / 6) * Math.PI * 2 + rr(-0.3, 0.3);
    f.position.set(topX + Math.sin(a) * 1.4, 5.5 + rr(-0.2, 0.2), Math.cos(a) * 1.4);
    f.rotation.y = a; f.rotation.z = rr(0.25, 0.5) * (Math.sin(a) >= 0 ? 1 : -1);
    f.castShadow = true; palm.add(f);
  }
  palm.position.set(x, 0, z);
  palm.rotation.y = rr(0, Math.PI * 2);
  group.add(palm);
}
