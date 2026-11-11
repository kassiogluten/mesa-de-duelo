import test from 'node:test';
import assert from 'node:assert/strict';
const { visibleReports, authorKey, reportListHTML } = await import('../src/admin/adminReports.ts');
const { historyHTML, liveMatchesHTML } = await import('../src/admin/adminMatches.ts');

const report = (code, status, extra = {}) => ({ code, receivedAt: '2026-11-01T12:00:00Z', kind: 'erro', version: '0.130.0', format: 'pauper', bytes: 2048, match: false, bridge: false, status: { status, updatedAt: '2026-11-01T12:00:00Z' }, ...extra });
const items = [report('AAAA', 'novo', { author: { nickname: 'Ana', account: 'x1' }, summary: 'carta sumiu' }), report('BBBB', 'resolvido'), report('CCCC', 'visto', { kind: 'sugestao', author: { nickname: 'Bia' } })];
const filter = extra => ({ status: 'pendentes', kind: '', author: '', q: '', ...extra });

test('report filter: pending, kind, who sent it and search', () => {
  assert.deepEqual(visibleReports(items, filter()).map(i => i.code), ['AAAA', 'CCCC']);
  assert.deepEqual(visibleReports(items, filter({ status: 'todos', kind: 'erro' })).map(i => i.code), ['AAAA', 'BBBB']);
  assert.deepEqual(visibleReports(items, filter({ author: 'n:bia' })).map(i => i.code), ['CCCC']);
  assert.deepEqual(visibleReports(items, filter({ status: 'todos', q: 'SUMIU' })).map(i => i.code), ['AAAA']);
  assert.equal(authorKey(items[0]), 'c:x1');
  assert.equal(authorKey(items[1]), '-');
  const html = reportListHTML(items, { filter: filter(), selected: 'AAAA', totalBytes: 3 * 1024 * 1024 });
  assert.match(html, /3 guardados · 3,0 MB · 1 novos/);
  assert.match(html, /adm-split has-detail/);
  assert.match(html, /Anônimos \(1\)/);
});

test('matches tab: live matches and the month history', () => {
  assert.match(liveMatchesHTML([]), /Nenhuma partida na ponte agora/);
  const live = liveMatchesHTML([{ code: 'ABCD', room: true, format: 'pauper', matchLength: 'bo1', playerCount: 2, createdAt: new Date().toISOString(), matchId: 'm', state: 'jogando', gameNumber: 1, players: [{ name: 'Ana', ai: false, connected: true }, { name: 'IA', ai: true }] }], { total: 3, aparelhos: 1 });
  assert.match(live, /1 jogando · 1 jogador conectado · 3 contas \(1 aparelho conectado\)/);
  const past = [{ id: '1', startedAt: '', endedAt: '2026-11-02T10:00:00Z', ms: 90000, format: 'pauper', length: 'bo1', mode: 'ia', winner: 0, end: 'concedida',
    players: [{ ai: false, deck: 'Elfos', colors: 'G', wins: 1 }, { ai: true, deck: 'Goblins', colors: 'R', wins: 0 }], games: [{ winner: 0, turns: 7, result: ['', 'Conceded'], mull: [1, 0] }] }];
  const html = historyHTML({ month: '2026-11', months: ['2026-11'], end: '', past }, () => '');
  assert.match(html, /1 partida em /);
  assert.match(html, /7 turnos, IA por desistência/);
  assert.match(historyHTML({ month: '2026-11', months: ['2026-11'], end: 'queda', past }, () => ''), /Nenhuma partida queda neste mês/);
});

test('ranking tab: order, win rate, period and the open player', async () => {
  const { rankingHTML, sortedPlayers, winRate } = await import('../src/admin/adminRanking.ts');
  const player = (key, name, played, won, lost, extra = {}) => ({ key, name, account: false, played, won, lost, tied: 0, conceded: 0, dropped: 0, last: '2026-11-02T10:00:00Z', decks: [], opponents: [], recent: [], ...extra });
  const players = [player('c:1', 'Ana', 5, 3, 2, { account: true, decks: [{ name: 'Elfos', played: 5, won: 3 }], recent: [{ id: 'x', endedAt: '2026-11-02T10:00:00Z', format: 'pauper', mode: 'rede', deck: 'Elfos', against: 'Bia', result: 'concedeu' }] }),
    player('n:bia', 'Bia', 2, 2, 0), player('-', undefined, 1, 0, 0, { dropped: 1 })];
  assert.equal(winRate(players[0]), 0.6);
  assert.equal(winRate(players[2]), null, 'só queda: sem porcentagem');
  assert.deepEqual(sortedPlayers(players, 'rate', true).map(p => p.key), ['n:bia', 'c:1', '-']);
  assert.deepEqual(sortedPlayers(players, 'name', false).map(p => p.key), ['c:1', 'n:bia', '-']);
  const state = { month: '', months: ['2026-11'], matches: 6, players, sort: 'won', desc: true, open: null };
  const html = rankingHTML(state);
  assert.match(html, /3 jogadores · 6 partidas desde o começo/);
  assert.match(html, /Sem apelido/);
  assert.match(html, /aria-sort="descending"><button type="button" data-rank-sort="won"[^>]*>Vitórias ▼/);
  assert.match(html, />60%</);
  assert.doesNotMatch(html, /Decks mais usados/);
  const open = rankingHTML({ ...state, open: 'c:1', month: '2026-11' });
  assert.match(open, /aria-expanded="true">Ana/);
  assert.match(open, /Decks mais usados[\s\S]*Elfos[\s\S]*concedeu/);
  assert.match(rankingHTML({ ...state, players: [], matches: 0, month: '2026-11' }), /Nenhuma partida em novembro de 2026/);
});
