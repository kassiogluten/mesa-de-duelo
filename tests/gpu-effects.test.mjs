import test from 'node:test';
import assert from 'node:assert/strict';

const stored = new Map();
globalThis.localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, String(value)), removeItem: key => stored.delete(key) };
const { KEYS } = await import('../src/storage.ts');
const { gpuDecision, effectsLevel, setEffectsLevel, forcedGpu, effectsTier, effectCut, TIER1_CUTS } = await import('../src/ui/gpu/gpuSupport.ts');
const { createGpuPort } = await import('../src/ui/gpu/gpuPort.ts');
const { createGovernor, GOVERNOR } = await import('../src/ui/gpu/effectsGovernor.ts');
const { lowFps } = await import('../src/ui/frameClock.ts');

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
  assert.equal(gpuDecision({ ...ok, level: 'auto', tier: 2 }).use, 'gpu', 'automatic keeps the GPU up to tier 2');
  assert.equal(gpuDecision({ ...ok, level: 'auto', tier: 3 }).reason, 'governed', 'tier 3 is the CSS effects');
  assert.equal(gpuDecision({ ...ok, level: 'full', tier: 3 }).use, 'gpu', '"completos" chosen by hand is never governed');
});

test('?gpu=0 and ?gpu=1 force each version; anything else follows the option', () => {
  assert.equal(forcedGpu('?mesa&gpu=0'), false);
  assert.equal(forcedGpu('?gpu=1'), true);
  assert.equal(forcedGpu('?mesa'), undefined);
});

test('the option starts in "automático", is saved, and the old automatic switch to light counts as automático', () => {
  stored.clear();
  assert.equal(effectsLevel(), 'auto');
  stored.set(KEYS.effects, 'auto-light');
  assert.equal(effectsLevel(), 'auto', 'who the table had switched to light goes back to the governor');
  setEffectsLevel('full');
  assert.equal(effectsLevel(), 'full');
  setEffectsLevel('light');
  assert.equal(stored.get(KEYS.effects), 'light');
  stored.clear();
});

/** Uma medida a cada meio segundo, de `from` a `to` ms, com os quadros por segundo e o resto. */
function feed(governor, from, to, fps, o = {}) {
  let tier = governor.tier;
  for (let at = from; at <= to; at += 500) tier = governor.sample({ at, fps, busy: o.busy ?? true, permanents: o.permanents ?? 10 });
  return tier;
}

test('the governor ignores the first seconds, then steps down after 3 s below 30 fps, one step at a time', () => {
  const g = createGovernor();
  g.reset(0);
  assert.equal(feed(g, 0, GOVERNOR.warmupMs - 500, 10), 0, 'the warm-up does not count');
  assert.equal(feed(g, 5000, 7500, 20), 0, 'two and a half seconds are not enough');
  assert.equal(feed(g, 8000, 8000, 20), 1);
  assert.equal(feed(g, 8500, 12500, 20), 1, 'waits 5 s before the next step');
  assert.equal(feed(g, 13000, 16500, 20), 2);
  assert.equal(feed(g, 17000, 40000, 5), 3);
  assert.equal(feed(g, 40500, 60000, 5), 3, 'never past tier 3');
});

test('the governor steps back up only after 6 s above 50 fps with something animating', () => {
  const g = createGovernor();
  g.reset(0);
  feed(g, 5000, 8000, 20);
  assert.equal(g.tier, 1);
  assert.equal(feed(g, 8500, 30000, 60, { busy: false }), 1, 'an idle table proves nothing');
  assert.equal(feed(g, 30500, 30500, 60), 1, 'nor does a single busy moment after it');
  assert.equal(feed(g, 31000, 35500, 60), 1, 'five seconds are not enough');
  assert.equal(feed(g, 36000, 36500, 60), 0);
  assert.equal(feed(g, 37000, 37000, 40), 0, 'between 30 and 50 nothing changes');
});

test('a climb that falls back locks that tier, doubling the wait each time', () => {
  const g = createGovernor();
  g.reset(0);
  feed(g, 5000, 8000, 20);
  feed(g, 8500, 14500, 60);
  assert.equal(g.tier, 0, 'climbed');
  feed(g, 15000, 20000, 20);
  assert.equal(g.tier, 1, 'and fell back within 20 s');
  assert.equal(feed(g, 20500, 39000, 60), 1, 'locked for 20 s');
  assert.equal(feed(g, 39500, 40000, 60), 0, 'then it may try again');
  feed(g, 41000, 46000, 20);
  assert.equal(g.tier, 1, 'fell again');
  assert.equal(feed(g, 46500, 84000, 60), 1, 'now locked for 40 s');
  assert.equal(feed(g, 84500, 85000, 60), 0);
});

test('a crowded table stays at least on tier 1, and returns to 0 when it empties', () => {
  const g = createGovernor();
  g.reset(0);
  assert.equal(feed(g, 5000, 5000, 60, { permanents: GOVERNOR.crowded + 1 }), 1);
  assert.equal(feed(g, 5500, 30000, 60, { permanents: GOVERNOR.crowded + 1 }), 1, 'never climbs below the floor');
  assert.equal(feed(g, 30500, 36500, 60, { permanents: 12 }), 0);
});

test('tier 1 cuts only the listed heavy effects, from tier 1 on, and never a lethal hit nor the ultimate', () => {
  assert.ok(Object.keys(TIER1_CUTS).length > 0, 'tier 1 has a list');
  for (const [name, to] of Object.entries(TIER1_CUTS)) {
    assert.ok(to === 'css' || to === 'off');
    assert.equal(effectCut(name, {}, 0), null, `${name} whole at tier 0`);
    assert.equal(effectCut(name, {}, 1), to);
    assert.equal(effectCut(name, {}, 2), to);
    assert.equal(effectCut(name, { lethal: true }, 1), null, `${name} lethal is protected`);
  }
  assert.equal(effectCut('shockwave', {}, 2), null, 'the ultimate is protected');
  assert.equal(effectCut('not-listed', {}, 1), null);
});

test('the low fps of a window is the 75th percentile of the frame gaps', () => {
  assert.equal(lowFps([]), 0);
  assert.equal(Math.round(lowFps([16.7, 16.7, 16.7, 50])), 20, 'one slow frame in four weighs');
  assert.equal(Math.round(lowFps([16.7, 16.7, 16.7, 16.7, 16.7, 16.7, 16.7, 100])), 60, 'one in eight does not');
  assert.equal(effectsTier(), 0);
});

test('without the GPU layer, every effect is refused (the caller draws it in CSS) and clearing is harmless', () => {
  const root = { hidden: false };
  const port = createGpuPort(root, { host: () => root, reduced: () => false });
  assert.equal(port.play('burst', { at: { cx: 0, cy: 0, w: 10, h: 10 }, tone: 'damage', size: 64 }), false);
  assert.equal(port.ready(), false);
  assert.equal(port.stats(), null);
  port.clear(); port.release();
});

test('the starting roll never waits for a GPU layer that will not come (light effects, no WebGL2, reduced motion)', async () => {
  const root = { hidden: false };
  const port = createGpuPort(root, { host: () => root, reduced: () => false });
  const started = Date.now();
  assert.equal(await port.whenReady(5000), false, 'without WebGL2 it answers at once');
  port.warm();
  assert.equal(port.ready(), false, 'warming without WebGL2 loads nothing');
  assert.ok(Date.now() - started < 1000);
  const reduced = createGpuPort(root, { host: () => root, reduced: () => true });
  assert.equal(await reduced.whenReady(5000), false);
});

test('without WebGL2 the automatic option just uses the CSS effects, silently, and nothing is saved', () => {
  stored.clear();
  const root = { hidden: false };
  // Sem document no Node: o teste de WebGL2 dá "não tem".
  const port = createGpuPort(root, { host: () => root, reduced: () => false });
  port.prepare();
  assert.equal(port.ready(), false);
  assert.equal(effectsLevel(), 'auto');
  assert.equal(stored.has(KEYS.effects), false);
  assert.equal(effectsTier(), 0);
});
