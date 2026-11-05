// O campo (permanentView.ts) e os assentos dos jogadores (seatView.ts), desenhados a partir do estado.
import test from 'node:test';
import assert from 'node:assert/strict';
const { backRow, bfCard, fieldRow, isBackRow, loyaltyHTML } = await import('../src/ui/permanentView.ts');
const { avatar, damageButton, focusDecisionText, lifeCardLines, opponentSeat, piles, seatRow } = await import('../src/ui/seatView.ts');

const card = (id, name, extra = {}) => ({ id, name, controller: 0, tapped: false, token: false, ...extra });
const bear = (id, extra) => card(id, 'Grizzly Bears', { creature: true, power: 2, toughness: 2, typeLine: 'Creature — Bear', ...extra });
const forest = (id, extra) => card(id, 'Forest', { land: true, typeLine: 'Basic Land — Forest', ...extra });
function state(battlefield = [], input = {}, extra = {}) {
  return { type: 'state', you: 0, turn: 3, activePlayer: 0, gameOver: false, stack: [], combat: [],
    players: [{ id: 0, name: 'Você', life: 20, pool: {}, battlefield, graveyard: [], exile: [], hand: [], library: 30 },
      { id: 1, name: 'Ana', life: 17, pool: {}, battlefield: [], graveyard: [card(70, 'Shock')], exile: [], hand: [], library: 25, handCount: 4 }],
    input: { gen: 7, priority: true, selectable: [], selectablePlayers: [], selectableStacks: [], ok: { enabled: true }, cancel: { enabled: false }, ...input }, ...extra };
}
const view = {
  face: c => `<i class="face">${c.name}</i>`, faceStyle: () => 'full', playerName: id => (id === 0 ? 'você' : 'Ana'), openCounter: null,
  lastDamage: new Map(), selectedBlocker: null, compact: false, attackSelected: () => false, attackTargets: () => [],
  image: () => undefined, portraits: [], matArt: () => undefined, counterBumps: new Map(), spellsTotal: 0, activePlayer: 0,
  cardName: () => 'Comandante', seats: { match: '', hidden: new Set(), solo: null, retired: new Set(), focus: null }, seatMemory: { hidden: new Set(), solo: null, retired: new Set(), focus: null }, seatTurn: null,
};

test('lands, artifacts and enchantments go to the back row; creatures and planeswalkers stay in front', () => {
  assert.equal(isBackRow(forest(1)), true);
  assert.equal(isBackRow(card(2, 'Sol Ring', { typeLine: 'Artifact' })), true);
  assert.equal(isBackRow(bear(3)), false);
  assert.equal(isBackRow(card(4, 'Jace', { planeswalker: true, typeLine: 'Legendary Planeswalker — Jace' })), false);
});

test('identical copies stack with a counter, and a tapped land stays apart from the untapped ones', () => {
  const lands = [forest(1), forest(2), forest(3, { tapped: true })];
  const s = state(lands);
  const html = backRow(view, s, s.players[0]);
  assert.match(html, /data-group="1,2"[^>]*>×2</);
  assert.equal((html.match(/class="stack"/g) ?? []).length, 2);
  // No celular, os terrenos virados de nomes diferentes viram um monte só.
  const mixed = state([forest(1, { tapped: true }), card(2, 'Island', { land: true, tapped: true })]);
  assert.match(backRow({ ...view, compact: true }, mixed, mixed.players[0]), /Terrenos virados/);
});

test('a creature shows power and toughness with damage, summoning sickness and its keywords', () => {
  const s = state([bear(5, { damage: 1, sick: true, keywords: ['FLYING'] })]);
  const html = bfCard(view, s, s.players[0].battlefield[0]);
  assert.match(html, /<span class="pt"><b class="">2<\/b>\/<b class="down">1<\/b><\/span>/);
  assert.match(html, /title="Enjoo de invocação"/);
  assert.match(html, /aria-label="Voar"/);
  assert.match(html, /\bhit\b/, 'mais dano do que no desenho anterior: a carta pisca');
  assert.match(fieldRow(view, s, s.players[0].battlefield), /data-fid="5"/);
  assert.equal(loyaltyHTML(s, 9, 3), '<span class="pt loyalty" title="Lealdade"><b>3</b></span>');
});

test('player pieces: portrait, piles, commander damage and the focus warning', () => {
  const s = state();
  const opp = s.players[1];
  assert.match(avatar(view, s, opp, 1), /aria-label="Ana, 17 de vida/);
  assert.match(piles(view, s, opp), /Ver cemitério de Ana \(1\)/);
  assert.equal(damageButton(opp), '');
  assert.match(damageButton({ ...opp, commanderDamage: [{ commanderId: 90, damage: 16 }] }), /commander-damage danger[\s\S]*16\/21/);
  assert.match(seatRow('fLands-1', 'lands', 'Ana', ''), /terrenos de Ana/);
  assert.equal(focusDecisionText(state([], { blocking: { blockers: [], attackers: [] } })), 'Você está sendo atacado: declare os bloqueadores.');
  assert.equal(focusDecisionText(state([], { priority: true }, { activePlayer: 0 })), 'É o seu turno.');
});

test('an opponent seat hidden by "only this one" is marked when the table forces it into view', () => {
  const s = state();
  const seats = { ...view.seats, solo: 2 };
  const html = opponentSeat({ ...view, seats }, s, s.players[1], 0, 2, 'atacando você');
  assert.match(html, /table-seat[^"]* forced/);
  assert.match(html, /À vista: atacando você/);
});

test('cards exiled by a permanent (Journey to Nowhere) peek out under it with the name, and the inspector names the link', async () => {
  const { exiledNotes, exiledUnder } = await import('../src/ui/exiledUnder.ts');
  const journey = card(40, 'Journey to Nowhere', { typeLine: 'Enchantment', exiling: [80, 99] });
  const s = state([journey, forest(41), forest(42)]);
  // A carta exilada é do oponente: fica no exílio dele. O 99 já saiu do exílio e não aparece.
  s.players[1].exile = [bear(80, { controller: 1 })];
  assert.deepEqual(exiledUnder(s, 40).map(c => c.id), [80]);
  const html = bfCard(view, s, journey);
  assert.match(html, /class="slot has-exu"/);
  assert.match(html, /class="exu" data-fid="80"[^>]*aria-label="Grizzly Bears, exilada por Journey to Nowhere"/);
  assert.match(html, /class="exu-name">.*Grizzly Bears<\/span>/);
  assert.match(html, /aria-label="Journey to Nowhere[^"]*exilando Grizzly Bears"/);
  assert.doesNotMatch(html, /class="exu-n"/, 'one card needs no counter');
  assert.deepEqual(exiledNotes(s, journey), ['Exilando: Grizzly Bears.']);
  assert.deepEqual(exiledNotes(s, s.players[1].exile[0]), ['Exilada por Journey to Nowhere, que está no campo.']);
  // Com a permanente ao lado de uma cópia igual, ela fica sozinha na pilha (cada uma exilou uma carta diferente).
  const twin = card(43, 'Journey to Nowhere', { typeLine: 'Enchantment' });
  const both = state([journey, twin]); both.players[1].exile = s.players[1].exile;
  assert.equal((backRow(view, both, both.players[0]).match(/class="stack"/g) ?? []).length, 2);
});

test('several exiled cards: up to three peek out, with the count and a list of all; face-down ones keep the secret', async () => {
  const bridge = card(50, 'Mosswort Bridge', { land: true, typeLine: 'Land', exiling: [81, 82, 83, 84] });
  const s = state([bridge]);
  s.players[0].exile = [card(81, '', { faceDown: true }), bear(82), bear(83), bear(84)];
  const html = bfCard(view, s, bridge);
  assert.equal((html.match(/class="exu[" ]/g) ?? []).length, 3);
  assert.match(html, /class="exu-n" data-group="81,82,83,84" data-group-title="Exiladas por Mosswort Bridge"/);
  assert.match(html, /exu-name">.*4 exiladas</);
  const { exiledNotes } = await import('../src/ui/exiledUnder.ts');
  assert.deepEqual(exiledNotes(s, bridge), ['Exilando: uma carta virada para baixo, Grizzly Bears, Grizzly Bears e Grizzly Bears.']);
});

test('cartão da vida do oponente: nome, tempo do turno, mão e dano de cada comandante com o dono', () => {
  const s = state();
  s.players[0].commanders = [{ id: 90, name: 'Ghalta', casts: 1, tax: 2 }];
  const ana = { ...s.players[1], bracket: 3, lastTurnMs: 72000, commanderDamage: [{ commanderId: 90, damage: 8 }, { commanderId: 91, damage: 0 }] };
  const lines = lifeCardLines({ cardName: id => (id === 90 ? 'Ghalta' : '?') }, s, ana).join('\n');
  assert.match(lines, /<b>Ana<\/b>/);
  assert.match(lines, /Bracket 3/);
  assert.match(lines, /Último turno: 1:12/);
  assert.match(lines, /4 cartas na mão/);
  assert.match(lines, /Dano de Ghalta \(seu\): <b class="life-card-damage">8\/21<\/b>/);
  assert.doesNotMatch(lines, /\?/);
  // No turno dela, o tempo corre junto com o relógio do topo.
  assert.match(lifeCardLines(view, { ...s, activePlayer: 1, turnElapsedMs: 95000 }, ana).join(''), /Turno atual: <span data-turn-timer>1:35<\/span>/);
});

test('a vida do oponente abre o cartão ao tocar; a sua continua só com o bracket', () => {
  const s = state();
  const opp = avatar(view, s, s.players[1], 1);
  assert.match(opp, /class="life has-card" data-ctr="life-1"/);
  assert.match(opp, /life-tip life-card/);
  assert.doesNotMatch(avatar(view, s, s.players[0], 0), /has-card/);
});
