import { visibleQuery as q, findButtonByText, fullscreenRoot } from './util.js';

export const netflix = {
  id: 'netflix',
  name: 'Netflix',
  accent: '#e50914',
  matches: (loc) => /(^|\.)netflix\.com$/i.test(loc.hostname),
  isPlayerPage: () => /^\/watch\//.test(location.pathname),
  episodeId: () => (location.pathname.match(/^\/watch\/(\d+)/) || [])[1] || null,
  getVideo: () => document.querySelector('video'),
  findSkipIntro: () => q('[data-uia="player-skip-intro"]') || findButtonByText([/^Intro überspringen$/i, /^Skip Intro$/i]),
  findSkipRecap: () => q('[data-uia="player-skip-recap"]') || q('[data-uia="player-skip-preplay"]') || findButtonByText([/^(Rückblick|Zusammenfassung) überspringen$/i, /^Skip Recap$/i]),
  findNextEpisode: () => q('[data-uia="next-episode-seamless-button"]') || q('[data-uia="next-episode-seamless-button-draining"]') || findButtonByText([/^Nächste Folge$/i, /^Next Episode$/i]),
  findStillWatching: () => q('[data-uia="interrupt-autoplay-continue"]') || null,
  fullscreenRoot: () => fullscreenRoot(document),
};
