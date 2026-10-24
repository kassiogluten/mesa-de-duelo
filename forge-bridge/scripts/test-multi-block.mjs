// Real-engine regression: node forge-bridge/scripts/test-multi-block.mjs [ws://127.0.0.1:7171/ws]
// One blocker (Night Market Guard, "can block an additional creature") blocks two attackers: the bridge asks the
// blocker's controller to split its combat damage, with the same question the attacker gets in a double block.
import assert from 'node:assert/strict';
const url = process.argv[2] || 'ws://127.0.0.1:7171/ws';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const peers = [];
const GUARD = 'Night Market Guard';
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
    if (Date.now() - start > 180000) throw new Error(`Timeout: ${label}`);
    advance?.(); await wait(60);
  }
}
const mine = state => state.players.find(p => p.id === state.you);
const theirs = state => state.players.find(p => p.id !== state.you);
let attacker, defender;
/** Bears on the attacker's side, ready to attack, and the guard already on the defender's side. */
const ready = () => {
  const s = attacker.state;
  return !!s && mine(s).battlefield.filter(c => c.creature && !c.sick && !c.tapped).length >= 2
    && theirs(s).battlefield.some(c => c.name === GUARD && !c.tapped);
};
function advance() {
  for (const peer of peers) {
    const state = peer.state;
    if (!state) continue;
    const input = state.input, me = mine(state);
    let message;
    if (['play-draw', 'mulligan'].includes(input.opening) && input.ok.enabled) message = {type: 'ok', gen: input.gen};
    else if (state.question) message = state.question.kind === 'confirm'
      ? {type: 'answer', id: state.question.id, value: true} : {type: 'answer', id: state.question.id, indices: [0]};
    else if (input.paying && input.ok.enabled) message = {type: 'ok', gen: input.gen};
    else if (input.priority && input.ok.enabled) {
      if (state.activePlayer === state.you && state.phase === 'MAIN1') {
        const legal = me.hand.filter(card => input.actionable.includes(card.id));
        const card = legal.find(c => c.land) ?? legal.find(c => c.creature);
        message = card ? {type: 'card', id: card.id, gen: input.gen}
          : peer === attacker && ready() ? {type: 'ok', gen: input.gen} : {type: 'pass-turn', gen: input.gen};
      } else message = {type: 'ok', gen: input.gen};
    } else if (state.phase === 'COMBAT_DECLARE_ATTACKERS' && state.activePlayer === state.you) {
      const bears = peer === attacker && ready() ? me.battlefield.filter(c => c.creature && !c.sick && !c.tapped).slice(0, 2) : [];
      const next = bears.find(c => !state.combat.some(fight => fight.attacker === c.id));
      message = next ? {type: 'card', id: next.id, gen: input.gen} : input.ok.enabled ? {type: 'ok', gen: input.gen} : null;
    } else if (state.phase === 'CLEANUP') {
      message = input.ok.enabled ? {type: 'ok', gen: input.gen}
        : input.selectable.length ? {type: 'card', id: input.selectable[0], gen: input.gen} : null;
    }
    if (message) peer.once(message);
  }
}
try {
  const a = await connect('Bears'), b = await connect('Guard');
  attacker = a; defender = b;
  a.send({type: 'host', name: a.name, deck: {name: 'Bears', cards: [{name: 'Forest', count: 8}, {name: 'Grizzly Bears', count: 8}]}, config: {format: 'free', matchLength: 'bo1'}});
  await until(() => a.room?.code, 'room');
  b.send({type: 'join', code: a.room.code, name: b.name, deck: {name: 'Guard', cards: [{name: 'Wastes', count: 9}, {name: GUARD, count: 7}]}});
  await until(() => defender.state?.input.blocking && defender.state.combat.length === 2, 'two attackers, one guard', advance);
  const blocking = defender.state.input.blocking;
  const guard = mine(defender.state).battlefield.find(c => c.name === GUARD && blocking.blockers.includes(c.id));
  assert.ok(guard, 'the guard can block');
  for (const target of blocking.attackers.slice(0, 2)) {
    defender.send({type: 'block', attacker: target, blocker: guard.id, gen: defender.state.input.gen});
    await until(() => defender.state.combat.find(fight => fight.attacker === target)?.blockers.includes(guard.id), 'guard blocks ' + target);
  }
  defender.send({type: 'ok', gen: defender.state.input.gen});
  await until(() => defender.state?.question?.purpose === 'combat-damage', 'blocker damage split question', () => {
    for (const peer of peers) { const s = peer.state; if (s && !s.question && s.input.priority && s.input.ok.enabled) peer.once({type: 'ok', gen: s.input.gen}); }
  });
  assert.ok(!attacker.state.question, 'each attacker has a single blocker: nothing to split on the attacking side');
  const q = defender.state.question;
  assert.equal(q.kind, 'amount'); assert.equal(q.card.id, guard.id); assert.equal(q.total, 3);
  assert.equal(q.options.length, 2); assert.deepEqual(q.options.map(o => o.lethal), [2, 2]);
  assert.ok(q.options.every(o => !o.defender), 'a blocker never deals damage to a player');
  // A split that doesn't add up to the blocker's power is always refused.
  defender.send({type: 'answer', id: q.id, amounts: [1, 1]});
  await until(() => defender.errors.length > 0, 'wrong total rejection');
  defender.errors.length = 0;
  const [first, second] = q.options.map(o => o.card.id);
  const split = q.ordered ? [2, 1] : [1, 2];
  defender.send({type: 'answer', id: q.id, amounts: split});
  const killed = split[0] >= 2 ? first : second, alive = killed === first ? second : first;
  const ap = () => mine(attacker.state);
  await until(() => ap().graveyard.some(c => c.id === killed), 'chosen attacker dies');
  assert.ok(ap().battlefield.some(c => c.id === alive), 'the other attacker took 1 and survives');
  console.log(`PASS multi block: one blocker on two attackers asked the defender (ordered=${q.ordered}), rejected an illegal split and applied the chosen one`);
} finally {
  for (const peer of peers) if (peer.ws.readyState === WebSocket.OPEN) peer.send({type: 'leave'});
  await wait(300); for (const peer of peers) peer.ws.close();
}
