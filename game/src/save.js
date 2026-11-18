// HEATWAVE CITY — save data in localStorage: cash, story progress, pistol.
// Kept tiny and forgiving: a corrupt or missing save just means a fresh game.

const KEY = 'heatwave-city-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (typeof d !== 'object' || d === null) return null;
    return {
      cash: Math.max(0, d.cash | 0),
      mission: Math.max(0, Math.min(5, d.mission | 0)),
      pistol: !!d.pistol,
      done: !!d.done,
    };
  } catch { return null; }
}

export function storeSave(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      cash: state.cash | 0,
      mission: state.missionIndex | 0,
      pistol: !!state.pistol,
      done: !!state.storyDone,
    }));
  } catch { /* private mode etc. — the game still runs */ }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
