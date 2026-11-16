import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { viaMirror, fromMirror, mirrorUrls, imagesHost } = await import('../src/scryfallMirror.ts');
const { images } = await import('../src/scryfallCards.ts');

const id = '7673784e-db4b-43a1-8d55-1bb9fc1e284f';
const scry = (size, face = 'front') => `https://cards.scryfall.io/${size}/${face}/7/6/${id}.jpg?1783903008`;

test('card images go through our cache, with the same path and the version query', () => {
  assert.equal(viaMirror(scry('normal')), `/scryfall/normal/front/7/6/${id}.jpg?1783903008`);
  assert.equal(viaMirror(scry('art_crop', 'back')), `/scryfall/art_crop/back/7/6/${id}.jpg?1783903008`);
  assert.equal(viaMirror(undefined), undefined);
});

test('only the sizes the table uses are mirrored; anything else keeps the Scryfall address', () => {
  for (const url of [scry('large'), scry('png').replace('.jpg', '.png'), 'https://cards.scryfall.io/normal/front/7/6/../../x.jpg', '/cartas/raio-normal.webp',
    'https://api.scryfall.com/cards/thb/250?format=image&version=large', 'https://api.scryfall.com/cards/plst/ZEN-1%E2%98%85?format=image&version=normal'])
    assert.equal(viaMirror(url), url);
});

test('tokens and Nyx lands asked by set and number go through the cache too, and map back to the API', () => {
  const api = (set, cn, version, back = '') => `https://api.scryfall.com/cards/${set}/${cn}?format=image&version=${version}${back}`;
  assert.equal(viaMirror(api('TBLB', '3', 'normal')), '/scryfall/cards/normal/tblb/3');
  assert.equal(viaMirror(api('tust', '1', 'small', '&face=back')), '/scryfall/cards/small/tust/1/back');
  assert.equal(viaMirror(api('thb', '250', 'art_crop')), '/scryfall/cards/art_crop/thb/250');
  const base = 'https://mesa.example/';
  assert.equal(fromMirror('/scryfall/cards/normal/tblb/3', base), api('tblb', '3', 'normal'));
  assert.equal(fromMirror('/scryfall/cards/small/tust/1/back', base), api('tust', '1', 'small', '&face=back'));
});

test('token images in a server message are switched to the cache, and nothing else in it changes', async () => {
  const { parseServerMessage } = await import('../src/forge/client.ts');
  const raw = JSON.stringify({ type: 'state', state: { cards: [{ name: 'Rabbit', image: 'https://api.scryfall.com/cards/tfdn/5?format=image&version=normal' },
    { name: 'Note', text: 'https://api.scryfall.com/cards/tfdn/5?format=image&version=normal' }] } });
  const msg = parseServerMessage(raw);
  assert.equal(msg.state.cards[0].image, '/scryfall/cards/normal/tfdn/5');
  assert.equal(msg.state.cards[1].text, 'https://api.scryfall.com/cards/tfdn/5?format=image&version=normal');
  assert.deepEqual(parseServerMessage('{"type":"pong"}'), { type: 'pong' });
});

test('a cached image maps back to Scryfall for the fallback, only on our own origin', () => {
  const base = 'https://mesa.example/jogo';
  assert.equal(fromMirror(`/scryfall/normal/front/7/6/${id}.jpg?1783903008`, base), scry('normal'));
  assert.equal(fromMirror(`https://mesa.example/scryfall/small/front/7/6/${id}.jpg`, base), `https://cards.scryfall.io/small/front/7/6/${id}.jpg`);
  assert.equal(fromMirror(`https://outro.example/scryfall/small/front/7/6/${id}.jpg`, base), undefined);
  assert.equal(fromMirror('/cartas/raio-normal.webp', base), undefined);
});

test('the images host becomes an https origin, even without the scheme; an invalid value falls back to the site', () => {
  assert.equal(imagesHost('https://img.mesao.online'), 'https://img.mesao.online');
  assert.equal(imagesHost('img.mesao.online'), 'https://img.mesao.online');
  assert.equal(imagesHost(' https://img.mesao.online/ '), 'https://img.mesao.online');
  assert.equal(imagesHost('http://localhost:8089'), 'http://localhost:8089');
  for (const v of [undefined, '', '   ', 'não é endereço']) assert.equal(imagesHost(v), '', String(v));
});

test('with an images host (the CDN), its addresses also fall back to Scryfall', () => {
  const base = 'https://mtg.kassio.site/', host = 'https://img.mesao.online';
  assert.equal(fromMirror(`${host}/scryfall/normal/front/7/6/${id}.jpg?1783903008`, base, host), scry('normal'));
  assert.equal(fromMirror(`/scryfall/normal/front/7/6/${id}.jpg?1783903008`, base, host), scry('normal'), 'the site itself still counts');
  assert.equal(fromMirror(`https://img.outro.online/scryfall/normal/front/7/6/${id}.jpg`, base, host), undefined);
});

test('stored cards from before the cache switch to it, and new ones arrive already switched', () => {
  const old = { name: 'Raio', image_uris: { normal: scry('normal'), small: scry('small') }, faceImages: [{ art_crop: scry('art_crop') }, undefined], pt: { name: 'Relâmpago' }, cmc: 1 };
  const card = mirrorUrls(old);
  assert.equal(card.image_uris.normal, viaMirror(scry('normal')));
  assert.equal(card.faceImages[0].art_crop, viaMirror(scry('art_crop')));
  assert.equal(card.faceImages[1], undefined);
  assert.equal(card.cmc, 1);
  assert.equal(card.pt.name, 'Relâmpago');
  assert.deepEqual(images({ normal: scry('normal'), small: scry('small'), art_crop: scry('art_crop') }), { normal: viaMirror(scry('normal')), small: viaMirror(scry('small')), art_crop: viaMirror(scry('art_crop')) });
});

test('nginx serves the same paths the table asks for, and the dev server forwards them', async () => {
  const nginx = await readFile(new URL('../deploy/nginx.conf', import.meta.url), 'utf8');
  const pattern = nginx.match(/location ~ "(\^\/scryfall\/[^"]+)"/)?.[1];
  assert.ok(pattern, 'location /scryfall/ no nginx');
  const re = new RegExp(pattern);
  assert.ok(re.test(viaMirror(scry('normal')).split('?')[0]));
  assert.ok(re.test(viaMirror(scry('art_crop', 'back')).split('?')[0]));
  assert.ok(!re.test(`/scryfall/large/front/7/6/${id}.jpg`));
  const cards = nginx.match(/location ~ "(\^\/scryfall\/cards\/[^"]+)"/)?.[1];
  assert.ok(cards, 'location /scryfall/cards/ no nginx');
  const tokens = new RegExp(cards);
  for (const url of ['https://api.scryfall.com/cards/tblb/3?format=image&version=normal', 'https://api.scryfall.com/cards/tust/1?format=image&version=small&face=back'])
    assert.ok(tokens.test(viaMirror(url)), url);
  assert.ok(!re.test(viaMirror('https://api.scryfall.com/cards/tblb/3?format=image&version=normal')), 'a rota das imagens por id não pega as fichas');
  assert.match(nginx, /location ~ "\^\/scryfall-api\/[^"]+" \{\s*allow 127\.0\.0\.1;\s*deny all;/, 'a rota interna só aceita o próprio nginx');
  assert.match(nginx, /proxy_cache_lock on;/);
  assert.match(nginx, /add_header Access-Control-Allow-Origin "\*" always;/, 'CORS for the images host');
  const vite = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8');
  assert.match(vite, /'\/scryfall\/': \{ target: 'https:\/\/cards\.scryfall\.io'/);
  assert.match(vite, /'\/scryfall\/cards\/': \{ target: 'https:\/\/api\.scryfall\.com'/);
});
