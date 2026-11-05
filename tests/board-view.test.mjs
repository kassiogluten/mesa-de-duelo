// O campo (permanentView.ts) e os assentos dos jogadores (seatView.ts), desenhados a partir do estado.
import test from 'node:test';
import assert from 'node:assert/strict';
const { backRow, bfCard, fieldRow, isBackRow, loyaltyHTML } = await import('../src/ui/permanentView.ts');
const { avatar, damageButton, focusDecisionText, opponentSeat, piles, seatRow } = await import('../src/ui/seatView.ts');

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
