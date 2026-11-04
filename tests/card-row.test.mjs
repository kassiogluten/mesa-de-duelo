import test from 'node:test';
import assert from 'node:assert/strict';

const { syncRowEdges, CARD_ROWS } = await import('../src/ui/cardRow.ts');

const row = (scrollWidth, clientWidth, scrollLeft) => {
  const classes = new Set();
  return { scrollWidth, clientWidth, scrollLeft, classes, classList: { toggle: (c, on) => on ? classes.add(c) : classes.delete(c) } };
};

test('a row that fits shows no edge shade', () => {
  const r = row(300, 330, 0);
  syncRowEdges(r);
  assert.deepEqual([...r.classes], []);
});

test('the shade sits on each side that still hides cards', () => {
  const start = row(820, 330, 0); syncRowEdges(start);
  assert.deepEqual([...start.classes], ['more-end']);
  const middle = row(820, 330, 200); syncRowEdges(middle);
  assert.deepEqual([...middle.classes].sort(), ['more-end', 'more-start']);
  const end = row(820, 330, 490); syncRowEdges(end);
  assert.deepEqual([...end.classes], ['more-start']);
});

test('choices with filters and votes keep their own layout', () => {
  assert.match(CARD_ROWS, /:not\(\.filtered\)/);
  assert.match(CARD_ROWS, /:not\(\.vote-opts\)/);
  assert.match(CARD_ROWS, /\.trigger-row/);
});
