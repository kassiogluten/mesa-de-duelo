import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const prices = await import('../src/cardPrices.ts');
const { priceHTML } = await import('../src/ui/cardInspector.ts');
const today = new Date(2026, 10, 26);

test('o nome da carta vira a chave da base de preços (a mesma normalização do scraper)', () => {
  assert.equal(prices.priceKey('Delver of Secrets'), 'delver of secrets');
  assert.equal(prices.priceKey('Æther Vial'), 'aether vial');
  assert.equal(prices.priceKey('Lim-Dûl’s Vault'), "lim-dul's vault");
  assert.equal(prices.priceKey('  Bonecrusher   Giant // Stomp '), 'bonecrusher giant // stomp');
});

test('a carta é achada pelo nome inteiro ou pela primeira face, e a cotação de mais de 30 dias fica antiga', () => {
  prices.setCardPrices({ fonte: 'x', cartas: { 'counterspell': [9.84, '2026-11-25'], 'bonecrusher giant // stomp': [3.5, '2026-10-01'] } });
  assert.deepEqual(prices.cardPrice('Counterspell', today), { brl: 9.84, date: '2026-11-25', stale: false });
  assert.equal(prices.cardPrice('Bonecrusher Giant', today)?.brl, 3.5);
  assert.equal(prices.cardPrice('Bonecrusher Giant // Stomp', today)?.stale, true);
  assert.equal(prices.cardPrice('Black Lotus', today), null);
  assert.equal(prices.cardPrice(undefined, today), null);
  assert.equal(prices.brlText(1234.5), 'R$ 1.234,50');
});

test('os detalhes da carta mostram o menor preço com a data, e nada na ficha ou na carta sem cotação', () => {
  prices.setCardPrices({ fonte: 'x', cartas: { 'counterspell': [9.84, '2026-11-25'], 'old card': [1, '2026-09-01'] } });
  const html = priceHTML({ name: 'Counterspell' }, today);
  assert.match(html, /A partir de R\$\s9,84<\/strong> na LigaMagic · 25\/11\/2026/);
  assert.doesNotMatch(html, /cotação antiga/);
  assert.match(priceHTML({ name: 'Old Card' }, today), /ci-price-stale.*cotação antiga/);
  assert.equal(priceHTML({ name: 'Counterspell', token: true }, today), '');
  assert.equal(priceHTML({ name: 'Black Lotus' }, today), '');
});

test('o arquivo de preços tem o formato que a mesa lê', () => {
  const file = JSON.parse(readFileSync(new URL('../shared/card-prices-brl.json', import.meta.url), 'utf8'));
  assert.equal(typeof file.fonte, 'string');
  const entries = Object.entries(file.cartas);
  assert.ok(entries.length > 1000);
  for (const [key, [brl, date]] of entries) {
    assert.equal(prices.priceKey(key), key, key);
    assert.ok(typeof brl === 'number' && brl >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(date), key);
  }
});
