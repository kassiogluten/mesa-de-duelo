import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const code = await readFile(new URL('../src/ui/shortInstruction.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { paymentButtonLabels, shortInstruction } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);

const targeting = (message, name) => ({ message, targeting: { card: name ? { name } : undefined } });

test('target requests become a short Portuguese sentence with the source card', () => {
  assert.equal(shortInstruction(targeting('Select target player or planeswalker\n\nEspículo de Lava (5) - Espículo de Lava causa 3 pontos de dano ao jogador alvo.', 'Espículo de Lava')),
    'Escolha um alvo para Espículo de Lava (jogador ou planeswalker).');
  assert.equal(shortInstruction(targeting('Trepadeira de Matavasta (12) - A criatura alvo...\n\nSelect target creature', 'Trepadeira de Matavasta')),
    'Escolha um alvo para Trepadeira de Matavasta (criatura).');
  assert.equal(shortInstruction(targeting('Select any target', 'Raio')), 'Escolha um alvo para Raio.');
  assert.equal(shortInstruction(targeting('Select up to two target creatures you control', 'X')), 'Escolha até 2 alvos para X (criaturas que você controla).');
});

test('the source name falls back to the Forge message, and unknown words drop only the kind', () => {
  assert.equal(shortInstruction(targeting('Raio da Fenda (7) - causa 3\n\nSelect target creature')), 'Escolha um alvo para Raio da Fenda (criatura).');
  assert.equal(shortInstruction(targeting('Select target tapped creature', 'X')), 'Escolha um alvo para X.');
  assert.equal(shortInstruction(targeting('Algo totalmente diferente', 'X')), 'Escolha o alvo de X.');
});

test('engine card names are shown in the table language', () => {
  assert.equal(shortInstruction(targeting('Select target creature', 'Vines of Vastwood'), name => name === 'Vines of Vastwood' ? 'Trepadeira de Matavasta' : name),
    'Escolha um alvo para Trepadeira de Matavasta (criatura).');
});

test('mana payment names the card; other prompts keep the Forge text', () => {
  assert.equal(shortInstruction({ message: 'Sentinela da Urtica - Criatura 2 / 2\n\nPagar Custo de Mana: ', paying: true, card: { name: 'Sentinela da Urtica' } }), 'Pague o custo de mana de Sentinela da Urtica.');
  assert.equal(shortInstruction({ message: 'Relâmpago em Cadeia (134)\n\nRelâmpago em Cadeia (134) -\n\nPagar Custo de Mana: ', paying: true }), 'Pague o custo de mana de Relâmpago em Cadeia.');
  assert.equal(shortInstruction({ message: 'Escolha uma opção' }), null);
});

test('phyrexian mana points at your portrait and counts the life already set aside', () => {
  assert.equal(shortInstruction({ message: '', paying: true, payingFor: 'spell', phyrexianLife: 0, card: { name: 'Gitaxian Probe' } }),
    'Pague o custo de mana de Gitaxian Probe. Toque no seu retrato para pagar 2 de vida por um símbolo phyrexiano.');
  assert.equal(shortInstruction({ message: '', paying: true, payingFor: 'spell', phyrexianLife: 2, card: { name: 'Thundering Tanadon' } }),
    'Pague o custo de mana de Thundering Tanadon. Toque no seu retrato para pagar 2 de vida por um símbolo phyrexiano. Já são 2 de vida.');
  assert.equal(shortInstruction({ message: 'Pagar Custo de Mana: {U/P}', paying: true, payingFor: 'effect', canAutoPay: false, phyrexianLife: 0, card: { name: 'Gitaxian Probe' } }),
    'Gitaxian Probe pede {U/P}. Toque no seu retrato para pagar 2 de vida por um símbolo phyrexiano.');
});

test('a cost asked by an effect names the card asking for it', () => {
  assert.equal(shortInstruction({ message: 'Estudo Rístico (88)\n\nPagar Custo de Mana: {1}', paying: true, payingFor: 'effect', card: { name: 'Rhystic Study' } }, name => name === 'Rhystic Study' ? 'Estudo Rístico' : name),
    'Estudo Rístico pede {1}. Pague ou recuse.');
  assert.equal(shortInstruction({ message: 'Estudo Rístico (88)\n\nPagar Custo de Mana: {1}', paying: true, payingFor: 'effect', canAutoPay: false, card: { name: 'Estudo Rístico' } }),
    'Estudo Rístico pede {1}, e a sua mana não dá para pagar.');
  assert.equal(shortInstruction({ message: 'Estudo Rístico (88)', paying: true, payingFor: 'effect', canAutoPay: true, card: { name: 'Estudo Rístico' } }),
    'Estudo Rístico pede um pagamento de mana. Pague ou recuse.');
  assert.equal(shortInstruction({ message: 'Pagar Custo de Mana: 1', paying: true, payingFor: 'effect' }), 'Pague o custo pedido ou recuse.');
  assert.equal(shortInstruction({ message: '', paying: true, payingFor: 'spell', card: { name: 'Savannah Lions' } }), 'Pague o custo de mana de Savannah Lions.');
});

test('mana payment buttons say what the automatic payment and the cancel do', () => {
  assert.deepEqual(paymentButtonLabels({ payingFor: 'spell', canAutoPay: true, ok: { enabled: true } }), { ok: 'Pagar automaticamente', cancel: 'Desistir da mágica' });
  assert.deepEqual(paymentButtonLabels({ payingFor: 'ability', canAutoPay: false, ok: { enabled: false } }), { ok: 'Mana insuficiente', cancel: 'Desistir da habilidade' });
  assert.deepEqual(paymentButtonLabels({ payingFor: 'effect', canAutoPay: true, ok: { enabled: true } }), { ok: 'Pagar automaticamente', cancel: 'Não pagar' });
  // Na trava curta depois de um clique o botão desliga, mas a mana não acabou.
  assert.equal(paymentButtonLabels({ payingFor: 'spell', canAutoPay: true, ok: { enabled: false } }).ok, 'Pagar automaticamente');
  // Ponte antiga, sem os campos novos: segue o estado do botão e um cancelar genérico.
  assert.deepEqual(paymentButtonLabels({ ok: { enabled: false } }), { ok: 'Mana insuficiente', cancel: 'Desistir' });
});
