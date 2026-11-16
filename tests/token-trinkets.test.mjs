import test from 'node:test';
import assert from 'node:assert/strict';

const { trinketOf } = await import('../src/ui/tokenTrinkets.ts');

test('Treasure, Clue, Food and Blood tokens get their 3D object, by subtype or by name; other cards do not', () => {
  assert.equal(trinketOf({ token: true, typeLine: 'Token Artifact — Treasure', name: 'Treasure' }), 'treasure');
  assert.equal(trinketOf({ token: true, typeLine: 'Token Artifact — Clue', name: 'Clue' }), 'clue');
  assert.equal(trinketOf({ token: true, name: 'Food' }), 'food');
  assert.equal(trinketOf({ token: true, typeLine: 'Token Artifact - Blood', name: 'Blood' }), 'blood');
  assert.equal(trinketOf({ token: false, typeLine: 'Artifact — Treasure', name: 'Treasure Vault' }), null, 'not a token');
  assert.equal(trinketOf({ token: true, typeLine: 'Token Creature — Soldier', name: 'Soldier' }), null);
  assert.equal(trinketOf({ token: true, typeLine: 'Token Creature — Food Elemental', name: 'Food Elemental' }), null, 'only artifact tokens');
  assert.equal(trinketOf({ token: true, typeLine: 'Token Artifact — Treasure', name: 'Blood Money' }), 'treasure', 'the subtype wins over the name');
  assert.equal(trinketOf(undefined), null);
});
