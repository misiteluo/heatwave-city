// config.js — the shared atlas for HEATWAVE CITY: map geometry, palette,
// cast names and the small math helpers every module leans on.
//
// The city is a 12 x 12 grid of blocks on a peninsula. Land runs from
// -LAND to +LAND on x, and from -LAND to the beach on z; the sea takes
// everything south of the sand and east of the promenade, except for the
// causeway on x = 0 that runs out to Gull Island, and the open bay that
// boats cross to Pelican Cay in the south-east.

export const GRID = 12;          // blocks per side
export const PITCH = 46;         // centre-to-centre block spacing
export const BLOCK = 32;         // building plot size inside a pitch cell
export const HALF = (GRID * PITCH) / 2; // 276 — road lines span -HALF..HALF
export const ROAD_HALF = (PITCH - BLOCK) / 2; // 7 — half the road width
export const LAND = HALF + 16;   // 292 — sidewalk edge of the peninsula
export const SAND_Z = HALF + 34; // 310 — sand meets water to the south
export const SEA_X = LAND + 26;  // 318 — water to the east past the boardwalk
export const CAUSEWAY_HALF = 9;  // half width of the Gull Island causeway
export const ISLAND = { x: 0, z: 478, r: 62 };       // Gull Island
export const CAY = { x: 356, z: 512, r: 40 };        // Pelican Cay (boat / heli only)
export const WORLD_EDGE = 640;   // hard clamp for anything that moves

export const PLAYER_START = { x: -184, z: 207, heading: Math.PI };

export function roadLine(i) { return -HALF + i * PITCH; }
export function blockCentre(i) { return -HALF + PITCH / 2 + i * PITCH; }

// District lookup for a block column/row: drives building heights, facade
// palettes and the minimap tint.
export function districtAt(bi, bj) {
  if (bj >= 10) return 'beachfront';
  if (bj === 8 && bi >= 3 && bi <= 8) return 'neon';
  if (bi <= 1 && bj >= 2 && bj <= 8) return 'portside';
  if (bi >= 9 && bj >= 2 && bj <= 7) return 'marina';
  if (bi >= 3 && bi <= 8 && bj >= 2 && bj <= 7) return 'downtown';
  if (bj <= 1) return 'heights';
  return 'midtown';
}

export const DISTRICT_STYLE = {
  downtown:   { minH: 32, maxH: 84, lots: 'towers' },
  midtown:    { minH: 13, maxH: 34, lots: 'mixed' },
  heights:    { minH: 9,  maxH: 24, lots: 'mixed' },
  marina:     { minH: 11, maxH: 28, lots: 'mixed' },
  beachfront: { minH: 7,  maxH: 18, lots: 'low' },
  portside:   { minH: 7,  maxH: 15, lots: 'sheds' },
  neon:       { minH: 15, maxH: 38, lots: 'neon' },
};

// Blocks with a job to do instead of buildings: [bi, bj] -> lot kind.
export const SPECIAL_LOTS = {
  '5,5': 'plaza',      // Meridian Bank plaza — holdouts happen here
  '2,5': 'garage',     // Rosa's chop shop — deliveries land here
  '6,9': 'parking',    // Neon Mile parking — a marked Zephyr waits here
  '10,5': 'helipad',   // Marina helipad — the flyable helicopter
  '7,3': 'park',       // Palms Park
  '0,10': 'beachlot',  // beach parking by the pier road
  '8,2': 'hospital',   // Heatwave General + ambulance bay
  '4,8': 'casino',     // Crane's Coral Casino forecourt
  '9,9': 'boatramp',   // Marina south docks — boats moored here
  '1,4': 'hideout1',   // Portside gang hideout (side activity)
  '10,8': 'hideout2',  // Marina warehouse hideout (side activity)
  '6,1': 'hideout3',   // Heights villa hideout (side activity)
};

export const CAST = {
  hero: 'Dex Marlowe',
  fixer: 'Sable Quinn',
  mechanic: 'Rosa Vega',
  boss: 'Victor Crane',
  lieutenant: 'Jonah Pierce',
  cop: 'Detective Elias Brandt',
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

export const SAVE_KEY = 'heatwave-city-r5-save';
export const WANTED_DECAY_SECONDS = 24;
export const BUSTED_RADIUS = 4.6;
export const BUSTED_SECONDS = 3;
export const DAY_LENGTH = 720; // seconds for a full sun cycle
