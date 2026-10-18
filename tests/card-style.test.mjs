import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const cardtext = uri(await readFile(new URL('../src/ui/cardtext.ts', import.meta.url), 'utf8'));
const source = (await readFile(new URL('../src/ui/face.ts', import.meta.url), 'utf8')).replace("'./cardtext'", JSON.stringify(cardtext));
const { faceHTML } = await import(uri(source));
const base = { name: 'Raio', manaCost: '{R}', typeLine: 'Mágica Instantânea', creature: false, color: 'R', image: 'https://img/full.jpg' };

test('full image stays exactly as before by default', () => {
  const html = faceHTML(base);
  assert.match(html, /class="face col-R"/); assert.match(html, /src="https:\/\/img\/full.jpg"/); assert.doesNotMatch(html, /art-face/);
});

test('art and text layout shows the cropped art, type, rules text with mana symbols and the printed stats', () => {
  const html = faceHTML({ ...base, style: 'art', art: 'https://img/art.jpg', text: 'Raio causa 3 pontos de dano a qualquer alvo.\n{T}: compre.' });
  assert.match(html, /face art-face col-R/); assert.match(html, /src="https:\/\/img\/art.jpg"/); assert.doesNotMatch(html, /full.jpg/);
  assert.match(html, /af-type">Mágica Instantânea/); assert.match(html, /qualquer alvo.<br>/); assert.match(html, /pip pip-T/);
  const creature = faceHTML({ ...base, style: 'art', creature: true, power: 2, toughness: 3, typeLine: 'Criatura — Goblin' });
  assert.match(creature, /af-stat">2\/3/);
  assert.match(faceHTML({ ...base, style: 'art', loyalty: 4, typeLine: 'Planeswalker — Chandra' }), /af-stat af-loyalty">4/);
});

test('basic lands show only the art, and names and text are escaped', () => {
  for (const typeLine of ['Basic Land — Island', 'Terreno Básico — Ilha', 'Terreno da Neve Básico — Ilha']) {
    const html = faceHTML({ ...base, style: 'art', typeLine, text: 'ignored' });
    assert.match(html, /art-face col-R basic/); assert.doesNotMatch(html, /af-text|af-type/);
  }
  assert.doesNotMatch(faceHTML({ ...base, style: 'art', typeLine: 'Land' }), / basic"/);
  const html = faceHTML({ ...base, style: 'art', name: '<b>x</b>', text: '<script>alert(1)</script>' });
  assert.doesNotMatch(html, /<script>|<b>x/);
});
