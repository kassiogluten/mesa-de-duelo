#!/usr/bin/env node
// Print de uma novidade, recortado num elemento, em 2x e WebP (o formato que a página Novidades em imagens espera).
//
//   npm run print -- <página> <seletor> <saída.webp> [opções]
//
//   página   caminho de uma página de teste, com query se quiser: tests/fixtures/duel-table.html?cenario=alvo-cemiterio
//   seletor  CSS do que mostrar; vários separados por vírgula recortam a caixa que envolve todos
//   saída    public/novidades/<versão>/<nome>.webp
//
//   --viewport 1366x768   tamanho da janela (CSS px); a captura sai em 2x
//   --setup "<js>"        roda na página antes do print (pode usar await e window.fixture)
//   --wait 600            espera (ms) depois de abrir e depois do setup
//   --pad 12              margem (CSS px) em volta do recorte
//   --quality 88          qualidade do WebP
//   --url http://localhost:5173   onde a mesa está rodando (ou TABLE_TEST_URL); precisa do `npm run dev` ligado
//
// Exemplo:
//   npm run print -- tests/fixtures/duel-table.html ".hand" public/novidades/0.126.0/mao.webp --setup "window.fixture.render()"
import { browserSession } from '../tests/browser-helper.mjs';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const opts = { viewport: '1366x768', wait: '600', pad: '12', quality: '88', url: process.env.TABLE_TEST_URL ?? 'http://localhost:5173', setup: '' };
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) opts[args[i].slice(2)] = args[++i];
  else positional.push(args[i]);
}
const [page, selector, out] = positional;
if (!page || !selector || !out?.endsWith('.webp')) {
  console.error('Uso: npm run print -- <página> <seletor> <saída.webp> [--viewport 1366x768] [--setup js] [--wait ms] [--pad px] [--quality 88] [--url base]');
  process.exit(1);
}

const { run: browser, evaluate } = browserSession(`print-${process.pid}`);

const [w, h] = opts.viewport.split('x').map(Number);
const tmp = mkdtempSync(join(tmpdir(), 'print-novidade-'));
try {
  browser('open', `${opts.url.replace(/\/$/, '')}/${page.replace(/^\//, '')}`);
  browser('set', 'viewport', String(w), String(h), '2');
  const wait = Number(opts.wait);
  const box = evaluate(`
    const wait = ms => new Promise(r => setTimeout(r, ms));
    await wait(${wait});
    ${opts.setup ? `${opts.setup};\n    await wait(${wait});` : ''}
    const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter(e => e.getClientRects().length);
    if (!els.length) return { missing: true };
    const r = els.map(e => e.getBoundingClientRect());
    return { x: Math.min(...r.map(b => b.left)), y: Math.min(...r.map(b => b.top)), right: Math.max(...r.map(b => b.right)), bottom: Math.max(...r.map(b => b.bottom)) };
  `);
  if (box.missing) throw new Error(`Nenhum elemento visível para "${selector}" em ${page}`);
  const shot = join(tmp, 'shot.png');
  browser('screenshot', shot);
  const meta = await sharp(shot).metadata();
  const scale = meta.width / w, pad = Number(opts.pad);
  const left = Math.max(0, Math.floor((box.x - pad) * scale)), top = Math.max(0, Math.floor((box.y - pad) * scale));
  const width = Math.min(meta.width, Math.ceil((box.right + pad) * scale)) - left;
  const height = Math.min(meta.height, Math.ceil((box.bottom + pad) * scale)) - top;
  mkdirSync(dirname(out), { recursive: true });
  await sharp(shot).extract({ left, top, width, height }).webp({ quality: Number(opts.quality) }).toFile(out);
  console.log(`${out}: ${width}×${height} (${scale}x; aparece com ${Math.round(width / 2)}px de largura)`);
} finally {
  try { browser('close'); } catch {}
  rmSync(tmp, { recursive: true, force: true });
}
