export function visibleQuery(sel, root = document) {
  const el = root.querySelector(sel);
  return el && el.isConnected && el.getClientRects().length > 0 ? el : null;
}

/**
 * Sichtbaren Knopf über seinen Text finden. Bewusst nur der sichtbare Text,
 * nicht aria-label: Steuerleisten tragen oft dieselben Labels wie Overlay-Knöpfe.
 * `exclude` ist ein Selektor für Bereiche, die ignoriert werden (Steuerleiste).
 */
export function findButtonByText(patterns, { root = document, exclude = null } = {}) {
  const buttons = root.querySelectorAll('button, [role="button"]');
  for (const b of buttons) {
    if (exclude && b.closest(exclude)) continue;
    const txt = (b.textContent || '').trim();
    for (const p of patterns) {
      if (p.test(txt) && b.getClientRects().length > 0) return b;
    }
  }
  return null;
}

export function fullscreenRoot(doc = document) {
  return doc.fullscreenElement || doc.webkitFullscreenElement || doc.body;
}
