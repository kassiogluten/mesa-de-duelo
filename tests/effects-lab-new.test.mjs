import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

// Os botões marcados como novos no laboratório de efeitos (tests/fixtures/effectsLabNew.ts) precisam existir no painel.
globalThis.window = { setTimeout: fn => { fn(); return 0; } };
const { PLAY_BUTTONS } = await import('./fixtures/effectsLabPlays.ts');
const source = readFileSync(new URL('./fixtures/effects-lab.ts', import.meta.url), 'utf8');
const plays = new Set(PLAY_BUTTONS.flatMap(([, list]) => list.map(([key]) => key)));

function exists(id) {
  const at = id.indexOf(':'), kind = id.slice(0, at), value = id.slice(at + 1);
  if (kind === 'play') return plays.has(value);
  return source.includes(`data-${kind}=`) && (source.includes(`'${value}'`) || source.includes(`"${value}"`));
}

test('a lista publicada é da versão de agora e aponta para botões que existem', () => {
  const published = JSON.parse(readFileSync(new URL('./fixtures/effects-lab-new.json', import.meta.url), 'utf8'));
  assert.equal(typeof published.versao, 'string');
  assert.ok(Array.isArray(published.botoes));
  for (const id of published.botoes) assert.ok(exists(id), `effects-lab-new.json: "${id}" não é um botão do laboratório`);
});

test('os botões novos de cada mudança pendente existem no painel', () => {
  const dir = new URL('../novidades-pendentes/', import.meta.url);
  if (!existsSync(dir)) return;
  for (const folder of readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)) {
    const file = new URL(`${folder}/lab-efeitos.json`, dir);
    if (!existsSync(file)) continue;
    for (const id of JSON.parse(readFileSync(file, 'utf8'))) assert.ok(exists(id), `${folder}/lab-efeitos.json: "${id}" não é um botão do laboratório`);
  }
});
