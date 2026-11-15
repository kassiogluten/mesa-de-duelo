import assert from 'node:assert/strict';
import { browserSession, TABLE_URL } from './browser-helper.mjs';
// Ver a jogada de novo (item 131): o ▶ do Histórico repete o Raio com a vida daquele momento, a faixa no alto e o
// Histórico fechado, que volta aberto no fim com o foco no mesmo botão; Parar encerra antes.
const { run, evaluate } = browserSession('replay-play-check');
try {
  run('open', `${TABLE_URL}/tests/fixtures/effects-lab.html?mesa&jogar=land,land,bolt`);
  run('set', 'viewport', '1366', '768');
  run('wait', '--fn', `[...document.querySelectorAll('.life')].some(e => e.textContent.trim() === '17')`);
  run('wait', '1500');
  const lives = `[...document.querySelectorAll('.life')].map(e => e.textContent.trim()).join(',')`;
  const before = evaluate(`return ${lives};`);
  evaluate(`document.querySelector('[data-ui=log]').click(); return true;`);
  const bolt = evaluate(`const b = [...document.querySelectorAll('#fLog [data-log-replay]')].find(b => b.getAttribute('aria-label').includes('Raio')); b.click(); return b.dataset.logReplay;`);
  const during = evaluate(`return { lives: ${lives}, banner: !document.querySelector('#fReplay').hidden, text: document.querySelector('#fReplay').textContent, log: document.querySelector('#fLogDrawer').hidden };`);
  assert.equal(during.banner, true, 'a faixa aparece');
  assert.match(during.text, /Repetindo: .*Raio/);
  assert.equal(during.log, true, 'o Histórico fecha durante a repetição');
  assert.notEqual(during.lives, before, 'a mesa mostra a vida de antes do Raio');
  run('wait', '--fn', `document.querySelector('#fReplay').hidden`);
  const after = evaluate(`return { lives: ${lives}, log: document.querySelector('#fLogDrawer').hidden, focus: document.activeElement?.dataset.logReplay };`);
  assert.equal(after.lives, before, 'a mesa volta ao jogo de agora');
  assert.equal(after.log, false, 'o Histórico volta aberto');
  assert.equal(after.focus, bolt, 'o foco volta ao mesmo botão');
  // Parar encerra a repetição na hora.
  evaluate(`document.querySelector('#fLog [data-log-replay="${bolt}"]').click(); return true;`);
  evaluate(`document.querySelector('[data-ui="replay-stop"]').click(); return true;`);
  const stopped = evaluate(`return { banner: document.querySelector('#fReplay').hidden, lives: ${lives}, log: document.querySelector('#fLogDrawer').hidden };`);
  assert.deepEqual(stopped, { banner: true, lives: before, log: false });
  console.log('Replay check passed: the history ▶ replays the play on the board of that moment and returns to the current game.');
} finally { run('close'); }
