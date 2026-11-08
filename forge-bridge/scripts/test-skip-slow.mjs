// Real-engine regression: node forge-bridge/scripts/test-skip-slow.mjs [ws://127.0.0.1:7172/ws]
// Two players in a room; one stays connected but stops answering. Past the slow limit (MESA_SLOW_MS on the bridge, 4 s in
// test:e2e), the other votes alone (majority of one), and the bridge passes for the slow player until the turn ends.
import assert from 'node:assert/strict';
const endpoint = process.argv[2] || 'ws://127.0.0.1:7172/ws';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const deck = {name: 'Skip slow', cards: [{name: 'Plains', count: 99}], commanders: [{name: 'Isamaru, Hound of Konda', count: 1}]};
const config = {format: 'commander', matchLength: 'bo1', playerCount: 2};
const peers = [];
async function peer(name) {
  const p = {name, ws: new WebSocket(endpoint), state: null, room: null, toasts: [], seen: new Set(), paused: false};
  peers.push(p);
  p.send = value => p.ws.send(JSON.stringify(value));
  p.ws.addEventListener('message', ({data}) => {
    const m = JSON.parse(data);
    if (m.room) p.room = m.room;
    if (m.type === 'toast' || m.type === 'error') p.toasts.push(m.text);
    if (m.type === 'state') p.state = m;
  });
  await new Promise((resolve, reject) => { p.ws.addEventListener('open', resolve, {once: true}); p.ws.addEventListener('error', reject, {once: true}); });
  return p;
}
/** Players never play anything: they only get through the opening and pass. A paused player answers nothing. */
function advance() {
  for (const p of peers) {
    const s = p.state;
    if (p.paused || !s || s.gameOver) continue;
    const key = `${s.input.gen}:${s.question?.id ?? ''}:${s.input.selectable.length}`;
    if (p.seen.has(key)) continue;
    let msg = null;
    if (s.question) msg = s.question.kind === 'confirm' ? {type: 'answer', id: s.question.id, value: true} : {type: 'answer', id: s.question.id, indices: s.question.kind === 'order' ? s.question.options.map((_, i) => i) : [0]};
    else if (s.input.opening === 'starting-player' && s.input.selectablePlayers.length) msg = {type: 'player', id: s.you, gen: s.input.gen};
    else if (s.input.ok.enabled) msg = {type: 'ok', gen: s.input.gen};
    else if (s.input.selectable.length) msg = {type: 'card', id: s.input.selectable[0], gen: s.input.gen};
    if (msg) { p.seen.add(key); p.send(msg); }
  }
}
async function until(test, label, timeout = 90000) {
  const start = Date.now();
  while (!test()) {
    if (Date.now() - start > timeout) throw new Error(`Timeout: ${label} ${JSON.stringify(peers.map(p => ({n: p.name, turn: p.state?.turn, phase: p.state?.phase, active: p.state?.activePlayer, skip: p.state?.skip, waiting: p.state?.waiting})))}`);
    advance(); await wait(40);
  }
}
try {
  const a = await peer('Ana'), b = await peer('Bruno');
  a.send({type: 'host', name: a.name, config, deck}); a.send({type: 'room-ready'});
  await until(() => a.room?.code, 'host');
  b.send({type: 'join', code: a.room.code, name: b.name, deck}); b.send({type: 'room-ready'});
  await until(() => peers.every(p => p.state?.turn >= 1 && !p.state.input.opening), 'game under way');
  const bruno = b.state.you;

  // Bruno stops answering; still connected.
  b.paused = true;
  await until(() => a.state.skip?.slow?.includes(bruno), 'Bruno shows as slow', 60000);
  a.send({type: 'skip-vote', target: bruno});
  await until(() => a.state.skip?.skipping?.includes(bruno), 'vote approved by the only other player');
  assert.ok(b.toasts.some(t => /pular a sua vez/.test(t)), JSON.stringify(b.toasts));
  assert.ok(a.toasts.some(t => /até o fim deste turno/.test(t)), JSON.stringify(a.toasts));

  // With Bruno still silent, the table moves to the next turn and the approval ends there.
  const turn = a.state.turn;
  await until(() => a.state.turn > turn, 'the turn moves on without Bruno', 120000);
  await until(() => !a.state.skip?.skipping?.includes(bruno), 'approval ends with the turn');
  assert.ok(a.toasts.some(t => /volta a jogar normalmente/.test(t)), JSON.stringify(a.toasts));
  console.log(`PASS skip slow: Bruno connected but silent, voted out of turn ${turn} by Ana, back to normal on turn ${a.state.turn}`);
} finally {
  for (const p of peers) if (p.ws.readyState === WebSocket.OPEN) p.send({type: 'leave'});
  await wait(300); for (const p of peers) p.ws.close();
}
