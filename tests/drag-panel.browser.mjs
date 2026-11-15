import assert from 'node:assert/strict';
import { browserSession, TABLE_URL } from './browser-helper.mjs';

const { run, evaluate } = browserSession('drag-panel-check');
const rect = selector => evaluate(`const r=document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();return r?{left:r.left,top:r.top,right:r.right,bottom:r.bottom,x:r.x+r.width/2,y:r.y+r.height/2}:null;`);
const stored = key => evaluate(`return localStorage.getItem(${JSON.stringify(key)});`);
const inside = (r, w, h) => r.left >= 3 && r.top >= 3 && r.right <= w - 3 && r.bottom <= h - 3;
/** Arrasta pela alça com o mouse de verdade (captura do ponteiro incluída), em passos. */
function drag(handle, dx, dy) {
  const h = rect(handle);
  assert.ok(h, `no handle ${handle}`);
  run('mouse', 'move', String(Math.round(h.x)), String(Math.round(h.y)));
  run('mouse', 'down');
  for (const t of [.25, .5, .75, 1]) run('mouse', 'move', String(Math.round(h.x + dx * t)), String(Math.round(h.y + dy * t)));
  run('mouse', 'up');
}
const choosable = '.bfc.actionable, .att.actionable, .avatar.selectable-player';
const covered = () => evaluate(`const a=document.querySelector('#fAction').getBoundingClientRect();return [...document.querySelectorAll(${JSON.stringify(choosable)})].some(c=>{const r=c.getBoundingClientRect();return r.width&&a.left<r.right&&a.right>r.left&&a.top<r.bottom&&a.bottom>r.top;});`);

try {
  run('open', `${TABLE_URL}/tests/fixtures/duel-table.html`);
  for (const [width, height] of [[1280, 800], [844, 390]]) {
    run('set', 'viewport', String(width), String(height));
    evaluate(`for(const k of ['mesa:action-panel','mesa:center-panel','mesa:question-bar'])localStorage.removeItem(k);delete window.fixture.state.question;window.fixture.targetSource('ability');return true;`);
    evaluate('window.fixture.render();return true;');
    assert.ok(rect('#fAction > .drag-handle'), 'the action box has a handle while it asks for a target');
    // No lugar de sempre, a caixa sai de cima das cartas que podem ser escolhidas, quando há espaço.
    if (width === 1280) assert.equal(covered(), false, 'the action box opened on top of a choosable card');

    const before = rect('#fAction');
    // Para a borda esquerda: no celular as cartas ficam numa coluna no meio, e a caixa não pode cair em cima de todas.
    drag('#fAction > .drag-handle', 10 - before.left, -60);
    const after = rect('#fAction');
    assert.ok(Math.abs(after.left - before.left) > 100, 'the box moved with the handle');
    assert.ok(inside(after, width, height), 'the dragged box stays on screen');
    assert.ok(JSON.parse(stored('mesa:action-panel')), 'the place is kept on this device');
    assert.equal(evaluate(`return document.querySelector('#fAction').classList.contains('drag-moving');`), false, 'not translucent after letting go');

    // Continua respondendo: uma carta de alvo fora da caixa (a que estava embaixo dela no lugar de sempre, se houver).
    const free = evaluate(`const a=document.querySelector('#fAction').getBoundingClientRect();return window.fixture.state.input.selectable.map(id=>[id,document.querySelector('[data-fid="'+id+'"]')?.getBoundingClientRect()]).filter(([,r])=>r).filter(([,r])=>r.width&&!(a.left<r.right&&a.right>r.left&&a.top<r.bottom&&a.bottom>r.top)).map(([id])=>id);`);
    assert.ok(free.length, 'some target is left uncovered');
    const sent = evaluate('return window.fixture.messages.length;');
    run('click', `[data-fid="${free[0]}"]`);
    assert.deepEqual(evaluate('return window.fixture.messages.at(-1);'), { type: 'card', id: Number(free[0]), gen: 10 }, `no answer after ${sent} messages`);
    evaluate('window.fixture.targetSource("ability");return true;');

    // Arrastado para fora da tela: para na borda.
    drag('#fAction > .drag-handle', width * 2, height * 2);
    assert.ok(inside(rect('#fAction'), width, height), 'the box cannot leave the screen');
    // Janela menor (girar o celular): volta para dentro sem perder o lugar guardado.
    run('set', 'viewport', String(Math.round(width * .7)), String(Math.round(height * .8)));
    evaluate('window.dispatchEvent(new Event("resize"));return true;');
    assert.ok(inside(rect('#fAction'), Math.round(width * .7), Math.round(height * .8)), 'the box comes back inside after a resize');
    run('set', 'viewport', String(width), String(height));
    evaluate('window.dispatchEvent(new Event("resize"));return true;');

    // Dois cliques: volta ao lugar de sempre e esquece o lugar guardado.
    run('dblclick', '#fAction > .drag-handle');
    assert.equal(stored('mesa:action-panel'), null);

    // A barra de "Ver a mesa" também se arrasta, e guarda o lugar dela.
    evaluate('window.fixture.triggers();return true;');
    run('click', '[data-ui="question-minimize"]');
    const bar = rect('.question-bar');
    drag('.question-bar-text', 0, -120);
    const moved = rect('.question-bar');
    assert.ok(moved.top < bar.top - 60, 'the collapsed choice bar moved up');
    assert.ok(JSON.parse(stored('mesa:question-bar')), 'the bar keeps its own place');
    run('click', '[data-ui="question-restore"]');
    assert.ok(rect('.question'), 'the choice comes back from the moved bar');
  }
  console.log('drag panel ok');
} finally {
  run('close');
}
