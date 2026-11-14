import test from 'node:test';
import assert from 'node:assert/strict';
const { justifyRows, ROWS } = await import('../src/ui/justifiedRows.ts');

// Os prints da 0.167.0 que quebravam a grade de colunas (largura e altura do arquivo, em 2x).
const shot = (w, h) => ({ ar: w / h, natural: w });
const rowsOf = placed => placed.reduce((rows, p, i) => { rows.at(-1).push({ ...p, i }); if (p.pad || i === placed.length - 1) rows.push([]); return rows; }, [[]]).filter(r => r.length);
const width = 728;

test('images of the same row have the same height and fill the width', () => {
  const placed = justifyRows([shot(404, 485), shot(602, 759), shot(404, 485)], width);
  assert.equal(rowsOf(placed).length, 1);
  const heights = placed.map(p => Math.round(p.h));
  assert.ok(Math.max(...heights) - Math.min(...heights) <= 1, `alturas ${heights}`);
  const used = placed.reduce((n, p) => n + p.w, 0) + ROWS.gap * 2;
  assert.ok(width - used >= 0 && width - used < 4, `ocupa ${used} de ${width}`);
});

test('a very wide image gets a row of its own, across the whole width', () => {
  const placed = justifyRows([shot(275, 320), shot(484, 565), shot(2732, 623)], width);
  const rows = rowsOf(placed);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1].map(p => p.i), [2]);
  assert.equal(placed[2].w, width);
  assert.ok(Math.abs(placed[0].h - placed[1].h) <= 1, 'the two narrow ones keep the same height');
  assert.ok(placed[0].w <= 275 * ROWS.grow + 1, 'a small print grows at most to 1.5× its size on the table');
});

test('a row closes at the height closest to the target', () => {
  const placed = justifyRows([shot(444, 525), shot(444, 525), shot(1233, 915), shot(1832, 875)], width);
  assert.deepEqual(rowsOf(placed).map(r => r.map(p => p.i)), [[0, 1, 2], [3]]);
  assert.ok(placed[3].h <= ROWS.maxH, 'the last row never becomes taller than the ceiling');
});

test('every row leaves room for nothing else, so the next one always breaks the line', () => {
  for (const placed of [justifyRows([shot(275, 320), shot(275, 320)], width), justifyRows([shot(832, 342)], width)]) {
    const used = placed.reduce((n, p) => n + p.w + p.pad, 0) + ROWS.gap * (placed.length - 1);
    assert.ok(used <= width && used >= width - 2, `${used} de ${width}`);
  }
});

test('on a phone each image takes a line, at its size on the table', () => {
  const placed = justifyRows([shot(275, 320), shot(2732, 623)], 340);
  assert.deepEqual(placed.map(p => p.w), [137, 340]);
  assert.ok(placed.every(p => p.pad >= 0));
});
