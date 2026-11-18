// HEATWAVE CITY — save games in localStorage: cash, story progress, the pistol.

const KEY = 'heatwave-city-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      cash: Number(data.cash) || 0,
      mission: Math.max(0, Math.min(4, Number(data.mission) || 0)),
      hasGun: !!data.hasGun,
      storyDone: !!data.storyDone,
    };
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* private mode: play session-only */ }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}
