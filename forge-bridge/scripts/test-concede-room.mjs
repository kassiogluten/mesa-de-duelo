// Real-engine regression: node forge-bridge/scripts/test-concede-room.mjs [ws://127.0.0.1:7172/ws]
// Three players in a room; one concedes by leaving. Forge removes their cards, the room marks them as conceded
// (the table hides the seat) and the game goes on between the other two.
import assert from 'node:assert/strict';
const endpoint = process.argv[2] || 'ws://127.0.0.1:7172/ws';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const deck = {name: 'Skip vote', cards: [{name: 'Plains', count: 99}], commanders: [{name: 'Isamaru, Hound of Konda', count: 1}]};
const config = {format: 'commander', matchLength: 'bo1', playerCount: 3};
const peers = [];
async function peer(name) {
  const p = {name, ws: new WebSocket(endpoint), state: null, room: null, toasts: [], seen: new Set(), online: true};
  peers.push(p);
  p.send = value => p.ws.send(JSON.stringify(value));
  p.ws.addEventListener('message', ({data}) => {
    const m = JSON.parse(data);
    if (m.room) p.room = m.room;
    if (m.type === 'toast') p.toasts.push(m.text);
    if (m.type === 'state') p.state = m;
  });
  await new Promise((resolve, reject) => { p.ws.addEventListener('open', resolve, {once: true}); p.ws.addEventListener('error', reject, {once: true}); });
  return p;
}
/** Online players never play anything: they only get through the opening and pass. */
function advance() {
  for (const p of peers) {
    const s = p.state;
    if (!p.online || !s || s.gameOver) continue;
    const key = `${s.input.gen}:${s.question?.id ?? ''}:${s.input.selectable.length}`;
    if (p.seen.has(key)) continue;
    let msg = null;
    if (s.question) msg = s.question.kind === 'confirm' ? {type: 'answer', id: s.question.id, value: true} : {type: 'answer', id: s.question.id, indices: s.question.kind === 'order' ? s.question.options.map((_, i) => i) : [0]};
    else if (s.input.opening === 'starting-player' && s.input.selectablePlayers.length) msg = {type: 'player', id: s.you, gen: s.input.gen};
    else if (['play-draw', 'mulligan'].includes(s.input.opening) && s.input.ok.enabled) msg = {type: 'ok', gen: s.input.gen};
    else if (s.input.ok.enabled) msg = {type: 'ok', gen: s.input.gen};
    // Cleanup with too many cards: discard the first one offered.
    else if (s.input.selectable.length) msg = {type: 'card', id: s.input.selectable[0], gen: s.input.gen};
    if (msg) { p.seen.add(key); p.send(msg); }
  }
}
async function until(test, label, timeout = 90000) {
  const start = Date.now();
  while (!test()) {
    if (Date.now() - start > timeout) throw new Error(`Timeout: ${label} ${JSON.stringify(peers.map(p => ({n: p.name, turn: p.state?.turn, phase: p.state?.phase, active: p.state?.activePlayer, skip: p.state?.skip})))}`);
    advance(); await wait(40);
  }
}
try {
  const a = await peer('Ana'), b = await peer('Bruno'), c = await peer('Carla');
  a.send({type: 'host', name: a.name, config, deck});
  await until(() => a.room?.code, 'host');
  for (const p of [b, c]) { p.send({type: 'join', code: a.room.code, name: p.name, deck}); await until(() => p.room, 'join'); }
  await until(() => peers.every(p => p.state?.turn >= 1 && !p.state.input.opening), 'game under way');
  const carla = c.state.you;
  c.online = false; c.send({type: 'leave'}); await wait(400); c.ws.close();
  await until(() => a.state.room?.players.some(p => p.playerId === carla && !p.connected), 'Carla gone');
  await until(() => a.state.room.players.find(p => p.playerId === carla)?.conceded, 'conceded flag');
  const cp = a.state.players.find(p => p.id === carla);
  assert.equal(cp.eliminated, true);
  assert.equal(cp.battlefield.length + (cp.commandZone?.length ?? 0) + cp.handCount, 0, 'Forge removed her cards');
  const entry = a.state.room.players.find(p => p.playerId === carla);
  assert.deepEqual([entry.connected, entry.eliminated, entry.conceded], [false, true, true]);
  assert.ok(!a.state.skip?.vote, 'no skip vote for someone who conceded');
  const t = a.state.turn; await until(() => a.state.turn >= t + 3, 'three more turns', 120000);
  assert.ok(a.state.activePlayer !== carla);
  console.log('PASS concede in a room: cards removed, seat marked as conceded, the other two keep playing');
} finally {
  for (const p of peers) if (p.ws.readyState === WebSocket.OPEN) p.send({type: 'leave'});
  await wait(300); for (const p of peers) p.ws.close();
}
