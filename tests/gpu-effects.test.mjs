import test from 'node:test';
import assert from 'node:assert/strict';

const stored = new Map();
globalThis.localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, String(value)), removeItem: key => stored.delete(key) };
const { KEYS } = await import('../src/storage.ts');
const { gpuDecision, effectsLevel, setEffectsLevel, autoLight, forcedGpu, createFrameWatch, SLOW_FRAME_MS } = await import('../src/ui/gpu/gpuSupport.ts');
const { createGpuPort, AUTO_LIGHT_NOTICE } = await import('../src/ui/gpu/gpuPort.ts');

const ok = { level: 'full', reduced: false, webgl2: true, lost: false };

test('effects go to the GPU only with "completos", WebGL2 and a live context; reduced motion wins over everything', () => {
  assert.deepEqual(gpuDecision(ok), { use: 'gpu', reason: 'ok' });
  assert.equal(gpuDecision({ ...ok, level: 'light' }).reason, 'light');
  assert.equal(gpuDecision({ ...ok, webgl2: false }).reason, 'no-webgl2');
  assert.equal(gpuDecision({ ...ok, lost: true }).reason, 'lost');
  assert.equal(gpuDecision({ ...ok, reduced: true }).reason, 'reduced');
  assert.equal(gpuDecision({ ...ok, reduced: true, forced: true }).use, 'css', 'reduced motion even with ?gpu=1');
  assert.equal(gpuDecision({ ...ok, forced: false }).use, 'css');
  assert.equal(gpuDecision({ ...ok, level: 'light', forced: true }).use, 'gpu', '?gpu=1 tries the GPU even with "leves"');
  assert.equal(gpuDecision({ ...ok, forced: true, webgl2: false }).use, 'css');
});

test('?gpu=0 and ?gpu=1 force each version; anything else follows the option', () => {
  assert.equal(forcedGpu('?mesa&gpu=0'), false);
  assert.equal(forcedGpu('?gpu=1'), true);
  assert.equal(forcedGpu('?mesa'), undefined);
});

test('the option starts in "completos", is saved, and the automatic switch only happens while the player chose nothing', () => {
  stored.clear();
  assert.equal(effectsLevel(), 'full');
  assert.equal(autoLight(), true, 'switches once');
  assert.equal(stored.get(KEYS.effects), 'auto-light');
  assert.equal(effectsLevel(), 'light');
  assert.equal(autoLight(), false, 'and does not warn again');
  setEffectsLevel('full');
  assert.equal(effectsLevel(), 'full');
  assert.equal(autoLight(), false, 'who chose "completos" by hand keeps them');
  setEffectsLevel('light');
  assert.equal(stored.get(KEYS.effects), 'light');
  stored.clear();
});

test('three slow effects among the first eight switch to light; fast ones, too-short ones and later ones do not count', () => {
  const watch = createFrameWatch();
  const slow = SLOW_FRAME_MS + 5, fast = 17;
  assert.equal(watch.effect(slow, 20), false);
  assert.equal(watch.effect(slow, 2), false, 'two frames say nothing');
  assert.equal(watch.effect(fast, 20), false);
  assert.equal(watch.effect(slow, 20), false);
  assert.equal(watch.effect(slow, 20), true);
  watch.reset();
  for (let i = 0; i < 8; i++) assert.equal(watch.effect(fast, 20), false);
  for (let i = 0; i < 3; i++) assert.equal(watch.effect(slow, 20), false, 'only the first effects are watched');
});

test('without the GPU layer, every effect is refused (the caller draws it in CSS) and clearing is harmless', () => {
  const root = { hidden: false };
  const port = createGpuPort(root, { host: () => root, reduced: () => false });
  assert.equal(port.play('burst', { at: { cx: 0, cy: 0, w: 10, h: 10 }, tone: 'damage', size: 64 }), false);
  assert.equal(port.ready(), false);
  assert.equal(port.stats(), null);
  port.clear(); port.release();
});

test('a device without WebGL2 switches to light once, with the notice, when the table opens', () => {
  stored.clear();
  const notices = [];
  const root = { hidden: false };
  // Sem document no Node: o teste de WebGL2 dá "não tem".
  const port = createGpuPort(root, { host: () => root, reduced: () => false, notice: text => notices.push(text) });
  port.prepare();
  assert.deepEqual(notices, [AUTO_LIGHT_NOTICE]);
  assert.equal(effectsLevel(), 'light');
  port.prepare();
  assert.equal(notices.length, 1, 'once');
  stored.clear();
});
