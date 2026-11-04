import assert from 'node:assert/strict';
import { test } from 'node:test';
import { savedHandMode, toggleAuto, toggleShown } from '../src/ui/handMode.ts';

test('what was saved by the two-mode hand keeps meaning the same thing', () => {
  assert.equal(savedHandMode('open', true), 'fixa');
  assert.equal(savedHandMode('peek', false), 'auto');
  assert.equal(savedHandMode('oculta', true), 'oculta');
  assert.equal(savedHandMode(null, true), 'auto', 'mouse starts automatic');
  assert.equal(savedHandMode(null, false), 'fixa', 'touch starts open');
});

test('Auto turns on and off; off leaves the hand in view', () => {
  assert.equal(toggleAuto('auto'), 'fixa');
  assert.equal(toggleAuto('fixa'), 'auto');
  assert.equal(toggleAuto('oculta'), 'auto');
});

test('the arrow shows a hidden hand and hides a visible one', () => {
  assert.equal(toggleShown('fixa'), 'oculta');
  assert.equal(toggleShown('oculta'), 'fixa');
});
