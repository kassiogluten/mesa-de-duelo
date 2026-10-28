import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  try { return nextResolve(specifier, context); }
  catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
    throw error;
  }
} });
const { SYNCED_PREFS, firstPrefs, localChanges, mergeRemote, readPrefs, writePrefs } = await import('../src/conta/prefs.ts');

function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
}

test('reads and writes only the synced keys; null removes', () => {
  const s = storage({ 'mesa:pace': 'fast', 'mesa:resume': 'x' });
  const prefs = readPrefs(s);
  assert.deepEqual(Object.keys(prefs), [...SYNCED_PREFS]);
  assert.equal(prefs['mesa:pace'], 'fast');
  assert.equal(prefs['mesa:name'], null);
  writePrefs({ 'mesa:pace': null, 'mesa:name': 'Ana' }, s);
  assert.equal(s.data.has('mesa:pace'), false);
  assert.equal(s.data.get('mesa:name'), 'Ana');
});

test('local changes are the keys that differ from the last sync, missing counting as null', () => {
  assert.deepEqual(localChanges({ 'mesa:pace': 'fast', 'mesa:name': 'Ana' }, { 'mesa:pace': 'fast' }), { 'mesa:name': 'Ana' });
  assert.deepEqual(localChanges({ 'mesa:pace': null }, {}), {});
  assert.deepEqual(localChanges({}, { 'mesa:pace': 'fast' }), { 'mesa:pace': null });
});

test('remote values apply unless the key changed here and has not been sent yet', () => {
  const local = { 'mesa:pace': 'fast', 'mesa:name': 'Ana aqui', 'mesa:turnNotice': 'off' };
  const synced = { 'mesa:pace': 'fast', 'mesa:name': 'Ana', 'mesa:turnNotice': 'off' };
  const { apply, synced: next } = mergeRemote(local, synced, { 'mesa:pace': 'normal', 'mesa:name': 'Ana de lá', 'mesa:turnNotice': 'off', 'mesa:resume': 'x' });
  assert.deepEqual(apply, { 'mesa:pace': 'normal' });
  assert.equal(next['mesa:name'], 'Ana de lá', 'the snapshot follows the account');
  assert.equal(next['mesa:resume'], undefined, 'unknown keys are ignored');
  assert.deepEqual(localChanges({ ...local, ...apply }, next), { 'mesa:name': 'Ana aqui' }, 'the local edit still goes up');
});

test('first login: the account wins where it has a value; the rest goes up from here', () => {
  const local = { 'mesa:pace': 'fast', 'mesa:name': 'Ana', 'mesa:turnNotice': 'off' };
  const { apply, synced } = firstPrefs(local, { 'mesa:pace': 'normal', 'mesa:name': 'Ana' }, 'Kassio');
  assert.deepEqual(apply, { 'mesa:pace': 'normal' });
  assert.deepEqual(localChanges({ ...local, ...apply }, synced), { 'mesa:turnNotice': 'off' });
});

test('first login with no name anywhere uses the account nickname, and it goes up', () => {
  const { apply, synced } = firstPrefs({ 'mesa:name': '  ' }, {}, 'Kassio');
  assert.equal(apply['mesa:name'], 'Kassio');
  assert.deepEqual(localChanges({ 'mesa:name': 'Kassio' }, synced), { 'mesa:name': 'Kassio' });
  assert.equal(firstPrefs({ 'mesa:name': 'Ana' }, {}, 'Kassio').apply['mesa:name'], undefined, 'a typed name is kept');
  assert.equal(firstPrefs({}, { 'mesa:name': 'Do celular' }, 'Kassio').apply['mesa:name'], 'Do celular', 'the account name wins over the nickname');
});
