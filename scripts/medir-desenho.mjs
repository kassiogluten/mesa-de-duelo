#!/usr/bin/env node
// Medição (ROADMAP 124): quanto a mesa leva para redesenhar um estado novo com 0 a 60 permanentes por jogador
// (Commander com 4, página tests/fixtures/commander-table.html), e quantos elementos a página tem. Precisa do
// `npm run dev` ligado (ou TABLE_TEST_URL). Uso: node scripts/medir-desenho.mjs
import { browserSession, TABLE_URL } from '../tests/browser-helper.mjs';

const b = browserSession('render-bench');
b.run('set', 'viewport', '1366', '768');
b.run('open', `${TABLE_URL}/tests/fixtures/commander-table.html`);
b.run('wait', '1500');
const result = b.evaluate(`
  const f = window.fixture;
  const names = ['Llanowar Elves','Elvish Mystic','Serra Angel','Wall of Omens','Soul Warden','Hill Giant','Wood Elves','Grizzly Bears','Sol Ring','Arcane Signet','Glorious Anthem','Lightning Greaves'];
  const card = (id, name, controller, extra = {}) => ({ id, name, controller, tapped: false, token: false, manaCost: '{2}{G}', typeLine: 'Creature', creature: true, power: 3, toughness: 3, ...extra });
  const out = [];
  for (const n of [0, 10, 25, 40, 60]) {
    f.state.players.forEach(p => {
      p.battlefield = Array.from({ length: n }, (_, i) => i % 3 === 0
        ? card(100000 + p.id * 1000 + i, 'Forest', p.id, { land: true, creature: false, typeLine: 'Basic Land — Forest', manaCost: '' })
        : i % 5 === 0 ? card(100000 + p.id * 1000 + i, 'Saproling', p.id, { token: true, power: 1, toughness: 1 })
        : card(100000 + p.id * 1000 + i, names[i % names.length], p.id, { tapped: i % 4 === 0 }));
    });
    f.render();
    await new Promise(r => setTimeout(r, 400));
    const times = [];
    for (let k = 0; k < 12; k++) {
      // Um estado novo, como chega do servidor a cada jogada: uma carta vira, a vida muda.
      const s = structuredClone(f.state);
      s.players[k % 4].life -= 1;
      const bf = s.players[(k + 1) % 4].battlefield; if (bf.length) bf[k % bf.length].tapped = !bf[k % bf.length].tapped;
      s.input.gen += 1;
      f.client.state = s; Object.assign(f.state, s);
      const t0 = performance.now();
      f.render();
      document.body.offsetHeight; // estilo e layout entram na conta
      const t1 = performance.now();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      times.push([t1 - t0, performance.now() - t0]);
    }
    const js = times.map(t => t[0]).sort((a, b) => a - b), frame = times.map(t => t[1]).sort((a, b) => a - b);
    out.push({ porJogador: n, naMesa: n * 4, elementos: document.querySelectorAll('*').length,
      desenharMs: +js[6].toFixed(1), desenharMaxMs: +js[11].toFixed(1), ateAparecerMs: +frame[6].toFixed(1) });
  }
  return JSON.stringify(out);
`);
console.table(JSON.parse(result));
b.run('close');
