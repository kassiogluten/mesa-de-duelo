import assert from 'node:assert/strict';
import { browserSession, TABLE_URL } from './browser-helper.mjs';
// Encaixe do texto nas cartas "Arte e texto" (cardTextFit.ts): o nome, o tipo e as regras diminuem até caber, e o texto
// contorna o selo de P/R. Na página de teste há cartas de texto curto e longo, em todas as cores.
const { run, evaluate } = browserSession('card-text-fit-check');
const measure = `await new Promise(r=>setTimeout(r,400));return [...document.querySelectorAll('.tf-card')].map(card=>{
  const f=card.querySelector('.art-face'),q=s=>f.querySelector(s),text=q('.af-text'),name=q('.af-name'),stat=q('.af-stat');
  const lines=text?[...text.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()).map(n=>{const r=document.createRange();r.selectNodeContents(n);return [...r.getClientRects()];}).flat():[];
  const s=stat?.getBoundingClientRect();
  return {i:+card.dataset.i,ts:+(text?.style.getPropertyValue('--af-ts')||1),ns:+(name.style.getPropertyValue('--af-ns')||1),
    over:!!text?.classList.contains('af-over'),fits:text?text.scrollHeight<=text.clientHeight+1:true,
    underStat:!!s&&lines.some(l=>l.right>s.left+1&&l.bottom>s.top+1&&l.top<s.bottom-1),
    bar:getComputedStyle(q('.af-head')).backgroundColor};
})`;
try {
  run('open', `${TABLE_URL}/tests/fixtures/card-text-fit.html?largura=200`);
  const cards = evaluate(measure);
  const by = i => cards.find(c => c.i === i);
  // Texto curto fica do tamanho de sempre.
  assert.equal(by(2).ts, 1, `"Anular" não encolhe: ${JSON.stringify(by(2))}`);
  assert.equal(by(2).ns, 1);
  // Texto longo encolhe e cabe inteiro, sem o esmaecido.
  for (const i of [0, 1, 3, 4]) {
    const c = by(i);
    assert.ok(c.ts < 1 && c.fits && !c.over, `carta ${i} encolhe até caber: ${JSON.stringify(c)}`);
  }
  // Nome longo encolhe antes de cortar.
  assert.ok(by(0).ns < 1, `nome longo encolhe: ${JSON.stringify(by(0))}`);
  // Nenhuma linha passa por baixo do selo de P/R ou lealdade.
  for (const c of cards) assert.ok(!c.underStat, `carta ${c.i}: texto atrás do selo`);
  // Cada cor tem o seu tom (azul, vermelho, verde e branco diferentes entre si).
  const bars = new Set([0, 1, 2, 6].map(i => by(i).bar));
  assert.equal(bars.size, 4, `barras no tom de cada cor: ${[...bars].join(' | ')}`);
  // Mais estreita: encolhe mais; e o texto que nem no mínimo cabe ganha o esmaecido.
  const narrow = evaluate(`fixture.load({width:120});${measure}`);
  assert.ok(narrow.find(c => c.i === 1).ts <= by(1).ts, 'na carta menor a letra fica menor ou igual');
  assert.ok(narrow.every(c => c.fits || c.over), `o que não cabe esmaece: ${JSON.stringify(narrow.filter(c => !c.fits))}`);
  console.log('ok: encaixe do texto nas cartas de Arte e texto');
} finally {
  run('close');
}
