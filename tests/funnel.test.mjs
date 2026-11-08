import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.sessionStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const { countFunnel, funnelUrl } = await import('../src/funnel.ts');
const { funnelHTML } = await import('../src/admin/adminFunnel.ts');

test('each step of starting to play is counted once per tab, with only its name', () => {
  store.clear();
  const sent = [];
  const send = (url, body) => sent.push([url, JSON.parse(body)]);
  assert.equal(countFunnel('deck', send), true);
  assert.equal(countFunnel('deck', send), false, 'a second deck in the same tab does not count');
  assert.equal(countFunnel('partida-ia', send), true);
  assert.deepEqual(sent.map(([, body]) => body), [{ evento: 'deck' }, { evento: 'partida-ia' }]);
  assert.match(sent[0][0], /\/api\/funil$/);
  assert.equal(funnelUrl(), sent[0][0]);
});

test('a failing network does not break the page', () => {
  store.clear();
  assert.equal(countFunnel('jogar', () => { throw new Error('offline'); }), true);
});

test('the admin table shows each week with the share of chosen decks that became a match', () => {
  const html = funnelHTML([{ semana: '2026-11-02', jogar: 10, deck: 8, 'partida-ia': 5, 'partida-sala': 1 }]);
  assert.match(html, /02\/11 a 08\/11/);
  assert.match(html, /75%/);
  assert.match(funnelHTML([]), /Nenhum visitante/);
});
