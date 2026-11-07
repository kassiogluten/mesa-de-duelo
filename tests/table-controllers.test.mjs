// Partes da mesa com estado que saíram da forgeTable.ts: o estado da partida, o atalho de passar o turno e a mão.
import test from 'node:test';
import assert from 'node:assert/strict';
const { newMatchState, newSeatState } = await import('../src/ui/tableState.ts');
const { passTurnShortcut } = await import('../src/ui/passMenus.ts');
const { handHTML, hiddenHandHTML, outsideHand } = await import('../src/ui/handView.ts');

function state(input = {}, extra = {}) {
  return { type: 'state', you: 0, activePlayer: 1, gameOver: false, stack: [], combat: [],
    players: [{ id: 0, name: 'Você', battlefield: [], graveyard: [], exile: [], hand: [] }, { id: 1, name: 'Ana', battlefield: [], graveyard: [], exile: [], hand: [] }],
    input: { gen: 4, priority: true, selectable: [], selectablePlayers: [], selectableStacks: [], ok: { enabled: true }, cancel: { enabled: false }, ...input }, ...extra };
}

test('a new match starts clean, and every attach gets its own collections', () => {
  const a = newMatchState(), b = newMatchState();
  assert.equal(a.disconnected, false);
  assert.equal(a.clickedGen, -1);
  assert.equal(a.qState, null);
  a.handOrder.push(3); a.arriving.set(1, 2); a.knownHand.add(5);
  assert.deepEqual(b.handOrder, []);
  assert.equal(b.arriving.size + b.knownHand.size, 0);
  const seats = newSeatState('m1');
  assert.equal(seats.match, 'm1');
  assert.equal(seats.solo, null);
  assert.equal(seats.hidden.size, 0);
});

test('"pass until end of turn" is offered only with priority in another player\'s turn', () => {
  assert.equal(passTurnShortcut(false, state()), 'available');
  assert.equal(passTurnShortcut(false, state({}, { activePlayer: 0 })), 'mine');
  assert.equal(passTurnShortcut(false, state({ priority: false })), 'off');
  assert.equal(passTurnShortcut(false, state({ paying: true })), 'off');
  assert.equal(passTurnShortcut(true, state({ priority: false })), 'on');
});

test('hand fan: playable cards, copies piled together, cards from outside the hand and the watcher\'s hidden hand', () => {
  const s = state({ actionable: [10] }, { castable: [20] });
  s.players[0].graveyard = [{ id: 20, name: 'Gravecrawler' }];
  const extra = outsideHand(s);
  assert.deepEqual(extra.map(e => e.tag), ['Cemitério']);
  const fan = [{ c: { id: 10, name: 'Forest' }, tag: '', copies: [10, 11] }, ...extra];
  const html = handHTML(s, fan, { face: c => `<i>${c.name}</i>`, incoming: id => id === 20, playerName: () => 'Ana' });
  assert.match(html, /class="hcard playable[^"]* pile"/);
  assert.match(html, /×2/);
  assert.match(html, /hcard playable incoming outside/);
  assert.match(html, /<div class="hzone">Cemitério<\/div>/);
  assert.equal((hiddenHandHTML({ handCount: 3 }).match(/hidden-card/g) ?? []).length, 3);
});

test('graveyard and library shelves: cards usable from there sit beside the exile, out of the hand', async () => {
  const { exileShelfHTML } = await import('../src/ui/zoneView.ts');
  const s = state({}, { castable: [20, 21, 22], playableExile: [] });
  s.players[0].graveyard = [{ id: 20, name: 'Faithless Looting' }];
  s.players[1].graveyard = [{ id: 21, name: 'Lingering Souls' }];
  s.players[0].libraryTop = { id: 22, name: 'Lightning Bolt' };
  const html = exileShelfHTML(s, c => `<i>${c.name}</i>`, []);
  assert.match(html, /shelf-group library" [^>]*><span class="exile-shelf-label">Grimório<\/span>[^]*data-fid="22" data-library-top/);
  assert.match(html, /shelf-group gy" [^>]*><span class="exile-shelf-label">Cemitério<\/span>/);
  assert.ok(html.indexOf('Grimório') < html.indexOf('Cemitério'));
  assert.match(html, /title="Cemitério de Ana">Ana</);
  assert.doesNotMatch(html, /Exílio/);
  assert.equal(exileShelfHTML(state(), c => c.name, []), '');
});
