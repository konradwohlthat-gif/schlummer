import { fullscreenRoot } from './util.js';

// Disney+ (neuer "hive"-Player): Custom Elements mit Shadow DOM.
// - Zwei <video>: ein leeres Platzhalter-Element und der echte Player (#hivePlayer1 / .hive-video).
// - video.duration ist Infinity. Die Dauer steht im Fortschrittsregler der Steuerleiste
//   (main-app-controls-overlay → [aria-valuemax], Sekunden), die nur bei Mausbewegung
//   gerendert wird. Fehlt sie, wird die Leiste per synthetischem mousemove kurz geweckt.
// - Knöpfe: skip-overlay (Intro), up-next-lite-v1 (nächste Folge), inactivity-overlay.

// - video.currentTime ist nur die Position im Puffer-Fenster (seekable ≈ 60 s), nicht die
//   absolute Position. Absolut = Regler (aria-valuenow). Ohne sichtbare Leiste wird
//   currentTime plus zuletzt gemessenem Versatz verwendet; springt currentTime zurück
//   (neues Fenster), wird die Leiste geweckt und neu synchronisiert.

const WAKE_EVERY_MS = 4000;
let lastWake = 0;

// Serien, deren Logo nach Disneys Intro-Marker weiterläuft: zusätzliche Sekunden,
// die direkt nach dem Intro-Sprung in einem Rutsch übersprungen werden.
// Schlüssel = Serienname aus document.title ("Family Guy | Disney+"), kleingeschrieben.
export const INTRO_EXTRA_SEC = { 'family guy': 15 };
const INTRO_EXTRA_DELAY_MS = 900;   // Disney braucht einen Moment für den Intro-Sprung
const SEEK_VERIFY_MS = 1200;
const durationCache = new Map(); // episodeId → Sekunden
let pos = { key: null, offset: 0, lastRel: null, synced: false };

function shadowRoots(tag) {
  const host = document.querySelector(tag);
  const root = host && host.shadowRoot;
  if (!root) return [];
  const roots = [root];
  for (const el of root.querySelectorAll('*')) if (el.shadowRoot) roots.push(el.shadowRoot);
  return roots;
}

function visible(el) {
  return !!el && el.getClientRects().length > 0;
}

/** Erster sichtbarer Knopf im Shadow DOM eines Custom Elements, optional ohne "Schließen". */
function shadowButton(tag, { skipClose = true } = {}) {
  for (const r of shadowRoots(tag)) {
    for (const b of r.querySelectorAll('button')) {
      if (!visible(b)) continue;
      if (skipClose && /schlie\u00dfen|close/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || ''))) continue;
      return b;
    }
  }
  return null;
}

function readSlider() {
  for (const r of shadowRoots('main-app-controls-overlay')) {
    const s = r.querySelector('[aria-valuemax]');
    if (!s) continue;
    const max = Number(s.getAttribute('aria-valuemax'));
    const now = Number(s.getAttribute('aria-valuenow'));
    if (Number.isFinite(max) && max > 60) return { max, now: Number.isFinite(now) ? now : null };
  }
  return null;
}

function wakeControls(force = false) {
  const t = Date.now();
  if (!force && t - lastWake < WAKE_EVERY_MS) return;
  lastWake = t;
  const target = document.querySelector('pointer-actions') || document.querySelector('disney-web-player-ui') || document.body;
  try {
    target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, composed: true, clientX: 10, clientY: 10 }));
  } catch { /* ignorieren */ }
}

function seriesName() {
  return (document.title || '').split('|')[0].trim().toLowerCase();
}

function sliderInfo() {
  for (const r of shadowRoots('main-app-controls-overlay')) {
    const s = r.querySelector('[aria-valuemax]');
    if (!s) continue;
    const max = Number(s.getAttribute('aria-valuemax'));
    const now = Number(s.getAttribute('aria-valuenow'));
    if (Number.isFinite(max) && max > 60) return { el: s, root: r, max, now: Number.isFinite(now) ? now : null };
  }
  return null;
}

/** Weg 1: Zeigerereignisse auf den Fortschrittsregler (präzise). */
function seekViaSlider(targetSec) {
  const info = sliderInfo();
  if (!info) return false;
  const rect = info.el.getBoundingClientRect();
  if (rect.width < 50) return false;
  const x = rect.left + rect.width * Math.min(1, Math.max(0, targetSec / info.max));
  const y = rect.top + rect.height / 2;
  const target = (info.root.elementFromPoint && info.root.elementFromPoint(x, y)) || info.el;
  const base = { bubbles: true, composed: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true };
  try {
    target.dispatchEvent(new PointerEvent('pointerdown', { ...base, buttons: 1 }));
    target.dispatchEvent(new MouseEvent('mousedown', { ...base, buttons: 1 }));
    target.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0 }));
    target.dispatchEvent(new MouseEvent('mouseup', { ...base, buttons: 0 }));
    target.dispatchEvent(new MouseEvent('click', { ...base, buttons: 0 }));
    return true;
  } catch {
    return false;
  }
}

/** Weg 2: die "+10 s"-Taste der Steuerleiste, abgerundet (nie zu weit springen). */
function seekViaForwardButton(seconds) {
  const clicks = Math.floor(seconds / 10);
  if (clicks < 1) return false;
  for (const r of shadowRoots('main-app-controls-overlay')) {
    for (const b of r.querySelectorAll('button')) {
      const label = ((b.getAttribute('aria-label') || '') + ' ' + String(b.className)).toLowerCase();
      if (/10/.test(label) && /(vor|forward|skip-forward|next)/.test(label) && visible(b)) {
        for (let i = 0; i < clicks; i += 1) b.click();
        return true;
      }
    }
  }
  return false;
}

/**
 * Um `seconds` vorspulen: Regler → Vorwärts-Taste → currentTime. Nach jedem
 * Versuch wird am Regler geprüft, ob die Position wirklich gewandert ist.
 */
function seekBy(seconds) {
  wakeControls(true);
  setTimeout(() => {
    const before = sliderInfo();
    const start = before && before.now !== null ? before.now : null;
    const check = (next) => setTimeout(() => {
      const after = sliderInfo();
      const moved = start !== null && after && after.now !== null && after.now - start >= seconds - 3;
      if (!moved && next) next();
    }, SEEK_VERIFY_MS);
    const tryCurrentTime = () => {
      const v = disney.getVideo();
      if (v) { try { v.currentTime = v.currentTime + seconds; } catch { /* ignorieren */ } }
    };
    const tryButton = () => { if (!seekViaForwardButton(seconds)) tryCurrentTime(); else check(tryCurrentTime); };
    if (start !== null && seekViaSlider(start + seconds)) check(tryButton);
    else tryButton();
  }, 350);
}

export const disney = {
  id: 'disney',
  name: 'Disney+',
  accent: '#0072d2',
  matches: (loc) => /(^|\.)disneyplus\.com$/i.test(loc.hostname),
  isPlayerPage: () => /\/(video|play)\//.test(location.pathname),
  episodeId: () => (location.pathname.match(/\/(?:video|play)\/([^/?#]+)/) || [])[1] || null,
  getVideo: () => {
    const vids = [...document.querySelectorAll('video')];
    return (
      vids.find((v) => /^hivePlayer\d+$/.test(v.id) || v.classList.contains('hive-video')) ||
      vids.find((v) => v.readyState > 0) ||
      vids[0] || null
    );
  },
  /** `wake`: Steuerleiste wecken dürfen (nur im Schlafmodus, sonst flackert sie für den Zuschauer). */
  getDuration: (video, { wake = false } = {}) => {
    if (video && Number.isFinite(video.duration) && video.duration > 0) return video.duration;
    const key = disney.episodeId();
    const slider = readSlider();
    if (slider) {
      if (key) durationCache.set(key, slider.max);
      return slider.max;
    }
    if (key && durationCache.has(key)) return durationCache.get(key);
    if (wake) wakeControls();
    return NaN;
  },
  getPosition: (video, { wake = false } = {}) => {
    if (!video) return 0;
    const key = disney.episodeId();
    if (key !== pos.key) pos = { key, offset: 0, lastRel: null, synced: false };
    const rel = video.currentTime || 0;
    const slider = readSlider();
    if (slider && slider.now !== null) {
      pos.offset = slider.now - rel;
      pos.synced = true;
      pos.lastRel = rel;
      return slider.now;
    }
    if (pos.lastRel !== null && rel < pos.lastRel - 2) pos.synced = false; // neues Puffer-Fenster
    pos.lastRel = rel;
    if (!pos.synced && wake) wakeControls();
    return Math.max(0, rel + pos.offset);
  },
  findSkipIntro: () => shadowButton('skip-overlay'),
  /** Nach dem Intro-Klick: bei bekannten Serien zusätzlich vorspulen (Logo läuft weiter). */
  afterIntroSkip: () => {
    const extra = INTRO_EXTRA_SEC[seriesName()] || 0;
    if (extra > 0) setTimeout(() => seekBy(extra), INTRO_EXTRA_DELAY_MS);
    return extra;
  },
  findSkipRecap: () => null,
  findNextEpisode: () => {
    for (const r of shadowRoots('end-card-overlay')) {
      const tile = r.querySelector('button.end-card-overlay__content-tile');
      if (visible(tile)) return tile;
    }
    return shadowButton('up-next-lite-v1');
  },
  findStillWatching: () => shadowButton('inactivity-overlay'),
  isSeriesEnd: () => false,
  fullscreenRoot: () => fullscreenRoot(document),
};
