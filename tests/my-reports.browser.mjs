import assert from 'node:assert/strict';
import { browserSession, TABLE_URL } from './browser-helper.mjs';
// Meus relatos: o aviso aparece uma vez, o ponto fica no menu ⋯ até abrir a tela, e a tela mostra estado e resposta.
const { run, evaluate } = browserSession('my-reports-check');
try {
  run('open', `${TABLE_URL}/tests/fixtures/my-reports.html`);
  run('set', 'viewport', '1366', '768');
  const r = evaluate(`
    const wait = ms => new Promise(res => setTimeout(res, ms)), $ = s => document.querySelector(s), out = {};
    for (let i = 0; i < 40 && !$('.my-reports-notice'); i++) await wait(100);
    out.notice = $('.my-reports-notice strong')?.textContent;
    out.dot = !$('.mais-dot').hidden;
    $('.mais-btn').click(); await wait(50);
    out.item = $('[data-mais="my-reports"]').textContent.trim();
    out.itemDot = !$('.mais-item-dot').hidden;
    $('.mais-btn').click();
    // Avisado uma vez: consultar de novo não mostra o aviso outra vez, mas o ponto continua.
    $('.my-reports-notice .pwa-dismiss').click();
    await window.fixture.check(); await wait(50);
    out.noticeAgain = !!$('.my-reports-notice');
    out.dotAfterNotice = !$('.mais-dot').hidden;
    // Abrir a tela marca tudo como visto.
    $('.mais-btn').click(); await wait(50); $('[data-mais="my-reports"]').click();
    for (let i = 0; i < 40 && !document.querySelector('.my-report-status'); i++) await wait(100);
    out.cards = [...document.querySelectorAll('.my-report')].map(c => [c.querySelector('strong').textContent, c.querySelector('.my-report-status')?.textContent ?? '', !!c.querySelector('.my-report-reply')]);
    out.focusInside = !!document.activeElement.closest('.my-reports-dialog');
    await wait(100);
    out.dotAfterOpen = !$('.mais-dot').hidden;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(50);
    out.closed = !$('.my-reports-dialog');
    // Uma resposta editada volta a ser novidade.
    window.fixture.set([{ code: 'R-7K2Q', kind: 'erro', summary: 'A Shorikai não desvirou.', receivedAt: '2026-11-10T15:00:00Z', status: 'resolvido', reply: 'Texto novo.', repliedAt: '2026-11-13T20:00:00Z' }]);
    await window.fixture.check(); await wait(50);
    out.noticeEdited = $('.my-reports-notice strong')?.textContent;
    $('.my-reports-notice .pwa-primary').click(); await wait(50);
    out.openedFromNotice = !!$('.my-reports-dialog');
    for (let i = 0; i < 40 && !document.querySelector('.my-report-status'); i++) await wait(100);
    // Sem conexão: a lista do aparelho, sem estados, com a frase.
    document.querySelector('.my-reports-dialog [data-fb="close"]').click();
    window.fixture.offline(true); window.fixture.open();
    for (let i = 0; i < 40 && !document.querySelector('.my-reports-note.offline'); i++) await wait(100);
    out.offline = document.querySelector('.my-reports-note.offline')?.textContent;
    out.offlineCards = document.querySelectorAll('.my-report').length;
    out.offlineStatus = document.querySelectorAll('.my-report-status').length;
    return out;
  `);
  assert.equal(r.notice, 'Seu relato R-7K2Q tem resposta');
  assert.ok(r.dot && r.itemDot, 'the dot is missing on the ⋯ button or on the item');
  assert.equal(r.item, 'Meus relatos');
  assert.equal(r.noticeAgain, false, 'the same news was announced twice');
  assert.ok(r.dotAfterNotice, 'dismissing the notice cleared the dot');
  assert.deepEqual(r.cards, [['R-7K2Q', 'Resolvido', true], ['R-M4XD', 'Em análise', false], ['R-P9HB', 'Recebido', false]]);
  assert.ok(r.focusInside, 'focus did not move into the dialog');
  assert.equal(r.dotAfterOpen, false, 'opening Meus relatos should clear the dot');
  assert.ok(r.closed, 'Esc did not close the dialog');
  assert.equal(r.noticeEdited, 'Seu relato R-7K2Q tem resposta');
  assert.ok(r.openedFromNotice, '"Ver" did not open Meus relatos');
  assert.equal(r.offline, 'Não consegui falar com o servidor agora.');
  assert.equal(r.offlineCards, 1); assert.equal(r.offlineStatus, 0);
  console.log('My reports passed: notice once, dot until opened, status and reply on the cards, offline list.');
} finally { run('close'); }
