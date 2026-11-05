// Partes sem DOM que saíram da forgeTable.ts: achar cartas, a cor da mana, os textos do Forge, os marcadores que
// mudaram, o pedido da caixa de ação, o cemitério que abre sozinho no alvo e os botões do pedido.
import test from 'node:test';
import assert from 'node:assert/strict';
const { findCard, manaTone, fixForgeText, trackCounterBumps } = await import('../src/ui/tableCards.ts');
const { boardPrompt, instructionLines } = await import('../src/ui/tableActionBox.ts');
const { graveyardTargeting, zoneKindOf } = await import('../src/ui/tableZone.ts');
const { inputActionAllowed } = await import('../src/ui/tableInputActions.ts');

function player(id, name, extra = {}) {
  return { id, name, battlefield: [], graveyard: [], exile: [], hand: [], ...extra };
}
function state(input = {}, extra = {}) {
  return { type: 'state', you: 0, activePlayer: 0, gameOver: false, stack: [], combat: [],
    players: [player(0, 'Você'), player(1, 'Ana')],
    input: { gen: 4, priority: true, message: '', selectable: [], selectablePlayers: [], selectableStacks: [], ok: { enabled: true }, cancel: { enabled: false }, ...input }, ...extra };
}
const choices = (over = {}) => ({ attackAll: false, attackSelected: 0, pinned: () => null, blocker: () => null, vote: () => 'Vote.', ...over });

test('findCard looks in the zones, the stack and, when asked, in what the prompt cites', () => {
  const s = state({ card: { id: 50, name: 'Prompt' } });
  s.players[1].graveyard = [{ id: 7, name: 'Morta' }];
  s.stack = [{ id: 100, source: { id: 9, name: 'Na pilha' } }];
  assert.equal(findCard(s, null, 7).name, 'Morta');
  assert.equal(findCard(s, null, 9).name, 'Na pilha');
  assert.equal(findCard(s, null, 50).name, 'Prompt');
  assert.equal(findCard(s, null, 50, false), undefined);
  assert.equal(findCard(null, null, 7), undefined);
});

test('the mana flying from a land takes its colour; several colours are gold and none is grey', () => {
  assert.equal(manaTone({ id: 1, name: 'Forest', typeLine: 'Basic Land — Forest', land: true }), '#58c878');
  assert.equal(manaTone({ id: 2, name: 'Breeding Pool', typeLine: 'Land — Forest Island', land: true }), '#f2b54c');
  assert.equal(manaTone({ id: 3, name: 'Llanowar Elves', manaCost: '{G}' }), '#58c878');
  assert.equal(manaTone({ id: 4, name: 'Sol Ring', manaCost: '{1}' }), '#dadada');
  assert.equal(manaTone(undefined), undefined);
});

test('Forge possessives become Portuguese in the prompt, the question and its options', () => {
  const s = state({ message: "Procurar você's grimório?" }, { question: { id: 1, title: "Olhando as cartas em Ana's mão", options: ["Ana's cemitério", { label: 'carta' }] } });
  fixForgeText(s);
  assert.equal(s.input.message, 'Procurar seu grimório?');
  assert.equal(s.question.title, 'Olhando as cartas na mão de Ana');
  assert.equal(s.question.options[0], 'O cemitério de Ana');
  assert.deepEqual(s.question.options[1], { label: 'carta' });
});

test('a player counter bumps only when it changes and stays above zero', () => {
  const last = new Map();
  assert.equal(trackCounterBumps(last, [player(0, 'Você', { counters: { POISON: 1 } })]).size, 0);
  const bumps = trackCounterBumps(last, [player(0, 'Você', { counters: { POISON: 2 }, monarch: true })]);
  assert.deepEqual([...bumps.get(0)].sort(), ['MONARCH', 'POISON']);
  assert.equal(trackCounterBumps(last, [player(0, 'Você', { counters: {} })]).size, 0);
});

test('the action box prompt: attack, blocking, vote, priority and the opening', () => {
  assert.equal(boardPrompt(state({ attacking: { attackers: [] } }), choices()), 'Selecione suas criaturas e escolha quem atacar, ou escolha o defensor primeiro.');
  assert.equal(boardPrompt(state({ attacking: { attackers: [] } }), choices({ attackSelected: 2 })), '2 criaturas selecionadas: escolha quem atacar.');
  assert.equal(boardPrompt(state({ attacking: { attackers: [] } }), choices({ attackAll: true })), 'Atacar com tudo: escolha quem atacar.');
  assert.match(boardPrompt(state({ attacking: { attackers: [] } }), choices({ pinned: () => 'Ana' })), /^Atacar Ana: escolha suas criaturas/);
  assert.match(boardPrompt(state({ blocking: { blockers: [], attackers: [] } }), choices({ blocker: () => 'Urso' })), /^Urso: escolha o atacante/);
  assert.equal(boardPrompt(state({ vote: { card: { id: 1 } } }), choices()), 'Vote.');
  assert.equal(boardPrompt(state({ message: 'Passar?' }), choices()), '');
  assert.equal(boardPrompt(state({ priority: false, message: 'Escolha.' }), choices()), 'Escolha.');
  assert.equal(boardPrompt(state({ priority: false, opening: 'mulligan-bottom', message: 'Devolva 1 carta(s).' }), choices()), 'Devolva 1 carta.');
  assert.equal(boardPrompt(state({ priority: false, opening: 'mulligan' }), choices()), '');
  assert.equal(boardPrompt(state({}, { gameOver: true }), choices({ vote: () => assert.fail('only read when voting') })), '');
});

test('the Forge sends "Card (id) - ability" before the request: the request comes first', () => {
  assert.deepEqual(instructionLines('Choque (12) - Causa 2 de dano.\n\nEscolha um alvo.', false), ['Escolha um alvo.', '', 'Choque (12) - Causa 2 de dano.']);
  assert.deepEqual(instructionLines('Choque (12) - Causa 2 de dano.\n\nEscolha um alvo.', true), ['Choque (12) - Causa 2 de dano.', '', 'Escolha um alvo.']);
});

test('the graveyard opens by itself only when every target is in graveyards, yours first', () => {
  const s = state({ targeting: { source: 3, kind: 'spell' }, selectable: [20, 21] });
  s.players[0].graveyard = [{ id: 20 }];
  s.players[1].graveyard = [{ id: 21 }];
  assert.deepEqual(graveyardTargeting(s), { key: '3:spell:', player: 0 });
  s.input.selectable = [20, 21, 30];
  assert.equal(graveyardTargeting(s), null);
  assert.equal(graveyardTargeting(state()), null);
  assert.equal(zoneKindOf('exile'), 'exile');
  assert.equal(zoneKindOf(undefined), 'gy');
});

test('end of turn needs your own empty-stack priority; resolve all needs two items on the stack', () => {
  assert.equal(inputActionAllowed(state(), 'pass-turn'), true);
  assert.equal(inputActionAllowed(state({}, { activePlayer: 1 }), 'pass-turn'), false);
  assert.equal(inputActionAllowed(state(), 'resolve-all'), false);
  assert.equal(inputActionAllowed(state({}, { stack: [{ id: 1 }, { id: 2 }] }), 'resolve-all'), true);
  assert.equal(inputActionAllowed(state(), 'cancel'), false);
  assert.equal(inputActionAllowed(state(), 'ok'), true);
});
