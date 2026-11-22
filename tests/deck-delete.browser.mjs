import assert from 'node:assert/strict';
import { browserSession, TABLE_URL } from './browser-helper.mjs';
// Excluir em Meus decks pergunta antes (src/ui/deckDelete.ts): Voltar (em foco) não apaga nada; Excluir deck apaga e
// deixa o Desfazer, que devolve o deck.
const { run, evaluate } = browserSession('deck-delete-check');
try {
  run('set', 'viewport', '1366', '768');
  run('open', `${TABLE_URL}/decks`);
  evaluate(`localStorage.clear(); localStorage.setItem('mesa:played', '1'); localStorage.setItem('mesa:tour', '1'); return true;`);
  run('reload');
  const r = evaluate(`const wait = ms => new Promise(res => setTimeout(res, ms)), $ = s => document.querySelector(s);
    const until = async (fn, ms = 6000) => { for (let i = 0; i < ms / 50 && !fn(); i++) await wait(50); return fn(); };
    const out = {};
    await until(() => $('#scrDecks [data-copy]'));
    $('#scrDecks [data-copy]').click();
    await until(() => $('#scrDecks [data-b="del"]'));
    const path = location.pathname, id = decodeURIComponent(path.split('/').pop());
    const saved = () => (localStorage.getItem('mesa:decks:v2') ?? '').includes(id);
    const askDelete = async () => { $('#scrDecks [data-b="deck-actions"]').click(); await wait(100); $('#scrDecks [data-b="del"]').click(); await until(() => $('.dw-delete[open]')); };
    // Voltar: o diálogo fecha e o deck continua.
    await askDelete();
    out.title = $('.dw-delete h2').textContent;
    out.focus = document.activeElement?.textContent;
    $('.dw-delete .dp-foot [data-dd="back"]').click(); await wait(150);
    out.afterBack = [!!$('.dw-delete'), location.pathname === path, saved()];
    // Excluir deck: volta à lista, o deck sai e o Desfazer o devolve.
    await askDelete();
    $('.dw-delete [data-dd="delete"]').click(); await wait(300);
    out.afterDelete = [!!$('.dw-delete'), location.pathname, !saved(), !!$('#scrDecks [data-b="undo"]')];
    $('#scrDecks [data-b="undo"]').click(); await wait(200);
    out.afterUndo = saved();
    return out;
  `);
  assert.equal(r.title, 'Excluir este deck?');
  assert.equal(r.focus, 'Voltar', 'Voltar should start focused');
  assert.deepEqual(r.afterBack, [false, true, true], 'Voltar should close the dialog and keep the deck');
  assert.deepEqual(r.afterDelete, [false, '/decks', true, true], 'Excluir deck should remove the deck and offer Desfazer');
  assert.equal(r.afterUndo, true, 'Desfazer should bring the deck back');
  console.log('deck-delete: ok');
} finally {
  try { run('close'); } catch { /* o navegador já fechou */ }
}
