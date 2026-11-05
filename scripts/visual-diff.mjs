#!/usr/bin/env node
// Comparação de telas, para refatorações que não podem mudar nada na mesa (CSS, divisão de arquivos).
//   npm run visual -- snap <pasta>            prints das páginas de teste (sobe a mesa sozinho)
//   npm run visual -- compare <antes> <depois> diferença pixel a pixel; grava <depois>/diff-*.png onde mudou
// Fluxo: `snap` no commit de antes (git worktree ou antes da mudança), mudança, `snap` de novo, `compare`.
// Animações e transições ficam desligadas; imagens das cartas e fundos ficam escondidos (o espaço continua), porque
// carregam do Scryfall em tempos diferentes: compara-se o layout, não a arte. Diferença abaixo de 0,02% (relógios) é ruído.
import { mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { browserSession } from '../tests/browser-helper.mjs';

/** Páginas e cenários: o bastante para passar por quase toda a mesa. */
const DUEL = ['', 'proliferar', 'montes', 'alvo-cemiterio', 'lealdade', 'gifts', 'spelunking', 'viradas', 'improvisar', 'pagar', 'remocao', 'automatico', 'espera', 'tutor', 'reconectando', 'conexao-perdida', 'tipo-ganho', 'contagens'];
const PAGES = [
  ...DUEL.map(c => [`duel${c ? `-${c}` : ''}`, `tests/fixtures/duel-table.html${c ? `?cenario=${c}` : ''}`]),
  ['commander', 'tests/fixtures/commander-table.html'], ['commander-espera', 'tests/fixtures/commander-table.html?cenario=espera'],
  ['commander-endgame', 'tests/fixtures/commander-endgame.html'], ['extra-turn', 'tests/fixtures/extra-turn.html'],
  ['replay', 'tests/fixtures/replay.html'], ['room-lobby', 'tests/fixtures/room-lobby.html'],
];
const VITE_BIN = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const VIEWPORTS = [[1366, 768], [844, 390]];
const FREEZE = `const st=document.createElement('style');st.textContent='*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}.card-inspector-preview{display:none!important}img{visibility:hidden!important}*{background-image:none!important}';document.head.append(st);`;
/** Espera as imagens das cartas (vêm do Scryfall) e a mesa parar de mudar. */
const SETTLE = `const wait=ms=>new Promise(r=>setTimeout(r,ms));for(let i=0;i<60;i++){const imgs=[...document.images].filter(im=>im.getClientRects().length);if(imgs.every(im=>im.complete))break;await wait(250);}let last='';for(let i=0;i<20;i++){await wait(300);const now=document.body.innerHTML.length+':'+[...document.images].filter(im=>im.complete).length;if(now===last)break;last=now;}await wait(500);`;

async function snap(out) {
  // A mesa roda num processo à parte: os comandos do navegador são síncronos e travariam um Vite neste mesmo processo.
  const vite = spawn(process.execPath, [VITE_BIN, '--port', '5198', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const url = await new Promise((resolve, reject) => {
    let text = '';
    vite.stdout.on('data', d => { text += d; const m = /http:\/\/127\.0\.0\.1:\d+/.exec(text.replace(/\[[0-9;]*m/g, '')); if (m) resolve(m[0]); });
    vite.on('exit', code => reject(new Error(`o Vite saiu (${code}): ${text}`)));
  });
  mkdirSync(out, { recursive: true });
  const { run, evaluate } = browserSession(`visual-${process.pid}`);
  try {
    for (const [w, h] of VIEWPORTS) {
      run('set', 'viewport', String(w), String(h), '1');
      for (const [name, page] of PAGES) {
        run('open', `${url}/${page}`);
        evaluate(`${FREEZE} ${SETTLE} return true;`);
        run('screenshot', join(out, `${name}@${w}x${h}.png`));
      }
      console.log(`${PAGES.length} telas em ${w}×${h}`);
    }
  } finally {
    try { run('close'); } catch {}
    vite.kill();
  }
}

async function compare(a, b) {
  const files = readdirSync(a).filter(f => f.endsWith('.png') && !f.startsWith('diff-'));
  let changed = 0;
  for (const f of files) {
    if (!existsSync(join(b, f))) { console.log(`falta     ${f}`); changed++; continue; }
    const [x, y] = await Promise.all([join(a, f), join(b, f)].map(p => sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
    if (x.info.width !== y.info.width || x.info.height !== y.info.height) { console.log(`tamanho   ${f}`); changed++; continue; }
    const diff = Buffer.alloc(x.data.length);
    let px = 0;
    for (let i = 0; i < x.data.length; i += 4) {
      const d = Math.abs(x.data[i] - y.data[i]) + Math.abs(x.data[i + 1] - y.data[i + 1]) + Math.abs(x.data[i + 2] - y.data[i + 2]);
      if (d > 24) { px++; diff[i] = 255; diff[i + 3] = 255; } else { diff[i] = diff[i + 1] = diff[i + 2] = x.data[i] / 4; diff[i + 3] = 255; }
    }
    const pct = (100 * px) / (x.info.width * x.info.height);
    if (pct < 0.02) { if (px) console.log(`ruído     ${f}: ${px} px`); continue; }
    if (px) {
      changed++;
      await sharp(diff, { raw: x.info }).png().toFile(join(b, `diff-${f}`));
      console.log(`mudou     ${f}: ${px} px (${pct.toFixed(3)}%)`);
    }
  }
  console.log(`\n${files.length - changed}/${files.length} iguais`);
  return changed;
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'snap' && args[0]) await snap(args[0]);
else if (cmd === 'compare' && args[1]) process.exit((await compare(args[0], args[1])) ? 1 : 0);
else { console.error('Uso: npm run visual -- snap <pasta> | compare <antes> <depois>'); process.exit(1); }
