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
