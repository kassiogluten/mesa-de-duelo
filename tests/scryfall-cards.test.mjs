import test from 'node:test';
import assert from 'node:assert/strict';
const { slim, slimPt, withDefaultArt, setOwnArtEnabled, withPrinting, faceView, printKey, validCard, lookupName, forgeSpelling, FORMAT } = await import('../src/scryfallCards.ts');

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

test('own art is the default; turned off, basic lands use the Nyx series and other cards the Scryfall image', () => {
  const land = () => withDefaultArt({ name: 'Forest', layout: 'normal', type_line: 'Land', image_uris: uris('f'), pt: { name: 'Floresta', image_uris: uris('fp') } });
  const ring = () => withDefaultArt({ name: 'Sol Ring', layout: 'normal', type_line: 'Artifact', image_uris: uris('s') });
  assert.equal(land().image_uris.normal, '/cartas/forest-normal.webp');
  assert.equal(land().image_uris.art_crop, '/cartas/forest-art.webp');
  assert.equal(ring().image_uris.small, '/cartas/sol-ring-small.webp');
  assert.equal(withDefaultArt({ name: 'Mana Crypt', layout: 'normal', type_line: 'Artifact', image_uris: uris('m') }).image_uris.normal, 'm-n');
  setOwnArtEnabled(false);
  assert.equal(land().image_uris.normal, 'https://api.scryfall.com/cards/thb/254?format=image&version=normal');
  assert.equal(land().image_uris.art_crop, 'https://api.scryfall.com/cards/thb/254?format=image&version=art_crop');
  assert.equal(land().pt.image_uris, undefined);
  assert.equal(ring().image_uris.small, 's-s');
  setOwnArtEnabled(true);
  const forest = land();
  assert.equal(forest.pt.image_uris, undefined);
  assert.equal(printKey('Forest', { set: 'DMU' }), 'dmu/forest');
  assert.equal(printKey('Forest', { set: 'dmu', cn: '281' }), 'dmu/281');
  const printed = withPrinting({ name: 'A // B', layout: 'transform', type_line: 'x', image_uris: uris('a') }, 'B', { image_uris: uris('pa'), faceNames: ['A', 'B'], faceImages: [uris('pa'), uris('pb')] });
  assert.equal(printed.image_uris.normal, 'pb-n');
});

test('reticências: o Forge escreve "All Good Things . . .", o Scryfall "All Good Things..."', () => {
  assert.equal(lookupName('All Good Things . . .'), 'All Good Things...');
  // Estas o Scryfall também escreve com os pontos separados.
  assert.equal(lookupName("I'm a Doctor, Not a . . ."), "I'm a Doctor, Not a . . .");
  assert.equal(forgeSpelling('All Good Things...'), 'all good things . . .');
  assert.equal(forgeSpelling('Lightning Bolt'), null);
});
