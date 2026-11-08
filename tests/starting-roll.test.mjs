import test from 'node:test';
import assert from 'node:assert/strict';

const { currentStartingRoll, startingRollText, startingRollDuration } = await import('../src/ui/startingRoll.ts');
const { PresentationTimeline } = await import('../src/ui/presentationTimeline.ts');

const roll = { seq: 3, type: 'starting-roll', actor: 36, rolls: [
  [{ player: 10, roll: 3 }, { player: 23, roll: 6 }, { player: 36, roll: 6 }], [{ player: 23, roll: 2 }, { player: 36, roll: 5 }]] };
const names = { 10: 'Ana', 23: 'Bruno', 36: 'Você' };

test('the history says every roll, the tie-break and who chooses', () => {
  assert.equal(startingRollText(roll, id => names[id]),
    'Dados para ver quem começa: Ana 3, Bruno 6, Você 6; desempate: Bruno 2, Você 5. Você escolhe quem começa.');
});

test('the dice belong to the opening: once a turn begins they are gone', () => {
  assert.equal(currentStartingRoll([{ seq: 1, type: 'draw' }, roll]), roll);
  assert.equal(currentStartingRoll([roll, { seq: 4, type: 'turn', turn: 1 }]), undefined);
  assert.equal(currentStartingRoll([]), undefined);
});

test('the roll stays in the history even when the table catches up silently', () => {
  const timeline = new PresentationTimeline();
  timeline.ingest('m', [roll], { silent: true });
  assert.equal(timeline.history.length, 1);
  assert.equal(timeline.history[0].type, 'starting-roll');
});

test('each tie-break adds time to the animation', () => {
  assert.ok(startingRollDuration(2, false) > startingRollDuration(1, false));
  assert.equal(startingRollDuration(3, true), startingRollDuration(1, true));
});
