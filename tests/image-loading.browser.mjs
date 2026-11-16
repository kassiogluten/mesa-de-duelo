import assert from 'node:assert/strict';
import { browserSession, TABLE_URL } from './browser-helper.mjs';
// Carregando nas imagens das cartas (ROADMAP item 133), com a imagem atrasada pela rota ?lento do Vite: primeiro o
// esboço da carta, depois a small se a imagem demora e por fim a imagem. As imagens atrasadas ocupam as 6 conexões do
// navegador com o servidor: a cena com a small vem por último, para não segurar as outras.
const { run, evaluate } = browserSession('image-loading-check');
const counts = `const q=s=>document.querySelectorAll(s).length;return {wait:q('img.img-wait'),slow:q('img.img-slow'),small:q('img.img-small'),imgs:q('#cena img'),painted:[...document.querySelectorAll('#cena img.img-wait:not(.img-small)')].filter(i=>getComputedStyle(i).backgroundImage!=='none').length};`;
const waitFor = expr => assert.ok(evaluate(`for(let i=0;i<200;i++){if(${expr})return true;await new Promise(r=>setTimeout(r,100));}return false;`), `esperando ${expr}`);
const loading = '!document.querySelector(".img-wait")';
try {
  // O open espera a página carregar, imagens inclusive: a cena atrasada se monta depois.
  run('open', `${TABLE_URL}/tests/fixtures/image-loading.html?lento=0`);
  let s = evaluate(`fixture.load({ms:1500,smallMs:30000});await null;${counts}`);
  assert.equal(s.wait, s.imgs, `toda imagem atrasada fica esperando: ${JSON.stringify(s)}`);
  assert.equal(s.slow, 0, 'nos primeiros instantes nada muda (a imagem do aparelho chega antes)');
  assert.equal(s.painted, 0, 'até a small, o esboço da carta por baixo fica à vista');
  s = evaluate(`await new Promise(r=>setTimeout(r,400));${counts}`);
  assert.equal(s.slow, s.imgs, `passado o começo, a imagem está demorando: ${JSON.stringify(s)}`);
  // A imagem chega e entra.
  waitFor(loading);
  assert.ok(evaluate('return [...document.querySelectorAll("#cena img")].every(i=>i.complete&&i.naturalWidth>0);'), 'as imagens chegaram');
  // Já carregada nesta página: recriada, não espera de novo.
  s = evaluate(`const row=document.querySelector("#mao .il-row");row.innerHTML=row.innerHTML;await null;${counts}`);
  assert.equal(s.wait, 0, 'a imagem pronta aparece direto');
  // Falhou no cache e no Scryfall: não fica esperando para sempre, e o esboço fica no lugar.
  evaluate('fixture.load({ms:200,fail:true});return true;');
  waitFor(loading);
  assert.equal(evaluate('return document.querySelectorAll("#mao .face > img").length;'), 0, 'a imagem que falhou sai e fica o esboço');
  // A imagem demora e a small chega antes: ela fica no lugar (a arte recortada não tem small).
  evaluate('await fixture.load({ms:8000,smallFirst:true});return true;');
  waitFor('document.querySelectorAll("#mao img.img-small").length===4');
  assert.equal(evaluate('return document.querySelectorAll("#arte img.img-small").length;'), 0, 'a arte recortada não tem small');
  console.log('Image loading passed: card sketch first, the small when the image is slow, then the image; ready and failed images do not keep waiting.');
} finally { run('close'); }
