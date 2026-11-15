import assert from 'node:assert/strict';
import { test } from 'node:test';

const { fpsQuality, pingQuality } = await import('../src/ui/perfMeter.ts');

test('the perf badge colors follow the agreed limits', () => {
  assert.deepEqual([60, 50, 49, 30, 29].map(fpsQuality), ['good', 'good', 'fair', 'fair', 'poor']);
  assert.deepEqual([40, 99, 100, 250, 251].map(pingQuality), ['good', 'good', 'fair', 'fair', 'poor']);
});

test('sparks get rarer as the cap fills, and half as many on tier 1', async () => {
  const { sparkChance } = await import('../src/ui/gpu/gpuParticles.ts');
  assert.equal(sparkChance(0, 400, 0), 1);
  assert.equal(sparkChance(200, 400, 0), .75);
  assert.equal(sparkChance(0, 400, 1), .5);
  assert.equal(sparkChance(400, 400, 0), 0);
});
