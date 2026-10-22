import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const source = (await readFile(new URL('../src/ui/cardFlip.ts', import.meta.url), 'utf8')).replace("import './cardFlip.css';", '');
const { cardSides, flipButtonHTML } = await import(uri(source));
const img = normal => ({ normal });

test('double-faced cards turn to the other image, preferring the Portuguese scan of each face', () => {
  const sides = cardSides({ layout: 'transform', faceImages: [img('en-front'), img('en-back')], pt: { faceImages: [img('pt-front'), undefined] } });
  assert.deepEqual(sides, { kind: 'dfc', images: ['pt-front', 'en-back'] });
  assert.match(flipButtonHTML(sides, 'dw-button'), /data-flip aria-pressed="false">Ver o verso</);
});

test('flip cards rotate the same image; single-faced and adventure cards have nothing to turn', () => {
  const flip = cardSides({ layout: 'flip', image_uris: img('kamigawa') });
  assert.deepEqual(flip, { kind: 'flip', images: ['kamigawa'] });
  assert.match(flipButtonHTML(flip, 'ci-control'), />Girar a carta</);
  assert.equal(cardSides({ layout: 'normal', image_uris: img('a') }), null);
  assert.equal(cardSides({ layout: 'adventure', image_uris: img('a'), faceImages: [img('a')] }), null);
  assert.equal(cardSides(null), null);
});
