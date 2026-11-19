// textures.js — every surface in Heatwave City is painted on a Canvas at
// boot: no image files, no network. Facades come in a handful of shared
// styles, each with a day map and a night emissive map (the same window
// grid, lit), so the city can merge its buildings into a few big meshes
// and still glow after dark.

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

function speckle(ctx, w, h, n, colors, rng, aMax = 0.16) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    ctx.globalAlpha = 0.04 + rng() * aMax;
    const s = 2 + rng() * 9;
    ctx.fillRect(rng() * w, rng() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

// One facade style: `floors` x `cols` window grid over a tinted wall.
// Returns { map, emissive } textures that tile cleanly.
export function facadeStyle(rng, tint, floors, cols, litRatio = 0.55) {
  const W = 128, H = 256;
  const lit = [];
  for (let i = 0; i < floors * cols; i++) lit.push(rng() < litRatio);
  const map = canvas(W, H, (ctx) => {
    ctx.fillStyle = tint; ctx.fillRect(0, 0, W, H);
    speckle(ctx, W, H, 260, ['#000000', '#ffffff'], rng, 0.07);
    const cw = W / cols, ch = H / floors;
    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cw + cw * 0.22, y = f * ch + ch * 0.2, w = cw * 0.56, h = ch * 0.52;
        ctx.fillStyle = 'rgba(20,26,38,0.9)';
        ctx.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);
        const g = ctx.createLinearGradient(x, y, x, y + h);
        g.addColorStop(0, '#9fd8ef'); g.addColorStop(0.5, '#4a7d99'); g.addColorStop(1, '#2c4a63');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, H - 7, W, 7);
  });
  const emissive = canvas(W, H, (ctx) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const cw = W / cols, ch = H / floors;
    let k = 0;
    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < cols; c++, k++) {
        if (!lit[k]) continue;
        const x = c * cw + cw * 0.22, y = f * ch + ch * 0.2, w = cw * 0.56, h = ch * 0.52;
        ctx.fillStyle = ['#ffd98a', '#fff3c4', '#a8e6ff', '#ffc4e1'][Math.floor(rng() * 4)];
        ctx.fillRect(x, y, w, h);
      }
    }
  });
  for (const t of [map, emissive]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  }
  return { map, emissive };
}

// Ground-floor shopfront: awning, big glass, a door.
export function shopTexture(rng, tint, signText, signColor = '#ff5964') {
  return canvas(256, 128, (ctx, W, H) => {
    ctx.fillStyle = tint; ctx.fillRect(0, 0, W, H);
    speckle(ctx, W, H, 160, ['#000', '#fff'], rng, 0.06);
    ctx.fillStyle = '#20242e'; ctx.fillRect(0, 0, W, 34);
    ctx.font = 'bold 23px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = signColor;
    ctx.fillText(signText, W / 2, 18);
    ctx.fillStyle = '#e63946'; ctx.fillRect(0, 40, W, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(0, 50, W, 4);
    for (const x of [14, 96, 178]) {
      const g = ctx.createLinearGradient(x, 62, x, 120);
      g.addColorStop(0, '#bfe9ff'); g.addColorStop(1, '#3d6a86');
      ctx.fillStyle = g; ctx.fillRect(x, 62, 66, 58);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + 6, 62, 12, 58);
    }
  });
}

// A big readable sign board (billboards, casino, hotel, club).
export function signTexture(text, bg, fg, sub = '') {
  return canvas(512, 128, (ctx, W, H) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = fg; ctx.lineWidth = 5; ctx.strokeRect(7, 7, W - 14, H - 14);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = fg;
    ctx.font = 'bold 52px Arial';
    ctx.fillText(text, W / 2, sub ? 48 : 64);
    if (sub) { ctx.font = 'bold 25px Arial'; ctx.fillText(sub, W / 2, 94); }
  });
}

export function sandTexture(rng) {
  const t = canvas(128, 128, (ctx, W, H) => {
    ctx.fillStyle = '#ecd39a'; ctx.fillRect(0, 0, W, H);
    speckle(ctx, W, H, 700, ['#d9b96a', '#fff2c0', '#c9a44e'], rng, 0.25);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(24, 6);
  return t;
}

export function seaTexture(rng) {
  const t = canvas(256, 256, (ctx, W, H) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1b7f9e'); g.addColorStop(1, '#0d5a7d');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 240; i++) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.globalAlpha = 0.05 + rng() * 0.2;
      ctx.fillRect(rng() * W, rng() * H, 4 + rng() * 14, 1.6);
    }
    ctx.globalAlpha = 1;
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10);
  return t;
}

export function grassTexture(rng) {
  const t = canvas(128, 128, (ctx, W, H) => {
    ctx.fillStyle = '#4d9e57'; ctx.fillRect(0, 0, W, H);
    speckle(ctx, W, H, 800, ['#3a7d43', '#69b874', '#2c6134'], rng, 0.3);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6);
  return t;
}

export function concreteTexture(rng) {
  const t = canvas(128, 128, (ctx, W, H) => {
    ctx.fillStyle = '#b9b2a4'; ctx.fillRect(0, 0, W, H);
    speckle(ctx, W, H, 420, ['#8f887a', '#d8d2c4'], rng, 0.2);
    ctx.strokeStyle = 'rgba(90,84,72,0.55)'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function asphaltTexture(rng) {
  const t = canvas(128, 128, (ctx, W, H) => {
    ctx.fillStyle = '#3a3f46'; ctx.fillRect(0, 0, W, H);
    speckle(ctx, W, H, 500, ['#2c3036', '#4c525b'], rng, 0.22);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(30, 30);
  return t;
}

// Corrugated shipping-container side in a flat colour.
export function containerTexture(rng, color) {
  return canvas(128, 64, (ctx, W, H) => {
    ctx.fillStyle = color; ctx.fillRect(0, 0, W, H);
    for (let x = 6; x < W; x += 12) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x, 0, 4, H);
      ctx.fillStyle = 'rgba(255,255,255,0.13)'; ctx.fillRect(x + 4, 0, 2, H);
    }
    speckle(ctx, W, H, 90, ['#3a2a18', '#000'], rng, 0.14);
    ctx.font = 'bold 15px Arial'; ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('HEATWAVE FREIGHT', 8, 20);
  });
}

// Marina hotel / resort face with balconies.
export function resortTexture(rng, tint) {
  const t = canvas(128, 256, (ctx, W, H) => {
    ctx.fillStyle = tint; ctx.fillRect(0, 0, W, H);
    speckle(ctx, W, H, 200, ['#000', '#fff'], rng, 0.06);
    for (let y = 14; y < H - 10; y += 22) {
      for (let x = 10; x < W - 18; x += 26) {
        ctx.fillStyle = '#274b63'; ctx.fillRect(x, y, 17, 12);
        ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(x, y + 13, 17, 3);
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Soft round sprite for particles (smoke, sparks, glow).
export function dotTexture() {
  return canvas(64, 64, (ctx, W, H) => {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  });
}
