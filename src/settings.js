// Einstellungen mit Standardwerten. Speicherung über GM.* (Userscripts) oder localStorage.

export const DEFAULTS = Object.freeze({
  episodes: 1,               // 1..10
  skipIntro: true,
  skipCredits: true,
  volumeCurve: 'perceptual', // 'perceptual' | 'linear'
  minVolume: 0,              // 0..0.5 (absolut)
  startDelayMin: 0,          // 0..60 Minuten
  blueLight: 0,              // 0..1
});

const KEY = 'schlummer.settings';

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const num = (x, fallback) => (typeof x === 'number' && Number.isFinite(x) ? x : fallback);

function hasGM() {
  try {
    return typeof GM !== 'undefined' && GM && typeof GM.getValue === 'function' && typeof GM.setValue === 'function';
  } catch {
    return false;
  }
}

export function sanitize(s) {
  const o = { ...DEFAULTS, ...(s || {}) };
  return {
    episodes: clamp(Math.round(num(o.episodes, 1)), 1, 10),
    skipIntro: !!o.skipIntro,
    skipCredits: !!o.skipCredits,
    volumeCurve: o.volumeCurve === 'linear' ? 'linear' : 'perceptual',
    minVolume: clamp(num(o.minVolume, 0), 0, 0.5),
    startDelayMin: clamp(Math.round(num(o.startDelayMin, 0)), 0, 60),
    blueLight: clamp(num(o.blueLight, 0), 0, 1),
  };
}

const GM_TIMEOUT_MS = 1500;

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
}

export async function loadSettings() {
  let raw = null;
  try {
    // GM.getValue darf das Skript nie blockieren: nach 1,5 s weiter mit localStorage.
    raw = hasGM() ? await withTimeout(GM.getValue(KEY, null), GM_TIMEOUT_MS) : null;
    if (raw === null || raw === undefined) raw = localStorage.getItem(KEY);
  } catch {
    try { raw = localStorage.getItem(KEY); } catch { raw = null; }
  }
  let parsed = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = {};
  }
  return sanitize(parsed);
}

export async function saveSettings(s) {
  const raw = JSON.stringify(sanitize(s));
  try {
    if (hasGM()) await GM.setValue(KEY, raw);
    else localStorage.setItem(KEY, raw);
  } catch {
    /* Speichern ist optional */
  }
}
