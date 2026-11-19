import assert from 'node:assert/strict';
import { browserSession, TABLE_URL } from './browser-helper.mjs';
// Endereço de cada tela (src/app/router.ts): o voltar volta de tela e fecha o painel aberto, recarregar fica na tela, a
// mesa livre com cartas no campo pergunta antes de sair, e /partida sem partida cai no início. A pergunta da partida
// precisa do servidor; o roteador dela é conferido em tests/router.test.mjs.
const { run, evaluate } = browserSession('app-routes-check');
const wait = `const wait = ms => new Promise(res => setTimeout(res, ms)), $ = s => document.querySelector(s);
  const until = async (fn, ms = 4000) => { for (let i = 0; i < ms / 50 && !fn(); i++) await wait(50); return fn(); };
  const visible = () => ['#scrLobby', '#scrDecks', '#scrFree', '#scrLab', '#scrGame'].find(s => $(s) && !$(s).hidden);`;
const open = path => { run('open', `${TABLE_URL}${path}`); return evaluate(`${wait} await until(() => $('#scrLobby')); await wait(300); return { path: location.pathname, screen: visible() };`); };
try {
  run('set', 'viewport', '1366', '768');
  // Sem o tour da primeira visita e sem mesa livre guardada.
  open('/');
  evaluate(`localStorage.clear(); localStorage.setItem('mesa:played', '1'); localStorage.setItem('mesa:tour', '1'); return true;`);

  run('reload');
  const r = evaluate(`${wait}
    await until(() => $('[data-app-nav="decks"]'));
    const out = {};
    // Meus decks pelo cabeçalho, e o voltar volta ao início.
    $('#scrLobby [data-app-nav="decks"]').click(); await wait(100);
    out.decks = [location.pathname, visible()];
    history.back(); await until(() => location.pathname === '/'); await wait(100);
    out.backToStart = [location.pathname, visible()];
    // Novidades aberto: o voltar fecha o painel e fica no início.
    $('#scrLobby .news > .news-btn').click(); await wait(100);
    out.newsOpen = !$('#scrLobby .news-panel').hidden;
    history.back(); await wait(200);
    out.newsAfterBack = [!$('#scrLobby .news-panel').hidden, location.pathname, visible()];
    // Um deck aberto no editor tem o endereço dele.
    $('#scrLobby [data-app-nav="decks"]').click(); await wait(100);
    await until(() => $('#scrDecks [data-select]'));
    const id = $('#scrDecks [data-select]').dataset.select;
    $('#scrDecks [data-select]').click(); await wait(100);
    out.editor = [location.pathname, '/decks/' + encodeURIComponent(id)];
    return out;
  `);
  assert.deepEqual(r.decks, ['/decks', '#scrDecks']);
  assert.deepEqual(r.backToStart, ['/', '#scrLobby'], 'back from Meus decks should return to the start screen');
  assert.ok(r.newsOpen, 'Novidades did not open');
  assert.deepEqual(r.newsAfterBack, [false, '/', '#scrLobby'], 'back should close Novidades and stay on the start screen');
  assert.equal(r.editor[0], r.editor[1]);

  // Recarregar no editor volta ao mesmo deck; o voltar vai para a lista.
  run('reload');
  const reloaded = evaluate(`${wait}
    await until(() => $('#scrDecks') && !$('#scrDecks').hidden && $('#scrDecks .dw-editor'));
    const out = { after: [location.pathname, visible(), !!$('#scrDecks .dw-editor')] };
    history.back(); await until(() => location.pathname === '/decks'); await wait(100);
    out.list = [location.pathname, visible(), !!$('#scrDecks .dw-library')];
    history.back(); await until(() => location.pathname === '/'); await wait(100);
    out.start = [location.pathname, visible()];
    return out;
  `);
  assert.deepEqual(reloaded.after.slice(1), ['#scrDecks', true], 'reloading in the editor should keep the deck open');
  assert.equal(reloaded.after[0], r.editor[0]);
  assert.deepEqual(reloaded.list, ['/decks', '#scrDecks', true]);
  assert.deepEqual(reloaded.start, ['/', '#scrLobby']);

  // Cada endereço aberto direto: a tela dele, com o início atrás.
  assert.deepEqual(open('/laboratorio'), { path: '/laboratorio', screen: '#scrLab' });
  assert.deepEqual(evaluate(`${wait} history.back(); await until(() => location.pathname === '/'); await wait(100); return [location.pathname, visible()];`), ['/', '#scrLobby'], 'a link straight to the Laboratório should have the start behind it');
  assert.deepEqual(open('/decks'), { path: '/decks', screen: '#scrDecks' });
  assert.deepEqual(open('/decks/importar'), { path: '/decks/importar', screen: '#scrDecks' });
  assert.deepEqual(open('/partida'), { path: '/', screen: '#scrLobby' }, '/partida without a match to return to falls back to the start');
  assert.deepEqual(open('/mesa-livre'), { path: '/', screen: '#scrLobby' }, '/mesa-livre without a saved game falls back to the start');
  const missing = open('/decks/nao-existe');
  assert.deepEqual(missing, { path: '/decks', screen: '#scrDecks' });

  // Mesa livre guardada com uma carta no campo: abre em /mesa-livre, e o voltar pergunta antes de descartar o jogo.
  const free = evaluate(`${wait}
    const { newSandbox } = await import('/src/free/sandbox.ts');
    const s = newSandbox({ id: 't', name: 'Teste', cards: [{ name: 'Forest', count: 20 }], sideboard: [] }, 'free');
    s.zones.battlefield.push(s.zones.hand.shift());
    localStorage.setItem('mesa:livre', JSON.stringify(s));
    return true;`) && open('/mesa-livre');
  assert.deepEqual(free, { path: '/mesa-livre', screen: '#scrFree' });
  const asked = evaluate(`${wait}
    const out = {}; let asked = 0;
    window.confirm = () => { asked++; return false; };
    history.back(); await wait(400);
    out.stay = [asked, location.pathname, visible()];
    window.confirm = () => { asked++; return true; };
    history.back(); await until(() => location.pathname === '/'); await wait(200);
    out.leave = [asked, location.pathname, visible(), localStorage.getItem('mesa:livre')];
    return out;`);
  assert.deepEqual(asked.stay, [1, '/mesa-livre', '#scrFree'], 'back with cards on the battlefield should ask and stay');
  assert.deepEqual(asked.leave, [2, '/', '#scrLobby', null], 'confirming should leave and discard the game');

  // Sem nada no campo, o voltar sai sem perguntar.
  evaluate(`${wait}
    const { newSandbox } = await import('/src/free/sandbox.ts');
    localStorage.setItem('mesa:livre', JSON.stringify(newSandbox({ id: 't', name: 'Teste', cards: [{ name: 'Forest', count: 20 }], sideboard: [] }, 'free')));
    return true;`);
  assert.deepEqual(open('/mesa-livre'), { path: '/mesa-livre', screen: '#scrFree' });
  const quiet = evaluate(`${wait}
    let asked = 0; window.confirm = () => { asked++; return true; };
    history.back(); await until(() => location.pathname === '/'); await wait(200);
    return [asked, location.pathname, visible(), localStorage.getItem('mesa:livre')];`);
  assert.deepEqual(quiet, [0, '/', '#scrLobby', null]);

  console.log('App routes passed: back returns to the previous screen and closes panels, reload keeps the screen, the free table asks.');
} finally {
  try { run('close'); } catch { /* já fechado */ }
}
