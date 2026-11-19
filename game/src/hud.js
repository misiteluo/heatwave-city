// hud.js — all DOM and canvas HUD work: cash, health, stars, speed,
// objective banner, prompts, toasts, the bust meter, damage vignette and
// the 2D minimap (roads, blocks, player arrow, police, mission gold dot).

import { HALF, clamp } from './config.js';

export class Hud {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.cash = this.el('cash');
    this.healthFill = this.el('healthfill');
    this.stars = this.el('stars');
    this.speed = this.el('speed');
    this.objective = this.el('objective');
    this.objectiveText = this.el('objectivetext');
    this.prompt = this.el('prompt');
    this.toastBox = this.el('toast');
    this.ammo = this.el('ammo');
    this.bustWrap = this.el('bustwrap');
    this.bustFill = this.el('bustfill');
    this.vignette = this.el('vignette');
    this.mini = this.el('minimap');
    this.miniCtx = this.mini.getContext('2d');
    this.toastTimer = null;
    this.vignetteTimer = 0;
  }

  setCash(v) { this.cash.textContent = '$' + Math.max(0, Math.floor(v)).toLocaleString('en-US'); }
  setHealth(v) { this.healthFill.style.width = clamp(v, 0, 100) + '%'; this.healthFill.style.background = v < 30 ? '#e63946' : '#06d6a0'; }
  setAmmo(v) { this.ammo.textContent = '🔫 ' + v; }
  setStars(n) {
    let s = '';
    for (let i = 0; i < 5; i++) s += i < n ? '★' : '☆';
    this.stars.textContent = s;
    this.stars.style.opacity = n > 0 ? '1' : '0.35';
  }
  setSpeed(kmh, driving) {
    this.speed.style.display = driving ? 'block' : 'none';
    if (driving) this.speed.textContent = Math.round(Math.abs(kmh)) + ' km/h';
  }
  setObjective(text) {
    if (text) { this.objective.style.display = 'block'; this.objectiveText.textContent = text; }
    else this.objective.style.display = 'none';
  }
  setPrompt(text) {
    if (text) { this.prompt.style.display = 'block'; this.prompt.textContent = text; }
    else this.prompt.style.display = 'none';
  }
  toast(text, ms = 3200) {
    this.toastBox.textContent = text;
    this.toastBox.style.opacity = '1';
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toastBox.style.opacity = '0'; }, ms);
  }
  setBustProgress(r) {
    this.bustWrap.style.display = r > 0.02 ? 'block' : 'none';
    this.bustFill.style.width = clamp(r * 100, 0, 100) + '%';
  }
  damageFlash() {
    this.vignette.style.opacity = '0.85';
    this.vignetteTimer = 0.35;
  }
  update(dt) {
    if (this.vignetteTimer > 0) {
      this.vignetteTimer -= dt;
      if (this.vignetteTimer <= 0) this.vignette.style.opacity = '0';
    }
  }

  drawMinimap(world) {
    const g = this.miniCtx, S = this.mini.width;
    g.fillStyle = '#20242c'; g.fillRect(0, 0, S, S);
    const scale = S / (HALF * 2 + 70);
    const toX = (x) => (x + HALF + 35) * scale;
    const toY = (z) => (z + HALF + 35) * scale;
    // blocks
    g.fillStyle = '#4a5058';
    for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
      const cx = -HALF + 22 + i * 44, cz = -HALF + 22 + j * 44;
      g.fillRect(toX(cx - 15), toY(cz - 15), 30 * scale, 30 * scale);
    }
    // beach + sea
    g.fillStyle = '#f4d58a'; g.fillRect(0, toY(HALF), S, (52) * scale);
    g.fillStyle = '#1d9db8'; g.fillRect(0, toY(HALF + 52), S, S - toY(HALF + 52));
    // mission marker
    const mp = world.city.markerPos;
    if (mp) {
      g.fillStyle = '#ffd23f';
      g.beginPath(); g.arc(toX(mp.x), toY(mp.z), 5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff'; g.stroke();
    }
    // enemies red
    g.fillStyle = '#ff4455';
    for (const e of world.enemies) if (!e.dead) g.fillRect(toX(e.x) - 2, toY(e.z) - 2, 4, 4);
    // police blue
    g.fillStyle = '#4488ff';
    for (const c of world.police.cars.concat(world.police.blocks)) {
      g.beginPath(); g.arc(toX(c.x), toY(c.z), 3.4, 0, Math.PI * 2); g.fill();
    }
    // player arrow
    const px = world.playerCar ? world.playerCar.x : world.player.x;
    const pz = world.playerCar ? world.playerCar.z : world.player.z;
    const heading = world.playerCar ? world.playerCar.heading : world.player.heading;
    g.save();
    g.translate(toX(px), toY(pz));
    g.rotate(Math.atan2(Math.sin(heading), -Math.cos(heading)) + Math.PI);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -6); g.lineTo(4.4, 5); g.lineTo(-4.4, 5); g.closePath(); g.fill();
    g.restore();
    // north
    g.fillStyle = '#fff'; g.font = 'bold 11px sans-serif';
    g.fillText('N', S - 14, 14);
  }
}
