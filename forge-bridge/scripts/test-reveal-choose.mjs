// Real-engine regression: node forge-bridge/scripts/test-reveal-choose.mjs [ws://127.0.0.1:7171/ws]
// "Revela a mão e você escolhe" (Thoughtseize) numa janela só: a escolha traz as cartas reveladas que não podem ser
// escolhidas; sem nada para escolher (só terrenos na mão), o revelar continua aparecendo sozinho.
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
async function thoughtseize(opponentHand) {
  const host = await connect(), guest = await connect();
  const scenario = { active: 0, phase: 'main1', players: [
    { life: 20, poison: 0, hand: ['Thoughtseize'], library: ['Swamp', 'Swamp', 'Swamp'], graveyard: [], exile: [], battlefield: [{ name: 'Swamp' }] },
    { life: 20, poison: 0, hand: opponentHand, library: ['Forest', 'Forest', 'Forest'], graveyard: [], exile: [], battlefield: [] }] };
  host.send({ type: 'lab-host', name: 'Jogador 1', scenario });
  await until(() => host.messages.some(m => m.type === 'room'), 'sala');
  guest.send({ type: 'join', code: host.messages.find(m => m.type === 'room').room.code, name: 'Jogador 2' });
  const me = () => host.state?.players?.find(p => p.id === host.state.you);
  await until(() => me()?.hand?.length === 1 && host.state.input.priority, 'Thoughtseize na mão');
  host.send({ type: 'card', id: me().hand[0].id, gen: host.state.input.gen });
  const opp = () => host.state.players.find(p => p.id !== host.state.you);
  await until(() => host.state.input.selectablePlayers?.includes(opp().id) || host.state.input.paying, 'alvo ou pagamento');
  if (host.state.input.selectablePlayers?.includes(opp().id)) host.send({ type: 'player', id: opp().id, gen: host.state.input.gen });
  // Pagamento e prioridade até a pergunta chegar.
  const start = Date.now();
  while (!host.state.question && Date.now() - start < 15000) {
    const inp = host.state.input;
    if (inp.ok.enabled && (inp.paying || inp.priority)) host.send({ type: 'ok', gen: inp.gen });
    if (guest.state?.input?.priority && guest.state.input.ok.enabled) guest.send({ type: 'ok', gen: guest.state.input.gen });
    await wait(300);
  }
  const q = host.state.question;
  assert.ok(q, 'nenhuma janela chegou');
  host.ws.close(); guest.ws.close();
  return q;
}
const choose = await thoughtseize(['Lightning Bolt', 'Grizzly Bears', 'Forest']);
assert.equal(choose.kind, 'choose', 'a primeira janela já é a escolha, sem o revelar antes');
assert.deepEqual(choose.options.map(o => o.card?.name).sort(), ['Grizzly Bears', 'Lightning Bolt']);
assert.deepEqual(choose.revealed.map(c => c.name), ['Forest'], 'o terreno revelado vem junto, sem poder ser escolhido');
assert.equal(choose.revealedNote, 'Mão de Jogador 2 revelada.');
const onlyLands = await thoughtseize(['Forest', 'Forest']);
assert.equal(onlyLands.kind, 'reveal', 'sem carta para escolher, a mão aparece no revelar');
// Grisly Salvage: revela o topo e escolhe. Quem joga: só a escolha, com a revelada que não serve apagada; quem assiste:
// nenhuma pergunta, só a janela que não segura o jogo, que passa de "escolhendo" para a escolhida.
{
  const host = await connect(), guest = await connect();
  const scenario = { active: 0, phase: 'main1', players: [
    { life: 20, poison: 0, hand: ['Grisly Salvage'], library: ['Grizzly Bears', 'Island', 'Llanowar Elves', 'Forest', 'Lightning Bolt', 'Swamp'], graveyard: [], exile: [], battlefield: [{ name: 'Swamp' }, { name: 'Forest' }] },
    { life: 20, poison: 0, hand: [], library: ['Forest', 'Forest', 'Forest'], graveyard: [], exile: [], battlefield: [] }] };
  const views = [];
  guest.ws.addEventListener('message', ({ data }) => { const m = JSON.parse(data); if (m.type === 'state' && m.revealView) views.push(m.revealView); });
  host.send({ type: 'lab-host', name: 'Jogador 1', scenario });
  await until(() => host.messages.some(m => m.type === 'room'), 'sala');
  guest.send({ type: 'join', code: host.messages.find(m => m.type === 'room').room.code, name: 'Jogador 2' });
  const me = () => host.state?.players?.find(p => p.id === host.state.you);
  await until(() => me()?.hand?.length === 1 && host.state.input.priority, 'Grisly Salvage na mão');
  host.send({ type: 'card', id: me().hand[0].id, gen: host.state.input.gen });
  const start = Date.now();
  while (!host.state.question && Date.now() - start < 15000) {
    const inp = host.state.input;
    if (inp.ok.enabled && (inp.paying || inp.priority)) host.send({ type: 'ok', gen: inp.gen });
    if (guest.state?.input?.priority && guest.state.input.ok.enabled) guest.send({ type: 'ok', gen: guest.state.input.gen });
    await wait(300);
  }
  const q = host.state.question;
  assert.equal(q?.kind, 'choose', 'quem joga recebe direto a escolha');
  assert.deepEqual(q.revealed.map(c => c.name), ['Lightning Bolt']);
  assert.equal(q.revealedNote, 'Cartas reveladas do topo do seu grimório.');
  await until(() => views.some(v => v.waiting), 'quem assiste vê as cartas enquanto ele escolhe');
  const bears = q.options.findIndex(o => o.card?.name === 'Grizzly Bears');
  host.send({ type: 'answer', id: q.id, indices: [bears] });
  await until(() => views.some(v => v.chosen?.length === 1), 'a janela de quem assiste marca a escolhida');
  const done = views.find(v => v.chosen);
  assert.equal(done.cards.find(c => c.id === done.chosen[0]).name, 'Grizzly Bears');
  assert.equal(done.cards.length, 5);
  assert.ok(!guest.questions.some(x => x.kind === 'reveal'), 'quem assiste não recebe janela de revelar que segura o jogo');
  guest.send({ type: 'reveal-seen', seq: done.seq });
  await until(() => !guest.state.revealView, 'OK fecha a janela');
  host.ws.close(); guest.ws.close();
}
console.log('PASS: Thoughtseize numa janela só (2 escolhíveis + 1 revelada); só terrenos na mão continua com o revelar; Grisly Salvage: escolha com as reveladas para quem joga e janela que se atualiza para quem assiste');
process.exit(0);
