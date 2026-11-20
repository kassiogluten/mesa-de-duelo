import test from 'node:test';
import assert from 'node:assert/strict';
import { countdown, noticeAlive, noticeStage, noticeText, shouldShow, EXPIRES_AFTER_MS } from '../src/ui/serverNotice.ts';
import { nextAt, timeIn } from '../src/admin/adminNotice.ts';

const MIN = 60_000;

test('the notice stage changes at 5 minutes and 1 minute before the time', () => {
  const at = 100 * MIN;
  assert.equal(noticeStage(undefined, 0), 'far');
  assert.equal(noticeStage(at, at - 6 * MIN), 'far');
  assert.equal(noticeStage(at, at - 5 * MIN), 'soon');
  assert.equal(noticeStage(at, at - MIN), 'imminent');
  assert.equal(noticeStage(at, at), 'past');
});

test('countdown reads in minutes and hours', () => {
  assert.equal(countdown(10 * MIN, 0), 'em 10 min');
  assert.equal(countdown(MIN, 30_000), 'em instantes');
  assert.equal(countdown(65 * MIN, 0), 'em 1 h 05 min');
  assert.equal(countdown(120 * MIN, 0), 'em 2 h');
  assert.equal(countdown(0, 1), 'agora');
});

test('{hora} becomes the local clock time, every time it appears', () => {
  const at = new Date(2026, 10, 19, 23, 30).getTime();
  assert.equal(noticeText({ id: 'a', text: 'Reinício às {hora}; volte depois das {hora}.', at }), 'Reinício às 23:30; volte depois das 23:30.');
  assert.equal(noticeText({ id: 'a', text: 'Sem horário {hora}' }), 'Sem horário {hora}');
});

test('a closed banner comes back when the stage changes, or for a new notice, and leaves after the time', () => {
  const at = 100 * MIN, n = { id: 'a', text: 'x', at };
  assert.equal(shouldShow(n, null, at - 30 * MIN), true);
  assert.equal(shouldShow(n, { id: 'a', stage: 'far' }, at - 30 * MIN), false, 'fechada continua fechada na mesma fase');
  assert.equal(shouldShow(n, { id: 'a', stage: 'far' }, at - 4 * MIN), true, 'volta a 5 min');
  assert.equal(shouldShow(n, { id: 'a', stage: 'soon' }, at - 30_000), true, 'volta a 1 min');
  assert.equal(shouldShow({ ...n, id: 'b' }, { id: 'a', stage: 'far' }, at - 30 * MIN), true, 'aviso novo aparece');
  assert.equal(noticeAlive(n, at + EXPIRES_AFTER_MS + 1), false);
  assert.equal(shouldShow(n, null, at + EXPIRES_AFTER_MS + 1), false);
  assert.equal(shouldShow(null, null, 0), false);
});

test('the admin time field means today, or tomorrow when the time already passed', () => {
  const now = new Date(2026, 10, 19, 22, 10);
  assert.equal(nextAt('23:30', now), new Date(2026, 10, 19, 23, 30).getTime());
  assert.equal(nextAt('08:00', now), new Date(2026, 10, 20, 8, 0).getTime());
  assert.equal(nextAt('', now), 0);
  assert.equal(timeIn(30, now), '22:40');
  assert.equal(timeIn(15, new Date(2026, 10, 19, 22, 12)), '22:30');
});
