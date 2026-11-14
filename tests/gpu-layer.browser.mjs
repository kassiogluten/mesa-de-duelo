import assert from 'node:assert/strict';
import { browserSession, TABLE_URL } from './browser-helper.mjs';
// Camada GPU dos efeitos (item 125): carrega com a mesa ociosa, não desenha nada parada, desenha os efeitos no lugar das
// peças de CSS, e volta ao CSS sem erro ao perder o contexto, com ?gpu=0 e com a opção "Efeitos: leves".
const { run, evaluate } = browserSession('gpu-layer-check');
const lab = query => `${TABLE_URL}/tests/fixtures/effects-lab.html?mesa${query}`;
// Joga um terreno da mão e conta as ondas de pouso em CSS que aparecerem.
const LAND = `
  const wait = ms => new Promise(res => setTimeout(res, ms));
  const landRipples = async () => {
    let ripples = 0;
    const seen = new MutationObserver(list => { for (const m of list) for (const n of m.addedNodes) if (n.classList?.contains('land-ripple')) ripples++; });
    seen.observe(document.body, { childList: true, subtree: true });
    window.postMessage({ cmd: 'hand', kind: 'land' }, '*');
    await wait(1600); seen.disconnect();
    return ripples;
  };`;
try {
  run('open', 'about:blank');
  run('set', 'viewport', '1366', '768');
  run('open', lab('&gpu=1'));
  const r = evaluate(`${LAND}
    const out = { errors: [] };
    addEventListener('error', e => out.errors.push(String(e.message)));
    for (let i = 0; i < 80 && !gpu.ready(); i++) await wait(100);
    out.ready = gpu.ready();
    const canvas = document.querySelector('canvas.gpu-layer');
    out.canvas = !!canvas && canvas.getAttribute('aria-hidden') === 'true' && getComputedStyle(canvas).pointerEvents === 'none';
    out.inArena = !!canvas?.closest('.arena');
    const idle0 = gpu.stats().frames; await wait(1000);
    out.idleFrames = gpu.stats().frames - idle0;
    out.cssRipplesWithGpu = await landRipples();
    const afterLand = gpu.stats();
    out.drewLand = afterLand.frames > idle0;
    out.liveAfter = afterLand.live;
    await wait(300);
    const settled = gpu.stats().frames; await wait(800);
    out.stoppedAgain = gpu.stats().frames === settled;
    // Perder o contexto: o canvas some e o pouso seguinte sai em CSS.
    canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext();
    await wait(300);
    out.canvasAfterLoss = !!document.querySelector('canvas.gpu-layer');
    out.readyAfterLoss = gpu.ready();
    out.cssRipplesAfterLoss = await landRipples();
    return out;
  `);
  assert.ok(r.ready, 'the GPU layer did not load with the table idle');
  assert.ok(r.canvas, 'canvas missing, clickable or visible to screen readers');
  assert.ok(r.inArena, 'canvas outside the table');
  assert.equal(r.idleFrames, 0, 'the idle table drew GPU frames');
  assert.equal(r.cssRipplesWithGpu, 0, 'the landing ripple was drawn in CSS with the GPU layer ready');
  assert.ok(r.drewLand, 'the GPU layer drew nothing for the landing');
  assert.equal(r.liveAfter, 0, 'effects still alive after they should have ended');
  assert.ok(r.stoppedAgain, 'the GPU loop kept running after the last effect');
  assert.equal(r.canvasAfterLoss, false, 'canvas stayed after the WebGL context was lost');
  assert.equal(r.readyAfterLoss, false);
  assert.ok(r.cssRipplesAfterLoss >= 1, 'no CSS fallback after the context was lost');
  assert.deepEqual(r.errors, []);

  // Voo da carta na GPU (fase 3): com a textura da mão carregada, a carta conjurada voa no canvas, e a peça em CSS
  // faz o mesmo caminho invisível, só com a legenda à vista.
  run('open', lab('&gpu=1'));
  const flight = evaluate(`
    const wait = ms => new Promise(res => setTimeout(res, ms));
    for (let i = 0; i < 80 && !gpu.ready(); i++) await wait(100);
    // As texturas da mão carregam com a mesa ociosa (as imagens vêm do Scryfall).
    await wait(9000);
    window.postMessage({ cmd: 'hand', kind: 'creature' }, '*');
    await wait(250);
    const piece = document.querySelector('.presentation-piece.gpu-flying');
    const out = { flying: !!piece, live: gpu.stats().live };
    out.faceHidden = !!piece && getComputedStyle(piece.querySelector('.face')).visibility === 'hidden';
    out.caption = !!piece && getComputedStyle(piece.querySelector('.presentation-caption')).visibility === 'visible';
    return out;
  `);
  assert.ok(flight.flying, 'the cast card did not fly on the GPU');
  assert.ok(flight.live >= 1, 'no GPU effect alive during the flight');
  assert.ok(flight.faceHidden, 'the CSS card is still visible under the GPU flight');
  assert.ok(flight.caption, 'the caption disappeared with the GPU flight');

  // Compra de costas e mana: a carta comprada voa de costas no canvas (o verso pintado na cor da capa), sem esperar a
  // imagem dela, e pagar com terrenos solta os orbes de mana na GPU, sem a bolinha de CSS.
  run('open', lab('&gpu=1'));
  const back = evaluate(`
    const wait = ms => new Promise(res => setTimeout(res, ms));
    for (let i = 0; i < 80 && !gpu.ready(); i++) await wait(100);
    let orbs = 0;
    const seen = new MutationObserver(list => { for (const m of list) for (const n of m.addedNodes) if (n.classList?.contains('mana-orb')) orbs++; });
    seen.observe(document.body, { childList: true, subtree: true });
    window.postMessage({ cmd: 'hand', kind: 'draw' }, '*'); await wait(2500);
    window.postMessage({ cmd: 'hand', kind: 'draw' }, '*'); await wait(200);
    const piece = document.querySelector('.presentation-piece.draw-ghost.gpu-flying');
    const out = { flying: !!piece, backHidden: !!piece && getComputedStyle(piece.querySelector('.back')).visibility === 'hidden', live: gpu.stats().live };
    await wait(2500);
    const before = gpu.stats().frames;
    window.postMessage({ cmd: 'extra', kind: 'pay', side: 'me' }, '*');
    await wait(1600); seen.disconnect();
    out.cssOrbs = orbs; out.drewMana = gpu.stats().frames > before;
    // A moeda gira no canvas; a peça em CSS fica só com a legenda.
    window.postMessage({ cmd: 'extra', kind: 'coin', side: 'me' }, '*'); await wait(300);
    const coin = document.querySelector('.chance-piece.gpu-drawn');
    out.coinOnGpu = !!coin && getComputedStyle(coin.querySelector('b')).visibility === 'hidden' && getComputedStyle(coin.querySelector('.presentation-caption')).visibility === 'visible';
    // Gerar mana sem pagar: a mana voa até a reserva no retrato (na GPU, sem a bolinha de CSS), que pulsa na chegada.
    await wait(1500);
    // O "Pagar" de antes deixou os terrenos virados: a primeira vez põe dois terrenos novos.
    window.postMessage({ cmd: 'extra', kind: 'float', side: 'me' }, '*'); await wait(1500);
    orbs = 0; seen.observe(document.body, { childList: true, subtree: true });
    const beforePool = gpu.stats().frames;
    window.postMessage({ cmd: 'extra', kind: 'float', side: 'me' }, '*');
    let pulsed = false;
    for (let i = 0; i < 25 && !pulsed; i++) { await wait(80); pulsed = !!document.querySelector('#fMeAvatar .pool')?.getAnimations().length; }
    seen.disconnect();
    out.poolOrbs = orbs; out.drewPool = gpu.stats().frames > beforePool; out.poolPulsed = pulsed;
    return out;
  `);
  assert.ok(back.flying, 'the drawn card did not fly face down on the GPU');
  assert.ok(back.backHidden, 'the CSS card back is still visible under the GPU flight');
  assert.ok(back.live >= 1, 'no GPU effect alive during the draw');
  assert.equal(back.cssOrbs, 0, 'the mana orb was drawn in CSS with the GPU layer ready');
  assert.ok(back.drewMana, 'the GPU layer drew nothing for the mana');
  assert.ok(back.coinOnGpu, 'the coin was not drawn on the GPU (or the caption was hidden with it)');
  assert.equal(back.poolOrbs, 0, 'the mana going to the pool was drawn in CSS with the GPU layer ready');
  assert.ok(back.drewPool, 'the GPU layer drew nothing for the mana going to the pool');
  assert.ok(back.poolPulsed, 'the mana pool did not pulse when the mana arrived');

  run('open', lab('&gpu=0'));
  const off = evaluate(`${LAND}
    await wait(2500);
    return { canvas: !!document.querySelector('canvas.gpu-layer'), ripples: await landRipples() };
  `);
  assert.equal(off.canvas, false, '?gpu=0 created the GPU layer');
  assert.ok(off.ripples >= 1, '?gpu=0 lost the CSS effects');

  // A opção "Efeitos": leves desfaz a camada e grava a escolha; completos traz de volta.
  run('open', lab(''));
  const option = evaluate(`
    const wait = ms => new Promise(res => setTimeout(res, ms));
    localStorage.removeItem('mesa:effects');
    for (let i = 0; i < 80 && !gpu.ready(); i++) await wait(100);
    const out = { readyByDefault: gpu.ready() };
    const select = document.querySelector('#fEffects');
    out.options = [...select.options].map(o => o.textContent);
    select.value = 'light'; select.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(100);
    out.saved = localStorage.getItem('mesa:effects');
    out.canvasLight = !!document.querySelector('canvas.gpu-layer');
    out.summary = document.querySelector('#fLookSummary').textContent;
    select.value = 'full'; select.dispatchEvent(new Event('change', { bubbles: true }));
    for (let i = 0; i < 80 && !gpu.ready(); i++) await wait(100);
    out.backToFull = gpu.ready() && !!document.querySelector('canvas.gpu-layer');
    // Sair da mesa (a tela escondida) desfaz o canvas.
    document.querySelector('#table').hidden = true; await wait(50);
    out.canvasHidden = !!document.querySelector('canvas.gpu-layer');
    localStorage.removeItem('mesa:effects');
    return out;
  `);
  assert.ok(option.readyByDefault, 'effects do not start in "completos"');
  assert.deepEqual(option.options, ['Completos', 'Leves']);
  assert.equal(option.saved, 'light');
  assert.equal(option.canvasLight, false, '"leves" kept the GPU layer');
  assert.match(option.summary, /Efeitos leves/);
  assert.ok(option.backToFull, '"completos" did not bring the GPU layer back');
  assert.equal(option.canvasHidden, false, 'leaving the table kept the WebGL context');
  console.log('GPU layer passed: idle load, no idle frames, effects on the GPU, CSS after context loss, ?gpu=0 and the Effects option.');
} finally { run('close'); }
