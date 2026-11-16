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
    // Mesa viva: no fundo da mesa, sem clique, a uns 30 quadros por segundo, enquanto a camada dos efeitos fica parada.
    const backdrop = document.querySelector('canvas.table-ambience');
    out.ambienceInMat = !!backdrop?.parentElement?.classList.contains('mat') && getComputedStyle(backdrop).pointerEvents === 'none';
    const ambience0 = gpu.ambienceStats()?.frames ?? 0;
    const idle0 = gpu.stats().frames; await wait(1000);
    out.ambienceFrames = (gpu.ambienceStats()?.frames ?? 0) - ambience0;
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
  assert.ok(r.ambienceInMat, 'the living table is missing from the table background, or takes clicks');
  assert.ok(r.ambienceFrames >= 12 && r.ambienceFrames <= 40, `the living table drew ${r.ambienceFrames} frames in 1 s (about 30 expected)`);
  assert.equal(r.cssRipplesWithGpu, 0, 'the landing ripple was drawn in CSS with the GPU layer ready');
  assert.ok(r.drewLand, 'the GPU layer drew nothing for the landing');
  assert.equal(r.liveAfter, 0, 'effects still alive after they should have ended');
  assert.ok(r.stoppedAgain, 'the GPU loop kept running after the last effect');
  assert.equal(r.canvasAfterLoss, false, 'canvas stayed after the WebGL context was lost');
  assert.equal(r.readyAfterLoss, false);
  assert.ok(r.cssRipplesAfterLoss >= 1, 'no CSS fallback after the context was lost');
  assert.deepEqual(r.errors, []);

  // O grimório na GPU (item 131): embaralhar, vidência e moer não montam as peças de CSS, e a camada desenha; a seta de
  // alvo nova nasce na camada; a lendária escurece a mesa em volta e aproxima a câmera.
  run('open', lab('&gpu=1'));
  const piles = evaluate(`
    const wait = ms => new Promise(res => setTimeout(res, ms));
    for (let i = 0; i < 80 && !gpu.ready(); i++) await wait(100);
    // A primeira leva de eventos da página é alcançada em silêncio.
    window.postMessage({ cmd: 'hand', kind: 'land' }, '*'); await wait(1500);
    let ghosts = 0;
    const seen = new MutationObserver(list => { for (const m of list) for (const n of m.addedNodes) if (n.classList?.contains('shuffle-ghost') || n.classList?.contains('scry-ghost') || n.classList?.contains('mill-ghost')) ghosts++; });
    seen.observe(document.body, { childList: true, subtree: true });
    const drew = async cmd => { const before = gpu.stats().frames; window.postMessage(cmd, '*'); await wait(1400); return gpu.stats().frames > before; };
    const out = {
      shuffle: await drew({ cmd: 'extra', kind: 'shuffle', side: 'me' }),
      scry: await drew({ cmd: 'extra', kind: 'scry', side: 'me' }),
      mill: await drew({ cmd: 'mill', side: 'me', n: 3 }),
    };
    seen.disconnect();
    out.ghosts = ghosts;
    // A seta do Bolt: nasce na camada no instante em que aparece.
    window.postMessage({ cmd: 'hand', kind: 'bolt' }, '*');
    let arrowLive = 0;
    for (let i = 0; i < 40 && !document.querySelector('#fTargets path.arrow'); i++) await wait(25);
    out.arrow = !!document.querySelector('#fTargets path.arrow');
    await wait(60); arrowLive = gpu.stats().live;
    out.arrowLive = arrowLive;
    await wait(2500);
    // A mágica de valor 6: a câmera chega um pouco mais perto (a lendária é só um toque, sem câmera).
    window.postMessage({ cmd: 'moment', kind: 'big' }, '*');
    let pushed = false;
    for (let i = 0; i < 40 && !pushed; i++) { await wait(100); pushed = document.querySelector('.arena').getAnimations().some(a => a.effect.getKeyframes().some(k => Number(k.scale) > 1)); }
    out.pushed = pushed;
    return out;
  `);
  assert.ok(piles.shuffle && piles.scry && piles.mill, `the library effects did not draw on the GPU: ${JSON.stringify(piles)}`);
  assert.equal(piles.ghosts, 0, 'shuffle, scry or mill still built CSS pieces with the GPU layer ready');
  assert.ok(piles.arrow, 'the Bolt target arrow did not appear');
  assert.ok(piles.arrowLive >= 1, 'the new target arrow was not born on the GPU');
  assert.ok(piles.pushed, 'the big spell did not push the camera in');

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
    await wait(1500);
    // O d100 também sai na camada (dois d10 em 3D), e o d2 (uma moeda de 1 e 2).
    for (const kind of ['d100', 'd2']) {
      window.postMessage({ cmd: 'extra', kind, side: 'me' }, '*'); await wait(300);
      out[kind] = !!document.querySelector('.chance-piece.die.gpu-drawn') && gpu.stats().live >= 1;
      await wait(1500);
    }
    // Dia e noite: a primeira vez só põe o sol na trilha; a segunda vira noite, e o disco vira na camada.
    window.postMessage({ cmd: 'day-night' }, '*'); await wait(300);
    for (let i = 0; i < 60 && gpu.stats().live; i++) await wait(100);
    window.postMessage({ cmd: 'day-night' }, '*'); await wait(300);
    out.dayNight = gpu.stats().live >= 1 && !!document.querySelector('.phase-daynight.night');
    // A coroa do Monarca chega de ninguém e depois passa para o oponente: as duas vezes, o medalhão sai na camada.
    // Cada vez, com a camada vazia antes (o efeito anterior já acabou), para contar só o medalhão.
    const idle = async () => { for (let i = 0; i < 60 && gpu.stats().live; i++) await wait(100); };
    out.holder = [];
    for (let i = 0; i < 2; i++) {
      await idle();
      window.postMessage({ cmd: 'holder', kind: 'monarch' }, '*'); await wait(300);
      out.holder.push(gpu.stats().live >= 1);
    }
    // Um emblema novo para o dono do Jace: o medalhão sai do planeswalker.
    await idle();
    window.postMessage({ cmd: 'walker', kind: 'enter', side: 'opp' }, '*'); await wait(2500);
    await idle();
    window.postMessage({ cmd: 'walker', kind: 'emblem', side: 'opp' }, '*'); await wait(300);
    out.emblem = gpu.stats().live >= 1;
    await idle();
    // Gerar mana sem pagar: a mana voa até a reserva no retrato (na GPU, sem a bolinha de CSS), que pulsa na chegada.
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
  assert.ok(back.d100, 'the d100 was not drawn on the GPU');
  assert.ok(back.d2, 'the d2 was not drawn on the GPU');
  assert.ok(back.dayNight, 'the day and night disc was not drawn on the GPU');
  assert.deepEqual(back.holder, [true, true], 'the Monarch medal did not fly on the GPU');
  assert.ok(back.emblem, 'the emblem medal did not fly on the GPU');
  // Vitória: os raios e o confete e, junto, o brasão em 3D; a tela do resultado espera o brasão assentar.
  const win = evaluate(`
    const wait = ms => new Promise(res => setTimeout(res, ms));
    for (let i = 0; i < 60 && gpu.stats().live; i++) await wait(100);
    window.postMessage({ cmd: 'extra', kind: 'win', side: 'me' }, '*'); await wait(500);
    const crest = gpu.stats().live >= 2;
    await wait(1100);
    return { crest, resultWaits: document.querySelector('#fOverlay').hidden };
  `);
  assert.ok(win.crest, 'the victory crest was not drawn on the GPU with the rays');
  assert.ok(win.resultWaits, 'the result screen did not wait for the victory crest');
  assert.equal(back.poolOrbs, 0, 'the mana going to the pool was drawn in CSS with the GPU layer ready');
  assert.ok(back.drewPool, 'the GPU layer drew nothing for the mana going to the pool');
  assert.ok(back.poolPulsed, 'the mana pool did not pulse when the mana arrived');

  run('open', lab('&gpu=0'));
  const off = evaluate(`${LAND}
    await wait(2500);
    return { canvas: !!document.querySelector('canvas.gpu-layer'), ambience: !!document.querySelector('canvas.table-ambience'), ripples: await landRipples() };
  `);
  assert.equal(off.canvas, false, '?gpu=0 created the GPU layer');
  assert.equal(off.ambience, false, '?gpu=0 created the living table');
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
    out.canvasLight = !!document.querySelector('canvas.gpu-layer, canvas.table-ambience');
    out.summary = document.querySelector('#fLookSummary').textContent;
    select.value = 'full'; select.dispatchEvent(new Event('change', { bubbles: true }));
    for (let i = 0; i < 80 && !gpu.ready(); i++) await wait(100);
    out.backToFull = gpu.ready() && !!document.querySelector('canvas.gpu-layer');
    // Os degraus do automático: o 2 para a mesa viva, o 3 troca para o CSS e o 0 traz a camada de volta.
    select.value = 'auto'; select.dispatchEvent(new Event('change', { bubbles: true }));
    for (let i = 0; i < 80 && !gpu.ready(); i++) await wait(100);
    for (let i = 0; i < 30 && !gpu.ambienceStats()?.running; i++) await wait(100);
    out.ambienceBefore = !!gpu.ambienceStats()?.running;
    // O degrau 1: a mesa escurecendo da mágica grande não sai (a do golpe letal e do ultimate sim), e as animações
    // contínuas das permanentes param (o vento do Vampire Nighthawk, que voa).
    const wind = () => getComputedStyle(document.querySelector('.fly-wind')).animationName;
    const at = { cx: 600, cy: 400, w: 90, h: 120 };
    const drawn = params => { const before = gpu.stats().live; const played = gpu.play('spotlight', { at, radius: 120, duration: 400, ...params }); return { played, drew: gpu.stats().live > before }; };
    out.tier0Wind = wind();
    gpu.setTier(1); await wait(100);
    out.tier1 = { calm: !!document.querySelector('[data-fx-calm]'), wind: wind(), bigSpell: drawn({}), lethal: drawn({ keep: true }) };
    gpu.setTier(0); await wait(100);
    out.tier1Off = { calm: !!document.querySelector('[data-fx-calm]'), wind: wind() };
    // As fichas de artefato ganham o objeto em 3D no degrau 0 e são as primeiras a sair (degrau 1); a moeda fica até o 2.
    const trinketAt = { cx: 300, cy: 300, w: 80, h: 112 };
    out.trinkets = { tier0: gpu.play('trinket', { at: trinketAt, kind: 'treasure' }) };
    // Os marcadores de jogador saem com as fichas no degrau 1, menos o veneno perto de matar, que fica até o 2. A carta sem textura não vira na GPU.
    const tally = (kind, level = 0) => gpu.play('tally', { at: trinketAt, kind, size: 72, level });
    out.tallies = { tier0: ['poison', 'energy', 'experience', 'rad'].map(kind => tally(kind)), turnWithoutTexture: gpu.play('cardTurn', { at: trinketAt, from: { url: 'https://cards.scryfall.io/small/front/0/0/nothing.jpg' }, to: { back: [] }, duration: 780 }), turnFromBack: gpu.play('cardTurn', { at: trinketAt, from: { back: [] }, to: { back: ['#fff'] }, duration: 780 }) };
    gpu.setTier(1); await wait(100);
    out.tallies.tier1 = [tally('energy'), tally('poison'), tally('poison', 1)];
    out.trinkets.tier1 = gpu.play('trinket', { at: trinketAt, kind: 'food' }); out.trinkets.coinTier1 = gpu.play('coin', { at: trinketAt, heads: true, label: 'Cara', hold: 1200, font: 'serif' });
    gpu.setTier(2); await wait(100);
    out.tier2 = { ready: gpu.ready(), ambience: gpu.ambienceStats()?.running };
    out.tallies.tier2 = [tally('poison', 2), gpu.play('cardTurn', { at: trinketAt, from: { back: [] }, to: { back: [] }, duration: 780 })];
    gpu.setTier(3); await wait(100);
    out.tier3 = { ready: gpu.ready(), canvas: !!document.querySelector('canvas.gpu-layer') };
    gpu.setTier(0);
    for (let i = 0; i < 80 && !gpu.ready(); i++) await wait(100);
    for (let i = 0; i < 30 && !gpu.ambienceStats()?.running; i++) await wait(100);
    out.tier0 = { ready: gpu.ready(), ambience: gpu.ambienceStats()?.running };
    // Sair da mesa (a tela escondida) desfaz o canvas.
    document.querySelector('#table').hidden = true; await wait(50);
    out.canvasHidden = !!document.querySelector('canvas.gpu-layer, canvas.table-ambience');
    localStorage.removeItem('mesa:effects');
    return out;
  `);
  assert.ok(option.readyByDefault, 'effects do not start on the GPU in "automático"');
  assert.deepEqual(option.options, ['Automático', 'Completos', 'Leves']);
  assert.equal(option.saved, 'light');
  assert.equal(option.canvasLight, false, '"leves" kept the GPU layer');
  assert.match(option.summary, /Efeitos leves/);
  assert.ok(option.backToFull, '"completos" did not bring the GPU layer back');
  assert.ok(option.ambienceBefore, 'the living table did not run in "automático"');
  assert.notEqual(option.tier0Wind, 'none', 'the flying wind does not move at tier 0');
  assert.deepEqual(option.tier1, { calm: true, wind: 'none', bigSpell: { played: true, drew: false }, lethal: { played: true, drew: true } },
    'tier 1 drops the big spell darkening, keeps the protected one and stops the continuous animations');
  assert.deepEqual(option.tier1Off, { calm: false, wind: option.tier0Wind }, 'back to tier 0, the continuous animations move again');
  assert.deepEqual(option.trinkets, { tier0: true, tier1: false, coinTier1: true }, 'the token objects should be on the GPU at tier 0 and gone at tier 1, with the coin still there');
  assert.deepEqual(option.tallies, { tier0: [true, true, true, true], turnWithoutTexture: false, turnFromBack: true, tier1: [false, false, true], tier2: [false, false] },
    'the player counter objects leave at tier 1 except poison near the limit, which leaves at tier 2 with the 3D card turn; a card with no texture does not turn on the GPU');
  assert.deepEqual(option.tier2, { ready: true, ambience: false }, 'tier 2 keeps the GPU effects and stops the living table');
  assert.deepEqual(option.tier3, { ready: false, canvas: false }, 'tier 3 is the CSS effects');
  assert.deepEqual(option.tier0, { ready: true, ambience: true }, 'tier 0 brings everything back');
  assert.equal(option.canvasHidden, false, 'leaving the table kept the WebGL context');
  console.log('GPU layer passed: idle load, no idle frames, effects on the GPU, CSS after context loss, ?gpu=0, the Effects option and the governor tiers (with what tier 1 drops).');
} finally { run('close'); }
