// HEATWAVE CITY — procedural canvas textures.
// All art is generated at boot: building facades with lit windows, asphalt with lane
// markings, sidewalks, sand, water and shop signs. No image files, no network.

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(canvas, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

// A sun-baked facade: warm plaster, rows of windows (some lit), a shopfront band at the base.
export function makeFacadeTexture(rng, base, accent) {
  const [c, g] = canvasOf(256, 512);
  g.fillStyle = base; g.fillRect(0, 0, 256, 512);
  // subtle plaster noise
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(0,0,0,${0.02 + rng() * 0.05})`;
    g.fillRect(rng() * 256, rng() * 512, 2 + rng() * 5, 2 + rng() * 5);
  }
  // cornice bands
  g.fillStyle = accent;
  g.fillRect(0, 0, 256, 10);
  g.fillRect(0, 386, 256, 8);
  // windows: 5 cols x 9 rows
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 5; col++) {
      const x = 18 + col * 46, y = 26 + row * 40;
      const lit = rng() < 0.34;
      g.fillStyle = 'rgba(40,30,26,0.85)';
      g.fillRect(x - 2, y - 2, 30, 32);
      const grad = g.createLinearGradient(x, y, x, y + 28);
      if (lit) { grad.addColorStop(0, '#ffe9a8'); grad.addColorStop(1, '#ffb45e'); }
      else { grad.addColorStop(0, '#7fa3b8'); grad.addColorStop(1, '#46657a'); }
      g.fillStyle = grad;
      g.fillRect(x, y, 26, 28);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x, y, 26, 4);
    }
  }
  // shopfront: awning + glass
  g.fillStyle = accent; g.fillRect(0, 398, 256, 26);
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.font = 'bold 17px Arial'; g.textAlign = 'center';
  g.fillText('· · ·', 128, 417);
  const shop = g.createLinearGradient(0, 424, 0, 512);
  shop.addColorStop(0, '#5d7d8c'); shop.addColorStop(1, '#2c424e');
  g.fillStyle = shop; g.fillRect(8, 428, 240, 84);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(20, 436, 46, 68); g.fillRect(110, 436, 46, 68); g.fillRect(196, 436, 40, 68);
  return toTexture(c);
}

// Asphalt with a dashed centre line — used on road strips, rotated per direction.
export function makeRoadTexture() {
  const [c, g] = canvasOf(128, 128);
  g.fillStyle = '#3a3d44'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(255,255,255,${rng01() * 0.05})`;
    g.fillRect(rng01() * 128, rng01() * 128, 2, 2);
  }
  g.fillStyle = '#e8e4da';
  g.fillRect(0, 0, 4, 128); g.fillRect(124, 0, 4, 128); // edge lines
  g.fillStyle = '#ffd23e';
  g.fillRect(61, 8, 6, 44); g.fillRect(61, 76, 6, 44); // centre dashes
  return toTexture(c);
}

let seed = 7;
function rng01() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

export function makeSidewalkTexture() {
  const [c, g] = canvasOf(128, 128);
  g.fillStyle = '#a89a89'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(70,60,50,0.5)'; g.lineWidth = 2;
  g.strokeRect(1, 1, 126, 126);
  g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 128); g.stroke();
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(60,50,40,${rng01() * 0.08})`;
    g.fillRect(rng01() * 128, rng01() * 128, 3, 3);
  }
  return toTexture(c);
}

export function makeSandTexture() {
  const [c, g] = canvasOf(128, 128);
  g.fillStyle = '#ecd3a0'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 800; i++) {
    g.fillStyle = rng01() < 0.5 ? 'rgba(190,150,90,0.15)' : 'rgba(255,246,220,0.18)';
    g.fillRect(rng01() * 128, rng01() * 128, 2, 2);
  }
  return toTexture(c, 24, 4);
}

export function makeWaterTexture() {
  const [c, g] = canvasOf(128, 128);
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#3d94bd'); grad.addColorStop(1, '#256a92');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const y = 8 + i * 14 + rng01() * 5;
    g.beginPath();
    g.moveTo(rng01() * 40, y);
    g.lineTo(50 + rng01() * 70, y);
    g.stroke();
  }
  return toTexture(c, 30, 10);
}

// A bold sign board ("BANK", "GARAGE", "SAFEHOUSE"...) rendered as a texture.
export function makeSignTexture(text, bg, fg) {
  const [c, g] = canvasOf(512, 128);
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(8, 8, 496, 112);
  g.fillStyle = fg;
  g.font = '900 62px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

// Soft round sprite used for smoke, muzzle flash glow and marker glows.
export function makeGlowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const [c, g] = canvasOf(64, 64);
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, inner); grad.addColorStop(1, outer);
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
