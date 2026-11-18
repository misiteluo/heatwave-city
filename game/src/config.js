// HEATWAVE CITY — shared constants, seeded RNG and small math helpers.
// Every module imports from here so the whole city is generated from one seed
// and the staged screenshots (?shot=...) always see the same layout.

export const THREE = window.THREE;

// --- world layout -----------------------------------------------------------
export const PITCH = 56;            // distance between block centres
export const BLOCK_HALF = 20;       // half size of a city block (buildings+walk)
export const GRID = 4;              // blocks run -GRID..GRID on both axes (9x9)
export const BEACH_Z = 292;         // sand starts here (south, +Z)
export const WATER_Z = 332;         // ocean starts here
export const WORLD_HALF = 560;      // ground plane extent

// Road centre lines: roads sit in the gaps between blocks, at block centre
// +/- (BLOCK_HALF + 8); the perimeter road rings the whole grid.
export const ROADS = (() => {
  const s = new Set();
  for (let k = -GRID; k <= GRID; k++) { s.add(k * PITCH - (BLOCK_HALF + 8)); s.add(k * PITCH + (BLOCK_HALF + 8)); }
  return [...s].sort((a, b) => a - b);
})();

// --- gameplay tuning ----------------------------------------------------------
export const WANTED_DECAY_SEC = 14;   // unseen time before a star drops
export const BUSTED_RANGE = 3.6;      // police car this close on foot...
export const BUSTED_SEC = 3;          // ...for this long means BUSTED
export const PLAYER_MAX_HP = 100;

// --- seeded RNG (mulberry32) ---------------------------------------------------
let _s = 7;
export function seedRng(seed) { _s = (seed >>> 0) || 7; }
export function rnd() {
  _s |= 0; _s = (_s + 0x6D2B79F5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function rr(a, b) { return a + rnd() * (b - a); }
export function ri(a, b) { return Math.floor(rr(a, b + 0.9999)); }
export function pick(arr) { return arr[Math.floor(rnd() * arr.length) % arr.length]; }

// --- math helpers ----------------------------------------------------------------
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export function dist2d(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }
export function angleWrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
export function angleLerp(a, b, t) { return a + angleWrap(b - a) * clamp(t, 0, 1); }
// Yaw convention: an object's forward vector is (sin(yaw), 0, cos(yaw)).
export function yawToward(ax, az, bx, bz) { return Math.atan2(bx - ax, bz - az); }

// Circle vs AABB push-out. Boxes are {x0,z0,x1,z1}; p is {x,z} and is mutated.
// Returns true when a push happened.
export function collideCircle(p, radius, boxes) {
  let hit = false;
  for (const b of boxes) {
    const cx = clamp(p.x, b.x0, b.x1), cz = clamp(p.z, b.z0, b.z1);
    const dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 > radius * radius) continue;
    hit = true;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2), push = (radius - d) / d;
      p.x += dx * push; p.z += dz * push;
    } else {
      const pl = p.x - b.x0, pr = b.x1 - p.x, pt = p.z - b.z0, pb = b.z1 - p.z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) p.x = b.x0 - radius; else if (m === pr) p.x = b.x1 + radius;
      else if (m === pt) p.z = b.z0 - radius; else p.z = b.z1 + radius;
    }
  }
  return hit;
}
