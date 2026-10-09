import { visibleQuery as q, fullscreenRoot } from './util.js';

export const netflix = {
  id: 'netflix',
  name: 'Netflix',
  accent: '#e50914',
  matches: (loc) => /(^|\.)netflix\.com$/i.test(loc.hostname),
  isPlayerPage: () => /^\/watch\//.test(location.pathname),
  episodeId: () => (location.pathname.match(/^\/watch\/(\d+)/) || [])[1] || null,
  getVideo: () => document.querySelector('video'),
  // Nur stabile data-uia-Selektoren. Kein Text-Fallback: Der normale
  // "Nächste Folge"-Knopf in der Steuerleiste (control-next) trägt denselben
  // Text und darf nie automatisch geklickt werden.
  findSkipIntro: () => q('[data-uia="player-skip-intro"]'),
  findSkipRecap: () => q('[data-uia="player-skip-recap"]') || q('[data-uia="player-skip-preplay"]'),
  findNextEpisode: () => q('[data-uia="next-episode-seamless-button"]') || q('[data-uia="next-episode-seamless-button-draining"]'),
  findStillWatching: () => q('[data-uia="interrupt-autoplay-continue"]') || null,
  // Serienende: Netflix zeigt eine Empfehlung mit Trailer unter derselben URL
  isSeriesEnd: () => !!document.querySelector('[data-uia="postplay-back-to-browse"], [data-uia="postplay-background-play-trailer"]'),
  fullscreenRoot: () => fullscreenRoot(document),
};
