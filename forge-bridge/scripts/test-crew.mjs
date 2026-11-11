// Shorikai, Genesis Engine numa partida de verdade: a habilidade compra duas, descarta uma e cria o Piloto; o
// Tripular 8 mostra "Tripulando: N / 8", não deixa confirmar abaixo de 8 e, com o Piloto contando como 3, tripula.
// node forge-bridge/scripts/test-crew.mjs [ws://127.0.0.1:7171/ws]
import assert from 'node:assert/strict';

const url = process.argv[2] || 'ws://127.0.0.1:7171/ws';
const wait = ms => new Promise(r => setTimeout(r, ms));
async function connect() {
  const p = { ws: new WebSocket(url), state: null, room: null };
  p.send = m => p.ws.send(JSON.stringify(m));
  p.ws.addEventListener('message', ({ data }) => { const m = JSON.parse(data); if (m.type === 'state') p.state = m; if (m.type === 'room') p.room = m.room; });
  await new Promise((res, rej) => { p.ws.addEventListener('open', res, { once: true }); p.ws.addEventListener('error', rej, { once: true }); });
  return p;
}
async function until(test, label, step, ms = 30000) {
  const end = Date.now() + ms;
  while (!test()) { if (Date.now() > end) throw new Error('Tempo esgotado: ' + label); step?.(); await wait(60); }
}

const host = await connect(), guest = await connect();
try {
  const scenario = { active: 0, phase: 'main1', players: [
    { life: 20, poison: 0, hand: ['Plains'], library: ['Opt', 'Shock', 'Island', 'Island', 'Island'], graveyard: [], exile: [],
      battlefield: [{ name: 'Shorikai, Genesis Engine' }, { name: 'Grizzly Bears' }, { name: 'Hill Giant' }, { name: 'Plains' }, { name: 'Island' }] },
    { life: 20, poison: 0, hand: [], library: ['Island', 'Island', 'Island', 'Island', 'Island'], graveyard: [], exile: [], battlefield: [{ name: 'Island' }] } ] };
  host.send({ type: 'lab-host', name: 'Jogador 1', scenario });
  await until(() => host.room?.code, 'sala');
  guest.send({ type: 'join', code: host.room.code, name: 'Jogador 2' });
  const s = () => host.state, me = () => s().players.find(p => p.id === s().you);
  const named = name => me().battlefield.find(c => c.name === name);
  let last = 0;
  // Passa adiante (sem atacar) até a prioridade numa fase principal com a pilha vazia.
  const toMain = label => until(() => s()?.input?.priority && /MAIN/.test(s().phase) && !s().stack?.length && me()?.battlefield.length >= 5, label, () => {
    const st = s();
    if (st?.input && Date.now() - last > 800 && (st.input.attacking || (st.input.priority && (!/MAIN/.test(st.phase) || st.stack?.length)))) { last = Date.now(); host.send({ type: 'ok', gen: st.input.gen }); }
  });

  await toMain('fase principal');
  host.send({ type: 'card', id: named('Shorikai, Genesis Engine').id, gen: s().input.gen });
  await until(() => s().input.paying, 'pagar {1}');
  host.send({ type: 'ok', gen: s().input.gen });
  await until(() => /Descartar/.test(s().input.message ?? '') && s().input.selectable?.length, 'descartar', () => {
    if (s().input.priority && s().stack?.length && Date.now() - last > 800) { last = Date.now(); host.send({ type: 'ok', gen: s().input.gen }); }
  });
  const plains = me().hand.find(c => c.name === 'Plains');
  host.send({ type: 'card', id: plains.id, gen: s().input.gen });
  await until(() => named('Pilot Token'), 'ficha de Piloto');
  assert.deepEqual(me().hand.map(c => c.name).sort(), ['Opt', 'Shock'], 'comprou duas');
  assert.deepEqual(me().graveyard.map(c => c.name), ['Plains'], 'descartou a escolhida');
  assert.equal(named('Pilot Token').power, 1);
  assert.match(named('Pilot Token').text, /as though its power were 2 greater/);
  console.log('PASS habilidade: comprou duas, descartou uma e criou o Piloto 1/1');

  await toMain('fase principal para tripular');
  host.send({ type: 'card', id: named('Shorikai, Genesis Engine').id, gen: s().input.gen });
  await until(() => /Tripulando: 0 \/ 8/.test(s().input.message ?? ''), 'pedido de tripular traduzido');
  assert.equal(s().input.ok.enabled, false, 'OK desligado sem poder escolhido');
  assert.equal(s().input.cancel.enabled, true, 'Cancelar para desistir');
  host.send({ type: 'card', id: named('Grizzly Bears').id, gen: s().input.gen });
  await until(() => /Tripulando: 2 \/ 8/.test(s().input.message ?? ''), '2 de 8');
  assert.equal(s().input.ok.enabled, false, 'OK desligado com 2 de 8');
  host.send({ type: 'ok', gen: s().input.gen });
  await wait(800);
  assert.match(s().input.message, /Tripulando: 2 \/ 8/, 'o OK com 2 de 8 não desiste do tripular');
  host.send({ type: 'card', id: named('Hill Giant').id, gen: s().input.gen });
  await until(() => /Tripulando: 5 \/ 8/.test(s().input.message ?? ''), '5 de 8');
  host.send({ type: 'card', id: named('Pilot Token').id, gen: s().input.gen });
  await until(() => named('Shorikai, Genesis Engine').creature, 'Shorikai tripulada', () => {
    if (s().input.priority && s().stack?.length && Date.now() - last > 800) { last = Date.now(); host.send({ type: 'ok', gen: s().input.gen }); }
    else if (s().input.ok?.enabled && /Tripulando/.test(s().input.message ?? '') && Date.now() - last > 800) { last = Date.now(); host.send({ type: 'ok', gen: s().input.gen }); }
  });
  const shorikai = named('Shorikai, Genesis Engine');
  assert.equal(shorikai.power, 8); assert.equal(shorikai.toughness, 8);
  assert.deepEqual([...shorikai.crewedBy].sort(), ['Grizzly Bears', 'Hill Giant', 'Pilot Token']);
  console.log('PASS tripular 8: OK desligado abaixo de 8, e Ursos + Gigante + Piloto (3) tripulam a Shorikai 8/8');
} finally {
  host.send({ type: 'lab-close' }); guest.send({ type: 'leave' }); host.send({ type: 'leave' });
  await wait(200); host.ws.close(); guest.ws.close();
}
