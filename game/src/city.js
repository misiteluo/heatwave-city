// city.js — the static world of Heatwave City: a 12x12-block peninsula
// of districts (downtown towers, the Neon Mile, portside sheds, marina
// resorts, the beachfront), a causeway out to Gull Island, Pelican Cay
// across the bay, piers, palms, lamps and working traffic lights — all
// under a full day-night sun cycle. Buildings are merged into a handful
// of big meshes by material, so the whole city costs a few dozen draw
// calls. Owns the building colliders, the land test every mover uses,
// and the mission marker pillar.

import {
  GRID, PITCH, BLOCK, HALF, LAND, SAND_Z, SEA_X, CAUSEWAY_HALF, ISLAND, CAY,
  blockCentre, districtAt, DISTRICT_STYLE, SPECIAL_LOTS,
  makeRng, clamp, lerp,
} from './config.js';
import {
  facadeStyle, shopTexture, signTexture, sandTexture, seaTexture, grassTexture,
  concreteTexture, asphaltTexture, containerTexture, resortTexture,
} from './textures.js';

// ------------------------------------------------------------ merging
// A bucket gathers transformed box geometry for one material; build()
// turns it into a single mesh.
class Bucket {
  constructor() { this.pos = []; this.nor = []; this.uv = []; }
  add(geo, x, y, z, ry = 0, uvScale = null) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (uvScale) {
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale[0], uv.getY(i) * uvScale[1]);
    }
    const m = new THREE.Matrix4().makeRotationY(ry);
    m.setPosition(x, y, z);
    g.applyMatrix4(m);
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      this.uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
    }
    g.dispose();
  }
  box(w, h, d, x, y, z, ry = 0, uvScale = null) {
    this.add(new THREE.BoxGeometry(w, h, d), x, y, z, ry, uvScale);
  }
  mesh(material, shadows = true) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = shadows; mesh.receiveShadow = shadows;
    return mesh;
  }
}

const SHOP_NAMES = ['TACO SOL', 'PAWN & CO', 'CLUB SABLE', 'NOODLE BAR', 'LIQUOR 24H', 'SURF SHACK', 'GYM 305', 'CAFÉ LUNA'];

// Walkable dock rectangles (east-bay piers + south-beach boat docks).
export const DOCK_RECTS = [
  ...[-120, -40, 40, 130].map((pz) => ({ minX: 315, maxX: 361, minZ: pz - 3, maxZ: pz + 3 })),
  ...[120, 175, 230].map((px) => ({ minX: px - 2.5, maxX: px + 2.5, minZ: 317, maxZ: 347 })),
];
const CONTAINER_COLORS = ['#c0392b', '#2471a3', '#229954', '#b7950b', '#7d3c98'];

export class City {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = makeRng(seed * 7919 + 29);
    this.colliders = [];
    this.roadsX = []; this.roadsZ = [];
    for (let i = 0; i <= GRID; i++) { this.roadsX.push(-HALF + i * PITCH); this.roadsZ.push(-HALF + i * PITCH); }
    this.marker = null; this.markerRing = null; this.markerPos = null;
    this.fixedTod = null;
    this.tod = 0.32;
    this.lightTimer = 0;
    this.lightPhase = 0; // 0 NS green, 1 NS yellow, 2 EW green, 3 EW yellow
    this.facadeMats = [];
    this.build();
  }

  // ---------------------------------------------------------- queries
  groundY(x, z) {
    for (const d of DOCK_RECTS) {
      if (x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ) return 0.85;
    }
    if (Math.hypot(x - ISLAND.x, z - ISLAND.z) <= ISLAND.r) return 0.12;
    if (Math.hypot(x - CAY.x, z - CAY.z) <= CAY.r) return 0.12;
    if (Math.abs(x) <= CAUSEWAY_HALF && z >= SAND_Z - 6 && z <= ISLAND.z) return 0.1;
    if (Math.abs(x) <= LAND && z >= -LAND && z <= SAND_Z) {
      const lx = ((x + HALF) % PITCH + PITCH) % PITCH;
      const lz = ((z + HALF) % PITCH + PITCH) % PITCH;
      if (lx >= 6 && lx <= PITCH - 6 && lz >= 6 && lz <= PITCH - 6) return 0.5; // block slab
      return 0; // road surface
    }
    if (x > LAND && x <= SEA_X && z >= -LAND && z <= SAND_Z) return 0.12; // boardwalk
    if (Math.abs(x) <= LAND + 20 && z > SAND_Z && z <= SAND_Z + 26) return 0.06; // beach
    return 0;
  }

  isLand(x, z) {
    for (const d of DOCK_RECTS) {
      if (x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ) return true;
    }
    if (Math.hypot(x - ISLAND.x, z - ISLAND.z) <= ISLAND.r - 1) return true;
    if (Math.hypot(x - CAY.x, z - CAY.z) <= CAY.r - 1) return true;
    if (Math.abs(x) <= CAUSEWAY_HALF + 0.5 && z >= SAND_Z - 8 && z <= ISLAND.z) return true;
    if (Math.abs(x) <= LAND && z >= -LAND && z <= SAND_Z + 14) return true;
    if (x > LAND && x <= SEA_X && z >= -LAND && z <= SAND_Z) return true; // boardwalk strip
    return false;
  }

  isWater(x, z) { return !this.isLand(x, z); }

  heightAt(x, z) {
    let h = this.groundY(x, z);
    for (const b of this.colliders) {
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && b.h > h) h = b.h;
    }
    return h;
  }

  addCollider(cx, cz, w, d, h) {
    this.colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h });
  }

  collide(pos, radius) {
    let hit = false;
    for (const b of this.colliders) {
      const nx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const nz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      const dx = pos.x - nx, dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        hit = true;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          pos.x = nx + (dx / d) * radius;
          pos.z = nz + (dz / d) * radius;
        } else {
          const left = pos.x - b.minX, right = b.maxX - pos.x;
          const top = pos.z - b.minZ, bot = b.maxZ - pos.z;
          const m = Math.min(left, right, top, bot);
          if (m === left) pos.x = b.minX - radius;
          else if (m === right) pos.x = b.maxX + radius;
          else if (m === top) pos.z = b.minZ - radius;
          else pos.z = b.maxZ + radius;
        }
      }
    }
    return hit;
  }

  // axis: 'NS' (travel along z) or 'EW' (travel along x)
  lightState(axis) {
    if (axis === 'NS') return this.lightPhase === 0 ? 'green' : this.lightPhase === 1 ? 'yellow' : 'red';
    return this.lightPhase === 2 ? 'green' : this.lightPhase === 3 ? 'yellow' : 'red';
  }

  // ------------------------------------------------------------ build
  build() {
    const rng = this.rng, scene = this.scene;
    scene.background = new THREE.Color(0x87b5d6);
    scene.fog = new THREE.Fog(0xc8d8e2, 240, 980);
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0xffe0b3, 0.7);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffe9bb, 1.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -150; sc.right = 150; sc.top = 150; sc.bottom = -150; sc.far = 700;
    this.sun.shadow.bias = -0.0006;
    scene.add(this.sun); scene.add(this.sun.target);

    // facade styles & shared materials
    const styleDefs = [
      ['#ffe3b3', 8, 4], ['#ffc4b2', 10, 5], ['#fff0c2', 6, 4], ['#cfe8ff', 12, 5],
      ['#ffd3e0', 7, 4], ['#d9ffcb', 9, 5], ['#e8e0ff', 11, 4], ['#ffd9a8', 5, 3],
    ];
    this.styleBuckets = styleDefs.map(([tint, floors, cols], i) => {
      const st = facadeStyle(makeRng(1000 + i * 77), tint, floors, cols);
      const mat = new THREE.MeshLambertMaterial({
        map: st.map, emissiveMap: st.emissive, emissive: 0xffc37a, emissiveIntensity: 0,
      });
      this.facadeMats.push(mat);
      return new Bucket();
    });
    this.roofBucket = new Bucket();
    this.roofMat = new THREE.MeshLambertMaterial({ color: 0x74584a });
    this.concBucket = new Bucket();
    this.concMat = new THREE.MeshLambertMaterial({ map: concreteTexture(rng) });
    this.shopBuckets = SHOP_NAMES.map((name, i) => {
      const mat = new THREE.MeshLambertMaterial({
        map: shopTexture(makeRng(500 + i), ['#f7e8c9', '#ffd9de', '#d3f2e8', '#fdeec2'][i % 4], name,
          ['#ff5964', '#118ab2', '#e63946', '#06d6a0'][i % 4]),
      });
      this['shopMat' + i] = mat;
      return new Bucket();
    });
    this.resortBucket = new Bucket();
    this.resortMat = new THREE.MeshLambertMaterial({ map: resortTexture(rng, '#f3ead8') });
    this.containerBuckets = CONTAINER_COLORS.map((c) => new Bucket());
    this.containerMats = CONTAINER_COLORS.map((c) => new THREE.MeshLambertMaterial({ map: containerTexture(rng, c) }));
    this.plainBuckets = new Map();
    this.plainBucket = (color) => {
      if (!this.plainBuckets.has(color)) this.plainBuckets.set(color, { bucket: new Bucket(), mat: new THREE.MeshLambertMaterial({ color }) });
      return this.plainBuckets.get(color).bucket;
    };

    this.buildGround();
    this.buildBlocks();
    this.buildIsland(ISLAND, true);
    this.buildIsland(CAY, false);
    this.buildMarina();
    this.buildPalmsAndLamps();
    this.buildTrafficLights();
    this.buildSigns();

    // flush buckets
    this.styleBuckets.forEach((b, i) => scene.add(b.mesh(this.facadeMats[i])));
    scene.add(this.roofBucket.mesh(this.roofMat));
    scene.add(this.concBucket.mesh(this.concMat));
    this.shopBuckets.forEach((b, i) => scene.add(b.mesh(this['shopMat' + i])));
    scene.add(this.resortBucket.mesh(this.resortMat));
    this.containerBuckets.forEach((b, i) => scene.add(b.mesh(this.containerMats[i])));
    for (const { bucket, mat } of this.plainBuckets.values()) scene.add(bucket.mesh(mat));
  }

  buildGround() {
    const rng = this.rng, scene = this.scene;
    // sea first (under everything)
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500),
      new THREE.MeshLambertMaterial({ map: seaTexture(rng), transparent: true, opacity: 0.96 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(60, -0.25, 160);
    scene.add(sea);
    this.sea = sea;
    // asphalt slab for the whole road grid
    const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(LAND * 2 + 60, LAND * 2 + 70),
      new THREE.MeshLambertMaterial({ map: asphaltTexture(rng) }));
    asphalt.rotation.x = -Math.PI / 2;
    asphalt.position.set(0, -0.02, 8);
    asphalt.receiveShadow = true;
    scene.add(asphalt);
    // east boardwalk strip
    const board = new THREE.Mesh(new THREE.BoxGeometry(SEA_X - LAND, 0.24, LAND * 2),
      new THREE.MeshLambertMaterial({ color: 0x9a7a54 }));
    board.position.set((LAND + SEA_X) / 2, 0, 0);
    board.receiveShadow = true;
    scene.add(board);
    // beach sand
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(LAND * 2 + 130, 34),
      new THREE.MeshLambertMaterial({ map: sandTexture(rng) }));
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.04, SAND_Z + 15);
    sand.receiveShadow = true;
    scene.add(sand);
    // causeway to Gull Island: deck + rails
    const cwLen = ISLAND.z - ISLAND.r - (SAND_Z - 8);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(CAUSEWAY_HALF * 2, 1, cwLen),
      new THREE.MeshLambertMaterial({ color: 0x4a4f57 }));
    deck.position.set(0, -0.4, SAND_Z - 8 + cwLen / 2);
    deck.receiveShadow = true;
    scene.add(deck);
    const railB = this.plainBucket(0xd8d2c4);
    for (const sx of [-CAUSEWAY_HALF + 0.4, CAUSEWAY_HALF - 0.4]) {
      railB.box(0.5, 0.8, cwLen, sx, 0.5, SAND_Z - 8 + cwLen / 2);
    }
    // lane dashes on roads + causeway, merged
    const dashB = new Bucket();
    const dashGeo = new THREE.BoxGeometry(0.35, 0.05, 4.2);
    const dashGeoH = new THREE.BoxGeometry(4.2, 0.05, 0.35);
    for (const x of this.roadsX) {
      for (let z = -HALF + 10; z < HALF - 4; z += 11) {
        if (this.roadsZ.some((rz) => Math.abs(rz - z) < 10)) continue;
        dashB.add(dashGeo, x, 0.03, z);
      }
    }
    for (const z of this.roadsZ) {
      for (let x = -HALF + 10; x < HALF - 4; x += 11) {
        if (this.roadsX.some((rx) => Math.abs(rx - x) < 10)) continue;
        dashB.add(dashGeoH, x, 0.03, z);
      }
    }
    for (let z = SAND_Z + 4; z < ISLAND.z - ISLAND.r + 8; z += 11) dashB.add(dashGeo, 0, 0.13, z);
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xf7e08a });
    const dashes = dashB.mesh(dashMat, false);
    dashes.castShadow = false; dashes.receiveShadow = false;
    scene.add(dashes);
  }

  // one building into a style bucket + roof cap + collider
  building(cx, cz, w, d, h, styleIdx, baseY = 0.5) {
    const b = this.styleBuckets[styleIdx % this.styleBuckets.length];
    b.box(w, h, d, cx, baseY + h / 2, cz, 0, [Math.max(1, w / 12), Math.max(1, h / 26)]);
    this.roofBucket.box(w + 0.4, 0.4, d + 0.4, cx, baseY + h + 0.2, cz);
    if (h > 26) this.roofBucket.box(w * 0.36, 2.2, d * 0.36, cx, baseY + h + 1.3, cz);
    this.addCollider(cx, cz, w, d, baseY + h);
  }

  buildBlocks() {
    const rng = this.rng;
    for (let bi = 0; bi < GRID; bi++) {
      for (let bj = 0; bj < GRID; bj++) {
        const cx = blockCentre(bi), cz = blockCentre(bj);
        // sidewalk slab (kept clear of the running lanes)
        this.concBucket.box(BLOCK + 2, 0.5, BLOCK + 2, cx, 0.25, cz, 0, [3, 3]);
        const key = bi + ',' + bj;
        const district = districtAt(bi, bj);
        if (SPECIAL_LOTS[key]) { this.buildSpecial(SPECIAL_LOTS[key], cx, cz, district); continue; }
        const st = DISTRICT_STYLE[district];
        const style = Math.floor(rng() * this.styleBuckets.length);
        if (st.lots === 'towers') {
          const w = 19 + rng() * 7, d = 19 + rng() * 7;
          const h = st.minH + rng() * (st.maxH - st.minH);
          this.building(cx + (rng() - 0.5) * 4, cz + (rng() - 0.5) * 4, w, d, h, style);
          if (rng() < 0.5) this.building(cx - 11, cz + 11, 9, 9, 6 + rng() * 5, style);
        } else if (st.lots === 'sheds') {
          const shed = this.plainBucket(0x8d99ae);
          const w = 24 + rng() * 6, d = 16 + rng() * 5, h = st.minH + rng() * (st.maxH - st.minH);
          shed.box(w, h, d, cx, 0.5 + h / 2, cz, 0, [2, 1]);
          this.roofBucket.box(w + 0.4, 0.4, d + 0.4, cx, 0.5 + h + 0.2, cz);
          this.addCollider(cx, cz, w, d, 0.5 + h);
          for (let i = 0; i < 3; i++) {
            const cb = this.containerBuckets[Math.floor(rng() * this.containerBuckets.length)];
            const px = cx + (rng() - 0.5) * 22, pz = cz + 12 + rng() * 3;
            cb.box(6, 2.6, 2.4, px, 1.8, pz, rng() < 0.5 ? 0 : Math.PI / 2);
            this.addCollider(px, pz, 6, 2.6, 3.1);
          }
        } else if (st.lots === 'neon') {
          const h = st.minH + rng() * (st.maxH - st.minH);
          this.building(cx, cz - 4, 22, 20, h, style);
          const shop = this.shopBuckets[Math.floor(rng() * this.shopBuckets.length)];
          shop.box(24, 6.5, 10, cx, 3.75, cz + 11);
          this.addCollider(cx, cz + 11, 24, 10, 7);
        } else if (st.lots === 'low' || district === 'marina') {
          // resort hotels on the marina, shops elsewhere
          if (district === 'marina' && rng() < 0.6) {
            const h = st.minH + rng() * (st.maxH - st.minH);
            this.resortBucket.box(20, h, 16, cx, 0.5 + h / 2, cz, 0, [1.6, Math.max(1, h / 24)]);
            this.roofBucket.box(20.4, 0.4, 16.4, cx, 0.5 + h + 0.2, cz);
            this.addCollider(cx, cz, 20, 16, 0.5 + h);
          } else {
            const shop = this.shopBuckets[Math.floor(rng() * this.shopBuckets.length)];
            shop.box(15, 6.5, 20, cx - 8, 3.75, cz);
            this.addCollider(cx - 8, cz, 15, 20, 7);
            this.building(cx + 9, cz, 13, 15, st.minH + rng() * 8, style);
          }
        } else {
          // mixed: 2–3 mid buildings
          const n = 2 + Math.floor(rng() * 2);
          const spots = [[-8.5, -8.5], [8.5, 8.5], [-8.5, 8.5], [8.5, -8.5]];
          for (let i = 0; i < n; i++) {
            const [ox, oz] = spots[i];
            const h = st.minH + rng() * (st.maxH - st.minH);
            this.building(cx + ox, cz + oz, 13 + rng() * 3, 13 + rng() * 3, h, Math.floor(rng() * this.styleBuckets.length));
          }
        }
      }
    }
  }

  buildSpecial(lot, cx, cz, district) {
    const rng = this.rng;
    const planter = this.plainBucket(0x5da85f);
    const dark = this.plainBucket(0x3c4148);
    if (lot === 'plaza') {
      // Meridian Bank plaza: fountain + planters + the bank itself on the north edge
      const bank = this.styleBuckets[1];
      bank.box(30, 24, 10, cx, 0.5 + 12, cz - 13, 0, [2.5, 1]);
      this.roofBucket.box(30.4, 0.4, 10.4, cx, 0.5 + 24.2, cz - 13);
      this.addCollider(cx, cz - 13, 30, 10, 24.5);
      const basin = this.plainBucket(0x9fd8ef);
      basin.add(new THREE.CylinderGeometry(5, 5.6, 1, 18), cx, 1, cz + 2);
      this.addCollider(cx, cz + 2, 9, 9, 1.5);
      for (const [ox, oz] of [[-12, -6], [12, -6], [-12, 10], [12, 10]]) {
        planter.box(5, 1.1, 5, cx + ox, 1.05, cz + oz);
        this.addCollider(cx + ox, cz + oz, 5, 5, 1.6);
      }
    } else if (lot === 'garage') {
      const g = this.plainBucket(0xb08968);
      g.box(26, 8, 22, cx, 4.5, cz);
      this.roofBucket.box(26.4, 0.4, 22.4, cx, 8.7, cz);
      this.addCollider(cx, cz, 26, 22, 9);
      const door = this.plainBucket(0x565d66);
      door.box(12, 5.5, 0.4, cx, 3.2, cz + 11.2);
    } else if (lot === 'parking' || lot === 'beachlot') {
      dark.box(BLOCK, 0.56, BLOCK, cx, 0.28, cz, 0, [3, 3]);
      const lineB = this.plainBucket(0xf8f7ff);
      for (let i = -2; i <= 2; i++) lineB.box(0.3, 0.06, 9, cx + i * 6, 0.6, cz);
    } else if (lot === 'helipad') {
      const pad = this.plainBucket(0x565d66);
      pad.add(new THREE.CylinderGeometry(11, 11, 0.3, 24), cx, 0.42, cz);
      const hB = this.plainBucket(0xffd23f);
      hB.box(0.8, 0.08, 5, cx - 1.3, 0.6, cz); hB.box(0.8, 0.08, 5, cx + 1.3, 0.6, cz);
      hB.box(1.8, 0.08, 0.8, cx, 0.6, cz);
    } else if (lot === 'park') {
      const grass = new THREE.Mesh(new THREE.BoxGeometry(BLOCK, 0.56, BLOCK),
        new THREE.MeshLambertMaterial({ map: grassTexture(rng) }));
      grass.position.set(cx, 0.28, cz); grass.receiveShadow = true;
      this.scene.add(grass);
      const pond = this.plainBucket(0x4cc9f0);
      pond.add(new THREE.CylinderGeometry(6, 6, 0.3, 16), cx - 6, 0.6, cz + 5);
    } else if (lot === 'hospital') {
      const white = this.plainBucket(0xf4f6f8);
      white.box(26, 20, 18, cx, 10.5, cz, 0, [2, 1]);
      this.roofBucket.box(26.4, 0.4, 18.4, cx, 20.7, cz);
      this.addCollider(cx, cz, 26, 18, 21);
      const cross = this.plainBucket(0xe63946);
      cross.box(1, 5, 0.5, cx, 15, cz + 9.3); cross.box(3.4, 1.4, 0.5, cx, 15, cz + 9.3);
    } else if (lot === 'casino') {
      const c = this.styleBuckets[4];
      c.box(30, 26, 20, cx, 0.5 + 13, cz - 4, 0, [2.5, 1.1]);
      this.roofBucket.box(30.4, 0.4, 20.4, cx, 0.5 + 26.2, cz - 4);
      this.addCollider(cx, cz - 4, 30, 20, 26.5);
      const basin = this.plainBucket(0x9fd8ef);
      basin.add(new THREE.CylinderGeometry(4, 4.5, 1, 16), cx, 1, cz + 11);
      this.addCollider(cx, cz + 11, 8, 8, 1.5);
    } else if (lot === 'dockclub') {
      const shop = this.shopBuckets[3];
      shop.box(20, 6.5, 12, cx, 3.75, cz - 6);
      this.addCollider(cx, cz - 6, 20, 12, 7);
      dark.box(24, 0.56, 12, cx, 0.28, cz + 8, 0, [2, 1]);
    } else if (lot.startsWith('hideout')) {
      // a walled courtyard: low blocks around an open kill-zone
      const wall = this.plainBucket(0x9c6644);
      wall.box(30, 5, 2, cx, 3, cz - 15); wall.box(30, 5, 2, cx, 3, cz + 15);
      wall.box(2, 5, 28, cx - 15, 3, cz);
      this.addCollider(cx, cz - 15, 30, 2, 5.5); this.addCollider(cx, cz + 15, 30, 2, 5.5);
      this.addCollider(cx - 15, cz, 2, 28, 5.5);
      const cb = this.containerBuckets[Math.floor(rng() * this.containerBuckets.length)];
      cb.box(6, 2.6, 2.4, cx + 6, 1.8, cz - 6); cb.box(6, 2.6, 2.4, cx - 5, 1.8, cz + 7, Math.PI / 2);
      this.addCollider(cx + 6, cz - 6, 6, 2.6, 3.1); this.addCollider(cx - 5, cz + 7, 2.6, 6, 3.1);
      this.building(cx + 10, cz + 10, 10, 10, 8, 2);
    }
  }

  buildIsland(isl, isGull) {
    const rng = this.rng, scene = this.scene;
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(isl.r, isl.r + 7, 2.4, 28),
      new THREE.MeshLambertMaterial({ map: sandTexture(rng) }));
    drum.position.set(isl.x, -1.05, isl.z);
    drum.receiveShadow = true;
    scene.add(drum);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(isl.r - 2, isl.r - 2, 0.3, 28),
      new THREE.MeshLambertMaterial({ map: concreteTexture(rng) }));
    top.position.set(isl.x, -0.03, isl.z);
    top.receiveShadow = true;
    scene.add(top);
    if (isGull) {
      // lighthouse on the south tip
      const lh = this.plainBucket(0xf8f7ff);
      lh.add(new THREE.CylinderGeometry(2.6, 3.4, 15, 12), isl.x + 18, 8, isl.z + 34);
      const stripe = this.plainBucket(0xe63946);
      stripe.add(new THREE.CylinderGeometry(2.9, 3.1, 3, 12), isl.x + 18, 6, isl.z + 34);
      this.addCollider(isl.x + 18, isl.z + 34, 6, 6, 16);
      const lampMesh = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xfff6bf }));
      lampMesh.position.set(isl.x + 18, 16.4, isl.z + 34);
      scene.add(lampMesh);
      const beam = new THREE.Mesh(new THREE.ConeGeometry(4.5, 34, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
      beam.geometry.translate(0, -17, 0);
      beam.position.copy(lampMesh.position);
      beam.rotation.z = Math.PI / 2.15;
      const beamPivot = new THREE.Group();
      beamPivot.position.copy(lampMesh.position);
      beam.position.set(0, 0, 0);
      beamPivot.add(beam);
      scene.add(beamPivot);
      this.beam = beamPivot;
      // safehouse
      this.building(isl.x - 20, isl.z - 6, 13, 11, 7, 5, 0.15);
      // helipad
      const pad = this.plainBucket(0x565d66);
      pad.add(new THREE.CylinderGeometry(9, 9, 0.3, 20), isl.x - 2, 0.0, isl.z + 22);
      // dock on the west shore
      const dock = this.plainBucket(0x8a6844);
      dock.box(4, 0.8, 22, isl.x - isl.r + 2, 0.5, isl.z - 10);
    } else {
      // Pelican Cay: shack, pad, palms come later
      this.building(isl.x - 8, isl.z - 4, 10, 9, 6, 6, 0.15);
      const pad = this.plainBucket(0x565d66);
      pad.add(new THREE.CylinderGeometry(8, 8, 0.3, 18), isl.x + 12, 0.0, isl.z + 10);
      const dock = this.plainBucket(0x8a6844);
      dock.box(20, 0.8, 4, isl.x - 6, 0.5, isl.z + isl.r - 4);
    }
  }

  buildMarina() {
    const rng = this.rng;
    const dockB = this.plainBucket(0x8a6844);
    // east-bay piers
    for (const pz of [-120, -40, 40, 130]) {
      dockB.box(46, 0.8, 6, SEA_X + 20, 0.45, pz);
    }
    // south-beach boat docks
    for (const px of [120, 175, 230]) {
      dockB.box(5, 0.8, 30, px, 0.45, SAND_Z + 22);
    }
    // Gull Island + Cay docks already placed; moored hulls are decorative
    const hullB = this.plainBucket(0xf8f7ff);
    const hull2B = this.plainBucket(0x3ec1d3);
    const spots = [[SEA_X + 34, -108], [SEA_X + 30, 52], [138, SAND_Z + 34], [196, SAND_Z + 36], [ISLAND.x - ISLAND.r - 6, ISLAND.z - 2], [CAY.x - 14, CAY.z + CAY.r + 4]];
    spots.forEach(([x, z], i) => {
      (i % 2 ? hull2B : hullB).box(3.2, 1.2, 8.5, x, 0.35, z, (i % 3) * 0.4);
    });
  }

  buildPalmsAndLamps() {
    const rng = this.rng, scene = this.scene;
    const palmSpots = [];
    for (let bi = 0; bi < GRID; bi++) {
      for (let bj = 0; bj < GRID; bj++) {
        const cx = blockCentre(bi), cz = blockCentre(bj);
        if (rng() < 0.8) palmSpots.push([cx - BLOCK / 2 - 1, cz - BLOCK / 2 - 1]);
        if (rng() < 0.55) palmSpots.push([cx + BLOCK / 2 + 1, cz + BLOCK / 2 + 1]);
      }
    }
    for (let x = -LAND + 8; x < LAND; x += 24) if (rng() < 0.85) palmSpots.push([x + rng() * 6, SAND_Z + 8 + rng() * 12]);
    for (let i = 0; i < 9; i++) {
      const a = rng() * Math.PI * 2, r = ISLAND.r - 8 - rng() * 22;
      palmSpots.push([ISLAND.x + Math.cos(a) * r, ISLAND.z + Math.sin(a) * r]);
    }
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2, r = CAY.r - 7 - rng() * 14;
      palmSpots.push([CAY.x + Math.cos(a) * r, CAY.z + Math.sin(a) * r]);
    }
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.34, 6.6, 6);
    trunkGeo.translate(0, 3.3, 0);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x9a6a44 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
    // canopy: 5 flattened cones merged into one geometry
    const canopyBucket = new Bucket();
    for (let i = 0; i < 5; i++) {
      const cone = new THREE.ConeGeometry(0.55, 5.2, 4);
      const m = new THREE.Matrix4().makeRotationY((i / 5) * Math.PI * 2);
      const tilt = new THREE.Matrix4().makeRotationZ(Math.PI / 2.35);
      const off = new THREE.Matrix4().makeTranslation(Math.cos((i / 5) * Math.PI * 2) * 1.7, 0.4, -Math.sin((i / 5) * Math.PI * 2) * 1.7);
      cone.applyMatrix4(tilt); cone.applyMatrix4(m); cone.applyMatrix4(off);
      canopyBucket.add(cone, 0, 6.6, 0);
    }
    const canopyGeo = new THREE.BufferGeometry();
    canopyGeo.setAttribute('position', new THREE.Float32BufferAttribute(canopyBucket.pos, 3));
    canopyGeo.setAttribute('normal', new THREE.Float32BufferAttribute(canopyBucket.nor, 3));
    canopyGeo.setAttribute('uv', new THREE.Float32BufferAttribute(canopyBucket.uv, 2));
    const canopyMat = new THREE.MeshLambertMaterial({ color: 0x2fa84f, side: THREE.DoubleSide });
    const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, palmSpots.length);
    const dummy = new THREE.Object3D();
    palmSpots.forEach(([x, z], i) => {
      dummy.position.set(x, this.groundY(x, z), z);
      dummy.rotation.set((rng() - 0.5) * 0.09, rng() * Math.PI * 2, (rng() - 0.5) * 0.09);
      const s = 0.85 + rng() * 0.5;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      canopies.setMatrixAt(i, dummy.matrix);
    });
    trunks.castShadow = true; canopies.castShadow = true;
    scene.add(trunks); scene.add(canopies);

    // street lamps: instanced poles + instanced bulbs
    const lampSpots = [];
    for (let i = 0; i <= GRID; i += 1) {
      for (let j = 0; j <= GRID; j += 2) {
        lampSpots.push([this.roadsX[i] + 5.4, this.roadsZ[j] + 5.4]);
        lampSpots.push([this.roadsX[i] - 5.4, this.roadsZ[j] - 5.4]);
      }
    }
    const poleGeo = new THREE.CylinderGeometry(0.11, 0.11, 5.8, 5);
    poleGeo.translate(0, 2.9, 0);
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x444a52 }), lampSpots.length);
    const bulbGeo = new THREE.SphereGeometry(0.34, 8, 6);
    bulbGeo.translate(0, 5.9, 0);
    this.bulbMat = new THREE.MeshBasicMaterial({ color: 0x8a8f7a });
    const bulbs = new THREE.InstancedMesh(bulbGeo, this.bulbMat, lampSpots.length);
    lampSpots.forEach(([x, z], i) => {
      dummy.position.set(x, 0.5, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      bulbs.setMatrixAt(i, dummy.matrix);
    });
    scene.add(poles); scene.add(bulbs);
  }

  buildTrafficLights() {
    const scene = this.scene;
    const poleB = this.plainBucket(0x33383f);
    const headSpotsNS = [], headSpotsEW = [];
    for (let i = 0; i <= GRID; i += 2) {
      for (let j = 0; j <= GRID; j += 2) {
        const x = this.roadsX[i], z = this.roadsZ[j];
        poleB.box(0.28, 4.6, 0.28, x + 6.4, 2.3, z + 6.4);
        poleB.box(0.28, 4.6, 0.28, x - 6.4, 2.3, z - 6.4);
        headSpotsNS.push([x + 6.4, z + 6.4], [x - 6.4, z - 6.4]);
        headSpotsEW.push([x + 6.4, z - 6.4], [x - 6.4, z + 6.4]);
        poleB.box(0.28, 4.6, 0.28, x + 6.4, 2.3, z - 6.4);
        poleB.box(0.28, 4.6, 0.28, x - 6.4, 2.3, z + 6.4);
      }
    }
    const headGeo = new THREE.BoxGeometry(0.55, 1.15, 0.55);
    headGeo.translate(0, 4.9, 0);
    this.lightMats = {
      green: new THREE.MeshBasicMaterial({ color: 0x2eff7a }),
      yellow: new THREE.MeshBasicMaterial({ color: 0xffc93c }),
      red: new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
      dark: new THREE.MeshBasicMaterial({ color: 0x22262c }),
    };
    const dummy = new THREE.Object3D();
    const mk = (spots) => {
      const im = new THREE.InstancedMesh(headGeo, this.lightMats.dark, spots.length);
      spots.forEach(([x, z], i) => {
        dummy.position.set(x, 0.5, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
        dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
      });
      scene.add(im);
      return im;
    };
    this.headsNS = mk(headSpotsNS);
    this.headsEW = mk(headSpotsEW);
    this.refreshLightHeads();
  }

  refreshLightHeads() {
    if (!this.headsNS) return;
    this.headsNS.material = this.lightMats[this.lightState('NS')];
    this.headsEW.material = this.lightMats[this.lightState('EW')];
  }

  buildSigns() {
    const scene = this.scene;
    const signs = [
      ['CRANE CASINO', 'PLAY · STAY · LOSE', '#160f2e', '#ffd23f', blockCentre(4), 29.5, blockCentre(8) + 6.4, 0],
      ['NEON MILE', 'HEATWAVE CITY', '#2b0f2e', '#ff5da2', blockCentre(5), 24, blockCentre(8) - 21, 0],
      ['HOTEL AZURE', 'MARINA & SPA', '#0d2b3e', '#7be0f1', blockCentre(10), 22, blockCentre(6) - 14, -Math.PI / 2],
      ['CLUB SABLE', 'OPEN ALL NIGHT', '#1c1030', '#c77dff', blockCentre(6), 20, blockCentre(8) + 21, Math.PI],
      ['HEATWAVE GENERAL', 'EMERGENCY →', '#f4f6f8', '#e63946', blockCentre(8), 23.5, blockCentre(2) + 10.4, 0],
      ['MERIDIAN BANK', 'EST. 1962', '#20304a', '#ffe9a3', blockCentre(5), 26.5, blockCentre(5) - 18.6, 0],
      ["ROSA'S CUSTOMS", 'CHOP · TUNE · VANISH', '#3a2410', '#ffb35c', blockCentre(2), 10.5, blockCentre(5) + 11.6, 0],
      ['GULL ISLAND', 'POP. 12 · ONE LIGHTHOUSE', '#123524', '#a7f3d0', 14, 5.5, ISLAND.z - 30, Math.PI / 2],
    ];
    for (const [text, sub, bg, fg, x, y, z, ry] of signs) {
      const tex = signTexture(text, bg, fg, sub);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(17, 4.25),
        new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      m.rotation.y = ry;
      scene.add(m);
    }
    // rooftop billboards along the Neon Mile
    const boards = [['SOLSTICE FM', '♪ 101.3'], ['VROOM COLA', 'TASTE THE RUSH'], ['CRAY YACHTS', 'SAIL NOW'], ['PEARL CASINO', 'JACKPOT $1M']];
    boards.forEach(([t, s], i) => {
      const tex = signTexture(t, '#14081f', ['#ff5da2', '#4cc9f0', '#ffd23f', '#06d6a0'][i], s);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(15, 3.75),
        new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      m.position.set(blockCentre(3 + i * 2), 34 + (i % 2) * 7, blockCentre(8) - 16);
      scene.add(m);
    });
  }

  // ------------------------------------------------------------ marker
  setMarker(x, z, color = 0xffd23f) {
    this.clearMarker();
    const geo = new THREE.CylinderGeometry(2.7, 2.7, 64, 20, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false });
    this.marker = new THREE.Mesh(geo, mat);
    this.marker.position.set(x, 32, z);
    this.scene.add(this.marker);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.8, 26),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, this.groundY(x, z) + 0.18, z);
    this.scene.add(ring);
    this.markerRing = ring;
    this.markerPos = { x, z };
  }

  clearMarker() {
    if (this.marker) { this.scene.remove(this.marker); this.marker.geometry.dispose(); this.marker = null; }
    if (this.markerRing) { this.scene.remove(this.markerRing); this.markerRing.geometry.dispose(); this.markerRing = null; }
    this.markerPos = null;
  }

  // ------------------------------------------------------------ update
  update(dt, t, focus) {
    // day-night
    if (this.fixedTod !== null && this.fixedTod !== undefined) this.tod = this.fixedTod;
    else this.tod = (this.tod + dt / 720) % 1; // DAY_LENGTH seconds per cycle
    const tod = this.tod;
    const sunA = (tod - 0.25) * Math.PI * 2; // sunrise at 0.25, noon 0.5
    const elev = Math.sin(sunA);
    const dayF = clamp((elev + 0.12) / 0.5, 0, 1);
    const duskF = clamp(1 - Math.abs(elev) * 2.6, 0, 1) * (elev > -0.25 ? 1 : 0);
    const sunDir = { x: Math.cos(sunA) * 0.62, y: Math.max(elev, -0.3), z: 0.42 };
    const fx = focus ? focus.x : 0, fz = focus ? (focus.z || 0) : 0;
    this.sun.position.set(fx + sunDir.x * 260, Math.max(sunDir.y, 0.06) * 260 + 30, fz + sunDir.z * 260);
    this.sun.target.position.set(fx, 0, fz);
    this.sun.target.updateMatrixWorld();
    this.sun.intensity = 0.12 + dayF * 1.08;
    this.sun.color.setHSL(0.1, 0.55, lerp(0.62, 0.78, dayF));
    this.hemi.intensity = 0.16 + dayF * 0.55;
    const sky = new THREE.Color().setHSL(0.58, lerp(0.32, 0.62, dayF), lerp(0.07, 0.62, dayF));
    if (duskF > 0.25 && elev > -0.1) sky.lerp(new THREE.Color(0xff8c52), duskF * 0.45);
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky).lerp(new THREE.Color(0xffffff), 0.12);
    const nightF = 1 - dayF;
    for (const m of this.facadeMats) m.emissiveIntensity = nightF * 1.15;
    if (this.bulbMat) this.bulbMat.color.setHSL(0.13, 0.75, lerp(0.32, 0.72, nightF));
    this.nightF = nightF;
    // sea shimmer + lighthouse beam
    if (this.sea) this.sea.position.y = -0.25 + Math.sin(t * 0.6) * 0.05;
    if (this.beam) { this.beam.rotation.y = t * 0.45; this.beam.visible = nightF > 0.25; }
    // traffic lights: 6s green, 1.5s yellow per axis
    this.lightTimer += dt;
    const phaseLen = [6, 1.5, 6, 1.5][this.lightPhase];
    if (this.lightTimer >= phaseLen) {
      this.lightTimer = 0;
      this.lightPhase = (this.lightPhase + 1) % 4;
      this.refreshLightHeads();
    }
    // marker pulse
    if (this.marker) this.marker.material.opacity = 0.26 + Math.sin(t * 3) * 0.09;
    if (this.markerRing) { const s = 1 + Math.sin(t * 3) * 0.08; this.markerRing.scale.set(s, s, s); }
  }
}
