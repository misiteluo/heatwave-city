// textures.js — every surface in Heatwave City is painted on a Canvas at
// boot: tower facades with a matching night-glow window map, shopfronts,
// asphalt, sand, boardwalk planks, billboards, signs. No image files and
// no network — just 2D canvas feeding THREE.CanvasTexture.

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, rx = 1, ry = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 4;
  t.encoding = THREE.sRGBEncoding;
  return t;
}

// A facade pair: daylight map + black emissive map whose windows light
// up after dark (city.js fades material.emissiveIntensity with the sun).
function facade(rng, base, accent, floors, cols, shop) {
  const W = 256, H = 512;
  const [c, g] = canvas(W, H);
  const [ec, eg] = canvas(W, H);
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 42; i++) { // weather streaks
    g.fillStyle = `rgba(60,30,10,${0.02 + rng() * 0.05})`;
    g.fillRect(rng() * W, 0, 2 + rng() * 5, H);
  }
  eg.fillStyle = '#000'; eg.fillRect(0, 0, W, H);
  const fh = H / floors, cw = W / cols;
  for (let f = 0; f < floors; f++) {
    for (let col = 0; col < cols; col++) {
      const x = col * cw + cw * 0.22, y = f * fh + fh * 0.24;
      const w = cw * 0.56, h = fh * 0.5;
      const lit = rng() < 0.3;
      g.fillStyle = lit ? '#ffe9a8' : (rng() < 0.5 ? '#9fc6d8' : '#5f8296');
      g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.fillRect(x, y, w, 2);
      if (rng() < 0.55) {
        eg.fillStyle = rng() < 0.78 ? '#ffb45e' : '#bfe3ff';
        eg.fillRect(x, y, w, h);
      }
    }
  }
  if (shop) {
    const sy = H - 64;
    g.fillStyle = accent; g.fillRect(0, sy, W, 64);
    g.fillStyle = 'rgba(10,10,16,.85)';
    for (let s = 0; s < 4; s++) g.fillRect(10 + s * 62, sy + 12, 50, 42);
    eg.fillStyle = accent; eg.fillRect(0, sy, W, 10);
  }
  g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(0, 0, W, 5);
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, H - 5, W, 5);
  return { map: tex(c), emissive: tex(ec) };
}

function billboard(rng, bg, fg, line1, line2) {
  const [c, g] = canvas(512, 256);
  const grad = g.createLinearGradient(0, 0, 512, 256);
  grad.addColorStop(0, bg); grad.addColorStop(1, fg);
  g.fillStyle = grad; g.fillRect(0, 0, 512, 256);
  g.fillStyle = 'rgba(255,255,255,.94)';
  g.font = '900 76px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText(line1, 256, 116);
  g.font = '700 42px system-ui, sans-serif';
  g.fillStyle = 'rgba(255,255,255,.78)';
  g.fillText(line2, 256, 190);
  g.fillStyle = '#ffe9a3';
  for (let i = 0; i < 26; i++) {
    g.beginPath(); g.arc(14 + i * 19.2, 12, 4, 0, 7); g.fill();
    g.beginPath(); g.arc(14 + i * 19.2, 244, 4, 0, 7); g.fill();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function simple(draw, w = 256, h = 256, rx = 1, ry = 1) {
  const [c, g] = canvas(w, h);
  draw(g, w, h);
  return tex(c, rx, ry);
}

// Round soft dot used for smoke, muzzle glow and explosion sprites.
export function dotTexture() {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function buildTextures(rng) {
  const T = {};
  const bases = ['#e8b48c', '#d98e73', '#cfd8dc', '#a8c6cf', '#e6cfa8', '#b08968', '#90a4ae', '#f2d5a0'];
  const accents = ['#e63946', '#118ab2', '#06d6a0', '#ffd23f', '#9b5de5', '#ef476f', '#2ec4b6', '#ff7b00'];
  T.facades = bases.map((b, i) => facade(rng, b, accents[i], 10 + (i % 4) * 2, 6, i % 3 === 0));
  T.facadeMats = T.facades.map((f) => new THREE.MeshPhongMaterial({
    map: f.map, emissiveMap: f.emissive, emissive: 0xffc98a, emissiveIntensity: 0, shininess: 6,
  }));
  T.roofMat = new THREE.MeshLambertMaterial({ color: 0x5a5350 });
  T.warehouseMat = new THREE.MeshPhongMaterial({
    map: simple((g, w, h) => {
      g.fillStyle = '#8d99ae'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 16) { g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(x, 0, 2, h); }
      g.fillStyle = '#495867'; g.fillRect(24, h - 110, 90, 110); g.fillRect(140, h - 110, 90, 110);
      g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(24, h - 110, 90, 6); g.fillRect(140, h - 110, 90, 6);
    }),
    shininess: 4,
  });
  T.road = simple((g, w, h) => {
    g.fillStyle = '#33373d'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(255,255,255,${rng() * 0.05})`;
      g.fillRect(rng() * w, rng() * h, 2, 2);
    }
  }, 256, 256, 30, 30);
  T.sidewalk = simple((g, w, h) => {
    g.fillStyle = '#b8b2a7'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke();
    }
  }, 256, 256, 40, 40);
  T.sand = simple((g, w, h) => {
    g.fillStyle = '#eed9a4'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
      g.fillStyle = `rgba(160,120,60,${rng() * 0.16})`;
      g.fillRect(rng() * w, rng() * h, 3, 2);
    }
  }, 256, 256, 24, 6);
  T.grass = simple((g, w, h) => {
    g.fillStyle = '#58a05c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 800; i++) {
      g.fillStyle = `rgba(20,80,30,${rng() * 0.25})`;
      g.fillRect(rng() * w, rng() * h, 2, 5);
    }
  }, 256, 256, 6, 6);
  T.plaza = simple((g, w, h) => {
    g.fillStyle = '#cfc8bb'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(90,70,40,.35)'; g.lineWidth = 4;
    for (let i = 0; i <= 2; i++) {
      g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * 128); g.lineTo(w, i * 128); g.stroke();
    }
    g.fillStyle = 'rgba(230,57,70,.45)';
    g.beginPath(); g.arc(128, 128, 34, 0, 7); g.fill();
  }, 256, 256, 4, 4);
  T.boardwalk = simple((g, w, h) => {
    g.fillStyle = '#a97c50'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 22) {
      g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, y, w, 3);
      g.fillStyle = `rgba(255,235,200,${rng() * 0.07})`; g.fillRect(0, y + 3, w, 18);
    }
  }, 256, 256, 10, 3);
  T.water = simple((g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#1d7a8c'); grad.addColorStop(1, '#0d4d66');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 130; i++) {
      g.fillStyle = `rgba(255,255,255,${0.04 + rng() * 0.1})`;
      g.fillRect(rng() * w, rng() * h, 12 + rng() * 30, 2);
    }
  }, 256, 256, 60, 60);
  T.helipad = simple((g, w, h) => {
    g.fillStyle = '#3c4147'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffd23f'; g.lineWidth = 10;
    g.beginPath(); g.arc(128, 128, 96, 0, 7); g.stroke();
    g.fillStyle = '#ffd23f'; g.font = '900 150px system-ui'; g.textAlign = 'center';
    g.fillText('H', 128, 178);
  });
  T.parking = simple((g, w, h) => {
    g.fillStyle = '#3a3f45'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 4;
    for (let x = 20; x < w; x += 52) { g.beginPath(); g.moveTo(x, 14); g.lineTo(x, 90); g.stroke(); }
    for (let x = 20; x < w; x += 52) { g.beginPath(); g.moveTo(x, h - 90); g.lineTo(x, h - 14); g.stroke(); }
  }, 256, 256, 2, 2);
  T.billboards = [
    billboard(rng, '#e63946', '#7f1d3a', 'CORAL', 'CASINO ★★★'),
    billboard(rng, '#118ab2', '#073b4c', 'SUNSET', 'COLA — ICE COLD'),
    billboard(rng, '#ff7b00', '#9d4edd', 'HEATWAVE', 'CITY NEVER COOLS'),
    billboard(rng, '#06d6a0', '#045c43', 'MARINA', 'HOTEL & SPA'),
    billboard(rng, '#ffd23f', '#b3001b', 'VELOCE', 'COMET GT — OWN IT'),
  ];
  const sign = (bg, fg, sub, main, subText) => simple((g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = '900 44px system-ui'; g.textAlign = 'center';
    g.fillText(main, w / 2, h / 2 + 4);
    g.font = '600 24px system-ui'; g.fillStyle = sub;
    g.fillText(subText, w / 2, h / 2 + 42);
  }, 512, 128);
  T.bankSign = sign('#1d2733', '#ffd23f', '#9fc6d8', 'MERIDIAN BANK', 'EST. 1962 · VAULT LEVEL 3');
  T.garageSign = sign('#263238', '#2ec4b6', '#ffd23f', "PRIYA'S AUTO WORKS", 'NO QUESTIONS · CASH ONLY');
  T.hospitalSign = sign('#eef4f6', '#e63946', '#33566b', 'HEATWAVE GENERAL', 'EMERGENCY · HELIPAD →');
  T.casinoSign = sign('#2b1030', '#f15bb5', '#ffd23f', 'CORAL CASINO', 'DELGADO ENTERPRISES');
  return T;
}
