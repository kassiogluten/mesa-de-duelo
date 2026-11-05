// Cada cenário pronto do Laboratório (src/lab-cenarios.json) montado numa sala de teste de verdade: as cartas caem
// nas zonas certas (mão, campo, cemitério, exílio), com a vida e o grimório do cenário. O que fazer depois na mesa
// ("conferir") continua sendo à mão; isto garante que a mesa montada é a que o cenário descreve.
// node forge-bridge/scripts/test-lab-scenarios.mjs [ws://127.0.0.1:7171/ws]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const endpoint = process.argv[2] || 'ws://127.0.0.1:7171/ws';
const scenarios = JSON.parse(readFileSync(new URL('../../src/lab-cenarios.json', import.meta.url), 'utf8'));
const wait = ms => new Promise(r => setTimeout(r, ms));

function connect() {
  const p = { ws: new WebSocket(endpoint), messages: [], state: null };
  p.send = m => p.ws.send(JSON.stringify(m));
  p.ws.addEventListener('message', ({ data }) => { const m = JSON.parse(data); p.messages.push(m); if (m.type === 'state') p.state = m; });
  return new Promise((resolve, reject) => { p.ws.addEventListener('open', () => resolve(p), { once: true }); p.ws.addEventListener('error', reject, { once: true }); });
}
async function until(test, label, timeout = 20000) {
  const end = Date.now() + timeout;
  while (!test()) { if (Date.now() > end) throw new Error(`Tempo esgotado: ${label}`); await wait(50); }
}
const names = cards => (cards ?? []).map(c => c.name).sort();
const expected = list => [...list].sort();

let failed = 0;
for (const s of scenarios) {
  const host = await connect(), guest = await connect();
  try {
    host.send({ type: 'lab-host', name: 'Jogador 1', scenario: s.cenario });
    await until(() => host.messages.some(m => m.type === 'room'), `${s.nome}: sala`);
    const code = host.messages.find(m => m.type === 'room').room.code;
    guest.send({ type: 'join', code, name: 'Jogador 2' });
    // Confere tudo de uma vez; repete até bater (a montagem chega em alguns ciclos) e, no prazo, acusa o que faltou.
    const check = () => {
      const st = host.state;
      assert.ok(st?.players?.length === 2, `${s.nome}: sem estado da partida`);
      const me = st.players.find(p => p.id === st.you), them = st.players.find(p => p.id !== st.you);
      for (const [player, sp, label] of [[me, s.cenario.players[0], 'Jogador 1'], [them, s.cenario.players[1], 'Jogador 2']]) {
        assert.deepEqual(names(player.battlefield), expected(sp.battlefield.map(c => c.name)), `${s.nome}: campo do ${label}`);
        assert.deepEqual(names(player.graveyard), expected(sp.graveyard), `${s.nome}: cemitério do ${label}`);
        assert.deepEqual(names(player.exile), expected(sp.exile), `${s.nome}: exílio do ${label}`);
        assert.equal(player.library, sp.library.length, `${s.nome}: grimório do ${label}`);
        assert.equal(player.life, sp.life, `${s.nome}: vida do ${label}`);
      }
      assert.deepEqual(names(me.hand), expected(s.cenario.players[0].hand), `${s.nome}: mão do Jogador 1`);
      assert.equal(them.handCount, s.cenario.players[1].hand.length, `${s.nome}: mão do Jogador 2`);
    };
    const end = Date.now() + 20000;
    for (;;) {
      try { check(); break; } catch (e) { if (Date.now() > end) throw e; await wait(100); }
    }
    console.log(`PASS ${s.nome}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${s.nome}: ${e.message.split('\n')[0]}`);
  } finally {
    host.send({ type: 'lab-close' }); guest.send({ type: 'leave' }); host.send({ type: 'leave' });
    await wait(100); host.ws.close(); guest.ws.close();
  }
}
console.log(`${scenarios.length - failed}/${scenarios.length} cenários montados como descritos`);
process.exit(failed ? 1 : 0);
