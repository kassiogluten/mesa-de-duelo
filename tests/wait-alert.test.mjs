import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function load(file) {
  let code = await readFile(new URL(`../src/ui/${file}`, import.meta.url), 'utf8');
  return ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
}
const clock = await load('clock.ts');
const clockUrl = `data:text/javascript;base64,${Buffer.from(clock).toString('base64')}`;
const output = (await load('waitAlert.ts')).replace(/from ['"]\.\/clock['"]/, `from '${clockUrl}'`);
const { WaitClock, WaitAnnouncer, waitStage, waitNudgeText, waitClockTip, waitAnnouncement } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);

const MIN = 60_000;
const players = [{ id: 0, name: 'Você' }, { id: 1, name: 'Ana' }, { id: 2, name: 'Bot', ai: true }];
const state = (waiting, extra = {}) => ({ you: 0, gameOver: false, players, waiting, ...extra });

test('stages by waiting time: color at 2 min, pulse at 3 min, "Demorando…" from 5 min', () => {
  assert.equal(waitStage(0), 0);
  assert.equal(waitStage(2 * MIN - 1), 0);
  assert.equal(waitStage(2 * MIN), 1);
  assert.equal(waitStage(3 * MIN - 1), 1);
  assert.equal(waitStage(3 * MIN), 2);
  assert.equal(waitStage(4 * MIN + 59_000), 2);
  assert.equal(waitStage(5 * MIN), 3);
  assert.equal(waitStage(40 * MIN), 3);
});

test('the alert goes to whoever the table is waiting for, not to whoever owns the turn', () => {
  const c = new WaitClock();
  // No seu turno, a mesa espera o bloqueio de Ana: o alerta é dela.
  const s = state([{ player: 1, kind: 'block', ms: 3 * MIN }], { activePlayer: 0 });
  c.sync(s, 1_000_000);
  const w = c.current(s, 1_000_000);
  assert.equal(w.player, 1); assert.equal(w.mine, false); assert.equal(w.stage, 2);
  assert.equal(waitNudgeText(w), '', 'only the slow player gets the private notice');
  assert.equal(waitClockTip(w), 'A mesa espera Ana há 3:00');
  const mine = state([{ player: 0, kind: 'priority', ms: 3 * MIN + 5000 }]);
  c.sync(mine, 2_000_000);
  const own = c.current(mine, 2_000_000);
  assert.equal(own.mine, true);
  assert.equal(waitNudgeText(own), 'Sua vez já passa de 3 min');
  assert.equal(waitNudgeText({ ...own, stage: 3 }), 'Sua vez já passa de 5 min');
  assert.equal(waitNudgeText({ ...own, stage: 1 }), '');
});

test('watching a match never makes the alert yours', () => {
  const c = new WaitClock(), s = state([{ player: 0, kind: 'priority', ms: 4 * MIN }], { watching: true });
  c.sync(s, 0);
  assert.equal(c.current(s, 0).mine, false);
});

test('the AI is ignored, as are finished games and an empty table', () => {
  const c = new WaitClock();
  const ai = state([{ player: 2, kind: 'priority', ms: 10 * MIN }]);
  c.sync(ai, 0);
  assert.equal(c.current(ai, 0), null);
  const over = state([{ player: 1, kind: 'choice', ms: 10 * MIN }], { gameOver: true });
  c.sync(over, 0);
  assert.equal(c.current(over, 0), null);
  c.sync(state(undefined), 0);
  assert.equal(c.current(state(undefined), 0), null);
});

test('the clock keeps counting between states and restarts on each answer', () => {
  const c = new WaitClock();
  const first = state([{ player: 1, kind: 'priority', ms: 1 * MIN }]);
  c.sync(first, 0);
  assert.equal(c.current(first, 90_000).ms, 2.5 * MIN);
  // Mesmo pedido, com o atraso da rede: o relógio não pula.
  const again = state([{ player: 1, kind: 'priority', ms: 2.5 * MIN + 800 }]);
  c.sync(again, 90_000);
  assert.equal(c.current(again, 90_000).ms, 2.5 * MIN);
  // Ana respondeu e recebeu outro pedido: espera nova, do zero.
  const answered = state([{ player: 1, kind: 'priority', ms: 300 }]);
  c.sync(answered, 100_000);
  assert.equal(c.current(answered, 100_000).stage, 0);
  // O turno passou para ninguém humano: nada a alertar.
  c.sync(state([]), 110_000);
  assert.equal(c.current(state([]), 110_000), null);
});

test('with several players waited on, the longest wait wins', () => {
  const c = new WaitClock(), s = state([{ player: 0, kind: 'choice', ms: 30_000 }, { player: 1, kind: 'choice', ms: 4 * MIN }]);
  c.sync(s, 0);
  assert.equal(c.current(s, 0).player, 1);
});

test('screen readers hear each stage once, and the sound plays once at 3 min for the slow player only', () => {
  const c = new WaitClock(), a = new WaitAnnouncer();
  const s = state([{ player: 0, kind: 'priority', ms: 0 }]);
  c.sync(s, 0);
  const heard = [], sounds = [];
  for (let t = 0; t <= 6 * MIN; t += 1000) {
    const step = a.next(c.current(s, t));
    if (step) { heard.push(step.text); if (step.sound) sounds.push(t); }
  }
  assert.deepEqual(heard, ['A mesa espera você há 2 minutos.', 'Sua vez já passa de 3 minutos.', 'Sua vez já passa de 5 minutos. Todos veem que você está demorando.']);
  assert.deepEqual(sounds, [3 * MIN]);
  // Outro jogador: anúncios para todos, sem som.
  const other = state([{ player: 1, kind: 'block', ms: 0 }]), c2 = new WaitClock(), a2 = new WaitAnnouncer();
  c2.sync(other, 0);
  const steps = [2, 3, 5].map(m => a2.next(c2.current(other, m * MIN)));
  assert.deepEqual(steps.map(x => x.text), ['A mesa espera Ana há 2 minutos.', 'A mesa espera Ana há 3 minutos.', 'Ana está demorando: a mesa espera há 5 minutos.']);
  assert.ok(steps.every(x => !x.sound));
});

test('opening the table mid-wait announces only the current stage, and a new wait starts over', () => {
  const c = new WaitClock(), a = new WaitAnnouncer();
  const late = state([{ player: 1, kind: 'choice', ms: 6 * MIN }]);
  c.sync(late, 0);
  const first = a.next(c.current(late, 0));
  assert.equal(first.stage, 3); assert.equal(first.sound, false);
  assert.equal(a.next(c.current(late, 1000)), null);
  const fresh = state([{ player: 1, kind: 'choice', ms: 0 }]);
  c.sync(fresh, 10_000);
  assert.equal(a.next(c.current(fresh, 10_000)), null);
  assert.equal(a.next(c.current(fresh, 10_000 + 2 * MIN)).stage, 1);
  assert.equal(waitAnnouncement({ mine: false, name: 'Ana', stage: 0 }), '');
});
