// ==UserScript==
// @name         Schlummer
// @namespace    https://github.com/konradwohlthat-gif/schlummer
// @version      1.0.0
// @description  Einschlafhilfe für Netflix und Disney+: Bild und Ton werden über eine einstellbare Anzahl Folgen langsam ausgeblendet, Intro und Abspann werden übersprungen.
// @author       Konrad Wohlthat
// @license      MIT
// @match        https://www.netflix.com/*
// @match        https://www.disneyplus.com/*
// @grant        GM.getValue
// @grant        GM.setValue
// @run-at       document-idle
// @noframes
// @homepageURL  https://github.com/konradwohlthat-gif/schlummer
// @supportURL   https://github.com/konradwohlthat-gif/schlummer/issues
// @updateURL    https://raw.githubusercontent.com/konradwohlthat-gif/schlummer/main/dist/schlummer.user.js
// @downloadURL  https://raw.githubusercontent.com/konradwohlthat-gif/schlummer/main/dist/schlummer.user.js
// ==/UserScript==
(() => {
  // src/adapters/util.js
  function visibleQuery(sel, root = document) {
    const el = root.querySelector(sel);
    return el && el.isConnected && el.getClientRects().length > 0 ? el : null;
  }
  function fullscreenRoot(doc = document) {
    return doc.fullscreenElement || doc.webkitFullscreenElement || doc.body;
  }

  // src/adapters/netflix.js
  var netflix = {
    id: "netflix",
    name: "Netflix",
    accent: "#e50914",
    matches: (loc) => /(^|\.)netflix\.com$/i.test(loc.hostname),
    isPlayerPage: () => /^\/watch\//.test(location.pathname),
    episodeId: () => (location.pathname.match(/^\/watch\/(\d+)/) || [])[1] || null,
    getVideo: () => document.querySelector("video"),
    // Nur stabile data-uia-Selektoren. Kein Text-Fallback: Der normale
    // "Nächste Folge"-Knopf in der Steuerleiste (control-next) trägt denselben
    // Text und darf nie automatisch geklickt werden.
    findSkipIntro: () => visibleQuery('[data-uia="player-skip-intro"]'),
    findSkipRecap: () => visibleQuery('[data-uia="player-skip-recap"]') || visibleQuery('[data-uia="player-skip-preplay"]'),
    findNextEpisode: () => visibleQuery('[data-uia="next-episode-seamless-button"]') || visibleQuery('[data-uia="next-episode-seamless-button-draining"]'),
    findStillWatching: () => visibleQuery('[data-uia="interrupt-autoplay-continue"]') || null,
    // Serienende: Netflix zeigt eine Empfehlung mit Trailer unter derselben URL
    isSeriesEnd: () => !!document.querySelector('[data-uia="postplay-back-to-browse"], [data-uia="postplay-background-play-trailer"]'),
    fullscreenRoot: () => fullscreenRoot(document)
  };

  // src/adapters/disney.js
  var WAKE_EVERY_MS = 4e3;
  var lastWake = 0;
  var durationCache = /* @__PURE__ */ new Map();
  var pos = { key: null, offset: 0, lastRel: null, synced: false };
  function shadowRoots(tag) {
    const host = document.querySelector(tag);
    const root = host && host.shadowRoot;
    if (!root) return [];
    const roots = [root];
    for (const el of root.querySelectorAll("*")) if (el.shadowRoot) roots.push(el.shadowRoot);
    return roots;
  }
  function visible(el) {
    return !!el && el.getClientRects().length > 0;
  }
  function shadowButton(tag, { skipClose = true } = {}) {
    for (const r of shadowRoots(tag)) {
      for (const b of r.querySelectorAll("button")) {
        if (!visible(b)) continue;
        if (skipClose && /schlie\u00dfen|close/i.test((b.getAttribute("aria-label") || "") + " " + (b.textContent || ""))) continue;
        return b;
      }
    }
    return null;
  }
  function readSlider() {
    for (const r of shadowRoots("main-app-controls-overlay")) {
      const s = r.querySelector("[aria-valuemax]");
      if (!s) continue;
      const max = Number(s.getAttribute("aria-valuemax"));
      const now2 = Number(s.getAttribute("aria-valuenow"));
      if (Number.isFinite(max) && max > 60) return { max, now: Number.isFinite(now2) ? now2 : null };
    }
    return null;
  }
  function wakeControls() {
    const t = Date.now();
    if (t - lastWake < WAKE_EVERY_MS) return;
    lastWake = t;
    const target = document.querySelector("pointer-actions") || document.querySelector("disney-web-player-ui") || document.body;
    try {
      target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, composed: true, clientX: 10, clientY: 10 }));
    } catch {
    }
  }
  var disney = {
    id: "disney",
    name: "Disney+",
    accent: "#0072d2",
    matches: (loc) => /(^|\.)disneyplus\.com$/i.test(loc.hostname),
    isPlayerPage: () => /\/(video|play)\//.test(location.pathname),
    episodeId: () => (location.pathname.match(/\/(?:video|play)\/([^/?#]+)/) || [])[1] || null,
    getVideo: () => {
      const vids = [...document.querySelectorAll("video")];
      return vids.find((v) => /^hivePlayer\d+$/.test(v.id) || v.classList.contains("hive-video")) || vids.find((v) => v.readyState > 0) || vids[0] || null;
    },
    getDuration: (video) => {
      if (video && Number.isFinite(video.duration) && video.duration > 0) return video.duration;
      const key = disney.episodeId();
      const slider = readSlider();
      if (slider) {
        if (key) durationCache.set(key, slider.max);
        return slider.max;
      }
      if (key && durationCache.has(key)) return durationCache.get(key);
      wakeControls();
      return NaN;
    },
    getPosition: (video) => {
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
      if (pos.lastRel !== null && rel < pos.lastRel - 2) pos.synced = false;
      pos.lastRel = rel;
      if (!pos.synced) wakeControls();
      return Math.max(0, rel + pos.offset);
    },
    findSkipIntro: () => shadowButton("skip-overlay"),
    findSkipRecap: () => null,
    findNextEpisode: () => {
      for (const r of shadowRoots("end-card-overlay")) {
        const tile = r.querySelector("button.end-card-overlay__content-tile");
        if (visible(tile)) return tile;
      }
      return shadowButton("up-next-lite-v1");
    },
    findStillWatching: () => shadowButton("inactivity-overlay"),
    isSeriesEnd: () => false,
    fullscreenRoot: () => fullscreenRoot(document)
  };

  // src/adapters/index.js
  var adapters = [netflix, disney];
  function pickAdapter(loc = location) {
    return adapters.find((a) => a.matches(loc)) || null;
  }

  // src/settings.js
  var DEFAULTS = Object.freeze({
    episodes: 1,
    // 1..10
    skipIntro: true,
    skipCredits: true,
    volumeCurve: "perceptual",
    // 'perceptual' | 'linear'
    minVolume: 0,
    // 0..0.5 (absolut)
    startDelayMin: 0,
    // 0..60 Minuten
    blueLight: 0
    // 0..1
  });
  var KEY = "schlummer.settings";
  var clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  var num = (x, fallback) => typeof x === "number" && Number.isFinite(x) ? x : fallback;
  function hasGM() {
    try {
      return typeof GM !== "undefined" && GM && typeof GM.getValue === "function" && typeof GM.setValue === "function";
    } catch {
      return false;
    }
  }
  function sanitize(s) {
    const o = { ...DEFAULTS, ...s || {} };
    return {
      episodes: clamp(Math.round(num(o.episodes, 1)), 1, 10),
      skipIntro: !!o.skipIntro,
      skipCredits: !!o.skipCredits,
      volumeCurve: o.volumeCurve === "linear" ? "linear" : "perceptual",
      minVolume: clamp(num(o.minVolume, 0), 0, 0.5),
      startDelayMin: clamp(Math.round(num(o.startDelayMin, 0)), 0, 60),
      blueLight: clamp(num(o.blueLight, 0), 0, 1)
    };
  }
  async function loadSettings() {
    let raw = null;
    try {
      raw = hasGM() ? await GM.getValue(KEY, null) : localStorage.getItem(KEY);
    } catch {
      raw = null;
    }
    let parsed = {};
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      parsed = {};
    }
    return sanitize(parsed);
  }
  async function saveSettings(s) {
    const raw = JSON.stringify(sanitize(s));
    try {
      if (hasGM()) await GM.setValue(KEY, raw);
      else localStorage.setItem(KEY, raw);
    } catch {
    }
  }

  // src/overlay.js
  var Z = 2147483e3;
  var clamp2 = (x) => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));
  function layer(doc, bg, extra) {
    const el = doc.createElement("div");
    el.className = "schlummer-layer";
    Object.assign(el.style, {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      pointerEvents: "none",
      zIndex: String(Z),
      opacity: "0",
      background: bg,
      willChange: "opacity",
      ...extra
    });
    return el;
  }
  function createOverlay(doc = document) {
    const warm = layer(doc, "rgb(255, 147, 41)", { mixBlendMode: "multiply", transition: "opacity 2s linear" });
    const dark = layer(doc, "#000", { transition: "opacity 0.5s linear", zIndex: String(Z + 1) });
    let root = null;
    return {
      mount(el) {
        if (!el) return;
        if (root === el && warm.parentNode === el && dark.parentNode === el) return;
        root = el;
        el.appendChild(warm);
        el.appendChild(dark);
      },
      unmount() {
        warm.remove();
        dark.remove();
        root = null;
      },
      setDim(p) {
        const v = String(clamp2(p));
        if (dark.style.opacity !== v) dark.style.opacity = v;
      },
      setWarm(a) {
        const v = String(clamp2(a));
        if (warm.style.opacity !== v) warm.style.opacity = v;
      },
      get root() {
        return root;
      }
    };
  }

  // src/panel.js
  var HIDE_AFTER_MS = 1e4;
  var TOAST_MS = 3e3;
  var CSS = `
.schlummer-panel{position:fixed;top:72px;right:24px;z-index:2147483100;width:300px;box-sizing:border-box;
  background:rgba(18,18,18,.94);color:#fff;font:14px/1.4 -apple-system,"Helvetica Neue",Helvetica,Arial,sans-serif;
  border-radius:12px;padding:14px 16px;box-shadow:0 8px 32px rgba(0,0,0,.55);opacity:0;pointer-events:none;
  transition:opacity .25s;user-select:none;-webkit-user-select:none;text-align:left}
.schlummer-panel *{box-sizing:border-box}
.schlummer-panel.is-visible{opacity:1;pointer-events:auto}
.schlummer-title{display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:15px;margin-bottom:4px}
.schlummer-title small{font-weight:400;color:#888;font-size:11px}
.schlummer-row{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:32px}
.schlummer-row label{flex:1;cursor:pointer}
.schlummer-status{font-size:12px;color:#bbb;margin:0 0 4px;min-height:16px}
.schlummer-status.is-active{color:var(--schlummer-accent)}
.schlummer-switch{appearance:none;-webkit-appearance:none;width:38px;height:22px;border-radius:11px;background:#555;
  position:relative;cursor:pointer;margin:0;flex:none;transition:background .2s;outline:none}
.schlummer-switch::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .2s}
.schlummer-switch:checked{background:var(--schlummer-accent)}
.schlummer-switch:checked::after{transform:translateX(16px)}
.schlummer-stepper{display:flex;align-items:center;gap:6px;flex:none}
.schlummer-stepper button{width:28px;height:28px;border-radius:50%;border:0;background:#3a3a3a;color:#fff;font-size:18px;line-height:1;cursor:pointer;padding:0}
.schlummer-stepper button:hover{background:#4a4a4a}
.schlummer-stepper output{min-width:22px;text-align:center;font-weight:700}
.schlummer-more{margin-top:8px;border-top:1px solid #333;padding-top:6px}
.schlummer-more summary{cursor:pointer;color:#bbb;font-size:13px;list-style:none;padding:4px 0}
.schlummer-more summary::-webkit-details-marker{display:none}
.schlummer-more summary::after{content:" ▾";color:#777}
.schlummer-more[open] summary::after{content:" ▴"}
.schlummer-range{width:110px;accent-color:var(--schlummer-accent);margin:0;flex:none}
.schlummer-val{min-width:52px;text-align:right;color:#bbb;font-size:12px;flex:none}
.schlummer-seg{display:flex;gap:0;flex:none;border:1px solid #444;border-radius:6px;overflow:hidden}
.schlummer-seg button{border:0;background:transparent;color:#bbb;font-size:12px;padding:4px 9px;cursor:pointer}
.schlummer-seg button.is-on{background:var(--schlummer-accent);color:#fff}
.schlummer-btn{background:#3a3a3a;color:#fff;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:12px;margin-top:6px}
.schlummer-btn:hover{background:#4a4a4a}
.schlummer-hint{font-size:11px;color:#777;margin-top:8px}
.schlummer-notice{font-size:12px;color:#fff;background:var(--schlummer-accent);border-radius:6px;padding:4px 8px;margin:4px 0}
.schlummer-toast{position:fixed;top:72px;right:24px;z-index:2147483099;background:rgba(18,18,18,.94);color:#fff;
  font:13px/1.3 -apple-system,"Helvetica Neue",Helvetica,Arial,sans-serif;border-radius:8px;padding:8px 12px;
  box-shadow:0 8px 32px rgba(0,0,0,.55);opacity:0;pointer-events:none;transition:opacity .25s;border-left:3px solid var(--schlummer-accent)}
.schlummer-toast.is-visible{opacity:1}
`;
  function installStyles(doc) {
    if (doc.__schlummerStyles) return;
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
    } catch {
      const st = doc.createElement("style");
      st.textContent = CSS;
      (doc.head || doc.documentElement).appendChild(st);
    }
    doc.__schlummerStyles = true;
  }
  function h(doc, tag, props = {}, children = []) {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v !== false && v !== null && v !== void 0) el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of children) if (c) el.appendChild(typeof c === "string" ? doc.createTextNode(c) : c);
    return el;
  }
  var STOP_EVENTS = ["mousedown", "mouseup", "click", "dblclick", "pointerdown", "pointerup", "keydown", "keyup", "keypress", "wheel", "touchstart", "touchend", "contextmenu"];
  function createPanel({ settings, onSettingChange, onSleepToggle, getStatus, accent = "#e50914", doc = document }) {
    installStyles(doc);
    let root = null;
    let hideTimer = null;
    let hovered = false;
    let noticeTimer = null;
    let toastTimer = null;
    const toast = h(doc, "div", { class: "schlummer-toast", role: "status" });
    const sleepSwitch = h(doc, "input", { type: "checkbox", class: "schlummer-switch", id: "schlummer-sleep", onchange: () => onSleepToggle() });
    const introSwitch = h(doc, "input", { type: "checkbox", class: "schlummer-switch", id: "schlummer-intro", onchange: (e) => onSettingChange("skipIntro", e.target.checked) });
    const creditsSwitch = h(doc, "input", { type: "checkbox", class: "schlummer-switch", id: "schlummer-credits", onchange: (e) => onSettingChange("skipCredits", e.target.checked) });
    const epOut = h(doc, "output", { text: String(settings.episodes) });
    const status = h(doc, "div", { class: "schlummer-status", text: "Aus" });
    const notice = h(doc, "div", { class: "schlummer-notice", style: "display:none" });
    const stepper = h(doc, "div", { class: "schlummer-stepper" }, [
      h(doc, "button", { type: "button", text: "−", "aria-label": "Weniger Folgen", onclick: () => onSettingChange("episodes", settings.episodes - 1) }),
      epOut,
      h(doc, "button", { type: "button", text: "+", "aria-label": "Mehr Folgen", onclick: () => onSettingChange("episodes", settings.episodes + 1) })
    ]);
    const curveSeg = h(doc, "div", { class: "schlummer-seg" }, [
      h(doc, "button", { type: "button", text: "Gehör", "data-curve": "perceptual", onclick: () => onSettingChange("volumeCurve", "perceptual") }),
      h(doc, "button", { type: "button", text: "Linear", "data-curve": "linear", onclick: () => onSettingChange("volumeCurve", "linear") })
    ]);
    function rangeRow(label, key, min, max, step, toSetting, fromSetting, fmt) {
      const val = h(doc, "span", { class: "schlummer-val" });
      const input = h(doc, "input", {
        type: "range",
        class: "schlummer-range",
        min,
        max,
        step,
        oninput: (e) => onSettingChange(key, toSetting(Number(e.target.value)))
      });
      const row = h(doc, "div", { class: "schlummer-row" }, [h(doc, "label", { text: label }), input, val]);
      return { row, update() {
        const v = fromSetting(settings[key]);
        if (doc.activeElement !== input) input.value = String(v);
        val.textContent = fmt(settings[key]);
      } };
    }
    const minVol = rangeRow("Mindestlautstärke", "minVolume", 0, 50, 1, (x) => x / 100, (s) => Math.round(s * 100), (s) => `${Math.round(s * 100)} %`);
    const delay = rangeRow("Startverzögerung", "startDelayMin", 0, 60, 1, (x) => x, (s) => s, (s) => `${s} min`);
    const blue = rangeRow("Blaulichtfilter", "blueLight", 0, 100, 1, (x) => x / 100, (s) => Math.round(s * 100), (s) => s > 0 ? `${Math.round(s * 100)} %` : "aus");
    const el = h(doc, "div", { class: "schlummer-panel", role: "group", "aria-label": "Schlummer" }, [
      h(doc, "div", { class: "schlummer-title" }, [h(doc, "span", { text: "Schlummer" }), h(doc, "small", { text: "Taste Z" })]),
      h(doc, "div", { class: "schlummer-row" }, [h(doc, "label", { for: "schlummer-sleep", text: "Schlafmodus" }), stepper, sleepSwitch]),
      status,
      notice,
      h(doc, "div", { class: "schlummer-row" }, [h(doc, "label", { for: "schlummer-intro", text: "Intro überspringen" }), introSwitch]),
      h(doc, "div", { class: "schlummer-row" }, [h(doc, "label", { for: "schlummer-credits", text: "Abspann überspringen" }), creditsSwitch]),
      h(doc, "details", { class: "schlummer-more" }, [
        h(doc, "summary", { text: "Mehr" }),
        h(doc, "div", { class: "schlummer-row" }, [h(doc, "label", { text: "Lautstärkekurve" }), curveSeg]),
        minVol.row,
        delay.row,
        blue.row,
        h(doc, "button", { type: "button", class: "schlummer-btn", text: "Standardwerte", onclick: () => {
          for (const [k, v] of Object.entries(DEFAULTS)) onSettingChange(k, v);
        } })
      ]),
      h(doc, "div", { class: "schlummer-hint", text: "Folgen = Anzahl der Folgen, bis Bild und Ton ganz weg sind. Taste Z öffnet und schließt dieses Panel." })
    ]);
    el.style.setProperty("--schlummer-accent", accent);
    toast.style.setProperty("--schlummer-accent", accent);
    for (const t of STOP_EVENTS) el.addEventListener(t, (e) => e.stopPropagation());
    el.addEventListener("mouseenter", () => {
      hovered = true;
      clearTimeout(hideTimer);
    });
    el.addEventListener("mouseleave", () => {
      hovered = false;
      scheduleHide();
    });
    function scheduleHide() {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (!hovered) el.classList.remove("is-visible");
      }, HIDE_AFTER_MS);
    }
    function update() {
      const st = getStatus();
      sleepSwitch.checked = st.active;
      status.textContent = st.text;
      status.classList.toggle("is-active", st.active);
      introSwitch.checked = settings.skipIntro;
      creditsSwitch.checked = settings.skipCredits;
      epOut.textContent = String(settings.episodes);
      for (const b of curveSeg.children) b.classList.toggle("is-on", b.dataset.curve === settings.volumeCurve);
      minVol.update();
      delay.update();
      blue.update();
    }
    return {
      el,
      mount(r) {
        if (!r) return;
        if (root === r && el.parentNode === r && toast.parentNode === r) return;
        root = r;
        r.appendChild(el);
        r.appendChild(toast);
      },
      unmount() {
        el.remove();
        toast.remove();
        root = null;
        el.classList.remove("is-visible");
      },
      show() {
        el.classList.add("is-visible");
        scheduleHide();
      },
      hide() {
        clearTimeout(hideTimer);
        el.classList.remove("is-visible");
      },
      toggle() {
        if (el.classList.contains("is-visible")) this.hide();
        else this.show();
      },
      isVisible() {
        return el.classList.contains("is-visible");
      },
      isInside(node) {
        return !!(node && node instanceof Node && el.contains(node));
      },
      /** Kurze Meldung: im offenen Panel als Zeile, sonst als kleine Einblendung. */
      notice(text, ms = TOAST_MS) {
        if (this.isVisible()) {
          notice.textContent = text;
          notice.style.display = "";
          clearTimeout(noticeTimer);
          noticeTimer = setTimeout(() => {
            notice.style.display = "none";
          }, ms);
          scheduleHide();
          return;
        }
        toast.textContent = text;
        toast.classList.add("is-visible");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove("is-visible"), ms);
      },
      update
    };
  }

  // src/model.js
  var PERCEPTUAL_EXPONENT = 1 / 0.6;
  var FINISHED_FRACTION = 0.8;
  var EXTEND_THRESHOLD = 0.4;
  var MIN_DIM_SECONDS = 300;
  var MAX_EXTEND_EPISODES = 10;
  var clamp3 = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  function remaining(plan, v) {
    const rest = Math.max(0, (v.duration || 0) - (v.currentTime || 0));
    return rest + Math.max(0, plan.budget - 1) * plan.len;
  }
  function createPlan({ episodes, duration, currentTime, startDelaySec = 0 }) {
    const plan = {
      budget: clamp3(Math.round(episodes) || 1, 1, 99),
      len: duration,
      anchor: null,
      rate0: 0,
      // ursprüngliche Dimm-Rate (Fortschritt pro Sekunde), gesetzt beim ersten Anker
      delayLeft: 0,
      lastTime: currentTime,
      maxSeen: currentTime,
      done: false
    };
    const R = remaining(plan, { duration, currentTime });
    plan.delayLeft = clamp3(startDelaySec, 0, Math.max(0, R - MIN_DIM_SECONDS));
    if (plan.delayLeft <= 0) setFirstAnchor(plan, R);
    return plan;
  }
  function setFirstAnchor(plan, R) {
    plan.anchor = { p: 0, R };
    plan.rate0 = R > 0 ? 1 / R : Infinity;
  }
  function progress(plan, v) {
    if (plan.done) return 1;
    if (!plan.anchor) return 0;
    if (plan.anchor.R <= 0) return 1;
    const R = remaining(plan, v);
    return clamp3(plan.anchor.p + (1 - plan.anchor.p) * (1 - R / plan.anchor.R), 0, 1);
  }
  function tick(plan, v) {
    const next = { ...plan, lastTime: v.currentTime, maxSeen: Math.max(plan.maxSeen, v.currentTime) };
    if (next.done) return next;
    const dt = v.currentTime - plan.lastTime;
    if (!next.anchor) {
      if (dt > 0 && dt < 5) next.delayLeft = Math.max(0, next.delayLeft - dt);
      if (next.delayLeft <= 0) setFirstAnchor(next, remaining(next, v));
    }
    const atEnd = v.ended || v.duration > 0 && v.currentTime >= v.duration - 0.5;
    if (next.budget <= 1 && atEnd) {
      next.budget = 0;
      next.done = true;
    }
    return next;
  }
  function episodeChanged(plan, prev, next) {
    if (plan.done) return { ...plan, lastTime: next.currentTime, maxSeen: next.currentTime };
    const maxSeen = Math.max(plan.maxSeen, prev.currentTime || 0);
    const finished = !!prev.ended || prev.duration > 0 && maxSeen >= FINISHED_FRACTION * prev.duration;
    const pBefore = progress(plan, prev);
    const out = { ...plan, len: next.duration, lastTime: next.currentTime, maxSeen: next.currentTime };
    if (finished) {
      out.budget = plan.budget - 1;
      if (out.budget <= 0) {
        out.budget = 0;
        out.done = true;
      }
      return out;
    }
    if (out.anchor) out.anchor = { p: pBefore, R: remaining(out, next) };
    return out;
  }
  function interact(plan, v, threshold = EXTEND_THRESHOLD) {
    if (plan.done || !plan.anchor) return { plan, added: 0 };
    const p = progress(plan, v);
    if (p <= threshold) return { plan, added: 0 };
    const needed = plan.rate0 > 0 ? (1 - threshold) / plan.rate0 : 0;
    const out = { ...plan };
    let added = 0;
    while (remaining(out, v) < needed && added < MAX_EXTEND_EPISODES) {
      out.budget += 1;
      added += 1;
    }
    out.anchor = { p: threshold, R: remaining(out, v) };
    return { plan: out, added };
  }
  function finish(plan) {
    return { ...plan, budget: 0, done: true };
  }
  function currentFinished(plan) {
    return plan.len > 0 && plan.maxSeen >= FINISHED_FRACTION * plan.len;
  }
  function curveValue(curve, x) {
    const c = clamp3(x, 0, 1);
    return curve === "linear" ? c : Math.pow(c, PERCEPTUAL_EXPONENT);
  }
  function volumeFor({ base, min = 0, curve = "perceptual" }, p) {
    const m = Math.min(min, base);
    return clamp3(m + (base - m) * curveValue(curve, 1 - p), 0, 1);
  }
  function rebase({ observed, min = 0, curve = "perceptual" }, p) {
    const k = curveValue(curve, 1 - p);
    if (k < 0.01) return null;
    if (observed <= min) return clamp3(observed, 0, 1);
    return clamp3((observed - min * (1 - k)) / k, 0, 1);
  }

  // src/session.js
  function createSession({ settings, video, baseVolume }) {
    let plan = createPlan({
      episodes: settings.episodes,
      duration: video.duration,
      currentTime: video.currentTime,
      startDelaySec: settings.startDelayMin * 60
    });
    let finishedCount = 0;
    let base = baseVolume;
    return {
      get plan() {
        return plan;
      },
      get base() {
        return base;
      },
      set base(v) {
        base = v;
      },
      get done() {
        return plan.done;
      },
      get finishedCount() {
        return finishedCount;
      },
      get totalPlanned() {
        return finishedCount + plan.budget;
      },
      tick(v) {
        plan = tick(plan, v);
      },
      episodeChanged(prev, next) {
        const before = plan.budget;
        plan = episodeChanged(plan, prev, next);
        if (plan.budget < before) finishedCount += 1;
      },
      /** Serienende: beenden, aktuelle Folge zählen, wenn zu Ende gesehen. */
      finish() {
        if (plan.done) return;
        if (currentFinished(plan)) finishedCount += 1;
        plan = finish(plan);
      },
      /** Folgenanzahl im laufenden Modus ändern: Budget anpassen, Linie am aktuellen Stand neu verankern. */
      adjustBudget(delta, v) {
        if (plan.done) return;
        const budget = Math.max(1, plan.budget + delta);
        if (budget === plan.budget) return;
        const p = progress(plan, v);
        plan = { ...plan, budget };
        if (plan.anchor) plan.anchor = { p, R: remaining(plan, v) };
      },
      /** @returns {{added:number, changed:boolean}} */
      interact(v) {
        const r = interact(plan, v);
        const changed = r.plan !== plan;
        plan = r.plan;
        return { added: r.added, changed };
      },
      progress(v) {
        return progress(plan, v);
      },
      volume(v, s) {
        return volumeFor({ base, min: s.minVolume, curve: s.volumeCurve }, this.progress(v));
      },
      rebase(observed, v, s) {
        const b = rebase({ observed, min: s.minVolume, curve: s.volumeCurve }, this.progress(v));
        if (b !== null) base = b;
        return b;
      }
    };
  }

  // src/controller.js
  var POLL_MS = 250;
  var INTERACT_COOLDOWN_MS = 1e4;
  var WAKE_GRACE_MS = 2e3;
  var WAKE_MOVE_PX = 12;
  var MOVE_MIN_PX = 3;
  var OFFPAGE_GRACE_MS = 6e3;
  var USER_VOLUME_WINDOW_MS = 1500;
  var CLICK_REPEAT_MS = 1500;
  var RESTORE_MS = 6e3;
  var HOLD_PAUSE_MS = 3e4;
  var USER_PLAY_WINDOW_MS = 1500;
  var SWITCH_TIMEOUT_MS = 4e3;
  var now = () => Date.now();
  function startController({ adapter, settings, doc = document, win = window }) {
    const overlay = createOverlay(doc);
    const panel = createPanel({ settings, onSettingChange, onSleepToggle: toggleSleep, getStatus, accent: adapter.accent, doc });
    let video = null;
    let episodeKey = null;
    let lastStats = null;
    let endedFlag = false;
    let pendingSwitch = null;
    let session = null;
    let lastApplied = null;
    let lastUserInputAt = 0;
    let lastExtendAt = 0;
    let doneAt = 0;
    let doneMoved = 0;
    let lastMouse = null;
    let mounted = false;
    let stopped = false;
    let nextClickedKey = null;
    let restore = null;
    let holdPauseUntil = 0;
    let offPageSince = 0;
    const log = [];
    function note(reason, extra) {
      log.push({ t: (/* @__PURE__ */ new Date()).toISOString().slice(11, 19), reason, path: location.pathname, ...extra || {} });
      if (log.length > 60) log.shift();
    }
    const clickedAt = /* @__PURE__ */ new WeakMap();
    const durationOf = (v) => adapter.getDuration ? adapter.getDuration(v) : v.duration;
    const positionOf = (v) => adapter.getPosition ? adapter.getPosition(v) : v.currentTime || 0;
    const hasMeta = (v) => {
      if (!v) return false;
      const d = durationOf(v);
      return Number.isFinite(d) && d > 0;
    };
    const stats = (v) => ({ duration: hasMeta(v) ? durationOf(v) : 0, currentTime: positionOf(v), ended: !!(v.ended || endedFlag) });
    const visible2 = (el) => !!el && el.isConnected && el.getClientRects().length > 0;
    function clickOnce(el) {
      if (!visible2(el)) return false;
      const t = clickedAt.get(el) || 0;
      if (now() - t < CLICK_REPEAT_MS) return false;
      clickedAt.set(el, now());
      try {
        el.click();
      } catch {
      }
      return true;
    }
    function setVolume(v, target) {
      if (!v) return;
      if (Math.abs(v.volume - target) > 2e-3) {
        lastApplied = target;
        v.volume = target;
      } else {
        lastApplied = v.volume;
      }
    }
    function onSettingChange(key, value) {
      const next = sanitize({ ...settings, [key]: value });
      const delta = next.episodes - settings.episodes;
      Object.assign(settings, next);
      saveSettings(settings);
      if (key === "episodes" && delta !== 0 && session && !session.done && video && hasMeta(video)) {
        session.adjustBudget(delta, stats(video));
      }
      if (session && !session.done) applyOutputs();
      if (!session) overlay.setWarm(0);
      panel.update();
    }
    function getStatus() {
      if (!session) return { active: false, text: "Aus" };
      if (session.done) return { active: true, text: "Beendet. Maus bewegen oder Taste drücken zum Aufwachen." };
      const plan = session.plan;
      if (!plan.anchor) return { active: true, text: `Startet in ${Math.max(1, Math.ceil(plan.delayLeft / 60))} min` };
      const vs = video && hasMeta(video) ? stats(video) : null;
      const p = vs ? session.progress(vs) : 0;
      const idx = session.finishedCount + 1;
      const paused = video && video.paused ? " · pausiert" : "";
      return { active: true, text: `Folge ${idx} von ${session.totalPlanned} · ${Math.round(p * 100)} %${paused}` };
    }
    function startSleep(attempt = 0) {
      if (!video || !hasMeta(video)) {
        if (attempt < 4) {
          setTimeout(() => {
            if (!session) startSleep(attempt + 1);
          }, 400);
          return;
        }
        panel.notice("Kein laufendes Video gefunden");
        return;
      }
      session = createSession({ settings, video: stats(video), baseVolume: video.volume });
      lastExtendAt = 0;
      endedFlag = !!video.ended;
      applyOutputs();
      panel.update();
    }
    function exitSleep(reason = "unbekannt") {
      if (!session) return;
      const base = session.base;
      const wasDone = session.done;
      note("exit", { reason, wasDone });
      session = null;
      holdPauseUntil = wasDone ? now() + HOLD_PAUSE_MS : 0;
      overlay.setDim(0);
      overlay.setWarm(0);
      restore = { until: now() + RESTORE_MS, base };
      applyRestore();
      panel.update();
    }
    function applyRestore() {
      if (!restore) return;
      if (now() > restore.until) {
        restore = null;
        return;
      }
      const v = adapter.getVideo();
      if (!v) return;
      if (Math.abs(v.volume - restore.base) > 0.01) v.volume = restore.base;
    }
    function toggleSleep() {
      if (session) exitSleep("schalter");
      else startSleep();
    }
    function enterDone() {
      doneAt = now();
      doneMoved = 0;
      note("done");
      if (video) {
        try {
          video.pause();
        } catch {
        }
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
        if (!doneAt) enterDone();
        if (!video.paused) {
          try {
            video.pause();
          } catch {
          }
        }
        if (!video.muted) setVolume(video, session.volume(vs, settings));
        return;
      }
      doneAt = 0;
      if (!video.muted) setVolume(video, session.volume(vs, settings));
    }
    function onVideoChange(v, key) {
      if (session && !session.done && lastStats && key !== episodeKey) {
        if (!pendingSwitch) {
          pendingSwitch = { prev: { ...lastStats }, oldVideo: video, at: now() };
          note("folgenwechsel", { from: episodeKey, to: key });
        }
      }
      if (v !== video) {
        video = v;
        lastApplied = null;
        if (v) {
          v.addEventListener("ended", onEnded);
          if (session) applyOutputs();
        }
      }
      if (key !== episodeKey) {
        episodeKey = key;
        lastStats = null;
        endedFlag = false;
      }
    }
    function switchReady(ps) {
      if (!video || !hasMeta(video)) return false;
      if (video !== ps.oldVideo) return true;
      if (Math.abs(durationOf(video) - ps.prev.duration) > 1) return true;
      if (positionOf(video) < ps.prev.currentTime - 5) return true;
      return now() - ps.at > SWITCH_TIMEOUT_MS;
    }
    function onEnded(e) {
      if (e.target === video) endedFlag = true;
    }
    function runSkips() {
      if (settings.skipIntro) {
        clickOnce(adapter.findSkipIntro());
        clickOnce(adapter.findSkipRecap());
      }
      const sleeping = !!session && !session.done;
      const lastEpisode = sleeping && session.plan.budget <= 1;
      const finished = !!session && session.done;
      if (!lastEpisode && !finished && nextClickedKey !== episodeKey) {
        const wantNext = settings.skipCredits || sleeping && video && (video.ended || endedFlag);
        if (wantNext && clickOnce(adapter.findNextEpisode())) nextClickedKey = episodeKey;
      }
      if (sleeping) clickOnce(adapter.findStillWatching());
    }
    function onInteraction(e) {
      if (e.isTrusted === false) return;
      const t = now();
      if (e.type === "mousedown" || e.type === "keydown" || e.type === "wheel" || e.type === "touchstart") lastUserInputAt = t;
      if (e.type === "mousemove") {
        const dist = lastMouse ? Math.hypot(e.clientX - lastMouse.x, e.clientY - lastMouse.y) : 0;
        lastMouse = { x: e.clientX, y: e.clientY };
        if (dist < MOVE_MIN_PX) return;
        doneMoved += dist;
      }
      if (!mounted) return;
      if (e.type === "keydown" && isZ(e)) {
        e.stopPropagation();
        e.preventDefault();
        panel.toggle();
        panel.update();
        return;
      }
      if (e.type === "mousedown" && panel.isVisible() && !panel.isInside(e.target)) panel.hide();
      if (!session) return;
      if (panel.isInside(e.target)) return;
      if (session.done) {
        if (t - doneAt > WAKE_GRACE_MS && (e.type !== "mousemove" || doneMoved > WAKE_MOVE_PX)) exitSleep("aufwachen:" + e.type);
        return;
      }
      if (t - lastExtendAt < INTERACT_COOLDOWN_MS) return;
      if (video && hasMeta(video)) {
        const r = session.interact(stats(video));
        if (r.changed) {
          lastExtendAt = t;
          note("verlaengert", { added: r.added, via: e.type });
          if (r.added > 0) panel.notice(r.added === 1 ? "+1 Folge nachgelegt" : `+${r.added} Folgen nachgelegt`);
          applyOutputs();
          panel.update();
        }
      }
    }
    function isZ(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return false;
      if (!/^[zZ]$/.test(e.key || "")) return false;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return false;
      return true;
    }
    function onVolumeChange(e) {
      const v = e.target;
      if (!session || session.done || v !== video || !(v instanceof HTMLMediaElement)) return;
      if (v.muted) return;
      if (lastApplied !== null && Math.abs(v.volume - lastApplied) < 2e-3) return;
      if (now() - lastUserInputAt < USER_VOLUME_WINDOW_MS && hasMeta(v)) {
        session.rebase(v.volume, stats(v), settings);
        lastApplied = v.volume;
      } else {
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
        try {
          v.pause();
        } catch {
        }
        return;
      }
      if (!session && now() < holdPauseUntil) {
        if (userJustActed()) holdPauseUntil = 0;
        else {
          try {
            v.pause();
          } catch {
          }
        }
      }
    }
    function mountPage() {
      mounted = true;
    }
    function teardownPage() {
      note("teardown");
      if (session) exitSleep("seite verlassen");
      panel.unmount();
      overlay.unmount();
      if (video) video.removeEventListener("ended", onEnded);
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
        console.warn("[Schlummer]", err);
      }
    }
    function step() {
      if (!adapter.isPlayerPage()) {
        if (mounted) {
          if (session && !offPageSince) {
            offPageSince = now();
            note("player-url verlassen");
          }
          if (!session || now() - offPageSince > OFFPAGE_GRACE_MS) teardownPage();
        }
        return;
      }
      offPageSince = 0;
      if (!mounted) mountPage();
      const root = adapter.fullscreenRoot();
      overlay.mount(root);
      panel.mount(root);
      const v = adapter.getVideo();
      const key = adapter.episodeId() || (v ? "el" : null);
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
        note("serienende");
        session.finish();
        pendingSwitch = null;
        panel.notice("Serie zu Ende");
      }
      if (session) applyOutputs();
      else {
        applyRestore();
        if (holdPauseUntil && now() < holdPauseUntil && video && !video.paused) {
          if (userJustActed()) holdPauseUntil = 0;
          else {
            try {
              video.pause();
            } catch {
            }
          }
        }
      }
      runSkips();
      panel.update();
    }
    const INTERACTION_EVENTS = ["mousemove", "mousedown", "keydown", "wheel", "touchstart"];
    for (const t of INTERACTION_EVENTS) win.addEventListener(t, onInteraction, { capture: true, passive: t !== "keydown" });
    doc.addEventListener("volumechange", onVolumeChange, true);
    doc.addEventListener("play", onPlay, true);
    const timer = setInterval(loop, POLL_MS);
    loop();
    return {
      stop() {
        stopped = true;
        clearInterval(timer);
        for (const t of INTERACTION_EVENTS) win.removeEventListener(t, onInteraction, { capture: true });
        doc.removeEventListener("volumechange", onVolumeChange, true);
        doc.removeEventListener("play", onPlay, true);
        teardownPage();
      },
      // für Tests / Entwicklung
      get session() {
        return session;
      },
      get video() {
        return video;
      },
      get log() {
        return log;
      },
      settings,
      toggleSleep
    };
  }

  // src/main.js
  (async () => {
    if (window.top !== window) return;
    const adapter = pickAdapter(location);
    if (!adapter) return;
    try {
      if (window.__schlummer && typeof window.__schlummer.stop === "function") window.__schlummer.stop();
    } catch {
    }
    const settings = await loadSettings();
    const controller = startController({ adapter, settings });
    window.__schlummer = controller;
    console.info(`[Schlummer] aktiv auf ${adapter.name}`);
  })();
})();
