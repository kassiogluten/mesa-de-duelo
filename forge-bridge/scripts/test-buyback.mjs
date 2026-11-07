// Recompra (buyback) numa partida de verdade: node forge-bridge/scripts/test-buyback.mjs [ws://127.0.0.1:7171/ws]
// Conjurada pagando a recompra, a mágica volta para a mão; sem pagar, vai para o cemitério.
import assert from 'node:assert/strict';

const url = process.argv[2] || 'ws://127.0.0.1:7171/ws';
const wait = ms => new Promise(r => setTimeout(r, ms));
const SPELL = 'Whispers of the Muse';
const scenario = { active: 0, phase: 'main1', players: [
  { life: 20, poison: 0, hand: [SPELL], library: ['Island', 'Island', 'Island', 'Island', 'Island', 'Island'], graveyard: [], exile: [],
    battlefield: Array.from({ length: 7 }, () => ({ name: 'Island' })) },
  { life: 20, poison: 0, hand: [], library: ['Forest', 'Forest', 'Forest', 'Forest', 'Forest'], graveyard: [], exile: [], battlefield: [{ name: 'Forest' }] },
] };

function connect() {
  const p = { ws: new WebSocket(url), state: null, room: null, error: null };
  p.send = m => p.ws.send(JSON.stringify(m));
  p.ws.addEventListener('message', ({ data }) => {
    const m = JSON.parse(data);
    if (m.type === 'state') p.state = m;
    if (m.type === 'room') p.room = m.room;
    if (m.type === 'error') p.error = m.text;
  });
  return new Promise((resolve, reject) => { p.ws.addEventListener('open', () => resolve(p), { once: true }); p.ws.addEventListener('error', reject, { once: true }); });
}
async function until(test, label, step, timeout = 25000) {
  const end = Date.now() + timeout;
  while (!test()) {
    if (Date.now() > end) throw new Error(`Tempo esgotado: ${label}; ${JSON.stringify({ input: host.state?.input, question: host.state?.question, stack: host.state?.stack?.length, error: host.error })}`);
    step?.(); await wait(80);
  }
}
const me = () => host.state?.players.find(p => p.id === host.state.you);
const ready = () => !!host.state?.input.priority && host.state.input.ok.enabled && !host.state.question && host.state.activePlayer === host.state.you;
let answered = -1;
/** As perguntas que a mesa recebeu ao conjurar, para conferir que a recompra foi oferecida ao jogador. */
const asked = [];
/** Responde a pergunta da recompra (sim ou não), paga a mana com o OK e deixa a mágica resolver. */
function drive(buyback) {
  const s = host.state; if (!s || s.input.gen === answered) return;
  const q = s.question;
  if (q) {
    asked.push(q);
    const options = q.options ?? [];
    const pick = options.findIndex(o => /buyback|recompra/i.test(JSON.stringify(o)));
    answered = s.input.gen;
    if (q.kind === 'confirm') host.send({ type: 'answer', id: q.id, value: buyback });
    else host.send({ type: 'answer', id: q.id, indices: buyback && pick >= 0 ? [pick] : [] });
    return;
  }
  if (s.input.paying && s.input.ok.enabled) { answered = s.input.gen; host.send({ type: 'ok', gen: s.input.gen }); return; }
  if (s.stack.length && s.input.priority && s.input.ok.enabled) { answered = s.input.gen; host.send({ type: 'ok', gen: s.input.gen }); }
}

const host = await connect(), guest = await connect();
try {
  host.send({ type: 'lab-host', name: 'Jogador 1', scenario });
  await until(() => host.room?.code, 'sala');
  guest.send({ type: 'join', code: host.room.code, name: 'Jogador 2' });
  await until(() => ready() && me()?.hand.some(c => c.name === SPELL), 'mesa montada');

  // Com recompra: 1 + 5 de mana, compra uma carta e a mágica volta para a mão.
  const spell = me().hand.find(c => c.name === SPELL);
  const before = me().hand.length;
  host.send({ type: 'card', id: spell.id, gen: host.state.input.gen });
  await until(() => !host.state.stack.length && ready() && me().hand.some(c => c.name === SPELL) && me().hand.length === before + 1,
    'com recompra, a mágica volta para a mão', () => drive(true));
  assert.ok(!me().graveyard.some(c => c.name === SPELL), 'com recompra, a mágica não vai para o cemitério');
  assert.ok(asked.some(q => /buyback|recompra/i.test(JSON.stringify(q))), `a recompra não foi oferecida: ${JSON.stringify(asked)}`);
  console.log('PASS: com recompra, Whispers of the Muse comprou uma carta e voltou para a mão');

  // Sem recompra (só 1 mana desvirada agora): vai para o cemitério.
  const again = me().hand.find(c => c.name === SPELL);
  host.send({ type: 'card', id: again.id, gen: host.state.input.gen });
  await until(() => !host.state.stack.length && ready() && me().graveyard.some(c => c.name === SPELL),
    'sem recompra, a mágica vai para o cemitério', () => drive(false));
  assert.ok(!me().hand.some(c => c.name === SPELL));
  console.log('PASS: sem recompra, Whispers of the Muse foi para o cemitério');
} finally {
  host.send({ type: 'lab-close' }); guest.send({ type: 'leave' }); host.send({ type: 'leave' });
  await wait(200); host.ws.close(); guest.ws.close();
}
