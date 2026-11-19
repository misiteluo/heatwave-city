// save.js — progress in localStorage: cash, story progress and lifetime
// stats. Deliberately tiny and defensive: a corrupt save falls back to a
// fresh game instead of breaking the title screen.

import { SAVE_KEY } from './config.js';

export function defaultSave() {
  return { cash: 120, mission: 0, completed: 0, busts: 0, wasted: 0, started: false };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const data = JSON.parse(raw);
    const base = defaultSave();
    for (const k of Object.keys(base)) {
      if (typeof data[k] === typeof base[k]) base[k] = data[k];
    }
    return base;
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
