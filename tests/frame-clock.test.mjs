// O relógio de quadros para quando ninguém mais escuta, também quando quem escutava sai dentro do próprio aviso.
import test from 'node:test';
import assert from 'node:assert/strict';

// Um requestAnimationFrame de mentira: cada chamada guarda o pedido, e `run(now)` entrega o quadro.
let pending = new Map(), next = 1;
globalThis.document = { hidden: false, addEventListener() {} };
globalThis.requestAnimationFrame = fn => { const id = next++; pending.set(id, fn); return id; };
globalThis.cancelAnimationFrame = id => { pending.delete(id); };
const run = now => { const due = [...pending.values()]; pending = new Map(); for (const fn of due) fn(now); };

const { listenFrames } = await import('../src/ui/frameClock.ts');

test('the frame loop stops when the last listener leaves inside its own callback', () => {
  let windows = 0;
  const stop = listenFrames(() => { windows++; stop(); });
  for (let now = 0; now <= 600 && pending.size; now += 16) run(now);
  assert.equal(windows, 1);
  assert.equal(pending.size, 0, 'the loop asked for another frame with nobody listening');
});

test('the frame loop keeps going while someone listens, and stops after', () => {
  const seen = [];
  const stop = listenFrames(w => seen.push(w.fps));
  for (let now = 1000; now <= 2100; now += 16) run(now);
  assert.equal(seen.length, 2);
  assert.equal(pending.size, 1, 'one frame asked at a time');
  stop();
  assert.equal(pending.size, 0);
});
