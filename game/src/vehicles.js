// vehicles.js — everything with an engine. The models are built
// properly: bodies are extruded side profiles with real silhouettes
// (hood, beltline, trunk), cabins are tinted glass under a painted
// roof, wheels are tyred cylinders with hub caps, and all the small
// stuff — bumpers, grilles, mirrors, light clusters, door handles —
// is merged into one vertex-coloured trim mesh per car. The
// helicopter gets a rounded fuselage, a glass bubble and a
// translucent rotor-blur disc; boats get a pointed-bow hull, a
// windshield and an outboard motor.
//
// Round 7 widens the fleet to nine car types — a wedge supercar and
// an armoured SUV join the line-up — and gives every car a damage
// life: paint-smoke, then flame, then a blackened wreck. Nitro with
// exhaust flames and an FOV kick is standard, spike strips shred
// tyres, the pickup does lowrider bounces on its suspension, police
// boats hunt on the water, and Crane's yacht rides at anchor in the
// bay with a deck you can fight across.

import { clamp, makeRng } from './config.js';
import { dotTexture, containerTexture } from './textures.js';
import { buildHumanoid } from './player.js';

export const CAR_TYPES = {
  sedan:  { top: 30, accel: 16, w: 2.0, l: 4.5, hp: 130, radius: 1.7, grip: 9 },
  sports: { top: 39, accel: 23, w: 2.05, l: 4.4, hp: 110, radius: 1.7, grip: 11 },
  super:  { top: 47, accel: 29, w: 2.1, l: 4.6, hp: 120, radius: 1.75, grip: 12 },
  pickup: { top: 27, accel: 15, w: 2.1, l: 4.9, hp: 170, radius: 1.85, grip: 8 },
  truck:  { top: 22, accel: 11, w: 2.4, l: 7.2, hp: 260, radius: 2.5, grip: 7 },
  taxi:   { top: 30, accel: 16, w: 2.0, l: 4.5, hp: 130, radius: 1.7, grip: 9 },
  moto:   { top: 37, accel: 24, w: 0.8, l: 2.3, hp: 55, radius: 1.0, grip: 12 },
  police: { top: 35, accel: 20, w: 2.0, l: 4.6, hp: 190, radius: 1.75, grip: 10 },
  armor:  { top: 31, accel: 14, w: 2.25, l: 5.1, hp: 420, radius: 1.95, grip: 8 },
};

// --- shared materials -------------------------------------------------
const paintCache = new Map();
export function paintMat(color) {
  if (!paintCache.has(color)) {
    paintCache.set(color, new THREE.MeshPhongMaterial({ color, shininess: 85, specular: 0x93a7c4 }));
  }
  return paintCache.get(color);
}
const glassMat = new THREE.MeshPhongMaterial({ color: 0x14242f, shininess: 140, specular: 0xcfe8ff });
const tireMat = new THREE.MeshLambertMaterial({ color: 0x17181c });
const hubMat = new THREE.MeshPhongMaterial({ color: 0xb9c1cc, shininess: 90, specular: 0xffffff });
const trimMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const darkMetal = new THREE.MeshPhongMaterial({ color: 0x23262c, shininess: 60, specular: 0x7787a0 });
const smokeTexture = dotTexture();

// Night-time headlight cones share one material so the city can
// fade them all in with a single opacity write. Nitro flames share
// one too — they're either lit or not worth a uniform each.
export const vehicleFx = { night: 0 };
const headlightMat = new THREE.MeshBasicMaterial({
  color: 0xffe9a8, transparent: true, opacity: 0,
  blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
});
const flameMat = new THREE.MeshBasicMaterial({
  color: 0xff8c3a, transparent: true, opacity: 0.85,
  blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
});
export function updateVehicleFx() {
  headlightMat.opacity = 0.13 * vehicleFx.night;
}

// --- geometry helpers ---------------------------------------------------
// Extrude a side profile (shape x = length, front at +x; y = height)
// across the car's width, centred, with a small bevel for soft edges.
function extrudeProfile(points, width, bevel = 0.05) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.1, width - bevel * 2), bevelEnabled: true,
    bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 1, steps: 1,
  });
  geo.rotateY(-Math.PI / 2); // shape +x (front) -> +z; extrusion -> x
  geo.translate(width / 2 - bevel, 0, 0);
  return geo;
}

// Collects small coloured boxes into one vertex-coloured geometry:
// bumpers, grilles, mirrors, light clusters, liveries, spoilers.
class Trim {
  constructor() { this.geos = []; }
  box(w, h, d, color, x, y, z, rx = 0, ry = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (rx || ry) {
      const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, 0));
      g.applyMatrix4(m);
    }
    g.translate(x, y, z);
    this.geos.push(g);
    return this;
  }
  build() {
    let total = 0;
    const parts = this.geos.map((g) => { const ng = g.toNonIndexed(); total += ng.attributes.position.count; return ng; });
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
    let o = 0;
    for (const g of parts) {
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      col.set(g.attributes.color.array, o * 3);
      o += g.attributes.position.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(geo, trimMat);
    mesh.castShadow = true;
    return mesh;
  }
}

const wheelGeoCache = new Map();
function wheelGeo(radius, width) {
  const key = radius + ':' + width;
  if (!wheelGeoCache.has(key)) {
    const g = new THREE.CylinderGeometry(radius, radius, width, 18);
    g.rotateZ(Math.PI / 2); // axle along x; hub caps face out
    wheelGeoCache.set(key, g);
  }
  return wheelGeoCache.get(key);
}
const WHEEL_MATS = [tireMat, hubMat, hubMat];
function makeWheel(radius, width, x, y, z, parent) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const tyre = new THREE.Mesh(wheelGeo(radius, width), WHEEL_MATS);
  tyre.castShadow = true;
  pivot.add(tyre);
  parent.add(pivot);
  return pivot;
}

const coneGeoShared = new THREE.ConeGeometry(0.62, 3.6, 10, 1, true);
function addHeadlightCones(group, spec, y = 0.62) {
  for (const sx of [-1, 1]) {
    const cone = new THREE.Mesh(coneGeoShared, headlightMat);
    cone.rotation.x = Math.PI / 2 + 0.1; // apex back at the lamp, beam forward
    cone.position.set(sx * spec.w * 0.32, y, spec.l / 2 + 1.7);
    group.add(cone);
  }
}

const flameGeoShared = new THREE.ConeGeometry(0.16, 1.5, 8, 1, true);
function addFlames(group, spec) {
  const flames = [];
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(flameGeoShared, flameMat);
    f.rotation.x = -Math.PI / 2; // point backward, out of the exhaust
    f.position.set(sx * spec.w * 0.28, 0.38, -spec.l / 2 - 0.7);
    f.visible = false;
    group.add(f);
    flames.push(f);
  }
  group.userData.flames = flames;
}

// --- car profiles -------------------------------------------------------
function bodyProfile(type) {
  switch (type) {
    case 'sports': return [[-2.2, 0.34], [-2.24, 0.78], [-1.7, 0.86], [-0.4, 0.9], [1.2, 0.88], [2.05, 0.74], [2.24, 0.55], [2.2, 0.34]];
    case 'super': return [[-2.3, 0.3], [-2.34, 0.62], [-1.6, 0.7], [-0.2, 0.72], [1.4, 0.66], [2.2, 0.5], [2.34, 0.38], [2.3, 0.3]];
    case 'pickup': return [[-2.45, 0.36], [-2.45, 1.02], [-0.55, 1.02], [-0.35, 1.0], [1.35, 0.98], [2.3, 0.9], [2.45, 0.66], [2.42, 0.36]];
    case 'armor': return [[-2.55, 0.38], [-2.58, 1.28], [-2.2, 1.34], [1.6, 1.34], [2.2, 1.26], [2.55, 0.92], [2.58, 0.38]];
    case 'truck': return [[-1.15, 0.4], [-1.15, 1.5], [-0.7, 1.52], [0.75, 1.3], [1.25, 1.05], [1.3, 0.4]]; // cab only; cargo is separate
    default: return [[-2.25, 0.32], [-2.28, 0.92], [-1.5, 0.99], [0.9, 0.99], [1.95, 0.9], [2.26, 0.7], [2.28, 0.32]];
  }
}
function cabinProfile(type) {
  switch (type) {
    case 'sports': return [[-1.55, 0.86], [-0.95, 1.3], [0.35, 1.33], [1.25, 0.87]];
    case 'super': return [[-1.35, 0.68], [-0.8, 1.02], [0.3, 1.04], [1.15, 0.68]];
    case 'pickup': return [[-0.5, 1.0], [-0.28, 1.5], [0.95, 1.5], [1.3, 1.0]];
    case 'armor': return [[-2.05, 1.3], [-1.85, 1.62], [1.35, 1.62], [1.6, 1.3]];
    case 'truck': return [[-0.72, 1.28], [-0.55, 1.5], [0.62, 1.32], [0.85, 1.02]];
    default: return [[-1.35, 0.96], [-0.85, 1.44], [0.6, 1.46], [1.25, 0.97]];
  }
}

const bodyGeoCache = new Map();
function bodyGeo(type, kind) {
  const key = type + ':' + kind;
  if (!bodyGeoCache.has(key)) {
    const spec = CAR_TYPES[type] || CAR_TYPES.sedan;
    if (kind === 'body') bodyGeoCache.set(key, extrudeProfile(bodyProfile(type), spec.w));
    else bodyGeoCache.set(key, extrudeProfile(cabinProfile(type), spec.w - 0.36, 0.04));
  }
  return bodyGeoCache.get(key);
}

let taxiSignTex = null;
function taxiSignTexture() {
  if (taxiSignTex) return taxiSignTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 48;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(0, 0, 128, 48);
  ctx.fillStyle = '#14161c'; ctx.font = 'bold 30px Arial';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('TAXI', 64, 26);
  taxiSignTex = new THREE.CanvasTexture(c);
  taxiSignTex.encoding = THREE.sRGBEncoding;
  return taxiSignTex;
}

export function buildCarMesh(type, color, opts = {}) {
  const spec = CAR_TYPES[type];
  const g = new THREE.Group();
  const paint = paintMat(opts.police ? 0xf4f6f8 : color);
  const bodyType = type === 'taxi' || type === 'police' ? 'sedan' : type;

  const body = new THREE.Mesh(bodyGeo(bodyType, 'body'), paint);
  body.castShadow = true;
  g.add(body);

  if (type === 'truck') {
    // Ribbed cargo box behind the cab.
    const cargoTex = containerTexture(makeRng(7), '#cfd6dd');
    const cargo = new THREE.Mesh(
      new THREE.BoxGeometry(2.34, 2.3, 4.9),
      new THREE.MeshPhongMaterial({ map: cargoTex, shininess: 25, specular: 0x555f6e })
    );
    cargo.position.set(0, 1.62, -2.3);
    cargo.castShadow = true;
    g.add(cargo);
    const cabGlass = new THREE.Mesh(bodyGeo('truck', 'cabin'), glassMat);
    cabGlass.position.z = 2.35;
    g.add(cabGlass);
    body.position.z = 2.35;
  } else if (type === 'armor') {
    // Armoured glass band + roof panel + hatch.
    const cabin = new THREE.Mesh(bodyGeo('armor', 'cabin'), glassMat);
    cabin.castShadow = true;
    g.add(cabin);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(spec.w - 0.24, 0.09, 3.1), paint);
    roof.position.set(0, 1.66, -0.25);
    roof.castShadow = true;
    g.add(roof);
  } else {
    const cabin = new THREE.Mesh(bodyGeo(bodyType, 'cabin'), glassMat);
    cabin.castShadow = true;
    g.add(cabin);
    // Painted roof panel following the cabin's top line.
    const roofY = type === 'sports' ? 1.35 : type === 'super' ? 1.07 : type === 'pickup' ? 1.53 : 1.48;
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(spec.w - 0.3, 0.07, type === 'sports' || type === 'super' ? 1.3 : 1.5), paint);
    roof.position.set(0, roofY, type === 'sports' || type === 'super' ? -0.28 : -0.1);
    roof.castShadow = true;
    g.add(roof);
  }

  // Trim: all the small stuff in one merged vertex-coloured mesh.
  const t = new Trim();
  const dark = 0x1d2026, chrome = 0x9aa7b5;
  const frontZ = spec.l / 2;
  const rearZ = type === 'truck' ? -4.78 : -spec.l / 2; // the cargo box is the truck's tail
  t.box(spec.w + 0.1, 0.24, 0.22, dark, 0, 0.42, frontZ + 0.02);            // front bumper
  t.box(spec.w + 0.1, 0.24, 0.22, dark, 0, 0.42, rearZ - 0.02);             // rear bumper
  t.box(spec.w * 0.52, 0.3, 0.1, 0x11141a, 0, 0.66, frontZ + 0.1);          // grille
  t.box(spec.w * 0.94, 0.1, spec.l * 0.8, 0x14161a, 0, 0.3, 0);             // shadow line
  for (const sx of [-1, 1]) {
    t.box(0.3, 0.13, 0.06, 0xfff3b0, sx * spec.w * 0.33, 0.68, frontZ + 0.1);   // headlights
    t.box(0.3, 0.11, 0.06, 0xd7263d, sx * spec.w * 0.33, 0.7, rearZ - 0.1);     // taillights
    t.box(0.08, 0.1, 0.2, dark, sx * (spec.w / 2 + 0.09), 1.06, 0.72);          // mirrors
    t.box(0.04, 0.05, 0.3, chrome, sx * (spec.w / 2 + 0.03), 0.86, -0.15);      // door handles
  }
  if (type === 'sports' || type === 'super') {
    t.box(0.07, 0.2, 0.3, dark, -0.7, type === 'super' ? 0.78 : 1.0, -2.05);
    t.box(0.07, 0.2, 0.3, dark, 0.7, type === 'super' ? 0.78 : 1.0, -2.05);
    t.box(1.9, 0.07, 0.42, dark, 0, type === 'super' ? 0.92 : 1.14, -2.1);       // spoiler wing
    t.box(0.5, 0.16, 0.08, 0xd7263d, 0, 0.52, spec.l / 2 + 0.12);                // splitter lip
    if (type === 'super') { // side air intakes behind the doors
      t.box(0.06, 0.3, 0.9, 0x0c0e12, -spec.w / 2 - 0.02, 0.55, -0.7);
      t.box(0.06, 0.3, 0.9, 0x0c0e12, spec.w / 2 + 0.02, 0.55, -0.7);
    }
  }
  if (type === 'pickup') {
    t.box(0.09, 0.42, 1.85, color, -spec.w / 2 + 0.06, 1.2, -1.5);
    t.box(0.09, 0.42, 1.85, color, spec.w / 2 - 0.06, 1.2, -1.5);
    t.box(spec.w - 0.1, 0.42, 0.09, color, 0, 1.2, -2.42);
    t.box(spec.w - 0.2, 0.06, 1.8, 0x2a2d33, 0, 1.0, -1.5);                      // bed floor
    t.box(0.8, 0.55, 0.8, 0xa67c4e, -0.4, 1.3, -1.7);                             // cargo crates in the bed
    t.box(0.62, 0.42, 0.62, 0x8a6844, 0.48, 1.24, -1.3);
  }
  if (type === 'armor') {
    t.box(spec.w * 0.8, 0.5, 0.12, 0x14161c, 0, 0.62, spec.l / 2 + 0.2);          // brush guard
    for (const sx of [-1, 1]) t.box(0.1, 0.34, 0.5, 0x2c313a, sx * (spec.w / 2 + 0.06), 1.0, -1.9); // rear step boxes
    t.box(0.7, 0.16, 0.7, 0x2c313a, 0, 1.74, -0.25);                               // roof hatch
    t.box(0.34, 0.2, 0.05, 0xffe9a8, 0, 1.05, spec.l / 2 + 0.24);                  // guard lamp
  }
  if (opts.police) {
    for (const sx of [-1, 1]) {
      t.box(0.05, 0.52, 1.7, 0x14161c, sx * (spec.w / 2 + 0.045), 0.68, 0.05);   // black door panels
      t.box(0.05, 0.16, 1.7, 0x2b6cb0, sx * (spec.w / 2 + 0.045), 0.98, 0.05);   // blue cheatline
    }
    t.box(spec.w * 0.7, 0.34, 0.14, 0x14161c, 0, 0.5, spec.l / 2 + 0.18);        // push bar
  }
  g.add(t.build());

  if (type === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.24, 0.3),
      new THREE.MeshBasicMaterial({ map: taxiSignTexture() })
    );
    sign.position.set(0, 1.62, -0.1);
    g.add(sign);
  }
  if (opts.marker) { // the gold mission car gets a wing you can spot across a car park
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.4), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    wing.position.set(0, 1.2, -spec.l / 2 + 0.25);
    g.add(wing);
  }

  // Wheels, ordered [front pair, rear pair(s)] — trucks get a dual
  // rear axle; the first two are always the steering pair.
  const wheels = [];
  const wr = type === 'truck' || type === 'armor' ? 0.54 : type === 'sports' || type === 'super' ? 0.44 : 0.42;
  const ww = type === 'sports' || type === 'super' ? 0.42 : 0.34;
  const wheelRows = type === 'truck' ? [2.45, -1.35, -2.25] : [spec.l / 2 - 1.05, -(spec.l / 2 - 1.05)];
  for (const wz of wheelRows) {
    for (const sx of [-1, 1]) {
      wheels.push(makeWheel(wr, ww, sx * (spec.w / 2 - 0.03), wr, wz, g));
    }
  }
  g.userData.wheels = wheels;
  g.userData.steerWheels = [0, 1];

  if (opts.police) {
    const bar = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.09, 0.34), darkMetal);
    bar.add(base);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.17, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2233 }));
    red.position.set(-0.29, 0.12, 0);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.17, 0.3), new THREE.MeshBasicMaterial({ color: 0x2255ff }));
    blue.position.set(0.29, 0.12, 0);
    bar.add(red); bar.add(blue);
    bar.position.set(0, 1.56, -0.1);
    g.add(bar);
    g.userData.bar = { red, blue };
  }
  addHeadlightCones(g, spec, type === 'truck' ? 0.72 : 0.64);
  addFlames(g, spec);
  return g;
}

function buildMotoMesh(color, opts = {}) {
  const g = new THREE.Group();
  const paint = paintMat(color);
  const tank = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), paint);
  tank.scale.set(0.75, 0.62, 1.5);
  tank.position.set(0, 0.78, 0.12);
  tank.castShadow = true;
  g.add(tank);
  const t = new Trim();
  t.box(0.34, 0.14, 0.7, 0x17181c, 0, 0.82, -0.52);            // seat
  t.box(0.4, 0.36, 0.55, 0x2a2d33, 0, 0.5, 0.05);             // engine block
  t.box(0.06, 0.5, 0.06, 0x9aa7b5, -0.14, 0.78, 0.78, -0.5);  // forks
  t.box(0.06, 0.5, 0.06, 0x9aa7b5, 0.14, 0.78, 0.78, -0.5);
  t.box(0.56, 0.06, 0.06, 0x17181c, 0, 1.0, 0.88);            // handlebar
  t.box(0.3, 0.1, 0.05, 0xfff3b0, 0, 0.72, 1.02);             // headlight
  t.box(0.2, 0.08, 0.05, 0xd7263d, 0, 0.78, -0.92);           // taillight
  g.add(t.build());
  g.userData.wheels = [
    makeWheel(0.37, 0.13, 0, 0.37, 0.95, g),
    makeWheel(0.37, 0.13, 0, 0.37, -0.85, g),
  ];
  g.userData.steerWheels = [0];
  addFlames(g, CAR_TYPES.moto);
  if (opts.rider !== false) {
    const rider = buildHumanoid(opts.riderColor || 0x39424e, 0x22242c, 0xe0ac69, { capColor: 0x17181c });
    rider.position.set(0, 0.62, -0.18);
    rider.rotation.x = 0.22;
    const l = rider.userData.limbs, j = rider.userData.joints;
    if (l && j) {
      l.legL.rotation.x = -1.0; l.legR.rotation.x = -1.0;
      j.kneeL.rotation.x = -1.5; j.kneeR.rotation.x = -1.5;
      l.armL.rotation.x = -0.85; l.armR.rotation.x = -0.85;
      j.elbowL.rotation.x = 0.55; j.elbowR.rotation.x = 0.55;
    }
    g.add(rider);
    g.userData.rider = rider;
  }
  return g;
}

export class Car {
  constructor(scene, type, color, x, z, heading, opts = {}) {
    this.type = type;
    this.spec = CAR_TYPES[type];
    this.colorHex = color;          // kept: the garage stores and restores it
    this.x = x; this.z = z; this.heading = heading;
    this.speed = 0;
    this.health = this.spec.hp;
    this.maxHealth = this.spec.hp;  // Rosa's repair check reads this
    this.dead = false;
    this.occupied = false;
    this.ai = null;
    this.crashInfo = null;
    this.steerVis = 0;
    this.wheelSpin = 0;
    this.smokeAcc = 0;
    this.nitro = 1;          // a full tank of laughing gas
    this.boosting = false;
    this.spikeT = 0;         // seconds of shredded tyres left
    this.bounceT = 0;        // lowrider suspension bounce timer
    this.rpm = 0;            // 0..1 sawtooth for the engine note
    this.mesh = type === 'moto' ? buildMotoMesh(color, opts) : buildCarMesh(type, color, opts);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    // Pooled smoke sprites ride with the car (hidden while idle, so
    // a healthy car costs no sprite draw calls at all).
    this.smokes = [];
    for (let i = 0; i < 2; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTexture, color: 0xcccccc, transparent: true, opacity: 0, depthWrite: false }));
      s.scale.set(1, 1, 1);
      s.visible = false;
      scene.add(s);
      this.smokes.push({ s, life: -1, vx: 0, vz: 0 });
    }
    this.smokeIdx = 0;
  }

  flashLights(on, t) {
    const bar = this.mesh.userData.bar;
    if (!bar) return;
    if (!on) {
      bar.red.material.color.setHex(0x66101c);
      bar.blue.material.color.setHex(0x102a66);
      return;
    }
    const phase = Math.floor(t * 6) % 2;
    bar.red.material.color.setHex(phase ? 0xff2233 : 0x55101a);
    bar.blue.material.color.setHex(phase ? 0x11295e : 0x3377ff);
  }

  damage(amount, world) {
    if (this.dead) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.dead = true;
      if (world && world.onCarDestroyed) world.onCarDestroyed(this);
    }
  }

  // Spike strips: tyres gone, top speed gutted, steering wanders.
  shredTyres(seconds = 12) { this.spikeT = Math.max(this.spikeT, seconds); }

  drive(dt, input, city) {
    const spec = this.spec;
    if (this.dead) input = { throttle: 0, steer: 0 };
    this.spikeT = Math.max(0, this.spikeT - dt);
    // Nitro: drains fast, refills slowly, and only bites while the
    // throttle is down.
    this.boosting = !!(input.nitro && this.nitro > 0.02 && input.throttle > 0 && !this.dead);
    if (this.boosting) this.nitro = Math.max(0, this.nitro - dt * 0.42);
    else this.nitro = Math.min(1, this.nitro + dt * 0.1);
    let top = spec.top * (this.boosting ? 1.5 : 1);
    if (this.spikeT > 0) top *= 0.45;
    const target = input.throttle * top;
    const rate = (input.throttle !== 0 ? spec.accel : 14) * (this.boosting ? 1.8 : 1);
    if (this.speed < target) this.speed = Math.min(target, this.speed + rate * dt);
    else this.speed = Math.max(target, this.speed - rate * 1.6 * dt);
    if (input.handbrake) this.speed -= this.speed * 2.6 * dt;
    // The pickup's party trick: handbrake at a crawl = hydraulics.
    if (this.type === 'pickup' && input.handbrake && Math.abs(this.speed) < 3 && !this.dead) this.bounceT = 0.7;
    this.bounceT = Math.max(0, this.bounceT - dt);
    const steerTarget = input.steer * 0.55 * (this.type === 'moto' ? 1.35 : 1);
    this.steerVis += (steerTarget - this.steerVis) * Math.min(1, dt * 8);
    const grip = (input.handbrake ? spec.grip * 0.35 : spec.grip) * (this.spikeT > 0 ? 0.6 : 1);
    if (Math.abs(this.speed) > 0.2) {
      this.heading += this.steerVis * clamp(this.speed / 9, -1.4, 1.4) * grip * 0.16 * dt * (this.speed < 0 ? -1 : 1);
      if (this.spikeT > 0) this.heading += Math.sin(performance.now() * 0.02) * 0.12 * dt; // shredded wobble
    }
    let nx = this.x + Math.sin(this.heading) * this.speed * dt;
    let nz = this.z + Math.cos(this.heading) * this.speed * dt;
    const probe = { x: nx, z: nz };
    const before = { x: nx, z: nz };
    city.collide(probe, spec.radius * 0.72);
    if (Math.abs(probe.x - before.x) > 0.001 || Math.abs(probe.z - before.z) > 0.001) {
      if (Math.abs(this.speed) > 9) this.crashInfo = { speed: Math.abs(this.speed) };
      this.speed *= -0.25;
      nx = probe.x; nz = probe.z;
    }
    this.x = nx; this.z = nz;
    this.wheelSpin += this.speed * dt * 1.9;
    // Engine note: a sawtooth through four gears, for the audio band.
    const ratio = clamp(Math.abs(this.speed) / spec.top, 0, 1);
    this.rpm = (ratio * 3.6) % 1;
    if (this.boosting) this.rpm = 0.85 + Math.random() * 0.15;
    // Exhaust flames while the bottle is open.
    const flames = this.mesh.userData.flames;
    if (flames) {
      const on = this.boosting && Math.abs(this.speed) > 4;
      for (const f of flames) {
        f.visible = on;
        if (on) f.scale.set(1, 0.8 + Math.random() * 0.7, 1);
      }
    }
    this.syncMesh(city);
  }

  syncMesh(city) {
    const y = city ? city.groundY(this.x, this.z) : 0;
    let bounce = 0, pitch = 0;
    if (this.bounceT > 0) {
      bounce = Math.abs(Math.sin(this.bounceT * 16)) * 0.11;
      pitch = Math.sin(this.bounceT * 16) * 0.03;
    }
    this.mesh.position.set(this.x, y + bounce, this.z);
    this.mesh.rotation.y = this.heading;
    this.mesh.rotation.x = pitch;
    if (this.type === 'moto') this.mesh.rotation.z = -this.steerVis * 0.4;
    const wheels = this.mesh.userData.wheels || [];
    const steerers = this.mesh.userData.steerWheels || [0, 1];
    for (let i = 0; i < wheels.length; i++) {
      wheels[i].rotation.x = this.wheelSpin;
      if (steerers.includes(i)) wheels[i].rotation.y = this.steerVis * 0.7;
    }
  }

  updateSmoke(dt) {
    // Damage life: healthy = nothing, hurt = grey smoke, critical =
    // orange flame licks, dead = black smoke over a low fire.
    const frac = this.health / this.spec.hp;
    const want = this.dead ? 0.55 : frac < 0.22 ? 0.34 : frac < 0.5 ? 0.16 : 0;
    this.smokeAcc += dt * want * 8;
    for (const p of this.smokes) {
      if (p.life >= 0) {
        p.life += dt;
        p.s.position.x += p.vx * dt;
        p.s.position.y += dt * 1.6;
        p.s.position.z += p.vz * dt;
        const k = p.life / 1.5;
        p.s.material.opacity = 0.4 * (1 - k);
        const sc = 0.8 + k * 2.4;
        p.s.scale.set(sc, sc, 1);
        if (k >= 1) { p.life = -1; p.s.visible = false; }
      }
    }
    if (this.smokeAcc >= 1) {
      this.smokeAcc = 0;
      const p = this.smokes[this.smokeIdx++ % this.smokes.length];
      p.life = 0;
      p.vx = (Math.random() - 0.5) * 0.5;
      p.vz = (Math.random() - 0.5) * 0.5;
      p.s.position.set(this.x, 1.2, this.z);
      p.s.visible = true;
      if (this.dead) p.s.material.color.setHex(Math.random() < 0.4 ? 0xff7b33 : 0x2e2e2e);
      else if (frac < 0.22) p.s.material.color.setHex(Math.random() < 0.55 ? 0xff8c3a : 0x666666);
      else p.s.material.color.setHex(0xbbbbbb);
    }
  }

  remove(scene) {
    scene.remove(this.mesh);
    for (const p of this.smokes) scene.remove(p.s);
  }
}

// --- helicopter -----------------------------------------------------------
export function buildHeliMesh(color, opts = {}) {
  const g = new THREE.Group();
  const paint = paintMat(color);
  // Rounded fuselage: a squashed sphere over a belly fairing.
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.05, 18, 14), paint);
  body.scale.set(0.95, 0.82, 1.55);
  body.position.set(0, 1.25, 0.25);
  body.castShadow = true;
  g.add(body);
  const belly = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 2.6), darkMetal);
  belly.position.set(0, 0.82, 0.15);
  g.add(belly);
  // Tinted glass bubble wrapping the nose.
  const bubble = new THREE.Mesh(
    new THREE.SphereGeometry(0.88, 16, 12, -Math.PI / 2.6, Math.PI / 1.3, 0.15, Math.PI / 1.9), glassMat);
  bubble.scale.set(0.92, 0.8, 1.1);
  bubble.position.set(0, 1.38, 0.85);
  g.add(bubble);
  // Tapered tail boom + fins.
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.3, 3.6, 10), paint);
  boom.rotation.x = Math.PI / 2 - 0.06;
  boom.position.set(0, 1.45, -2.6);
  boom.castShadow = true;
  g.add(boom);
  const t = new Trim();
  t.box(0.08, 0.95, 0.7, color, 0, 1.95, -4.35);          // vertical fin
  t.box(1.15, 0.07, 0.5, color, 0, 1.6, -4.3);           // stabiliser
  t.box(0.5, 0.14, 0.06, 0xfff3b0, -0.4, 1.05, 1.72);     // nose lights
  t.box(0.5, 0.14, 0.06, 0xfff3b0, 0.4, 1.05, 1.72);
  if (opts.police) {
    t.box(0.06, 0.5, 1.9, 0x14161c, -0.93, 1.2, 0.2);     // black side panels
    t.box(0.06, 0.5, 1.9, 0x14161c, 0.93, 1.2, 0.2);
  }
  g.add(t.build());
  // Skids on struts.
  for (const sx of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 2.9, 8), darkMetal);
    skid.rotation.x = Math.PI / 2;
    skid.position.set(sx * 0.85, 0.16, 0.2);
    g.add(skid);
    for (const sz of [-0.7, 1.0]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.62, 6), darkMetal);
      strut.position.set(sx * 0.8, 0.45, sz);
      strut.rotation.z = sx * 0.25;
      g.add(strut);
    }
  }
  // Main rotor: mast, crossed blades, translucent blur disc.
  const rotor = new THREE.Group();
  rotor.position.set(0, 2.2, 0.25);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.35, 8), darkMetal);
  mast.position.y = -0.12;
  rotor.add(mast);
  const bladeGeo = new THREE.BoxGeometry(0.34, 0.045, 6.4);
  rotor.add(new THREE.Mesh(bladeGeo, darkMetal));
  const blade2 = new THREE.Mesh(bladeGeo, darkMetal);
  blade2.rotation.y = Math.PI / 2;
  rotor.add(blade2);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(3.25, 26),
    new THREE.MeshBasicMaterial({ color: 0xdfe9f2, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.03;
  rotor.add(disc);
  g.add(rotor);
  // Tail rotor on the fin.
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.14, 1.95, -4.35);
  tailRotor.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.15, 0.16), darkMetal));
  g.add(tailRotor);
  g.userData.rotor = rotor;
  g.userData.disc = disc;
  g.userData.tailRotor = tailRotor;
  if (opts.police) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(3.4, 15, 18, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
    );
    cone.position.set(0, -6.4, 2.2);
    cone.rotation.x = 0.18;
    cone.visible = false;
    g.add(cone);
    g.userData.searchCone = cone;
  }
  return g;
}

export class Helicopter {
  constructor(scene, color, x, z, heading, opts = {}) {
    this.x = x; this.z = z; this.heading = heading;
    this.alt = 0; this.vy = 0; this.speed = 0;
    this.rotorSpin = 0;
    this.health = 240;
    this.dead = false;
    this.occupied = false;
    this.police = !!opts.police;
    this.spotlightOn = false;
    this.mesh = buildHeliMesh(color, opts);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
  }

  get landed() { return this.alt <= 0.05 && Math.abs(this.vy) < 0.5; }

  floorY(city) { return city.heightAt(this.x, this.z); }

  update(dt, input, city) {
    const spool = input.throttle > 0 || this.alt > 0.1 ? 1 : 0;
    this.rotorSpin += ((spool ? 26 : 0) - this.rotorSpin) * Math.min(1, dt * (spool ? 0.55 : 0.25));
    const liftPower = clamp(this.rotorSpin / 26, 0, 1);
    if (input.turn) this.heading += input.turn * dt * 0.9;
    const targetVy = input.lift * 11 * liftPower;
    this.vy += (targetVy - this.vy) * Math.min(1, dt * 2.2);
    this.alt += this.vy * dt;
    const floor = this.floorY(city);
    if (this.alt < floor) { this.alt = floor; this.vy = Math.max(0, this.vy); }
    if (this.alt > 90) { this.alt = 90; this.vy = Math.min(0, this.vy); }
    const air = clamp(this.alt / 6, 0, 1);
    const targetSpeed = input.throttle * 34 * liftPower;
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * (0.4 + air));
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    this.x = clamp(this.x, -700, 700);
    this.z = clamp(this.z, -700, 720);
    if (this.alt <= floor + 0.01 && input.throttle === 0 && input.lift <= 0) this.speed *= Math.max(0, 1 - dt * 3);
    this.syncMesh(city);
  }

  aiMove(dt, tx, tz, altTarget, city) {
    const dx = tx - this.x, dz = tz - this.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    let dh = want - this.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const turn = clamp(dh * 1.6, -0.85, 0.85);
    const throttle = dist > 26 ? 0.85 : dist > 7 ? 0.4 : 0.08;
    const lift = clamp((altTarget - this.alt) * 0.14, -0.75, 0.85);
    this.update(dt, { throttle, turn, lift }, city);
  }

  syncMesh(city) {
    const gy = city ? city.groundY(this.x, this.z) : 0;
    this.mesh.position.set(this.x, gy + this.alt, this.z);
    this.mesh.rotation.y = this.heading;
    this.mesh.rotation.x = clamp(this.speed * 0.006, -0.14, 0.2);
    const rotor = this.mesh.userData.rotor;
    if (rotor) rotor.rotation.y += this.rotorSpin * 0.45;
    const tail = this.mesh.userData.tailRotor;
    if (tail) tail.rotation.x += this.rotorSpin * 0.9;
    const disc = this.mesh.userData.disc;
    if (disc) disc.material.opacity = clamp((this.rotorSpin - 7) / 26, 0, 1) * 0.14;
    const cone = this.mesh.userData.searchCone;
    if (cone) cone.visible = this.spotlightOn;
  }

  damage(amount) {
    this.health -= amount;
    if (this.health <= 0) this.dead = true;
  }

  remove(scene) { scene.remove(this.mesh); }
}

// --- boats ------------------------------------------------------------------
export function buildBoatMesh(color) {
  const g = new THREE.Group();
  // Hull: a pointed-bow outline extruded upward with a soft bevel.
  const outline = new THREE.Shape();
  outline.moveTo(-0.98, -2.7);
  outline.lineTo(0.98, -2.7);
  outline.lineTo(0.9, 0.9);
  outline.quadraticCurveTo(0.72, 2.1, 0, 3.1);
  outline.quadraticCurveTo(-0.72, 2.1, -0.9, 0.9);
  outline.closePath();
  const hullGeo = new THREE.ExtrudeGeometry(outline, {
    depth: 0.72, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.1, bevelSegments: 1, steps: 1,
  });
  hullGeo.rotateX(Math.PI / 2); // shape plane -> deck plan; extrusion runs downward
  hullGeo.translate(0, 0.86, 0);
  const hull = new THREE.Mesh(hullGeo, paintMat(color));
  hull.castShadow = true;
  g.add(hull);
  const t = new Trim();
  t.box(1.55, 0.09, 4.6, 0xe8e4da, 0, 0.95, -0.25);          // deck
  t.box(1.15, 0.34, 0.9, color, 0, 1.14, -1.5);              // aft bench
  t.box(0.95, 0.3, 0.7, 0x39506b, 0, 1.16, 0.55);            // console
  t.box(0.34, 0.42, 0.34, 0x1d2026, 0, 0.78, -2.95);         // outboard motor
  t.box(0.1, 0.5, 0.24, 0x1d2026, 0, 0.38, -2.95);           // motor shaft
  t.box(0.7, 0.1, 0.14, 0xd7263d, 0, 0.55, 2.2);             // bow stripe
  g.add(t.build());
  const shield = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.05), glassMat);
  shield.position.set(0, 1.5, 0.82);
  shield.rotation.x = -0.42;
  g.add(shield);
  // Wake: a foam sprite at the stern plus a fading trail plane.
  const foam = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTexture, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  foam.scale.set(2.4, 1.2, 1);
  foam.position.set(0, 0.25, -3.4);
  g.add(foam);
  const trail = new THREE.Mesh(
    new THREE.PlaneGeometry(2.0, 7),
    new THREE.MeshBasicMaterial({ map: smokeTexture, color: 0xeaf7ff, transparent: true, opacity: 0, depthWrite: false })
  );
  trail.rotation.x = -Math.PI / 2;
  trail.position.set(0, 0.14, -6.4);
  g.add(trail);
  g.userData.foam = foam;
  g.userData.trail = trail;
  return g;
}

export class Boat {
  constructor(scene, color, x, z, heading, opts = {}) {
    this.spec = { top: opts.police ? 23.5 : 21, radius: 2.2 };
    this.x = x; this.z = z; this.heading = heading;
    this.speed = 0;
    this.health = 150;
    this.dead = false;
    this.occupied = false;
    this.police = !!opts.police;
    this.mesh = buildBoatMesh(opts.police ? 0x2456c8 : color);
    if (opts.police) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.2, 0.3),
        new THREE.MeshBasicMaterial({ color: 0xf4f6f8 }));
      stripe.position.set(0, 0.72, 0.4);
      this.mesh.add(stripe);
    }
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
  }

  drive(dt, input, city) {
    const target = this.dead ? 0 : input.throttle * this.spec.top;
    const rate = 7;
    if (this.speed < target) this.speed = Math.min(target, this.speed + rate * dt);
    else this.speed = Math.max(target, this.speed - rate * 1.4 * dt);
    if (Math.abs(this.speed) > 0.2) {
      this.heading += input.steer * clamp(this.speed / 8, -1, 1) * 0.55 * dt * (this.speed < 0 ? -1 : 1);
    }
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    // Boats stay in the water: land pushes them back out (dock
    // aprons don't count — boats moor against them).
    if (city.isLand(this.x, this.z, true)) {
      this.x -= Math.sin(this.heading) * this.speed * dt;
      this.z -= Math.cos(this.heading) * this.speed * dt;
      this.speed *= -0.3;
    }
    this.x = clamp(this.x, -680, 680);
    this.z = clamp(this.z, -680, 720);
    this.syncMesh(performance.now() / 1000);
  }

  // Police pursuit on water: steer at the target, throttle by gap,
  // and sheer off when the shoreline fills the bow wave.
  aiDrive(dt, tx, tz, city) {
    if (this.dead) { this.drive(dt, { throttle: 0, steer: 0 }, city); return; }
    const dx = tx - this.x, dz = tz - this.z;
    const dist = Math.hypot(dx, dz);
    let want = Math.atan2(dx, dz);
    // Land ahead? Bend the course away from the shore.
    const aheadX = this.x + Math.sin(this.heading) * 12;
    const aheadZ = this.z + Math.cos(this.heading) * 12;
    if (city.isLand(aheadX, aheadZ, true)) want += 0.9;
    let dh = want - this.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const steer = clamp(-dh * 1.4, -1, 1);
    const throttle = dist > 30 ? 1 : dist > 9 ? 0.75 : 0.3;
    this.drive(dt, { throttle, steer }, city);
  }

  syncMesh(t) {
    const bob = Math.sin(t * 1.7 + this.x * 0.05) * 0.05;
    this.mesh.position.set(this.x, bob, this.z);
    this.mesh.rotation.y = this.heading;
    this.mesh.rotation.x = Math.sin(t * 1.3 + this.z * 0.04) * 0.014 - clamp(this.speed * 0.004, -0.03, 0.06);
    this.mesh.rotation.z = Math.sin(t * 1.1) * 0.012;
    const k = clamp(Math.abs(this.speed) / this.spec.top, 0, 1);
    if (this.mesh.userData.foam) this.mesh.userData.foam.material.opacity = 0.5 * k;
    if (this.mesh.userData.trail) {
      this.mesh.userData.trail.material.opacity = 0.3 * k;
      this.mesh.userData.trail.scale.y = 0.5 + k;
    }
  }

  damage(amount) {
    this.health -= amount;
    if (this.health <= 0) this.dead = true;
  }

  remove(scene) { scene.remove(this.mesh); }
}

// --- the yacht ---------------------------------------------------------------
// Crane's yacht, the Meridian Star: a 26-metre white hull riding at
// anchor, two superstructure tiers, a flybridge under a radar arch,
// and an aft deck big enough to hold a firefight. The deck registers
// with the city as a walkable zone (see City.deckZones).
export function buildYachtMesh() {
  const g = new THREE.Group();
  const white = paintMat(0xf2f0ea);
  const outline = new THREE.Shape();
  outline.moveTo(-2.6, -13);
  outline.lineTo(2.6, -13);
  outline.lineTo(2.45, 4);
  outline.quadraticCurveTo(2.1, 10, 0, 13.5);
  outline.quadraticCurveTo(-2.1, 10, -2.45, 4);
  outline.closePath();
  const hullGeo = new THREE.ExtrudeGeometry(outline, {
    depth: 1.5, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.22, bevelSegments: 1, steps: 1,
  });
  hullGeo.rotateX(Math.PI / 2);
  hullGeo.translate(0, 1.35, 0);
  const hull = new THREE.Mesh(hullGeo, white);
  hull.castShadow = true;
  g.add(hull);
  const t = new Trim();
  t.box(4.9, 0.14, 25.5, 0xd8cfbc, 0, 1.42, 0);              // main deck
  t.box(4.2, 1.5, 13, 0xf2f0ea, 0, 2.2, 1.5);                // salon tier
  t.box(4.3, 0.5, 13.2, 0x14242f, 0, 2.55, 1.5);             // salon glass band
  t.box(3.4, 1.3, 8, 0xf2f0ea, 0, 3.6, 2.5);                 // bridge tier
  t.box(3.5, 0.45, 8.2, 0x14242f, 0, 3.85, 2.5);             // bridge glass
  t.box(3.0, 0.16, 7.4, 0xd8cfbc, 0, 4.35, 2.5);             // flybridge deck
  t.box(0.18, 1.1, 3.4, 0xf2f0ea, -1.2, 4.9, 0.5);           // radar arch legs
  t.box(0.18, 1.1, 3.4, 0xf2f0ea, 1.2, 4.9, 0.5);
  t.box(2.6, 0.18, 3.6, 0xf2f0ea, 0, 5.5, 0.5);              // arch top
  t.box(1.4, 0.3, 0.5, 0x2c313a, 0, 5.7, 0.5);               // radar bar
  t.box(1.8, 0.5, 3.2, 0x8a6844, 0, 1.75, -9.5);             // aft deck table block
  t.box(0.9, 0.45, 0.9, 0xc0392b, -1.6, 1.7, -6);            // deck lockers
  t.box(0.9, 0.45, 0.9, 0x2471a3, 1.6, 1.7, -6);
  t.box(5.3, 0.3, 1.1, 0xb03a2e, 0, 0.75, -13.1);            // stern name board zone
  g.add(t.build());
  const name = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.5, 0.06),
    new THREE.MeshBasicMaterial({ color: 0xffd23f }));
  name.position.set(0, 0.78, -13.35);
  name.rotation.y = Math.PI;
  g.add(name);
  return g;
}

export class Yacht {
  constructor(scene, x, z, heading) {
    this.x = x; this.z = z; this.heading = heading;
    this.deckY = 1.5;
    this.radius = 13.5;
    this.mesh = buildYachtMesh();
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    // The boarding ladder hangs off the port quarter, in the water.
    this.ladder = this.deckSpot(-4.6, -6);
  }
  // World point -> yacht-local frame, for the city's deck zone
  // test. Half-beam 3.6 keeps the player inside the rail — a wider
  // test let Dex stand on the water alongside the hull.
  contains(x, z) {
    const dx = x - this.x, dz = z - this.z;
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) < 3.6 && lz > -13.4 && lz < 13.4;
  }
  deckSpot(lx, lz) {
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    return { x: this.x + lx * c + lz * s, z: this.z - lx * s + lz * c };
  }
}
