// hud.js — all DOM and canvas HUD work: cash, health and armor bars,
// wanted stars, the weapon readout, speedo, objective banner, prompts,
// toasts, dialogue box, radio label, the bust meter, damage vignette,
// the mission-fail banner, a day banner for the story chapters, and the
// 2D minimap (peninsula, causeway, both islands, police in blue,
// enemies in red, the job in gold, side work in cyan).

import { HALF, ISLAND, CAY, clamp } from './config.js';

export class Hud {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.cash = this.el('cash');
    this.healthFill = this.el('healthfill');
    this.armorBar = this.el('armorbar');
    this.armorFill = this.el('armorfill');
    this.weaponName = this.el('weaponname');
    this.ammo = this.el('ammo');
    this.stars = this.el('stars');
    this.speed = this.el('speed');
    this.radio = this.el('radio');
    this.objective = this.el('objective');
    this.objectiveText = this.el('objectivetext');
    this.prompt = this.el('prompt');
    this.dialogue = this.el('dialogue');
    this.dlgWho = this.el('dlgwho');
    this.dlgText = this.el('dlgtext');
    this.failBox = this.el('missionfail');
    this.toastBox = this.el('toast');
    this.bustWrap = this.el('bustwrap');
    this.bustFill = this.el('bustfill');
    this.vignette = this.el('vignette');
    this.dayBanner = this.el('daybanner');
    this.dayTitle = this.el('daytitle');
    this.daySub = this.el('daysub');
    this.map = this.el('minimap');
    this.mapCtx = this.map ? this.map.getContext('2d') : null;
    this.toastTimer = 0;
    this.failTimer = 0;
    this.dayTimer = 0;
    this.vigTimer = 0;
  }

  setCash(v) { this.cash.textContent = '$' + Math.max(0, Math.floor(v)).toLocaleString('en-US'); }
  setHealth(v) {
    this.healthFill.style.width = clamp(v, 0, 100) + '%';
    this.healthFill.style.background = v > 45 ? '#06d6a0' : v > 22 ? '#ffd23f' : '#ef476f';
  }
  setArmor(v) {
    this.armorBar.style.display = v > 0 ? 'block' : 'none';
    this.armorFill.style.width = clamp(v, 0, 100) + '%';
  }
  setWeapon(combat) {
    const w = combat.current;
    this.weaponName.textContent = w === 'fist' ? 'FISTS' : w.toUpperCase();
    this.ammo.textContent = combat.ammoText();
  }
  setStars(n) {
    this.stars.textContent = '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
    this.stars.style.opacity = n > 0 ? 1 : 0.35;
  }
  setSpeed(kmh, driving) {
    this.speed.style.display = driving ? 'block' : 'none';
    if (driving) this.speed.textContent = Math.abs(Math.round(kmh)) + ' km/h';
  }
  setObjective(text) {
    if (!text) { this.objective.style.display = 'none'; return; }
    this.objective.style.display = 'block';
    this.objectiveText.textContent = text;
  }
  setPrompt(text) {
    if (!text) { this.prompt.style.display = 'none'; return; }
    this.prompt.style.display = 'block';
    this.prompt.textContent = text;
  }
  toast(text, ms = 3200) {
    this.toastBox.textContent = text;
    this.toastBox.style.opacity = 1;
    this.toastTimer = ms / 1000;
  }
  setDialogue(who, text) {
    if (!who) { this.dialogue.style.display = 'none'; return; }
    this.dialogue.style.display = 'block';
    this.dlgWho.textContent = who;
    this.dlgText.textContent = text;
  }
  clearDialogue() { this.dialogue.style.display = 'none'; }
  setRadio(text) {
    if (!text) { this.radio.style.display = 'none'; return; }
    this.radio.style.display = 'block';
    this.radio.textContent = '♪ ' + text;
  }
  showFail(text) {
    this.failBox.textContent = text;
    this.failBox.style.display = 'block';
    this.failTimer = 4.2;
  }
  hideFail() { this.failBox.style.display = 'none'; }
  showDay(title, sub) {
    if (!this.dayBanner) return;
    this.dayTitle.textContent = title;
    this.daySub.textContent = sub || '';
    this.dayBanner.style.opacity = 1;
    this.dayTimer = 3.4;
  }
  setBustProgress(r) {
    if (r <= 0) { this.bustWrap.style.display = 'none'; return; }
    this.bustWrap.style.display = 'block';
    this.bustFill.style.width = clamp(r * 100, 0, 100) + '%';
  }
  damageFlash() { this.vigTimer = 0.55; }

  update(dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastBox.style.opacity = 0;
    }
    if (this.failTimer > 0) {
      this.failTimer -= dt;
      if (this.failTimer <= 0) this.failBox.style.display = 'none';
    }
    if (this.dayTimer > 0) {
      this.dayTimer -= dt;
      if (this.dayTimer <= 0 && this.dayBanner) this.dayBanner.style.opacity = 0;
    }
    if (this.vigTimer > 0) {
      this.vigTimer -= dt;
      this.vignette.style.opacity = clamp(this.vigTimer * 1.6, 0, 0.85);
    } else this.vignette.style.opacity = 0;
  }

  // ------------------------------------------------------------ minimap
  drawMinimap(world) {
    const ctx = this.mapCtx;
    if (!ctx) return;
    const S = this.map.width;
    // world extent: x -340..480, z -320..600 → fit both islands
    const X0 = -350, X1 = 500, Z0 = -330, Z1 = 610;
    const px = (x) => ((x - X0) / (X1 - X0)) * S;
    const pz = (z) => ((z - Z0) / (Z1 - Z0)) * S;
    ctx.fillStyle = '#0d4a63';
    ctx.fillRect(0, 0, S, S);
    // landmass
    ctx.fillStyle = '#2e7d4f';
    ctx.fillRect(px(-292), pz(-292), px(292) - px(-292), pz(324) - pz(-292));
    ctx.fillStyle = '#57a773';
    ctx.fillRect(px(-9), pz(310), px(9) - px(-9), pz(ISLAND.z) - pz(310));
    for (const isl of [ISLAND, CAY]) {
      ctx.beginPath();
      ctx.arc(px(isl.x), pz(isl.z), (isl.r / (X1 - X0)) * S, 0, Math.PI * 2);
      ctx.fillStyle = '#57a773';
      ctx.fill();
    }
    // road grid
    ctx.strokeStyle = 'rgba(20,24,30,0.55)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 12; i++) {
      const l = -HALF + i * 46;
      ctx.beginPath(); ctx.moveTo(px(l), pz(-292)); ctx.lineTo(px(l), pz(292)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px(-292), pz(l)); ctx.lineTo(px(292), pz(l)); ctx.stroke();
    }
    const dot = (x, z, color, r = 2.4) => {
      ctx.beginPath();
      ctx.arc(px(x), pz(z), r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    };
    // side-activity markers in cyan, mission marker in gold
    if (world.missions) {
      for (const m of world.missions.activityMarkers()) dot(m.x, m.z, '#39d5ee', 2.2);
    }
    if (world.city.markerPos) {
      const mp = world.city.markerPos;
      ctx.beginPath();
      ctx.arc(px(mp.x), pz(mp.z), 4.4 + Math.sin(world.time * 4) * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd23f';
      ctx.fill();
    }
    for (const car of world.police.cars) dot(car.x, car.z, '#5b8cff', 2);
    if (world.police.heli) dot(world.police.heli.x, world.police.heli.z, '#5b8cff', 2.6);
    for (const e of world.enemies) if (!e.dead) dot(e.x, e.z, '#ff5964', 2.2);
    for (const b of world.boats || []) if (!b.dead) dot(b.x, b.z, '#f8f7ff', 1.8);
    // player arrow
    const focus = world.playerCar || world.playerHeli || world.playerBoat || world.player;
    const a = focus.heading || 0;
    ctx.save();
    ctx.translate(px(focus.x), pz(focus.z));
    ctx.rotate(Math.PI - a);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -5.4); ctx.lineTo(3.8, 4.4); ctx.lineTo(0, 2.4); ctx.lineTo(-3.8, 4.4);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
