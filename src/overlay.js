// Zwei klick-durchlässige Ebenen über dem gesamten Viewport:
// warm (Blaulichtfilter, multiply) unten, schwarz (Dimmen) oben.
// Im Vollbild müssen beide innerhalb des Vollbild-Elements hängen.

const Z = 2147483000;
const clamp = (x) => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));

function layer(doc, bg, extra) {
  const el = doc.createElement('div');
  el.className = 'schlummer-layer';
  Object.assign(el.style, {
    position: 'fixed',
    inset: '0',
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none',
    zIndex: String(Z),
    opacity: '0',
    background: bg,
    willChange: 'opacity',
    ...extra,
  });
  return el;
}

export function createOverlay(doc = document) {
  const warm = layer(doc, 'rgb(255, 147, 41)', { mixBlendMode: 'multiply', transition: 'opacity 2s linear' });
  const dark = layer(doc, '#000', { transition: 'opacity 0.5s linear', zIndex: String(Z + 1) });
  let root = null;

  return {
    mount(el) {
      if (!el || root === el) return;
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
      const v = String(clamp(p));
      if (dark.style.opacity !== v) dark.style.opacity = v;
    },
    setWarm(a) {
      const v = String(clamp(a));
      if (warm.style.opacity !== v) warm.style.opacity = v;
    },
    get root() {
      return root;
    },
  };
}
