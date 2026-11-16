import test from 'node:test';
import assert from 'node:assert/strict';

const { apply, dot, facing, percentileFaces, percentileLabel, rotation } = await import('../src/ui/gpu/diceGeometry.ts');
const { circle, prism, solidData } = await import('../src/ui/gpu/solidShapes.ts');

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('a prism has the front, the back and one side per edge, each flat, facing out and with its picture inside the texture', () => {
  const faces = prism(circle(12), .2);
  assert.equal(faces.length, 2 + 12);
  for (const face of faces) {
    const mid = face.corners.reduce((a, c) => [a[0] + c[0], a[1] + c[1], a[2] + c[2]], [0, 0, 0]).map(v => v / face.corners.length);
    for (const c of face.corners) assert.ok(close(dot(face.normal, c), dot(face.normal, mid)), 'flat');
    assert.ok(dot(face.normal, mid) > 0, 'normal points out');
    assert.ok(close(dot(face.up, face.normal), 0), 'up lies on the face');
    for (const [u, v] of face.uv) assert.ok(u >= 0 && u <= 1 && v >= 0 && v <= 1, 'inside the texture');
  }
  const data = solidData(faces);
  assert.equal(data.position.length / 3, data.uv.length / 2);
  assert.equal(data.index.length, (2 * 10 + 12 * 2) * 3, 'fans: 10 triangles per 12-gon cap, 2 per side');
  assert.ok(Math.max(...data.index) < data.position.length / 3);
});

test('the coin lands with the side asked for facing the viewer, upright, whichever side it is', () => {
  const [front, back] = prism(circle(48), .14);
  for (const face of [front, back]) {
    const m = facing(face.normal, face.up);
    assert.deepEqual(apply(m, face.normal).map(v => Math.round(v * 1e6) / 1e6), [0, 0, 1]);
    assert.deepEqual(apply(m, face.up).map(v => Math.round(v * 1e6) / 1e6), [0, 1, 0]);
  }
  // O verso aparece em pé depois de meia volta em x: o alto do desenho dele vira o alto da tela.
  const flipped = rotation([1, 0, 0], Math.PI);
  assert.ok(close(apply(flipped, back.up)[1], 1));
  // No verso, a textura também não fica espelhada: andar para a direita na tela anda para a direita no desenho.
  const right = back.corners.map((c, i) => [c[0], back.uv[i][0]]).sort((a, b) => a[0] - b[0]);
  assert.ok(right[0][1] < right.at(-1)[1]);
});

test('the d100 rolls as a tens die and a units die, with 100 as 00 and 0', () => {
  const read = n => { const f = percentileFaces(n); return `${percentileLabel('tens', f.tens)}+${percentileLabel('units', f.units)}`; };
  assert.equal(read(1), '00+1');
  assert.equal(read(10), '10+0');
  assert.equal(read(57), '50+7');
  assert.equal(read(99), '90+9');
  assert.equal(read(100), '00+0');
  for (let n = 1; n <= 100; n++) {
    const f = percentileFaces(n);
    assert.ok(f.tens >= 1 && f.tens <= 10 && f.units >= 1 && f.units <= 10);
    const [tens, units] = read(n).split('+').map(Number);
    assert.equal(tens + units || 100, n);
  }
});

test('the token shapes are convex, flat-faced and fast to build', async () => {
  const { TRINKET_SHAPES, facetedFaces } = await import('../src/ui/gpu/solidShapes.ts');
  for (const [name, build] of Object.entries(TRINKET_SHAPES)) {
    const start = performance.now();
    const faces = facetedFaces(build());
    assert.ok(performance.now() - start < 30, `${name} takes too long to build`);
    const points = faces.flatMap(f => f.corners);
    for (const face of faces) {
      const d = dot(face.normal, face.corners[0]);
      for (const c of face.corners) assert.ok(close(dot(face.normal, c), d), `${name}: flat face`);
      // Convexa: nenhum canto do sólido fica do lado de fora de uma face (o shader não usa profundidade).
      for (const p of points) assert.ok(dot(face.normal, p) <= d + 1e-9, `${name}: convex`);
      for (const [u, v] of face.uv) assert.ok(u >= 0 && u <= 1 && v >= 0 && v <= 1, `${name}: inside the texture`);
    }
    assert.ok(points.every(p => Math.hypot(...p) <= 1 + 1e-9), `${name}: fits the unit circle`);
  }
});
