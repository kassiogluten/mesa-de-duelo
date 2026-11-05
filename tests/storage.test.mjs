import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import ts from 'typescript';

const { KEYS, PREFIXES, load, save, loadJSON, saveJSON } = await import('../src/storage.ts');

// Arquivos que ainda escrevem as chaves 'mesa:…' à mão (nenhum: toda chave nova entra em src/storage.ts).
const ALLOW = new Set([]);

test('every storage key is unique and none can be taken for a dynamic key', () => {
  const values = Object.values(KEYS);
  assert.equal(new Set(values).size, values.length, 'two names for the same key');
  const prefixes = Object.values(PREFIXES);
  assert.equal(new Set(prefixes).size, prefixes.length);
  for (const key of values) for (const prefix of prefixes) assert.ok(!key.startsWith(prefix), `${key} looks like ${prefix}…`);
});

async function tsFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...await tsFiles(path));
    else if (entry.name.endsWith('.ts')) out.push(path);
  }
  return out;
}

test("no file outside src/storage.ts spells a 'mesa:' key by hand", async () => {
  const strays = [];
  for (const file of await tsFiles('src')) {
    if (file === 'src/storage.ts' || ALLOW.has(file)) continue;
    const text = await readFile(file, 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const visit = node => {
      if ((ts.isStringLiteralLike(node) || ts.isTemplateHead(node)) && node.text.startsWith('mesa:')) {
        strays.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${node.getText()}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.deepEqual(strays, [], 'use KEYS, PREFIXES or EVENTS from src/storage.ts');
});

test('the helpers never throw and null removes the key', () => {
  const data = new Map();
  const mem = { getItem: k => data.has(k) ? data.get(k) : null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
  assert.equal(save('k', 'v', mem), true);
  assert.equal(load('k', mem), 'v');
  assert.equal(save('k', null, mem), true);
  assert.equal(data.has('k'), false);
  assert.deepEqual(loadJSON('k', { a: 1 }, mem), { a: 1 }, 'missing key: the fallback');
  saveJSON('k', { b: 2 }, mem);
  assert.deepEqual(loadJSON('k', null, mem), { b: 2 });
  data.set('k', '{bad');
  assert.equal(loadJSON('k', 7, mem), 7, 'invalid JSON: the fallback');
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('blocked'); } };
  assert.equal(load('k', broken), null);
  assert.equal(save('k', 'v', broken), false);
  assert.equal(save('k', null, broken), false);
  assert.equal(loadJSON('k', 3, broken), 3);
  assert.equal(saveJSON('k', 1, broken), false);
});
