// city.js — the static world of Heatwave City: a 14x14-block
// peninsula of districts (downtown towers, the Neon Mile, portside
// sheds, marina resorts, the beachfront), a causeway out to Gull
// Island, Pelican Cay across the bay, piers, palms, lamps and
// working traffic lights — all under a full day-night sun cycle.
//
// The architecture has silhouettes: towers step back in tiers with
// parapets and rooftop clutter (AC units, water tanks, antennas),
// mid-rises grow balconies and cornices, shopfronts recess behind
// awnings and sign bands, and the Neon Mile gets vertical light
// strips. A gradient sky dome with stars replaces the flat backdrop,
// and the sea is a specular sheet that catches the sun. Static
// geometry is merged by material, so the city costs a few dozen
// draw calls; lamps and palms are instanced.
//
// Round 7 grows the world again: Gullwing Field airport island to
// the south-west (runway, terminal, tower, a parked jet), a glass
// mall, the Coral Bowl stadium, a police HQ, a gas station whose
// pumps cook off, destructible crates and barriers, a walkable
// safehouse interior, yacht deck zones — and weather: rain fronts
// roll through, roads darken and shine, and the sun ducks behind
// the murk.

import {
  GRID, PITCH, BLOCK, HALF, ROAD_HALF, LAND, SAND_Z, SEA_X, CAUSEWAY_HALF,
  ISLAND, CAY, AIRPORT, AIRPORT_X, districtAt, DISTRICT_STYLE, SPECIAL_LOTS,
  BUILDING_TINTS, makeRng, clamp, lerp, roadLine, blockCentre,
} from './config.js';
import {
  facadeStyle, shopTexture, signTexture, billboardTexture, sandTexture,
  seaTexture, grassTexture, concreteTexture, asphaltTexture,
  containerTexture, resortTexture, woodTexture, glassTexture,
  runwayTexture, crateTexture, pumpTexture,
} from './textures.js';

// Quays and ramps boats can nose up to without counting as land.
export const DOCK_RECTS = [
  { x0: 200, x1: 214, z0: 318, z1: 352 },   // marina south docks
  { x0: 370, x1: 398, z0: 30, z1: 60 },     // east pier apron
  { x0: -78, x1: -52, z0: 452, z1: 476 },   // Gull Island west dock
  { x0: 336, x1: 372, z0: 540, z1: 570 },   // Pelican Cay dock
  { x0: -356, x1: -338, z0: 516, z1: 560 }, // Gullwing Field boat dock
];

// The safehouse interior lives in a quiet corner of the map, far
// south of everything, inside its own little land rect.
export const INTERIOR = { x: 0, z: -500, hw: 12, hd: 12 };

const SKY_KEYS = {
  nightTop: new THREE.Color(0x050914), nightHor: new THREE.Color(0x0d1626),
  dayTop: new THREE.Color(0x2f7fd0), dayHor: new THREE.Color(0xbfe3f2),
  duskTop: new THREE.Color(0x3a2a63), duskHor: new THREE.Color(0xff8c5a),
};

// Merge loose geometries (position/normal/uv) into one BufferGeometry.
function mergeGeos(geos) {
  let total = 0;
  const parts = geos.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    total += ng.attributes.position.count;
    return ng;
  });
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  let o = 0, ou = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, ou * 2);
    o += g.attributes.position.count;
    ou += g.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// Accumulates transformed boxes/cylinders/custom geometry for one
// material and bakes them into a single mesh. uvScale lets facade
// boxes repeat their window grid in proportion to their size.
class Bucket {
  constructor(material) { this.material = material; this.geos = []; }
  push(geo, x, y, z, ry = 0, uvScale = null, sx = 1, sy = 1, sz = 1) {
    if (uvScale && geo.attributes.uv) {
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale[0], uv.getY(i) * uvScale[1]);
    }
    const m = new THREE.Matrix4().makeRotationY(ry);
    m.scale(new THREE.Vector3(sx, sy, sz));
    m.setPosition(x, y, z);
    geo.applyMatrix4(m);
    this.geos.push(geo);
    return this;
  }
  box(w, h, d, x, y, z, ry = 0, uvScale = null) {
    return this.push(new THREE.BoxGeometry(w, h, d), x, y, z, ry, uvScale);
  }
  cyl(rt, rb, h, seg, x, y, z) {
    return this.push(new THREE.CylinderGeometry(rt, rb, h, seg), x, y, z);
  }
  build(scene, shadows = true) {
    if (!this.geos.length) return null;
    const mesh = new THREE.Mesh(mergeGeos(this.geos), this.material);
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }
}

const SKY_VERT = `
  varying vec3 vWorld;
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const SKY_FRAG = `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  varying vec3 vWorld;
  void main() {
    float h = normalize(vWorld).y;
    float k = pow(max(h, 0.0), 0.55);
    vec3 col = mix(horizonColor, topColor, k);
    if (h < 0.0) col = horizonColor * (1.0 + h * 0.6);
    gl_FragColor = vec4(col, 1.0);
  }`;

export class City {
  constructor(scene, seed = 11) {
    this.scene = scene;
    this.rng = makeRng(seed * 7919 + 13);
    this.colliders = [];
    this.tod = 0.32;
    this.fixedTod = null;
    this.nightF = 0;
    this.markerPos = null;
    this.time = 0;
    this.facadeMats = [];
    this.buildingsBuilt = 0;
    this.deckZones = [];       // walkable decks (the yacht) — { obj, y }
    this.props = [];           // destructibles: crates, pumps, barriers
    this.weatherOverride = null; // 'rain' | 'clear' | null (auto)
    this.raining = false;
    this.wet = 0;              // 0 dry .. 1 soaked
    this.wetMats = [];         // { mat, dry: Color, wet: Color }

    // ---- lights, sky dome, stars, fog ------------------------------
    this.sun = new THREE.DirectionalLight(0xffffff, 1.15);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.far = 260;
    this.sun.shadow.bias = -0.0006;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfe3ff, 0x53655a, 0.75);
    scene.add(this.hemi);

    this.skyUniforms = {
      topColor: { value: new THREE.Color(0x2f7fd0) },
      horizonColor: { value: new THREE.Color(0xbfe3f2) },
    };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1500, 24, 14),
      new THREE.ShaderMaterial({
        uniforms: this.skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
        side: THREE.BackSide, depthWrite: false, fog: false,
      })
    );
    scene.add(sky);
    // Stars sprinkled over the upper dome, faded in after dark.
    const starGeo = new THREE.BufferGeometry();
    {
      const n = 420, pos = new Float32Array(n * 3), srng = makeRng(99);
      for (let i = 0; i < n; i++) {
        const a = srng() * Math.PI * 2, e = 0.12 + srng() * 1.35, r = 1380;
        pos[i * 3] = Math.cos(a) * Math.cos(e) * r;
        pos[i * 3 + 1] = Math.sin(e) * r;
        pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    }
    this.starMat = new THREE.PointsMaterial({ color: 0xcfe0ff, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    scene.add(new THREE.Points(starGeo, this.starMat));
    scene.fog = new THREE.Fog(0xbfe3f2, 190, 1150);

    // Rain: one Points cloud of streaks that wraps around the focus.
    {
      const n = 650;
      this.rainN = n;
      this.rainPos = new Float32Array(n * 3);
      const rr = makeRng(4242);
      for (let i = 0; i < n; i++) {
        this.rainPos[i * 3] = (rr() - 0.5) * 90;
        this.rainPos[i * 3 + 1] = rr() * 42;
        this.rainPos[i * 3 + 2] = (rr() - 0.5) * 90;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
      this.rainMat = new THREE.PointsMaterial({
        color: 0xa8cdea, size: 0.55, transparent: true, opacity: 0, depthWrite: false,
      });
      this.rain = new THREE.Points(g, this.rainMat);
      this.rain.visible = false;
      this.rain.frustumCulled = false;
      scene.add(this.rain);
    }

    this.buildTerrain(scene);
    this.buildBlocks(scene);
    this.buildIslands(scene);
    this.buildAirport(scene);
    this.buildInterior(scene);
    this.buildWaterfront(scene);
    this.buildVegetation(scene);
    this.buildLights(scene);
    this.buildMarker(scene);
    this.scatterProps(scene);
  }

  // ---- terrain: roads, sidewalks, sand, sea -------------------------
  buildTerrain(scene) {
    const rng = this.rng;
    const ground = (w, h, mat, x, z, y = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y, z);
      m.receiveShadow = true;
      scene.add(m);
      return m;
    };
    const concrete = concreteTexture(rng);
    const cityBase = new THREE.MeshLambertMaterial({ map: concrete });
    cityBase.map = concrete.clone();
    cityBase.map.repeat.set(52, 52);
    cityBase.map.needsUpdate = true;
    ground(LAND * 2 + 26, LAND * 2 + 26, cityBase, 0, 0);

    const asphalt = asphaltTexture(rng);
    const roadMat = new THREE.MeshLambertMaterial({ map: asphalt });
    this.wetMats.push({ mat: roadMat, dry: new THREE.Color(0xffffff), wet: new THREE.Color(0x596068) });
    ground(HALF * 2 + PITCH, HALF * 2 + PITCH, roadMat, 0, 0, 0.02);
    // Mask the asphalt square back to a grid: cover the block
    // interiors with sidewalk concrete, leaving roads + junctions.
    const cover = new THREE.MeshLambertMaterial({ map: concrete });
    cover.map = concrete.clone();
    cover.map.repeat.set(5, 5);
    cover.map.needsUpdate = true;
    {
      // All block covers merged into a single mesh.
      const geos = [];
      for (let i = 0; i < GRID; i++) {
        for (let j = 0; j < GRID; j++) {
          const g = new THREE.PlaneGeometry(BLOCK + 7, BLOCK + 7);
          g.rotateX(-Math.PI / 2);
          g.translate(blockCentre(i), 0.04, blockCentre(j));
          geos.push(g);
        }
      }
      const merged = new THREE.Mesh(mergeGeos(geos), cover);
      merged.receiveShadow = true;
      scene.add(merged);
    }

    // Lane dashes + crosswalks, merged white paint.
    const paint = new Bucket(new THREE.MeshBasicMaterial({ color: 0xf5f2e4 }));
    for (let i = 0; i <= GRID; i++) {
      const c = roadLine(i);
      for (let d = -HALF + 8; d < HALF - 4; d += 9) {
        if (Math.abs(((d % PITCH) + PITCH) % PITCH) < 1) continue;
        paint.box(0.35, 0.02, 3.6, c, 0.05, d + 4);
        paint.box(3.6, 0.02, 0.35, d + 4, 0.05, c);
      }
      // Crosswalk stripes at every junction.
      for (let j = 0; j <= GRID; j++) {
        const cz = roadLine(j);
        for (let s = -2; s <= 2; s++) {
          paint.box(0.7, 0.02, 2.6, c + s * 1.6, 0.05, cz - ROAD_HALF - 2.2);
          paint.box(0.7, 0.02, 2.6, c + s * 1.6, 0.05, cz + ROAD_HALF + 2.2);
          paint.box(2.6, 0.02, 0.7, c - ROAD_HALF - 2.2, 0.05, cz + s * 1.6);
          paint.box(2.6, 0.02, 0.7, c + ROAD_HALF + 2.2, 0.05, cz + s * 1.6);
        }
      }
    }
    paint.build(scene, false);

    // Beach, boardwalk, causeways, island discs.
    const sand = sandTexture(rng);
    ground(780, 60, new THREE.MeshLambertMaterial({ map: sand }), 10, SAND_Z + 22, 0.015);
    const wood = woodTexture(rng);
    const boardMat = new THREE.MeshLambertMaterial({ map: wood });
    boardMat.map = wood.clone();
    boardMat.map.repeat.set(2, 40);
    boardMat.map.needsUpdate = true;
    ground(17, 660, boardMat, LAND + 12, 10, 0.03);
    const causeMat = new THREE.MeshLambertMaterial({ map: asphalt });
    causeMat.map = asphalt.clone();
    causeMat.map.repeat.set(2, 20); // tile along the strip, no smearing
    causeMat.map.needsUpdate = true;
    this.wetMats.push({ mat: causeMat, dry: new THREE.Color(0xffffff), wet: new THREE.Color(0x596068) });
    const causeway = ground(CAUSEWAY_HALF * 2, 190, causeMat, 0, HALF + 88);
    causeway.position.y = 0.03;
    // The airport causeway runs south-west from the beach's west end.
    const cause2 = ground(16, 108, causeMat, AIRPORT_X, SAND_Z + 48);
    cause2.position.y = 0.03;
    const islMat = new THREE.MeshLambertMaterial({ map: sand });
    islMat.map = sand.clone();
    islMat.map.repeat.set(8, 8);
    islMat.map.needsUpdate = true;
    const isl = new THREE.Mesh(new THREE.CircleGeometry(ISLAND.r + 14, 36), islMat);
    isl.rotation.x = -Math.PI / 2;
    isl.position.set(ISLAND.x, 0.01, ISLAND.z);
    isl.receiveShadow = true;
    scene.add(isl);
    const cay = isl.clone();
    cay.material = islMat;
    cay.position.set(CAY.x, 0.01, CAY.z);
    cay.scale.setScalar((CAY.r + 10) / (ISLAND.r + 14));
    scene.add(cay);
    const islRoadMat = new THREE.MeshLambertMaterial({ map: asphalt });
    const islRoad = new THREE.Mesh(new THREE.CircleGeometry(30, 28), islRoadMat);
    islRoad.rotation.x = -Math.PI / 2;
    islRoad.position.set(ISLAND.x, 0.03, ISLAND.z);
    islRoad.receiveShadow = true;
    scene.add(islRoad);

    // The sea itself: a specular sheet that catches the sun.
    this.seaTex = seaTexture(rng);
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(2600, 2600),
      new THREE.MeshPhongMaterial({ map: this.seaTex, shininess: 140, specular: 0x9fd0e8 })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -0.55;
    scene.add(sea);
  }

  // ---- land tests ----------------------------------------------------
  isLand(x, z, ignoreDocks = false) {
    if (x >= -LAND && x <= LAND && z >= -LAND && z <= SAND_Z) return true;
    if (Math.abs(x) <= CAUSEWAY_HALF && z > SAND_Z && z <= ISLAND.z - ISLAND.r + 16) return true;
    if (Math.hypot(x - ISLAND.x, z - ISLAND.z) <= ISLAND.r) return true;
    if (Math.hypot(x - CAY.x, z - CAY.z) <= CAY.r) return true;
    if (Math.abs(x - AIRPORT_X) <= 9 && z > SAND_Z && z <= AIRPORT.z - AIRPORT.r + 14) return true;
    if (Math.hypot(x - AIRPORT.x, z - AIRPORT.z) <= AIRPORT.r) return true;
    if (Math.abs(x - INTERIOR.x) <= INTERIOR.hw && Math.abs(z - INTERIOR.z) <= INTERIOR.hd) return true;
    for (const dz of this.deckZones) if (dz.obj.contains(x, z)) return true;
    if (!ignoreDocks) {
      for (const d of DOCK_RECTS) if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) return true;
    }
    return false;
  }
  isWater(x, z) { return !this.isLand(x, z) && Math.abs(x) < 720 && z > -720 && z < 760; }
  groundY(x, z) {
    for (const dz of this.deckZones) if (dz.obj.contains(x, z)) return dz.y;
    if (Math.hypot(x - ISLAND.x, z - ISLAND.z) <= ISLAND.r) return 0.06;
    if (Math.hypot(x - CAY.x, z - CAY.z) <= CAY.r) return 0.06;
    if (Math.hypot(x - AIRPORT.x, z - AIRPORT.z) <= AIRPORT.r) return 0.06;
    return 0.05;
  }
  heightAt(x, z) {
    let top = this.groundY(x, z);
    for (const c of this.colliders) {
      if (Math.abs(x - c.x) <= c.hw && Math.abs(z - c.z) <= c.hd && c.top > top) top = c.top;
    }
    return top;
  }
  // Push a moving point out of every collider it overlaps, in place.
  collide(pos, radius) {
    for (const c of this.colliders) {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const px = c.hw + radius - Math.abs(dx);
      const pz = c.hd + radius - Math.abs(dz);
      if (px > 0 && pz > 0) {
        if (px < pz) pos.x = c.x + (dx > 0 ? c.hw + radius : -c.hw - radius);
        else pos.z = c.z + (dz > 0 ? c.hd + radius : -c.hd - radius);
      }
    }
    if (this.isLand(pos.x, pos.z)) {
      pos.x = clamp(pos.x, -LAND - 30, 700);
      pos.z = clamp(pos.z, -LAND - 4, 720);
    }
  }

  // Register a walkable deck (the yacht). obj needs contains(x, z).
  addDeckZone(obj, y) { this.deckZones.push({ obj, y }); }

  // ---- weather ---------------------------------------------------------
  setWeather(mode) { this.weatherOverride = mode; }
  autoRain(t) {
    const cyc = t % 620;
    return cyc > 400 && cyc < 500;
  }

  // ---- destructible props --------------------------------------------------
  addProp(scene, kind, x, z, ry = 0) {
    const rng = this.rng;
    let mesh, hp, hw;
    if (kind === 'crate') {
      if (!this._crateMat) this._crateMat = new THREE.MeshLambertMaterial({ map: crateTexture(rng) });
      mesh = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.15, 1.15), this._crateMat);
      mesh.position.set(x, 0.62, z);
      hp = 26; hw = 0.62;
    } else if (kind === 'pump') {
      if (!this._pumpMat) this._pumpMat = new THREE.MeshLambertMaterial({ map: pumpTexture(rng) });
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.65, 0.6), this._pumpMat);
      mesh.position.set(x, 0.86, z);
      hp = 34; hw = 0.5;
    } else { // barrier: a striped concrete block
      if (!this._barrierMat) this._barrierMat = new THREE.MeshLambertMaterial({ color: 0xb9b0a0 });
      mesh = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.85, 0.55), this._barrierMat);
      mesh.position.set(x, 0.45, z);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.3, 0.57),
        new THREE.MeshBasicMaterial({ color: 0xe63946 }));
      stripe.position.y = 0.1;
      mesh.add(stripe);
      hp = 90; hw = 1.1;
    }
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    scene.add(mesh);
    const collider = { x, z, hw, hd: hw, top: kind === 'pump' ? 1.7 : 1.2 };
    this.colliders.push(collider);
    const prop = { kind, x, z, hp, maxHp: hp, mesh, dead: false, collider, wob: 0 };
    this.props.push(prop);
    return prop;
  }

  damageProp(prop, dmg, world) {
    if (prop.dead) return true;
    prop.hp -= dmg;
    prop.wob = 0.22;
    if (prop.hp > 0) return false;
    prop.dead = true;
    this.scene.remove(prop.mesh);
    prop.collider.hw = 0; prop.collider.hd = 0; prop.collider.top = 0;
    if (prop.kind === 'pump' && world) {
      // A dead pump is a bomb with a very short fuse.
      world.combat.pendingBooms.push({ x: prop.x, z: prop.z, t: 0.12 });
    } else if (prop.kind === 'crate' && world) {
      const roll = Math.random();
      const gy = this.groundY(prop.x, prop.z);
      world.combat.puff(prop.x, gy + 0.7, prop.z, 0xa67c4e, 0.9, 0.4, 1.6, 5);
      if (roll < 0.16) world.combat.dropPickup('health', prop.x, prop.z, 30);
      else if (roll < 0.3) world.combat.dropPickup('pistol', prop.x, prop.z, 12);
      else if (roll < 0.38) world.combat.dropPickup('cash', prop.x, prop.z, 120);
    }
    return true;
  }

  scatterProps(scene) {
    const rng = this.rng;
    const crateAt = (x, z) => {
      this.addProp(scene, 'crate', x, z, rng() * 1.2);
      if (rng() < 0.4) this.addProp(scene, 'crate', x + 1.25, z + 0.3, rng() * 1.2);
    };
    // Portside alleys and the container yard.
    for (const [x, z] of [[-318, -100], [-300, 30], [-318, 150], [-262, -190], [-318, -215], [-215, -300]]) crateAt(x, z);
    // Airport cargo corner.
    for (const [x, z] of [[-368, 492], [-360, 500], [-372, 506], [-240, 492]]) crateAt(x, z);
    // Hideout yards and back streets.
    for (const [x, z] of [[blockCentre(1) - 13, blockCentre(5) + 12], [blockCentre(12) + 12, blockCentre(10) + 10],
      [blockCentre(7) - 12, blockCentre(1) - 11], [60, -318], [-120, 318], [250, -318]]) crateAt(x, z);
    // Barriers guarding the HQ gate and the stadium doors.
    this.addProp(scene, 'barrier', blockCentre(3) - 6, blockCentre(3) + 17, 0.2);
    this.addProp(scene, 'barrier', blockCentre(3) + 6, blockCentre(3) + 17, -0.2);
    this.addProp(scene, 'barrier', blockCentre(10), blockCentre(2) + 18, 0);
  }

  // ---- buckets -------------------------------------------------------
  plainBucket(color) {
    if (!this._plain) this._plain = new Map();
    if (!this._plain.has(color)) {
      this._plain.set(color, new Bucket(new THREE.MeshLambertMaterial({ color })));
    }
    return this._plain.get(color);
  }
  basicBucket(color) {
    if (!this._basic) this._basic = new Map();
    if (!this._basic.has(color)) {
      this._basic.set(color, new Bucket(new THREE.MeshBasicMaterial({ color })));
    }
    return this._basic.get(color);
  }
  flushBuckets(scene) {
    if (this._plain) for (const b of this._plain.values()) b.build(scene);
    if (this._basic) for (const b of this._basic.values()) b.build(scene, false);
    this._plain = null; this._basic = null;
  }

  addBench(x, z, ry = 0) {
    const wood = this.plainBucket(0x8a6844), iron = this.plainBucket(0x2c2f36);
    const cos = Math.cos(ry), sin = Math.sin(ry);
    const at = (lx, lz) => [x + lx * cos + lz * sin, z - lx * sin + lz * cos];
    let [ax, az] = at(0, 0);
    wood.box(1.9, 0.09, 0.5, ax, 0.62, az, ry);
    [ax, az] = at(0, -0.28);
    wood.box(1.9, 0.5, 0.08, ax, 0.95, az, ry);
    for (const s of [-0.8, 0.8]) {
      const [lx2, lz2] = at(s, 0);
      iron.box(0.09, 0.6, 0.45, lx2, 0.31, lz2, ry);
    }
  }

  // ---- buildings -------------------------------------------------------
  buildBlocks(scene) {
    const rng = this.rng;
    // Facade styles: window grids painted per tint family.
    const styleDefs = [
      { tint: '#d9c8a9', floors: 9, cols: 5 }, { tint: '#b8c9d9', floors: 11, cols: 5 },
      { tint: '#e8b4a0', floors: 8, cols: 4 }, { tint: '#cfe0d8', floors: 10, cols: 6 },
      { tint: '#f0dfae', floors: 9, cols: 5 }, { tint: '#aebfd4', floors: 12, cols: 5 },
      { tint: '#e6cdd8', floors: 8, cols: 4 }, { tint: '#d8d3c3', floors: 10, cols: 5 },
    ];
    this.facadeBuckets = styleDefs.map((def) => {
      const { map, emissive } = facadeStyle(rng, def.tint, def.floors, def.cols, 0.55);
      const mat = new THREE.MeshPhongMaterial({
        map, emissiveMap: emissive, emissive: 0xffbe78, emissiveIntensity: 0, shininess: 16, specular: 0x2c3646,
      });
      this.facadeMats.push(mat);
      return new Bucket(mat);
    });
    const resort = resortTexture(rng, '#f6e8d4');
    const resortMat = new THREE.MeshPhongMaterial({
      map: resort, emissiveMap: resort, emissive: 0xffb36b, emissiveIntensity: 0, shininess: 10, specular: 0x333f4d,
    });
    this.facadeMats.push(resortMat);
    this.resortBucket = new Bucket(resortMat);
    this.resortEmissiveMat = resortMat;

    this.shopMats = [
      ['MELT RECORDS', '#ff5964'], ['TACO SOL', '#ffd23f'], ['PALM PAWN', '#3ec1d3'],
      ['NOODLE BAR', '#ff9a3d'], ['SURF SHACK', '#00c9a7'], ['VELVET LIQUOR', '#f15bb5'],
    ].map(([name, color], i) => new THREE.MeshBasicMaterial({
      map: shopTexture(rng, BUILDING_TINTS[i % BUILDING_TINTS.length], name, color),
    }));
    this.neonSignMats = [
      ['NEON MILE', 'CASINO STRIP', '#12081f', '#ff2e88'], ['HOTEL SOL', 'ROOMS · POOL', '#08131f', '#00e5ff'],
      ['CLUB VELVET', 'OPEN LATE', '#170a12', '#f15bb5'], ['CORAL CASINO', 'JACKPOT', '#140f04', '#ffd23f'],
    ].map(([a, b, bg, fg]) => new THREE.MeshBasicMaterial({ map: signTexture(a, bg, fg, b) }));

    this.tallest = { h: 0, x: 0, z: 0, w: 20, d: 20 };
    for (let bi = 0; bi < GRID; bi++) {
      for (let bj = 0; bj < GRID; bj++) {
        const cx = blockCentre(bi), cz = blockCentre(bj);
        const district = districtAt(bi, bj);
        const special = SPECIAL_LOTS[bi + ',' + bj];
        if (special) { this.buildSpecialLot(scene, special, cx, cz, district); continue; }
        const st = DISTRICT_STYLE[district];
        const h = st.minH + rng() * (st.maxH - st.minH);
        const w = BLOCK - 3 - rng() * 5, d = BLOCK - 3 - rng() * 5;
        this.addBuilding(scene, cx, cz, w, d, h, district);
      }
    }
    // Helipad on the tallest downtown tower.
    const T = this.tallest;
    if (T.h > 30) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.5, 0.35, 22),
        new THREE.MeshLambertMaterial({ color: 0x3a3f47 }));
      pad.position.set(T.x, T.h + 0.2, T.z);
      pad.receiveShadow = true;
      scene.add(pad);
      const hMat = new THREE.MeshBasicMaterial({ color: 0xffd23f });
      const h1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 4.4), hMat);
      h1.position.set(T.x - 1.3, T.h + 0.42, T.z);
      const h2 = h1.clone(); h2.position.x = T.x + 1.3;
      const h3 = new THREE.Mesh(new THREE.BoxGeometry(2, 0.06, 0.7), hMat);
      h3.position.set(T.x, T.h + 0.42, T.z);
      scene.add(h1); scene.add(h2); scene.add(h3);
      this.colliders.push({ x: T.x, z: T.z, hw: 7.5, hd: 7.5, top: T.h + 0.4 });
    }
    this.flushBuckets(scene);
    // Facade + resort buckets are built later, in buildIslands: the
    // island hotel and houses pour into the same merged meshes.
  }

  addBuilding(scene, cx, cz, w, d, h, district) {
    const rng = this.rng;
    const styleIdx = Math.floor(rng() * this.facadeBuckets.length);
    const bucket = district === 'beachfront' || district === 'marina' && rng() < 0.4
      ? this.resortBucket : this.facadeBuckets[styleIdx];
    const tintColor = new THREE.Color(BUILDING_TINTS[Math.floor(rng() * BUILDING_TINTS.length)]);
    const darkTint = tintColor.clone().multiplyScalar(0.72).getHex();

    // Stepped tiers.
    let tiers;
    if (h > 42) tiers = [[1, 0.52], [0.76, 0.3], [0.52, 0.18]];
    else if (h > 25) tiers = [[1, 0.66], [0.72, 0.34]];
    else tiers = [[1, 1]];
    let y = 0;
    for (const [scale, frac] of tiers) {
      const th = h * frac;
      bucket.box(w * scale, th, d * scale, cx, y + th / 2, cz, 0, [w * scale / 13, th / 30]);
      y += th;
    }
    // Parapet rim on the roof tier.
    const tw = w * tiers[tiers.length - 1][0], td = d * tiers[tiers.length - 1][0];
    const par = this.plainBucket(darkTint);
    par.box(tw + 0.5, 0.55, 0.4, cx, h + 0.24, cz - td / 2 + 0.2);
    par.box(tw + 0.5, 0.55, 0.4, cx, h + 0.24, cz + td / 2 - 0.2);
    par.box(0.4, 0.55, td + 0.5, cx - tw / 2 + 0.2, h + 0.24, cz);
    par.box(0.4, 0.55, td + 0.5, cx + tw / 2 - 0.2, h + 0.24, cz);
    // Cornice line for mid-rises.
    if (h <= 30 && h > 12) {
      par.box(w + 0.7, 0.5, d + 0.7, cx, h * 0.9, cz);
    }
    // Rooftop clutter: AC boxes, a water tank, an antenna.
    const grey = this.plainBucket(0x9aa3ab), rust = this.plainBucket(0x8a5a34);
    if (h > 14) {
      const n = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        grey.box(1.6 + rng() * 1.6, 0.9 + rng() * 0.7, 1.4 + rng() * 1.4,
          cx + (rng() - 0.5) * tw * 0.55, h + 0.8, cz + (rng() - 0.5) * td * 0.55);
      }
      if (rng() < 0.4) {
        rust.cyl(1.15, 1.15, 2.4, 10, cx + tw * 0.28, h + 1.5, cz - td * 0.26);
        rust.push(new THREE.ConeGeometry(1.4, 0.8, 10), cx + tw * 0.28, h + 3.1, cz - td * 0.26);
      }
      if (h > 45 && rng() < 0.6) {
        grey.cyl(0.06, 0.09, 6 + rng() * 4, 5, cx - tw * 0.3, h + 3.4, cz + td * 0.3);
      }
    }
    // Balconies down the sunny face of mid-rises.
    if (h <= 30 && h >= 11 && district !== 'portside' && rng() < 0.62) {
      const slab = this.plainBucket(0xd8d2c4), rail = this.plainBucket(0x39424e);
      for (let by = 4.6; by < h - 2.4; by += 4.1) {
        slab.box(w * 0.82, 0.18, 1.15, cx, by, cz + d / 2 + 0.55);
        rail.box(w * 0.82, 0.55, 0.07, cx, by + 0.36, cz + d / 2 + 1.08);
        slab.box(1.15, 0.18, d * 0.82, cx + w / 2 + 0.55, by, cz);
        rail.box(0.07, 0.55, d * 0.82, cx + w / 2 + 1.08, by + 0.36, cz);
      }
    }
    // Ground-floor shopfronts with awnings on commercial blocks —
    // merged per material into the shop buckets, not loose meshes.
    if ((district === 'neon' || district === 'midtown' || district === 'beachfront' || district === 'marina') && h < 26) {
      const mat = this.shopMats[Math.floor(rng() * this.shopMats.length)];
      if (!this._shopBuckets) this._shopBuckets = new Map();
      if (!this._shopBuckets.has(mat)) this._shopBuckets.set(mat, new Bucket(mat));
      const shopB = this._shopBuckets.get(mat);
      for (let s = 0; s < 4; s++) {
        const ry = s * Math.PI / 2;
        const off = (s % 2 === 0 ? d : w) / 2 + 0.07;
        shopB.push(new THREE.PlaneGeometry(13.5, 4.9),
          cx + Math.sin(ry) * off, 2.45, cz + Math.cos(ry) * off, ry);
        const awn = this.plainBucket(s % 2 ? 0xe63946 : 0x2a9d8f);
        const aoff = (s % 2 === 0 ? d : w) / 2 + 0.8;
        const awnGeo = new THREE.BoxGeometry(13.5, 0.1, 1.7);
        awnGeo.rotateX(0.42); // outer edge tips down, whichever face this is
        awn.push(awnGeo, cx + Math.sin(ry) * aoff, 5.15, cz + Math.cos(ry) * aoff, ry);
      }
    }
    // The Neon Mile: vertical light strips + a glowing sign panel.
    if (district === 'neon') {
      const neonCols = [0xff2e88, 0x00e5ff, 0xffd23f, 0x7c4dff, 0x00ffa3];
      const col = neonCols[Math.floor(rng() * neonCols.length)];
      const strip = this.basicBucket(col);
      for (const sx of [-1, 1]) {
        strip.box(0.22, h * 0.94, 0.22, cx + sx * (w / 2 + 0.14), h * 0.47, cz + d / 2 + 0.14);
        strip.box(0.22, h * 0.94, 0.22, cx + sx * (w / 2 + 0.14), h * 0.47, cz - d / 2 - 0.14);
      }
      strip.box(w * 0.7, 0.22, 0.22, cx, h - 1.2, cz + d / 2 + 0.14);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(17, w * 0.8), 4.2),
        this.neonSignMats[Math.floor(rng() * this.neonSignMats.length)]);
      sign.position.set(cx, h - 4.4, cz + d / 2 + 0.16);
      scene.add(sign);
    }
    this.colliders.push({ x: cx, z: cz, hw: w / 2, hd: d / 2, top: h });
    this.buildingsBuilt++;
    if (h > this.tallest.h && district === 'downtown') this.tallest = { h, x: cx, z: cz, w, d };
  }

  // ---- special lots ------------------------------------------------------
  buildSpecialLot(scene, kind, cx, cz, district) {
    const rng = this.rng;
    const stone = this.plainBucket(0xb9b0a0), white = this.plainBucket(0xe8e6df);
    const paintLines = (lot) => {
      for (let i = -2; i <= 2; i++) lot.box(0.25, 0.03, 7, cx + i * 6, 0.07, cz - 6);
    };
    switch (kind) {
      case 'plaza': {
        // Meridian plaza: fountain, benches, planters.
        const basin = this.plainBucket(0x9fb4c0);
        basin.cyl(5.2, 5.6, 0.9, 18, cx, 0.5, cz);
        const water = new THREE.Mesh(new THREE.CircleGeometry(4.7, 18),
          new THREE.MeshPhongMaterial({ color: 0x2b7ea6, shininess: 120, specular: 0xbfe8ff }));
        water.rotation.x = -Math.PI / 2;
        water.position.set(cx, 0.86, cz);
        scene.add(water);
        basin.cyl(0.5, 0.7, 2.2, 10, cx, 1.6, cz);
        basin.cyl(1.5, 1.1, 0.35, 12, cx, 2.8, cz);
        for (let k = 0; k < 6; k++) {
          const a = k / 6 * Math.PI * 2;
          this.addBench(cx + Math.cos(a) * 9.5, cz + Math.sin(a) * 9.5, -a + Math.PI / 2);
          const hedge = this.plainBucket(0x3f7a3a);
          hedge.box(3.4, 0.8, 1, cx + Math.cos(a + 0.5) * 12.5, 0.45, cz + Math.sin(a + 0.5) * 12.5, -a);
        }
        break;
      }
      case 'garage': {
        const brick = this.plainBucket(0xa9603c);
        brick.box(20, 6.5, 1, cx, 3.25, cz - 10);
        brick.box(1, 6.5, 20, cx - 10, 3.25, cz);
        brick.box(1, 6.5, 20, cx + 10, 3.25, cz);
        brick.box(21.5, 0.5, 21.5, cx, 6.9, cz);
        const dark = this.plainBucket(0x22242a);
        dark.box(19, 5.4, 18, cx, 2.7, cz - 0.5);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(13, 3),
          new THREE.MeshBasicMaterial({ map: signTexture("ROSA'S", '#1c1410', '#ffb46a', 'CHOP SHOP · TUNING · STORAGE') }));
        sign.position.set(cx, 5.6, cz + 10.06);
        scene.add(sign);
        this.colliders.push({ x: cx, z: cz - 10, hw: 10, hd: 0.8, top: 7 });
        this.colliders.push({ x: cx - 10, z: cz, hw: 0.8, hd: 10, top: 7 });
        this.colliders.push({ x: cx + 10, z: cz, hw: 0.8, hd: 10, top: 7 });
        // The zone the garage logic tests against — a rect, always:
        // (an earlier build used a centre+radius and the store key
        // silently stopped working at the zone's corners).
        this.garageZone = { x0: cx - 10, x1: cx + 10, z0: cz + 3, z1: cz + 24 };
        break;
      }
      case 'parking': case 'beachlot': {
        paintLines(white);
        stone.box(24, 0.5, 1.2, cx, 0.25, cz + 13);
        break;
      }
      case 'helipad': {
        const padB = this.plainBucket(0x3a3f47);
        padB.cyl(10, 10.6, 0.5, 22, cx, 0.25, cz);
        const hMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const h1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 5), hMat);
        h1.position.set(cx - 1.5, 0.53, cz);
        const h2 = h1.clone(); h2.position.x = cx + 1.5;
        const h3 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 0.8), hMat);
        h3.position.set(cx, 0.53, cz);
        scene.add(h1); scene.add(h2); scene.add(h3);
        break;
      }
      case 'park': {
        const grass = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK + 6, BLOCK + 6),
          new THREE.MeshLambertMaterial({ map: grassTexture(rng) }));
        grass.rotation.x = -Math.PI / 2;
        grass.position.set(cx, 0.055, cz);
        grass.receiveShadow = true;
        scene.add(grass);
        const path = this.plainBucket(0xd8d2c4);
        path.box(3.4, 0.06, BLOCK + 6, cx, 0.07, cz);
        path.box(BLOCK + 6, 0.06, 3.4, cx, 0.07, cz);
        for (const [bx, bz, ry] of [[-8, -8, 0.4], [9, -6, -0.3], [-7, 9, 2.8], [8, 8, 3.4]]) {
          this.addBench(cx + bx, cz + bz, ry);
        }
        break;
      }
      case 'hospital': {
        this.addBuilding(scene, cx, cz, 26, 24, 17, 'midtown');
        const cross = new THREE.Mesh(new THREE.PlaneGeometry(5, 5),
          new THREE.MeshBasicMaterial({ color: 0xffffff }));
        cross.position.set(cx, 13.5, cz + 12.4);
        scene.add(cross);
        const red = this.basicBucket(0xd7263d);
        red.box(1.1, 3.4, 0.1, cx, 13.5, cz + 12.5);
        red.box(3.4, 1.1, 0.1, cx, 13.5, cz + 12.5);
        const canopy = this.plainBucket(0x9fb4c0);
        canopy.box(12, 0.3, 5, cx, 4.6, cz + 14.5);
        break;
      }
      case 'casino': {
        this.addBuilding(scene, cx, cz, 28, 26, 23, 'neon');
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(19, 4.8),
          new THREE.MeshBasicMaterial({ map: signTexture('CORAL CASINO', '#140f04', '#ffd23f', 'SLOTS · TABLES · ROOMS') }));
        sign.position.set(cx, 16.5, cz + 13.4);
        scene.add(sign);
        const gold = this.basicBucket(0xffd23f);
        for (let i = -3; i <= 3; i++) gold.box(0.35, 5.5, 0.35, cx + i * 3.6, 2.75, cz + 13.6);
        break;
      }
      case 'boatramp': {
        const ramp = this.plainBucket(0x9a958a);
        const rampMesh = new THREE.Mesh(new THREE.BoxGeometry(13, 0.4, 26), ramp.material);
        rampMesh.position.set(cx, 0.1, cz + 12);
        rampMesh.rotation.x = 0.1;
        scene.add(rampMesh);
        const woodB = this.plainBucket(0x8a6844);
        woodB.box(3.2, 0.35, 20, cx - 9, 0.35, cz + 8);
        woodB.box(3.2, 0.35, 20, cx + 9, 0.35, cz + 8);
        break;
      }
      case 'mall': {
        // The Palms Galleria: a glass drum under a white ring beam,
        // warm light spilling out of the curtain wall after dark.
        const { map, emissive } = glassTexture(rng);
        const glassMatM = new THREE.MeshPhongMaterial({
          map, emissiveMap: emissive, emissive: 0xffc98a, emissiveIntensity: 0, shininess: 60, specular: 0xbfd9ea,
        });
        this.facadeMats.push(glassMatM);
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(15, 15.5, 11, 24), glassMatM);
        drum.position.set(cx, 5.5, cz);
        drum.castShadow = true;
        scene.add(drum);
        const beam = this.plainBucket(0xe8e2d2);
        beam.cyl(16.2, 16.2, 1.1, 24, cx, 11.4, cz);
        beam.cyl(6, 6, 2.2, 16, cx, 12.6, cz);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(17, 4.2),
          new THREE.MeshBasicMaterial({ map: signTexture('THE PALMS', '#0d1b26', '#7be0f1', 'GALLERIA · FOOD · CINEMA') }));
        sign.position.set(cx, 8.6, cz + 15.9);
        scene.add(sign);
        this.colliders.push({ x: cx, z: cz, hw: 14.5, hd: 14.5, top: 13.5 });
        break;
      }
      case 'policehq': {
        this.addBuilding(scene, cx, cz, 27, 24, 19, 'midtown');
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(15, 3.6),
          new THREE.MeshBasicMaterial({ map: signTexture('HEATWAVE PD', '#0a1428', '#7be0f1', 'HEADQUARTERS · DET. BRANDT, 4TH FLOOR') }));
        sign.position.set(cx, 15.8, cz + 12.4);
        scene.add(sign);
        const blue = this.basicBucket(0x2b6cb0);
        blue.box(27.5, 0.5, 24.5, cx, 3.4, cz);
        const pole = this.plainBucket(0x9aa3ab);
        pole.cyl(0.09, 0.12, 11, 6, cx + 11, 5.5, cz + 14);
        const flag = this.basicBucket(0x2b6cb0);
        flag.box(2.6, 1.5, 0.06, cx + 12.35, 10, cz + 14);
        this.hqPos = { x: cx, z: cz + 16 };
        break;
      }
      case 'stadium': {
        // Coral Bowl: an elliptical bowl wall, four floodlight
        // pylons and a green pitch glowing in the middle.
        const wall = this.plainBucket(0xcfc8b8);
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(17.5, 15.5, 8.5, 26, 1, true), wall.material);
        bowl.scale.set(1.25, 1, 0.9);
        bowl.position.set(cx, 4.25, cz);
        bowl.castShadow = true;
        scene.add(bowl);
        const rim = this.plainBucket(0x8f887a);
        const rimMesh = new THREE.Mesh(new THREE.TorusGeometry(17.5, 0.5, 6, 26), rim.material);
        rimMesh.scale.set(1.25, 0.9, 1);
        rimMesh.rotation.x = Math.PI / 2;
        rimMesh.position.set(cx, 8.6, cz);
        scene.add(rimMesh);
        const pitch = new THREE.Mesh(new THREE.CircleGeometry(14.5, 22),
          new THREE.MeshLambertMaterial({ map: grassTexture(rng) }));
        pitch.scale.set(1.25, 0.9, 1);
        pitch.rotation.x = -Math.PI / 2;
        pitch.position.set(cx, 0.09, cz);
        scene.add(pitch);
        const lampB = this.basicBucket(0xfff3c4);
        const pyB = this.plainBucket(0x5a6068);
        for (const [ox, oz] of [[-20, -13], [20, -13], [-20, 13], [20, 13]]) {
          pyB.cyl(0.22, 0.3, 15, 7, cx + ox, 7.5, cz + oz);
          lampB.box(2.6, 1.4, 0.3, cx + ox, 15.2, cz + oz, Math.atan2(-ox, -oz));
        }
        this.colliders.push({ x: cx, z: cz, hw: 19, hd: 14.5, top: 8.6 });
        break;
      }
      case 'gasstation': {
        // Last Chance Gas: a canopy on four posts, a kiosk, and the
        // pumps themselves (destructible — they cook off).
        const post = this.plainBucket(0xd8d2c4);
        for (const [ox, oz] of [[-7, -5], [7, -5], [-7, 5], [7, 5]]) {
          post.cyl(0.22, 0.22, 4.6, 8, cx + ox, 2.3, cz + oz);
        }
        const canopy = this.plainBucket(0xe63946);
        canopy.box(19, 0.5, 14, cx, 4.85, cz);
        const trimW = this.basicBucket(0xfff3c4);
        trimW.box(19.2, 0.3, 14.2, cx, 4.55, cz);
        const kiosk = this.plainBucket(0xe8e2d2);
        kiosk.box(10, 3.4, 5, cx, 1.7, cz - 11);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 2.4),
          new THREE.MeshBasicMaterial({ map: signTexture('LAST CHANCE', '#20060a', '#ff5964', 'GAS · DIESEL · REGRETS') }));
        sign.position.set(cx, 2.6, cz - 8.4);
        scene.add(sign);
        const poleS = this.plainBucket(0x9aa3ab);
        poleS.cyl(0.14, 0.18, 8.5, 7, cx + 12, 4.25, cz + 9);
        const price = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4.4),
          new THREE.MeshBasicMaterial({ map: signTexture('$4.09', '#101418', '#7bf1a8', 'PER GALLON') }));
        price.position.set(cx + 12, 6.8, cz + 9);
        scene.add(price);
        for (const [ox, oz] of [[-3.5, 0], [3.5, 0], [-3.5, 7], [3.5, 7]]) {
          this.addProp(scene, 'pump', cx + ox, cz + oz, 0);
        }
        this.colliders.push({ x: cx, z: cz - 11, hw: 5, hd: 2.5, top: 3.4 });
        break;
      }
      default: { // hideouts: a warehouse, containers and a fence
        const shed = this.plainBucket(0x7d8894);
        shed.box(18, 6, 13, cx, 3, cz);
        const roofB = this.plainBucket(0x4a5058);
        const prism = new THREE.Shape();
        prism.moveTo(-9.6, 0); prism.lineTo(0, 2.6); prism.lineTo(9.6, 0); prism.closePath();
        const prismGeo = new THREE.ExtrudeGeometry(prism, { depth: 13.6, bevelEnabled: false });
        roofB.push(prismGeo, cx, 6, cz - 6.8);
        const door = this.plainBucket(0x2c313a);
        door.box(6, 4.4, 0.2, cx, 2.2, cz + 6.6);
        this.addContainer(scene, cx - 12, cz + 10, 0.4);
        this.addContainer(scene, cx + 12, cz + 11, -0.3);
        this.colliders.push({ x: cx, z: cz, hw: 9, hd: 6.5, top: 8.6 });
        break;
      }
    }
  }

  addContainer(scene, x, z, ry = 0) {
    if (!this._containers) {
      this._containers = [0xc0392b, 0x2471a3, 0x229954, 0xba7a1e].map((c) => {
        const hex = '#' + c.toString(16).padStart(6, '0');
        return new Bucket(new THREE.MeshLambertMaterial({ map: containerTexture(this.rng, hex) }));
      });
      this._containerIdx = 0;
    }
    const b = this._containers[this._containerIdx++ % this._containers.length];
    b.box(6.1, 2.6, 2.45, x, 1.3, z, ry);
    if (this.rng() < 0.5) b.box(6.1, 2.6, 2.45, x, 3.9, z, ry);
    this.colliders.push({ x, z, hw: 3.2, hd: 1.6, top: 5.2 });
  }

  // ---- islands -------------------------------------------------------------
  buildIslands(scene) {
    const rng = this.rng;
    // Gull Island: a stepped resort hotel, two houses, palms and a dock.
    const hotelBucket = this.resortBucket;
    hotelBucket.box(20, 12, 16, -28, 6, 466, 0, [1.6, 0.4]);
    hotelBucket.box(16, 9, 13, -28, 16.5, 466, 0, [1.3, 0.3]);
    hotelBucket.box(11, 7, 10, -28, 24.5, 466, 0, [0.9, 0.24]);
    this.colliders.push({ x: -28, z: 466, hw: 10, hd: 8, top: 28 });
    const house = this.facadeBuckets[3];
    house.box(9, 5.5, 8, 26, 2.75, 500, 0.4, [0.7, 0.2]);
    house.box(8, 5, 7, -34, 2.5, 512, -0.3, [0.65, 0.18]);
    this.colliders.push({ x: 26, z: 500, hw: 4.5, hd: 4, top: 5.5 });
    this.colliders.push({ x: -34, z: 512, hw: 4, hd: 3.5, top: 5 });
    // The safehouse door: step up to the house at (26, 500) and in.
    this.safehouseDoor = { x: 26, z: 494.5 };
    // Island pool deck.
    const pool = new THREE.Mesh(new THREE.CircleGeometry(6, 18),
      new THREE.MeshPhongMaterial({ color: 0x2b9ec4, shininess: 130, specular: 0xbfe8ff }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(-6, 0.12, 492);
    scene.add(pool);
    // Pelican Cay: a shack, a dock and not much else — that's the point.
    const woodB = this.plainBucket(0x8a6844);
    woodB.box(7, 3.4, 6, CAY.x + 2, 1.7, CAY.z + 6);
    const roofB = this.plainBucket(0x5a4632);
    roofB.box(8.4, 0.25, 7.4, CAY.x + 2, 3.6, CAY.z + 6);
    woodB.box(3, 0.35, 16, CAY.x - 6, 0.3, CAY.z + 44);
    this.colliders.push({ x: CAY.x + 2, z: CAY.z + 6, hw: 3.5, hd: 3, top: 3.7 });
    // Now bake the facade families (city blocks + island buildings).
    for (const b of this.facadeBuckets) b.build(scene);
    this.resortBucket.build(scene);
    if (this._shopBuckets) for (const b of this._shopBuckets.values()) b.build(scene, false);
    this.flushBuckets(scene);
  }

  // ---- Gullwing Field: the airport island ----------------------------------
  buildAirport(scene) {
    const rng = this.rng;
    const AX = AIRPORT.x, AZ = AIRPORT.z;
    // Island disc + apron.
    const sandM = new THREE.MeshLambertMaterial({ map: sandTexture(rng) });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(AIRPORT.r + 14, 40), sandM);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(AX, 0.01, AZ);
    disc.receiveShadow = true;
    scene.add(disc);
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(190, 120),
      new THREE.MeshLambertMaterial({ map: concreteTexture(rng) }));
    apron.material.map = apron.material.map.clone();
    apron.material.map.repeat.set(10, 6);
    apron.material.map.needsUpdate = true;
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(AX, 0.03, AZ - 6);
    apron.receiveShadow = true;
    scene.add(apron);
    // Runway: an east-west strip with centreline dashes and thresholds.
    const runMat = new THREE.MeshLambertMaterial({ map: runwayTexture(rng) });
    runMat.map.repeat.set(8, 1);
    const runway = new THREE.Mesh(new THREE.PlaneGeometry(176, 21), runMat);
    runway.rotation.x = -Math.PI / 2;
    runway.position.set(AX, 0.05, AZ + 18);
    runway.receiveShadow = true;
    scene.add(runway);
    const paint = new Bucket(new THREE.MeshBasicMaterial({ color: 0xf5f2e4 }));
    for (let x = -78; x <= 78; x += 13) paint.box(6.5, 0.02, 0.7, AX + x, 0.07, AZ + 18);
    for (const sx of [-1, 1]) for (let s = -3; s <= 3; s++) paint.box(0.8, 0.02, 17, AX + sx * 84 + s * 0.01, 0.07, AZ + 18 + s * 2.2);
    paint.build(scene, false);
    // Runway edge lights: small warm posts down both sides.
    const edge = this.basicBucket(0xffd9a0);
    for (let x = -86; x <= 86; x += 12.3) {
      edge.box(0.3, 0.5, 0.3, AX + x, 0.3, AZ + 18 - 11.5);
      edge.box(0.3, 0.5, 0.3, AX + x, 0.3, AZ + 18 + 11.5);
    }
    // Terminal: a long low slab with a glass front and a sign.
    const term = this.plainBucket(0xdcd6c8);
    term.box(64, 8, 14, AX, 4, AZ - 38);
    const termGlass = this.basicBucket(0x39506b);
    termGlass.box(60, 4.6, 0.3, AX, 3.4, AZ - 30.8);
    const termSign = new THREE.Mesh(new THREE.PlaneGeometry(30, 5),
      new THREE.MeshBasicMaterial({ map: signTexture('GULLWING FIELD', '#0d1b26', '#ffd23f', 'HEATWAVE INTERNATIONAL · GATE 1') }));
    termSign.position.set(AX, 9.8, AZ - 31);
    scene.add(termSign);
    this.colliders.push({ x: AX, z: AZ - 38, hw: 32, hd: 7, top: 8 });
    // Control tower.
    const towerB = this.plainBucket(0xb9b0a0);
    towerB.cyl(2.2, 3, 21, 12, AX - 46, 10.5, AZ - 34);
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.2, 3.2, 10),
      new THREE.MeshPhongMaterial({ color: 0x39506b, shininess: 90, specular: 0xbfd9ea }));
    cab.position.set(AX - 46, 22.6, AZ - 34);
    cab.castShadow = true;
    scene.add(cab);
    towerB.cyl(3.9, 3.9, 0.5, 10, AX - 46, 24.4, AZ - 34);
    this.colliders.push({ x: AX - 46, z: AZ - 34, hw: 3.2, hd: 3.2, top: 24.6 });
    // Two hangars with prism roofs.
    for (const hx of [AX + 52, AX + 76]) {
      const hang = this.plainBucket(0x8d99a6);
      hang.box(20, 7, 16, hx, 3.5, AZ - 36);
      const prism = new THREE.Shape();
      prism.moveTo(-10.6, 0); prism.lineTo(0, 3); prism.lineTo(10.6, 0); prism.closePath();
      const pg = new THREE.ExtrudeGeometry(prism, { depth: 16.8, bevelEnabled: false });
      hang.push(pg, hx, 7, AZ - 36 - 8.4);
      this.colliders.push({ x: hx, z: AZ - 36, hw: 10, hd: 8, top: 10 });
    }
    // Fuel farm: three horizontal tanks.
    const tankB = this.plainBucket(0xe8e4da);
    for (let i = 0; i < 3; i++) {
      const tg = new THREE.CylinderGeometry(1.9, 1.9, 7, 12);
      tg.rotateZ(Math.PI / 2);
      tankB.push(tg, AX - 78 + i * 1, 2, AZ - 20 + i * 5.5);
    }
    this.colliders.push({ x: AX - 77, z: AZ - 15, hw: 5, hd: 9, top: 4 });
    // The jet: Crane Air's little airliner, engines warm, parked at
    // the gate — fuselage, swept wings, tail, twin engines, livery.
    const jet = new THREE.Group();
    const jWhite = new THREE.MeshPhongMaterial({ color: 0xf4f6f8, shininess: 70, specular: 0x93a7c4 });
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 17, 14), jWhite);
    fus.rotation.x = Math.PI / 2;
    fus.position.set(0, 2.6, 0);
    fus.castShadow = true;
    jet.add(fus);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.7, 14, 10), jWhite);
    nose.scale.set(1, 1, 1.5);
    nose.position.set(0, 2.6, 8.5);
    jet.add(nose);
    const tailCone = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.68, 4.5, 12),
      new THREE.MeshPhongMaterial({ color: 0xd8dde2, shininess: 60, specular: 0x93a7c4 }));
    tailCone.rotation.x = Math.PI / 2;
    tailCone.position.set(0, 2.9, -10.4);
    jet.add(tailCone);
    const wingMat = new THREE.MeshPhongMaterial({ color: 0xc9d2da, shininess: 55, specular: 0x93a7c4 });
    const darkJet = () => new THREE.MeshPhongMaterial({ color: 0x2c313a, shininess: 60, specular: 0x7787a0 });
    for (const sx of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.18, 2.6), wingMat);
      wing.position.set(sx * 5.2, 2.1, -0.6);
      wing.rotation.y = sx * -0.42;
      wing.castShadow = true;
      jet.add(wing);
      const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 2.2, 10), darkJet());
      eng.rotation.x = Math.PI / 2;
      eng.position.set(sx * 4.4, 1.35, 0.4);
      jet.add(eng);
      const stab = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.14, 1.4), wingMat);
      stab.position.set(sx * 2.1, 3.6, -11.6);
      jet.add(stab);
    }
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.4, 2.6),
      new THREE.MeshPhongMaterial({ color: 0xb03a2e, shininess: 60, specular: 0x93a7c4 }));
    fin.position.set(0, 5.2, -11.4);
    fin.castShadow = true;
    jet.add(fin);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.44, 0.5, 15.5),
      new THREE.MeshBasicMaterial({ color: 0xb03a2e }));
    stripe.position.set(0, 3.1, 0.4);
    jet.add(stripe);
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 1.6),
      new THREE.MeshPhongMaterial({ color: 0x14242f, shininess: 120, specular: 0xcfe8ff }));
    cockpit.position.set(0, 3.5, 8.2);
    jet.add(cockpit);
    jet.position.set(AX + 34, 0.06, AZ - 16);
    jet.rotation.y = Math.PI / 2; // nose east, toward the runway
    scene.add(jet);
    this.jetPos = { x: AX + 34, z: AZ - 16 };
    this.colliders.push({ x: AX + 34, z: AZ - 16, hw: 9, hd: 9, top: 7 });
    this.flushBuckets(scene);
  }

  // ---- the safehouse interior ----------------------------------------------
  buildInterior(scene) {
    const cx = INTERIOR.x, cz = INTERIOR.z;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(INTERIOR.hw * 2, INTERIOR.hd * 2),
      new THREE.MeshLambertMaterial({ map: woodTexture(this.rng) }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.04, cz);
    floor.receiveShadow = true;
    scene.add(floor);
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(9, 6),
      new THREE.MeshLambertMaterial({ color: 0x8c2f39 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(cx, 0.06, cz);
    scene.add(rug);
    const wallB = this.plainBucket(0xd8cfbc);
    const H = 3.6;
    wallB.box(INTERIOR.hw * 2 + 1, H, 0.6, cx, H / 2, cz - INTERIOR.hd - 0.3); // north
    wallB.box(10.6, H, 0.6, cx - 6.7, H / 2, cz + INTERIOR.hd + 0.3);          // south, west of the door
    wallB.box(10.6, H, 0.6, cx + 6.7, H / 2, cz + INTERIOR.hd + 0.3);          // south, east of the door
    wallB.box(0.6, H, INTERIOR.hd * 2 + 1, cx - INTERIOR.hw - 0.3, H / 2, cz); // west
    wallB.box(0.6, H, INTERIOR.hd * 2 + 1, cx + INTERIOR.hw + 0.3, H / 2, cz); // east
    this.colliders.push({ x: cx, z: cz - INTERIOR.hd - 0.3, hw: INTERIOR.hw + 0.5, hd: 0.4, top: H });
    this.colliders.push({ x: cx - 6.7, z: cz + INTERIOR.hd + 0.3, hw: 5.3, hd: 0.4, top: H });
    this.colliders.push({ x: cx + 6.7, z: cz + INTERIOR.hd + 0.3, hw: 5.3, hd: 0.4, top: H });
    this.colliders.push({ x: cx - INTERIOR.hw - 0.3, z: cz, hw: 0.4, hd: INTERIOR.hd + 0.5, top: H });
    this.colliders.push({ x: cx + INTERIOR.hw + 0.3, z: cz, hw: 0.4, hd: INTERIOR.hd + 0.5, top: H });
    // Furniture: bed, couch, TV, kitchen counter, the weapon locker.
    const bedB = this.plainBucket(0x39506b);
    bedB.box(2.2, 0.5, 3.6, cx - 8.6, 0.3, cz - 7.5);
    const pillow = this.plainBucket(0xf4f1e8);
    pillow.box(1.7, 0.22, 0.8, cx - 8.6, 0.62, cz - 8.9);
    const couchB = this.plainBucket(0x8c2f39);
    couchB.box(3.6, 0.7, 1.2, cx + 5.5, 0.4, cz + 3.5);
    couchB.box(3.6, 0.9, 0.35, cx + 5.5, 0.85, cz + 4.15);
    const tvStand = this.plainBucket(0x2c2f36);
    tvStand.box(3, 0.5, 0.6, cx + 5.5, 0.25, cz - 4.5);
    const tv = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.6, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x10131a }));
    tv.position.set(cx + 5.5, 1.5, cz - 4.5);
    scene.add(tv);
    const screenGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.4),
      new THREE.MeshBasicMaterial({ color: 0x3d7296 }));
    screenGlow.position.set(cx + 5.5, 1.5, cz - 4.44);
    scene.add(screenGlow);
    const counter = this.plainBucket(0x9aa3ab);
    counter.box(5.5, 1, 1.1, cx - 6, 0.5, cz + 10.8);
    const lockerB = this.plainBucket(0x37474f);
    lockerB.box(1.6, 2.6, 0.7, cx - 10.6, 1.3, cz + 6);
    this.lockerPos = { x: cx - 10.6, z: cz + 4.6 };
    this.bedPos = { x: cx - 8.6, z: cz - 5.6 };
    this.interiorExit = { x: cx, z: cz + INTERIOR.hd - 1.6 };
    this.interiorSpawn = { x: cx, z: cz + INTERIOR.hd - 3.4 };
    this.flushBuckets(scene);
  }

  // ---- waterfront: pier, docks, lighthouse, cranes -------------------------
  buildWaterfront(scene) {
    const rng = this.rng;
    const woodB = this.plainBucket(0x8a6844);
    const postB = this.plainBucket(0x5f4630);
    // East pier: deck on posts running east off the boardwalk, a
    // wider end platform, lamp at the tip.
    woodB.box(38, 0.4, 4.6, 384, 0.55, 44);
    woodB.box(14, 0.4, 12, 402, 0.55, 44);
    for (let x = 368; x <= 404; x += 8) {
      postB.cyl(0.28, 0.28, 1.8, 7, x, -0.3, 42);
      postB.cyl(0.28, 0.28, 1.8, 7, x, -0.3, 46);
    }
    // Marina finger docks (south) and the Gull Island dock.
    for (const dx of [-6, 0, 6]) woodB.box(2.2, 0.3, 17, 207 + dx, 0.4, 340);
    woodB.box(2.2, 0.3, 15, -65, 0.4, 464);
    woodB.box(2.2, 0.3, 16, -347, 0.4, 538);
    // Port cranes on the west quay.
    for (const cz of [roadLine(3) + 10, roadLine(7) + 6]) {
      const crane = this.plainBucket(0xd97c2b);
      for (const [lx, lz] of [[-4, -3], [4, -3], [-4, 3], [4, 3]]) {
        crane.box(0.7, 13, 0.7, -LAND + 6 + lx, 6.5, cz + lz);
      }
      crane.box(10.5, 0.8, 7.5, -LAND + 6, 13.2, cz);
      const jib = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 17), crane.material);
      jib.position.set(-LAND + 2, 15.2, cz);
      jib.rotation.x = 0.32;
      scene.add(jib);
      crane.box(0.12, 5.5, 0.12, -LAND - 2, 11.5, cz + 4.5);
      crane.box(1.1, 1.1, 1.1, -LAND - 2, 8.6, cz + 4.5);
      this.colliders.push({ x: -LAND + 6, z: cz, hw: 5.4, hd: 4, top: 13.6 });
    }
    // Portside container stacks.
    for (let i = 0; i < 7; i++) {
      this.addContainer(scene, -LAND + 8 + (i % 3) * 7.5, roadLine(2) + 14 + Math.floor(i / 3) * 6, 0);
    }
    if (this._containers) for (const b of this._containers) b.build(scene);
    // Lighthouse on the rocks south-east, beam sweeping at night.
    const rock = this.plainBucket(0x6b6f75);
    rock.push(new THREE.ConeGeometry(9, 5, 9), 404, 0.4, 352);
    rock.push(new THREE.ConeGeometry(6, 3.6, 8), 396, 0.2, 344);
    const lhCanvas = document.createElement('canvas');
    lhCanvas.width = 64; lhCanvas.height = 128;
    const lctx = lhCanvas.getContext('2d');
    for (let i = 0; i < 6; i++) { lctx.fillStyle = i % 2 ? '#e8452c' : '#f4f1e8'; lctx.fillRect(0, i * 22, 64, 22); }
    const lhTex = new THREE.CanvasTexture(lhCanvas);
    lhTex.encoding = THREE.sRGBEncoding;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.1, 15, 14),
      new THREE.MeshLambertMaterial({ map: lhTex }));
    tower.position.set(404, 9.5, 352);
    tower.castShadow = true;
    scene.add(tower);
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.5, 14),
      new THREE.MeshLambertMaterial({ color: 0x2c313a }));
    gallery.position.set(404, 17.2, 352);
    scene.add(gallery);
    this.lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.2, 10),
      new THREE.MeshBasicMaterial({ color: 0xffedb0 }));
    this.lampRoom.position.set(404, 18.5, 352);
    scene.add(this.lampRoom);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.3, 1.8, 12),
      new THREE.MeshLambertMaterial({ color: 0x23262c }));
    roof.position.set(404, 20.4, 352);
    scene.add(roof);
    this.beam = new THREE.Mesh(new THREE.ConeGeometry(4.5, 42, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    const beamPivot = new THREE.Group();
    beamPivot.position.set(404, 18.5, 352);
    this.beam.rotation.z = Math.PI / 2 - 0.06;
    this.beam.position.set(20, 0, 0);
    beamPivot.add(this.beam);
    scene.add(beamPivot);
    this.beamPivot = beamPivot;
    this.flushBuckets(scene);
  }

  // ---- vegetation & street furniture ---------------------------------------
  buildVegetation(scene) {
    const rng = this.rng;
    // Palm: a curved segmented trunk + a drooping frond canopy,
    // instanced everywhere palms grow.
    const trunkParts = [];
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.CylinderGeometry(0.13 - i * 0.012, 0.17 - i * 0.012, 1.14, 7);
      seg.rotateZ(-0.07); // a uniform lean, applied around its own centre
      seg.translate(i * 0.1, 0.55 + i * 1.02, 0);
      trunkParts.push(seg);
    }
    const trunkGeo = mergeGeos(trunkParts);
    const frondBase = new THREE.PlaneGeometry(0.9, 3.4, 1, 4);
    frondBase.translate(0, 1.7, 0);
    {
      const p = frondBase.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i), t = y / 3.4;
        p.setZ(i, -t * t * 1.35);
        p.setX(i, p.getX(i) * (1 - t * 0.65));
      }
      frondBase.computeVertexNormals();
    }
    const frondParts = [];
    for (let k = 0; k < 7; k++) {
      const f = frondBase.clone();
      const m = new THREE.Matrix4().makeRotationY((k / 7) * Math.PI * 2 + rng() * 0.4);
      m.multiply(new THREE.Matrix4().makeRotationX(-(0.55 + rng() * 0.4)));
      f.applyMatrix4(m);
      frondParts.push(f);
    }
    const canopyGeo = mergeGeos(frondParts);
    const spots = [];
    for (let x = -300; x <= 320; x += 24) spots.push([x + rng() * 6 - 3, 343]);
    for (let x = -290; x <= 300; x += 41) spots.push([x + rng() * 8 - 4, 368]);
    for (let z = -260; z <= 300; z += 52) spots.push([344.5, z + rng() * 8]);
    spots.push([blockCentre(8) - 12, blockCentre(4) - 12], [blockCentre(8) + 13, blockCentre(4) + 11],
      [blockCentre(8) - 13, blockCentre(4) + 12], [blockCentre(8) + 12, blockCentre(4) - 13]);
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2;
      spots.push([ISLAND.x + Math.cos(a) * (ISLAND.r - 9), ISLAND.z + Math.sin(a) * (ISLAND.r - 9)]);
    }
    for (let i = 0; i < 5; i++) {
      const a = rng() * Math.PI * 2;
      spots.push([AIRPORT.x + Math.cos(a) * (AIRPORT.r - 8), AIRPORT.z + Math.sin(a) * (AIRPORT.r - 8)]);
    }
    spots.push([CAY.x - 12, CAY.z - 6], [CAY.x + 14, CAY.z + 16], [CAY.x - 4, CAY.z + 24]);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6844 });
    const canopyMat = new THREE.MeshLambertMaterial({ color: 0x2e8b47, side: THREE.DoubleSide });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, spots.length);
    const dummy = new THREE.Object3D();
    spots.forEach(([x, z], i) => {
      const s = 0.85 + rng() * 0.4;
      dummy.position.set(x, this.groundY(x, z), z);
      dummy.rotation.set(0, rng() * Math.PI * 2, 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.y += 5.15 * s;
      dummy.position.x += 0.55 * s;
      dummy.updateMatrix();
      canopies.setMatrixAt(i, dummy.matrix);
    });
    trunks.castShadow = true;
    canopies.castShadow = true;
    scene.add(trunks); scene.add(canopies);

    // Beach umbrellas + loungers, and a lifeguard stand.
    const umbCols = [0xe63946, 0xffd23f, 0x3ec1d3, 0xff9a3d];
    const poleB = this.plainBucket(0xe8e6df);
    for (let i = 0; i < 15; i++) {
      const x = -260 + i * 37 + rng() * 9, z = 349 + (i % 3) * 7;
      poleB.cyl(0.05, 0.05, 2.3, 6, x, 1.15, z);
      const umb = this.plainBucket(umbCols[i % umbCols.length]);
      umb.push(new THREE.ConeGeometry(1.75, 0.55, 9), x, 2.45, z);
      const lounger = this.plainBucket(0xf0ead8);
      lounger.box(0.7, 0.12, 1.9, x + 1.8, 0.35, z + 0.6, rng() * 0.8 - 0.4);
    }
    const stand = this.plainBucket(0xf4f1e8);
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      stand.box(0.18, 2.6, 0.18, 40 + lx * 0.8, 1.3, 348 + lz * 0.8);
    }
    stand.box(2.6, 1.5, 2.6, 40, 3.3, 348);
    const standRoof = this.plainBucket(0xe63946);
    standRoof.push(new THREE.ConeGeometry(2.2, 0.8, 4), 40, 4.5, 348);
    // Hedges fencing the heights gardens.
    const hedge = this.plainBucket(0x33691e);
    for (let bi = 1; bi < GRID - 1; bi += 2) {
      hedge.box(BLOCK - 2, 0.9, 0.7, blockCentre(bi), 0.45, blockCentre(0) + BLOCK / 2 + 1.6);
      hedge.box(BLOCK - 2, 0.9, 0.7, blockCentre(bi), 0.45, blockCentre(1) + BLOCK / 2 + 1.6);
    }
    // Hydrants and bins at scattered corners.
    const hyd = this.plainBucket(0xd7263d);
    const bin = this.plainBucket(0x37474f);
    for (let i = 0; i <= GRID; i += 3) {
      for (let j = 0; j <= GRID; j += 3) {
        hyd.cyl(0.16, 0.19, 0.62, 8, roadLine(i) + 8.6, 0.31, roadLine(j) + 8.6);
        bin.cyl(0.34, 0.3, 0.85, 9, roadLine(i) - 8.6, 0.42, roadLine(j) + 8.6);
      }
    }
    this.flushBuckets(scene);
  }

  // ---- lamps & traffic lights ------------------------------------------------
  buildLights(scene) {
    const rng = this.rng;
    // Streetlight: pole, curved arm (two angled cylinders), head —
    // merged once, instanced at junctions, the causeway, boardwalk.
    const parts = [];
    const pole = new THREE.CylinderGeometry(0.07, 0.1, 5.6, 7);
    pole.translate(0, 2.8, 0);
    parts.push(pole);
    const arm1 = new THREE.CylinderGeometry(0.055, 0.055, 1.1, 6);
    arm1.translate(0, 0.55, 0);
    arm1.rotateZ(-0.7);
    arm1.translate(0.18, 5.5, 0);
    parts.push(arm1);
    const arm2 = new THREE.CylinderGeometry(0.05, 0.05, 0.85, 6);
    arm2.rotateZ(Math.PI / 2);
    arm2.translate(0.95, 6.02, 0);
    parts.push(arm2);
    const head = new THREE.BoxGeometry(0.62, 0.13, 0.26);
    head.translate(1.42, 6.0, 0);
    parts.push(head);
    const lampGeo = mergeGeos(parts);
    const bulbGeo = new THREE.SphereGeometry(0.11, 8, 6);
    bulbGeo.translate(1.42, 5.92, 0);
    const mats4 = [];
    const dummy = new THREE.Object3D();
    const addLamp = (x, z, ry) => {
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, ry, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mats4.push(dummy.matrix.clone());
    };
    for (let i = 0; i <= GRID; i++) {
      for (let j = 0; j <= GRID; j++) {
        if ((i + j) % 2 !== 0) continue;
        addLamp(roadLine(i) + 9.3, roadLine(j) + 9.3, Math.PI + (i % 2) * 0.3);
        if (i < GRID && j < GRID && (i + j) % 4 === 0) addLamp(roadLine(i) - 9.3, roadLine(j) - 9.3, (j % 2) * 0.3);
      }
    }
    for (let z = 380; z <= 440; z += 22) { addLamp(-7.6, z, Math.PI / 2); addLamp(7.6, z, -Math.PI / 2); }
    for (let z = 400; z <= 440; z += 22) { addLamp(AIRPORT_X - 7.6, z, Math.PI / 2); addLamp(AIRPORT_X + 7.6, z, -Math.PI / 2); }
    for (let z = -270; z <= 320; z += 51) addLamp(343, z, Math.PI);
    addLamp(404, 50, -Math.PI / 2);
    const lampMat = new THREE.MeshLambertMaterial({ color: 0x3c4149 });
    const lamps = new THREE.InstancedMesh(lampGeo, lampMat, mats4.length);
    this.bulbMat = new THREE.MeshLambertMaterial({ color: 0x555f6b, emissive: 0x000000 });
    const bulbs = new THREE.InstancedMesh(bulbGeo, this.bulbMat, mats4.length);
    mats4.forEach((m, i) => { lamps.setMatrixAt(i, m); bulbs.setMatrixAt(i, m); });
    lamps.castShadow = true;
    scene.add(lamps); scene.add(bulbs);

    // Traffic lights: pole + arm merged; heads instanced; the lit
    // lamp is a disc whose material the phase clock recolours.
    const poleB = this.plainBucket(0x2f353d);
    const headGeo = new THREE.BoxGeometry(0.55, 1.35, 0.42);
    const discGeo = new THREE.CircleGeometry(0.17, 10);
    const nsMats = [], ewMats = [], nsDisc = [], ewDisc = [];
    for (let i = 0; i <= GRID; i++) {
      for (let j = 0; j <= GRID; j++) {
        const x = roadLine(i), z = roadLine(j);
        // NS approach head (serves traffic running along z).
        poleB.cyl(0.06, 0.08, 5.4, 6, x + 8.5, 2.7, z - 8.5);
        dummy.position.set(x + 8.5, 5.6, z - 8.5);
        dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
        nsMats.push(dummy.matrix.clone());
        dummy.position.set(x + 8.5, 5.75, z - 8.72);
        dummy.rotation.set(0, Math.PI, 0); dummy.updateMatrix();
        nsDisc.push(dummy.matrix.clone());
        // EW approach head.
        poleB.cyl(0.06, 0.08, 5.4, 6, x - 8.5, 2.7, z + 8.5);
        dummy.position.set(x - 8.5, 5.6, z + 8.5);
        dummy.rotation.set(0, Math.PI / 2, 0); dummy.updateMatrix();
        ewMats.push(dummy.matrix.clone());
        dummy.position.set(x - 8.72, 5.75, z + 8.5);
        dummy.rotation.set(0, -Math.PI / 2, 0); dummy.updateMatrix();
        ewDisc.push(dummy.matrix.clone());
      }
    }
    const headMat = new THREE.MeshLambertMaterial({ color: 0x1d2126 });
    const nsHeads = new THREE.InstancedMesh(headGeo, headMat, nsMats.length);
    const ewHeads = new THREE.InstancedMesh(headGeo, headMat, ewMats.length);
    nsMats.forEach((m, i) => nsHeads.setMatrixAt(i, m));
    ewMats.forEach((m, i) => ewHeads.setMatrixAt(i, m));
    scene.add(nsHeads); scene.add(ewHeads);
    this.lampMatNS = new THREE.MeshBasicMaterial({ color: 0x39d353 });
    this.lampMatEW = new THREE.MeshBasicMaterial({ color: 0xd7263d });
    const nsDiscs = new THREE.InstancedMesh(discGeo, this.lampMatNS, nsDisc.length);
    const ewDiscs = new THREE.InstancedMesh(discGeo, this.lampMatEW, ewDisc.length);
    nsDisc.forEach((m, i) => nsDiscs.setMatrixAt(i, m));
    ewDisc.forEach((m, i) => ewDiscs.setMatrixAt(i, m));
    scene.add(nsDiscs); scene.add(ewDiscs);
    this.flushBuckets(scene);
  }

  lightState(axis) {
    const ph = this.time % 15;
    if (axis === 'NS') return ph < 6 ? 'green' : ph < 7.5 ? 'yellow' : 'red';
    return ph < 7.5 ? 'red' : ph < 13.5 ? 'green' : 'yellow';
  }

  // ---- mission marker ---------------------------------------------------------
  buildMarker(scene) {
    const group = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 26, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
    );
    pillar.position.y = 13;
    group.add(pillar);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.1, 0.14, 8, 26),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, fog: false })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.25;
    group.add(ring);
    this.markerLight = new THREE.PointLight(0xffd23f, 0, 34);
    this.markerLight.position.y = 3;
    group.add(this.markerLight);
    group.visible = false;
    scene.add(group);
    this.marker = group;
    // The second marker: branch choices and heist plans show two.
    this.marker2 = group.clone();
    this.marker2.children[0].material = pillar.material.clone();
    this.marker2.children[1].material = ring.material.clone();
    this.marker2.visible = false;
    scene.add(this.marker2);
    this.marker2Pos = null;
  }
  setMarker(x, z, color = 0xffd23f) {
    this.markerPos = { x, z };
    this.marker.position.set(x, this.groundY(x, z), z);
    this.marker.visible = true;
    this.marker.children[0].material.color.setHex(color);
    this.marker.children[1].material.color.setHex(color);
    this.markerLight.color.setHex(color);
  }
  setMarker2(x, z, color = 0x39d5ee) {
    this.marker2Pos = { x, z };
    this.marker2.position.set(x, this.groundY(x, z), z);
    this.marker2.visible = true;
    this.marker2.children[0].material.color.setHex(color);
    this.marker2.children[1].material.color.setHex(color);
  }
  clearMarker() {
    this.markerPos = null;
    this.marker.visible = false;
    this.marker2Pos = null;
    this.marker2.visible = false;
  }

  // ---- the day-night cycle + weather ------------------------------------------------------
  update(dt, t, focus) {
    this.time = t;
    this.tod = this.fixedTod !== null && this.fixedTod !== undefined
      ? this.fixedTod : (0.3 + t / 720) % 1;
    const tod = this.tod;
    const sunAng = (tod - 0.25) * Math.PI * 2;
    const sunH = Math.sin(sunAng);
    const dayness = clamp(sunH * 2.4 + 0.3, 0, 1);
    const duskness = clamp(1 - Math.abs(sunH) * 2.8, 0, 1) * (sunH > -0.22 ? 1 : 0);
    this.nightF = clamp(0.35 - sunH * 2.2, 0, 1);

    // Weather: fronts roll through on their own schedule unless a
    // mission pins the sky down.
    this.raining = this.weatherOverride === 'rain'
      || (this.weatherOverride === null && this.autoRain(t));
    this.wet = clamp(this.wet + (this.raining ? dt / 6 : -dt / 14), 0, 1);
    const wet = this.wet;
    for (const wm of this.wetMats) wm.mat.color.copy(wm.dry).lerp(wm.wet, wet * 0.85);
    this.rain.visible = wet > 0.25;
    if (this.rain.visible && focus) {
      this.rainMat.opacity = (wet - 0.25) * 0.75;
      this.rain.position.set(focus.x, 0, focus.z);
      const pos = this.rain.geometry.attributes.position;
      const fall = (t * 46) % 42;
      for (let i = 0; i < this.rainN; i++) {
        let y = this.rainPos[i * 3 + 1] - fall;
        if (y < 0) y += 42;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }

    // Sky dome gradient, fog and stars follow the sun — and the murk.
    const top = this.skyUniforms.topColor.value;
    const hor = this.skyUniforms.horizonColor.value;
    top.copy(SKY_KEYS.nightTop).lerp(SKY_KEYS.dayTop, dayness).lerp(SKY_KEYS.duskTop, duskness * 0.45);
    hor.copy(SKY_KEYS.nightHor).lerp(SKY_KEYS.dayHor, dayness).lerp(SKY_KEYS.duskHor, duskness * 0.6);
    if (wet > 0.05) {
      const grey = new THREE.Color(0x5d6a78);
      top.lerp(grey, wet * 0.55);
      hor.lerp(grey.clone().multiplyScalar(1.25), wet * 0.5);
    }
    this.scene.fog.color.copy(hor).lerp(top, 0.25);
    this.scene.fog.near = lerp(190, 105, wet);
    this.scene.fog.far = lerp(1150, 640, wet);
    this.starMat.opacity = this.nightF * 0.95 * (1 - wet);

    // Sun + hemisphere.
    const fx = focus ? focus.x : 0, fz = focus ? focus.z : 0;
    this.sun.position.set(fx + Math.cos(sunAng) * 110, Math.max(sunH, 0.05) * 150 + 12, fz + 55);
    this.sun.target.position.set(fx, 0, fz);
    this.sun.intensity = (0.14 + dayness * 1.02) * (1 - wet * 0.38);
    this.sun.color.setHex(0xffffff).lerp(new THREE.Color(0xff9448), duskness * 0.75);
    this.hemi.intensity = (0.3 + dayness * 0.48) * (1 - wet * 0.2);
    this.hemi.color.copy(hor).lerp(new THREE.Color(0xffffff), 0.4);

    // Windows light up, lamps glow, the sea drifts.
    for (const m of this.facadeMats) m.emissiveIntensity = this.nightF * 1.15;
    if (this.resortEmissiveMat) this.resortEmissiveMat.emissiveIntensity = this.nightF * 0.2;
    this.bulbMat.color.setHex(0x555f6b).lerp(new THREE.Color(0xffd9a0), this.nightF);
    this.bulbMat.emissive.setHex(0xffc37a).multiplyScalar(this.nightF * 0.9);
    this.seaTex.offset.set((t * 0.006) % 1, (t * 0.0023) % 1);
    if (this.beamPivot) {
      this.beamPivot.rotation.y = t * 0.55;
      this.beam.material.opacity = this.nightF * 0.13 * (1 - wet * 0.5);
    }
    if (this.lampRoom) this.lampRoom.material.color.setHex(0xffedb0).multiplyScalar(0.35 + this.nightF * 0.65 + Math.sin(t * 2.4) * 0.08);

    // Traffic light phases.
    const ns = this.lightState('NS'), ew = this.lightState('EW');
    this.lampMatNS.color.setHex(ns === 'green' ? 0x39d353 : ns === 'yellow' ? 0xffd23f : 0xd7263d);
    this.lampMatEW.color.setHex(ew === 'green' ? 0x39d353 : ew === 'yellow' ? 0xffd23f : 0xd7263d);

    // Marker pulse.
    if (this.marker && this.marker.visible) {
      const s = 1 + Math.sin(t * 4) * 0.1;
      this.marker.children[1].scale.set(s, s, 1);
      this.markerLight.intensity = 0.7 + Math.sin(t * 4) * 0.25;
    }
    if (this.marker2 && this.marker2.visible) {
      const s = 1 + Math.sin(t * 4 + 1.5) * 0.1;
      this.marker2.children[1].scale.set(s, s, 1);
    }
    // Destructibles wobble when clipped, then settle.
    for (const p of this.props) {
      if (p.dead || p.wob <= 0) continue;
      p.wob = Math.max(0, p.wob - dt);
      p.mesh.rotation.z = Math.sin(p.wob * 40) * p.wob * 0.3;
      if (p.wob === 0) p.mesh.rotation.z = 0;
    }
  }
}
