import assert from 'node:assert/strict';
import { browserSession, TABLE_URL } from './browser-helper.mjs';
// Alvo que só pode estar num cemitério: a janela abre sozinha, com uma aba por jogador, fecha ao escolher e não volta se fechada à mão.
const { run, evaluate } = browserSession('graveyard-target-check');
try {
  run('open', `${TABLE_URL}/tests/fixtures/duel-table.html?cenario=alvo-cemiterio`);
  run('set', 'viewport', '1366', '768');
  const r = evaluate(`
    const wait = ms => new Promise(res => setTimeout(res, ms)), zone = () => document.querySelector('#fZone'), out = {};
    for (let i = 0; i < 40 && zone().hidden; i++) await wait(100);
    out.opened = !zone().hidden; out.title = zone().querySelector('h2').textContent;
    out.tabs = [...zone().querySelectorAll('.zone-tab')].map(t => [t.dataset.gy, t.getAttribute('aria-selected'), t.querySelector('.zone-tab-targets')?.textContent ?? '']);
    out.cancel = !!zone().querySelector('[data-act="cancel"]:not(:disabled)');
    zone().querySelector('.zone-tab[data-gy="23"]').click(); await wait(50);
    out.theirTitle = zone().querySelector('h2').textContent;
    zone().querySelector('[data-ui="zone-close"]').click(); window.fixture.state.input.gen++; window.fixture.render(); await wait(50);
    out.staysClosed = zone().hidden;
    document.querySelector('.pile.gy[data-gy="23"]').click(); await wait(50);
    zone().querySelector('.q-face.actionable[data-fid="294"]').click(); await wait(200);
    out.closedAfterPick = zone().hidden;
    window.fixture.graveyardTarget(true); await wait(50);
    out.onlyTheirs = zone().querySelector('h2').textContent;
    return out;
  `);
  assert.ok(r.opened, 'graveyard did not open by itself');
  assert.equal(r.title, 'Cemitério · Você (3)');
  assert.deepEqual(r.tabs, [['10', 'true', '1 alvo'], ['23', 'false', '2 alvos']]);
  assert.ok(r.cancel, 'cancel missing inside the graveyard');
  assert.equal(r.theirTitle, 'Cemitério · Oponente (3)');
  assert.ok(r.staysClosed, 'reopened after being closed by hand');
  assert.ok(r.closedAfterPick, 'stayed open after the target was chosen');
  assert.equal(r.onlyTheirs, 'Cemitério · Oponente (3)');
  console.log('Graveyard target passed: opens by itself, tabs per player, closes on pick, stays closed when dismissed.');
} finally { run('close'); }
