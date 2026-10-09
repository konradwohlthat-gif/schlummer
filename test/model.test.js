import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.js';

const MIN = 60;
const EP = 44 * MIN;
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('Fortschritt ist 0 beim Einschalten, auch mitten in der Folge', () => {
  const plan = M.createPlan({ episodes: 1, duration: EP, currentTime: 20 * MIN });
  close(M.progress(plan, { duration: EP, currentTime: 20 * MIN }), 0);
});

test('Fortschritt ist linear in der Abspielzeit und erreicht 1 am Ende', () => {
  const plan = M.createPlan({ episodes: 1, duration: EP, currentTime: 20 * MIN });
  close(M.progress(plan, { duration: EP, currentTime: 32 * MIN }), 0.5);
  close(M.progress(plan, { duration: EP, currentTime: EP }), 1);
});

test('zwei Folgen: Mitte der zweiten Folge ist 75 %', () => {
  let plan = M.createPlan({ episodes: 2, duration: EP, currentTime: 0 });
  close(M.progress(plan, { duration: EP, currentTime: EP }), 0.5);
  plan = M.episodeChanged(plan, { duration: EP, currentTime: EP, ended: true }, { duration: EP, currentTime: 0 });
  assert.equal(plan.budget, 1);
  assert.equal(plan.done, false);
  close(M.progress(plan, { duration: EP, currentTime: 22 * MIN }), 0.75);
  close(M.progress(plan, { duration: EP, currentTime: EP }), 1);
});

test('Pause friert ein, Zurückspulen hellt auf', () => {
  const plan = M.createPlan({ episodes: 1, duration: EP, currentTime: 0 });
  const p1 = M.progress(plan, { duration: EP, currentTime: 22 * MIN });
  const p2 = M.progress(M.tick(plan, { duration: EP, currentTime: 22 * MIN }), { duration: EP, currentTime: 22 * MIN });
  close(p1, p2);
  assert.ok(M.progress(plan, { duration: EP, currentTime: 10 * MIN }) < p1);
});

test('vorher verlassene Folge zählt nicht, Budget bleibt, Linie läuft vom Stand weiter', () => {
  let plan = M.createPlan({ episodes: 2, duration: EP, currentTime: 0 });
  plan = M.tick(plan, { duration: EP, currentTime: 5 * MIN });
  const pBefore = M.progress(plan, { duration: EP, currentTime: 5 * MIN });
  plan = M.episodeChanged(plan, { duration: EP, currentTime: 5 * MIN, ended: false }, { duration: EP, currentTime: 0 });
  assert.equal(plan.budget, 2);
  close(M.progress(plan, { duration: EP, currentTime: 0 }), pBefore);
  // Ende genau am Ende der zweiten vollen Folge
  plan = M.episodeChanged(plan, { duration: EP, currentTime: EP, ended: true }, { duration: EP, currentTime: 0 });
  assert.equal(plan.budget, 1);
  close(M.progress(plan, { duration: EP, currentTime: EP }), 1);
});

test('nach 80 % verlassen zählt als gesehen', () => {
  let plan = M.createPlan({ episodes: 2, duration: EP, currentTime: 0 });
  plan = M.tick(plan, { duration: EP, currentTime: 0.9 * EP });
  plan = M.episodeChanged(plan, { duration: EP, currentTime: 0.9 * EP, ended: false }, { duration: EP, currentTime: 0 });
  assert.equal(plan.budget, 1);
});

test('letzte Folge zu Ende: done', () => {
  let plan = M.createPlan({ episodes: 1, duration: EP, currentTime: 0 });
  plan = M.tick(plan, { duration: EP, currentTime: EP, ended: true });
  assert.equal(plan.done, true);
  close(M.progress(plan, { duration: EP, currentTime: 0 }), 1);
  // Autoplay danach ändert nichts mehr
  plan = M.episodeChanged(plan, { duration: EP, currentTime: EP, ended: true }, { duration: EP, currentTime: 0 });
  assert.equal(plan.done, true);
});

test('Interaktion unter 40 % ändert nichts', () => {
  const plan = M.createPlan({ episodes: 1, duration: EP, currentTime: 0 });
  const { plan: out, added } = M.interact(plan, { duration: EP, currentTime: 10 * MIN });
  assert.equal(added, 0);
  assert.equal(out, plan);
});

test('Interaktion bei 70 % legt eine Folge nach und verankert bei 40 %', () => {
  const plan = M.createPlan({ episodes: 1, duration: EP, currentTime: 0 });
  const v = { duration: EP, currentTime: 0.7 * EP };
  close(M.progress(plan, v), 0.7);
  const { plan: out, added } = M.interact(plan, v);
  assert.equal(added, 1);
  assert.equal(out.budget, 2);
  close(M.progress(out, v), 0.4);
  // Ende liegt exakt am Ende der nachgelegten Folge
  const next = M.episodeChanged(out, { duration: EP, currentTime: EP, ended: true }, { duration: EP, currentTime: 0 });
  assert.equal(next.budget, 1);
  close(M.progress(next, { duration: EP, currentTime: EP }), 1);
});

test('Verlängerung behält die Rate: nach langer Nacht nur eine Folge extra', () => {
  // 3 Folgen gesehen, 1 eingestellt, viele Verlängerungen: jede legt nur so viel nach wie nötig
  let plan = M.createPlan({ episodes: 1, duration: EP, currentTime: 0 });
  let v = { duration: EP, currentTime: 0.7 * EP };
  let r = M.interact(plan, v);
  assert.equal(r.added, 1);
  plan = r.plan;
  plan = M.episodeChanged(plan, { duration: EP, currentTime: EP, ended: true }, { duration: EP, currentTime: 0 });
  v = { duration: EP, currentTime: 0.9 * EP };
  r = M.interact(plan, v);
  assert.ok(r.added <= 1, `added ${r.added}`);
  close(M.progress(r.plan, v), 0.4);
});

test('Startverzögerung hält den Fortschritt bei 0 und zählt nur Abspielzeit', () => {
  let plan = M.createPlan({ episodes: 1, duration: EP, currentTime: 0, startDelaySec: 10 * MIN });
  assert.equal(plan.anchor, null);
  plan = M.tick(plan, { duration: EP, currentTime: 1 });
  close(M.progress(plan, { duration: EP, currentTime: 1 }), 0);
  // Sprung nach vorn zählt nicht als Verzögerungszeit
  plan = M.tick(plan, { duration: EP, currentTime: 9 * MIN });
  assert.equal(plan.anchor, null);
  for (let t = 9 * MIN; t <= 19 * MIN + 1; t += 1) plan = M.tick(plan, { duration: EP, currentTime: t });
  assert.ok(plan.anchor, 'Anker nach Verzögerung gesetzt');
  close(plan.anchor.p, 0);
  // danach linear bis zum Ende
  close(M.progress(plan, { duration: EP, currentTime: EP }), 1);
});

test('Startverzögerung lässt mindestens 5 Minuten Dimmzeit', () => {
  // Rest 20 min, Verzögerung 60 min → auf 15 min gedeckelt
  const plan = M.createPlan({ episodes: 1, duration: EP, currentTime: 24 * MIN, startDelaySec: 60 * MIN });
  assert.equal(plan.anchor, null);
  close(plan.delayLeft, 15 * MIN);
  // Rest 4 min < 5 min → keine Verzögerung, Anker sofort
  const plan2 = M.createPlan({ episodes: 1, duration: EP, currentTime: 40 * MIN, startDelaySec: 60 * MIN });
  assert.ok(plan2.anchor);
  assert.equal(plan2.delayLeft, 0);
});

test('Lautstärke: linear und Gehör, mit Mindestlautstärke', () => {
  close(M.volumeFor({ base: 1, curve: 'linear' }, 0.5), 0.5);
  close(M.volumeFor({ base: 1, curve: 'perceptual' }, 0.5), Math.pow(0.5, 1 / 0.6));
  close(M.volumeFor({ base: 0.8, curve: 'linear' }, 1), 0);
  close(M.volumeFor({ base: 0.8, min: 0.1, curve: 'linear' }, 1), 0.1);
  close(M.volumeFor({ base: 0.8, min: 0.1, curve: 'linear' }, 0), 0.8);
  // Basis unter Mindestwert bleibt unverändert
  close(M.volumeFor({ base: 0.05, min: 0.1, curve: 'linear' }, 0.5), 0.05);
});

test('Rebase rekonstruiert die Basis', () => {
  const p = 0.3;
  for (const curve of ['linear', 'perceptual']) {
    const vol = M.volumeFor({ base: 0.6, min: 0.1, curve }, p);
    close(M.rebase({ observed: vol, min: 0.1, curve }, p), 0.6);
  }
  assert.equal(M.rebase({ observed: 0.5, curve: 'linear' }, 0.999), null);
});

test('episodeIndex', () => {
  const plan = M.createPlan({ episodes: 3, duration: EP, currentTime: 0 });
  assert.equal(M.episodeIndex(plan, 3), 1);
  assert.equal(M.episodeIndex({ ...plan, budget: 1 }, 3), 3);
});
