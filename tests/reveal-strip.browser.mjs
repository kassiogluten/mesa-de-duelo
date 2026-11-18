import assert from 'node:assert/strict';
import { browserSession, TABLE_URL } from './browser-helper.mjs';
// Cartas reveladas por outro jogador: não abrem janela sozinhas, vão para a faixa das remoções; tocar abre a janela com
// as cartas, com navegação entre os avisos; a mesa avisa o servidor que guardou; com uma remoção, a faixa conta todos.
const { run, evaluate } = browserSession('reveal-strip-check');
try {
  run('open', `${TABLE_URL}/tests/fixtures/duel-table.html?cenario=reveladas`);
  run('set', 'viewport', '1366', '768');
  const r = evaluate(`
    const wait = ms => new Promise(res => setTimeout(res, ms)), out = {};
    const win = () => document.querySelector('#fRemoval'), strip = () => document.querySelector('#fRemovalStrip');
    const ui = name => document.querySelector('[data-ui="' + name + '"]');
    for (let i = 0; i < 100 && strip().hidden; i++) await wait(100);
    out.strip = !strip().hidden; out.windowClosed = win().hidden && document.querySelector('#fReveal').hidden;
    out.stripText = strip().querySelector('.removal-strip-text').textContent;
    out.count = strip().querySelector('.removal-strip-count')?.textContent;
    out.seen = window.fixture.messages.filter(m => m.type === 'reveal-seen').map(m => m.seq);
    ui('removal-open').click(); await wait(50);
    out.title = win().querySelector('h2').textContent;
    out.cards = win().querySelectorAll('.reveal-card').length;
    out.chosen = win().querySelectorAll('.reveal-card.chosen').length;
    ui('removal-next').click(); await wait(50);
    out.second = win().querySelector('h2').textContent;
    ui('removal-minimize').click(); await wait(50);
    out.minimized = win().hidden && !strip().hidden;
    ui('removal-dismiss').click(); await wait(50);
    out.dismissed = strip().hidden;
    window.fixture.render(); await wait(50);
    out.stayedDismissed = strip().hidden;
    window.fixture.reveals(false, true);
    for (let i = 0; i < 100 && strip().hidden; i++) await wait(100);
    out.mixed = strip().querySelector('.removal-strip-text').textContent;
    out.mixedCount = strip().querySelector('.removal-strip-count')?.textContent;
    return out;`);
  assert.ok(r.strip, 'revealed cards did not reach the strip');
  assert.ok(r.windowClosed, 'revealed cards opened a window by themselves');
  assert.match(r.stripText, /Goblin Guide \(Ana\).*revelou .* do grimório.*e mais 1 aviso/s);
  assert.equal(r.count, '2');
  assert.deepEqual(r.seen, [1, 2], 'the table did not tell the server it kept the notices');
  assert.match(r.title, /Ana escolheu/);
  assert.equal(r.cards, 5); assert.equal(r.chosen, 1);
  assert.match(r.second, /Ana revelou .* do grimório/);
  assert.ok(r.minimized, 'Minimizar did not bring the strip back');
  assert.ok(r.dismissed && r.stayedDismissed, 'dismissed notices came back');
  assert.match(r.mixed, /e mais 1 aviso/);
  assert.equal(r.mixedCount, '2', 'a removal and a reveal did not share the strip');
  console.log('Reveal strip passed: reveals minimized with removals, open/next/minimize/×, acknowledged to the server.');
} finally { try { run('close'); } catch { /* já fechado */ } }
