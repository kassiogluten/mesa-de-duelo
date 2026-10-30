import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';

const src = new URL('../src/', import.meta.url);
const read = path => readFile(new URL(path, src), 'utf8');
const sheets = [...(await readdir(src)).filter(f => f.endsWith('.css')), ...(await readdir(new URL('ui/', src))).filter(f => f.endsWith('.css')).map(f => `ui/${f}`)];
const css = Object.fromEntries(await Promise.all(sheets.map(async f => [f, await read(f)])));
const temas = css['temas.css'];

/** sRGB → OKLCH, para achar os azuis da mesa que o tema precisa girar. */
function oklch(hex) {
  const [r, g, b] = [0, 2, 4].map(i => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const [l, m, s] = [
    0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b,
    0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b,
    0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b,
  ].map(Math.cbrt);
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return { c: Math.hypot(a, bb), h: (Math.atan2(bb, a) * 180 / Math.PI + 360) % 360 };
}
const isNavy = hex => { const { c, h } = oklch(hex); return c >= 0.012 && c < 0.1 && h >= 235 && h <= 285; };

test('every themed blue has its line in temas.css, with the same color as the fallback', () => {
  const defined = new Set([...temas.matchAll(/--azul-([0-9a-f]{6}): oklch\(from #([0-9a-f]{6}) /g)].map(m => { assert.equal(m[1], m[2]); return m[1]; }));
  for (const [file, text] of Object.entries(css)) {
    for (const m of text.matchAll(/var\(--azul-([0-9a-f]{6}), #([0-9a-f]{6})\)/g)) {
      assert.equal(m[1], m[2], `${file}: ${m[0]}`);
      assert.ok(defined.has(m[1]), `${file}: --azul-${m[1]} falta em temas.css`);
    }
  }
});

test('no table blue is left out of the themes', () => {
  for (const [file, text] of Object.entries(css)) {
    if (file === 'temas.css') continue;
    const bare = text.replace(/url\([^)]*\)/g, '').replace(/var\(--azul-[0-9a-f]{6}, #[0-9a-f]{6}\)/g, '');
    for (const m of bare.matchAll(/#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|rgba?\((\d+),\s*(\d+),\s*(\d+)/g)) {
      const hex = m[1] ? (m[1].length <= 4 ? [...m[1].slice(0, 3)].map(c => c + c).join('') : m[1].slice(0, 6)).toLowerCase()
        : [m[2], m[3], m[4]].map(n => Number(n).toString(16).padStart(2, '0')).join('');
      assert.ok(!isNavy(hex), `${file}: ${m[0]} é um azul da mesa; use var(--azul-${hex}, #${hex}) e a linha em temas.css`);
    }
  }
});

test('each theme in the menu turns the background hue, and the choice follows the account', async () => {
  const ids = [...(await read('ui/temas.ts')).matchAll(/\{ id: '(\w+)', nome: '([^']+)'/g)].map(m => m[1]);
  assert.equal(ids[0], 'noite');
  assert.equal(ids.length, 6);
  for (const id of ids.slice(1)) {
    const block = new RegExp(`:root\\[data-tema='${id}'\\] \\{([^}]*)\\}`).exec(temas)?.[1];
    assert.ok(block, `tema ${id} sem bloco em temas.css`);
    assert.match(block, /--tema-h: -?\d+;/, `${id}: --tema-h`);
  }
  assert.match(await read('conta/prefs.ts'), /'mesa:tema'/);
  assert.match(await readFile(new URL('../forge-bridge/src/main/java/mesadeduelo/bridge/AccountDecks.java', import.meta.url), 'utf8'), /"mesa:tema"/);
});
