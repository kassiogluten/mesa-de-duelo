import test from 'node:test';
import assert from 'node:assert/strict';
const { attackTilt, blockOffset } = await import('../src/ui/combatPose.ts');

test('attackers lean toward the defender, never more than 7 degrees', () => {
  assert.equal(attackTilt(0, -300), 0, 'straight ahead');
  assert.ok(attackTilt(200, -300) > 0, 'going up, defender to the right: clockwise');
  assert.ok(attackTilt(-200, -300) < 0, 'going up, defender to the left: counterclockwise');
  assert.ok(attackTilt(200, 300) < 0, 'going down, defender to the right: counterclockwise');
  assert.equal(attackTilt(5000, -10), 7);
  assert.equal(attackTilt(-5000, 10), 7);
});
test('blockers walk a third of the way to the attacker, at most 48 px', () => {
  assert.deepEqual(blockOffset(0, -100), { x: 0, y: -30 });
  assert.deepEqual(blockOffset(0, -400), { x: 0, y: -48 });
  assert.deepEqual(blockOffset(0, 0), { x: 0, y: 0 });
  const far = blockOffset(300, -400);
  assert.ok(Math.abs(Math.hypot(far.x, far.y) - 48) <= 1);
});
