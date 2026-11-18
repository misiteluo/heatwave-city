// HEATWAVE CITY — procedural Canvas textures: building facades, road asphalt,
// sand and water. No image files anywhere; everything is drawn at boot.

import { THREE, rnd, ri } from './config.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, rx = 1, ry = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  t.anisotropy = 4;
  return t;
}

// Warm coastal palettes for the facades.
const PALETTES = [
  { wall: '#e8b04b', trim: '#fff3d6', win: '#2b4a5e' },
  { wall: '#e2703a', trim: '#ffe8d1', win: '#274b63' },
  { wall: '#f2e3c9', trim: '#ffffff', win: '#33566b' },
  { wall: '#d95f4b', trim: '#ffd9c4', win: '#2b4a5e' },
  { wall: '#7fb5b0', trim: '#eafffb', win: '#274b63' },
  { wall: '#e9e4da', trim: '#ffffff', win: '#3a5a70' },
  { wall: '#c98bb9', trim: '#ffe9f7', win: '#33566b' },
  { wall: '#f0c75e', trim: '#fff6da', win: '#2b4a5e' },
];

export function buildingTexture(floors, litRatio = 0.25) {
  const p = PALETTES[ri(0, PALETTES.length - 1)];
  const c = canvas(128, 256), g = c.getContext('2d');
  g.fillStyle = p.wall; g.fillRect(0, 0, 128, 256);
  // subtle vertical shading
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.12)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.05)'); grad.addColorStop(1, 'rgba(0,0,0,0.16)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 256);
  g.fillStyle = p.trim; g.fillRect(0, 0, 128, 8); g.fillRect(0, 248, 128, 8);
  const cols = 4, rowsN = Math.max(3, floors);
  const cw = 128 / cols, ch = 248 / rowsN;
  for (let y = 0; y < rowsN; y++) for (let x = 0; x < cols; x++) {
    const lit = rnd() < litRatio;
    g.fillStyle = lit ? '#ffd873' : p.win;
    g.fillRect(x * cw + 6, y * ch + 8, cw - 12, ch - 14);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(x * cw + 6, y * ch + 8, cw - 12, 3);
  }
  return tex(c);
}

export function roofTexture() {
  const c = canvas(64, 64), g = c.getContext('2d');
  g.fillStyle = '#8a6f5c'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(0,0,0,0.15)';
  for (let i = 0; i < 40; i++) g.fillRect(rnd() * 64, rnd() * 64, 3, 3);
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.strokeRect(2, 2, 60, 60);
  return tex(c);
}

export function roadTexture() {
  const c = canvas(128, 128), g = c.getContext('2d');
  g.fillStyle = '#3c4148'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(255,255,255,${rnd() * 0.05})`; g.fillRect(rnd() * 128, rnd() * 128, 2, 2); }
  // centre dashes (texture runs along the road)
  g.fillStyle = '#e8c85a';
  g.fillRect(61, 6, 6, 44); g.fillRect(61, 78, 6, 44);
  return tex(c, 1, 10);
}

export function sidewalkTexture() {
  const c = canvas(64, 64), g = c.getContext('2d');
  g.fillStyle = '#cfc4ae'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2;
  g.strokeRect(1, 1, 62, 62); g.beginPath(); g.moveTo(32, 0); g.lineTo(32, 64); g.stroke();
  return tex(c, 6, 6);
}

export function sandTexture() {
  const c = canvas(128, 128), g = c.getContext('2d');
  g.fillStyle = '#eed9a0'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(160,120,50,${rnd() * 0.16})`; g.fillRect(rnd() * 128, rnd() * 128, 2, 2); }
  return tex(c, 24, 6);
}

export function grassTexture() {
  const c = canvas(128, 128), g = c.getContext('2d');
  g.fillStyle = '#79a84e'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(40,90,30,${rnd() * 0.25})`; g.fillRect(rnd() * 128, rnd() * 128, 2, 3); }
  return tex(c, 30, 30);
}

// Soft round sprite used for the mission beacon glow and particles.
export function glowTexture() {
  const c = canvas(64, 64), g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return tex(c);
}
