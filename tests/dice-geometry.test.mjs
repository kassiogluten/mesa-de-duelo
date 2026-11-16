import test from 'node:test';
import assert from 'node:assert/strict';

const { dieShape, restingRotation, apply, dot } = await import('../src/ui/gpu/diceGeometry.ts');

const SOLIDS = { 4: 3, 6: 4, 8: 3, 10: 4, 12: 5, 20: 3 };
const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('each solid die has one face per number, with the right shape, and opposite faces add up like real dice', () => {
  for (const [sides, corners] of Object.entries(SOLIDS).map(([s, c]) => [Number(s), c])) {
    const shape = dieShape(sides);
    assert.equal(shape.faces.length, sides, `d${sides}`);
    assert.deepEqual(shape.faces.map(f => f.value).sort((a, b) => a - b), Array.from({ length: sides }, (_, i) => i + 1));
    for (const face of shape.faces) {
      assert.equal(face.corners.length, corners, `d${sides} face ${face.value}`);
      // Plana, com a normal para fora e o alto do número no plano da face.
      for (const c of face.corners) assert.ok(close(dot(face.normal, c), dot(face.normal, face.center)), `d${sides} face ${face.value} is flat`);
      assert.ok(dot(face.normal, face.center) > 0);
      assert.ok(close(dot(face.up, face.normal), 0));
      if (sides === 4) continue;
      const opposite = shape.faces.find(f => close(dot(f.normal, face.normal), -1));
      assert.equal(face.value + opposite.value, sides + 1, `d${sides}: ${face.value} faces ${opposite.value}`);
    }
  }
});

test('d2 and d100 have no solid die (they keep the flat one)', () => {
  assert.equal(dieShape(2), null);
  assert.equal(dieShape(100), null);
});

test('the die rests with the result facing the viewer and its number upright; the tilt shows the top of the die', () => {
  for (const sides of Object.keys(SOLIDS).map(Number)) {
    const shape = dieShape(sides);
    for (const face of shape.faces) {
      const m = restingRotation(shape, face.value);
      assert.ok(close(apply(m, face.normal)[2], 1), `d${sides} ${face.value} faces the viewer`);
      assert.ok(close(apply(m, face.up)[1], 1), `d${sides} ${face.value} is upright`);
      const tilted = restingRotation(shape, face.value, .38);
      const normal = apply(tilted, face.normal);
      assert.ok(normal[2] > .9 && normal[1] < 0, 'seen a little from above: the front face leans down toward the table');
      const front = shape.faces.reduce((best, f) => apply(tilted, f.normal)[2] > apply(tilted, best.normal)[2] ? f : best);
      assert.equal(front.value, face.value, `d${sides} ${face.value} is still the face in front when tilted`);
    }
  }
});
