// Ordem das substituições numa partida de verdade: node forge-bridge/scripts/test-replacement-order.mjs [ws://127.0.0.1:7171/ws]
// Leonardo, the Balance põe marcadores em cada criatura com Corpsejack Menace e Hardened Scales no campo: a mesa
// pergunta qual efeito vem primeiro com os dois efeitos nas opções; com "usar em todas", pergunta uma vez só.
import assert from 'node:assert/strict';

const url = process.argv[2] || 'ws://127.0.0.1:7171/ws';
const wait = ms => new Promise(r => setTimeout(r, ms));
const SPELL = 'Raise the Alarm';
const scenario = { active: 0, phase: 'main1', players: [
  { life: 20, poison: 0, hand: [SPELL], library: ['Plains', 'Plains', 'Plains', 'Plains', 'Plains'], graveyard: [], exile: [],
    battlefield: [{ name: 'Leonardo, the Balance' }, { name: 'Grizzly Bears' }, { name: 'Corpsejack Menace' }, { name: 'Hardened Scales' }, { name: 'Plains' }, { name: 'Plains' }] },
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
    if (Date.now() > end) throw new Error(`Tempo esgotado: ${label}; ${JSON.stringify({ input: host.state?.input, question: host.state?.question, error: host.error })}`);
    step?.(); await wait(80);
  }
}
const me = () => host.state?.players.find(p => p.id === host.state.you);
const ready = () => !!host.state?.input.priority && host.state.input.ok.enabled && !host.state.question && host.state.activePlayer === host.state.you;
const creatures = () => me().battlefield.filter(c => c.creature);
/** As perguntas de ordem das substituições que chegaram. */
const asked = [];
const seen = new Set();
let answered = -1;
/** Paga, ordena os gatilhos, responde Sim ao Leonardo e Hardened Scales primeiro (com ou sem "usar em todas"). */
function drive(all) {
  const s = host.state; if (!s) return;
  const q = s.question;
  if (q && !seen.has(q.id)) {
    seen.add(q.id);
    if (q.purpose === 'replacement-order') {
      asked.push(q);
      host.send({ type: 'answer', id: q.id, indices: [q.options.findIndex(o => o.card?.name === 'Hardened Scales')], all });
    } else host.send({ type: 'answer', id: q.id, indices: (q.options ?? []).map((_, i) => i) });
    return;
  }
  if (!q && s.input.gen !== answered && s.input.ok.enabled && (s.input.paying || s.stack.length)) { answered = s.input.gen; host.send({ type: 'ok', gen: s.input.gen }); }
}

const host = await connect(), guest = await connect();
try {
  host.send({ type: 'lab-host', name: 'Jogador 1', scenario });
  await until(() => host.room?.code, 'sala');
  guest.send({ type: 'join', code: host.room.code, name: 'Jogador 2' });
  await until(() => ready() && me()?.hand.some(c => c.name === SPELL), 'mesa montada');
  const spell = me().hand.find(c => c.name === SPELL);
  host.send({ type: 'card', id: spell.id, gen: host.state.input.gen });
  // Quatro criaturas (Leonardo, Grizzly Bears, Corpsejack e as duas fichas): Hardened Scales e depois o dobro dão 4 marcadores.
  await until(() => creatures().length === 5 && creatures().every(c => c.counters?.P1P1 === 4), 'quatro marcadores em cada criatura', () => drive(true));
  assert.equal(asked.length, 1, `com "usar em todas", a mesa perguntou ${asked.length} vezes`);
  const q = asked[0];
  assert.equal(q.kind, 'choose'); assert.equal(q.applyToAll, true);
  assert.deepEqual(q.options.map(o => o.card?.name).sort(), ['Corpsejack Menace', 'Hardened Scales']);
  assert.ok(q.options.every(o => o.ability && !/\(\d+\) - /.test(o.ability)), `texto dos efeitos: ${JSON.stringify(q.options)}`);
  console.log('PASS: com Corpsejack Menace e Hardened Scales, a ordem foi escolhida uma vez para as cinco criaturas');
} finally {
  host.send({ type: 'lab-close' }); guest.send({ type: 'leave' }); host.send({ type: 'leave' });
  await wait(200); host.ws.close(); guest.ws.close();
}
