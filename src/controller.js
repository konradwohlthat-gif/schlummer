// Verdrahtung von Video, Sitzung, Ebenen, Panel und Skip-Knöpfen.
import { createOverlay } from './overlay.js';
import { createPanel } from './panel.js';
import { createSession } from './session.js';
import { saveSettings, sanitize } from './settings.js';

const POLL_MS = 250;
const INTERACT_COOLDOWN_MS = 10000; // nach einer Verlängerung
const WAKE_GRACE_MS = 2000;         // nach dem Ende: so lange keine Aufwach-Erkennung
const WAKE_MOVE_PX = 12;            // Mindest-Mausbewegung zum Aufwachen
const USER_VOLUME_WINDOW_MS = 1500; // Lautstärkeänderung kurz nach Eingabe = Nutzer
const CLICK_REPEAT_MS = 1500;
const RESTORE_MS = 6000;            // nach dem Ausschalten: Lautstärke auf neue Video-Elemente nachziehen
const HOLD_PAUSE_MS = 30000;        // nach dem Aufwachen: Autoplay unterdrücken, bis der Nutzer selbst startet
const USER_PLAY_WINDOW_MS = 1500;   // Play kurz nach einer Eingabe gilt als vom Nutzer gewollt
const SWITCH_TIMEOUT_MS = 4000;     // Folgenwechsel spätestens dann verarbeiten

const now = () => Date.now();

export function startController({ adapter, settings, doc = document, win = window }) {
  const overlay = createOverlay(doc);
  const panel = createPanel({ settings, onSettingChange, onSleepToggle: toggleSleep, getStatus, accent: adapter.accent, doc });

  let video = null;          // aktuelles <video>
  let episodeKey = null;     // adapter.episodeId() der aktuellen Folge
  let lastStats = null;      // letzter bekannter Stand der aktuellen Folge
  let endedFlag = false;     // 'ended' der aktuellen Folge gesehen
  let pendingSwitch = null;  // { prev } bis das neue Video Metadaten hat
  let session = null;        // laufende Schlafmodus-Sitzung
  let lastApplied = null;    // zuletzt von uns gesetzte Lautstärke
  let lastUserInputAt = 0;
  let lastExtendAt = 0;
  let doneAt = 0;
  let doneMoved = 0;
  let lastMouse = null;
  let mounted = false;
  let stopped = false;
  let nextClickedKey = null;  // Sicherung: "Nächste Folge" höchstens einmal pro Folge
  let restore = null;         // { until, base } nach dem Ausschalten
  let holdPauseUntil = 0;     // nach dem Aufwachen: Netflix-Autoplay zurückhalten
  const clickedAt = new WeakMap();

  // ---------- Hilfen ----------
  const durationOf = (v) => (adapter.getDuration ? adapter.getDuration(v) : v.duration);
  const hasMeta = (v) => { if (!v) return false; const d = durationOf(v); return Number.isFinite(d) && d > 0; };
  const stats = (v) => ({ duration: hasMeta(v) ? durationOf(v) : 0, currentTime: v.currentTime || 0, ended: !!(v.ended || endedFlag) });
  const visible = (el) => !!el && el.isConnected && el.getClientRects().length > 0;

  function clickOnce(el) {
    if (!visible(el)) return false;
    const t = clickedAt.get(el) || 0;
    if (now() - t < CLICK_REPEAT_MS) return false;
    clickedAt.set(el, now());
    try { el.click(); } catch { /* ignorieren */ }
    return true;
  }

  function setVolume(v, target) {
    if (!v) return;
    if (Math.abs(v.volume - target) > 0.002) {
      lastApplied = target;
      v.volume = target;
    } else {
      lastApplied = v.volume;
    }
  }

  // ---------- Einstellungen ----------
  function onSettingChange(key, value) {
    const next = sanitize({ ...settings, [key]: value });
    const delta = next.episodes - settings.episodes;
    Object.assign(settings, next);
    saveSettings(settings);
    if (key === 'episodes' && delta !== 0 && session && !session.done && video && hasMeta(video)) {
      session.adjustBudget(delta, stats(video));
    }
    if (session && !session.done) applyOutputs();
    if (!session) overlay.setWarm(0);
    panel.update();
  }

  // ---------- Status ----------
  function getStatus() {
    if (!session) return { active: false, text: 'Aus' };
    if (session.done) return { active: true, text: 'Beendet. Maus bewegen oder Taste drücken zum Aufwachen.' };
    const plan = session.plan;
    if (!plan.anchor) return { active: true, text: `Startet in ${Math.max(1, Math.ceil(plan.delayLeft / 60))} min` };
    const vs = video && hasMeta(video) ? stats(video) : null;
    const p = vs ? session.progress(vs) : 0;
    const idx = session.finishedCount + 1;
    const paused = video && video.paused ? ' · pausiert' : '';
    return { active: true, text: `Folge ${idx} von ${session.totalPlanned} · ${Math.round(p * 100)} %${paused}` };
  }

  // ---------- Schlafmodus ----------
  function startSleep() {
    if (!video || !hasMeta(video)) {
      panel.notice('Kein laufendes Video gefunden');
      return;
    }
    session = createSession({ settings, video, baseVolume: video.volume });
    lastExtendAt = 0;
    endedFlag = !!video.ended;
    applyOutputs();
    panel.update();
  }

  function exitSleep() {
    if (!session) return;
    const base = session.base;
    const wasDone = session.done;
    session = null;
    // Nach dem Ende hält nur unser Pausieren Netflix' Autoplay zurück. Nach dem
    // Aufwachen soll nichts von selbst loslaufen, bis der Nutzer bewusst startet.
    holdPauseUntil = wasDone ? now() + HOLD_PAUSE_MS : 0;
    overlay.setDim(0);
    overlay.setWarm(0);
    // Netflix legt beim Folgenwechsel neue Video-Elemente an und übernimmt die
    // Lautstärke in seinen eigenen Zustand. Deshalb eine Weile nachziehen.
    restore = { until: now() + RESTORE_MS, base };
    applyRestore();
    panel.update();
  }

  function applyRestore() {
    if (!restore) return;
    if (now() > restore.until) { restore = null; return; }
    const v = adapter.getVideo();
    if (!v) return;
    if (Math.abs(v.volume - restore.base) > 0.01) v.volume = restore.base;
  }

  function toggleSleep() {
    if (session) exitSleep();
    else startSleep();
  }

  function enterDone() {
    doneAt = now();
    doneMoved = 0;
    if (video) {
      try { video.pause(); } catch { /* ignorieren */ }
    }
    panel.update();
  }

  function applyOutputs() {
    if (!session || !video) return;
    const vs = stats(video);
    const p = session.progress(vs);
    overlay.setDim(p);
    overlay.setWarm(settings.blueLight);
    if (session.done) {
      // Nie `muted` setzen: Netflix merkt sich das in seinem eigenen Zustand und
      // bleibt dann auch nach dem Aufwachen stumm. Lautstärke reicht, da pausiert.
      if (!doneAt) enterDone();
      if (!video.paused) { try { video.pause(); } catch { /* ignorieren */ } }
      if (!video.muted) setVolume(video, session.volume(vs, settings));
      return;
    }
    doneAt = 0;
    if (!video.muted) setVolume(video, session.volume(vs, settings));
  }

  // ---------- Video / Folgenwechsel ----------
  function onVideoChange(v, key) {
    if (session && !session.done && lastStats && key !== episodeKey) {
      if (!pendingSwitch) pendingSwitch = { prev: { ...lastStats }, oldVideo: video, at: now() };
    }
    if (v !== video) {
      video = v;
      lastApplied = null;
      if (v) {
        v.addEventListener('ended', onEnded);
        if (session) applyOutputs();
      }
    }
    if (key !== episodeKey) {
      episodeKey = key;
      lastStats = null;
      endedFlag = false;
    }
  }

  /** Neues Video wirklich da? Sonst wartet der Folgenwechsel noch. */
  function switchReady(ps) {
    if (!video || !hasMeta(video)) return false;
    if (video !== ps.oldVideo) return true;
    if (Math.abs(durationOf(video) - ps.prev.duration) > 1) return true;
    if (video.currentTime < ps.prev.currentTime - 5) return true;
    return now() - ps.at > SWITCH_TIMEOUT_MS;
  }

  function onEnded(e) {
    if (e.target === video) endedFlag = true;
  }

  // ---------- Skips ----------
  function runSkips() {
    if (settings.skipIntro) {
      clickOnce(adapter.findSkipIntro());
      clickOnce(adapter.findSkipRecap());
    }
    const sleeping = !!session && !session.done;
    const lastEpisode = sleeping && session.plan.budget <= 1;
    const finished = !!session && session.done;
    if (!lastEpisode && !finished && nextClickedKey !== episodeKey) {
      const wantNext = settings.skipCredits || (sleeping && video && (video.ended || endedFlag));
      if (wantNext && clickOnce(adapter.findNextEpisode())) nextClickedKey = episodeKey;
    }
    if (sleeping) clickOnce(adapter.findStillWatching());
  }

  // ---------- Interaktion ----------
  function onInteraction(e) {
    const t = now();
    if (e.type === 'mousedown' || e.type === 'keydown' || e.type === 'wheel' || e.type === 'touchstart') lastUserInputAt = t;
    if (e.type === 'mousemove') {
      if (lastMouse) doneMoved += Math.hypot(e.clientX - lastMouse.x, e.clientY - lastMouse.y);
      lastMouse = { x: e.clientX, y: e.clientY };
    }
    if (!mounted) return;
    if (e.type === 'keydown' && isZ(e)) {
      // Z öffnet und schließt nur das Panel. Schlafmodus wird im Panel geschaltet.
      e.stopPropagation();
      e.preventDefault();
      panel.toggle();
      panel.update();
      return;
    }
    if (e.type === 'mousedown' && panel.isVisible() && !panel.isInside(e.target)) panel.hide();
    if (!session) return;
    if (panel.isInside(e.target)) return;
    if (session.done) {
      if (t - doneAt > WAKE_GRACE_MS && (e.type !== 'mousemove' || doneMoved > WAKE_MOVE_PX)) exitSleep();
      return;
    }
    if (t - lastExtendAt < INTERACT_COOLDOWN_MS) return;
    if (video && hasMeta(video)) {
      const r = session.interact(stats(video));
      if (r.changed) {
        lastExtendAt = t;
        if (r.added > 0) panel.notice(r.added === 1 ? '+1 Folge nachgelegt' : `+${r.added} Folgen nachgelegt`);
        applyOutputs();
        panel.update();
      }
    }
  }

  function isZ(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    if (!/^[zZ]$/.test(e.key || '')) return false;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return false;
    return true;
  }

  function onVolumeChange(e) {
    const v = e.target;
    if (!session || session.done || v !== video || !(v instanceof HTMLMediaElement)) return;
    if (v.muted) return;
    if (lastApplied !== null && Math.abs(v.volume - lastApplied) < 0.002) return;
    if (now() - lastUserInputAt < USER_VOLUME_WINDOW_MS && hasMeta(v)) {
      session.rebase(v.volume, stats(v), settings);
      lastApplied = v.volume;
    } else {
      // Anbieter hat die Lautstärke gesetzt (z. B. neue Folge): unseren Wert wiederherstellen
      applyOutputs();
    }
  }

  function userJustActed() {
    return now() - lastUserInputAt < USER_PLAY_WINDOW_MS;
  }

  function onPlay(e) {
    const v = e.target;
    if (!(v instanceof HTMLMediaElement)) return;
    if (session && session.done && v === video) {
      try { v.pause(); } catch { /* ignorieren */ }
      return;
    }
    if (!session && now() < holdPauseUntil) {
      if (userJustActed()) holdPauseUntil = 0;
      else { try { v.pause(); } catch { /* ignorieren */ } }
    }
  }

  // ---------- Seite / Schleife ----------
  function mountPage() {
    mounted = true;
  }

  function teardownPage() {
    if (session) exitSleep();
    panel.unmount();
    overlay.unmount();
    if (video) video.removeEventListener('ended', onEnded);
    video = null;
    episodeKey = null;
    lastStats = null;
    pendingSwitch = null;
    mounted = false;
  }

  function loop() {
    if (stopped) return;
    try {
      step();
    } catch (err) {
      console.warn('[Schlummer]', err);
    }
  }

  function step() {
    if (!adapter.isPlayerPage()) {
      if (mounted) teardownPage();
      return;
    }
    if (!mounted) mountPage();
    const root = adapter.fullscreenRoot();
    overlay.mount(root);
    panel.mount(root);

    const v = adapter.getVideo();
    const key = adapter.episodeId() || (v ? 'el' : null);
    if (v !== video || key !== episodeKey) onVideoChange(v, key);

    if (video && hasMeta(video)) {
      if (session && !session.done) {
        if (pendingSwitch) {
          if (switchReady(pendingSwitch)) {
            session.episodeChanged(pendingSwitch.prev, stats(video));
            pendingSwitch = null;
          }
        } else {
          session.tick(stats(video));
        }
      }
      if (!pendingSwitch) lastStats = stats(video);
    }
    if (session && !session.done && adapter.isSeriesEnd && adapter.isSeriesEnd()) {
      session.finish();
      pendingSwitch = null;
      panel.notice('Serie zu Ende');
    }
    if (session) applyOutputs();
    else {
      applyRestore();
      if (holdPauseUntil && now() < holdPauseUntil && video && !video.paused) {
        if (userJustActed()) holdPauseUntil = 0;
        else { try { video.pause(); } catch { /* ignorieren */ } }
      }
    }
    runSkips();
    panel.update();
  }

  const INTERACTION_EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'];
  for (const t of INTERACTION_EVENTS) win.addEventListener(t, onInteraction, { capture: true, passive: t !== 'keydown' });
  doc.addEventListener('volumechange', onVolumeChange, true);
  doc.addEventListener('play', onPlay, true);
  const timer = setInterval(loop, POLL_MS);
  loop();

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
      for (const t of INTERACTION_EVENTS) win.removeEventListener(t, onInteraction, { capture: true });
      doc.removeEventListener('volumechange', onVolumeChange, true);
      doc.removeEventListener('play', onPlay, true);
      teardownPage();
    },
    // für Tests / Entwicklung
    get session() { return session; },
    get video() { return video; },
    settings,
    toggleSleep,
  };
}
