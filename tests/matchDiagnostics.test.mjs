import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MatchDiagnostics } from '../src/ui/matchDiagnostics.ts';

test('repeated identical errors collapse into one line with a count', () => {
  let now = 1000;
  const d = new MatchDiagnostics(() => now);
  d.add('ação ignorada', 'Ação ignorada', { turn: 3 }, 'ação: ok');
  now += 800; d.add('ação ignorada', 'Ação ignorada', { turn: 3 }, 'ação: ok');
  assert.equal(d.entries.length, 1); assert.equal(d.entries[0].repeats, 2);
  now += 10000; d.add('ação ignorada', 'Ação ignorada', { turn: 3 }, 'ação: ok');
  assert.equal(d.entries.length, 2, 'a later repeat is a new line');
});

test('unseen count, cap and report', () => {
  const d = new MatchDiagnostics(() => 0);
  for (let i = 0; i < 105; i++) d.add('aviso', `erro ${i}`);
  assert.equal(d.entries.length, 100); assert.equal(d.entries[0].text, 'erro 5'); assert.equal(d.unseen, 100);
  d.markSeen(); assert.equal(d.unseen, 0);
  d.add('conexão', 'caiu', { matchId: 'ABC', turn: 4, phase: 'MAIN1' });
  assert.equal(d.unseen, 1);
  const report = d.report({ 'versão da mesa': '0.22.0', motor: undefined });
  assert.match(report, /versão da mesa: 0\.22\.0/); assert.doesNotMatch(report, /motor:/);
  assert.match(report, /conexão: caiu — partida ABC, turno 4, MAIN1/);
  d.clear(); assert.equal(d.unseen, 0); assert.match(d.report({}), /Nenhum erro registrado/);
});
