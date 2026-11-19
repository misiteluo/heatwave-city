// hud.js — all DOM and canvas HUD work: cash, health and armor bars,
// wanted stars, the weapon readout, speedo, objective banner, prompts,
// toasts, dialogue box, radio label, the bust meter, damage vignette,
// the mission-fail banner and the 2D minimap (peninsula, causeway,
// Gull Island, police in blue, enemies in red, the job in gold).

import { HALF, ISLAND, clamp } from './config.js';

export class Hud {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.cash = this.el('cash');
    this.healthFill = this.el('healthfill');
    this.armorFill = this.el('armorfill');
    this.stars = this.el('stars');
    this.speed = this.el('speed');
    this.objective = this.el('objective');
    this.objectiveText = this.el('objectivetext');
    this.prompt = this.el('prompt');
    this.toastBox = this.el('toast');
    this.weaponName = this.el('weaponname');
    this.ammo = this.el('ammo');
    this.bustWrap = this.el('bustwrap');
    this.bustFill = this.el('bustfill');
    this.vignette = this.el('vignette');
    this.dialogue = this.el('dialogue');
    this.dlgWho = this.el('dlgwho');
    this.dlgText = this.el('dlgtext');
    this.radio = this.el('radio');
    this.failBox = this.el('missionfail');
    this.mini = this.el('minimap');
    this.miniCtx = this.mini.getContext('2d');
    this.toastTimer = null;
    this.vignetteTimer = 0;
  }

  setCash(v) { this.cash.textContent = '$' + Math.max(0, Math.floor(v)).toLocaleString('en-US'); }
  setHealth(v) {
    this.healthFill.style.width = clamp(v, 0, 100) + '%';
    this.healthFill.style.background = v < 30 ? '#e63946' : '#06d6a0';
  }
  setArmor(v) {
    this.armorFill.style.width = clamp(v, 0, 100) + '%';
    this.armorFill.parentElement.style.display = v > 0 ? 'block' : 'none';
  }
  setWeapon(combat) {
    this.weaponName.textContent = combat.current.toUpperCase();
    this.ammo.textContent = combat.ammoText();
  }
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
  setDialogue(who, text) {
    this.dialogue.style.display = 'block';
    this.dlgWho.textContent = who;
    this.dlgText.textContent = text;
  }
  clearDialogue() { this.dialogue.style.display = 'none'; }
  setRadio(text) {
    if (text) { this.radio.style.display = 'block'; this.radio.textContent = '♪ ' + text; }
    else this.radio.style.display = 'none';
  }
  showFail(text) {
    this.failBox.textContent = text;
    this.failBox.style.display = 'block';
  }
  hideFail() { this.failBox.style.display = 'none'; }
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
    const s = S / 890;
    const toX = (x) => S / 2 + x * s;
    const toY = (z) => S / 2 + (z - 120) * s;
    g.fillStyle = '#155e75'; g.fillRect(0, 0, S, S);
    // landmass
    g.fillStyle = '#4a5058';
    g.fillRect(toX(-292), toY(-292), 584 * s, 602 * s);
    g.fillRect(toX(-9), toY(276), 18 * s, 202 * s);
    g.beginPath(); g.arc(toX(ISLAND.x), toY(ISLAND.z), ISLAND.r * s, 0, Math.PI * 2); g.fill();
    g.fillRect(toX(292), toY(-106), 54 * s, 20 * s);
    g.fillRect(toX(292), toY(86), 54 * s, 20 * s);
    // beach
    g.fillStyle = '#c9ae72';
    g.fillRect(toX(-292), toY(276), 584 * s, 34 * s);
    // roads
    g.strokeStyle = 'rgba(255,255,255,.16)';
    g.lineWidth = 1;
    for (let i = 0; i <= 12; i++) {
      const l = -HALF + i * 46;
      g.beginPath(); g.moveTo(toX(l), toY(-292)); g.lineTo(toX(l), toY(292)); g.stroke();
      g.beginPath(); g.moveTo(toX(-292), toY(l)); g.lineTo(toX(292), toY(l)); g.stroke();
    }
    // mission marker
    const mp = world.city.markerPos;
    if (mp) {
      g.fillStyle = '#ffd23f';
      g.beginPath(); g.arc(toX(mp.x), toY(mp.z), 4.6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff'; g.stroke();
    }
    // enemies red, loose mission cars yellow
    g.fillStyle = '#ff4455';
    for (const e of world.enemies) if (!e.dead) g.fillRect(toX(e.x) - 2, toY(e.z) - 2, 4, 4);
    g.fillStyle = '#ffd23f';
    for (const c of world.looseCars) if (!c.dead) g.fillRect(toX(c.x) - 2, toY(c.z) - 2, 4, 4);
    // police blue (cars, blocks and the heli)
    g.fillStyle = '#4488ff';
    for (const c of world.police.cars.concat(world.police.blocks)) {
      g.beginPath(); g.arc(toX(c.x), toY(c.z), 3.2, 0, Math.PI * 2); g.fill();
    }
    if (world.police.heli) {
      g.beginPath(); g.arc(toX(world.police.heli.x), toY(world.police.heli.z), 3.2, 0, Math.PI * 2); g.fill();
    }
    // player arrow (or white dot in the heli)
    const px = world.playerHeli ? world.playerHeli.x : (world.playerCar ? world.playerCar.x : world.player.x);
    const pz = world.playerHeli ? world.playerHeli.z : (world.playerCar ? world.playerCar.z : world.player.z);
    const heading = world.playerHeli ? world.playerHeli.heading
      : (world.playerCar ? world.playerCar.heading : world.player.heading);
    g.save();
    g.translate(toX(px), toY(pz));
    g.rotate(Math.atan2(Math.sin(heading), -Math.cos(heading)) + Math.PI);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -6); g.lineTo(4.4, 5); g.lineTo(-4.4, 5); g.closePath(); g.fill();
    g.restore();
    g.fillStyle = '#fff'; g.font = 'bold 11px sans-serif';
    g.fillText('N', S - 14, 14);
  }
}
