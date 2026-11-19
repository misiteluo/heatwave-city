// city.js — builds the static world: ground, roads, blocks, towers, palms,
// streetlights, the south beach and the sea. Also owns building collision
// boxes and the glowing mission marker pillar.

import { GRID, PITCH, BLOCK, HALF, BEACH_Z, SEA_Z, blockCentre, roadLine, makeRng } from './config.js';
import { facadeTexture, shopTexture, sandTexture, seaTexture } from './textures.js';

export class City {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = makeRng(seed * 7919 + 13);
    this.colliders = [];   // {minX,maxX,minZ,maxZ} building footprints
    this.roadsX = [];      // vertical road centre lines
    this.roadsZ = [];      // horizontal road centre lines
    for (let i = 0; i <= GRID; i++) { this.roadsX.push(roadLine(i)); this.roadsZ.push(roadLine(i)); }
    this.sea = null;
    this.marker = null;
    this.markerPos = null;
    this.build();
  }

  build() {
    const rng = this.rng, scene = this.scene;
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0xf6c99b, 180, 620);

    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0xffe0b3, 0.75);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffdf9e, 1.25);
    sun.position.set(-140, 190, -90);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -280; sun.shadow.camera.right = 280;
    sun.shadow.camera.top = 280; sun.shadow.camera.bottom = -280;
    sun.shadow.camera.far = 700;
    scene.add(sun);
    this.sun = sun;

    // Asphalt base for the whole city slab.
    const asphalt = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF * 2 + 80, HALF * 2 + 80),
      new THREE.MeshLambertMaterial({ color: 0x3c4148 }));
    asphalt.rotation.x = -Math.PI / 2;
    asphalt.position.y = -0.05;
    asphalt.receiveShadow = true;
    scene.add(asphalt);

    // Lane dashes along every road line.
    const dashGeo = new THREE.BoxGeometry(0.35, 0.04, 4.4);
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xf7e08a });
    const dashHGeo = new THREE.BoxGeometry(4.4, 0.04, 0.35);
    for (const x of this.roadsX) {
      for (let z = -HALF + 8; z < HALF - 4; z += 11) {
        if (this.roadsZ.some((rz) => Math.abs(rz - z) < 9)) continue;
        const d = new THREE.Mesh(dashGeo, dashMat);
        d.position.set(x, 0.02, z); scene.add(d);
      }
    }
    for (const z of this.roadsZ) {
      for (let x = -HALF + 8; x < HALF - 4; x += 11) {
        if (this.roadsX.some((rx) => Math.abs(rx - x) < 9)) continue;
        const d = new THREE.Mesh(dashHGeo, dashMat);
        d.position.set(x, 0.02, z); scene.add(d);
      }
    }

    const slabGeo = new THREE.BoxGeometry(BLOCK, 0.5, BLOCK);
    const slabMat = new THREE.MeshLambertMaterial({ color: 0xb8b2a7 });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x8a5a44 });

    for (let gx = 0; gx < GRID; gx++) {
      for (let gz = 0; gz < GRID; gz++) {
        const cx = blockCentre(gx), cz = blockCentre(gz);
        const slab = new THREE.Mesh(slabGeo, slabMat);
        slab.position.set(cx, 0.25, cz);
        slab.receiveShadow = true;
        scene.add(slab);
        const roll = rng();
        if (roll < 0.14) { this.plaza(scene, cx, cz, rng); continue; } // open plaza / parking
        if (roll < 0.30) { this.shopBlock(scene, cx, cz, rng, roofMat); continue; }
        this.tower(scene, cx, cz, rng, roofMat);
      }
    }

    this.palmsAndLights(scene, rng);
    this.beach(scene, rng);
  }

  tower(scene, cx, cz, rng, roofMat) {
    const w = 16 + rng() * 9, d = 16 + rng() * 9;
    const floors = 4 + Math.floor(rng() * 10);
    const h = floors * 3.1;
    const tint = ['#ffd9a0', '#ffb4a2', '#ffe5b4', '#bde0fe', '#ffc8dd', '#fdffb6', '#caffbf', '#ffcf9f'][Math.floor(rng() * 8)];
    const tex = facadeTexture(rng, tint, floors, 5);
    tex.wrapS = THREE.RepeatWrapping;
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [mat, mat, roofMat, roofMat, mat, mat]);
    mesh.position.set(cx, 0.5 + h / 2, cz);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    // rooftop box for silhouette interest
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 2, d * 0.4), roofMat);
    cap.position.set(cx, 0.5 + h + 1, cz);
    cap.castShadow = true;
    scene.add(cap);
    this.colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
  }

  shopBlock(scene, cx, cz, rng, roofMat) {
    const tex = shopTexture(rng, ['#ffe8c2', '#ffd1dc', '#c2f0e8'][Math.floor(rng() * 3)]);
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    for (const [ox, oz] of [[-7.5, 0], [7.5, 0]]) {
      const shop = new THREE.Mesh(new THREE.BoxGeometry(13, 6.5, 20), [mat, mat, roofMat, roofMat, mat, mat]);
      shop.position.set(cx + ox, 0.5 + 3.25, cz + oz);
      shop.castShadow = true;
      scene.add(shop);
      this.colliders.push({ minX: cx + ox - 6.5, maxX: cx + ox + 6.5, minZ: cz + oz - 10, maxZ: cz + oz + 10 });
    }
  }

  plaza(scene, cx, cz, rng) {
    // Open block: planters, benches and palms — and room to park cars.
    const planterMat = new THREE.MeshLambertMaterial({ color: 0x5da85f });
    for (const [ox, oz] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 6), planterMat);
      p.position.set(cx + ox, 1, cz + oz);
      p.castShadow = true;
      scene.add(p);
      this.colliders.push({ minX: cx + ox - 3, maxX: cx + ox + 3, minZ: cz + oz - 3, maxZ: cz + oz + 3 });
      this.palm(scene, cx + ox, cz + oz, rng, 1.6);
    }
  }

  palm(scene, x, z, rng, baseY = 0.5) {
    const g = new THREE.Group();
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x9a6a44 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 6.4, 6), trunkMat);
    trunk.position.y = 3.2;
    trunk.rotation.z = (rng() - 0.5) * 0.16;
    trunk.castShadow = true;
    g.add(trunk);
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2fa84f, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.5, 4.6, 4), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.6, 6.9, Math.sin(a) * 1.6);
      leaf.rotation.z = Math.PI / 2.4;
      leaf.rotation.y = -a;
      leaf.castShadow = true;
      g.add(leaf);
    }
    g.position.set(x, baseY, z);
    scene.add(g);
  }

  palmsAndLights(scene, rng) {
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x444a52 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 5.6, 5);
    const bulbGeo = new THREE.SphereGeometry(0.34, 8, 6);
    for (let gx = 0; gx < GRID; gx++) {
      for (let gz = 0; gz < GRID; gz++) {
        const cx = blockCentre(gx), cz = blockCentre(gz);
        if (rng() < 0.75) this.palm(scene, cx - BLOCK / 2 + 1.6, cz - BLOCK / 2 + 1.6, rng);
        if (rng() < 0.6) this.palm(scene, cx + BLOCK / 2 - 1.6, cz + BLOCK / 2 - 1.6, rng);
        if ((gx + gz) % 2 === 0) {
          const lamp = new THREE.Group();
          const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.y = 2.8; lamp.add(pole);
          const bulb = new THREE.Mesh(bulbGeo, bulbMat); bulb.position.y = 5.7; lamp.add(bulb);
          lamp.position.set(cx + BLOCK / 2 + 2.2, 0, cz);
          scene.add(lamp);
        }
      }
    }
    // beach palms
    for (let x = -HALF; x <= HALF; x += 26) {
      if (rng() < 0.8) this.palm(scene, x + rng() * 6, BEACH_Z + 12 + rng() * 22, rng, 0);
    }
  }

  beach(scene, rng) {
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF * 2 + 160, 60),
      new THREE.MeshLambertMaterial({ map: sandTexture(rng) }));
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.01, BEACH_Z + 26);
    sand.receiveShadow = true;
    scene.add(sand);
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF * 2 + 320, 190),
      new THREE.MeshLambertMaterial({ map: seaTexture(rng), transparent: true, opacity: 0.94 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, 0.15, SEA_Z + 92);
    scene.add(sea);
    this.sea = sea;
    // a simple pier at the docks (south-east), used by the finale
    const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6844 });
    const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 46), pierMat);
    pier.position.set(176, 0.6, SEA_Z + 18);
    pier.castShadow = true;
    scene.add(pier);
    this.colliders.push({ minX: 171, maxX: 181, minZ: SEA_Z - 4, maxZ: SEA_Z + 40 });
  }

  // Push a point (with radius) out of every building footprint.
  collide(pos, radius) {
    for (const b of this.colliders) {
      const nx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const nz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      const dx = pos.x - nx, dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          pos.x = nx + (dx / d) * radius;
          pos.z = nz + (dz / d) * radius;
        } else {
          // inside the box: exit through the nearest face
          const left = pos.x - b.minX, right = b.maxX - pos.x;
          const top = pos.z - b.minZ, bot = b.maxZ - pos.z;
          const m = Math.min(left, right, top, bot);
          if (m === left) pos.x = b.minX - radius;
          else if (m === right) pos.x = b.maxX + radius;
          else if (m === top) pos.z = b.minZ - radius;
          else pos.z = b.maxZ + radius;
          return true;
        }
        return true;
      }
    }
    return false;
  }

  setMarker(x, z, color = 0xffd23f) {
    this.clearMarker();
    const geo = new THREE.CylinderGeometry(2.6, 2.6, 60, 20, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false });
    this.marker = new THREE.Mesh(geo, mat);
    this.marker.position.set(x, 30, z);
    this.scene.add(this.marker);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2, 2.7, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.15, z);
    this.scene.add(ring);
    this.markerRing = ring;
    this.markerPos = { x, z };
  }

  clearMarker() {
    if (this.marker) { this.scene.remove(this.marker); this.marker = null; }
    if (this.markerRing) { this.scene.remove(this.markerRing); this.markerRing = null; }
    this.markerPos = null;
  }

  update(dt, t) {
    if (this.sea) this.sea.position.y = 0.15 + Math.sin(t * 0.7) * 0.06;
    if (this.marker) this.marker.material.opacity = 0.28 + Math.sin(t * 3) * 0.1;
    if (this.markerRing) { const s = 1 + Math.sin(t * 3) * 0.08; this.markerRing.scale.set(s, s, s); }
  }
}
