import { fullscreenRoot } from './util.js';

// Disney+ (neuer "hive"-Player): Custom Elements mit Shadow DOM.
// - Zwei <video>: ein leeres Platzhalter-Element und der echte Player (#hivePlayer1 / .hive-video).
// - video.duration ist Infinity. Die Dauer steht im Fortschrittsregler der Steuerleiste
//   (main-app-controls-overlay → [aria-valuemax], Sekunden), die nur bei Mausbewegung
//   gerendert wird. Fehlt sie, wird die Leiste per synthetischem mousemove kurz geweckt.
// - Knöpfe: skip-overlay (Intro), up-next-lite-v1 (nächste Folge), inactivity-overlay.

const WAKE_EVERY_MS = 5000;
let lastWake = 0;
const durationCache = new Map(); // episodeId → Sekunden

function shadowButton(tag) {
  const host = document.querySelector(tag);
  const root = host && host.shadowRoot;
  if (!root) return null;
  const b = root.querySelector('button');
  return b && b.getClientRects().length > 0 ? b : null;
}

function readSliderMax() {
  const host = document.querySelector('main-app-controls-overlay');
  const root = host && host.shadowRoot;
  if (!root) return null;
  const roots = [root];
  for (const el of root.querySelectorAll('*')) if (el.shadowRoot) roots.push(el.shadowRoot);
  for (const r of roots) {
    const s = r.querySelector('[aria-valuemax]');
    const max = s && Number(s.getAttribute('aria-valuemax'));
    if (max && Number.isFinite(max) && max > 60) return max;
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
      vids.find((v) => v.id === 'hivePlayer1' || v.classList.contains('hive-video')) ||
      vids.find((v) => v.readyState > 0) ||
      vids[0] || null
    );
  },
  getDuration: (video) => {
    if (video && Number.isFinite(video.duration) && video.duration > 0) return video.duration;
    const key = disney.episodeId();
    const fromSlider = readSliderMax();
    if (fromSlider) {
      if (key) durationCache.set(key, fromSlider);
      return fromSlider;
    }
    if (key && durationCache.has(key)) return durationCache.get(key);
    wakeControls();
    return NaN;
  },
  findSkipIntro: () => shadowButton('skip-overlay'),
  findSkipRecap: () => null,
  findNextEpisode: () => shadowButton('up-next-lite-v1'),
  findStillWatching: () => shadowButton('inactivity-overlay'),
  isSeriesEnd: () => false,
  fullscreenRoot: () => fullscreenRoot(document),
};
