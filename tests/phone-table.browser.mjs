// Celular deitado (phoneTable.css e fitFieldLines): cada campo numa linha só enquanto cabe e em duas fileiras depois;
// com vários jogadores, os botões do topo numa coluna à esquerda e os oponentes desde o topo da tela.
import assert from 'node:assert/strict';
import { browserSession, TABLE_URL } from './browser-helper.mjs';
const { run, evaluate } = browserSession('phone-table-check');
/** Enche o campo de todos: criaturas e terrenos com nomes diferentes, para nada virar monte. */
const fill = (creatures, lands) => `{ const s = window.fixture.state; let n = 70000;
  const card = (name, controller, extra) => ({ id: n++, name, controller, tapped: false, token: false, manaCost: '{2}{G}', typeLine: 'Creature', creature: true, power: 2, toughness: 2, ...extra });
  for (const p of s.players) p.battlefield = [
    ...Array.from({ length: ${lands} }, (_, i) => card('Terreno ' + i, p.id, { creature: false, land: true, typeLine: 'Land', manaCost: '' })),
    ...Array.from({ length: ${creatures} }, (_, i) => card('Criatura ' + i, p.id, {}))];
  window.fixture.render(); }`;
/** De cada campo à vista: o arranjo, a altura das criaturas e se alguma fileira rola. */
const fields = `[...document.querySelectorAll('.forge > .field, .table-seat > .field')].filter(f => f.clientHeight).map(f => ({
  who: f.closest('.table-seat') ? 'seat' : f.classList.contains('me') ? 'me' : 'opp',
  lines: f.classList.contains('one-line') ? 1 : f.classList.contains('two-lines') ? 2 : 0,
  creature: f.querySelector('.row.creatures .slot')?.offsetHeight ?? 0,
  rows: new Set([...f.querySelectorAll('.row')].filter(r => r.childElementCount).map(r => Math.round(r.getBoundingClientRect().top))).size,
  creaturesScroll: [...f.querySelectorAll('.row.creatures')].some(r => r.scrollWidth > r.clientWidth + 1) }))`;
const open = page => { run('open', `${TABLE_URL}/tests/fixtures/${page}.html`); };
try {
  // Duelo: a mesa pequena numa linha só, com cartas bem maiores que as das duas fileiras.
  open('duel-table'); run('set', 'viewport', '844', '390'); open('duel-table');
  let board = evaluate(`return ${fields};`);
  assert.deepEqual(board.map(f => f.lines), [1, 1], 'duelo, mesa pequena: uma linha de cada lado');
  assert.ok(board.every(f => f.creature >= 90), `duelo, mesa pequena: criaturas com ${board.map(f => f.creature)} px`);
  board = evaluate(`${fill(10, 10)}; return ${fields};`);
  assert.deepEqual(board.map(f => f.lines), [2, 2], 'duelo, mesa cheia: duas fileiras de cada lado');
  assert.ok(board.every(f => f.rows === 2 && !f.creaturesScroll), 'duelo, mesa cheia: dez criaturas cabem sem rolar');
  // Fora do celular deitado nenhum campo é marcado: vale o arranjo de sempre.
  run('set', 'viewport', '1366', '768');
  assert.deepEqual(evaluate(`window.dispatchEvent(new Event('resize')); return ${fields}.map(f => f.lines);`), [0, 0], 'desktop: sem arranjo do celular');

  // Vários jogadores: os botões numa coluna, os oponentes desde o topo e a tela cheia no menu.
  open('commander-table'); run('set', 'viewport', '844', '390'); open('commander-table');
  const bar = evaluate(`const box = s => { const r = document.querySelector(s).getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    document.querySelector('[data-ui="menu"]').click();
    const item = document.querySelector('.game-menu-fullscreen'), out = { topbar: box('.topbar'), seats: box('#fOpponents'), firstSeat: box('.table-seat'), command: box('#fCommand'),
      topButton: getComputedStyle(document.querySelector('.topbar .fs-btn')).display, menuItem: item.hidden ? 'sem tela cheia' : getComputedStyle(item).display };
    document.querySelector('[data-ui="menu"]').click(); return out;`);
  assert.ok(bar.topbar.width <= 60 && bar.topbar.height > bar.topbar.width, 'os botões do topo viram uma coluna');
  assert.ok(bar.seats.top <= 4 && bar.firstSeat.left >= bar.topbar.right, 'os oponentes começam no topo, ao lado da coluna');
  assert.ok(bar.topbar.bottom <= bar.command.top, 'a coluna termina antes da zona de comando');
  assert.equal(bar.topButton, 'none', 'o botão de tela cheia sai da coluna');
  assert.ok(['flex', 'sem tela cheia'].includes(bar.menuItem), 'a tela cheia vira item do menu');
  board = evaluate(`return ${fields};`);
  assert.ok(board.every(f => f.lines === 1 && f.creature >= 90), `vários jogadores, mesa pequena: uma linha com cartas grandes (${board.map(f => f.creature)})`);
  // Mesa média: a sua linha encolhe para caber e fica no meio da faixa entre o topo do campo e a mão (com os selos de custo), sem sobra só embaixo.
  const middle = evaluate(`${fill(5, 6)}; const f = document.querySelector('.forge > .field.me'), slots = [...f.querySelectorAll('.slot')].map(s => s.getBoundingClientRect());
    const hand = Math.min(...[...document.querySelectorAll('#fHand .hcard, #fHand .hcost')].map(e => e.getBoundingClientRect().top));
    return { lines: f.classList.contains('one-line'), above: Math.min(...slots.map(b => b.top)) - f.getBoundingClientRect().top, below: hand - Math.max(...slots.map(b => b.bottom)) };`);
  assert.ok(middle.lines && middle.above > 15 && Math.abs(middle.above - middle.below) <= 8, `mesa média: a linha fica no meio (${Math.round(middle.above)} em cima, ${Math.round(middle.below)} embaixo)`);
  // Mesa cheia: duas fileiras para todos, e as suas oito criaturas à vista sem rolar, acima da mão.
  const full = evaluate(`${fill(8, 9)}; const mine = [...document.querySelectorAll('.forge > .field.me .slot')].map(s => s.getBoundingClientRect());
    return { board: ${fields}, right: Math.max(...mine.map(r => r.right)), bottom: Math.max(...mine.map(r => r.bottom)), hand: document.querySelector('#fHand .hcard').getBoundingClientRect().top, width: innerWidth };`);
  assert.ok(full.board.every(f => f.lines === 2 && f.rows === 2), 'vários jogadores, mesa cheia: duas fileiras em todos os campos');
  assert.ok(!full.board.find(f => f.who === 'me').creaturesScroll && full.right <= full.width, 'as suas criaturas cabem na largura');
  assert.ok(full.bottom <= full.hand + 8, `a fileira de baixo fica acima da mão (${Math.round(full.bottom)} e ${Math.round(full.hand)})`);
  console.log('phone table browser checks passed');
} finally { try { run('close'); } catch {} }
