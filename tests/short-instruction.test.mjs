import test from 'node:test';
import assert from 'node:assert/strict';
const { abilityKindLabel, paymentButtonLabels, poolCost, shortInstruction, spokenMana, targetProgress, validTargetKind } = await import('../src/ui/shortInstruction.ts');

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

test('what can be targeted comes from the engine restrictions when the request cannot be translated', () => {
  assert.equal(validTargetKind(['Creature.OppCtrl']), 'criatura de um oponente');
  assert.equal(validTargetKind(['Creature', 'Player']), 'criatura ou jogador');
  assert.equal(validTargetKind(['Creature.YouCtrl+nonToken', 'Planeswalker.YouCtrl', 'Battle']), 'criatura que você controla, planeswalker que você controla ou batalha');
  assert.equal(validTargetKind(['Card.Creature+YouOwn'], ['Graveyard']), 'criatura num cemitério');
  assert.equal(validTargetKind(['Any']), null);
  assert.equal(validTargetKind(['Emblem']), null);
  assert.equal(validTargetKind(undefined), null);
  const input = { message: 'Select target tapped creature', targeting: { card: { name: 'X' }, valid: ['Creature.tapped'] } };
  assert.equal(shortInstruction(input), 'Escolha um alvo para X (criatura).');
  assert.equal(shortInstruction({ message: 'Algo diferente', targeting: { card: { name: 'X' }, valid: ['Player'] } }), 'Escolha o alvo de X (jogador).');
  assert.equal(shortInstruction({ message: 'Select any target', targeting: { card: { name: 'Raio' }, valid: ['Any'] } }), 'Escolha um alvo para Raio.');
});

test('target progress says how many are missing, how many more fit, or that all are marked', () => {
  assert.equal(targetProgress({ min: 1, max: 1, count: 0 }), 'Falta 1 alvo');
  assert.equal(targetProgress({ min: 2, max: 2, count: 0 }), 'Faltam 2 alvos');
  assert.equal(targetProgress({ min: 1, max: 1, count: 1 }), 'Alvo marcado');
  assert.equal(targetProgress({ min: 2, max: 2, count: 2 }), 'Todos os alvos marcados');
  assert.equal(targetProgress({ min: 0, max: 2, count: 0 }), 'Até 2 alvos');
  assert.equal(targetProgress({ min: 0, max: 3, count: 1 }), 'Pode marcar mais 2 alvos');
  assert.equal(targetProgress({}), null, 'old bridges send no counts');
});

test('only triggers and activated abilities get a highlighted ability label', () => {
  assert.equal(abilityKindLabel('trigger'), 'Gatilho');
  assert.equal(abilityKindLabel('ability'), 'Habilidade');
  assert.equal(abilityKindLabel('spell'), null);
  assert.equal(abilityKindLabel(undefined), null);
});

test('choosing which opponent decides names the card instead of the bare "Seletor:"', () => {
  assert.equal(shortInstruction({ message: 'Seletor:', card: { name: 'Curator of Destinies' } }), 'Curator of Destinies: escolha o oponente que vai decidir.');
  assert.equal(shortInstruction({ message: 'Chooser:' }), 'Escolha o oponente que vai decidir.');
  assert.equal(shortInstruction({ message: 'Seletor: algo mais' }), null);
});

test('the mana still owed shows with its symbols and shrinks with each mana made', () => {
  const pay = (manaCost, extra = {}) => shortInstruction({ message: 'Pagar Custo de Mana: {2}{R}', paying: true, payingFor: 'spell', card: { name: 'Jiboia' }, manaCost, ...extra });
  assert.equal(pay({ remaining: '{2}{R}' }), 'Pague {2}{R} para Jiboia.');
  assert.equal(pay({ remaining: '{2}', total: '{2}{R}' }), 'Falta {2} de {2}{R} para Jiboia.');
  // Uma fonte de duas manas deixa o que não serviu na reserva, à parte do que falta.
  assert.equal(pay({ remaining: '{R}', total: '{2}{R}' }, { reserve: '{G}' }), 'Falta {R} de {2}{R} para Jiboia. Na reserva: {G}.');
  assert.equal(pay({ remaining: '0', total: '{2}{R}' }), 'Custo de Jiboia pago.');
  assert.equal(pay({ remaining: '{3}{R}', x: 3 }), 'Pague {3}{R} para Jiboia (X = 3).');
  // Híbrida aparece como o motor conta.
  assert.equal(pay({ remaining: '{R/G}{R/G}' }), 'Pague {R/G}{R/G} para Jiboia.');
});

test("with K'rrik the portrait pays a {B} with life", () => {
  assert.equal(shortInstruction({ message: '', paying: true, payingFor: 'spell', phyrexianLife: 2, phyrexianLifeBlack: true, card: { name: 'Dark Ritual' } }),
    'Pague o custo de mana de Dark Ritual. Toque no seu retrato para pagar 2 de vida por um {B}. Já são 2 de vida.');
});

test('phyrexian mana keeps the portrait hint and the life set aside goes with the cost', () => {
  const base = { message: '', paying: true, payingFor: 'spell', card: { name: 'Thundering Tanadon' } };
  assert.equal(shortInstruction({ ...base, phyrexianLife: 2, manaCost: { remaining: '{4}{G/P}', total: '{4}{G/P}{G/P}', life: 2 } }),
    'Falta {4}{G/P} de {4}{G/P}{G/P} para Thundering Tanadon. Toque no seu retrato para pagar 2 de vida por um símbolo phyrexiano. Já são 2 de vida.');
  // Sem mais vida para pagar, a vida separada continua dita.
  assert.equal(shortInstruction({ ...base, manaCost: { remaining: '{4}', total: '{4}{G/P}{G/P}', life: 4 } }),
    'Falta {4} de {4}{G/P}{G/P} para Thundering Tanadon. Mais 4 de vida no fim do pagamento.');
});

test('a cost asked by an effect uses the cost the engine counts', () => {
  const leak = (manaCost, extra = {}) => shortInstruction({ message: 'Pagar Custo de Mana: {3}', paying: true, payingFor: 'effect', canAutoPay: true, card: { name: 'Mana Leak' }, manaCost, ...extra }, name => name === 'Mana Leak' ? 'Vazamento de Mana' : name);
  assert.equal(leak({ remaining: '{3}' }), 'Vazamento de Mana pede {3}. Pague ou recuse.');
  assert.equal(leak({ remaining: '{1}', total: '{3}' }), 'Falta {1} de {3} para Vazamento de Mana. Pague ou recuse.');
  assert.equal(leak({ remaining: '{3}' }, { canAutoPay: false }), 'Vazamento de Mana pede {3}. A sua mana não dá para pagar.');
});

test('the mana pool becomes symbols and mana is spoken in words', () => {
  assert.equal(poolCost({ W: 0, U: 0, B: 0, R: 1, G: 2, C: 1 }), '{R}{G}{G}{C}');
  assert.equal(poolCost({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }), '');
  assert.equal(poolCost(undefined), '');
  assert.equal(spokenMana('Pague {2}{R}{R} para Jiboia.'), 'Pague 2 genéricas e 2 vermelhas para Jiboia.');
  assert.equal(spokenMana('Falta {1} de {1}{U}.'), 'Falta 1 genérica de 1 genérica e 1 azul.');
  assert.equal(spokenMana('{4}{G/P}{G/P}'), '4 genéricas e 2 verdes phyrexianas');
  assert.equal(spokenMana('{R/G}'), '1 vermelha ou verde');
  assert.equal(spokenMana('{1}{1}'), '2 genéricas');
  assert.equal(spokenMana('Na reserva: {C}.'), 'Na reserva: 1 incolor.');
});
