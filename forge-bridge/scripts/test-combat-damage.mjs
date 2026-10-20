// Real-engine regression: node forge-bridge/scripts/test-combat-damage.mjs [ws://127.0.0.1:7171/ws]
// A double block asks the attacker to split combat damage; the bridge enforces lethal-in-order and applies the split.
import assert from 'node:assert/strict';
const url = process.argv[2] || 'ws://127.0.0.1:7171/ws';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const peers = [];
let attacker, defender;
async function connect(name) {
  const peer = { name, ws: new WebSocket(url), state: null, room: null, seen: new Map(), errors: [] };
  peers.push(peer);
  peer.send = message => peer.ws.send(JSON.stringify(message));
  peer.once = message => {
    const key = JSON.stringify(message);
    if (Date.now() - (peer.seen.get(key) ?? 0) > 1750) { peer.seen.set(key, Date.now()); peer.send(message); }
  };
  peer.ws.addEventListener('message', ({data}) => {
    const message = JSON.parse(data);
    if (message.type === 'state') peer.state = message;
    if (message.type === 'room') peer.room = message.room;
    if (['error', 'validation-error'].includes(message.type)) peer.errors.push(message);
  });
  await new Promise((resolve, reject) => {
    peer.ws.addEventListener('open', resolve, {once: true}); peer.ws.addEventListener('error', reject, {once: true});
  });
  return peer;
}
async function until(predicate, label, advance) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > 120000) throw new Error(`Timeout: ${label}`);
    advance?.(); await wait(60);
  }
}
function advance() {
  for (const peer of peers) {
    const state = peer.state;
    if (!state) continue;
    const input = state.input, me = state.players.find(p => p.id === state.you);
    let message;
    if (['play-draw', 'mulligan'].includes(input.opening) && input.ok.enabled) message = {type: 'ok', gen: input.gen};
    else if (state.question) message = state.question.kind === 'confirm'
      ? {type: 'answer', id: state.question.id, value: true} : {type: 'answer', id: state.question.id, indices: [0]};
    else if (input.paying && input.ok.enabled) message = {type: 'ok', gen: input.gen};
    else if (input.priority && input.ok.enabled) {
      if (state.activePlayer === state.you && state.phase === 'MAIN1') {
        if (!attacker && state.players.every(p => p.battlefield.filter(c => c.creature).length >= 2)) {
          attacker = peer; defender = peers.find(p => p !== peer);
        }
        if (attacker === peer) message = {type: 'ok', gen: input.gen};
        else {
          const legal = me.hand.filter(card => input.actionable.includes(card.id));
          const card = legal.find(c => c.land) ?? (me.battlefield.filter(c => c.creature).length < 2 ? legal.find(c => c.creature) : null);
          message = card ? {type: 'card', id: card.id, gen: input.gen} : {type: 'pass-turn', gen: input.gen};
        }
      } else message = {type: 'ok', gen: input.gen};
    } else if (state.phase === 'COMBAT_DECLARE_ATTACKERS' && state.activePlayer === state.you) {
      // Só uma criatura ataca: o defensor bloqueia com as duas dele.
      const card = peer === attacker && !state.combat.length ? me.battlefield.find(c => c.creature) : null;
      message = card ? {type: 'card', id: card.id, gen: input.gen} : input.ok.enabled ? {type: 'ok', gen: input.gen} : null;
    } else if (state.phase === 'CLEANUP') {
      message = input.ok.enabled ? {type: 'ok', gen: input.gen}
        : input.selectable.length ? {type: 'card', id: input.selectable[0], gen: input.gen} : null;
    }
    if (message) peer.once(message);
  }
}
try {
  const a = await connect('Damage A'), b = await connect('Damage B');
  const deck = {name: 'Double block', cards: [{name: 'Forest', count: 8}, {name: 'Grizzly Bears', count: 8}]};
  a.send({type: 'host', name: a.name, deck, config: {format: 'free', matchLength: 'bo1'}});
  await until(() => a.room?.code, 'room');
  b.send({type: 'join', code: a.room.code, name: b.name, deck});
  await until(() => defender?.state?.input.blocking && defender.state.combat.length === 1, 'one attacker, two possible blockers', advance);
  const blocking = defender.state.input.blocking;
  const target = blocking.attackers[0];
  for (const blocker of blocking.blockers.slice(0, 2)) {
    defender.send({type: 'block', attacker: target, blocker, gen: defender.state.input.gen});
    await until(() => defender.state.combat[0].blockers.includes(blocker), 'block ' + blocker);
  }
  defender.send({type: 'ok', gen: defender.state.input.gen});
  await until(() => attacker.state?.question?.purpose === 'combat-damage', 'damage split question', () => {
    for (const peer of peers) { const s = peer.state; if (s && !s.question && s.input.priority && s.input.ok.enabled) peer.once({type: 'ok', gen: s.input.gen}); }
  });
  const q = attacker.state.question;
  assert.equal(q.kind, 'amount'); assert.equal(q.total, 2); assert.equal(q.options.length, 2);
  assert.deepEqual(q.options.map(o => o.lethal), [2, 2]);
  assert.deepEqual(q.suggested, [2, 0]);
  const [first, second] = q.options.map(o => o.card.id);
  // A split that doesn't add up to the attacker's power is always refused.
  attacker.send({type: 'answer', id: q.id, amounts: [1, 0]});
  await until(() => attacker.errors.length > 0, 'wrong total rejection');
  assert.match(attacker.errors.at(-1).text ?? JSON.stringify(attacker.errors.at(-1)), /quantidade/);
  attacker.errors.length = 0;
  if (q.ordered) {
    attacker.send({type: 'answer', id: q.id, amounts: [1, 1]});
    await until(() => attacker.errors.length > 0, 'lethal-in-order rejection');
    assert.match(attacker.errors.at(-1).text ?? JSON.stringify(attacker.errors.at(-1)), /letal/);
    attacker.errors.length = 0;
  }
  attacker.send({type: 'answer', id: q.id, amounts: [0, 2].map((n, i) => q.ordered ? [2, 0][i] : n)});
  const killed = q.ordered ? first : second, alive = q.ordered ? second : first;
  const dp = () => defender.state.players.find(p => p.id === defender.state.you);
  await until(() => dp().graveyard.some(c => c.id === killed), 'chosen blocker dies');
  assert.ok(dp().battlefield.some(c => c.id === alive), 'the other blocker took no damage and survives');
  console.log(`PASS combat damage: double block asked the attacker (ordered=${q.ordered}), rejected an illegal split and applied the chosen one`);
} finally {
  for (const peer of peers) if (peer.ws.readyState === WebSocket.OPEN) peer.send({type: 'leave'});
  await wait(300); for (const peer of peers) peer.ws.close();
}
