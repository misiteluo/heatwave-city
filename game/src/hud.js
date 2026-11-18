// HEATWAVE CITY — the HUD: DOM panels (wanted stars, cash, health, objective banner,
// prompts, toasts, dialogue) and the 2D canvas minimap with police and mission blips.

import { clamp } from './config.js';

export class HUD {
  constructor() {
    this.el = {};
    for (const id of ['hud', 'minimap', 'wanted', 'objective', 'objText', 'objDist', 'cash', 'healthBar', 'armorLine',
      'speedo', 'speedNum', 'prompt', 'crosshair', 'bustWrap', 'bustBar', 'toast', 'dialog', 'vignette']) {
      this.el[id] = document.getElementById(id);
    }
    this.mapCtx = this.el.minimap.getContext('2d');
    this.toastTimer = null;
    this.dialogTimer = null;
    this.vignetteLevel = 0;
    this.lastStars = -1;
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  setCash(n) { this.el.cash.innerHTML = `<small>CASH</small>$${Math.max(0, Math.floor(n)).toLocaleString('en-US')}`; }
  setHealth(frac) { this.el.healthBar.style.width = `${clamp(frac, 0, 1) * 100}%`; }
  setInfo(text) { this.el.armorLine.textContent = text || ''; }

  setWanted(stars) {
    if (stars === this.lastStars) return;
    const flash = stars > this.lastStars && stars > 0;
    this.lastStars = stars;
    let html = '';
    for (let i = 0; i < 5; i++) html += i < stars ? '★' : '<span class="off">★</span>';
    this.el.wanted.innerHTML = html;
    if (flash) {
      this.el.wanted.classList.remove('flash');
      void this.el.wanted.offsetWidth;
      this.el.wanted.classList.add('flash');
    }
  }

  setObjective(text, dist) {
    if (!text) { this.el.objective.classList.add('hidden'); return; }
    this.el.objective.classList.remove('hidden');
    this.el.objText.textContent = text;
    this.el.objDist.textContent = dist != null ? `${Math.round(dist)}m` : '';
  }

  setPrompt(html) {
    if (!html) { this.el.prompt.classList.add('hidden'); return; }
    this.el.prompt.classList.remove('hidden');
    this.el.prompt.innerHTML = html;
  }

  setSpeed(mph) {
    if (mph == null) { this.el.speedo.classList.add('hidden'); return; }
    this.el.speedo.classList.remove('hidden');
    this.el.speedNum.textContent = String(Math.round(Math.abs(mph)));
  }

  setCrosshair(on) { this.el.crosshair.classList.toggle('hidden', !on); }

  setBust(frac) {
    if (frac == null) { this.el.bustWrap.classList.add('hidden'); return; }
    this.el.bustWrap.classList.remove('hidden');
    this.el.bustBar.style.width = `${clamp(frac, 0, 1) * 100}%`;
  }

  damagePulse() { this.vignetteLevel = Math.min(1, this.vignetteLevel + 0.55); }

  toast(text, ms = 3400) {
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.el.toast.style.opacity = '0'; }, ms);
  }

  dialog(speaker, text, ms = 5200) {
    this.el.dialog.innerHTML = `<b>${speaker}:</b> ${text}`;
    this.el.dialog.style.opacity = '1';
    clearTimeout(this.dialogTimer);
    this.dialogTimer = setTimeout(() => { this.el.dialog.style.opacity = '0'; }, ms);
  }

  update(dt) {
    if (this.vignetteLevel > 0) {
      this.vignetteLevel = Math.max(0, this.vignetteLevel - dt * 1.4);
      this.el.vignette.style.opacity = String(this.vignetteLevel);
    }
  }

  // view: { city, playerPos, playerHeading, cops: [car], mission: {x,z}|null, inCar }
  drawMinimap(view) {
    const g = this.mapCtx;
    const S = 188;
    const ext = 640; // world span mapped onto the square (x: -300..340 z)
    const px = (x) => ((x + 300) / ext) * S;
    const py = (z) => ((z + 300) / ext) * S;
    g.fillStyle = '#232830';
    g.fillRect(0, 0, S, S);
    // ocean + beach along the south edge
    const beachY = py(278);
    g.fillStyle = '#e8cf9e'; g.fillRect(0, beachY, S, py(344) - beachY);
    g.fillStyle = '#2e7fa8'; g.fillRect(0, py(344), S, S - py(344));
    // blocks
    g.fillStyle = '#31363f';
    const { roadsX, roadsZ } = view.city;
    for (let i = 0; i < roadsX.length - 1; i++) {
      for (let j = 0; j < roadsZ.length - 1; j++) {
        const x0 = px((roadsX[i] + roadsX[i + 1]) / 2 - 22), x1 = px((roadsX[i] + roadsX[i + 1]) / 2 + 22);
        const y0 = py((roadsZ[j] + roadsZ[j + 1]) / 2 - 22), y1 = py((roadsZ[j] + roadsZ[j + 1]) / 2 + 22);
        g.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    }
    // roads
    g.strokeStyle = '#59606c'; g.lineWidth = 2;
    for (const x of roadsX) { g.beginPath(); g.moveTo(px(x), py(-278)); g.lineTo(px(x), py(278)); g.stroke(); }
    for (const z of roadsZ) { g.beginPath(); g.moveTo(px(-278), py(z)); g.lineTo(px(278), py(z)); g.stroke(); }
    // mission marker (pulsing gold)
    if (view.mission) {
      const pulse = 3.4 + Math.sin(performance.now() * 0.006) * 1.1;
      g.fillStyle = '#ffd23e';
      g.beginPath(); g.arc(px(view.mission.x), py(view.mission.z), pulse, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,210,62,0.5)';
      g.beginPath(); g.arc(px(view.mission.x), py(view.mission.z), pulse + 3.4, 0, Math.PI * 2); g.stroke();
    }
    // police blips
    g.fillStyle = '#4e8dff';
    for (const cop of view.cops) {
      g.beginPath(); g.arc(px(cop.mesh.position.x), py(cop.mesh.position.z), 2.6, 0, Math.PI * 2); g.fill();
    }
    // player arrow
    const cx = px(view.playerPos.x), cy = py(view.playerPos.z);
    const h = view.playerHeading;
    g.save();
    g.translate(cx, cy);
    g.rotate(Math.PI - view.playerHeading); // map is north-up; arrow model points up
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -6); g.lineTo(4.4, 5); g.lineTo(0, 2.4); g.lineTo(-4.4, 5); g.closePath(); g.fill();
    g.restore();
    // north label
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.font = 'bold 11px Arial'; g.textAlign = 'right';
    g.fillText('N', S - 7, 15);
  }
}
