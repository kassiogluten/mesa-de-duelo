import test from 'node:test';
import assert from 'node:assert/strict';
const { PresentationTimeline, replayable } = await import('../src/ui/presentationTimeline.ts');

const frame = turn => ({ players: [], stack: [], turn, phase: 'MAIN1', activePlayer: 1 });

test('seeing a play again queues its steps with the board of that moment, without the draws', () => {
  const timeline = new PresentationTimeline();
  timeline.ingest('m', [{ seq: 1, type: 'turn', actor: 1, frame: frame(1) }], { silent: true });
  const play = [{ seq: 5, type: 'resolved', actor: 1, frame: frame(3), repeat: true }, { seq: 4, type: 'spell-cast', actor: 1, frame: frame(3) }, { seq: 6, type: 'draw', actor: 1 }];
  assert.equal(timeline.replay(play), true);
  assert.equal(timeline.replaying, true);
  const first = timeline.advance();
  assert.equal(first.event.type, 'spell-cast');
  assert.equal(first.replay, true);
  assert.equal(first.event.frame.turn, 3);
  const second = timeline.advance();
  assert.equal(second.event.type, 'resolved');
  assert.equal(second.event.repeat, undefined, 'a jogada vista de novo tem o aviso inteiro');
  assert.notEqual(second.event, play[0], 'a fila mexe numa cópia, não no histórico');
  assert.equal(timeline.advance(), null);
  assert.equal(timeline.replaying, false);
});

test('a play is only seen again with the queue idle, and new plays wait behind it', () => {
  const timeline = new PresentationTimeline();
  timeline.ingest('m', [{ seq: 1, type: 'turn', actor: 1 }], { silent: true });
  timeline.ingest('m', [{ seq: 2, type: 'land-played', actor: 2 }]);
  assert.equal(timeline.replay([{ seq: 1, type: 'land-played', actor: 1 }]), false, 'com a fila andando, não repete');
  timeline.advance(); timeline.advance();
  assert.equal(timeline.replay([{ seq: 1, type: 'land-played', actor: 1 }]), true);
  timeline.ingest('m', [{ seq: 3, type: 'spell-cast', actor: 2 }]);
  assert.equal(timeline.advance().replay, true);
  const live = timeline.advance();
  assert.equal(live.event.seq, 3);
  assert.equal(live.replay, undefined);
});

test('only plays with something to show offer to be seen again', () => {
  assert.equal(replayable([{ seq: 1, type: 'draw' }]), false);
  assert.equal(replayable([{ seq: 1, type: 'draw' }, { seq: 2, type: 'damage' }]), true);
});
