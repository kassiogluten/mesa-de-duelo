import assert from 'node:assert/strict';
import { test } from 'node:test';

const { PresentationTimeline, presentationDuration } = await import('../src/ui/presentationTimeline.ts');
const { damageLook } = await import('../src/ui/damageEffects.ts');
const event = (seq, type, extra = {}) => ({ seq, type, ...extra });
const bears = { id: 5, name: 'Grizzly Bears', creature: true };

/** Uma linha do tempo que já passou da primeira leva (a primeira é só para alcançar a mesa, sem apresentar). */
function live() {
  const timeline = new PresentationTimeline();
  timeline.ingest('m', [event(1, 'turn', { actor: 1, turn: 1 })]);
  return timeline;
}

test('vidência, moeda, dado, anexar e troca de controle têm passo próprio e entram no histórico', () => {
  const timeline = live();
  timeline.ingest('m', [event(2, 'scry', { actor: 1, top: 1, bottom: 2 }), event(3, 'coin', { actor: 1, heads: true }), event(4, 'die', { sides: 20, result: 7 }),
    event(5, 'attached', { card: { id: 9, name: 'Bonesplitter' }, targets: { cards: [5], players: [] } }), event(6, 'control-changed', { card: bears, actor: 2, previous: 1 })]);
  const seen = [];
  for (let entry = timeline.advance(); entry; entry = timeline.advance()) seen.push(entry.event.type);
  assert.deepEqual(seen, ['scry', 'coin', 'die', 'attached', 'control-changed']);
  assert.deepEqual(timeline.history.slice(-5).map(e => e.type), seen);
});

test('embaralhar não segura a partida nem entra no histórico', () => {
  const timeline = live();
  timeline.ingest('m', [event(2, 'shuffle', { actor: 1 })]);
  const entry = timeline.advance();
  assert.equal(entry.event.type, 'shuffle');
  assert.equal(entry.audioOnly, true);
  assert.equal(timeline.history.some(e => e.type === 'shuffle'), false);
});

test('marcadores seguidos viram um som só, mas guardam cada carta para ela crescer', () => {
  const timeline = live();
  timeline.ingest('m', [event(2, 'counters', { card: bears, sourceId: 5, counter: 'P1P1', delta: 1 }),
    event(3, 'counters', { card: { id: 6, name: 'Hill Giant' }, sourceId: 6, counter: 'P1P1', delta: 1 })]);
  const entry = timeline.advance();
  assert.equal(entry.event.count, 2);
  assert.deepEqual(entry.event.grouped.map(e => e.sourceId), [5, 6]);
  assert.equal(timeline.advance(), null);
});

test('uma busca no grimório não se junta às compras comuns', () => {
  const timeline = live();
  timeline.ingest('m', [event(2, 'draw', { actor: 1 }), event(3, 'draw', { actor: 1, searched: true })]);
  const draws = timeline.history.filter(e => e.type === 'draw');
  assert.equal(draws.length, 2);
  assert.equal(draws[1].searched, true);
  const first = timeline.advance(), second = timeline.advance();
  assert.equal(!!first.event.searched, false);
  assert.equal(second.event.searched, true);
});

test('a luta usa o golpe das criaturas, com o selo', () => {
  const look = damageLook(event(2, 'damage', { delta: -3, fight: true, targets: { cards: [5], players: [] } }));
  assert.equal(look.motion, 'strike');
  assert.ok(look.badges.includes('Luta'));
  assert.equal(damageLook(event(2, 'damage', { delta: -3, targets: { cards: [5], players: [] } })).motion, 'bolt');
});

test('os passos novos têm tempo para serem vistos, e menos no modo acelerado', () => {
  for (const type of ['scry', 'coin', 'die', 'attached', 'control-changed', 'blockers']) {
    const normal = presentationDuration(event(2, type), false), fast = presentationDuration(event(2, type), true);
    assert.ok(normal >= 500, `${type}: ${normal}`);
    assert.ok(fast < normal, type);
  }
  assert.ok(presentationDuration(event(2, 'coin'), false) > presentationDuration(event(2, 'attached'), false), 'a moeda precisa cair antes do próximo passo');
});
