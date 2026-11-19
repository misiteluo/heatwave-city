// config.js — the shared atlas for HEATWAVE CITY: map geometry, palette,
// cast names and the small math helpers every module leans on.
//
// The city is a 12 x 12 grid of blocks on a peninsula. Land runs from
// -LAND to +LAND on x, and from -LAND to the beach on z; the sea takes
// everything south of the sand and east of the promenade, except for the
// causeway on x = 0 that runs out to Gull Island and its lighthouse.

export const GRID = 12;          // blocks per side
export const PITCH = 46;         // centre-to-centre block spacing
export const BLOCK = 32;         // building plot size inside a pitch cell
export const HALF = (GRID * PITCH) / 2; // 276 — road lines span -HALF..HALF
export const ROAD_HALF = (PITCH - BLOCK) / 2; // 7 — half the road width
export const LAND = HALF + 16;   // 292 — sidewalk edge of the peninsula
export const SAND_Z = HALF + 34; // 310 — sand meets water to the south
export const SEA_X = LAND + 26;  // 318 — water to the east past the boardwalk
export const CAUSEWAY_HALF = 9;  // half width of the Gull Island causeway
export const ISLAND = { x: 0, z: 478, r: 62 };
export const WORLD_EDGE = 620;   // hard clamp for anything that moves

export const PLAYER_START = { x: -207, z: 184, heading: Math.PI };

export function roadLine(i) { return -HALF + i * PITCH; }
export function blockCentre(i) { return -HALF + PITCH / 2 + i * PITCH; }

// District lookup for a block column/row: drives building heights, facade
// palettes and the minimap tint.
export function districtAt(bi, bj) {
  if (bj >= 10) return 'beachfront';
  if (bi <= 1 && bj >= 2 && bj <= 8) return 'portside';
  if (bi >= 9 && bj >= 2 && bj <= 7) return 'marina';
  if (bi >= 3 && bi <= 8 && bj >= 2 && bj <= 7) return 'downtown';
  if (bj <= 1) return 'heights';
  return 'midtown';
}

export const DISTRICT_STYLE = {
  downtown:   { minH: 30, maxH: 78, lots: 'towers' },
  midtown:    { minH: 13, maxH: 32, lots: 'mixed' },
  heights:    { minH: 9,  maxH: 22, lots: 'mixed' },
  marina:     { minH: 11, maxH: 27, lots: 'mixed' },
  beachfront: { minH: 7,  maxH: 17, lots: 'low' },
  portside:   { minH: 7,  maxH: 14, lots: 'sheds' },
};

// Blocks with a job to do instead of buildings: [bi, bj] -> lot kind.
export const SPECIAL_LOTS = {
  '5,5': 'plaza',      // Meridian Bank plaza — the holdout
  '2,5': 'garage',     // Priya's chop shop — deliveries land here
  '6,9': 'parking',    // Midtown parking — a marked Comet waits here
  '10,5': 'helipad',   // Marina helipad — the flyable helicopter
  '7,3': 'park',       // Palms Park
  '0,10': 'beachlot',  // beach parking by the pier road
  '8,2': 'hospital',   // Heatwave General + roof pad marker
  '4,8': 'casino',     // Delgado's Coral Casino forecourt
};

export const CAST = {
  hero: 'Nico Serrano',
  fixer: 'Valentina "Val" Rojas',
  mechanic: 'Priya Nair',
  boss: 'Marco Delgado',
  lieutenant: 'Silas Kane',
  cop: 'Detective Harlan Cole',
};

export const CAR_COLORS = [
  0xff5964, 0xffd23f, 0x3ec1d3, 0xff9a3d, 0x9b5de5, 0x00c9a7,
  0xf15bb5, 0xfee440, 0x4cc9f0, 0xef476f, 0x06d6a0, 0xf8f7ff, 0x222831,
];
export const BUILDING_TINTS = ['#ffe3b3', '#ffc4b2', '#fff0c2', '#cfe8ff', '#ffd3e0', '#fdffb6', '#d9ffcb', '#ffd9a8'];
export const SKIN_TONES = [0xffd1a9, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
export const SHIRT_COLORS = [0xef476f, 0xffd166, 0x06d6a0, 0x118ab2, 0x9b5de5, 0xff7b00, 0xffffff, 0x2ec4b6];

export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2d(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }

export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Forward vector for a heading: heading 0 faces +z, PI/2 faces +x.
export function fwd(h) { return { x: Math.sin(h), z: Math.cos(h) }; }

export const SAVE_KEY = 'heatwave-city-r4-save';
export const WANTED_DECAY_SECONDS = 22;
export const BUSTED_RADIUS = 4.6;
export const BUSTED_SECONDS = 3;
export const DAY_LENGTH = 660; // seconds for a full sun cycle
