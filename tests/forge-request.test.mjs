import test from 'node:test';
import assert from 'node:assert/strict';
const { selectionRequest, ptTitle } = await import('../src/ui/forgeRequest.ts');
const { shortInstruction, paymentButtonLabels } = await import('../src/ui/shortInstruction.ts');

test('sacrificing, discarding and removing counters become a Portuguese request with a named button', () => {
  assert.deepEqual(selectionRequest('Édito Diabólico (121)\n - O jogador alvo sacrifica uma criatura.\nEscolha 1 creature(s) a sacrifice.'), { text: 'Sacrifique 1 criatura.', ok: 'Sacrificar' });
  assert.deepEqual(selectionRequest('X\nEscolha até 2 creature(s) a exile.'), { text: 'Exile até 2 criaturas.', ok: 'Exilar' });
  assert.deepEqual(selectionRequest('Ritos da Vila (121)\n - As an additional cost to cast this spell, sacrifice a creature.\nDraw two cards.\nSelecione creature para sacrificar (1 restantes)'),
    { text: 'Para pagar o custo, sacrifique 1 criatura.', ok: 'Sacrificar' });
  assert.deepEqual(selectionRequest('Conduto de Energia (129)\n - texto\nSelect a permanent to remove 1 counter(s) from'),
    { text: 'Para pagar o custo, escolha a permanente de onde sai 1 marcador.', ok: 'Tirar o marcador' });
  assert.deepEqual(selectionRequest('Pilhagem Infiel (121)\n\nDescartar 2 carta(s)'), { text: 'Descarte 2 cartas.', ok: 'Descartar' });
  assert.deepEqual(selectionRequest('Etapa de Limpeza\nEscolha 1 carta(s) para descartar para levar sua mão ao máximo de 7 cartas.'), { text: 'Descarte 1 carta: o máximo na mão é 7.', ok: 'Descartar' });
  assert.deepEqual(selectionRequest('X\nEscolha um(n) artifact or creature para virar (2 restante)'), { text: 'Para pagar o custo, vire 2 artefatos ou criaturas.', ok: 'Virar' });
});

test('unknown requests and unknown type words keep the Forge text', () => {
  assert.equal(selectionRequest('Algo que o Forge pede'), null);
  assert.equal(selectionRequest('X\nEscolha 1 sliver(s) a sacrifice.'), null);
  assert.equal(selectionRequest('X\nEscolha 1 creature(s) a frobnicate.'), null);
});

test('a counterspell target on the stack names what to touch', () => {
  assert.equal(shortInstruction({ message: 'Select target spell', selectableStacks: [210], card: { name: 'Mana Leak' } }, n => n === 'Mana Leak' ? 'Vazamento de Mana' : n),
    'Escolha na pilha a mágica alvo de Vazamento de Mana.');
});

test('cumulative upkeep says what is paid and what happens without paying', () => {
  const input = { message: 'Cumulative upkeep for Rêmora Mística (129)\nRêmora Mística (129) - \n\nPagar Custo de Mana: {2}', paying: true, payingFor: 'effect', canAutoPay: true, manaCost: { remaining: '{2}' }, card: { name: 'Rêmora Mística' }, ok: { enabled: true } };
  assert.equal(shortInstruction(input), 'Manutenção cumulativa: pague {2} para manter Rêmora Mística no campo. Sem pagar, ela é sacrificada.');
  assert.equal(shortInstruction({ ...input, manaCost: { remaining: '{1}', total: '{4}' } }), 'Manutenção cumulativa: falta {1} de {4} para manter Rêmora Mística no campo. Sem pagar, ela é sacrificada.');
  assert.equal(paymentButtonLabels(input).cancel, 'Não pagar e sacrificar');
  assert.equal(paymentButtonLabels({ ...input, message: 'Estudo pede {1}' }).cancel, 'Não pagar');
});

test('Fireball-like requests count the targets from the choice limits', () => {
  assert.equal(shortInstruction({ message: 'Bola de Fogo (121) - texto\n\nSelect any target\n(5 more can be targeted)', targeting: { card: { name: 'Bola de Fogo' }, min: 0, max: 5 } }),
    'Escolha até 5 alvos para Bola de Fogo.');
});

test('English choice titles get a Portuguese title', () => {
  assert.equal(ptTitle('Select a card to put onto the battlefield'), 'Escolha a carta que vai para o campo de batalha');
  assert.equal(ptTitle('Escolha uma carta'), 'Escolha uma carta');
});
