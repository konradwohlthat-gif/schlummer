// Bedienpanel oben rechts im Player. Erscheint bei Mausbewegung, verschwindet nach Ruhe.
import { DEFAULTS } from './settings.js';

const HIDE_AFTER_MS = 3000;

const CSS = `
.schlummer-panel{position:fixed;top:24px;right:24px;z-index:2147483100;width:300px;box-sizing:border-box;
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
`;

function installStyles(doc) {
  if (doc.__schlummerStyles) return;
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS);
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  } catch {
    const st = doc.createElement('style');
    st.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(st);
  }
  doc.__schlummerStyles = true;
}

function h(doc, tag, props = {}, children = []) {
  const el = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v !== null && v !== undefined) el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c) el.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c);
  return el;
}

const STOP_EVENTS = ['mousedown', 'mouseup', 'click', 'dblclick', 'pointerdown', 'pointerup', 'keydown', 'keyup', 'keypress', 'wheel', 'touchstart', 'touchend', 'contextmenu'];

/**
 * @param {object} o
 * @param {object} o.settings  lebendes Einstellungsobjekt (wird vom Controller mutiert)
 * @param {(key:string, value:any)=>void} o.onSettingChange
 * @param {()=>void} o.onSleepToggle
 * @param {()=>{active:boolean,text:string}} o.getStatus
 * @param {string} o.accent  Akzentfarbe des Anbieters
 */
export function createPanel({ settings, onSettingChange, onSleepToggle, getStatus, accent = '#e50914', doc = document }) {
  installStyles(doc);
  let root = null;
  let hideTimer = null;
  let hovered = false;
  let noticeTimer = null;

  const sleepSwitch = h(doc, 'input', { type: 'checkbox', class: 'schlummer-switch', id: 'schlummer-sleep', onchange: () => onSleepToggle() });
  const introSwitch = h(doc, 'input', { type: 'checkbox', class: 'schlummer-switch', id: 'schlummer-intro', onchange: (e) => onSettingChange('skipIntro', e.target.checked) });
  const creditsSwitch = h(doc, 'input', { type: 'checkbox', class: 'schlummer-switch', id: 'schlummer-credits', onchange: (e) => onSettingChange('skipCredits', e.target.checked) });
  const epOut = h(doc, 'output', { text: String(settings.episodes) });
  const status = h(doc, 'div', { class: 'schlummer-status', text: 'Aus' });
  const notice = h(doc, 'div', { class: 'schlummer-notice', style: 'display:none' });

  const stepper = h(doc, 'div', { class: 'schlummer-stepper' }, [
    h(doc, 'button', { type: 'button', text: '−', 'aria-label': 'Weniger Folgen', onclick: () => onSettingChange('episodes', settings.episodes - 1) }),
    epOut,
    h(doc, 'button', { type: 'button', text: '+', 'aria-label': 'Mehr Folgen', onclick: () => onSettingChange('episodes', settings.episodes + 1) }),
  ]);

  const curveSeg = h(doc, 'div', { class: 'schlummer-seg' }, [
    h(doc, 'button', { type: 'button', text: 'Gehör', 'data-curve': 'perceptual', onclick: () => onSettingChange('volumeCurve', 'perceptual') }),
    h(doc, 'button', { type: 'button', text: 'Linear', 'data-curve': 'linear', onclick: () => onSettingChange('volumeCurve', 'linear') }),
  ]);

  function rangeRow(label, key, min, max, step, toSetting, fromSetting, fmt) {
    const val = h(doc, 'span', { class: 'schlummer-val' });
    const input = h(doc, 'input', {
      type: 'range', class: 'schlummer-range', min, max, step,
      oninput: (e) => onSettingChange(key, toSetting(Number(e.target.value))),
    });
    const row = h(doc, 'div', { class: 'schlummer-row' }, [h(doc, 'label', { text: label }), input, val]);
    return { row, update() { const v = fromSetting(settings[key]); if (doc.activeElement !== input) input.value = String(v); val.textContent = fmt(settings[key]); } };
  }

  const minVol = rangeRow('Mindestlautstärke', 'minVolume', 0, 50, 1, (x) => x / 100, (s) => Math.round(s * 100), (s) => `${Math.round(s * 100)} %`);
  const delay = rangeRow('Startverzögerung', 'startDelayMin', 0, 60, 1, (x) => x, (s) => s, (s) => `${s} min`);
  const blue = rangeRow('Blaulichtfilter', 'blueLight', 0, 100, 1, (x) => x / 100, (s) => Math.round(s * 100), (s) => (s > 0 ? `${Math.round(s * 100)} %` : 'aus'));

  const el = h(doc, 'div', { class: 'schlummer-panel', role: 'group', 'aria-label': 'Schlummer' }, [
    h(doc, 'div', { class: 'schlummer-title' }, [h(doc, 'span', { text: 'Schlummer' }), h(doc, 'small', { text: 'Taste Z' })]),
    h(doc, 'div', { class: 'schlummer-row' }, [h(doc, 'label', { for: 'schlummer-sleep', text: 'Schlafmodus' }), stepper, sleepSwitch]),
    status,
    notice,
    h(doc, 'div', { class: 'schlummer-row' }, [h(doc, 'label', { for: 'schlummer-intro', text: 'Intro überspringen' }), introSwitch]),
    h(doc, 'div', { class: 'schlummer-row' }, [h(doc, 'label', { for: 'schlummer-credits', text: 'Abspann überspringen' }), creditsSwitch]),
    h(doc, 'details', { class: 'schlummer-more' }, [
      h(doc, 'summary', { text: 'Mehr' }),
      h(doc, 'div', { class: 'schlummer-row' }, [h(doc, 'label', { text: 'Lautstärkekurve' }), curveSeg]),
      minVol.row,
      delay.row,
      blue.row,
      h(doc, 'button', { type: 'button', class: 'schlummer-btn', text: 'Standardwerte', onclick: () => { for (const [k, v] of Object.entries(DEFAULTS)) onSettingChange(k, v); } }),
    ]),
    h(doc, 'div', { class: 'schlummer-hint', text: 'Folgen = Anzahl der Folgen, bis Bild und Ton ganz weg sind. Maus bewegen zeigt dieses Panel.' }),
  ]);
  el.style.setProperty('--schlummer-accent', accent);

  for (const t of STOP_EVENTS) el.addEventListener(t, (e) => e.stopPropagation());
  el.addEventListener('mouseenter', () => { hovered = true; clearTimeout(hideTimer); });
  el.addEventListener('mouseleave', () => { hovered = false; scheduleHide(); });

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (!hovered) el.classList.remove('is-visible'); }, HIDE_AFTER_MS);
  }

  function update() {
    const st = getStatus();
    sleepSwitch.checked = st.active;
    status.textContent = st.text;
    status.classList.toggle('is-active', st.active);
    introSwitch.checked = settings.skipIntro;
    creditsSwitch.checked = settings.skipCredits;
    epOut.textContent = String(settings.episodes);
    for (const b of curveSeg.children) b.classList.toggle('is-on', b.dataset.curve === settings.volumeCurve);
    minVol.update();
    delay.update();
    blue.update();
  }

  return {
    el,
    mount(r) {
      if (!r || root === r) return;
      root = r;
      r.appendChild(el);
    },
    unmount() {
      el.remove();
      root = null;
      el.classList.remove('is-visible');
    },
    show() {
      el.classList.add('is-visible');
      scheduleHide();
    },
    hide() {
      clearTimeout(hideTimer);
      el.classList.remove('is-visible');
    },
    isInside(node) {
      return !!(node && node instanceof Node && el.contains(node));
    },
    notice(text, ms = 3000) {
      notice.textContent = text;
      notice.style.display = '';
      clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => { notice.style.display = 'none'; }, ms);
      this.show();
    },
    update,
  };
}
