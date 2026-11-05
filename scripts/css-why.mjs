#!/usr/bin/env node
// Por que este elemento tem este estilo? Lista as regras de CSS que se aplicam ao elemento, com o arquivo, a
// especificidade e qual vence em cada propriedade (o que mais faz perder tempo quando um estilo "não pega").
//   npm run css-why -- <página> "<seletor>" [--props font-size,min-height] [--setup "<js>"] [--viewport 1366x768] [--nth 0]
// Exemplo:
//   npm run css-why -- "tests/fixtures/duel-table.html?cenario=alvo-cemiterio" ".zone-card .icon-btn" --props font-size,min-height
// Sobe a mesa sozinho (Vite num processo à parte). Considera só as regras de @media que valem no tamanho pedido.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { browserSession } from '../tests/browser-helper.mjs';

const args = process.argv.slice(2);
const opts = { props: '', setup: '', viewport: '1366x768', nth: '0' };
const positional = [];
for (let i = 0; i < args.length; i++) { if (args[i].startsWith('--')) opts[args[i].slice(2)] = args[++i]; else positional.push(args[i]); }
const [page, selector] = positional;
if (!page || !selector) { console.error('Uso: npm run css-why -- <página> "<seletor>" [--props a,b] [--setup js] [--viewport 1366x768] [--nth 0]'); process.exit(1); }

const VITE = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const vite = spawn(process.execPath, [VITE, '--port', '5197', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'] });
const url = await new Promise((resolve, reject) => {
  let text = '';
  vite.stdout.on('data', d => { text += d; const m = /http:\/\/127\.0\.0\.1:\d+/.exec(text.replace(/\x1b\[[0-9;]*m/g, '')); if (m) resolve(m[0]); });
  vite.on('exit', code => reject(new Error(`o Vite saiu (${code}): ${text}`)));
});

const { run, evaluate } = browserSession(`css-why-${process.pid}`);
try {
  const [w, h] = opts.viewport.split('x');
  run('set', 'viewport', w, h, '1');
  run('open', `${url}/${page.replace(/^\//, '')}`);
  const result = evaluate(`
    await new Promise(r => setTimeout(r, 2000));
    ${opts.setup ? `${opts.setup}; await new Promise(r => setTimeout(r, 500));` : ''}
    const el = document.querySelectorAll(${JSON.stringify(selector)})[${Number(opts.nth)}];
    if (!el) return { missing: true };
    // Especificidade [ids, classes, tipos]; :is/:not/:has contam o argumento mais forte, :where conta zero.
    const spec = sel => {
      let s = sel, a = 0, b = 0, c = 0;
      s = s.replace(/:where\\((?:[^()]|\\([^()]*\\))*\\)/g, '');
      s = s.replace(/:(?:is|not|has|matches)\\(((?:[^()]|\\([^()]*\\))*)\\)/g, (_, inner) => {
        const best = inner.split(',').map(x => spec(x.trim())).sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]).pop() ?? [0, 0, 0];
        a += best[0]; b += best[1]; c += best[2]; return ' ';
      });
      a += (s.match(/#[\\w-]+/g) ?? []).length;
      b += (s.match(/\\.[\\w-]+|\\[[^\\]]*\\]|:(?!:)[\\w-]+(?:\\([^)]*\\))?/g) ?? []).length;
      c += (s.replace(/"[^"]*"|'[^']*'/g, '').match(/(?:^|[\\s>+~(])(?:[a-zA-Z][\\w-]*)|::[\\w-]+/g) ?? []).length;
      return [a, b, c];
    };
    const rules = [];
    let order = 0;
    const walk = (list, file, ctx) => {
      for (const r of list) {
        if (r.selectorText !== undefined) {
          const parts = r.selectorText.split(/,(?![^(]*\\))/).map(x => x.trim()).filter(x => { try { return el.matches(x); } catch { return false; } });
          if (parts.length) {
            const best = parts.map(p => [p, spec(p)]).sort((x, y) => x[1][0] - y[1][0] || x[1][1] - y[1][1] || x[1][2] - y[1][2]).pop();
            rules.push({ order: order++, file, ctx, selector: best[0], spec: best[1], style: r.style });
          }
          if (r.cssRules?.length) walk(r.cssRules, file, ctx); // CSS aninhado
        } else if (r.media) { if (matchMedia(r.media.mediaText).matches) walk(r.cssRules, file, (ctx ? ctx + ' ' : '') + '@media ' + r.media.mediaText); }
        else if (r.cssRules) walk(r.cssRules, file, (ctx ? ctx + ' ' : '') + (r.name !== undefined ? '@layer ' + r.name : r.cssText.split('{')[0].trim()));
      }
    };
    for (const sh of document.styleSheets) {
      const file = sh.ownerNode?.dataset?.viteDevId?.replace(/^.*?\\/(src|tests)\\//, '$1/') ?? sh.href ?? 'inline';
      try { walk(sh.cssRules, file, ''); } catch {}
    }
    const cs = getComputedStyle(el);
    const wanted = ${JSON.stringify(opts.props)} ? ${JSON.stringify(opts.props)}.split(',') : [...new Set(rules.flatMap(r => [...r.style]))];
    const props = {};
    for (const p of wanted) {
      const decl = rules.filter(r => r.style.getPropertyValue(p) !== '').map(r => ({ ...r, important: r.style.getPropertyPriority(p) === 'important', value: r.style.getPropertyValue(p) }));
      decl.sort((x, y) => (x.important - y.important) || x.spec[0] - y.spec[0] || x.spec[1] - y.spec[1] || x.spec[2] - y.spec[2] || x.order - y.order);
      props[p] = { computed: cs.getPropertyValue(p), rules: decl.map(d => ({ file: d.file, ctx: d.ctx, selector: d.selector, spec: d.spec.join(','), value: d.value + (d.important ? ' !important' : '') })), inline: el.style.getPropertyValue(p) };
    }
    return { element: el.outerHTML.slice(0, 160), props };
  `);
  if (result.missing) throw new Error(`nenhum elemento "${selector}" em ${page}`);
  console.log(result.element + (result.element.length >= 160 ? '…' : ''));
  for (const [p, info] of Object.entries(result.props)) {
    if (!info.rules.length && !info.inline) continue;
    console.log(`\n${p}: ${info.computed}${info.inline ? `  (inline: ${info.inline})` : ''}`);
    info.rules.forEach((r, i) => console.log(`  ${i === info.rules.length - 1 && !info.inline ? 'VENCE' : '     '} ${r.value}  ←  ${r.selector}  [${r.spec}]  ${r.file}${r.ctx ? `  ${r.ctx}` : ''}`));
  }
} finally {
  try { run('close'); } catch {}
  vite.kill();
}
