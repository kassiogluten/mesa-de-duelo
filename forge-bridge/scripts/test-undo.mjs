// Real-engine regression: node forge-bridge/scripts/test-undo.mjs [ws://127.0.0.1:7172/ws]
// Desfazer (opção da partida): numa sala, o pedido de Ana só vale quando Bruno aceita; uma recusa derruba o pedido.
// Contra a IA, o pedido volta na hora. Sem a opção, a mesa não recebe nada de desfazer.
import assert from 'node:assert/strict';
const endpoint = process.argv[2] || 'ws://127.0.0.1:7172/ws';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const deck = {name: 'Undo', cards: [{name: 'Forest', count: 40}, {name: 'Grizzly Bears', count: 20}]};
const peers = [];
async function peer(name) {
  const p = {name, ws: new WebSocket(endpoint), state: null, room: null, toasts: [], seen: new Set(), manual: false};
  peers.push(p);
  p.send = value => p.ws.send(JSON.stringify(value));
  p.ws.addEventListener('message', ({data}) => {
    const m = JSON.parse(data);
    if (m.room) p.room = m.room;
    if (m.type === 'toast') p.toasts.push(m.text);
    if (m.type === 'error') p.toasts.push('ERRO ' + m.text);
    if (m.type === 'state') p.state = m;
  });
  await new Promise((resolve, reject) => { p.ws.addEventListener('open', resolve, {once: true}); p.ws.addEventListener('error', reject, {once: true}); });
  return p;
}
/** Quem não está sendo controlado pelo teste passa por tudo sem jogar nada. */
function advance() {
  for (const p of peers) {
    const s = p.state;
    if (p.manual || !s || s.gameOver) continue;
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
    if (Date.now() - start > timeout) throw new Error(`Timeout: ${label} ${JSON.stringify(peers.map(p => ({n: p.name, turn: p.state?.turn, phase: p.state?.phase, active: p.state?.activePlayer, undo: p.state?.undo, toasts: p.toasts.slice(-3)})))}`);
    advance(); await wait(40);
  }
}
const mine = p => p.state.players.find(x => x.id === p.state.you);
const forests = (p, zone) => mine(p)[zone].filter(c => c.name === 'Forest').length;

/** Leva {@code p} até a fase principal do próprio turno, com a prioridade e uma Floresta na mão, e joga a Floresta. */
async function playForest(p) {
  p.manual = false;
  await until(() => p.state && p.state.activePlayer === p.state.you && p.state.phase === 'MAIN1' && !p.state.question && p.state.input.ok.enabled && forests(p, 'hand') > 0, `${p.name} na principal 1`, 120000);
  p.manual = true;
  const before = forests(p, 'battlefield');
  const forest = mine(p).hand.find(c => c.name === 'Forest');
  p.send({type: 'card', id: forest.id, gen: p.state.input.gen});
  await until(() => forests(p, 'battlefield') === before + 1 && p.state.input.ok.enabled, `${p.name} jogou a Floresta`);
  return before;
}

try {
  // 1. Sala com duas pessoas e o desfazer ligado.
  const a = await peer('Ana'), b = await peer('Bruno');
  a.send({type: 'host', name: a.name, config: {format: 'free', matchLength: 'bo1', undo: true}, deck});
  await until(() => a.room?.code, 'host');
  assert.equal(a.room.config?.undo, true, 'a sala anuncia o desfazer ligado');
  b.send({type: 'join', code: a.room.code, name: b.name, deck});
  await until(() => b.room && peers.every(p => p.state?.turn >= 1 && !p.state.input.opening), 'partida começou');
  assert.equal(b.state.config.undo, true, 'quem entra vê o desfazer ligado');

  const before = await playForest(a);
  assert.equal(a.state.undo?.last?.action, 'land', JSON.stringify(a.state.undo));
  assert.equal(a.state.undo.last.text, 'jogar Forest');

  a.send({type: 'undo-request'});
  await until(() => b.state.undo?.request, 'Bruno recebe o pedido');
  assert.deepEqual([b.state.undo.request.name, b.state.undo.request.canVote, b.state.undo.request.mine, b.state.undo.request.step.action], ['Ana', true, false, 'land']);
  await until(() => a.state.undo?.request?.mine, 'Ana vê o próprio pedido');
  assert.deepEqual(a.state.undo.request.waiting, ['Bruno']);
  assert.ok(b.toasts.some(t => /Ana pediu para desfazer: jogar Forest/.test(t)), JSON.stringify(b.toasts));

  b.send({type: 'undo-vote', value: false});
  await until(() => !a.state.undo?.request && a.toasts.some(t => /Bruno recusou desfazer/.test(t)), 'recusa derruba o pedido');
  await wait(500);
  assert.equal(forests(a, 'battlefield'), before + 1, 'recusado: a Floresta continua no campo');

  a.send({type: 'undo-request'});
  await until(() => b.state.undo?.request, 'segundo pedido');
  b.send({type: 'undo-vote', value: true});
  await until(() => forests(a, 'battlefield') === before && a.state.input.ok.enabled, 'aceito: a Floresta volta para a mão');
  assert.equal(a.state.phase, 'MAIN1');
  assert.equal(a.state.activePlayer, a.state.you);
  assert.ok(a.state.log.some(l => /Ana desfez: jogar Forest \(aceito por Bruno\)/.test(l.text ?? l)), JSON.stringify(a.state.log.slice(-4)));
  assert.ok(b.toasts.some(t => /Ana desfez: jogar Forest/.test(t)), JSON.stringify(b.toasts));
  // Depois de voltar, o jogo segue: dá para jogar a terra de novo.
  const played = await playForest(a) + 1;
  // Passar a vez também é uma decisão: Ana passa na principal 1, o jogo anda até o próximo prompt dela e ela volta.
  const gen = a.state.input.gen;
  a.send({type: 'ok', gen});
  await until(() => a.state.input.gen !== gen && a.state.input.ok.enabled && !a.state.question && a.state.phase !== 'MAIN1', 'Ana no próximo prompt');
  const later = a.state.phase;
  assert.equal(a.state.undo.last.action, 'pass');
  a.send({type: 'undo-request'});
  await until(() => b.state.undo?.request, 'pedido para voltar a passada');
  assert.match(b.state.undo.request.step.text, /^passar a vez na fase principal 1$/);
  b.send({type: 'undo-vote', value: true});
  await until(() => a.state.phase === 'MAIN1' && a.state.input.ok.enabled, `de ${later} de volta para a principal 1`);
  assert.equal(forests(a, 'battlefield'), played, 'a Floresta jogada antes de passar continua no campo');
  console.log('PASS sala: recusa mantém a jogada; aceito volta a Floresta para a mão e o jogo segue');
  for (const p of [a, b]) p.send({type: 'leave'});
  await wait(300); for (const p of [a, b]) p.ws.close();
  peers.length = 0;

  // 2. Contra a IA: volta na hora.
  const solo = await peer('Solo');
  solo.send({type: 'start', config: {format: 'free', matchLength: 'bo1', undo: true}, you: deck, opponent: {name: 'Idle', cards: [{name: 'Forest', count: 60}]}});
  const soloBefore = await playForest(solo);
  solo.send({type: 'undo-request'});
  await until(() => forests(solo, 'battlefield') === soloBefore && solo.state.input.ok.enabled, 'contra a IA, volta sem pedir');
  console.log('PASS contra a IA: desfeito na hora');
  solo.ws.close(); peers.length = 0;

  // 3. Sem a opção: nada de desfazer no estado, e o pedido é ignorado.
  const off = await peer('Off');
  off.send({type: 'start', config: {format: 'free', matchLength: 'bo1'}, you: deck, opponent: {name: 'Idle', cards: [{name: 'Forest', count: 60}]}});
  const offBefore = await playForest(off);
  assert.equal(off.state.undo, undefined);
  assert.equal(off.state.config.undo, undefined);
  assert.notEqual(off.state.input.cancel.label, 'Desfazer', 'o desfazer do Forge fica desligado');
  off.send({type: 'undo-request'});
  await wait(800);
  assert.equal(forests(off, 'battlefield'), offBefore + 1);
  console.log('PASS sem a opção: nada a desfazer');
} finally {
  for (const p of peers) if (p.ws.readyState === WebSocket.OPEN) p.send({type: 'leave'});
  await wait(300); for (const p of peers) p.ws.close();
}
