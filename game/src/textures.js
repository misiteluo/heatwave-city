// textures.js — every surface in Heatwave City is painted on a
// canvas at boot: no image files, no network. Facades get framed
// windows with mullions, blinds and air-conditioning boxes; asphalt
// gets cracks and patch repairs; shopfronts get glowing sign bands,
// striped awnings and interiors behind the glass. Each facade style
// ships a matching emissive map — only the lit windows — so merged
// buildings still glow window by window after dark. Round 7 adds
// the mall's glass curtain wall, the airport runway's rubber-streaked
// tarmac, wooden crates and the gas pumps' painted faces.

// Paint a canvas and hand it back as an sRGB texture.
function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  return tex;
}

// Scatter semi-transparent flecks (dust, wear, shell grit).
function speckle(ctx, w, h, n, colors, rng, aMax = 0.16) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    ctx.globalAlpha = 0.04 + rng() * aMax;
    const s = 2 + rng() * 9;
    ctx.fillRect(rng() * w, rng() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

// Jagged hairline cracks wandering across a surface.
function cracks(ctx, w, h, n, rng, color = 'rgba(12,12,14,0.35)') {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  for (let i = 0; i < n; i++) {
    let x = rng() * w, y = rng() * h;
    ctx.beginPath(); ctx.moveTo(x, y);
    const segs = 3 + Math.floor(rng() * 4);
    for (let s = 0; s < segs; s++) {
      x += (rng() - 0.5) * 34; y += (rng() - 0.5) * 34;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// One facade style: a `floors` x `cols` window grid over a tinted
// wall, painted at 256x512. Returns { map, emissive } that tile
// cleanly; the emissive canvas carries only the lit windows.
export function facadeStyle(rng, tint, floors, cols, litRatio = 0.55) {
  const W = 256, H = 512;
  const lit = [];
  const blind = [];
  for (let i = 0; i < floors * cols; i++) { lit.push(rng() < litRatio); blind.push(rng() < 0.3); }
  const winRect = (f, c) => {
    const cw = W / cols, ch = H / floors;
    return { x: c * cw + cw * 0.2, y: f * ch + ch * 0.18, w: cw * 0.6, h: ch * 0.54, cw, ch };
  };
  const map = canvas(W, H, (ctx) => {
    ctx.fillStyle = tint; ctx.fillRect(0, 0, W, H);
    // Soft vertical shading so the wall is not one flat tone.
    const shade = ctx.createLinearGradient(0, 0, W, 0);
    shade.addColorStop(0, 'rgba(0,0,0,0.13)'); shade.addColorStop(0.25, 'rgba(255,255,255,0.05)');
    shade.addColorStop(0.75, 'rgba(255,255,255,0.02)'); shade.addColorStop(1, 'rgba(0,0,0,0.16)');
    ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H);
    speckle(ctx, W, H, 700, ['#000000', '#ffffff'], rng, 0.06);
    // Floor slab lines.
    const ch = H / floors;
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    for (let f = 0; f <= floors; f++) ctx.fillRect(0, f * ch - 1, W, 2);
    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < cols; c++) {
        const { x, y, w, h } = winRect(f, c);
        const k = f * cols + c;
        // Frame + recessed shadow, bright lintel on top.
        ctx.fillStyle = 'rgba(15,18,26,0.95)';
        ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
        ctx.fillStyle = 'rgba(255,255,255,0.20)';
        ctx.fillRect(x - 3, y - 3, w + 6, 2);
        // Glass: a sky gradient, varied per window.
        const gg = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
        const warm = rng() < 0.2;
        gg.addColorStop(0, warm ? '#cfe4d8' : '#a8d4ea');
        gg.addColorStop(0.55, warm ? '#5d7f78' : '#47748f');
        gg.addColorStop(1, '#24384c');
        ctx.fillStyle = gg;
        ctx.fillRect(x, y, w, h);
        // Mullion cross.
        ctx.fillStyle = 'rgba(12,16,22,0.8)';
        ctx.fillRect(x + w / 2 - 1, y, 2, h);
        ctx.fillRect(x, y + h / 2 - 1, w, 2);
        // Diagonal sky glint.
        ctx.fillStyle = 'rgba(255,255,255,0.20)';
        ctx.beginPath();
        ctx.moveTo(x + 2, y + h); ctx.lineTo(x + w * 0.55, y); ctx.lineTo(x + w * 0.8, y); ctx.lineTo(x + w * 0.27, y + h);
        ctx.closePath(); ctx.fill();
        if (blind[k]) {
          ctx.fillStyle = 'rgba(226,222,205,0.85)';
          const bh = h * (0.35 + rng() * 0.4);
          ctx.fillRect(x + 1, y + 1, w - 2, bh);
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          for (let by = y + 4; by < y + bh; by += 4) ctx.fillRect(x + 1, by, w - 2, 1);
        }
        // A little AC box under some windows.
        if (rng() < 0.16) {
          ctx.fillStyle = '#9aa3ab'; ctx.fillRect(x + w * 0.2, y + h + 4, w * 0.55, 6);
          ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + w * 0.2, y + h + 6, w * 0.55, 1.4);
        }
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.fillRect(0, H - 9, W, 9);
  });
  const emissive = canvas(W, H, (ctx) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    let k = 0;
    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < cols; c++, k++) {
        if (!lit[k]) continue;
        const { x, y, w, h } = winRect(f, c);
        const warm = ['#ffd98a', '#fff3c4', '#ffb46a', '#a8e6ff', '#ffc4e1'][Math.floor(rng() * 5)];
        ctx.fillStyle = warm;
        ctx.globalAlpha = blind[k] ? 0.45 : 0.92;
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 1;
        // Mullions stay dark against the light.
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(x + w / 2 - 1, y, 2, h);
        ctx.fillRect(x, y + h / 2 - 1, w, 2);
      }
    }
  });
  for (const t of [map, emissive]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return { map, emissive };
}

// Ground-floor shopfront at 512x256: glowing sign band with the
// shop's real name, striped awning, mullioned glass with a hint of
// the interior behind it.
export function shopTexture(rng, tint, signText, signColor = '#ff5964') {
  return canvas(512, 256, (ctx, W, H) => {
    ctx.fillStyle = tint; ctx.fillRect(0, 0, W, H);
    speckle(ctx, W, H, 300, ['#000', '#fff'], rng, 0.05);
    // Sign band with a neon halo on the lettering.
    ctx.fillStyle = '#171a24'; ctx.fillRect(0, 0, W, 62);
    ctx.font = 'bold 40px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = signColor; ctx.shadowBlur = 18;
    ctx.fillStyle = signColor;
    ctx.fillText(signText, W / 2, 33);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = signColor; ctx.globalAlpha = 0.6; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(18, 52); ctx.lineTo(W - 18, 52); ctx.stroke();
    ctx.globalAlpha = 1;
    // Awning: scalloped stripes.
    for (let x = 0; x < W; x += 32) {
      ctx.fillStyle = (x / 32) % 2 ? '#e63946' : '#f4f1e8';
      ctx.fillRect(x, 68, 32, 22);
      ctx.beginPath(); ctx.arc(x + 16, 90, 16, 0, Math.PI); ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 92, W, 5);
    // Glass panes with interior silhouettes.
    for (const x of [18, 138, 258, 378]) {
      const g = ctx.createLinearGradient(x, 108, x, 240);
      g.addColorStop(0, '#9fd0e8'); g.addColorStop(0.4, '#39637e'); g.addColorStop(1, '#1d3247');
      ctx.fillStyle = '#10131a'; ctx.fillRect(x - 3, 105, 116, 138);
      ctx.fillStyle = g; ctx.fillRect(x, 108, 110, 132);
      // Shelves / counter silhouettes inside.
      ctx.fillStyle = 'rgba(10,14,20,0.55)';
      ctx.fillRect(x + 8, 168, 94, 8); ctx.fillRect(x + 8, 198, 94, 8);
      for (let s = 0; s < 4; s++) ctx.fillRect(x + 14 + s * 24, 146, 13, 22);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.moveTo(x + 8, 240); ctx.lineTo(x + 52, 108); ctx.lineTo(x + 72, 108); ctx.lineTo(x + 28, 240);
      ctx.closePath(); ctx.fill();
    }
  });
}

// A big readable sign board (casino, hotel, club, terminal) with a
// soft neon glow baked into the lettering.
export function signTexture(text, bg, fg, sub = '') {
  return canvas(512, 128, (ctx, W, H) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, bg); g.addColorStop(1, '#000000');
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = fg; ctx.lineWidth = 4; ctx.globalAlpha = 0.85;
    ctx.strokeRect(8, 8, W - 16, H - 16);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = fg; ctx.shadowBlur = 16;
    ctx.fillStyle = fg;
    ctx.font = 'bold 50px Arial';
    ctx.fillText(text, W / 2, sub ? 46 : 64);
    if (sub) { ctx.font = 'bold 24px Arial'; ctx.fillText(sub, W / 2, 94); }
    ctx.shadowBlur = 0;
  });
}

// A rooftop billboard ad, painted like a poster: gradient sky, a
// big sun and wave motif, headline and strapline.
export function billboardTexture(rng, headline, sub, sky, ink) {
  return canvas(512, 256, (ctx, W, H) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sky); g.addColorStop(1, '#141021');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // Sun disc + sea waves motif.
    ctx.fillStyle = ink; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(W - 92, 62, 34, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.5;
    for (let r = 0; r < 3; r++) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 8) {
        const y = H - 34 - r * 16 + Math.sin(x * 0.05 + r * 2) * 5;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.shadowColor = ink; ctx.shadowBlur = 10;
    ctx.fillStyle = ink;
    ctx.font = 'bold 54px Arial';
    ctx.fillText(headline, 30, 84);
    ctx.font = 'bold 27px Arial';
    ctx.fillText(sub, 32, 138);
    ctx.shadowBlur = 0;
    speckle(ctx, W, H, 90, ['#000', '#fff'], rng, 0.05);
  });
}

export function sandTexture(rng) {
  const t = canvas(256, 256, (ctx, W, H) => {
    ctx.fillStyle = '#ecd39a'; ctx.fillRect(0, 0, W, H);
    speckle(ctx, W, H, 1500, ['#d9b96a', '#fff2c0', '#c9a44e'], rng, 0.25);
    for (let i = 0; i < 26; i++) { // shell flecks
      ctx.fillStyle = rng() < 0.5 ? '#fff6ea' : '#e8a2b4';
      ctx.globalAlpha = 0.5 + rng() * 0.4;
      ctx.beginPath(); ctx.arc(rng() * W, rng() * H, 1.6 + rng() * 1.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(24, 6);
  return t;
}

export function seaTexture(rng) {
  const t = canvas(256, 256, (ctx, W, H) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1d86a8'); g.addColorStop(1, '#0c5578');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 380; i++) {
      ctx.fillStyle = '#cfeeff';
      ctx.globalAlpha = 0.04 + rng() * 0.22;
      ctx.fillRect(rng() * W, rng() * H, 4 + rng() * 16, 1.6);
    }
    for (let i = 0; i < 40; i++) { // darker troughs
      ctx.fillStyle = '#083a56';
      ctx.globalAlpha = 0.05 + rng() * 0.1;
      ctx.fillRect(rng() * W, rng() * H, 12 + rng() * 26, 2.4);
    }
    ctx.globalAlpha = 1;
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10);
  return t;
}

export function grassTexture(rng) {
  const t = canvas(256, 256, (ctx, W, H) => {
    ctx.fillStyle = '#4d9e57'; ctx.fillRect(0, 0, W, H);
    speckle(ctx, W, H, 1600, ['#3a7d43', '#69b874', '#2c6134'], rng, 0.3);
    ctx.strokeStyle = 'rgba(30,80,38,0.5)'; ctx.lineWidth = 1;
    for (let i = 0; i < 260; i++) {
      const x = rng() * W, y = rng() * H;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rng() - 0.5) * 3, y - 3 - rng() * 4); ctx.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6);
  return t;
}

export function concreteTexture(rng) {
  const t = canvas(256, 256, (ctx, W, H) => {
    ctx.fillStyle = '#bdb5a6'; ctx.fillRect(0, 0, W, H);
    speckle(ctx, W, H, 900, ['#8f887a', '#d8d2c4', '#a49c8c'], rng, 0.2);
    // Expansion-joint tile lines, 2x2 per tile.
    ctx.strokeStyle = 'rgba(84,78,66,0.65)'; ctx.lineWidth = 3;
    for (const p of [0, W / 2, W - 2]) {
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(W, p); ctx.stroke();
    }
    // Stains.
    for (let i = 0; i < 7; i++) {
      const x = rng() * W, y = rng() * H, r = 14 + rng() * 30;
      const g = ctx.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, 'rgba(70,64,54,0.20)'); g.addColorStop(1, 'rgba(70,64,54,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function asphaltTexture(rng) {
  const t = canvas(256, 256, (ctx, W, H) => {
    ctx.fillStyle = '#383c42'; ctx.fillRect(0, 0, W, H);
    speckle(ctx, W, H, 1100, ['#2b2f35', '#4b515a', '#22252a'], rng, 0.22);
    // Patch repairs: darker rectangles with tar seams.
    for (let i = 0; i < 4; i++) {
      const x = rng() * W * 0.8, y = rng() * H * 0.8, w = 30 + rng() * 60, h = 22 + rng() * 44;
      ctx.fillStyle = 'rgba(18,19,22,0.35)'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(8,8,10,0.5)'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    }
    // Tyre-polish sheen down the middle of the tile.
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.045)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    cracks(ctx, W, H, 5, rng);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(34, 34);
  return t;
}

// Runway tarmac: darker than the streets, rubber streaks ground
// into the touchdown zone, faint centreline wear.
export function runwayTexture(rng) {
  const t = canvas(256, 256, (ctx, W, H) => {
    ctx.fillStyle = '#2e3138'; ctx.fillRect(0, 0, W, H);
    speckle(ctx, W, H, 900, ['#23262c', '#3d4149', '#1d1f24'], rng, 0.2);
    for (let i = 0; i < 12; i++) { // rubber streaks along the roll direction
      const x = rng() * W;
      ctx.fillStyle = 'rgba(8,8,10,0.30)';
      ctx.fillRect(x, 0, 3 + rng() * 7, H);
    }
    cracks(ctx, W, H, 3, rng, 'rgba(8,8,10,0.4)');
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// The mall's curtain wall: a blue glass grid with mullion shadows
// and a few warm interior panels glowing through.
export function glassTexture(rng) {
  const W = 256, H = 256;
  const map = canvas(W, H, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, W * 0.3, H);
    g.addColorStop(0, '#7fc4e4'); g.addColorStop(0.5, '#3d7296'); g.addColorStop(1, '#22455e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // Interior warmth behind some panes.
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      if (rng() < 0.22) {
        ctx.fillStyle = 'rgba(255,190,110,0.5)';
        ctx.fillRect(x * 64 + 4, y * 64 + 4, 56, 56);
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.moveTo(0, H); ctx.lineTo(W * 0.45, 0); ctx.lineTo(W * 0.7, 0); ctx.lineTo(W * 0.25, H);
    ctx.closePath(); ctx.fill();
    // Mullion grid.
    ctx.fillStyle = 'rgba(14,20,28,0.9)';
    for (let i = 0; i <= 4; i++) {
      ctx.fillRect(i * 64 - 2, 0, 4, H);
      ctx.fillRect(0, i * 64 - 2, W, 4);
    }
  });
  const emissive = canvas(W, H, (ctx) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      if (rng() < 0.4) {
        ctx.fillStyle = rng() < 0.5 ? '#ffb46a' : '#a8e6ff';
        ctx.globalAlpha = 0.35 + rng() * 0.4;
        ctx.fillRect(x * 64 + 4, y * 64 + 4, 56, 56);
      }
    }
    ctx.globalAlpha = 1;
  });
  for (const t of [map, emissive]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return { map, emissive };
}

// Wooden crate: planks with a darker frame and a stencilled mark.
export function crateTexture(rng) {
  return canvas(128, 128, (ctx, W, H) => {
    ctx.fillStyle = '#a67c4e'; ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 32) {
      ctx.fillStyle = ['#b0824f', '#966f42', '#a87c4c'][Math.floor(rng() * 3)];
      ctx.fillRect(0, y, W, 30);
      ctx.strokeStyle = 'rgba(70,48,24,0.4)'; ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const gy = y + 4 + rng() * 24;
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy + (rng() - 0.5) * 5); ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(60,38,16,0.85)';
    ctx.fillRect(0, 0, W, 10); ctx.fillRect(0, H - 10, W, 10);
    ctx.fillRect(0, 0, 10, H); ctx.fillRect(W - 10, 0, 10, H);
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.rotate(Math.PI / 4);
    ctx.fillRect(-7, -7, 14, 14);
    ctx.restore();
    speckle(ctx, W, H, 120, ['#5a3c1c', '#000'], rng, 0.12);
  });
}

// A gas pump's face: brand band, dial window, price digits, hose side.
export function pumpTexture(rng, brand = '#e63946') {
  return canvas(128, 256, (ctx, W, H) => {
    ctx.fillStyle = '#e8e4da'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = brand; ctx.fillRect(0, 0, W, 44);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('PETROL', W / 2, 23);
    // Dial window.
    ctx.fillStyle = '#14181f'; ctx.fillRect(16, 58, W - 32, 62);
    ctx.fillStyle = '#9fe8ff'; ctx.font = 'bold 30px monospace';
    ctx.fillText('88.4', W / 2, 82);
    ctx.fillStyle = '#5b6672'; ctx.font = 'bold 15px monospace';
    ctx.fillText('$ / GAL', W / 2, 106);
    // Grade buttons.
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = ['#ffd23f', '#ff9a3d', '#e63946'][i];
      ctx.fillRect(14 + i * 36, 138, 30, 22);
    }
    ctx.fillStyle = '#2b2f36'; ctx.fillRect(0, 178, W, 8);
    ctx.fillStyle = brand; ctx.fillRect(0, H - 34, W, 34);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = 'bold 17px Arial';
    ctx.fillText('LAST CHANCE', W / 2, H - 17);
    speckle(ctx, W, H, 60, ['#7a7264', '#000'], rng, 0.1);
  });
}

// Corrugated shipping-container side: deep ribs, rust weep, stencils.
export function containerTexture(rng, color) {
  return canvas(256, 128, (ctx, W, H) => {
    ctx.fillStyle = color; ctx.fillRect(0, 0, W, H);
    for (let x = 4; x < W; x += 16) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x, 0, 6, H);
      ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(x + 6, 0, 3, H);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(0, 0, W, 6); ctx.fillRect(0, H - 6, W, 6);
    // Rust weep from the top rail.
    for (let i = 0; i < 9; i++) {
      const x = rng() * W;
      const g = ctx.createLinearGradient(0, 0, 0, 40 + rng() * 50);
      g.addColorStop(0, 'rgba(90,45,20,0.4)'); g.addColorStop(1, 'rgba(90,45,20,0)');
      ctx.fillStyle = g; ctx.fillRect(x, 4, 3 + rng() * 5, 44 + rng() * 50);
    }
    speckle(ctx, W, H, 160, ['#3a2a18', '#000'], rng, 0.13);
    ctx.font = 'bold 21px Arial'; ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('HEATWAVE FREIGHT', 12, 30);
    ctx.font = 'bold 15px Arial'; ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('HWCU ' + (100000 + Math.floor(rng() * 899999)) + ' · MAX 24T', 12, H - 14);
  });
}

// Marina hotel / resort face: sliding doors, balcony slabs and
// rails drawn into the texture so the merged mesh still reads as
// a resort.
export function resortTexture(rng, tint) {
  const t = canvas(256, 512, (ctx, W, H) => {
    ctx.fillStyle = tint; ctx.fillRect(0, 0, W, H);
    speckle(ctx, W, H, 420, ['#000', '#fff'], rng, 0.06);
    for (let y = 16; y < H - 24; y += 42) {
      for (let x = 14; x < W - 40; x += 56) {
        // Sliding door glass.
        const g = ctx.createLinearGradient(x, y, x, y + 26);
        g.addColorStop(0, '#8fd0e8'); g.addColorStop(1, '#2c5069');
        ctx.fillStyle = '#1b2733'; ctx.fillRect(x - 2, y - 2, 42, 30);
        ctx.fillStyle = g; ctx.fillRect(x, y, 38, 26);
        ctx.fillStyle = 'rgba(20,26,34,0.85)'; ctx.fillRect(x + 18, y, 2, 26);
        // Balcony slab + rail below the door.
        ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x - 5, y + 30, 48, 4);
        ctx.fillStyle = '#e8e2d2'; ctx.fillRect(x - 5, y + 28, 48, 3);
        ctx.strokeStyle = 'rgba(40,48,58,0.8)'; ctx.lineWidth = 1.6;
        for (let bx = x - 4; bx <= x + 42; bx += 7) {
          ctx.beginPath(); ctx.moveTo(bx, y + 28); ctx.lineTo(bx, y + 19); ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(x - 5, y + 19); ctx.lineTo(x + 43, y + 19); ctx.stroke();
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Weathered wood planks for piers, docks and the boardwalk.
export function woodTexture(rng) {
  const t = canvas(256, 256, (ctx, W, H) => {
    ctx.fillStyle = '#8a6844'; ctx.fillRect(0, 0, W, H);
    const rows = 6, rh = H / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rh;
      ctx.fillStyle = ['#96754e', '#7d5c39', '#8f6c45'][Math.floor(rng() * 3)];
      ctx.fillRect(0, y, W, rh - 2);
      ctx.strokeStyle = 'rgba(60,40,20,0.35)'; ctx.lineWidth = 1;
      for (let i = 0; i < 12; i++) {
        const gy = y + 3 + rng() * (rh - 8);
        ctx.beginPath(); ctx.moveTo(0, gy);
        ctx.bezierCurveTo(W * 0.3, gy + (rng() - 0.5) * 4, W * 0.7, gy + (rng() - 0.5) * 4, W, gy);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(30,20,10,0.8)';
      for (const nx of [10, W - 12]) { ctx.beginPath(); ctx.arc(nx, y + rh / 2, 2.2, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, y + rh - 2, W, 2);
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
