// Interruptores das animações em loop do campo: gravam neste aparelho, marcam a mesa para o CSS e cada um tem a sua regra.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stored = new Map();
globalThis.localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, String(value)), removeItem: key => stored.delete(key) };

const { LOOP_EFFECTS, applyLoopEffects, loopEffectOn, setLoopEffect } = await import('../src/ui/loopEffects.ts');
const { KEYS } = await import('../src/storage.ts');

function fakeRoot() {
  const attrs = new Map();
  return { attrs, setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k) };
}

test('sem nada gravado, todas ligadas e a mesa sem marca', () => {
  const root = fakeRoot();
  applyLoopEffects(root);
  assert.ok(LOOP_EFFECTS.every(e => loopEffectOn(e.id)));
  assert.equal(root.attrs.has('data-fx-off'), false);
});

test('desligar grava e marca a mesa; ligar todas apaga a chave', () => {
  const root = fakeRoot();
  setLoopEffect('flying', false); setLoopEffect('ambience', false);
  applyLoopEffects(root);
  assert.equal(loopEffectOn('flying'), false);
  assert.deepEqual(JSON.parse(stored.get(KEYS.loopEffectsOff)).sort(), ['ambience', 'flying']);
  assert.deepEqual(root.attrs.get('data-fx-off').split(' ').sort(), ['ambience', 'flying']);
  setLoopEffect(null, true);
  applyLoopEffects(root);
  assert.equal(stored.has(KEYS.loopEffectsOff), false);
  assert.equal(root.attrs.has('data-fx-off'), false);
});

test('cada animação (fora a mesa viva, que para na camada GPU) tem regra no CSS', () => {
  const css = readFileSync(new URL('../src/ui/loopEffects.css', import.meta.url), 'utf8');
  for (const { id } of LOOP_EFFECTS) {
    if (id === 'ambience') continue;
    assert.ok(css.includes(`[data-fx-off~="${id}"]`), `sem regra para ${id}`);
  }
});
