import { test } from 'node:test';
import assert from 'node:assert/strict';

const { isCardImage, smallOf } = await import('../src/ui/imageLoading.ts');
const { faceHTML } = await import('../src/ui/face.ts');
const ID = '6/a/6a0b230b-d391-4998-a3f7-7b158a0ec2cd.jpg?1783909057';

test('só as imagens de carta (Scryfall ou o nosso cache dele) ganham carregando', () => {
  assert.ok(isCardImage(`https://cards.scryfall.io/normal/front/${ID}`));
  assert.ok(isCardImage(`/scryfall/normal/front/${ID}`));
  assert.ok(isCardImage(`https://img.mesao.online/scryfall/art_crop/front/${ID}`));
  assert.ok(!isCardImage('https://lh3.googleusercontent.com/a/foto'));
  assert.ok(!isCardImage('/novidades/0.181.0/x.webp'));
  assert.ok(!isCardImage(undefined));
});

test('a small vem da normal ou da large, no mesmo lugar; a small e a arte recortada não têm outra', () => {
  assert.equal(smallOf(`/scryfall/normal/front/${ID}`), `/scryfall/small/front/${ID}`);
  assert.equal(smallOf(`https://cards.scryfall.io/large/back/${ID}`), `https://cards.scryfall.io/small/back/${ID}`);
  assert.equal(smallOf(`/scryfall/small/front/${ID}`), undefined);
  assert.equal(smallOf(`/scryfall/art_crop/front/${ID}`), undefined);
  assert.equal(smallOf('https://example.com/normal/x.jpg'), undefined);
});

test('o esboço da carta tem nome, custo, janela da arte vazia, tipo, texto e P/R', () => {
  const html = faceHTML({ name: 'Llanowar Elves', manaCost: '{G}', typeLine: 'Criatura — Elfo Druida', creature: true, power: 1, toughness: 1, color: 'G', image: `/scryfall/normal/front/${ID}`, text: '{T}: Adicione {G}.' });
  assert.match(html, /class="fb-art"><\/div>/);
  assert.match(html, /class="fb-text">[^<]*<span class="pip/);
  assert.match(html, /class="fb-pt">1\/1</);
});
