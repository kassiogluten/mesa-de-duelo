import test from 'node:test';
import assert from 'node:assert/strict';
const { slim, slimPt, withBasicArt, withPrinting, faceView, printKey, validCard, lookupName, FORMAT } = await import('../src/scryfallCards.ts');

const uris = name => ({ small: `${name}-s`, normal: `${name}-n`, art_crop: `${name}-a` });

test('a two-faced card keeps each face name and image, and its text joined', () => {
  const card = slim({ name: 'A // B', layout: 'transform', type_line: 'Creature // Creature', card_faces: [
    { name: 'A', oracle_text: 'one', mana_cost: '{G}', image_uris: uris('a') }, { name: 'B', oracle_text: 'two', image_uris: uris('b') }] });
  assert.equal(card.v, FORMAT);
  assert.equal(card.mana_cost, '{G}');
  assert.equal(card.oracle_text, 'A\none\n—\nB\ntwo');
  assert.deepEqual(card.faceNames, ['A', 'B']);
  assert.equal(card.image_uris.normal, 'a-n');
  assert.equal(card.faces, true);
  assert.ok(validCard(card));
  assert.equal(faceView({ ...card, pt: { name: 'X', faceNames: ['X1', 'X2'] } }, 1).pt.name, 'X2');
  assert.equal(faceView(card, 1).image_uris.normal, 'b-n');
  assert.equal(lookupName('A // B'), 'A');
});

test('a Portuguese print without a scan keeps the English image', () => {
  const pt = slimPt({ lang: 'pt', printed_name: 'Golpe', image_status: 'placeholder', image_uris: uris('pt') });
  assert.equal(pt.name, 'Golpe');
  assert.equal(pt.image_uris, undefined);
  assert.equal(slim({ name: 'Bolt', lang: 'pt', layout: 'normal', type_line: 'Instant', image_uris: uris('pt') }).pt.image_uris.normal, 'pt-n');
});

test('basic lands use the fixed art and the chosen print replaces the default image', () => {
  const forest = withBasicArt({ name: 'Forest', layout: 'normal', type_line: 'Land', image_uris: uris('f'), pt: { name: 'Floresta', image_uris: uris('fp') } });
  assert.match(forest.image_uris.normal, /\/cards\/dmu\/281\?format=image&version=normal$/);
  assert.equal(forest.pt.image_uris, undefined);
  assert.equal(printKey('Forest', { set: 'DMU' }), 'dmu/forest');
  assert.equal(printKey('Forest', { set: 'dmu', cn: '281' }), 'dmu/281');
  const printed = withPrinting({ name: 'A // B', layout: 'transform', type_line: 'x', image_uris: uris('a') }, 'B', { image_uris: uris('pa'), faceNames: ['A', 'B'], faceImages: [uris('pa'), uris('pb')] });
  assert.equal(printed.image_uris.normal, 'pb-n');
});
