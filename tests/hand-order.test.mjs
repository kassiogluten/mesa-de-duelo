import test from 'node:test';
import assert from 'node:assert/strict';
const { arrangeHand, moveInHand, handDropIndex, handSlotShift, insideHand, dragTilt } = await import('../src/ui/handDrag.ts');

test('the first hand follows the order Forge sends', () => {
  assert.deepEqual(arrangeHand([], [5, 3, 9]), [5, 3, 9]);
});

test('a drawn card goes to the end and a played card leaves without shuffling the rest', () => {
  const arranged = [9, 5, 3];
  assert.deepEqual(arrangeHand(arranged, [3, 5, 9, 12]), [9, 5, 3, 12]);
  assert.deepEqual(arrangeHand(arranged, [3, 9]), [9, 3]);
  assert.deepEqual(arrangeHand(arranged, [3, 9, 14, 12]), [9, 3, 14, 12]);
  assert.deepEqual(arrangeHand([1, 1, 2], [2, 1]), [1, 2]);
});

test('moving a card puts it at the chosen position, counted without it', () => {
  assert.deepEqual(moveInHand([1, 2, 3, 4], 1, 2), [2, 3, 1, 4]);
  assert.deepEqual(moveInHand([1, 2, 3, 4], 4, 0), [4, 1, 2, 3]);
  assert.deepEqual(moveInHand([1, 2, 3, 4], 2, 9), [1, 3, 4, 2]);
  assert.equal(moveInHand([1, 2, 3, 4], 3, 2), null);
  assert.equal(moveInHand([1, 2, 3, 4], 7, 0), null);
});

test('the drop position counts the other cards whose center is before the pointer', () => {
  const centers = [50, 100, 150, 200];
  assert.equal(handDropIndex(centers, 0, 10), 0);
  assert.equal(handDropIndex(centers, 0, 120), 1);
  assert.equal(handDropIndex(centers, 0, 400), 3);
  assert.equal(handDropIndex(centers, 3, 120), 2);
  assert.equal(handDropIndex(centers, 3, 10), 0);
  assert.equal(handDropIndex(centers, 1, 90), 1);
});

test('while dragging, the neighbours between origin and destination slide one place to open the gap', () => {
  const lefts = [0, 40, 80, 120];
  // Da primeira para a terceira posição: as duas do meio andam para a esquerda e a arrastada vai para o destino.
  assert.deepEqual([0, 1, 2, 3].map(k => handSlotShift(lefts, 0, 2, k)), [80, -40, -40, 0]);
  // Da última para a segunda: as do meio andam para a direita.
  assert.deepEqual([0, 1, 2, 3].map(k => handSlotShift(lefts, 3, 1, k)), [0, 40, 40, -80]);
  assert.deepEqual([0, 1, 2, 3].map(k => handSlotShift(lefts, 2, 2, k)), [0, 0, 0, 0]);
});

test('dropping inside the hand area reorders; above it, on the field, it plays', () => {
  const hand = { left: 100, right: 500, top: 600, bottom: 760 };
  assert.equal(insideHand(hand, 300, 700), true);
  assert.equal(insideHand(hand, 300, 590), false);
  assert.equal(insideHand(hand, 90, 700), false);
  assert.equal(insideHand(null, 300, 700), false);
});

test('the dragged card lays back as it reaches the field and leans toward where it is going, within limits', () => {
  assert.deepEqual(dragTilt(0, 0), { rx: 0, ry: 0, scale: 1.08 });
  const right = dragTilt(.5, 0), up = dragTilt(0, -.5);
  assert.ok(right.ry > 0 && right.rx === 0, 'moving right turns the card to the right');
  assert.ok(up.rx > 0 && up.ry === 0, 'moving up tips the top edge away');
  assert.deepEqual(dragTilt(10, -10), { rx: 15, ry: 18, scale: 1.08 });
  assert.deepEqual(dragTilt(-10, 10), { rx: -15, ry: -18, scale: 1.08 });
  // Na mão fica de pé; no meio do campo, deitada 40° e um pouco menor; passar do campo não deita mais.
  assert.deepEqual(dragTilt(0, 0, .5), { rx: 20, ry: 0, scale: 1.04 });
  assert.deepEqual(dragTilt(0, 0, 1), { rx: 40, ry: 0, scale: 1 });
  assert.deepEqual(dragTilt(0, 0, 3), dragTilt(0, 0, 1));
  assert.deepEqual(dragTilt(0, 0, -1), dragTilt(0, 0, 0));
});
