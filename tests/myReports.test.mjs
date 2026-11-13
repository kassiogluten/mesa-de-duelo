import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';

// Um localStorage em memória e uma janela que só guarda os eventos disparados.
const data = new Map();
const events = [];
Object.assign(globalThis, {
  localStorage: { getItem: k => data.has(k) ? data.get(k) : null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) },
  dispatchEvent: e => { events.push(e.type); return true; },
});

const { KEYS, EVENTS } = await import('../src/storage.ts');
const reports = await import('../src/myReports.ts');
const { rememberReport, savedReports, refreshMyReports, signature, unseenReports, unnotifiedReports, markSeen, markNotified, hasUnseenReports, summaryOf, statusUrl, SAVED_LIMIT } = reports;
const { noticeText } = await import('../src/ui/myReportsNotice.ts');
const { myReportsHTML } = await import('../src/ui/myReportsDialog.ts');

const HOME = 'http://127.0.0.1:7171/api/relatos';
const OTHER = 'https://outra.example.com/api/relatos';

/** Um servidor de mentira: responde a situação pelos relatos que conhece e anota o que foi pedido. */
function server(known, { account = [] } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, auth: init.headers.Authorization });
    const here = known[url];
    if (!here) throw new TypeError('offline');
    if (here === 404) return new Response('{}', { status: 404 });
    const asked = new Map(body.relatos.map(r => [r.code, r.key]));
    const mine = here.filter(r => asked.get(r.code) === r.key || (init.headers.Authorization === 'Bearer conta' && account.includes(r.code)));
    return new Response(JSON.stringify({ relatos: mine.map(({ key, ...rest }) => rest) }), { status: 200 });
  };
  return calls;
}

beforeEach(() => { data.clear(); events.length = 0; });

test('the status route sits under the route the report was sent to', () => {
  assert.equal(statusUrl(HOME), 'http://127.0.0.1:7171/api/relatos/situacao');
  assert.equal(statusUrl(`${HOME}/`), 'http://127.0.0.1:7171/api/relatos/situacao');
});

test('remembering a sent report: newest first, no repeats, at most 50, one-line summary', () => {
  rememberReport({ code: 'R-AAAA', key: 'k1', url: HOME, kind: 'erro', summary: '  A carta\n sumiu  ', at: 1 });
  rememberReport({ code: 'R-BBBB', key: 'k2', url: HOME, kind: 'sugestao', summary: 'Mais decks', at: 2 });
  rememberReport({ code: 'R-AAAA', key: 'k1', url: HOME, kind: 'erro', summary: 'de novo', at: 3 });
  assert.deepEqual(savedReports().map(r => r.code), ['R-AAAA', 'R-BBBB']);
  assert.equal(savedReports()[1].summary, 'Mais decks');
  assert.ok(events.includes(EVENTS.meusRelatos));
  rememberReport({ code: 'R-SEMK', key: '', url: HOME, kind: 'erro', summary: 'servidor antigo' });
  assert.equal(savedReports().length, 2, 'without a key there is nothing to look up later');
  for (let i = 0; i < SAVED_LIMIT + 5; i++) rememberReport({ code: `R-${i}`, key: 'k', url: HOME, kind: 'erro', summary: 'x', at: 10 + i });
  assert.equal(savedReports().length, SAVED_LIMIT);
  assert.equal(savedReports()[0].code, `R-${SAVED_LIMIT + 4}`);
  assert.equal(summaryOf(`  a\n\n b ${'x'.repeat(300)}`).length, 160);
  data.set(KEYS.meusRelatos, '{"nao":"lista"}');
  assert.deepEqual(savedReports(), []);
});

test('the signature only changes with what counts as news', () => {
  assert.equal(signature({ status: 'recebido' }), '|');
  assert.equal(signature({ status: 'analise' }), '|', 'moving to Em análise does not warn anyone');
  assert.equal(signature({ status: 'resolvido' }), 'resolvido|');
  assert.equal(signature({ status: 'encerrado' }), 'encerrado|');
  assert.equal(signature({ status: 'analise', reply: 'Oi', repliedAt: '2026-11-13T10:00:00Z' }), '|2026-11-13T10:00:00Z');
  assert.notEqual(signature({ status: 'analise', reply: 'Oi', repliedAt: '2026-11-13T10:00:00Z' }), signature({ status: 'analise', reply: 'Oi!', repliedAt: '2026-11-13T11:00:00Z' }));
  assert.equal(signature({ status: 'analise', repliedAt: '2026-11-13T10:00:00Z' }), '|', 'a reply that was removed is not news');
});

test('refresh: one request per server, the account only on the default one, merged and sorted, gone reports pruned', async () => {
  rememberReport({ code: 'R-AAAA', key: 'k1', url: HOME, kind: 'erro', summary: 'A carta sumiu', at: 1000 });
  rememberReport({ code: 'R-GONE', key: 'k9', url: HOME, kind: 'erro', summary: 'Apagado pela retenção', at: 500 });
  rememberReport({ code: 'R-CCCC', key: 'k3', url: OTHER, kind: 'sugestao', summary: 'Em outro servidor', at: 3000 });
  const calls = server({
    [`${HOME}/situacao`]: [
      { code: 'R-AAAA', key: 'k1', kind: 'erro', summary: 'A carta sumiu', receivedAt: '2026-11-10T12:00:00Z', status: 'analise', reply: 'Vamos olhar.', repliedAt: '2026-11-11T09:00:00Z' },
      { code: 'R-CONT', key: 'x', kind: 'sugestao', summary: 'Enviado de outro aparelho', receivedAt: '2026-11-12T12:00:00Z', status: 'resolvido' },
      { code: 'R-ALHE', key: 'y', kind: 'erro', summary: 'De outra pessoa', receivedAt: '2026-11-12T13:00:00Z', status: 'recebido' },
    ],
    [`${OTHER}/situacao`]: [{ code: 'R-CCCC', key: 'k3', kind: 'sugestao', summary: 'Em outro servidor', receivedAt: '2026-11-13T12:00:00Z', status: 'estado-novo-do-futuro' }],
  }, { account: ['R-CONT'] });

  const { reports: list, offline } = await refreshMyReports('conta');
  assert.equal(offline, false);
  assert.deepEqual(list.map(r => r.code), ['R-CCCC', 'R-CONT', 'R-AAAA']);
  assert.equal(calls.length, 2);
  const home = calls.find(c => c.url === `${HOME}/situacao`), other = calls.find(c => c.url === `${OTHER}/situacao`);
  assert.equal(home.auth, 'Bearer conta');
  assert.equal(other.auth, undefined, 'the account token never goes to another server');
  assert.deepEqual(home.body.relatos.map(r => r.code).sort(), ['R-AAAA', 'R-GONE']);
  assert.deepEqual(other.body.relatos, [{ code: 'R-CCCC', key: 'k3' }]);
  const a = list.find(r => r.code === 'R-AAAA');
  assert.equal(a.status, 'analise'); assert.equal(a.reply, 'Vamos olhar.'); assert.equal(a.at, Date.parse('2026-11-10T12:00:00Z'));
  assert.equal(list[0].status, 'recebido', 'a status this version does not know reads as Recebido');
  assert.deepEqual(savedReports().map(r => r.code).sort(), ['R-AAAA', 'R-CCCC'], 'the report the server no longer has leaves the device');
  assert.equal(hasUnseenReports(), true);
});

test('with a server away the device list still shows, without status, and nothing is pruned', async () => {
  rememberReport({ code: 'R-AAAA', key: 'k1', url: HOME, kind: 'erro', summary: 'A carta sumiu', at: 1000 });
  rememberReport({ code: 'R-CCCC', key: 'k3', url: OTHER, kind: 'sugestao', summary: 'Em outro servidor', at: 3000 });
  server({ [`${OTHER}/situacao`]: 404 });
  const { reports: list, offline } = await refreshMyReports(null);
  assert.equal(offline, true);
  assert.deepEqual(list, [
    { code: 'R-CCCC', kind: 'sugestao', summary: 'Em outro servidor', at: 3000 },
    { code: 'R-AAAA', kind: 'erro', summary: 'A carta sumiu', at: 1000 },
  ]);
  assert.equal(savedReports().length, 2);
  assert.equal(hasUnseenReports(), false);
});

test('with nothing sent and no account the server is not even asked', async () => {
  const calls = server({});
  assert.deepEqual(await refreshMyReports(null), { reports: [], offline: false });
  assert.equal(calls.length, 0);
});

test('unseen and unnotified: seen once, warned once, and news again when the reply changes', () => {
  const quiet = { code: 'R-AAAA', kind: 'erro', summary: '', at: 1, status: 'analise' };
  const answered = { code: 'R-BBBB', kind: 'erro', summary: '', at: 2, status: 'analise', reply: 'Oi', repliedAt: '2026-11-13T10:00:00Z' };
  const solved = { code: 'R-CCCC', kind: 'erro', summary: '', at: 3, status: 'resolvido' };
  const all = [quiet, answered, solved];
  assert.deepEqual(unseenReports(all).map(r => r.code), ['R-BBBB', 'R-CCCC']);
  assert.deepEqual(unnotifiedReports(all).map(r => r.code), ['R-BBBB', 'R-CCCC']);
  markNotified([answered]);
  assert.deepEqual(unnotifiedReports(all).map(r => r.code), ['R-CCCC']);
  assert.deepEqual(unseenReports(all).map(r => r.code), ['R-BBBB', 'R-CCCC'], 'warned is not seen: the dot stays');
  markSeen(all);
  assert.deepEqual(unseenReports(all), []);
  assert.deepEqual(unnotifiedReports(all), [], 'what was seen in Meus relatos is not warned afterwards');
  const edited = { ...answered, reply: 'Oi, corrigido', repliedAt: '2026-11-14T10:00:00Z' };
  assert.deepEqual(unseenReports([quiet, edited, solved]).map(r => r.code), ['R-BBBB']);
  assert.deepEqual(unnotifiedReports([quiet, edited, solved]).map(r => r.code), ['R-BBBB']);
  assert.deepEqual(unseenReports([quiet, { ...answered, status: 'encerrado' }]).map(r => r.code), ['R-BBBB'], 'closing an answered report is news too');
});

test('the notice names the report, or counts them', () => {
  const answered = { code: 'R-7K2Q', kind: 'erro', summary: '', at: 1, status: 'analise', reply: 'Oi', repliedAt: 'x' };
  assert.equal(noticeText([answered]), 'Seu relato R-7K2Q tem resposta');
  assert.equal(noticeText([{ ...answered, reply: undefined, status: 'resolvido' }]), 'Seu relato R-7K2Q foi resolvido');
  assert.equal(noticeText([{ ...answered, reply: undefined, status: 'encerrado' }]), 'Seu relato R-7K2Q foi encerrado');
  assert.equal(noticeText([answered, { ...answered, code: 'R-2222' }]), 'Seus relatos têm resposta (2)');
  assert.equal(noticeText([answered, { ...answered, code: 'R-2222', reply: undefined, status: 'resolvido' }]), 'Seus relatos têm novidades (2)');
});

test('the screen: one card per report, the reply escaped, and the empty and offline notes', () => {
  const html = myReportsHTML([
    { code: 'R-7K2Q', kind: 'erro', summary: 'A <b>carta</b> sumiu', at: Date.parse('2026-11-10T12:00:00Z'), status: 'resolvido', reply: 'Corrigido <script>', repliedAt: '2026-11-12T12:00:00Z' },
    { code: 'R-2222', kind: 'sugestao', summary: 'Mais decks', at: 0 },
  ], { offline: true });
  assert.equal((html.match(/class="my-report[ "]/g) ?? []).length, 2);
  assert.match(html, /A &lt;b&gt;carta&lt;\/b&gt; sumiu/);
  assert.match(html, /Corrigido &lt;script&gt;/);
  assert.match(html, /s-resolvido">Resolvido</);
  assert.match(html, /Não consegui falar com o servidor agora\./);
  assert.equal((html.match(/my-report-status/g) ?? []).length, 1, 'without an answer from the server there is no status to show');
  assert.match(myReportsHTML([], {}), /Você ainda não mandou relatos\./);
  assert.doesNotMatch(myReportsHTML([], { loading: true }), /ainda não mandou/);
});
