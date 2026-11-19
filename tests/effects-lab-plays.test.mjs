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
    leave(c, to, reason, extra = {}) { const owner = player(c.controller); owner.battlefield = owner.battlefield.filter(x => x !== c); events.push({ type: 'left', name: c.name, to, reason, ...extra }); },
    combat: (attacker, target) => events.push({ type: 'combat', from: attacker.name, target }),
    run: c => commands.push(c),
  };
  return { lab, events, commands, players, state };
}

test('every lab play button runs and sends events or panel commands, with a note for the panel', () => {
  const keys = PLAY_BUTTONS.flatMap(([, list]) => list.map(([key]) => key));
  assert.equal(keys.length, 32);
  for (const key of keys) {
    const t = fakeTable();
    const note = createLabPlays(t.lab).start(key);
    assert.ok(note && note.length > 20, `${key}: no note`);
    assert.ok(t.events.length + t.commands.length > 1, `${key}: nothing happened`);
    assert.ok(playButtons().includes(`data-play="${key}"`), `${key}: no button`);
  }
});

test('ward plays: the trigger names the Bolt it answered; unpaid it counters the Bolt and holds, paid the Bolt resolves', () => {
  for (const paid of [false, true]) {
    const t = fakeTable();
    createLabPlays(t.lab).start(paid ? 'wardPaid' : 'ward');
    const cast = t.events.find(e => e.type === 'spell-cast');
    const ward = t.events.find(e => e.type === 'ability-activated');
    assert.ok(ward.ward && ward.trigger);
    assert.equal(ward.card.name, 'Aboleth Spawn');
    assert.equal(ward.wardAgainst, cast.stackId);
    const end = t.events.find(e => e.type === 'resolved' && e.ward);
    assert.equal(end.held, !paid);
    assert.equal(t.events.some(e => e.type === 'countered' && e.stackId === cast.stackId), !paid);
    assert.equal(t.events.some(e => e.type === 'damage' && e.amount === 3), paid);
    assert.equal(t.state.stack.length, 0, 'stack empty at the end');
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
  // Como a ponte manda: cada saída com o número da pilha da mágica que resolve, para a mesa juntar o limpa campo.
  assert.ok(t.events.filter(e => e.type === 'left').every(e => e.stackId === last.stackId));
});

test('wrath says the indestructible one stayed, with the stack number of the spell, before it resolves', () => {
  const t = fakeTable();
  createLabPlays(t.lab).start('wrath');
  const stayed = t.events.filter(e => e.type === 'survived');
  assert.deepEqual(stayed.map(e => [e.card.name, e.survived]), [['Darksteel Myr', 'indestructible']]);
  assert.equal(stayed[0].stackId, t.events.at(-1).stackId);
});

test('the new effect plays send what the server would: extra turn, copies, kicker, X, cascade, survived and phasing', () => {
  const run = key => { const t = fakeTable(); createLabPlays(t.lab).start(key); return t; };
  assert.ok(run('extraTurn').events.some(e => e.type === 'turn' && e.extra));
  const storm = run('storm');
  const copies = storm.events.filter(e => e.type === 'spell-cast' && e.copy);
  assert.equal(copies.length, 4);
  assert.ok(copies.every(e => e.card.name === 'Grapeshot' && e.actor === ME));
  assert.equal(storm.events.filter(e => e.type === 'damage').length, 5, 'four copies and the original');
  assert.equal(storm.state.stack.length, 0);
  assert.ok(run('kicker').events.some(e => e.type === 'spell-cast' && e.kicked && e.x === undefined));
  assert.ok(run('xspell').events.some(e => e.type === 'spell-cast' && e.x === 6));
  const cascade = run('cascade');
  const dig = cascade.events.find(e => e.type === 'cascade');
  assert.equal(dig.revealed.length, 5);
  assert.equal(dig.hit, dig.revealed.at(-1).id);
  const free = cascade.events.find(e => e.type === 'spell-cast' && e.from === 'Exile');
  assert.equal(free.card.id, dig.hit);
  assert.ok(cascade.events.indexOf(dig) < cascade.events.indexOf(free));
  assert.equal(cascade.state.stack.length, 0);
  assert.ok(run('regenerate').events.some(e => e.type === 'survived' && e.survived === 'regenerated'));
  const phasing = run('phasing').events.filter(e => e.type === 'phased');
  assert.deepEqual(phasing.map(e => !!e.out), [true, true, false, false]);
  const strikes = run('doubleStrike').events.filter(e => e.type === 'damage').map(e => e.step);
  assert.deepEqual(strikes, ['first-strike', 'regular']);
});

test('the other sweeps: bounce and exile carry the stack number; pyroclasm damages every creature, resolves, then settles the dead', () => {
  for (const [key, to] of [['evacuation', 'Hand'], ['eviction', 'Exile']]) {
    const t = fakeTable();
    createLabPlays(t.lab).start(key);
    const left = t.events.filter(e => e.type === 'left');
    assert.equal(left.length, 9, key);
    assert.ok(left.every(e => e.to === to && e.stackId === t.events.at(-1).stackId), key);
  }
  const t = fakeTable();
  createLabPlays(t.lab).start('pyroclasm');
  const order = t.events.map(e => e.type).filter(type => ['damage', 'resolved', 'settle'].includes(type));
  assert.deepEqual([...new Set(order)], ['damage', 'resolved', 'settle']);
  assert.equal(t.events.filter(e => e.type === 'damage').length, 8);
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
