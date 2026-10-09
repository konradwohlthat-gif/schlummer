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

function wakeControls() {
  const t = Date.now();
  if (t - lastWake < WAKE_EVERY_MS) return;
  lastWake = t;
  const target = document.querySelector('pointer-actions') || document.querySelector('disney-web-player-ui') || document.body;
  try {
    target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, composed: true, clientX: 10, clientY: 10 }));
  } catch { /* ignorieren */ }
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
