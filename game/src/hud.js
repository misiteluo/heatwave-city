// hud.js — all DOM and canvas HUD work: cash, health and armor
// bars, the nitro gauge, wanted stars, the weapon readout, speedo,
// objective banner, prompts, toasts, the dialogue box, the phone
// (text messages from the cast, arriving between jobs), hit markers
// that flash on every solid hit — gold for a crit, red for a kill —
// the radio label, the bust meter, damage vignette, the
// mission-fail banner, a day banner for the story chapters, the 2D
// minimap (peninsula, both causeways, three islands, the airport,
// police in blue, enemies in red, the job in gold, side work in
// cyan), and a big version of that map on the pause screen.

import { HALF, ISLAND, CAY, AIRPORT, clamp } from './config.js';

export class Hud {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.cash = this.el('cash');
    this.healthFill = this.el('healthfill');
    this.armorBar = this.el('armorbar');
    this.armorFill = this.el('armorfill');
    this.nitroFill = this.el('nitrofill');
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
    this.phone = this.el('phone');
    this.phoneWho = this.el('phonewho');
    this.phoneText = this.el('phonetext');
    this.hitmarkEl = this.el('hitmark');
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
    this.bigMap = this.el('bigmap');
    this.bigMapCtx = this.bigMap ? this.bigMap.getContext('2d') : null;
    this.toastTimer = 0;
    this.failTimer = 0;
    this.dayTimer = 0;
    this.vigTimer = 0;
    this.phoneTimer = 0;
    this.hitTimer = 0;
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
  setNitro(f) {
    if (this.nitroFill) this.nitroFill.style.width = clamp(f * 100, 0, 100) + '%';
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
  // A text message slides in on the phone, top-right under the stars.
  showPhone(who, text, ms = 5200) {
    if (!this.phone) return;
    this.phoneWho.textContent = who;
    this.phoneText.textContent = text;
    this.phone.style.display = 'block';
    this.phone.style.opacity = 1;
    this.phoneTimer = ms / 1000;
  }
  // The hit marker: a brief ✕ at the crosshair — white for a hit,
  // gold for a crit, red when the shot puts them down.
  hitmark(crit = false, kill = false) {
    if (!this.hitmarkEl) return;
    this.hitmarkEl.textContent = '✕';
    this.hitmarkEl.style.color = kill ? '#ff4757' : crit ? '#ffd23f' : '#ffffff';
    this.hitmarkEl.style.opacity = 1;
    this.hitmarkEl.style.transform = 'translate(-50%,-50%) scale(' + (kill ? 1.5 : crit ? 1.3 : 1) + ')';
    this.hitTimer = kill ? 0.3 : 0.16;
  }
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
    if (this.phoneTimer > 0) {
      this.phoneTimer -= dt;
      if (this.phoneTimer <= 0 && this.phone) this.phone.style.opacity = 0;
    }
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0 && this.hitmarkEl) this.hitmarkEl.style.opacity = 0;
    }
    if (this.vigTimer > 0) {
      this.vigTimer -= dt;
      this.vignette.style.opacity = clamp(this.vigTimer * 1.6, 0, 0.85);
    } else this.vignette.style.opacity = 0;
  }

  // ------------------------------------------------------------ maps
  paintMap(ctx, S, world) {
    // World extent fitted to show the peninsula and all three islands.
    const X0 = -480, X1 = 540, Z0 = -400, Z1 = 730;
    const px = (x) => ((x - X0) / (X1 - X0)) * S;
    const pz = (z) => ((z - Z0) / (Z1 - Z0)) * S;
    const seaGrad = ctx.createLinearGradient(0, 0, 0, S);
    seaGrad.addColorStop(0, '#0d4a63');
    seaGrad.addColorStop(1, '#083049');
    ctx.fillStyle = seaGrad;
    ctx.fillRect(0, 0, S, S);
    // Landmass: peninsula, causeways, the islands.
    ctx.fillStyle = '#2e7d4f';
    ctx.fillRect(px(-338), pz(-338), px(338) - px(-338), pz(370) - pz(-338));
    ctx.fillStyle = '#57a773';
    ctx.fillRect(px(-9), pz(356), px(9) - px(-9), pz(ISLAND.z) - pz(356));
    ctx.fillRect(px(AIRPORT.x - 8), pz(356), px(AIRPORT.x + 8) - px(AIRPORT.x - 8), pz(AIRPORT.z) - pz(356));
    for (const isl of [ISLAND, CAY, AIRPORT]) {
      ctx.beginPath();
      ctx.arc(px(isl.x), pz(isl.z), (isl.r / (X1 - X0)) * S, 0, Math.PI * 2);
      ctx.fillStyle = '#57a773';
      ctx.fill();
    }
    // The runway, a pale slash on Gullwing Field.
    ctx.strokeStyle = 'rgba(230,230,220,0.8)';
    ctx.lineWidth = Math.max(1.5, S / 130);
    ctx.beginPath();
    ctx.moveTo(px(AIRPORT.x - 84), pz(AIRPORT.z + 18));
    ctx.lineTo(px(AIRPORT.x + 84), pz(AIRPORT.z + 18));
    ctx.stroke();
    // Road grid.
    ctx.strokeStyle = 'rgba(16,20,26,0.55)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 14; i++) {
      const l = -HALF + i * 46;
      ctx.beginPath(); ctx.moveTo(px(l), pz(-338)); ctx.lineTo(px(l), pz(338)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px(-338), pz(l)); ctx.lineTo(px(338), pz(l)); ctx.stroke();
    }
    const dot = (x, z, color, r = 2.4) => {
      ctx.beginPath();
      ctx.arc(px(x), pz(z), r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    };
    // Side-activity markers in cyan, the mission marker pulsing
    // gold, a second marker (branch choices) in its own colour.
    if (world.missions) {
      for (const m of world.missions.activityMarkers()) dot(m.x, m.z, '#39d5ee', Math.max(1.8, S / 90));
    }
    if (world.city.markerPos) {
      const mp = world.city.markerPos;
      ctx.beginPath();
      ctx.arc(px(mp.x), pz(mp.z), (S / 42) + Math.sin(world.time * 4) * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd23f';
      ctx.fill();
    }
    if (world.city.marker2Pos) dot(world.city.marker2Pos.x, world.city.marker2Pos.z, '#39d5ee', S / 46);
    for (const car of world.police.cars) dot(car.x, car.z, '#5b8cff', Math.max(1.6, S / 100));
    if (world.police.heli) dot(world.police.heli.x, world.police.heli.z, '#5b8cff', S / 70);
    for (const boat of world.police.boats || []) dot(boat.x, boat.z, '#5b8cff', Math.max(1.6, S / 100));
    for (const e of world.enemies) if (!e.dead) dot(e.x, e.z, '#ff5964', Math.max(1.8, S / 90));
    for (const b of world.boats || []) if (!b.dead) dot(b.x, b.z, '#f8f7ff', Math.max(1.4, S / 110));
    if (world.yacht) dot(world.yacht.x, world.yacht.z, '#ffd23f', S / 60);
    // Player arrow, rotated to the current heading.
    const focus = world.playerCar || world.playerHeli || world.playerBoat || world.player;
    const a = focus.heading || 0;
    ctx.save();
    ctx.translate(px(focus.x), pz(focus.z));
    ctx.rotate(Math.PI - a);
    ctx.fillStyle = '#ffffff';
    const u = S / 184;
    ctx.beginPath();
    ctx.moveTo(0, -5.4 * u); ctx.lineTo(3.8 * u, 4.4 * u); ctx.lineTo(0, 2.4 * u); ctx.lineTo(-3.8 * u, 4.4 * u);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  drawMinimap(world) {
    if (!this.mapCtx) return;
    this.paintMap(this.mapCtx, this.map.width, world);
  }

  drawBigMap(world) {
    if (!this.bigMapCtx) return;
    this.paintMap(this.bigMapCtx, this.bigMap.width, world);
  }
}
