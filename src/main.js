import { pickAdapter } from './adapters/index.js';
import { loadSettings } from './settings.js';
import { startController } from './controller.js';

(async () => {
  if (window.top !== window) return;
  const adapter = pickAdapter(location);
  if (!adapter) return;
  // Vorherige Instanz (Entwicklung: erneutes Einspielen) sauber beenden
  try { if (window.__schlummer && typeof window.__schlummer.stop === 'function') window.__schlummer.stop(); } catch { /* ignorieren */ }
  const settings = await loadSettings();
  const controller = startController({ adapter, settings });
  window.__schlummer = controller;
  console.info(`[Schlummer] aktiv auf ${adapter.name}`);
})();
