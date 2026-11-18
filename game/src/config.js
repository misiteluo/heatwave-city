// HEATWAVE CITY — shared tuning constants and small math helpers.
// Every other module imports from here so the whole game can be rebalanced in one place.

export const CITY = {
  blocks: 9,          // blocks per side (9 x 9 city blocks)
  pitch: 60,          // centre-to-centre distance between blocks (road + block)
  road: 16,           // road width
  block: 44,          // building block footprint (pitch - road)
  beachDepth: 66,     // sand strip depth on the south edge
  waterDepth: 190,    // ocean plane depth beyond the sand
};

export const WORLD = {
  // Street grid spans x,z in [-half, +half]; the beach is at z > half.
  half: (CITY.blocks - 1) * CITY.pitch / 2 + CITY.pitch / 2, // 270
};

export const PLAYER = {
  radius: 0.55,
  walkSpeed: 6.2,
  sprintSpeed: 9.6,
  maxHealth: 100,
  punchRange: 2.1,
  punchDamage: 34,
  enterCarRange: 3.4,
};

export const CAR = {
  radius: 2.3,          // collision circle radius
  length: 4.4,
  width: 2.0,
  maxSpeed: 34,         // m/s forward
  maxReverse: 11,
  accel: 15,
  brake: 30,
  drag: 0.55,           // rolling/air drag coefficient used by stepCar
  turnRate: 1.55,       // rad/s at full lock, scaled by speed
  maxHealth: 100,
};

export const WANTED = {
  maxStars: 5,
  heatPerStar: 100,
  decayPerSec: 4.2,     // heat lost per second while no cop can see the player
  hiddenDecayBonus: 3,  // extra decay while inside a mission "lay low" circle
  sightRange: 62,       // a cop this close counts as seeing the player
  copsPerStar: [0, 1, 2, 3, 4, 6],
};

export const CRIMES = {
  stealCar: 55,
  stealCarWitnessed: 85,
  hitPed: 90,
  hitCar: 22,
  shootNear: 30,
  killEnemy: 45,
  missionCrime: 60,
};

export const COLORS = {
  sky: 0xffb36b,
  fog: 0xf7a56b,
  sun: 0xffd9a3,
  carPaint: [0xd64541, 0x2e86de, 0xf5b041, 0x27ae60, 0xecf0f1, 0x8e44ad, 0x16a085, 0xe67e22, 0xfd79a8, 0x576574],
  policePaint: 0xf4f6f7,
  gangPaint: 0x22252b,
};

// Deterministic RNG (mulberry32) so staged screenshot scenes lay out the same every load.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * clamp(t, 0, 1);
}

// Shortest signed angular difference from a to b.
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// Circle vs AABB resolution: pushes p {x,z} out of the box if it overlaps; returns true when it moved.
export function pushOutOfBox(p, r, box) {
  const nx = clamp(p.x, box.minX, box.maxX);
  const nz = clamp(p.z, box.minZ, box.maxZ);
  const dx = p.x - nx, dz = p.z - nz;
  const d2 = dx * dx + dz * dz;
  if (d2 > r * r) return false;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    p.x = nx + (dx / d) * r;
    p.z = nz + (dz / d) * r;
  } else {
    // Centre inside the box: escape along the smallest penetration axis.
    const left = p.x - box.minX, right = box.maxX - p.x;
    const top = p.z - box.minZ, bottom = box.maxZ - p.z;
    const m = Math.min(left, right, top, bottom);
    if (m === left) p.x = box.minX - r;
    else if (m === right) p.x = box.maxX + r;
    else if (m === top) p.z = box.minZ - r;
    else p.z = box.maxZ + r;
  }
  return true;
}
