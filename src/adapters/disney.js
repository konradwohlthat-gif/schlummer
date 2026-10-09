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

// Serien, deren Logo nach Disneys Intro-Marker weiterläuft. Schlüssel = Serienname
// aus document.title ("Family Guy | Disney+"), kleingeschrieben.
//   marker: Sekunden, die Disneys eigener Intro-Sprung überspringt (fest, da in
//           jeder Staffel etwa gleich; Family Guy gemessen am 2026-10-09: 13 s)
//   extra:  Sekunden Logo-Nachlauf, die zusätzlich übersprungen werden
// Sobald der Intro-Knopf bei Folgenbeginn erscheint, springt das Skript in einem
// Zug um marker + extra, ohne den Knopf zu klicken.
export const INTRO_PROFILES = { 'family guy': { marker: 13, extra: 31 } };
const SEEK_VERIFY_MS = 1200;
let introHandledKey = null;

// Einzelne Folgen mit Zusammenfassung ohne eigenen Überspringen-Knopf: am Folgenanfang
// in einem Zug an recapEnd + marker + extra der Serie springen.
// Schlüssel = Disney-Play-ID (de-de); `title` ist ein Fallback über den Folgentitel.
export const EPISODE_PROFILES = {
  'ba34eea6-d42d-43ef-ba63-46e332ea5614': { series: 'family guy', title: /200 Folgen sp\u00e4ter/i, recapEnd: 26 },
};
const START_JUMP_MAX_POS = 5;      // nur, wenn die Folge wirklich am Anfang steht
const START_JUMP_TIMEOUT_MS = 12000;
let startJump = null;              // { key, target, since }

function episodeTitleText() {
  for (const r of shadowRoots('title-overlay')) {
    const t = (r.textContent || '').replace(/\s+/g, ' ').trim();
    if (t) return t;
  }
  return '';
}

function episodeProfile(key) {
  if (key && EPISODE_PROFILES[key]) return EPISODE_PROFILES[key];
  const title = episodeTitleText();
  if (!title) return null;
  const name = seriesName();
  return Object.values(EPISODE_PROFILES).find((p) => p.series === name && p.title && p.title.test(title)) || null;
}

/** Jeden Tick aufrufen: Folgenanfang-Sprung für bekannte Folgen ausführen. */
function tickStartJump(key) {
  if (startJump && startJump.key !== key) startJump = null;
  if (!startJump) {
    const prof = episodeProfile(key);
    if (!prof) return;
    const series = INTRO_PROFILES[prof.series] || { marker: 0, extra: 0 };
    startJump = { key, target: prof.recapEnd + series.marker + series.extra, since: Date.now(), done: false };
  }
  if (startJump.done) return;
  if (Date.now() - startJump.since > START_JUMP_TIMEOUT_MS) { startJump.done = true; return; }
  wakeControls(true);
  const info = sliderInfo();
  if (!info || info.now === null) return;
  if (info.now > START_JUMP_MAX_POS) { startJump.done = true; return; } // Wiedereinstieg, nicht springen
  if (seekViaSlider(startJump.target)) {
    startJump.done = true;
    introHandledKey = key; // Intro liegt hinter dem Sprung
  }
}

// Zusammenfassung ("Rückblick"/"Zusammenfassung überspringen") vs. Intro: beides
// erscheint in skip-overlay, unterschieden am Knopftext.
const RECAP_RE = /zusammenfassung|r\u00fcckblick|recap|previously|bisher/i;
// Frisch erschienen = im vorherigen Tick noch nicht da und Folge schon länger geladen.
// Nur dann liegt die Position am Markeranfang und der Direktsprung trifft.
const FRESH_MAX_MS = 1000;
const EPISODE_WARMUP_MS = 1500;
let skipState = { key: null, firstSeenAt: 0, lastAbsentAt: 0 };

function isRecapButton(b) {
  return RECAP_RE.test((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || ''));
}
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
  findSkipIntro: () => {
    const t = Date.now();
    const key = disney.episodeId();
    if (key !== skipState.key) skipState = { key, firstSeenAt: t, lastAbsentAt: t };
    tickStartJump(key);
    const b = shadowButton('skip-overlay');
    if (!b || isRecapButton(b)) { skipState.lastAbsentAt = t; return null; }
    return b;
  },
  /**
   * Intro-Knopf sichtbar. Für Serien mit Logo-Nachlauf (INTRO_PROFILES): bei
   * Folgenbeginn in einem Zug per Regler um marker + extra springen, ohne den
   * Knopf zu klicken. Gelingt das nicht (kein Regler lesbar, Folge nicht am
   * Anfang), wird der Knopf geklickt und der Nachlauf nachgezogen.
   * Gibt false zurück, wenn der Controller normal klicken soll.
   */
  handleSkipIntro: (el, clickOnce) => {
    const profile = INTRO_PROFILES[seriesName()];
    if (!profile) return false;
    const key = disney.episodeId();
    if (introHandledKey === key) return 'erledigt';
    introHandledKey = key;
    const t = Date.now();
    const fresh = t - skipState.lastAbsentAt < FRESH_MAX_MS && t - skipState.firstSeenAt > EPISODE_WARMUP_MS;
    wakeControls(true);
    setTimeout(() => {
      const info = sliderInfo();
      const p0 = info && info.now !== null ? info.now : null;
      if (fresh && p0 !== null && seekViaSlider(p0 + profile.marker + profile.extra)) return;
      if (clickOnce(el)) setTimeout(() => seekBy(profile.extra), 900);
    }, 350);
    return fresh ? 'direkt' : 'klick+nachlauf';
  },
  findSkipRecap: () => {
    const b = shadowButton('skip-overlay');
    return b && isRecapButton(b) ? b : null;
  },
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
