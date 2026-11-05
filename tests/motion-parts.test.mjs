import test from 'node:test';
import assert from 'node:assert/strict';
const { spring, stagePoint, flightFrames, EASE } = await import('../src/ui/motionKit.ts');
const { zoneGlow } = await import('../src/ui/motionZones.ts');
const { abilityText } = await import('../src/ui/motionAbility.ts');
const { counterText } = await import('../src/ui/motionBoard.ts');
const { scryLabel } = await import('../src/ui/motionLibrary.ts');

test('spring settles in a duration that grows with less damping, and falls back to EASE without linear()', () => {
  const stiff = spring(420, 26), soft = spring(380, 20);
  assert.equal(stiff.easing, EASE, 'node has no CSS.supports');
  assert.ok(stiff.duration > 0 && soft.duration > stiff.duration);
});

test('the stage is the centre of the table, in the size of a card', () => {
  assert.deepEqual(stagePoint({ left: 0, top: 0, width: 1000, height: 500 }), { cx: 500, cy: 240, w: 85, h: 118.5 });
  assert.deepEqual(stagePoint({ left: 10, top: 20, width: 1000, height: 1000 }), { cx: 510, cy: 500, w: 112, h: 156 });
});

test('a flight starts where the card was and ends on the target, with the caption at reading size', () => {
  const from = { cx: 100, cy: 400, w: 60, h: 84, rot: 6 }, to = { cx: 500, cy: 100, w: 60, h: 84 };
  const { frames, captionFrames } = flightFrames(from, to, to, { endRot: -4, fade: true, tint: 'grayscale(1)' });
  assert.equal(frames.length, 21);
  assert.equal(frames[0].translate, '-400px 300px');
  assert.equal(frames[0].rotate, '6deg');
  assert.equal(frames[0].opacity, .9);
  assert.equal(frames.at(-1).translate, '0px 0px');
  assert.equal(frames.at(-1).rotate, '-4deg');
  assert.equal(frames.at(-1).scale, '1');
  assert.ok(frames.at(-1).opacity < .2, 'fades into the pile');
  assert.ok(frames.every(f => f.filter.endsWith(' grayscale(1)')));
  for (const [i, f] of captionFrames.entries()) assert.ok(Math.abs(+f.scale * +frames[i].scale - 1) < .005);
});

test('pure pieces of the animation families', () => {
  assert.equal(zoneGlow('Graveyard'), 'drop-shadow(0 0 12px #a46bff)');
  assert.equal(zoneGlow('Hand'), '');
  assert.equal(abilityText({ text: 'Jace Beleren - +2: Each player draws a card.', card: { name: 'Jace Beleren' } }), '+2: Each player draws a card.');
  assert.equal(abilityText({ text: ' Draw a card. ' }), 'Draw a card.');
  assert.equal(counterText('LORE', 1, 3), 'Capítulo III');
  assert.equal(counterText('P1P1', 2, 0), '+2/+2');
  assert.equal(counterText('M1M1', 1, 0), '−1/−1');
  assert.equal(counterText('CHARGE', 1, 0), '');
  assert.equal(scryLabel(2, 1), '2 no topo · 1 no fundo');
  assert.equal(scryLabel(0, 3), '3 no fundo');
});
