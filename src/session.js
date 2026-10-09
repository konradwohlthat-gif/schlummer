// Zustand einer laufenden Schlafmodus-Sitzung: Plan, Basis-Lautstärke, Zähler.
import * as M from './model.js';

export function createSession({ settings, video, baseVolume }) {
  let plan = M.createPlan({
    episodes: settings.episodes,
    duration: video.duration,
    currentTime: video.currentTime,
    startDelaySec: settings.startDelayMin * 60,
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
      plan = M.tick(plan, v);
    },
    episodeChanged(prev, next) {
      const before = plan.budget;
      plan = M.episodeChanged(plan, prev, next);
      if (plan.budget < before) finishedCount += 1;
    },
    /** @returns {{added:number, changed:boolean}} */
    interact(v) {
      const r = M.interact(plan, v);
      const changed = r.plan !== plan;
      plan = r.plan;
      return { added: r.added, changed };
    },
    progress(v) {
      return M.progress(plan, v);
    },
    volume(v, s) {
      return M.volumeFor({ base, min: s.minVolume, curve: s.volumeCurve }, this.progress(v));
    },
    rebase(observed, v, s) {
      const b = M.rebase({ observed, min: s.minVolume, curve: s.volumeCurve }, this.progress(v));
      if (b !== null) base = b;
      return b;
    },
  };
}
