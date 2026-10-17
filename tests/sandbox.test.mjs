import assert from 'node:assert/strict';
import { test } from 'node:test';

const sb = await import('../src/free/sandbox.ts');

const deck = { id: 'd', name: 'Teste', cards: [{ name: 'Forest', count: 10 }, { name: 'Llanowar Elves', count: 4 }], commanders: [{ name: 'Omnath', count: 1 }] };
const fixed = () => 0.5;

test('nova mesa embaralha, compra 7 e põe comandantes na zona de comando', () => {
  const s = sb.newSandbox(deck, 'commander', fixed);
  assert.equal(s.zones.hand.length, 7);
  assert.equal(s.zones.library.length, 7);
  assert.deepEqual(s.zones.command.map(c => c.name), ['Omnath']);
  assert.equal(s.life, 40);
  assert.equal(sb.newSandbox(deck, 'free', fixed).life, 20);
  const ids = sb.ZONES.flatMap(z => s.zones[z].map(c => c.id));
  assert.equal(new Set(ids).size, ids.length);
});

test('comprar e moer tiram do topo e param no grimório vazio', () => {
  const s = sb.newSandbox(deck, 'free', fixed);
  const top = s.zones.library.at(-1);
  sb.draw(s);
  assert.equal(s.zones.hand.at(-1).id, top.id);
  sb.mill(s, 100);
  assert.equal(s.zones.library.length, 0);
  assert.equal(s.zones.graveyard.length, 6);
  sb.draw(s, 3);
  assert.equal(s.zones.hand.length, 8);
});

test('mover para fora do campo limpa a carta; fichas deixam de existir', () => {
  const s = sb.newSandbox(deck, 'free', fixed);
  const c = s.zones.hand[0];
  sb.move(s, c.id, 'battlefield');
  sb.toggleTap(s, c.id);
  sb.addCounter(s, c.id, '+1/+1', 2);
  assert.equal(sb.locate(s, c.id).card.tapped, true);
  sb.move(s, c.id, 'graveyard');
  const gone = sb.locate(s, c.id);
  assert.equal(gone.zone, 'graveyard');
  assert.equal(gone.card.tapped, false);
  assert.deepEqual(gone.card.counters, {});
  const t = sb.createToken(s, 'Saproling', { power: '1', toughness: '1' });
  sb.move(s, t.id, 'hand');
  assert.equal(sb.locate(s, t.id), null);
});

test('topo e fundo do grimório', () => {
  const s = sb.newSandbox(deck, 'free', fixed);
  const [a, b] = s.zones.hand;
  sb.move(s, a.id, 'library', 'top');
  sb.move(s, b.id, 'library', 'bottom');
  assert.equal(s.zones.library.at(-1).id, a.id);
  assert.equal(s.zones.library[0].id, b.id);
});

test('marcadores somem ao chegar a zero e desvirar tudo desvira o campo', () => {
  const s = sb.newSandbox(deck, 'free', fixed);
  const c = s.zones.hand[0];
  sb.move(s, c.id, 'battlefield');
  sb.addCounter(s, c.id, 'marcador', 1);
  sb.addCounter(s, c.id, 'marcador', -1);
  assert.deepEqual(c.counters, {});
  sb.toggleTap(s, c.id);
  sb.untapAll(s);
  assert.equal(c.tapped, false);
});

test('mulligan devolve a mão e compra de novo', () => {
  const s = sb.newSandbox(deck, 'free', fixed);
  sb.mulligan(s, 7, fixed);
  assert.equal(s.zones.hand.length, 7);
  assert.equal(s.zones.library.length + s.zones.hand.length, 14);
});

test('desfazer volta ao estado anterior e o jogo salvo é validado', () => {
  const s = sb.newSandbox(deck, 'free', fixed);
  const h = new sb.History(2);
  h.push(s); sb.draw(s);
  h.push(s); sb.draw(s);
  h.push(s); sb.draw(s);
  assert.equal(h.size, 2);
  assert.equal(h.undo().zones.hand.length, 9);
  assert.equal(sb.parseSandbox(JSON.stringify(s)).zones.hand.length, 10);
  assert.equal(sb.parseSandbox('{"v":2}'), null);
  assert.equal(sb.parseSandbox('lixo'), null);
});
