import assert from 'node:assert/strict';
import { test } from 'node:test';
const { statsHighlightsHTML, statsTableHTML, statsDetailsHTML } = await import('../src/ui/matchStats.ts');

const duel = {
  you: 10,
  players: [{ id: 23, name: 'Bia' }, { id: 10, name: 'Ana' }],
  stats: {
    10: { damage: 20, combatDamage: 14, removals: 1, draws: 9, kills: 2, damageTo: { 23: 20 } },
    23: { damage: 6, damageTaken: 20, counters: 1, draws: 9, damageTo: { 10: 6 } },
  },
};

test('os quatro destaques mostram os números de quem joga, no singular quando é um', () => {
  const html = statsHighlightsHTML(duel);
  assert.match(html, /<strong>20<\/strong><span>dano causado<\/span>/);
  assert.match(html, /<strong>1<\/strong><span>remoção<\/span>/);
  assert.match(html, /<strong>0<\/strong><span>anulações<\/span>/);
  assert.match(html, /<strong>9<\/strong><span>cartas compradas<\/span>/);
});

test('sem números (servidor antigo) e para quem assiste não há destaques', () => {
  assert.equal(statsHighlightsHTML({ ...duel, stats: undefined }), '');
  assert.equal(statsHighlightsHTML({ ...duel, watching: true }), '');
  assert.equal(statsDetailsHTML({ ...duel, stats: undefined }, false), '');
});

test('a tabela tem você primeiro, marca o maior de cada linha e não repete o dano em cada jogador num duelo', () => {
  const html = statsTableHTML(duel);
  assert.match(html, /<th scope="col" title="Você"><span>Você<\/span><\/th><th scope="col" title="Bia">/);
  assert.match(html, /<th scope="row">Dano causado<\/th><td class="top">20<\/td><td>6<\/td>/);
  // Empate não marca ninguém.
  assert.match(html, /<th scope="row">Cartas compradas<\/th><td>9<\/td><td>9<\/td>/);
  assert.match(html, /<th scope="row">Anulações<\/th><td>0<\/td><td class="top">1<\/td>/);
  assert.doesNotMatch(html, /Dano em cada jogador/);
  // Quem assiste vê os nomes de todos.
  assert.match(statsTableHTML({ ...duel, watching: true }), /title="Ana"/);
});

test('com mais de dois jogadores, a tabela diz quanto dano cada um causou em cada outro', () => {
  const html = statsTableHTML({ ...duel, players: [...duel.players, { id: 31, name: 'Caio' }], stats: { ...duel.stats, 10: { ...duel.stats[10], damageTo: { 23: 12, 31: 8 } }, 31: {} } });
  assert.match(html, /Dano em cada jogador/);
  assert.match(html, /<th scope="row">em Caio<\/th><td>8<\/td><td>0<\/td><td class="st-self"/);
  assert.match(html, /<th scope="row">em você<\/th><td class="st-self" aria-label="não se aplica">–<\/td><td>6<\/td><td>0<\/td>/);
});

test('"Ver todos os números" fica recolhido ou aberto como estava', () => {
  assert.match(statsDetailsHTML(duel, false), /<details class="stats-details" data-stats-details><summary>Ver todos os números<\/summary>/);
  assert.match(statsDetailsHTML(duel, true), /data-stats-details open>/);
});
