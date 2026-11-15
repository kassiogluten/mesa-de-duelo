import test from 'node:test';
import assert from 'node:assert/strict';

// As jogadas simuladas do laboratório de efeitos rodam numa mesa falsa, com os passos na hora (sem esperar os atrasos).
globalThis.window = { setTimeout: fn => { fn(); return 0; } };
globalThis.clearTimeout = () => {};
const { createLabPlays, PLAY_BUTTONS, playButtons } = await import('./fixtures/effectsLabPlays.ts');

const ME = 10, OPP = 23;
const KINDS = {
  big: { name: 'Colossal Dreadmaw', creature: true, power: 6, toughness: 6, keywords: ['TRAMPLE'] },
  hawk: { name: 'Vampire Nighthawk', creature: true, power: 2, toughness: 3, keywords: ['FLYING', 'DEATHTOUCH', 'LIFELINK'] },
  blade: { name: 'Boros Swiftblade', creature: true, power: 1, toughness: 2, keywords: ['DOUBLE_STRIKE'] },
  knight: { name: 'White Knight', creature: true, power: 2, toughness: 2, keywords: ['FIRST_STRIKE'] },
  small: { name: 'Grizzly Bears', creature: true, power: 2, toughness: 2 },
  ramgang: { name: 'Boggart Ram-Gang', creature: true, power: 3, toughness: 3, keywords: ['WITHER'] },
  spawn: { name: 'Aboleth Spawn', creature: true, power: 2, toughness: 3 },
  myr: { name: 'Darksteel Myr', creature: true, power: 0, toughness: 1, keywords: ['INDESTRUCTIBLE'] },
  token: { name: 'Goblin', creature: true, token: true, power: 1, toughness: 1 },
  artifact: { name: 'Sol Ring' },
  land: { name: 'Forest', land: true },
};

function fakeTable() {
  let id = 1000;
  const events = [], commands = [];
  const players = [ME, OPP].map(pid => ({ id: pid, life: 20, battlefield: [], graveyard: [], exile: [], hand: [], pool: {} }));
  const state = { turn: 6, stack: [], combat: [], input: {}, phase: 'MAIN1', activePlayer: ME };
  const player = pid => players.find(p => p.id === pid);
  const lab = {
    ME, OPP, state: () => state, player, newId: () => id++,
    add(side, template) { const c = { id: id++, controller: side === 'me' ? ME : OPP, tapped: false, ...structuredClone(KINDS[template]) }; player(c.controller).battlefield.push(c); return c; },
    card: (name, extra = {}) => ({ name, ...extra }),
    creature: (name, power, toughness, manaCost, keywords = []) => ({ name, creature: true, power, toughness, manaCost, keywords }),
    emit: (type, extra) => events.push({ type, ...extra }),
    flush() {},
    damage: (source, target, amount, flags = {}) => events.push({ type: 'damage', from: source.name, target, amount, ...flags }),
    settle: () => events.push({ type: 'settle' }),
    lifeChange: (pid, delta) => { player(pid).life += delta; events.push({ type: 'life-changed', actor: pid, delta }); },
    leave(c, to, reason) { const owner = player(c.controller); owner.battlefield = owner.battlefield.filter(x => x !== c); events.push({ type: 'left', name: c.name, to, reason }); },
    combat: (attacker, target) => events.push({ type: 'combat', from: attacker.name, target }),
    run: c => commands.push(c),
  };
  return { lab, events, commands, players, state };
}

test('every lab play button runs and sends events or panel commands, with a note for the panel', () => {
  const keys = PLAY_BUTTONS.flatMap(([, list]) => list.map(([key]) => key));
  assert.equal(keys.length, 17);
  for (const key of keys) {
    const t = fakeTable();
    const note = createLabPlays(t.lab).start(key);
    assert.ok(note && note.length > 20, `${key}: no note`);
    assert.ok(t.events.length + t.commands.length > 1, `${key}: nothing happened`);
    assert.ok(playButtons().includes(`data-play="${key}"`), `${key}: no button`);
  }
});

test('combat play: attackers, then blockers, first strike before regular damage, and the dead are settled after each step', () => {
  const t = fakeTable();
  createLabPlays(t.lab).start('combat');
  const order = t.events.map(e => e.type);
  assert.ok(order.indexOf('attackers') < order.indexOf('blockers'));
  const steps = t.events.filter(e => e.type === 'damage').map(e => e.step);
  assert.deepEqual([...new Set(steps)], ['first-strike', 'regular']);
  assert.ok(t.events.some(e => e.type === 'damage' && e.trample && e.target.player === OPP && e.amount === 4), 'trample overflow to the opponent');
  assert.equal(t.events.filter(e => e.type === 'settle').length, 2);
  assert.ok(t.state.combat.length === 0, 'combat cleaned up at the end');
});

test('wrath destroys every creature but the indestructible one, then the spell resolves to the graveyard', () => {
  const t = fakeTable();
  createLabPlays(t.lab).start('wrath');
  const destroyed = t.events.filter(e => e.type === 'left' && e.reason === 'destroyed').map(e => e.name);
  assert.equal(destroyed.length, 8, "four of yours and four of theirs");
  assert.ok(!destroyed.includes('Darksteel Myr'));
  const last = t.events.at(-1);
  assert.equal(last.type, 'resolved'); assert.equal(last.card.name, 'Wrath of God'); assert.equal(last.to, 'Graveyard');
});

test('the counter play: the spell is cast, the counterspell answers it with a target, resolves, and the spell is countered', () => {
  const t = fakeTable();
  createLabPlays(t.lab).start('counter');
  const seq = t.events.filter(e => ['spell-cast', 'resolved', 'countered'].includes(e.type)).map(e => `${e.type}:${e.card.name}`);
  assert.deepEqual(seq, ['spell-cast:Serra Angel', 'spell-cast:Counterspell', 'resolved:Counterspell', 'countered:Serra Angel']);
  assert.deepEqual(t.state.stack, []);
});

test('paying plays tap the lands one by one while paying, and only then cast', () => {
  const t = fakeTable();
  const inputs = [];
  const plays = createLabPlays({ ...t.lab, run: c => { inputs.push(['run', c.kind, t.state.input.paying]); t.commands.push(c); } });
  plays.start('bolt');
  assert.deepEqual(inputs.at(-1), ['run', 'bolt', false], 'the bolt is cast after paying');
  assert.ok(t.players[0].battlefield.find(c => c.name === 'Mountain').tapped, 'the Mountain paid');
});
