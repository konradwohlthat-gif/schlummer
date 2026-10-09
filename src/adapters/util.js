export function visibleQuery(sel, root = document) {
  const el = root.querySelector(sel);
  return el && el.isConnected && el.getClientRects().length > 0 ? el : null;
}

export function findButtonByText(patterns, root = document) {
  const buttons = root.querySelectorAll('button, [role="button"]');
  for (const b of buttons) {
    const txt = (b.textContent || '').trim();
    const aria = b.getAttribute('aria-label') || '';
    for (const p of patterns) {
      if (p.test(txt) || p.test(aria)) {
        if (b.getClientRects().length > 0) return b;
      }
    }
  }
  return null;
}

export function fullscreenRoot(doc = document) {
  return doc.fullscreenElement || doc.webkitFullscreenElement || doc.body;
}
