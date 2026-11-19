// city.js — the static world of Heatwave City: a 12x12-block peninsula
// of districts (downtown towers, portside sheds, marina hotels, the
// beachfront), a causeway out to Gull Island and its lighthouse, piers
// and boats on the east bay, palms, lamps and working traffic lights —
// all under a full day-night sun cycle. Owns the building colliders,
// the land test every mover uses, and the mission marker pillar.

import {
  GRID, PITCH, BLOCK, HALF, LAND, SAND_Z, SEA_X, CAUSEWAY_HALF, ISLAND,
  blockCentre, roadLine, districtAt, DISTRICT_STYLE, SPECIAL_LOTS,
  makeRng, clamp, lerp,
} from './config.js';
import { buildTextures } from './textures.js';

const SKY_DAY = new THREE.Color(0x7ec8e3);
const SKY_DUSK = new THREE.Color(0xff9e64);
const SKY_NIGHT = new THREE.Color(0x0d1526);
const SUN_LOW = new THREE.Color(0xff8c42);
const SUN_HIGH = new THREE.Color(0xfff2d8);

export class City {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = makeRng(seed * 7919 + 29);
    this.T = buildTextures(this.rng);
    this.colliders = [];
    this.roadsX = [];
    this.roadsZ = [];
    for (let i = 0; i <= GRID; i++) { this.roadsX.push(roadLine(i)); this.roadsZ.push(roadLine(i)); }
    this.time = 0;
    this.trafficClock = 0;
    this.tod = 0.66; // late golden afternoon
    this.fixedTod = null;
    this.darkness = 0;
    this.marker = null;
    this.markerRing = null;
    this.markerChevron = null;
    this.markerPos = null;
    this.boats = [];
    this.palmSpots = [];
    this.build();
  }

  // ------------------------------------------------------------- land
  isLand(x, z) {
    if (Math.abs(x) <= LAND && z >= -LAND && z <= SAND_Z) return true;
    if (Math.abs(x) <= CAUSEWAY_HALF && z >= HALF && z <= ISLAND.z) return true;
    const dx = x - ISLAND.x, dz = z - ISLAND.z;
    if (dx * dx + dz * dz <= ISLAND.r * ISLAND.r) return true;
    // marina piers
    if (x >= LAND && x <= LAND + 54 && ((z >= -106 && z <= -86) || (z >= 86 && z <= 106))) return true;
    return false;
  }

  heightAt(x, z) {
    let h = 0;
    for (const b of this.colliders) {
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) h = Math.max(h, b.h || 0);
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

  // ------------------------------------------------------------- build
  build() {
    const scene = this.scene, rng = this.rng, T = this.T;
    scene.background = new THREE.Color(0x7ec8e3);
    scene.fog = new THREE.Fog(0xf6c99b, 200, 720);

    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0xffe0b3, 0.7);
    scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffdf9e, 1.25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -170; sun.shadow.camera.right = 170;
    sun.shadow.camera.top = 170; sun.shadow.camera.bottom = -170;
    sun.shadow.camera.far = 800;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;

    // sea first (under everything), then the land slab
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(1500, 1500),
      new THREE.MeshLambertMaterial({ map: T.water, transparent: true, opacity: 0.96 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(60, -0.35, 160);
    scene.add(sea);
    this.sea = sea;

    const slab = new THREE.Mesh(
      new THREE.PlaneGeometry(LAND * 2, LAND + SAND_Z),
      new THREE.MeshLambertMaterial({ map: T.sidewalk }));
    slab.rotation.x = -Math.PI / 2;
    slab.position.set(0, 0, (SAND_Z - LAND) / 2);
    slab.receiveShadow = true;
    scene.add(slab);

    // road strips with lane dashes
    const roadMat = new THREE.MeshLambertMaterial({ map: T.road });
    const stripV = new THREE.PlaneGeometry(14, LAND * 2);
    const stripH = new THREE.PlaneGeometry(LAND * 2, 14);
    for (const x of this.roadsX) {
      const r = new THREE.Mesh(stripV, roadMat);
      r.rotation.x = -Math.PI / 2; r.position.set(x, 0.03, 0); r.receiveShadow = true; scene.add(r);
    }
    for (const z of this.roadsZ) {
      const r = new THREE.Mesh(stripH, roadMat);
      r.rotation.x = -Math.PI / 2; r.position.set(0, 0.03, z); r.receiveShadow = true; scene.add(r);
    }
    this.buildDashes(scene);

    // beach sand (south) and boardwalk (east)
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(LAND * 2 + 70, SAND_Z - HALF + 6),
      new THREE.MeshLambertMaterial({ map: T.sand }));
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.04, (HALF + SAND_Z) / 2);
    sand.receiveShadow = true;
    scene.add(sand);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(SEA_X - LAND, LAND + SAND_Z),
      new THREE.MeshLambertMaterial({ map: T.boardwalk }));
    board.rotation.x = -Math.PI / 2;
    board.position.set((LAND + SEA_X) / 2, 0.04, (SAND_Z - LAND) / 2);
    board.receiveShadow = true;
    scene.add(board);

    // causeway + island
    const cause = new THREE.Mesh(new THREE.BoxGeometry(CAUSEWAY_HALF * 2, 0.5, ISLAND.z - HALF + 10),
      new THREE.MeshLambertMaterial({ map: T.road }));
    cause.position.set(0, -0.22, (HALF + ISLAND.z) / 2);
    cause.receiveShadow = true;
    scene.add(cause);
    const railMat = new THREE.MeshLambertMaterial({ color: 0xd8dee6 });
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, ISLAND.z - HALF), railMat);
      rail.position.set(sx * (CAUSEWAY_HALF - 0.4), 0.45, (HALF + ISLAND.z) / 2);
      scene.add(rail);
    }
    const isle = new THREE.Mesh(new THREE.CircleGeometry(ISLAND.r, 36),
      new THREE.MeshLambertMaterial({ map: T.grass }));
    isle.rotation.x = -Math.PI / 2;
    isle.position.set(ISLAND.x, 0.02, ISLAND.z);
    isle.receiveShadow = true;
    scene.add(isle);
    const isleSand = new THREE.Mesh(new THREE.RingGeometry(ISLAND.r - 2, ISLAND.r + 7, 36),
      new THREE.MeshLambertMaterial({ map: T.sand }));
    isleSand.rotation.x = -Math.PI / 2;
    isleSand.position.set(ISLAND.x, 0.015, ISLAND.z);
    scene.add(isleSand);
    this.buildIsland(scene, rng);

    // blocks
    for (let bi = 0; bi < GRID; bi++) {
      for (let bj = 0; bj < GRID; bj++) {
        const cx = blockCentre(bi), cz = blockCentre(bj);
        const lot = SPECIAL_LOTS[bi + ',' + bj];
        if (lot) { this.buildSpecial(scene, lot, cx, cz, rng); continue; }
        const district = districtAt(bi, bj);
        this.buildBlock(scene, cx, cz, district, rng);
      }
    }

    this.buildMarina(scene, rng);
    this.buildPalms(scene, rng);
    this.buildLamps(scene, rng);
    this.buildTrafficLights(scene);
  }

  buildDashes(scene) {
    const geo = new THREE.BoxGeometry(0.35, 0.05, 4.2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xf7e08a });
    const spots = [];
    for (const x of this.roadsX) {
      for (let z = -HALF + 10; z < HALF - 4; z += 12) {
        if (this.roadsZ.some((rz) => Math.abs(rz - z) < 10)) continue;
        spots.push([x, z, 0]);
      }
    }
    for (const z of this.roadsZ) {
      for (let x = -HALF + 10; x < HALF - 4; x += 12) {
        if (this.roadsX.some((rx) => Math.abs(rx - x) < 10)) continue;
        spots.push([x, z, 1]);
      }
    }
    for (let z = HALF + 16; z < ISLAND.z - 8; z += 12) spots.push([0, z, 0]); // causeway
    const inst = new THREE.InstancedMesh(geo, mat, spots.length);
    const dummy = new THREE.Object3D();
    spots.forEach(([x, z, horiz], i) => {
      dummy.position.set(x, 0.06, z);
      dummy.rotation.set(0, horiz ? Math.PI / 2 : 0, 0);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    scene.add(inst);
  }

  building(scene, cx, cz, w, d, h, matIdx, roofExtras = true) {
    const T = this.T;
    const mat = T.facadeMats[matIdx % T.facadeMats.length];
    // single material (not a 6-material array) keeps draw calls low;
    // a separate thin roof slab caps the box instead
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(cx, 0.24 + h / 2, cz);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    const roofSlab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.24, 0.35, d + 0.24), T.roofMat);
    roofSlab.position.set(cx, 0.24 + h + 0.17, cz);
    roofSlab.castShadow = true;
    scene.add(roofSlab);
    this.addCollider(cx, cz, w, d, h);
    if (roofExtras && h > 12) {
      const rng = this.rng;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 0.36, 2.2, d * 0.36), T.roofMat);
      cap.position.set(cx + (rng() - 0.5) * w * 0.3, 0.24 + h + 1.1, cz + (rng() - 0.5) * d * 0.3);
      cap.castShadow = true;
      scene.add(cap);
      if (rng() < 0.2) {
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 5),
          new THREE.MeshLambertMaterial({ color: 0x333a42 }));
        ant.position.set(cx, 0.24 + h + 3.5, cz);
        scene.add(ant);
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.32, 6, 5),
          new THREE.MeshBasicMaterial({ color: 0xff3344 }));
        beacon.position.set(cx, 0.24 + h + 7, cz);
        scene.add(beacon);
        (this.beacons = this.beacons || []).push(beacon);
      }
    }
    return mesh;
  }

  buildBlock(scene, cx, cz, district, rng) {
    const style = DISTRICT_STYLE[district];
    const slab = new THREE.Mesh(new THREE.BoxGeometry(BLOCK, 0.24, BLOCK),
      new THREE.MeshLambertMaterial({ color: 0xb8b2a7 }));
    slab.position.set(cx, 0.12, cz);
    slab.receiveShadow = true;
    scene.add(slab);
    const matIdx = Math.floor(rng() * this.T.facadeMats.length);
    const H = () => style.minH + rng() * (style.maxH - style.minH);
    if (style.lots === 'towers') {
      const w = 21 + rng() * 5, d = 21 + rng() * 5;
      this.building(scene, cx, cz, w, d, H(), matIdx);
      if (rng() < 0.3) this.billboard(scene, cx, cz, H());
    } else if (style.lots === 'sheds') {
      const w = 26, d = 13 + rng() * 4, h = H();
      const shed = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.T.warehouseMat);
      shed.position.set(cx, 0.24 + h / 2, cz - 4);
      shed.castShadow = true; shed.receiveShadow = true;
      scene.add(shed);
      this.addCollider(cx, cz - 4, w, d, h);
      // shipping containers out front
      const contCols = [0xc0392b, 0x2471a3, 0x229954, 0xba4a00];
      for (let i = 0; i < 3; i++) {
        if (rng() < 0.3) continue;
        const cont = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 2.4),
          new THREE.MeshLambertMaterial({ color: contCols[Math.floor(rng() * 4)] }));
        const ox = -9 + i * 9, oz = 9 + (rng() < 0.5 ? 0 : 3);
        cont.position.set(cx + ox, 1.54, cz + oz);
        cont.castShadow = true;
        scene.add(cont);
        this.addCollider(cx + ox, cz + oz, 6, 2.4, 2.6);
      }
    } else if (style.lots === 'low') {
      for (const ox of [-8, 8]) {
        this.building(scene, cx + ox, cz, 13.5, 20, H(), Math.floor(rng() * 8), false);
      }
      this.palmSpots.push([cx - 15, cz + 15], [cx + 15, cz + 15]);
    } else { // mixed
      const roll = rng();
      if (roll < 0.45) {
        for (const [ox, oz] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) {
          if (rng() < 0.18) continue;
          this.building(scene, cx + ox, cz + oz, 13, 13, H(), Math.floor(rng() * 8));
        }
      } else {
        this.building(scene, cx - 7, cz, 14, 24, H(), matIdx);
        this.building(scene, cx + 8, cz, 12, 18, H() * 0.8, Math.floor(rng() * 8));
      }
      if (district === 'downtown' && rng() < 0.35) this.billboard(scene, cx, cz, 20);
    }
    // corner palms on some blocks
    if (rng() < 0.55) this.palmSpots.push([cx - BLOCK / 2 + 1.8, cz - BLOCK / 2 + 1.8]);
    if (rng() < 0.4) this.palmSpots.push([cx + BLOCK / 2 - 1.8, cz + BLOCK / 2 - 1.8]);
  }

  billboard(scene, cx, cz, baseH) {
    const rng = this.rng;
    const tex = this.T.billboards[Math.floor(rng() * this.T.billboards.length)];
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 5, 6),
      new THREE.MeshLambertMaterial({ color: 0x39424c }));
    pole.position.set(cx, baseH + 2.5, cz);
    scene.add(pole);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(13, 6.5),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    board.position.set(cx, baseH + 8, cz);
    board.rotation.y = rng() * Math.PI;
    scene.add(board);
  }

  sign(scene, tex, x, y, z, ry, w = 15) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    s.position.set(x, y, z);
    s.rotation.y = ry;
    scene.add(s);
  }

  buildSpecial(scene, lot, cx, cz, rng) {
    const T = this.T;
    const groundTex = { plaza: T.plaza, garage: T.parking, parking: T.parking, helipad: T.helipad, park: T.grass, beachlot: T.sand, hospital: T.sidewalk, casino: T.plaza }[lot];
    const ground = new THREE.Mesh(new THREE.BoxGeometry(BLOCK, 0.24, BLOCK),
      new THREE.MeshLambertMaterial({ map: groundTex }));
    ground.position.set(cx, 0.12, cz);
    ground.receiveShadow = true;
    scene.add(ground);

    if (lot === 'plaza') {
      // Meridian Bank along the north edge, fountain in the middle
      const bank = this.building(scene, cx, cz - 11.5, 30, 9, 15, 2, false);
      bank.position.y = 0.24 + 7.5;
      this.sign(scene, T.bankSign, cx, 11, cz - 6.8, 0, 18);
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 0.9, 14),
        new THREE.MeshLambertMaterial({ color: 0x9fb6c3 }));
      basin.position.set(cx, 0.7, cz + 4);
      basin.castShadow = true;
      scene.add(basin);
      this.addCollider(cx, cz + 4, 7.6, 7.6, 1);
      const water = new THREE.Mesh(new THREE.CircleGeometry(3.1, 14),
        new THREE.MeshPhongMaterial({ color: 0x3d9db8, shininess: 90 }));
      water.rotation.x = -Math.PI / 2;
      water.position.set(cx, 1.16, cz + 4);
      scene.add(water);
      this.palmSpots.push([cx - 14, cz + 13], [cx + 14, cz + 13], [cx - 14, cz - 4], [cx + 14, cz - 4]);
    } else if (lot === 'garage') {
      const shop = new THREE.Mesh(new THREE.BoxGeometry(24, 7, 13), T.warehouseMat);
      shop.position.set(cx, 0.24 + 3.5, cz - 9);
      shop.castShadow = true;
      scene.add(shop);
      this.addCollider(cx, cz - 9, 24, 13, 7);
      this.sign(scene, T.garageSign, cx, 5.6, cz - 2.4, 0, 17);
    } else if (lot === 'hospital') {
      this.building(scene, cx, cz - 4, 26, 18, 19, 2, false);
      this.sign(scene, T.hospitalSign, cx, 13, cz + 5.2, 0, 17);
      const cross = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4.4, 1.2),
        new THREE.MeshBasicMaterial({ color: 0xe63946 }));
      cross.position.set(cx + 9, 0.24 + 19 + 2.2, cz - 4);
      scene.add(cross);
    } else if (lot === 'casino') {
      this.building(scene, cx, cz - 5, 28, 18, 17, 5, false);
      this.sign(scene, T.casinoSign, cx, 12.5, cz + 4.2, 0, 18);
      this.palmSpots.push([cx - 13, cz + 12], [cx + 13, cz + 12]);
    } else if (lot === 'park') {
      for (let i = 0; i < 6; i++) {
        this.palmSpots.push([cx + (rng() - 0.5) * 24, cz + (rng() - 0.5) * 24]);
      }
      for (const [ox, oz] of [[-9, 0], [9, 0], [0, -9], [0, 9]]) {
        const bench = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 0.9),
          new THREE.MeshLambertMaterial({ color: 0x7a5230 }));
        bench.position.set(cx + ox, 0.6, cz + oz);
        scene.add(bench);
        this.addCollider(cx + ox, cz + oz, 2.6, 0.9, 0.7);
      }
    } else if (lot === 'helipad') {
      const hut = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 5),
        new THREE.MeshLambertMaterial({ color: 0xdde5ea }));
      hut.position.set(cx - 11, 1.74, cz - 11);
      hut.castShadow = true;
      scene.add(hut);
      this.addCollider(cx - 11, cz - 11, 6, 5, 3);
      const sockPole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 5.4, 5),
        new THREE.MeshLambertMaterial({ color: 0x39424c }));
      sockPole.position.set(cx + 13, 2.7, cz - 13);
      scene.add(sockPole);
      const sock = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.4, 7),
        new THREE.MeshBasicMaterial({ color: 0xff7b00 }));
      sock.rotation.z = Math.PI / 2.2;
      sock.position.set(cx + 14.2, 5.2, cz - 13);
      scene.add(sock);
      this.windsock = sock;
    }
    // parking & beachlot stay open ground
  }

  buildIsland(scene, rng) {
    // lighthouse
    const lh = new THREE.Group();
    const stone = new THREE.MeshLambertMaterial({ color: 0xb8b2a7 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 5.2, 2.4, 12), stone);
    base.position.y = 1.2; lh.add(base);
    const low = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.9, 8, 12),
      new THREE.MeshLambertMaterial({ color: 0xf2f0eb }));
    low.position.y = 6.4; lh.add(low);
    const high = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.2, 7, 12),
      new THREE.MeshLambertMaterial({ color: 0xd23b3b }));
    high.position.y = 13.9; lh.add(high);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.2, 10), lampMat);
    lamp.position.y = 18.4; lh.add(lamp);
    const capTop = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.8, 10),
      new THREE.MeshLambertMaterial({ color: 0x2b3440 }));
    capTop.position.y = 20.4; lh.add(capTop);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(3.4, 34, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    beam.rotation.z = Math.PI / 2;
    beam.position.set(17, 18.4, 0);
    const beamPivot = new THREE.Group();
    beamPivot.add(beam);
    beamPivot.position.set(20, 0, 492);
    lh.position.set(20, 0, 492);
    scene.add(lh);
    scene.add(beamPivot);
    this.beam = beam;
    this.beamPivot = beamPivot;
    this.addCollider(20, 492, 9, 9, 21);
    // safehouse hut + island helipad + palms
    const hut = new THREE.Mesh(new THREE.BoxGeometry(8, 3.6, 6),
      new THREE.MeshLambertMaterial({ color: 0xe8dcc3 }));
    hut.position.set(-22, 1.8, 462);
    hut.castShadow = true;
    scene.add(hut);
    this.addCollider(-22, 462, 8, 6, 3.6);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(7.5, 20),
      new THREE.MeshLambertMaterial({ map: this.T.helipad }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(-16, 0.05, 500);
    pad.receiveShadow = true;
    scene.add(pad);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.4;
      this.palmSpots.push([ISLAND.x + Math.cos(a) * 44, ISLAND.z + Math.sin(a) * 44]);
    }
    this.palmSpots.push([-30, 486], [30, 452]);
  }

  buildMarina(scene, rng) {
    const pierMat = new THREE.MeshLambertMaterial({ map: this.T.boardwalk });
    for (const pz of [-96, 96]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(56, 0.7, 18), pierMat);
      pier.position.set(LAND + 26, 0.1, pz);
      pier.receiveShadow = true;
      scene.add(pier);
      for (let px = LAND + 4; px <= LAND + 50; px += 11) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.4, 6),
          new THREE.MeshLambertMaterial({ color: 0x6b4a2f }));
        post.position.set(px, -0.9, pz + (pz < 0 ? -8 : 8));
        scene.add(post);
      }
    }
    // boats bobbing in the bay
    const hullCols = [0xf8f7ff, 0x3ec1d3, 0xff5964, 0xffd23f, 0x06d6a0, 0xef476f];
    for (let i = 0; i < 7; i++) {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.1, 8),
        new THREE.MeshLambertMaterial({ color: hullCols[i % hullCols.length] }));
      hull.position.y = 0.4; boat.add(hull);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 2.6),
        new THREE.MeshLambertMaterial({ color: 0xf2f0eb }));
      cab.position.set(0, 1.4, -0.6); boat.add(cab);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6.4, 5),
        new THREE.MeshLambertMaterial({ color: 0x8a6844 }));
      mast.position.set(0, 3.4, 1.4); boat.add(mast);
      boat.position.set(LAND + 44 + rng() * 40, 0, -200 + i * 62 + rng() * 22);
      boat.rotation.y = rng() * 0.8 - 0.4;
      scene.add(boat);
      this.boats.push({ g: boat, phase: rng() * 6 });
    }
    // beach palms along the sand
    for (let x = -HALF + 8; x <= HALF - 8; x += 24) {
      if (rng() < 0.78) this.palmSpots.push([x + rng() * 5, HALF + 12 + rng() * 14]);
    }
  }

  buildPalms(scene, rng) {
    const spots = this.palmSpots;
    if (!spots.length) return;
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.34, 6.6, 6);
    trunkGeo.translate(0, 3.3, 0);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x9a6a44 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    const frondGeo = new THREE.ConeGeometry(0.45, 5.6, 4);
    frondGeo.translate(0, 2.8, 0);
    frondGeo.scale(1, 1, 0.22);
    const frondMat = new THREE.MeshLambertMaterial({ color: 0x2fa84f, side: THREE.DoubleSide });
    const fronds = new THREE.InstancedMesh(frondGeo, frondMat, spots.length * 6);
    const dummy = new THREE.Object3D();
    spots.forEach(([x, z], i) => {
      const lean = (rng() - 0.5) * 0.14;
      dummy.position.set(x, 0, z);
      dummy.rotation.set(lean, rng() * Math.PI * 2, lean);
      dummy.scale.setScalar(0.9 + rng() * 0.35);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      for (let f = 0; f < 6; f++) {
        const a = (f / 6) * Math.PI * 2 + rng() * 0.4;
        dummy.position.set(x + Math.sin(a) * 0.7, 6.5 * dummy.scale.y, z + Math.cos(a) * 0.7);
        dummy.rotation.set(Math.PI / 2.05 * Math.cos(a), 0, Math.PI / 2.05 * Math.sin(a));
        dummy.updateMatrix();
        fronds.setMatrixAt(i * 6 + f, dummy.matrix);
      }
    });
    trunks.instanceMatrix.needsUpdate = true;
    fronds.instanceMatrix.needsUpdate = true;
    trunks.castShadow = true;
    scene.add(trunks);
    scene.add(fronds);
  }

  buildLamps(scene, rng) {
    const spots = [];
    for (let i = 0; i <= GRID; i += 1) {
      for (let j = 0; j <= GRID; j += 1) {
        if ((i + j) % 2) continue;
        spots.push([roadLine(i) + 8.4, roadLine(j) + 8.4]);
      }
    }
    for (let z = HALF + 24; z < ISLAND.z - 20; z += 46) spots.push([CAUSEWAY_HALF + 1.5, z]);
    const poleGeo = new THREE.CylinderGeometry(0.11, 0.11, 5.8, 5);
    poleGeo.translate(0, 2.9, 0);
    const poles = new THREE.InstancedMesh(poleGeo,
      new THREE.MeshLambertMaterial({ color: 0x444a52 }), spots.length);
    const bulbGeo = new THREE.SphereGeometry(0.34, 8, 6);
    this.bulbMat = new THREE.MeshBasicMaterial({ color: 0xd8d2b8 });
    const bulbs = new THREE.InstancedMesh(bulbGeo, this.bulbMat, spots.length);
    const dummy = new THREE.Object3D();
    spots.forEach(([x, z], i) => {
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 5.9;
      dummy.updateMatrix();
      bulbs.setMatrixAt(i, dummy.matrix);
    });
    poles.instanceMatrix.needsUpdate = true;
    bulbs.instanceMatrix.needsUpdate = true;
    scene.add(poles);
    scene.add(bulbs);
  }

  buildTrafficLights(scene) {
    const spots = [];
    for (let i = 1; i < GRID; i++) for (let j = 1; j < GRID; j++) spots.push([roadLine(i), roadLine(j)]);
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 4.6, 5);
    poleGeo.translate(0, 2.3, 0);
    const poles = new THREE.InstancedMesh(poleGeo,
      new THREE.MeshLambertMaterial({ color: 0x2e343b }), spots.length);
    const headGeo = new THREE.BoxGeometry(0.5, 1.1, 0.4);
    const heads = new THREE.InstancedMesh(headGeo,
      new THREE.MeshLambertMaterial({ color: 0x181c20 }), spots.length * 2);
    const dotGeo = new THREE.SphereGeometry(0.13, 6, 5);
    this.nsDotMat = new THREE.MeshBasicMaterial({ color: 0x39d353 });
    this.ewDotMat = new THREE.MeshBasicMaterial({ color: 0xff4455 });
    const nsDots = new THREE.InstancedMesh(dotGeo, this.nsDotMat, spots.length);
    const ewDots = new THREE.InstancedMesh(dotGeo, this.ewDotMat, spots.length);
    const dummy = new THREE.Object3D();
    spots.forEach(([x, z], i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.position.set(x + 8.2, 0, z + 8.2);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 4.9;
      dummy.updateMatrix();
      heads.setMatrixAt(i * 2, dummy.matrix);
      dummy.position.set(x + 8.2, 4.9, z + 7.95);
      dummy.updateMatrix();
      nsDots.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x + 7.95, 4.9, z + 8.2);
      dummy.updateMatrix();
      heads.setMatrixAt(i * 2 + 1, dummy.matrix);
      ewDots.setMatrixAt(i, dummy.matrix);
    });
    for (const m of [poles, heads, nsDots, ewDots]) {
      m.instanceMatrix.needsUpdate = true;
      scene.add(m);
    }
  }

  // 'NS' when north-south traffic has the green, 'EW' otherwise.
  lightAxis() {
    const c = this.trafficClock % 14;
    return (c < 6.5 || c >= 13.5) ? 'NS' : 'EW';
  }

  // ------------------------------------------------------------ marker
  setMarker(x, z, color = 0xffd23f) {
    // moving targets re-call this every frame: just shift the rig
    if (this.marker && this.markerPos && this.markerColor === color
      && Math.abs(this.markerPos.x - x) + Math.abs(this.markerPos.z - z) < 60) {
      const dx = x - this.markerPos.x, dz = z - this.markerPos.z;
      this.marker.position.x += dx; this.marker.position.z += dz;
      this.markerRing.position.x += dx; this.markerRing.position.z += dz;
      this.markerChevron.position.x += dx; this.markerChevron.position.z += dz;
      this.markerPos = { x, z };
      return;
    }
    this.clearMarker();
    this.markerColor = color;
    const geo = new THREE.CylinderGeometry(2.6, 2.6, 64, 20, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false });
    this.marker = new THREE.Mesh(geo, mat);
    this.marker.position.set(x, 32, z);
    this.scene.add(this.marker);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.9, 26),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.18, z);
    this.scene.add(ring);
    this.markerRing = ring;
    const chev = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.2, 4),
      new THREE.MeshBasicMaterial({ color }));
    chev.rotation.x = Math.PI;
    chev.position.set(x, 9, z);
    this.scene.add(chev);
    this.markerChevron = chev;
    this.markerPos = { x, z };
  }

  clearMarker() {
    for (const k of ['marker', 'markerRing', 'markerChevron']) {
      if (this[k]) { this.scene.remove(this[k]); this[k] = null; }
    }
    this.markerPos = null;
  }

  // ------------------------------------------------------------ update
  update(dt, t, focus) {
    this.time += dt;
    this.trafficClock += dt;
    if (this.fixedTod === null) this.tod = (this.tod + dt / 660) % 1;
    else this.tod = this.fixedTod;

    const ang = (this.tod - 0.25) * Math.PI * 2;
    const elev = Math.sin(ang);
    const sunDir = new THREE.Vector3(Math.cos(ang) * 0.85, Math.max(elev, -0.25), 0.38).normalize();
    const fx = focus ? focus.x : 0, fz = focus ? focus.z : 0;
    this.sun.position.set(fx + sunDir.x * 300, Math.max(sunDir.y, 0.04) * 300 + 40, fz + sunDir.z * 300);
    this.sun.target.position.set(fx, 0, fz);
    this.sun.intensity = clamp(elev, 0, 1) * 1.3 + 0.05;
    this.sun.color.copy(SUN_LOW).lerp(SUN_HIGH, clamp(elev * 2.2, 0, 1));
    this.hemi.intensity = 0.16 + clamp(elev, 0, 1) * 0.55;
    this.darkness = clamp(0.32 - elev * 1.5, 0, 1);

    const sky = new THREE.Color();
    if (elev > 0.22) sky.copy(SKY_DUSK).lerp(SKY_DAY, clamp((elev - 0.22) * 2.4, 0, 1));
    else if (elev > -0.12) sky.copy(SKY_NIGHT).lerp(SKY_DUSK, clamp((elev + 0.12) / 0.34, 0, 1));
    else sky.copy(SKY_NIGHT);
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky).lerp(new THREE.Color(0xf6c99b), clamp(elev, 0, 1) * 0.35);
    this.scene.fog.near = lerp(110, 210, clamp(elev, 0, 1));
    this.scene.fog.far = lerp(460, 740, clamp(elev, 0, 1));

    for (const m of this.T.facadeMats) m.emissiveIntensity = this.darkness * 1.2;
    if (this.bulbMat) this.bulbMat.color.setHex(this.darkness > 0.35 ? 0xffe9a3 : 0xd8d2b8);
    if (this.beam) {
      this.beam.material.opacity = this.darkness * 0.34;
      this.beamPivot.rotation.y = t * 0.45;
    }
    if (this.beacons) {
      const on = Math.sin(t * 2.4) > 0;
      for (const b of this.beacons) b.material.color.setHex(on ? 0xff3344 : 0x661118);
    }
    if (this.windsock) this.windsock.rotation.y = Math.sin(t * 0.7) * 0.4;

    const axis = this.lightAxis();
    if (this.nsDotMat) this.nsDotMat.color.setHex(axis === 'NS' ? 0x39d353 : 0xff4455);
    if (this.ewDotMat) this.ewDotMat.color.setHex(axis === 'EW' ? 0x39d353 : 0xff4455);

    if (this.sea) {
      this.sea.material.map.offset.set(t * 0.008, Math.sin(t * 0.24) * 0.01);
      this.sea.position.y = -0.35 + Math.sin(t * 0.6) * 0.05;
    }
    for (const b of this.boats) {
      b.g.position.y = Math.sin(t * 0.9 + b.phase) * 0.16;
      b.g.rotation.z = Math.sin(t * 0.7 + b.phase) * 0.03;
    }
    if (this.marker) this.marker.material.opacity = 0.26 + Math.sin(t * 3) * 0.09;
    if (this.markerRing) { const s = 1 + Math.sin(t * 3) * 0.09; this.markerRing.scale.set(s, s, s); }
    if (this.markerChevron) this.markerChevron.position.y = 9 + Math.sin(t * 2.2) * 0.9;
  }
}
