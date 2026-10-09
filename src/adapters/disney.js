import { visibleQuery as q, findButtonByText, fullscreenRoot } from './util.js';

const CONTROLS = '[data-testid="controls-container"], .controls__footer, .btm-media-overlays-container .controls, [class*="control-bar"], [class*="controls-footer"]';

export const disney = {
  id: 'disney',
  name: 'Disney+',
  accent: '#0072d2',
  matches: (loc) => /(^|\.)disneyplus\.com$/i.test(loc.hostname),
  isPlayerPage: () => /\/(video|play)\//.test(location.pathname),
  episodeId: () => (location.pathname.match(/\/(?:video|play)\/([^/?#]+)/) || [])[1] || null,
  getVideo: () => document.querySelector('video'),
  // Selektoren werden an der Live-Seite verifiziert. Text-Fallbacks ignorieren die Steuerleiste.
  findSkipIntro: () => q('[data-testid="skip-intro"]') || findButtonByText([/^intro überspringen$/i, /^skip intro$/i], { exclude: CONTROLS }),
  findSkipRecap: () => q('[data-testid="skip-recap"]') || findButtonByText([/^(rückblick|zusammenfassung) überspringen$/i, /^skip recap$/i], { exclude: CONTROLS }),
  findNextEpisode: () => q('[data-testid="up-next-play-button"]') || null,
  findStillWatching: () => null,
  isSeriesEnd: () => false,
  fullscreenRoot: () => fullscreenRoot(document),
};
