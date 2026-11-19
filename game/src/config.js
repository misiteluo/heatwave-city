// config.js — shared numbers, palette and tiny helpers for Heatwave City.
// Everything tunable lives here so the other modules stay about behaviour.

export const GRID = 10;
export const PITCH = 44;
export const BLOCK = 30;
export const HALF = (GRID * PITCH) / 2; // 220
export const BEACH_Z = HALF;
export const SEA_Z = HALF + 52;

export const PLAYER_START = { x: -176, z: 132, heading: 0 };

export const CAR_COLORS = [
  0xff5964, 0xffd23f, 0x3ec1d3, 0xff9a3d, 0x9b5de5, 0x00c9a7,
  0xf15bb5, 0xfee440, 0x4cc9f0, 0xef476f, 0x06d6a0, 0xf8f7ff,
];
export const BUILDING_TINTS = ['#ffd9a0', '#ffb4a2', '#ffe5b4', '#bde0fe', '#ffc8dd', '#fdffb6', '#caffbf', '#ffcf9f'];
export const SKIN_TONES = [0xffd1a9, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
export const SHIRT_COLORS = [0xef476f, 0xffd166, 0x06d6a0, 0x118ab2, 0x9b5de5, 0xff7b00, 0xffffff];

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

export function blockCentre(i) { return -HALF + PITCH / 2 + i * PITCH; }
export function roadLine(i) { return -HALF + i * PITCH; }

export const SAVE_KEY = 'heatwave-city-r3-save';
export const WANTED_DECAY_SECONDS = 20;
export const BUSTED_RADIUS = 4.4;
export const BUSTED_SECONDS = 3;
