import test from 'node:test';
import assert from 'node:assert/strict';

const { clampShift, dodgeShift } = await import('../src/ui/dragPanel.ts');

const view = { width: 1000, height: 800 };
const box = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height });

test('a panel inside the screen stays where it is; one that left it comes back by the shortest way', () => {
  assert.deepEqual(clampShift(box(100, 100, 200, 100), view), { x: 0, y: 0 });
  assert.deepEqual(clampShift(box(-50, 100, 200, 100), view), { x: 54, y: 0 });
  assert.deepEqual(clampShift(box(900, 750, 200, 100), view), { x: -104, y: -54 });
  // Maior que a tela: a borda de cima e a da esquerda ficam à vista.
  assert.deepEqual(clampShift(box(-20, -20, 1200, 100), view), { x: 24, y: 24 });
});

test('the action box only moves when it covers a card that can be chosen, and to the nearest free side', () => {
  const action = box(700, 500, 260, 200);
  assert.equal(dodgeShift(action, [box(100, 100, 80, 110)], view), null, 'nothing covered');
  assert.equal(dodgeShift(action, [], view), null);
  // A carta encosta na borda de cima: descer ou ir para a direita sai da tela; subir (228) é mais perto que ir para a esquerda (248).
  assert.deepEqual(dodgeShift(action, [box(720, 480, 80, 110)], view), { x: 0, y: -228 });
});

test('the dodge never leaves the screen or lands on another choosable card', () => {
  const action = box(700, 560, 260, 200);
  const cards = [box(650, 600, 80, 110), box(400, 590, 80, 110)];
  const shift = dodgeShift(action, cards, view);
  assert.ok(shift, 'there is room above');
  const moved = box(action.left + shift.x, action.top + shift.y, 260, 200);
  for (const c of cards) assert.ok(moved.right <= c.left || moved.left >= c.right || moved.bottom <= c.top || moved.top >= c.bottom, 'still covering a card');
  assert.ok(moved.top >= 4 && moved.left >= 4 && moved.right <= 996 && moved.bottom <= 796);
  // Sem espaço em lugar nenhum: fica no lugar de sempre.
  assert.equal(dodgeShift(box(0, 0, 1000, 800), [box(400, 300, 80, 110)], view), null);
});
