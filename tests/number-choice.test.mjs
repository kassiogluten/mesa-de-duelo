import test from 'node:test';
import assert from 'node:assert/strict';
const n = await import('../src/ui/numberChoice.ts');

const fireball = (extra = {}) => ({
  id: 3, method: 'getChoices', kind: 'number', title: 'Escolha X para Fireball', min: 0, unit: 'x', cancel: 'spell',
  cost: { base: '{R}', each: '{1}', available: 8 }, ...extra,
});
const RULES = 'This spell costs {1} more to cast for each target beyond the first.\nFireball deals X damage divided evenly, rounded down, among any number of targets.';

test('o número fica na faixa: sem teto, só o mínimo segura; texto inválido vira o menor', () => {
  assert.equal(n.clampNumber(fireball(), -3), 0);
  assert.equal(n.clampNumber(fireball(), 250), 250);
  assert.equal(n.clampNumber(fireball({ min: 1, max: 10 }), 12), 10);
  assert.equal(n.numberValue(fireball(), ''), 0);
  assert.equal(n.numberValue(fireball(), 'abc'), 0);
  assert.equal(n.numberValue(fireball({ min: 1, max: 10 }), '7'), 7);
});

test('o custo soma a mana genérica e repete o custo de cada vez', () => {
  assert.deepEqual(n.numberCost({ base: '{R}', each: '{1}' }, 4), { symbols: ['4', 'R'], mana: 5 });
  assert.deepEqual(n.numberCost({ base: '{R}', each: '{1}' }, 0), { symbols: ['R'], mana: 1 });
  assert.deepEqual(n.numberCost({ base: '{1}{G}', each: '{1}{G}' }, 2), { symbols: ['3', 'G', 'G', 'G'], mana: 6 });
  assert.deepEqual(n.numberCost({ base: '', each: '{2}' }, 0), { symbols: ['0'], mana: 0 });
});

test('o que dá para pagar desconta o resto do custo e respeita a faixa', () => {
  assert.equal(n.affordable(fireball()), 7);
  assert.equal(n.affordable(fireball({ cost: { base: '{R}', each: '{1}', available: 0 } })), 0, 'nunca abaixo do mínimo');
  assert.equal(n.affordable(fireball({ max: 3 })), 3);
  assert.equal(n.affordable(fireball({ cost: { base: '{1}{G}', each: '{1}{G}', available: 7 } })), 2);
  assert.equal(n.affordable(fireball({ cost: undefined })), null);
  assert.equal(n.affordable(fireball({ cost: { base: '{R}', each: '{1}' } })), null, 'sem estimativa da mana');
});

test('a frase do X troca o X pelo número, sem mexer nos símbolos de mana nem em palavras', () => {
  assert.equal(n.xEffect(RULES, 4), 'Fireball deals 4 damage divided evenly, rounded down, among any number of targets.');
  assert.equal(n.xEffect('Bola de Fogo causa X pontos de dano divididos igualmente.', 0), 'Bola de Fogo causa 0 pontos de dano divididos igualmente.');
  assert.equal(n.xEffect('{X}{U}{U}: Xenagos draws a card.', 3), null);
  assert.equal(n.xEffect('Draw X cards. Then discard X cards.', 2), 'Draw 2 cards.');
  assert.equal(n.xEffect(undefined, 2), null);
});

test('o botão de confirmar diz o que vai acontecer', () => {
  assert.equal(n.confirmLabel(fireball(), 4), 'Confirmar X = 4');
  assert.equal(n.confirmLabel(fireball({ unit: 'times' }), 0), 'Não pagar');
  assert.equal(n.confirmLabel(fireball({ unit: 'times' }), 1), 'Pagar 1 vez');
  assert.equal(n.confirmLabel(fireball({ unit: 'times' }), 3), 'Pagar 3 vezes');
  assert.equal(n.confirmLabel(fireball({ unit: undefined }), 6), 'Confirmar 6');
});

test('a janela: contador, atalhos, custo e cancelar; acima da mana, avisa quanto falta', () => {
  const html = n.numberChoiceHTML(fireball(), '4', '', RULES);
  assert.match(html, /id="fQNumber"[^>]*value="4"/);
  assert.match(html, /data-num-set="0"[^>]*>Mín 0/);
  assert.match(html, /data-num-set="7"[^>]*>O que dá para pagar \(7\)/);
  assert.match(html, /Cancelar mágica/);
  assert.match(html, /Fireball deals 4 damage/);
  assert.match(html, /Confirmar X = 4/);
  assert.doesNotMatch(html, /data-num-add="-1"[^>]*disabled/);

  const over = n.numberPreviewHTML(fireball(), 9, RULES);
  assert.match(over, /class="num-preview over"/);
  assert.match(over, /Falta 2 de mana: você tem 8 disponível\./);
  assert.equal((over.match(/class="lack"/g) ?? []).length, 2);

  const start = n.numberChoiceHTML(fireball(), '', '', RULES);
  assert.match(start, /data-num-add="-1"[^>]*disabled/, 'no mínimo, o − fica apagado');
});

test('sem teto nem custo há o +10; com teto, o máximo; números soltos viram fichas', () => {
  const talion = { id: 4, method: 'getChoices', kind: 'number', title: 'Escolha um número', min: 1, max: 10 };
  const finite = n.numberChoiceHTML(talion, '', '', undefined);
  assert.match(finite, /De 1 a 10/);
  assert.match(finite, /data-num-set="10"[^>]*>Máx 10/);
  assert.doesNotMatch(finite, /data-q-none/, 'sem como desistir');
  assert.doesNotMatch(finite, /num-preview/);

  const open = n.numberChoiceHTML({ ...talion, min: 0, max: undefined }, '', '', undefined);
  assert.match(open, /A partir de 0/);
  assert.match(open, /data-num-add="10"/);

  const loose = n.numberChoiceHTML({ ...talion, values: [2, 4, 6] }, '', '', undefined);
  assert.equal((loose.match(/data-num-pick=/g) ?? []).length, 3);
  assert.doesNotMatch(loose, /fQNumber/);
});

test('quantas vezes pagar: o título mostra os símbolos de mana', () => {
  const html = n.numberChoiceHTML({ id: 5, method: 'getChoices', kind: 'number', title: 'Quantas vezes pagar {1}{G}?', min: 0, unit: 'times', cost: { base: '{1}{G}', each: '{1}{G}', available: 6 } }, '2', '', undefined);
  assert.match(html, /<h2>Quantas vezes pagar <span class="pip pip-1"/);
  assert.match(html, /Pagar 2 vezes/);
  assert.match(html, /Você tem 6 de mana disponível\./);
});

test('o título troca o nome da carta em inglês pelo que a mesa mostra', () => {
  const html = n.numberChoiceHTML(fireball(), '0', '', RULES, ['Fireball', 'Bola de Fogo']);
  assert.match(html, /<h2>Escolha X para Bola de Fogo<\/h2>/);
});
