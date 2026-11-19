// config.js — the shared atlas every other module reads from: map
// geometry, district layout, the cast list, colour palettes and the
// small math helpers nobody wanted to write twice.
//
// The world is a 14 x 14 grid of blocks on a peninsula. Land runs
// from -LAND to +LAND on x and from -LAND down to the beach on z;
// past the sand and the boardwalk it is all sea, apart from the
// causeway on x = 0 out to Gull Island, the open bay boats cross to
// Pelican Cay in the south-east, and the second causeway on
// x = AIRPORT_X running south-west to Gullwing Field — the airport
// island with its runway, terminal, tower and a jet sitting at the
// gate with its engines warm.

export const GRID = 14;                 // blocks per side
export const PITCH = 46;                // centre-to-centre block spacing
export const BLOCK = 32;                // building plot inside a pitch cell
export const HALF = (GRID * PITCH) / 2; // 322 — road lines span -HALF..HALF
export const ROAD_HALF = (PITCH - BLOCK) / 2; // 7 — half the road width
export const LAND = HALF + 16;          // 338 — sidewalk edge of the peninsula
export const SAND_Z = HALF + 34;        // 356 — sand meets water to the south
export const SEA_X = LAND + 26;         // 364 — water east of the boardwalk
export const CAUSEWAY_HALF = 9;         // half width of the Gull causeway
export const ISLAND = { x: 0, z: 478, r: 62 };      // Gull Island
export const CAY = { x: 356, z: 512, r: 40 };       // Pelican Cay (boat / air only)
export const AIRPORT = { x: -310, z: 545, r: 100 }; // Gullwing Field (causeway / boat / air)
export const AIRPORT_X = -310;                      // the airport causeway's line
export const WORLD_EDGE = 720;          // hard clamp for anything that moves

export const PLAYER_START = { x: -184, z: 207, heading: Math.PI };

export function roadLine(i) { return -HALF + i * PITCH; }
export function blockCentre(i) { return -HALF + PITCH / 2 + i * PITCH; }

// Which district a block belongs to. Drives building heights,
// facade palettes, archetypes and the minimap tint.
export function districtAt(bi, bj) {
  if (bj >= 12) return 'beachfront';
  if (bj === 10 && bi >= 4 && bi <= 9) return 'neon';
  if (bi <= 1 && bj >= 2 && bj <= 10) return 'portside';
  if (bi >= 11 && bj >= 2 && bj <= 9) return 'marina';
  if (bi >= 4 && bi <= 9 && bj >= 3 && bj <= 9) return 'downtown';
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

// Blocks with a job to do instead of a tower on them: "bi,bj" -> lot.
export const SPECIAL_LOTS = {
  '6,6': 'plaza',       // Meridian Bank plaza — holdouts happen here
  '2,6': 'garage',      // Rosa's chop shop — deliveries land here
  '7,11': 'parking',    // Neon Mile parking — a marked Zephyr waits here
  '12,6': 'helipad',    // Marina helipad — the flyable helicopter
  '8,4': 'park',        // Palms Park
  '0,12': 'beachlot',   // beach parking by the pier road
  '9,3': 'hospital',    // Heatwave General + ambulance bay
  '5,10': 'casino',     // Crane's Coral Casino forecourt
  '11,11': 'boatramp',  // Marina south docks — boats moored here
  '1,5': 'hideout1',    // Portside gang hideout (side activity)
  '12,10': 'hideout2',  // Marina warehouse hideout (side activity)
  '7,1': 'hideout3',    // Heights villa hideout (side activity)
  '10,7': 'mall',       // The Palms Galleria — glass atrium block
  '3,3': 'policehq',    // Heatwave PD headquarters
  '10,2': 'stadium',    // Coral Bowl stadium
  '13,6': 'gasstation', // Last Chance Gas — pumps that cook off
};

export const CAST = {
  hero: 'Dex Marlowe',
  fixer: 'Sable Quinn',
  mechanic: 'Rosa Vega',
  brother: 'Marco Vega',
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
export const HAIR_COLORS = [0x1c1410, 0x3a2415, 0x6e4520, 0xa8763e, 0xd9c9a3, 0x8c8f96, 0xb03030, 0x274156];
export const SHIRT_COLORS = [0xef476f, 0xffd166, 0x06d6a0, 0x118ab2, 0x9b5de5, 0xff7b00, 0xffffff, 0x2ec4b6];

export function makeRng(seed) {
  let state = (seed >>> 0) || 1;
  return function rng() {
    state |= 0; state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
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

export const SAVE_KEY = 'heatwave-city-r7-save';
export const WANTED_DECAY_SECONDS = 24;
export const BUSTED_RADIUS = 4.6;
export const BUSTED_SECONDS = 3;
export const DAY_LENGTH = 720; // seconds for a full sun cycle
