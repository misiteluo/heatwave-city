// save.js — progress in localStorage: cash, story progress, the weapon
// locker, lifetime stats and the mute flag. Defensive by design: a
// corrupt or half-old save merges over fresh defaults instead of
// breaking the title screen.

import { SAVE_KEY } from './config.js';

export function defaultSave() {
  return {
    cash: 150,
    mission: 0,
    completed: 0,
    busts: 0,
    wasted: 0,
    kills: 0,
    started: false,
    muted: false,
    weapons: { smg: false, shotgun: false },
    ammo: { pistol: 40, smg: 0, shotgun: 0 },
  };
}

function mergeInto(base, data) {
  if (!data || typeof data !== 'object') return base;
  for (const k of Object.keys(base)) {
    if (data[k] === undefined) continue;
    if (typeof base[k] === 'object' && base[k] !== null) mergeInto(base[k], data[k]);
    else if (typeof data[k] === typeof base[k]) base[k] = data[k];
  }
  return base;
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    return mergeInto(defaultSave(), JSON.parse(raw));
  } catch (e) {
    return defaultSave();
  }
}

export function storeSave(save) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* private mode */ }
}

export function wipeSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  return defaultSave();
}
