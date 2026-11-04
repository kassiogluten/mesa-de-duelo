import assert from 'node:assert/strict';
import { test } from 'node:test';
const { lifeChartHTML, commanderDamageHTML, gameSummaryHTML } = await import('../src/ui/lifeChart.ts');

const duel = {
  you: 10, config: { format: 'standard' },
  players: [{ id: 23, name: 'Bia', life: 0 }, { id: 10, name: 'Ana', life: 14 }],
  lifeHistory: [{ turn: 0, life: { 10: 20, 23: 20 } }, { turn: 1, life: { 10: 20, 23: 17 } }, { turn: 2, life: { 10: 14, 23: 0 } }],
};

test('the life chart draws one line per player, you first, with the final life at the end of each line', () => {
  const html = lifeChartHTML(duel);
  const lines = [...html.matchAll(/<polyline class="lc-line" points="([^"]+)" stroke="(#[0-9a-f]+)"/g)];
  assert.equal(lines.length, 2);
  assert.equal(lines[0][2], '#c98500');
  assert.equal(lines[0][1].split(' ').length, 3);
  assert.match(html, /<tspan class="lc-label-life">14<\/tspan> Você/);
  assert.match(html, /<tspan class="lc-label-life">0<\/tspan> Bia/);
  // Uma coluna por turno, com a vida de todos; e a tabela para leitores de tela.
  assert.equal([...html.matchAll(/class="lc-col"/g)].length, 3);
  assert.match(html, /Fim do turno 2/);
  assert.match(html, /<caption>Vida no fim de cada turno<\/caption>/);
  assert.match(html, /aria-label="Gráfico da vida a cada turno. No fim: Você: 14, Bia: 0."/);
});

test('no chart without history (an older server) or with a single point', () => {
  assert.equal(lifeChartHTML({ ...duel, lifeHistory: undefined }), '');
  assert.equal(lifeChartHTML({ ...duel, lifeHistory: duel.lifeHistory.slice(0, 1) }), '');
});

test('the fourth player gets a dashed line', () => {
  const four = { ...duel, players: [...duel.players, { id: 36, name: 'Caio', life: 3 }, { id: 49, name: 'Duda', life: 8 }],
    lifeHistory: duel.lifeHistory.map(p => ({ ...p, life: { ...p.life, 36: 40, 49: 40 } })) };
  const dashed = [...lifeChartHTML(four).matchAll(/<polyline[^>]*stroke-dasharray/g)];
  assert.equal(dashed.length, 1);
});

test('commander damage lists who took how much from which commander, biggest first, only in Commander', () => {
  const s = { you: 10, config: { format: 'commander' }, players: [
    { id: 10, name: 'Ana', life: 12, commanders: [{ id: 1, name: 'Atraxa' }], commanderDamage: [{ commanderId: 2, damage: 6 }, { commanderId: 1, damage: 0 }] },
    { id: 23, name: 'Bia', life: 0, commanders: [{ id: 2, name: 'Krenko' }], commanderDamage: [{ commanderId: 1, damage: 21 }] },
  ] };
  const html = commanderDamageHTML(s, name => name === 'Atraxa' ? 'Atraxa, Pretora' : name);
  assert.deepEqual([...html.matchAll(/<span class="cds-value">(\d+)<\/span>/g)].map(m => m[1]), ['21', '6']);
  assert.match(html, /<li class="lethal">.*Bia recebeu de <strong>Atraxa, Pretora<\/strong> \(você\)/);
  assert.match(html, /Você recebeu de <strong>Krenko<\/strong> \(Bia\)/);
  assert.equal(commanderDamageHTML({ ...s, config: { format: 'standard' } }), '');
  assert.equal(gameSummaryHTML(duel), lifeChartHTML(duel));
});
