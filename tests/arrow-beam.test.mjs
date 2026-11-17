// Setas da mesa no estilo "feixe com símbolo": a curva, o símbolo de cada tipo e o losango quando várias chegam ao mesmo alvo.
import test from 'node:test';
import assert from 'node:assert/strict';
const { beamHTML, crowdedTargets, curveAt, curveLength } = await import('../src/ui/arrowBeam.ts');

const s = { x: 0, y: 0 }, c = { x: 50, y: 0 }, e = { x: 100, y: 0 };

test('the curve passes through both ends, and a straight one measures its length', () => {
  assert.deepEqual(curveAt(s, c, e, 0), s);
  assert.deepEqual(curveAt(s, c, e, 1), e);
  assert.ok(Math.abs(curveLength(s, c, e) - 100) < .01);
  assert.ok(Math.abs(curveLength(s, { x: 33, y: 0 }, e, { x: 66, y: 0 }) - 100) < .01, 'cubic, too (blockers)');
});

test('an arrow keeps path.arrow, runs a pulse sized to its length and shows its symbol before the target', () => {
  const html = beamHTML({ d: 'M0 0 Q50 0 100 0', cls: 'attack', glyph: 'sword', s, c, e, glow: 'g' });
  assert.match(html, /<g class="beam attack">/);
  assert.match(html, /<path class="arrow" d=/);
  assert.match(html, /class="arrow-pulse"[^>]*--len:100px/);
  assert.match(html, /class="arrow-glyph" transform="translate\(86\.0 0\.0\)"/, 'at 86% of the way');
  assert.doesNotMatch(html, /--runs/, 'without a limit, the pulse runs while the arrow exists');
  const combat = beamHTML({ d: 'M0 0 Q50 0 100 0', cls: 'block', glyph: 'shield', s, c, e, glow: 'g', pulses: 3, diamond: true });
  assert.match(combat, /--runs:3/);
  assert.match(combat, /class="arrow-diamond" transform="translate\(100\.0 0\.0\) rotate\(0\.0\)"/);
  assert.doesNotMatch(combat, /arrow-glyph/);
});

test('with several arrows on one target, only the shortest keeps the symbol', () => {
  assert.deepEqual(crowdedTargets([{ target: 'p1', length: 300 }, { target: 'p1', length: 200 }, { target: 'c9', length: 400 }, { target: 'p1', length: 250 }]), [true, false, false, true]);
});
