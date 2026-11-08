// Real-engine regression: node forge-bridge/scripts/test-opening-wait.mjs [ws://127.0.0.1:7171/ws]
// O Forge decide a abertura um jogador por vez: quem espera recebe openingWait (quem decide, a etapa e se já manteve a mão).
import assert from 'node:assert/strict';
const url = process.argv[2] || 'ws://127.0.0.1:7171/ws';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const peers = [];
async function connect(name) {
  const peer = { name, ws: new WebSocket(url), state: null, room: null, events: [] };
  peers.push(peer);
  peer.send = message => peer.ws.send(JSON.stringify(message));
  peer.ws.addEventListener('message', ({data}) => {
    const message = JSON.parse(data);
    if (message.type === 'state') { peer.state = message; peer.events.push(...(message.events ?? [])); }
    if (message.type === 'room') peer.room = message.room;
  });
  await new Promise((resolve, reject) => {
    peer.ws.addEventListener('open', resolve, {once: true}); peer.ws.addEventListener('error', reject, {once: true});
  });
  return peer;
}
async function until(predicate, label) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > 45000) throw new Error(`Timeout: ${label}`);
    await wait(60);
  }
}
const ready = (peer, opening) => peer.state?.input.opening === opening && peer.state.input.ok.enabled;
try {
  const a = await connect('Opening A'), b = await connect('Opening B');
  const deck = {name: 'Opening wait', cards: [{name: 'Mountain', count: 20}, {name: 'Raging Goblin', count: 20}]};
  a.send({type: 'host', name: a.name, deck, config: {format: 'free', matchLength: 'bo1'}}); a.send({type: 'room-ready'});
  await until(() => a.room?.code, 'room');
  b.send({type: 'join', code: a.room.code, name: b.name, deck}); b.send({type: 'room-ready'});

  // Quem começa: um escolhe, o outro vê que ele está escolhendo.
  await until(() => peers.some(p => ready(p, 'play-draw')), 'play-draw');
  const chooser = peers.find(p => ready(p, 'play-draw')), other = peers.find(p => p !== chooser);
  await until(() => other.state?.input.openingWait?.step === 'start', 'the other table sees who is choosing');
  assert.equal(other.state.input.openingWait.player, chooser.state.you);
  assert.equal(other.state.input.openingWait.kept, undefined);
  assert.equal(chooser.state.input.openingWait, undefined, 'own decision is not a wait');
  // O d6 de quem começa (item 112): os dois recebem as mesmas rolagens, e quem escolhe é quem tirou o maior número.
  await until(() => peers.every(p => p.events.some(e => e.type === 'starting-roll')), 'both tables get the starting roll');
  const rolls = peers.map(p => p.events.find(e => e.type === 'starting-roll'));
  assert.deepEqual(rolls[0].rolls, rolls[1].rolls);
  assert.equal(rolls[0].actor, chooser.state.you);
  assert.equal(rolls[0].rolls[0].length, 2, 'everyone rolls in the first round');
  const last = rolls[0].rolls.at(-1), best = Math.max(...last.map(r => r.roll));
  assert.deepEqual(last.filter(r => r.roll === best).map(r => r.player), [chooser.state.you]);
  assert.ok(peers.every(p => !p.events.some(e => e.type === 'coin')), 'no starting coin any more');
  chooser.send({type: 'ok', gen: chooser.state.input.gen});

  // Mãos: quem joga primeiro decide antes; o outro espera sabendo que a vez dele vem.
  await until(() => ready(chooser, 'mulligan'), 'first mulligan');
  await until(() => other.state?.input.openingWait?.step === 'hand', 'the other table sees the hand decision');
  assert.equal(other.state.input.openingWait.kept, undefined);
  chooser.send({type: 'ok', gen: chooser.state.input.gen});

  // Depois de manter, quem espera o outro vê que já manteve a mão.
  await until(() => ready(other, 'mulligan'), 'second mulligan');
  await until(() => chooser.state?.input.openingWait?.kept === true, 'kept hand shown while waiting');
  assert.equal(chooser.state.input.openingWait.player, other.state.you);
  other.send({type: 'ok', gen: other.state.input.gen});

  await until(() => peers.every(p => !p.state.input.opening && !p.state.input.openingWait), 'opening finished');
  console.log('opening wait: ok');
} finally {
  for (const peer of peers) peer.ws.close();
}
