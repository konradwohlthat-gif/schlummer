// Reines Zeit- und Lautstärkemodell. Keine DOM-Zugriffe.
// Zeiten in Sekunden, Fortschritt p in 0..1, Lautstärke in 0..1.

export const PERCEPTUAL_EXPONENT = 1 / 0.6; // Stevens'sches Potenzgesetz für Lautheit
export const FINISHED_FRACTION = 0.8;       // ab hier zählt eine verlassene Folge als gesehen
export const EXTEND_THRESHOLD = 0.4;        // Interaktion oberhalb dieses Stands verlängert
export const MIN_DIM_SECONDS = 300;         // Mindest-Dimmzeit nach Startverzögerung
export const MAX_EXTEND_EPISODES = 10;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Geplante Restzeit: Rest der aktuellen Folge plus eine Länge pro weiterer Folge. */
export function remaining(plan, v) {
  const rest = Math.max(0, (v.duration || 0) - (v.currentTime || 0));
  return rest + Math.max(0, plan.budget - 1) * plan.len;
}

/**
 * Neuen Plan anlegen.
 * @param {{episodes:number, duration:number, currentTime:number, startDelaySec?:number}} o
 */
export function createPlan({ episodes, duration, currentTime, startDelaySec = 0 }) {
  const plan = {
    budget: clamp(Math.round(episodes) || 1, 1, 99),
    len: duration,
    anchor: null,
    rate0: 0, // ursprüngliche Dimm-Rate (Fortschritt pro Sekunde), gesetzt beim ersten Anker
    delayLeft: 0,
    lastTime: currentTime,
    maxSeen: currentTime,
    done: false,
  };
  const R = remaining(plan, { duration, currentTime });
  plan.delayLeft = clamp(startDelaySec, 0, Math.max(0, R - MIN_DIM_SECONDS));
  if (plan.delayLeft <= 0) setFirstAnchor(plan, R);
  return plan;
}

function setFirstAnchor(plan, R) {
  plan.anchor = { p: 0, R };
  plan.rate0 = R > 0 ? 1 / R : Infinity;
}

/** Dimm-Fortschritt 0..1 aus Plan und aktuellem Videostand. */
export function progress(plan, v) {
  if (plan.done) return 1;
  if (!plan.anchor) return 0;
  if (plan.anchor.R <= 0) return 1;
  const R = remaining(plan, v);
  return clamp(plan.anchor.p + (1 - plan.anchor.p) * (1 - R / plan.anchor.R), 0, 1);
}

/**
 * Regelmäßiger Aufruf mit dem aktuellen Videostand (gleiche Folge).
 * Zählt die Startverzögerung herunter, merkt sich die höchste gesehene Position
 * und erkennt das Ende der letzten Budget-Folge.
 */
export function tick(plan, v) {
  const next = { ...plan, lastTime: v.currentTime, maxSeen: Math.max(plan.maxSeen, v.currentTime) };
  if (next.done) return next;
  const dt = v.currentTime - plan.lastTime;
  if (!next.anchor) {
    if (dt > 0 && dt < 5) next.delayLeft = Math.max(0, next.delayLeft - dt);
    if (next.delayLeft <= 0) setFirstAnchor(next, remaining(next, v));
  }
  const atEnd = v.ended || (v.duration > 0 && v.currentTime >= v.duration - 0.5);
  if (next.budget <= 1 && atEnd) {
    next.budget = 0;
    next.done = true;
  }
  return next;
}

/**
 * Folgenwechsel. prev = letzter Stand der alten Folge, next = erster Stand der neuen.
 * Gesehen (>= 80 % oder ended): Budget sinkt, Linie läuft weiter.
 * Vorher verlassen: Budget bleibt, Linie wird am aktuellen Stand neu verankert.
 */
export function episodeChanged(plan, prev, next) {
  if (plan.done) return { ...plan, lastTime: next.currentTime, maxSeen: next.currentTime };
  const maxSeen = Math.max(plan.maxSeen, prev.currentTime || 0);
  const finished = !!prev.ended || (prev.duration > 0 && maxSeen >= FINISHED_FRACTION * prev.duration);
  const pBefore = progress(plan, prev);
  const out = { ...plan, len: next.duration, lastTime: next.currentTime, maxSeen: next.currentTime };
  if (finished) {
    out.budget = plan.budget - 1;
    if (out.budget <= 0) {
      out.budget = 0;
      out.done = true;
    }
    return out;
  }
  if (out.anchor) out.anchor = { p: pBefore, R: remaining(out, next) };
  return out;
}

/**
 * Interaktion des Nutzers. Über der Schwelle werden ganze Folgen nachgelegt,
 * bis die ursprüngliche Dimm-Rate wieder bis zur Schwelle reicht; dann neu verankern.
 * @returns {{plan:object, added:number}}
 */
export function interact(plan, v, threshold = EXTEND_THRESHOLD) {
  if (plan.done || !plan.anchor) return { plan, added: 0 };
  const p = progress(plan, v);
  if (p <= threshold) return { plan, added: 0 };
  const needed = plan.rate0 > 0 ? (1 - threshold) / plan.rate0 : 0;
  const out = { ...plan };
  let added = 0;
  while (remaining(out, v) < needed && added < MAX_EXTEND_EPISODES) {
    out.budget += 1;
    added += 1;
  }
  out.anchor = { p: threshold, R: remaining(out, v) };
  return { plan: out, added };
}

/** Serie zu Ende, kein Nachfolger: Sitzung beenden. */
export function finish(plan) {
  return { ...plan, budget: 0, done: true };
}

/** Wurde die aktuelle Folge im Sinne der 80 %-Regel zu Ende gesehen? */
export function currentFinished(plan) {
  return plan.len > 0 && plan.maxSeen >= FINISHED_FRACTION * plan.len;
}

/** Kurvenwert 0..1 für den Anteil x = 1 − p. */
export function curveValue(curve, x) {
  const c = clamp(x, 0, 1);
  return curve === 'linear' ? c : Math.pow(c, PERCEPTUAL_EXPONENT);
}

/** Ziel-Lautstärke für Fortschritt p. */
export function volumeFor({ base, min = 0, curve = 'perceptual' }, p) {
  const m = Math.min(min, base);
  return clamp(m + (base - m) * curveValue(curve, 1 - p), 0, 1);
}

/**
 * Neue Basis-Lautstärke aus einer vom Nutzer beobachteten Lautstärke bei Fortschritt p.
 * Gibt null zurück, wenn die Kurve schon zu nah an 0 ist, um etwas abzuleiten.
 */
export function rebase({ observed, min = 0, curve = 'perceptual' }, p) {
  const k = curveValue(curve, 1 - p);
  if (k < 0.01) return null;
  if (observed <= min) return clamp(observed, 0, 1);
  return clamp((observed - min * (1 - k)) / k, 0, 1);
}

/** Episode k von n (1-basiert) für die Statusanzeige. */
export function episodeIndex(plan, totalPlanned) {
  return Math.max(1, totalPlanned - plan.budget + 1);
}
