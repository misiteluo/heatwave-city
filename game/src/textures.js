// textures.js — every texture in the game is painted on a Canvas at boot.
// No image files, no network: facades, sand, sea foam and shop signs are
// generated from the palette so the city looks warm and hand-made.

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// A sun-bleached tower facade: tinted wall, a grid of windows (some lit),
// a darker base and a bright cornice line.
export function facadeTexture(rng, tint, floors, cols) {
  const [c, g] = canvas(128, 256);
  g.fillStyle = tint; g.fillRect(0, 0, 128, 256);
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.16)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(120,40,0,0.18)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(0, 0, 128, 5);
  g.fillStyle = 'rgba(90,40,20,0.35)'; g.fillRect(0, 244, 128, 12);
  const ww = 128 / cols, hh = 256 / floors;
  for (let y = 0; y < floors; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = rng() < 0.24;
      g.fillStyle = lit ? '#ffe98a' : (rng() < 0.5 ? '#2d4a5e' : '#3d6478');
      g.fillRect(x * ww + 3, y * hh + 5, ww - 6, hh - 9);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(x * ww + 3, y * hh + 5, ww - 6, 3);
      if (rng() < 0.16) { // little balcony rail
        g.fillStyle = 'rgba(60,30,20,0.6)';
        g.fillRect(x * ww + 2, y * hh + hh - 6, ww - 4, 2);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

// A small shopfront texture used on low blocks: awning stripes + windows.
export function shopTexture(rng, tint) {
  const [c, g] = canvas(128, 128);
  g.fillStyle = tint; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#e63946' : '#fff3e0';
    g.fillRect(i * 16, 34, 16, 14);
  }
  g.fillStyle = '#274b5c'; g.fillRect(8, 58, 50, 52); g.fillRect(70, 58, 50, 52);
  g.fillStyle = 'rgba(255,240,180,0.8)'; g.fillRect(12, 62, 42, 20);
  g.fillStyle = '#5e2b1a'; g.fillRect(58, 66, 12, 62);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

export function sandTexture(rng) {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#f4d58a'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = rng() < 0.5 ? 'rgba(190,140,60,0.25)' : 'rgba(255,250,220,0.3)';
    g.fillRect(rng() * 128, rng() * 128, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 4);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

export function seaTexture(rng) {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#1d9db8'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 46; i++) {
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    const y = rng() * 128;
    g.beginPath(); g.moveTo(rng() * 60, y); g.lineTo(40 + rng() * 80, y); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(30, 6);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

// Round soft dot used for smoke puffs and muzzle glow sprites.
export function dotTexture() {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
