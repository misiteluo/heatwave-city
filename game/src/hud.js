// HEATWAVE CITY — the HUD and screens, all DOM over the canvas: minimap,
// wanted stars, cash/health, objective banner, prompts, toasts, damage
// vignette, and the menu / pause / BUSTED / WASTED overlays.

import { ROADS, clamp } from './config.js';

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

export function initHud(G, cb) {
  const ui = document.getElementById('ui');
  const hud = { toastT: 0, lastStars: -1, lastCash: -1, prompt: '' };

  hud.map = el('canvas', 'minimap', ui); hud.map.width = 190; hud.map.height = 190;
  hud.banner = el('div', 'banner', ui);
  hud.stars = el('div', 'stars', ui);
  hud.stats = el('div', 'stats', ui);
  hud.cashEl = el('div', 'cash', hud.stats);
  hud.hpWrap = el('div', 'hpwrap', hud.stats);
  hud.hpBar = el('div', 'hpbar', hud.hpWrap);
  hud.ammoEl = el('div', 'ammo', hud.stats);
  hud.speed = el('div', 'speed', ui);
  hud.promptEl = el('div', 'prompt', ui);
  hud.toastEl = el('div', 'toast', ui);
  hud.cross = el('div', 'crosshair', ui, '+');
  hud.vignette = el('div', 'vignette', ui);

  // --- menu -----------------------------------------------------------------
  const menu = el('div', 'overlay menu', ui);
  el('div', 'gametitle', menu, 'HEATWAVE CITY');
  el('div', 'tagline', menu, 'One city. Five jobs. No brakes.');
  el('p', 'story', menu, 'Jett is a wheelman with empty pockets in a sun-soaked coastal city. Fixer Mara Voss has work: steal, run, collect, escape. Finish all five jobs, outrun the Heatwave PD, and the city is yours.');
  const btnRow = el('div', 'btnrow', menu);
  hud.newBtn = el('button', 'btn', btnRow, 'New Game');
  hud.contBtn = el('button', 'btn', btnRow, 'Continue');
  hud.newBtn.onclick = () => cb.onNew();
  hud.contBtn.onclick = () => cb.onContinue();
  el('div', 'controls', menu, 'WASD move · Shift sprint · Mouse drag look · E enter/exit car · F or Click attack · 1/2 fists/pistol · R reload · Space handbrake · P pause · M mute');
  hud.menu = menu;

  // --- pause ------------------------------------------------------------------
  const pause = el('div', 'overlay small', ui);
  el('div', 'overtitle', pause, 'PAUSED');
  const resumeBtn = el('button', 'btn', pause, 'Resume');
  resumeBtn.onclick = () => cb.onResume();
  pause.style.display = 'none';
  hud.pause = pause;

  // --- busted / wasted ----------------------------------------------------------
  const end = el('div', 'overlay small', ui);
  hud.endTitle = el('div', 'overtitle', end);
  hud.endText = el('p', 'story', end);
  const respawnBtn = el('button', 'btn', end, 'Back on the street');
  respawnBtn.onclick = () => cb.onRespawn();
  end.style.display = 'none';
  hud.end = end;

  hud.toast = (text, sec = 3) => { hud.toastEl.textContent = text; hud.toastEl.style.opacity = '1'; hud.toastT = sec; };
  hud.showEnd = (kind, text) => {
    hud.endTitle.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    hud.endTitle.style.color = kind === 'busted' ? '#6db3ff' : '#ff5a4e';
    hud.endText.textContent = text;
    hud.end.style.display = 'flex';
  };
  hud.hideEnd = () => { hud.end.style.display = 'none'; };
  G.hud = hud;
  return hud;
}

const MAP_MIN = -300, MAP_SIZE = 700;
const mx = (x) => (x - MAP_MIN) / MAP_SIZE * 190;
const mz = (z) => (z - MAP_MIN) / MAP_SIZE * 190;

function drawMap(G) {
  const c = G.hud.map.getContext('2d');
  c.fillStyle = '#17394a'; c.fillRect(0, 0, 190, 190);
  c.fillStyle = '#c9b078'; c.fillRect(0, mz(292), 190, mz(400) - mz(292));       // beach
  c.fillStyle = '#2e8fb8'; c.fillRect(0, mz(332), 190, 190 - mz(332));          // sea
  c.strokeStyle = '#66727e'; c.lineWidth = 2.6;
  for (const r of ROADS) {
    c.beginPath(); c.moveTo(mx(r), mz(-280)); c.lineTo(mx(r), mz(280)); c.stroke();
    c.beginPath(); c.moveTo(mx(-280), mz(r)); c.lineTo(mx(280), mz(r)); c.stroke();
  }
  c.beginPath(); c.moveTo(mx(-280), mz(280)); c.lineTo(mx(280), mz(280)); c.stroke();
  const dot = (x, z, color, r) => { c.fillStyle = color; c.beginPath(); c.arc(mx(x), mz(z), r, 0, 7); c.fill(); };
  for (const car of G.trafficCars) dot(car.x, car.z, '#9aa4ad', 1.4);
  for (const e of G.enemies) if (!e.dead) dot(e.x, e.z, '#ff4b3e', 2.2);
  for (const car of G.policeCars) dot(car.x, car.z, '#3f8cff', 2.6);
  if (G.objective) {
    const pulse = 3.4 + Math.sin(G.time * 5) * 1.1;
    c.strokeStyle = '#ffc93c'; c.lineWidth = 1.6;
    c.beginPath(); c.arc(mx(G.objective.x), mz(G.objective.z), pulse + 2.4, 0, 7); c.stroke();
    dot(G.objective.x, G.objective.z, '#ffc93c', 2.8);
  }
  // player arrow
  const px = mx(G.playerPos.x), pz = mz(G.playerPos.z);
  const yaw = G.mode === 'car' && G.playerCar ? G.playerCar.yaw : G.player.yaw;
  c.save(); c.translate(px, pz); c.rotate(Math.atan2(Math.sin(yaw), -Math.cos(yaw)));
  c.fillStyle = '#ffffff';
  c.beginPath(); c.moveTo(0, -5.4); c.lineTo(3.6, 4.4); c.lineTo(-3.6, 4.4); c.closePath(); c.fill();
  c.restore();
  c.fillStyle = '#dff3ff'; c.font = 'bold 10px system-ui'; c.fillText('N', 92, 12);
}

export function updateHud(G, dt) {
  const hud = G.hud;
  const playing = G.mode === 'foot' || G.mode === 'car';
  hud.map.style.display = playing ? 'block' : 'none';
  hud.cross.style.display = playing && !G.paused && !G.over ? 'block' : 'none';
  if (playing) drawMap(G);
  // stars
  const stars = G.wanted.stars;
  if (stars !== hud.lastStars) {
    hud.lastStars = stars;
    hud.stars.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const s = document.createElement('span');
      s.textContent = '★';
      s.className = i < stars ? 'star on' : 'star';
      hud.stars.appendChild(s);
    }
  }
  hud.stars.style.display = stars > 0 ? 'block' : 'none';
  // banner
  const obj = playing ? G.objective : null;
  hud.banner.style.display = obj ? 'block' : 'none';
  if (obj && hud.banner.textContent !== obj.text) hud.banner.textContent = obj.text;
  // stats
  hud.stats.style.display = playing ? 'block' : 'none';
  if (G.cash !== hud.lastCash) { hud.lastCash = G.cash; hud.cashEl.textContent = `$${G.cash}`; }
  const hp = clamp(G.player.hp, 0, 100);
  hud.hpBar.style.width = `${hp}%`;
  hud.hpBar.style.background = hp > 50 ? '#51e05e' : hp > 25 ? '#ffc93c' : '#ff5a4e';
  hud.ammoEl.textContent = G.pistol
    ? (G.weapon === 'pistol' ? `PISTOL ${G.ammo.mag} / ${G.ammo.reserve}${G.reloading > 0 ? ' …' : ''}` : 'FISTS · press 2 for pistol')
    : 'FISTS';
  // speed
  if (G.mode === 'car' && G.playerCar) {
    hud.speed.style.display = 'block';
    hud.speed.textContent = `${Math.round(Math.abs(G.playerCar.speed) * 3.6)} km/h`;
  } else hud.speed.style.display = 'none';
  // prompt
  const prompt = playing ? (G.prompt || G.missionPrompt || '') : '';
  hud.promptEl.style.display = prompt ? 'block' : 'none';
  if (hud.promptEl.textContent !== prompt) hud.promptEl.textContent = prompt;
  // toast
  if (hud.toastT > 0) { hud.toastT -= dt; if (hud.toastT <= 0) hud.toastEl.style.opacity = '0'; }
  // vignette
  const lowHp = G.player.hp < 30 && playing ? 0.16 + Math.sin(G.time * 6) * 0.05 : 0;
  hud.vignette.style.opacity = String(clamp(G.hurtT * 0.85 + lowHp, 0, 0.9));
}
