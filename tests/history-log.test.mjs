import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const code = await readFile(new URL('../src/ui/historyLog.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { historyTurns, effectParts, listNames, turnSummary } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);

const players = { 1: 'Ana', 2: 'Bruno' };
const names = {
  you: 1,
  player: id => players[id] ?? 'Jogador',
  card: e => e.card?.name && !e.card.faceDown ? e.card.name : undefined,
  cardById: (id, e) => e.frame?.players.flatMap(p => p.battlefield).find(c => c.id === id),
  label: c => c.name,
  describe: e => `${e.type}${e.card?.name ? ` ${e.card.name}` : ''}${e.count ? ` x${e.count}` : ''}.`,
};
let seq = 0;
const ev = (type, extra = {}) => ({ seq: ++seq, type, ...extra });
const card = (id, name) => ({ id, name });
const onStack = (id, extra = {}) => ({ frame: { players: [], stack: [{ id }], turn: 3, phase: 'MAIN1', activePlayer: 1 }, ...extra });

test('events are split by turn, with a block for what came before the first turn', () => {
  seq = 0;
  const turns = historyTurns([ev('draw', { actor: 1, count: 7 }), ev('turn', { actor: 1, turn: 1 }), ev('land-played', { actor: 1, card: card(5, 'Forest') }),
    ev('turn', { actor: 2, turn: 2 }), ev('turn', { actor: 1, turn: 3 })], names);
  assert.deepEqual(turns.map(t => [t.key === 'inicio' ? 'inicio' : t.turn, t.actor, t.lines.length]), [['inicio', undefined, 1], [1, 1, 1], [2, 2, 0], [3, 1, 0]]);
  assert.equal(turnSummary(turns[1]), '1 jogada');
  assert.equal(turnSummary(turns[2]), 'Nenhuma jogada');
});

test('a spell and what it caused while resolving become one line, with the cards on opening it', () => {
  seq = 0;
  const elves = card(20, 'Llanowar Elves'), bears = card(21, 'Grizzly Bears'), angel = card(22, 'Serra Angel');
  const events = [ev('turn', { actor: 1, turn: 4 }),
    ev('spell-cast', { actor: 1, stackId: 9, card: card(30, 'Wrath of God'), ...onStack(9) }),
    ev('left', { actor: 2, card: elves, reason: 'destroyed', ...onStack(9) }),
    ev('left', { actor: 2, card: bears, reason: 'destroyed', ...onStack(9) }),
    ev('left', { actor: 1, card: angel, reason: 'destroyed', ...onStack(9) }),
    ev('resolved', { actor: 1, stackId: 9, card: card(30, 'Wrath of God'), ...onStack(9) })];
  const [turn] = historyTurns(events, names);
  assert.equal(turn.lines.length, 1);
  assert.equal(turn.lines[0].text, 'spell-cast Wrath of God: destruiu 3 permanentes (1 sua e 2 de Bruno).');
  assert.deepEqual(turn.lines[0].children.map(c => c.card.name), ['Llanowar Elves', 'Grizzly Bears', 'Serra Angel']);
});

test('a resolution that is not right after its cast keeps its own line, and countered spells say so', () => {
  seq = 0;
  const events = [ev('turn', { actor: 1, turn: 2 }),
    ev('spell-cast', { actor: 1, stackId: 1, card: card(1, 'Lightning Bolt'), ...onStack(1) }),
    ev('spell-cast', { actor: 2, stackId: 2, card: card(2, 'Giant Growth'), ...onStack(2) }),
    ev('resolved', { actor: 2, stackId: 2, card: card(2, 'Giant Growth'), ...onStack(2) }),
    ev('damage', { actor: 1, card: card(1, 'Lightning Bolt'), delta: -3, targets: { players: [2] }, ...onStack(1) }),
    ev('life-changed', { actor: 2, delta: -3, ...onStack(1) }),
    ev('resolved', { actor: 1, stackId: 1, card: card(1, 'Lightning Bolt'), ...onStack(1) }),
    ev('spell-cast', { actor: 2, stackId: 3, card: card(3, 'Shock'), ...onStack(3) }),
    ev('countered', { actor: 2, stackId: 3, card: card(3, 'Shock'), ...onStack(3) })];
  const texts = historyTurns(events, names)[0].lines.map(l => l.text);
  assert.deepEqual(texts, ['spell-cast Lightning Bolt.', 'spell-cast Giant Growth.', 'Lightning Bolt (Ana) resolveu: causou 3 de dano a Bruno.', 'spell-cast Shock: não resolveu.']);
});

test('a creature spell does not repeat that it entered the battlefield', () => {
  seq = 0;
  const elves = card(5, 'Llanowar Elves');
  const events = [ev('spell-cast', { actor: 1, stackId: 4, sourceId: 5, card: elves, ...onStack(4) }),
    ev('entered', { actor: 1, sourceId: 5, card: elves, from: 'Stack', ...onStack(4) }),
    ev('resolved', { actor: 1, stackId: 4, sourceId: 5, card: elves, ...onStack(4) })];
  assert.equal(historyTurns(events, names)[0].lines[0].text, 'spell-cast Llanowar Elves.');
});

test('draws during the resolution belong to it; the draw step before the cast does not', () => {
  seq = 0;
  const events = [ev('turn', { actor: 1, turn: 3 }), ev('draw', { actor: 1 }),
    ev('spell-cast', { actor: 1, stackId: 7, card: card(7, 'Divination'), ...onStack(7) }),
    ev('draw', { actor: 1 }), ev('draw', { actor: 1 }),
    ev('resolved', { actor: 1, stackId: 7, card: card(7, 'Divination'), ...onStack(7) })];
  assert.deepEqual(historyTurns(events, names)[0].lines.map(l => l.text), ['draw.', 'spell-cast Divination: Ana comprou 2 cartas.']);
});

test('combat damage, the life it took and the creatures that died are one line', () => {
  seq = 0;
  const events = [ev('turn', { actor: 1, turn: 5 }),
    ev('damage', { combat: true, delta: -4, targets: { players: [2] }, card: card(1, 'Serra Angel') }),
    ev('damage', { combat: true, delta: -2, targets: { cards: [9] }, card: card(2, 'Grizzly Bears') }),
    ev('life-changed', { actor: 2, delta: -4 }),
    ev('life-changed', { actor: 1, delta: 4 }),
    ev('left', { actor: 2, card: card(9, 'Llanowar Elves'), reason: 'destroyed' }),
    ev('land-played', { actor: 1, card: card(3, 'Plains') })];
  const lines = historyTurns(events, names)[0].lines;
  assert.equal(lines[0].text, 'Dano de combate: Bruno sofreu 4 de dano; Llanowar Elves morreu; Ana ganhou 4 de vida.');
  assert.equal(lines[0].children.length, 4, 'the life lost to the damage is not repeated');
  assert.equal(lines[1].text, 'land-played Plains.');
});

test('triggers of the same card in a row become one line', () => {
  seq = 0;
  const artist = card(4, 'Blood Artist');
  const events = [ev('turn', { actor: 1, turn: 6 }),
    ev('ability-activated', { trigger: true, actor: 1, stackId: 11, card: artist, ...onStack(11) }),
    ev('ability-activated', { trigger: true, actor: 1, stackId: 12, card: artist, ...onStack(12) }),
    ev('life-changed', { actor: 2, delta: -1, ...onStack(12) }),
    ev('resolved', { trigger: true, actor: 1, stackId: 12, card: artist, ...onStack(12) }),
    ev('life-changed', { actor: 2, delta: -1, ...onStack(11) }),
    ev('resolved', { trigger: true, actor: 1, stackId: 11, card: artist, ...onStack(11) })];
  const lines = historyTurns(events, names)[0].lines;
  assert.deepEqual(lines.map(l => l.text), ['2 gatilhos de Blood Artist: Bruno perdeu 2 de vida.']);
  assert.equal(lines[0].children.length, 2);
});

test('removals and tokens in a row, outside a resolution, are grouped too', () => {
  seq = 0;
  const events = [ev('left', { card: card(1, 'A'), reason: 'destroyed' }), ev('left', { card: card(2, 'B'), reason: 'destroyed' }),
    ev('left', { card: card(3, 'C'), to: 'Exile' }),
    ev('entered', { card: card(4, 'Zombie') }), ev('entered', { card: card(5, 'Zombie') })];
  assert.deepEqual(historyTurns(events, names)[0].lines.map(l => l.text),
    ['2 cartas destruídas: A e B.', 'left C.', '2 × Zombie entraram no campo.']);
});

test('tokens made by a trigger read as one line: "criou 8 fichas de Rabbit"', () => {
  seq = 0;
  const hare = card(5, 'Hare Apparent');
  const events = [ev('ability-activated', { actor: 1, trigger: true, stackId: 9, card: hare, ...onStack(9) }),
    ...Array.from({ length: 8 }, (_, i) => ev('entered', { actor: 1, card: { id: 100 + i, name: 'Rabbit', token: true }, from: null, stackId: 9, ...onStack(9) })),
    ev('resolved', { actor: 1, trigger: true, stackId: 9, card: hare, ...onStack(9) })];
  const [only] = historyTurns(events, names)[0].lines;
  assert.match(only.text, /: criou 8 fichas de Rabbit\.$/);
  assert.equal(only.children.length, 8);
  assert.deepEqual(effectParts([ev('entered', { card: { id: 1, name: 'Rabbit', token: true } }), ev('entered', { card: { id: 2, name: 'Bird', token: true } })], names), ['criou 2 fichas']);
});

test('attackers and blockers list their creatures', () => {
  seq = 0;
  const angel = card(1, 'Serra Angel'), bears = card(2, 'Grizzly Bears');
  const frame = { players: [{ id: 1, battlefield: [angel] }, { id: 2, battlefield: [bears] }], stack: [], combat: [{ attacker: 1, blockers: [2] }] };
  const lines = historyTurns([ev('attackers', { actor: 1, cards: [1], frame }), ev('blockers', { actor: 2, cards: [2], frame })], names)[0].lines;
  assert.deepEqual(lines[0].children.map(c => c.text), ['Serra Angel']);
  assert.deepEqual(lines[1].children.map(c => c.text), ['Grizzly Bears bloqueia Serra Angel']);
});

test('effect summaries and name lists', () => {
  assert.equal(listNames(['a']), 'a');
  assert.equal(listNames(['a', 'b', 'c']), 'a, b e c');
  assert.equal(listNames(['a', 'b', 'c', 'd', 'e', 'f'], 4), 'a, b, c, d e mais 2');
  seq = 0;
  assert.deepEqual(effectParts([ev('left', { card: card(1, 'Elves'), to: 'Exile' }), ev('left', { card: card(2, 'X'), to: 'Hand' }), ev('mill', { actor: 2, milled: [{}, {}] })], names),
    ['exilou Elves', 'devolveu X à mão', 'Bruno moeu 2 cartas']);
});
