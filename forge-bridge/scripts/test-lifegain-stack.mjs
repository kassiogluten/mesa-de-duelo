// Cadeia de gatilhos de ganho de vida numa mesa do Laboratório: a pilha resolve sem a pausa de 400 ms por passe, a
// ordem lembrada não volta a ser perguntada, e o "Sempre sim" de um gatilho opcional vale até ser esquecido.
// node forge-bridge/scripts/test-lifegain-stack.mjs [ws://127.0.0.1:7171/ws]
import assert from 'node:assert/strict';

const endpoint = process.argv[2] || 'ws://127.0.0.1:7171/ws';
const wait = ms => new Promise(r => setTimeout(r, ms));
const lands = n => Array.from({ length: n }, () => ({ name: 'Plains' }));
// Raise the Alarm: duas fichas entram juntas; cada uma dispara os três "guardiões" (o Soul's Attendant é opcional) e
// cada ganho de vida dispara o Ajani's Pridemate e o Archangel of Thune juntos.
const scenario = {
  active: 0, phase: 'main1',
  players: [
    { life: 20, poison: 0, hand: ['Raise the Alarm'], library: Array(10).fill('Plains'), graveyard: [], exile: [],
      battlefield: [...lands(6), { name: 'Soul Warden' }, { name: "Soul's Attendant" }, { name: 'Essence Warden' }, { name: "Ajani's Pridemate" }, { name: 'Archangel of Thune' }] },
    { life: 20, poison: 0, hand: [], library: Array(10).fill('Forest'), graveyard: [], exile: [], battlefield: lands(2) },
  ],
};

function connect() {
  const p = { ws: new WebSocket(endpoint), state: null, messages: [] };
  p.send = m => p.ws.send(JSON.stringify(m));
  p.ws.addEventListener('message', ({ data }) => { const m = JSON.parse(data); p.messages.push(m); if (m.type === 'state') p.state = m; });
  return new Promise((res, rej) => { p.ws.addEventListener('open', () => res(p), { once: true }); p.ws.addEventListener('error', rej, { once: true }); });
}
async function until(test, label, ms = 30000) { const end = Date.now() + ms; while (!test()) { if (Date.now() > end) throw new Error(`Tempo esgotado: ${label}`); await wait(20); } }
const priority = s => s?.input?.priority && s.input.ok.enabled && !s.question;

/** Monta a mesa, conjura o Raise the Alarm e responde tudo até a pilha esvaziar; conta o que o jogo perguntou. */
async function chain(keep) {
  const host = await connect(), guest = await connect();
  const me = () => host.state.players.find(p => p.id === host.state.you);
  try {
    host.send({ type: 'lab-host', name: 'Jogador 1', scenario });
    await until(() => host.messages.some(m => m.type === 'room'), 'sala');
    guest.send({ type: 'join', code: host.messages.find(m => m.type === 'room').room.code, name: 'Jogador 2' });
    await until(() => priority(host.state) && me().hand.length === 1 && me().battlefield.length === 11, 'mesa montada');
    // O Jogador 2 só passa.
    let guestGen = -1;
    const guestLoop = setInterval(() => {
      const s = guest.state;
      if (priority(s) && s.input.gen !== guestGen) { guestGen = s.input.gen; guest.send({ type: 'ok', gen: s.input.gen }); }
    }, 15);
    const asked = { order: 0, optional: 0 };
    let lastGen = -1, lastQuestion = null, sawStack = false;
    const t0 = Date.now();
    host.send({ type: 'card', id: me().hand[0].id, gen: host.state.input.gen });
    for (;;) {
      const s = host.state;
      if (s.stack.length) sawStack = true;
      if (s.question && s.question.id !== lastQuestion) {
        lastQuestion = s.question.id;
        assert.equal(s.question.kind, 'order', JSON.stringify(s.question).slice(0, 200));
        asked.order++;
        if (keep) assert.equal(s.question.canRemember, true, 'a ordem de gatilhos oferece lembrar');
        host.send({ type: 'answer', id: s.question.id, indices: s.question.options.map((_, i) => i), ...(keep ? { remember: true } : {}) });
      } else if (!s.question && !s.input.priority && s.input.triggerChoice && s.input.ok.enabled && s.input.gen !== lastGen) {
        lastGen = s.input.gen; asked.optional++;
        host.send({ type: 'ok', gen: s.input.gen, ...(keep ? { always: true } : {}) });
      } else if (!s.question && s.input.paying && s.input.ok.enabled && s.input.gen !== lastGen) {
        lastGen = s.input.gen; host.send({ type: 'ok', gen: s.input.gen });
      } else if (sawStack && !s.stack.length && !s.question && (priority(s) || s.input.attacking)) break;
      if (Date.now() - t0 > 30000) throw new Error(`a pilha não esvaziou: ${JSON.stringify({ stack: s.stack.length, message: s.input.message })}`);
      await wait(10);
    }
    const ms = Date.now() - t0;
    clearInterval(guestLoop);
    assert.equal(me().life, 26, 'seis ganhos de 1 de vida');
    const result = { ms, ...asked, saved: host.state.autoTriggers ?? [] };
    if (keep) {
      // "Perguntar de novo" nas Opções da partida.
      host.send({ type: 'forget-trigger', key: result.saved[0].key });
      await until(() => !host.state.autoTriggers?.length, 'gatilho esquecido', 5000);
    }
    return result;
  } finally {
    host.send({ type: 'lab-close' }); guest.send({ type: 'leave' }); host.send({ type: 'leave' });
    await wait(100); host.ws.close(); guest.ws.close();
  }
}

const plain = await chain(false);
// Antes eram ~870 ms por item (400 ms de pausa do Forge a cada passe automático, por jogador): a cadeia passava de 10 s.
assert.ok(plain.ms < 6000, `a cadeia levou ${plain.ms} ms`);
assert.ok(plain.order >= 3, `a ordem foi perguntada ${plain.order} vezes`);
assert.equal(plain.optional, 2, 'o Soul\'s Attendant pergunta para cada ficha');
console.log(`PASS cadeia de ganho de vida em ${plain.ms} ms (${plain.order} ordens, ${plain.optional} opcionais)`);

const kept = await chain(true);
assert.equal(kept.order, 2, 'com a ordem lembrada, só os dois conjuntos diferentes são perguntados');
assert.equal(kept.optional, 1, 'com Sempre sim, o segundo Soul\'s Attendant não pergunta');
assert.equal(kept.saved.length, 1);
assert.equal(kept.saved[0].card, "Soul's Attendant");
assert.equal(kept.saved[0].accept, true);
console.log(`PASS ordem lembrada e Sempre sim: ${kept.order} ordens e ${kept.optional} opcional; Perguntar de novo esquece`);
process.exit(0);
