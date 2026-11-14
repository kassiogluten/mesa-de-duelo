import test from 'node:test';
import assert from 'node:assert/strict';
const { mock } = await import('./register.mjs');

// O PixiJS falso: só o que `timed` e as partículas usam (Container, Sprite), sem WebGL.
mock(import.meta.resolve('pixi.js'), `
  export class Container {
    constructor(o = {}) { Object.assign(this, { children: [], alpha: 1, visible: true }, o); this.handlers = {}; }
    addChild(...c) { this.children.push(...c); return c[0]; }
    on(name, fn) { this.handlers[name] = fn; }
    destroy() { this.handlers.destroyed?.(); }
  }
  export class Sprite { constructor(o = {}) { Object.assign(this, { x: 0, y: 0, alpha: 1, rotation: 0, scale: { set() {} } }, o); } destroy() {} }
  export class Texture {}
  export class Color { constructor(v) { this.v = v; } toNumber() { return 0; } }
`, import.meta.url);
const { timed } = await import('../src/ui/gpu/gpuParticles.ts');
const shared = { spark: {}, max: 400 };

test('a delayed effect draws nothing before it starts (no ring waiting at the destination)', () => {
  let built = 0;
  const effect = timed(400, view => { built++; view.addChild({ ring: true }); return () => {}; }, 500);
  assert.equal(effect.update(300), true);
  assert.equal(built, 0);
  assert.equal(effect.view.children.length, 0);
  effect.update(250);
  assert.equal(built, 1, 'it is built once, when the delay is over');
});

test('an effect that sheds sparks every frame stops at the end, and ends when the last spark dies', () => {
  let calls = 0;
  const effect = timed(300, (_view, sparks) => (_t, ms) => {
    calls++;
    if (ms > 0) sparks.add(shared.spark, shared, { x: 0, y: 0, vx: 0, vy: 0, life: 200, spin: 0, grow: 0, scale: 1, gravity: 0, drag: 0, tint: 0 });
  });
  let frames = 0;
  while (effect.update(16) && frames < 500) frames++;
  assert.ok(frames < 40, `acabou em ${frames} quadros (300 ms de efeito e 200 ms da última faísca)`);
  assert.equal(calls, Math.ceil(300 / 16), 'the last drawing is the one at t = 1');
});
