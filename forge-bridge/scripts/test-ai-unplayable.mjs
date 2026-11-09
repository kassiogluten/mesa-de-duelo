// Real-engine regression: node forge-bridge/scripts/test-ai-unplayable.mjs [ws://127.0.0.1:7171/ws]
// Deck escolhido para o computador com cartas que a IA não joga: entra, a mesa recebe um aviso só, e a partida anda sem parar.
import assert from 'node:assert/strict';
const url = process.argv[2] || 'ws://127.0.0.1:7171/ws';
const hard = ['Quirion Ranger', 'Split Decision', 'Provoke', 'Shifty Doppelganger', 'Fettergeist', 'Daughter of Autumn', 'Sapphire Charm', 'Misinformation', 'Flesh Reaver', 'Purelace'];
const ai = { name: 'Meu deck difícil', cards: [...hard.map(name => ({ name, count: 4 })), ...['Island', 'Forest', 'Swamp', 'Plains', 'Mountain'].map(name => ({ name, count: 4 }))] };
const me = { name: 'Só terrenos', cards: [{ name: 'Plains', count: 60 }] };
const ws = new WebSocket(url);
const send = m => ws.send(JSON.stringify(m));
const toasts = [];
let state = null, last = Date.now();
const seen = new Set();
ws.addEventListener('message', ({ data }) => {
  const m = JSON.parse(data);
  if (m.type === 'validation-error') assert.fail(`deck do computador recusado: ${JSON.stringify(m.validation.issues)}`);
  if (m.type === 'toast') toasts.push(m);
  if (m.type !== 'state') return;
  state = m; last = Date.now();
  const q = m.question;
  if (q && !seen.has(`q${q.id}`)) {
    seen.add(`q${q.id}`);
    send({ type: 'answer', id: q.id, ...(q.kind === 'confirm' ? { value: false } : q.kind === 'text' ? { text: q.initial || '0' } : { indices: Array.from({ length: q.kind === 'order' ? q.options.length : Math.max(0, q.min ?? 0) }, (_, i) => i) }) });
    return;
  }
  const key = `g${m.input.gen}`;
  if (seen.has(key)) return;
  if (m.input.ok.enabled) { seen.add(key); send({ type: 'ok', gen: m.input.gen }); }
  // Descarte da limpeza (mão com 8): toca na primeira carta.
  else if (m.input.selectable?.length) { seen.add(key); send({ type: 'card', id: m.input.selectable[0], gen: m.input.gen }); }
  else if (m.input.cancel.enabled) { seen.add(key); send({ type: 'cancel', gen: m.input.gen }); }
});
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
send({ type: 'start', config: { format: 'free', matchLength: 'bo1' }, you: me, opponent: ai });
const start = Date.now();
while (!(state?.turn >= 12) && !state?.gameOver) {
  if (Date.now() - last > 30000) assert.fail(`a partida parou no turno ${state?.turn}, fase ${state?.phase}`);
  if (Date.now() - start > 240000) assert.fail('tempo esgotado');
  await new Promise(r => setTimeout(r, 200));
}
const notices = toasts.filter(t => Array.isArray(t.groups));
assert.equal(notices.length, 1, 'um aviso só das cartas que o computador não joga');
assert.deepEqual(new Set(notices[0].groups[0].cards), new Set(hard.filter(name => notices[0].groups[0].cards.includes(name))));
assert.ok(notices[0].groups[0].cards.includes('Quirion Ranger'));
console.log(`PASS: deck do computador com cartas que a IA não joga aceito, um aviso (${notices[0].groups[0].cards.length} cartas) e a partida chegou ao turno ${state.turn} sem parar`);
process.exit(0);
