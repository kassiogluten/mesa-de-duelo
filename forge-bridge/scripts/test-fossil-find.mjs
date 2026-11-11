// Real-engine regression: node forge-bridge/scripts/test-fossil-find.mjs [ws://127.0.0.1:7171/ws]
// Fossil Find: a carta aleatória sai só do cemitério de quem conjurou (o roteiro do Forge sorteava de todos), e a janela
// de reordenar o cemitério diz que a primeira escolhida fica no fundo.
import assert from 'node:assert/strict';
const endpoint = process.argv[2] || 'ws://127.0.0.1:7171/ws';
const wait = ms => new Promise(r => setTimeout(r, ms));
function connect() {
  const p = { ws: new WebSocket(endpoint), messages: [], state: null, questions: [] };
  p.send = m => p.ws.send(JSON.stringify(m));
  p.ws.addEventListener('message', ({ data }) => {
    const m = JSON.parse(data); p.messages.push(m);
    if (m.type !== 'state') return;
    p.state = m;
    if (m.question && !p.questions.some(q => q.id === m.question.id)) p.questions.push(m.question);
  });
  return new Promise((resolve, reject) => { p.ws.addEventListener('open', () => resolve(p), { once: true }); p.ws.addEventListener('error', reject, { once: true }); });
}
async function until(test, label, timeout = 20000) {
  const end = Date.now() + timeout;
  while (!test()) { if (Date.now() > end) throw new Error(`Tempo esgotado: ${label}`); await wait(50); }
}
const mine = ['Lightning Bolt', 'Grizzly Bears', 'Llanowar Elves', 'Shock'], theirs = ['Counterspell', 'Island', 'Opt', 'Brainstorm'];
for (let round = 0; round < 3; round++) {
  const host = await connect(), guest = await connect();
  const scenario = { active: 0, phase: 'main1', players: [
    { life: 20, poison: 0, hand: ['Fossil Find'], library: ['Mountain', 'Mountain', 'Mountain'], graveyard: mine, exile: [], battlefield: [{ name: 'Mountain' }, { name: 'Forest' }] },
    { life: 20, poison: 0, hand: [], library: ['Island', 'Island', 'Island'], graveyard: theirs, exile: [], battlefield: [] }] };
  host.send({ type: 'lab-host', name: 'Jogador 1', scenario });
  await until(() => host.messages.some(m => m.type === 'room'), 'sala');
  guest.send({ type: 'join', code: host.messages.find(m => m.type === 'room').room.code, name: 'Jogador 2' });
  const me = () => host.state?.players?.find(p => p.id === host.state.you);
  const opp = () => host.state.players.find(p => p.id !== host.state.you);
  await until(() => me()?.hand?.length === 1 && host.state.input.priority && host.state.input.actionable?.includes(me().hand[0].id), 'Fossil Find na mão');
  host.send({ type: 'card', id: me().hand[0].id, gen: host.state.input.gen });
  await until(() => host.state.input.paying || host.state.question, 'pagamento');
  const start = Date.now();
  while (!host.state.question && Date.now() - start < 15000) {
    const inp = host.state.input;
    if (inp.ok.enabled && (inp.paying || inp.priority && host.state.stack.length)) host.send({ type: 'ok', gen: inp.gen });
    if (guest.state?.input?.priority && guest.state.input.ok.enabled) guest.send({ type: 'ok', gen: guest.state.input.gen });
    // A carta que volta é mostrada ao oponente (o Forge revela a carta que sai do cemitério para a mão).
    if (guest.state?.question?.kind === 'reveal') guest.send({ type: 'answer', id: guest.state.question.id, indices: [] });
    await wait(300);
  }
  const q = host.state.question;
  assert.ok(q, 'a janela de reordenar não chegou');
  assert.deepEqual(opp().graveyard.map(c => c.name), theirs, 'o cemitério do oponente fica intacto');
  assert.equal(me().hand.length, 1, 'uma carta volta para a sua mão');
  assert.ok(mine.includes(me().hand[0].name), 'e ela vem do seu cemitério');
  assert.equal(q.kind, 'order');
  assert.equal(q.firstAt, 'bottom', 'no cemitério a primeira escolhida fica no fundo');
  const order = q.options.map((_, i) => i).reverse();
  host.send({ type: 'answer', id: q.id, indices: order });
  await until(() => !host.state.question && me().graveyard.some(c => c.name === 'Fossil Find'), 'Fossil Find resolvida');
  assert.deepEqual(me().graveyard.map(c => c.name), [...order.map(i => q.options[i].card.name), 'Fossil Find'], 'a primeira escolhida no fundo, a Fossil Find em cima');
  host.ws.close(); guest.ws.close();
}
console.log('PASS: Fossil Find devolve só do seu cemitério (3 rodadas) e a janela de reordenar diz que a primeira fica no fundo');
