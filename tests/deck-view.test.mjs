import test from 'node:test';
import assert from 'node:assert/strict';

const { hypergeometric, between, deckInsights, recommendedLands } = await import('../src/deckView/analysis.ts');
const { CATEGORIES, countCategories } = await import('../src/deckView/functions.ts');
const { newHand, mulligan, putOnBottom, drawCard, expand } = await import('../src/deckView/sampleHand.ts');
const { choosePrint, printTraits, printPrice } = await import('../src/deckView/artChoice.ts');
const { PUBLIC_CODE } = await import('../src/deckView/api.ts');

const category = id => CATEGORIES.find(c => c.id === id);
const has = (id, ...tags) => category(id).test(new Set(tags));

test('as categorias seguem as tags do Tagger, com os acertos de tutor e ritual', () => {
  // Cultivate: busca terreno (tutor-land-*, tutor-to-hand) é ramp, não tutor.
  assert.ok(has('ramp', 'ramp', 'land-ramp', 'tutor-land-basic', 'tutor-to-hand'));
  assert.ok(!has('tutor', 'ramp', 'land-ramp', 'tutor-land-basic', 'tutor-to-hand'));
  // As tags como o servidor manda, com as mães (tutor, tutor-to, tutor-land).
  assert.ok(!has('tutor', 'tutor', 'tutor-land', 'tutor-land-forest', 'tutor-to', 'tutor-to-battlefield', 'land-ramp', 'ramp'));
  assert.ok(has('tutor', 'tutor', 'tutor-creature', 'tutor-to', 'tutor-to-top'));
  // Caminho para o Exílio dá o terreno ao oponente: remoção, não ramp.
  assert.ok(!has('ramp', 'ramp', 'land-ramp', 'donate-rampant-growth', 'removal', 'spot-removal'));
  assert.ok(has('tutor', 'tutor-card', 'tutor-to-hand'));
  // Dark Ritual sozinho não é ramp; Sol Ring é.
  assert.ok(!has('ramp', 'ramp', 'ritual'));
  assert.ok(has('ramp', 'ramp', 'mana-producer'));
  // Cyclonic Rift é remoção e limpa-campo; Wrath of God só limpa-campo.
  assert.ok(has('removal', 'removal', 'spot-removal', 'sweeper') && has('sweeper', 'removal', 'spot-removal', 'sweeper'));
  assert.ok(!has('removal', 'removal', 'sweeper'));
  assert.ok(has('draw', 'card-advantage'));
});

test('a contagem soma as cópias e deixa os terrenos de fora', () => {
  const tags = new Map([['a', ['draw', 'card-advantage']], ['b', ['ramp', 'mana-producer']], ['land', ['ramp', 'land-ramp']]]);
  const rows = [{ name: 'Harmonize', count: 2, oracleId: 'a', land: false }, { name: 'Sol Ring', count: 1, oracleId: 'b', land: false }, { name: 'Krosan Verge', count: 1, oracleId: 'land', land: true }, { name: 'Sem dados', count: 3, land: false }];
  const out = new Map(countCategories(rows, tags).map(c => [c.category.id, c]));
  assert.equal(out.get('draw').count, 2);
  assert.equal(out.get('ramp').count, 1);
  assert.deepEqual(out.get('ramp').cards, [{ name: 'Sol Ring', count: 1 }]);
});

test('a hipergeométrica bate com as contas conhecidas', () => {
  // 17 terrenos em 40: exatamente 3 em 7 é C(17,3)·C(23,4)/C(40,7) = 6021400/18643560.
  assert.ok(Math.abs(hypergeometric(40, 17, 7, 3) - 6021400 / 18643560) < 1e-9);
  let sum = 0; for (let k = 0; k <= 7; k++) sum += hypergeometric(60, 24, 7, k);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.equal(hypergeometric(60, 2, 7, 3), 0);
  assert.ok(Math.abs(between(99, 37, 7, 2, 4) - 0.748) < 0.001);
});

test('a análise avisa terrenos e funções fora da faixa', () => {
  const cat = (id, count) => ({ category: category(id), count, cards: [] });
  const base = { commander: true, library: 99, lands: 30, average: 3.2, cheapHelpers: 0, shortColors: [], unknown: 0,
    categories: [cat('ramp', 3), cat('draw', 12), cat('removal', 6), cat('sweeper', 0)] };
  assert.equal(recommendedLands(base), 40);
  assert.equal(recommendedLands({ ...base, average: 3.4, knownHelpers: false }), 40);
  assert.equal(recommendedLands({ ...base, average: 2, cheapHelpers: 12 }), 34);
  const out = deckInsights(base);
  const titles = out.map(i => `${i.tone}:${i.title}`);
  assert.ok(titles.includes('warn:Poucos terrenos'));
  assert.ok(titles.includes('warn:Ramp abaixo do comum'));
  assert.ok(titles.includes('good:Compra'));
  assert.ok(titles.includes('info:Remoção'));
  assert.ok(titles.includes('warn:Limpa-campo abaixo do comum'));
  assert.ok(out.some(i => i.title === 'Mão inicial'));
  // Sem as funções (servidor fora), a análise de terrenos e da mão continua.
  const without = deckInsights({ ...base, categories: null, lands: 40 });
  assert.ok(without.some(i => i.title === 'Terrenos na medida'));
  assert.ok(!without.some(i => i.title.startsWith('Ramp')));
  // Sem os dados de boa parte das cartas, nada de conta enganosa.
  assert.deepEqual(deckInsights({ ...base, lands: 0, unknown: 90 }).map(i => i.title), ['Esperando os dados das cartas']);
  // Deck de 60: terrenos pela conta proporcional.
  assert.equal(recommendedLands({ commander: false, library: 60, average: 2, cheapHelpers: 0 }), 23);
});

/** Sorteio previsível para os testes. */
const seeded = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const entries = [{ name: 'Island', count: 20 }, { name: 'Opt', count: 20, set: 'xln', cn: '65' }, { name: 'Shock', count: 20 }];

test('mão de teste: 7 cartas, mulligan de Londres e comprar', () => {
  assert.equal(expand(entries).length, 60);
  let h = newHand(entries, false, seeded());
  assert.equal(h.hand.length, 7);
  assert.equal(h.library.length, 53);
  assert.ok(h.hand.some(c => c.name === 'Opt') ? h.hand.find(c => c.name === 'Opt').set === 'xln' : true);
  h = mulligan(h, seeded(2));
  assert.equal(h.hand.length, 7);
  assert.equal(h.toBottom, 1);
  assert.equal(drawCard(h), h, 'não compra antes de pôr no fundo');
  h = putOnBottom(h, h.hand[0].uid);
  assert.equal(h.hand.length, 6);
  assert.equal(h.toBottom, 0);
  assert.equal(h.hand.length + h.library.length + h.bottom.length, 60);
  h = drawCard(h);
  assert.equal(h.hand.length, 7);
  assert.equal(h.draws, 1);
  // No Commander, o primeiro mulligan é grátis.
  const free = mulligan(newHand(entries, true, seeded()), seeded(3));
  assert.equal(free.toBottom, 0);
  assert.equal(mulligan(free, seeded(4)).toBottom, 1);
});

test('trocar a arte grava série e número na linha e junta linhas iguais', () => {
  const deck = { id: 'd', name: 'D', cards: [{ name: 'Lightning Bolt', count: 2 }, { name: 'Lightning Bolt', count: 1, set: 'm10', cn: '146' }], commanders: [{ name: 'Krenko, Mob Boss', count: 1 }] };
  assert.equal(choosePrint(deck, 'cards', 'Lightning Bolt', { set: 'M10', cn: '146' }), 'Lightning Bolt|m10|146');
  assert.deepEqual(deck.cards, [{ name: 'Lightning Bolt', count: 3, set: 'm10', cn: '146' }]);
  assert.equal(choosePrint(deck, 'cards', 'Lightning Bolt|m10|146', { set: 'm10', cn: '146' }), null, 'a mesma não muda nada');
  assert.equal(choosePrint(deck, 'cards', 'Lightning Bolt|m10|146', null), 'Lightning Bolt');
  assert.deepEqual(deck.cards, [{ name: 'Lightning Bolt', count: 3 }]);
  assert.equal(choosePrint(deck, 'commanders', 'Krenko, Mob Boss', { set: 'm13', cn: '139' }), 'Krenko, Mob Boss|m13|139');
  assert.equal(deck.commanders[0].set, 'm13');
  assert.equal(choosePrint(deck, 'sideboard', 'x', null), null);
});

test('o que distingue cada impressão e o preço', () => {
  assert.deepEqual(printTraits({ set: 'x', cn: '1', image: {}, border: 'borderless', frame: ['showcase'], promo: true }), ['Sem borda', 'Vitrine', 'Promo']);
  assert.equal(printPrice({ set: 'x', cn: '1', image: {}, usd: '1234.5' }), 'US$ 1.234,50');
  assert.equal(printPrice({ set: 'x', cn: '1', image: {} }), '');
});

test('o código do link público tem 8 letras sem as parecidas', () => {
  assert.ok(PUBLIC_CODE.test('Ab3kQx9z'));
  for (const bad of ['Ab3kQx9', 'Ab3kQx9zz', 'Ab3kQx9O', 'Ab3kQx91', 'Ab3kQx9l', 'Ab3kQx9I', '../conta']) assert.ok(!PUBLIC_CODE.test(bad), bad);
});
