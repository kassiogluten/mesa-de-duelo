import test from 'node:test';
import assert from 'node:assert/strict';
const { botBracketMax, botPool, botBrackets, matchSummary } = await import('../src/ui/lobbyBots.ts');
const { botBracketButtonsHTML, botBracketHelp, chosenDeckHTML, publicRoomsStatusText, roomDeckTilesHTML, roomDecksHelp, roomInfoHTML, startLabel, lobbyHTML } = await import('../src/ui/lobbyView.ts');

const deck = (id, bracket, series) => ({ id, name: id, cards: [], builtin: true, bracket, ...(series ? { precon: { series, year: 2024 } } : {}) });
const pool = [deck('a', 2), deck('b', 3, 'S1'), deck('c', 4, 'S2')];
const choice = extra => ({ format: 'commander', botBracket: null, myBracket: undefined, series: undefined, ...extra });

test('bot bracket follows the deck until one is chosen, and rises to the lowest bracket on offer', () => {
  assert.deepEqual(botBrackets(pool), [2, 3, 4]);
  assert.equal(botBracketMax(pool, choice({ myBracket: 3 })), 3);
  assert.equal(botBracketMax(pool, choice({ myBracket: 3, botBracket: 'any' })), null);
  assert.equal(botBracketMax(pool, choice({ botBracket: 1 })), 2, 'below every ready deck');
  assert.equal(botBracketMax(pool, choice({ myBracket: 3, format: 'standard' })), null, 'only with Commander rules');
  assert.deepEqual(botPool(pool, choice({ botBracket: 3 })).map(d => d.id), ['a', 'b']);
  assert.deepEqual(botPool(pool, choice({ format: 'precon', botBracket: 'any', series: 'S2' })).map(d => d.id), ['c']);
});

test('the match in one line', () => {
  const base = { ...choice(), mode: 'ai', playerCount: 4, commanderOpponents: ['random', 'random', 'random'], matchLength: 'bo1', pool, opponent: undefined };
  assert.equal(matchSummary(base), 'Commander · 4 jogadores · computadores aleatórios');
  assert.equal(matchSummary({ ...base, playerCount: 2, commanderOpponents: ['a', 'random', 'random'], botBracket: 3 }), 'Commander · 2 jogadores · contra o computador · até Bracket 3');
  assert.equal(matchSummary({ ...base, mode: 'net' }), 'Commander · Contra outras pessoas');
  assert.equal(matchSummary({ ...base, format: 'standard', matchLength: 'bo3', opponent: { name: 'Elfos' } }), 'Standard · contra Elfos · melhor de três');
  assert.equal(matchSummary({ ...base, format: null }), '');
});

test('lobby texts and pieces', () => {
  assert.match(lobbyHTML(), /id="startMatch"/);
  assert.equal(startLabel({ busy: false, free: false, ai: false, room: false, joining: true }), 'Escolha a sala');
  assert.equal(startLabel({ busy: true, free: true, ai: true, room: true, joining: true }), 'Preparando…');
  assert.equal(publicRoomsStatusText(-1, 0), 'Não foi possível ver as salas agora.');
  assert.equal(publicRoomsStatusText(0, 1), 'Nenhuma sala com lugar. Uma partida em andamento para assistir.');
  assert.equal(publicRoomsStatusText(3, 0), '3 salas públicas abertas.');
  assert.match(botBracketButtonsHTML([2, 3], 3, true), /data-bot-bracket="3" aria-pressed="true" disabled/);
  assert.equal(botBracketHelp({ empty: false, series: false, max: 3, chosen: false, mine: 3 }), 'Os bots jogam com decks até o Bracket 3, o do seu deck.');
  assert.equal(botBracketHelp({ empty: true, series: true, max: 3, chosen: true, mine: 3 }), 'Nenhum deck pronto cabe nessa escolha. Suba o máximo ou desmarque a série.');
  assert.match(chosenDeckHTML(undefined, { format: 'pauper', net: true }), /Sem deck por enquanto/);
  assert.match(chosenDeckHTML(deck('x'), { format: 'pauper', net: false, result: { valid: true } }), /Verificado pelo servidor/);
  assert.equal(roomInfoHTML(null, false), '');
  assert.equal(roomDecksHelp(true, true, 'pauper'), 'Escolhendo o deck…');
  const ctx = { selectedId: '', inRoom: true, format: null, validity: () => '', ptName: n => n };
  assert.equal(roomDeckTilesHTML([], [], ctx, { query: 'zz', roomFormat: 'pauper' }), '<p class="shelf-empty">Nenhum deck corresponde à busca.</p>');
});
