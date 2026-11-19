// save.js — progress kept in localStorage: cash, story progress,
// the weapon locker, the garage of owned cars, the story flags that
// carry branch consequences from one job to the next, lifetime
// stats, the achievement list and the collected briefcases. Built
// defensively: a corrupt or half-old save is merged over fresh
// defaults field by field instead of breaking the title screen.

import { SAVE_KEY } from './config.js';

export function defaultSave() {
  return {
    cash: 150,
    mission: 0,
    completed: 0,
    busts: 0,
    wasted: 0,
    kills: 0,
    distance: 0,
    earnings: 0,
    started: false,
    muted: false,
    weapons: { smg: false, shotgun: false, carbine: false, rpg: false, grenade: false },
    ammo: { pistol: 48, smg: 0, shotgun: 0, carbine: 0, rpg: 0, grenade: 0 },
    briefcases: [],
    ownedCars: [],       // { type, color } — at most three, most recent last
    flags: {},           // branch consequences: pierceAlly, vaultEntry, …
    achievements: [],
    activities: { races: 0, fares: 0, packages: 0, hideouts: 0 },
    playSeconds: 0,
  };
}

// Fold stored data into the defaults, keeping only fields whose
// types still match — old or tampered saves degrade gracefully.
function mergeInto(base, data) {
  if (!data || typeof data !== 'object') return base;
  for (const key of Object.keys(base)) {
    if (data[key] === undefined) continue;
    if (Array.isArray(base[key])) { if (Array.isArray(data[key])) base[key] = data[key].slice(); }
    else if (typeof base[key] === 'object' && base[key] !== null) mergeInto(base[key], data[key]);
    else if (typeof data[key] === typeof base[key]) base[key] = data[key];
  }
  return base;
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    return mergeInto(defaultSave(), JSON.parse(raw));
  } catch (err) {
    return defaultSave();
  }
}

export function writeSave(save) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (err) { /* private mode */ }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (err) { /* ignore */ }
}
