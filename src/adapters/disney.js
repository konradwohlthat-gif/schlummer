import { visibleQuery as q, findButtonByText, fullscreenRoot } from './util.js';

export const disney = {
  id: 'disney',
  name: 'Disney+',
  accent: '#0072d2',
  matches: (loc) => /(^|\.)disneyplus\.com$/i.test(loc.hostname),
  isPlayerPage: () => /\/(video|play)\//.test(location.pathname),
  episodeId: () => (location.pathname.match(/\/(?:video|play)\/([^/?#]+)/) || [])[1] || null,
  getVideo: () => document.querySelector('video'),
  findSkipIntro: () => q('[data-testid="skip-intro"]') || q('button.skip__button') || findButtonByText([/intro überspringen/i, /skip intro/i]),
  findSkipRecap: () => q('[data-testid="skip-recap"]') || findButtonByText([/(rückblick|zusammenfassung) überspringen/i, /skip recap/i]),
  findNextEpisode: () => q('[data-testid="up-next-play-button"]') || findButtonByText([/^nächste folge$/i, /^next episode$/i]),
  findStillWatching: () => null,
  fullscreenRoot: () => fullscreenRoot(document),
};
