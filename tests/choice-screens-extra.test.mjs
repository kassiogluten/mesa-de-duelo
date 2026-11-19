import test from 'node:test';
import assert from 'node:assert/strict';
const { modeRows, modesAsk, printedModes, modeChoiceHTML } = await import('../src/ui/modeChoice.ts');
const { colorKind, colorName, colorChoiceHTML } = await import('../src/ui/colorChoice.ts');
const { typeMatches, firstTypeMatch } = await import('../src/ui/typeChoice.ts');
const { optionalEffect, optionalCostsHTML } = await import('../src/ui/optionalCosts.ts');
const { choiceNotice } = await import('../src/ui/forgeRequest.ts');

const kolaghan = {
  id: 1, method: 'getChoices', kind: 'choose', purpose: 'modes', title: 'Jogador 1 ativou Comando de Kolaghan - Escolha um modo', min: 2, max: 2, modeCount: 4,
  options: [
    { label: '• Devolva o card de criatura alvo de seu cemitério para a sua mão.', modeIndex: 1, valid: ['Creature.YouCtrl'], zones: ['Graveyard'] },
    { label: '• O jogador alvo descarta um card.', modeIndex: 2, valid: ['Player'] },
    { label: '• Comando de Kolaghan causa 2 pontos de dano à criatura ou ao jogador alvo.', modeIndex: 4, valid: ['Any'] },
  ],
  unavailableModes: [{ modeIndex: 3, label: '• Destrua o artefato alvo.', reason: 'target' }],
};
const printed = 'Escolha dois —\n• Devolva o card de criatura alvo do seu cemitério para a sua mão.\n• O jogador alvo descarta um card.\n• Destrua o artefato alvo.\n• Comando de Kolaghan causa 2 pontos de dano a qualquer alvo.';

test('modes come in card order with the printed text, the target and the unavailable ones', () => {
  const rows = modeRows(kolaghan, printed);
  assert.deepEqual(rows.map(r => r.modeIndex), [1, 2, 3, 4]);
  assert.equal(rows[3].text, 'Comando de Kolaghan causa 2 pontos de dano a qualquer alvo.');
  assert.equal(rows[3].option, 2);
  assert.equal(rows[2].off, 'target');
  assert.equal(rows[0].target, 'criatura que você controla num cemitério');
  // Sem o texto impresso (ou com outro número de modos), o texto do Forge sem o marcador.
  assert.equal(modeRows(kolaghan, undefined)[1].text, 'O jogador alvo descarta um card.');
  assert.equal(printedModes(printed, 3), null);
});

test('the mode screen asks for the right number and counts the picks', () => {
  assert.equal(modesAsk(1, 1), 'escolha um modo');
  assert.equal(modesAsk(2, 2), 'escolha dois modos');
  assert.equal(modesAsk(1, 3), 'escolha de 1 a 3 modos');
  const html = modeChoiceHTML(kolaghan, [2], printed, 'Comando de Kolaghan', '{1}{B}{R}');
  assert.match(html, /Comando de Kolaghan: escolha dois modos/);
  assert.match(html, /data-q-opt="2" aria-pressed="true"/);
  assert.match(html, /Sem alvo possível agora/);
  assert.match(html, /1<small>\/ 2<\/small>/);
});

const choose = (title, labels, extra = {}) => ({ id: 2, method: 'getChoices', kind: 'choose', title, min: 1, max: 1, options: labels.map(label => ({ label })), ...extra });
test('colors, protection and basic land types are recognized by their options', () => {
  assert.equal(colorKind(choose('Escolha uma cor', ['WHITE', 'BLUE', 'BLACK', 'RED', 'GREEN'])), 'color');
  assert.equal(colorKind(choose('Escolha a proteção', ['white', 'blue', 'black', 'red', 'green', 'Artifact'])), 'protection');
  assert.equal(colorKind(choose('Escolha um tipo basic land', ['Mountain', 'Swamp', 'Forest', 'Plains', 'Island'])), 'land');
  assert.equal(colorKind(choose('Escolha', ['WHITE', 'Outra coisa'])), null);
  assert.equal(colorKind(choose('Escolha', ['WHITE', 'BLUE'], { max: 2 })), null);
  const html = colorChoiceHTML(choose('Escolha um tipo basic land', ['Mountain', 'Swamp', 'Forest', 'Plains', 'Island']), 'Miragem Convincente');
  // Na ordem branco, azul, preto, vermelho, verde, com o índice da resposta de cada um.
  assert.deepEqual([...html.matchAll(/data-q-opt="(\d)"/g)].map(m => m[1]), ['3', '4', '1', '0', '2']);
  assert.match(html, /Planície/);
  assert.equal(colorName('white'), 'Branco');
});

test('the choice notice names colors and creature types in Portuguese', () => {
  assert.equal(choiceNotice('Jogador 1 escolheu white'), 'Jogador 1 escolheu branco.');
  assert.equal(choiceNotice('Jogador 1 escolheu Zombie'), 'Jogador 1 escolheu Zumbi.');
  assert.equal(choiceNotice('Jogador 1 escolheu Branco'), 'Jogador 1 escolheu Branco');
  assert.equal(choiceNotice('Outra coisa'), 'Outra coisa');
});

test('creature types search in Portuguese or English, with the deck types first', () => {
  const q = { id: 3, kind: 'choose', purpose: 'creature-type', title: 'Escolha um tipo creature', min: 1, max: 1,
    options: [{ label: 'Advisor' }, { label: 'Druid', count: 6 }, { label: 'Elf', count: 14 }, { label: 'Zombie' }] };
  const all = typeMatches(q, '');
  assert.deepEqual(all.mine.map(r => r.pt), ['Elfo', 'Druida']);
  assert.equal(all.rest.length, 4);
  assert.deepEqual(typeMatches(q, 'zumbi').rest.map(r => r.en), ['Zombie']);
  assert.deepEqual(typeMatches(q, 'zomb').rest.map(r => r.pt), ['Zumbi']);
  assert.equal(firstTypeMatch(q, 'el'), 2);
});

test('optional costs show both ways to cast with the total and the kicked effect', () => {
  const q = { id: 4, kind: 'choose', purpose: 'optional-costs', title: 'Selecionar custos opcionais', min: 0, max: 1, cost: { base: '{R}', each: '', available: 3 },
    options: [{ label: 'Kicker – {4}', optional: 'Kicker1', cost: '{4}' }] };
  const rules = 'Explodir em Raios causa 2 pontos de dano a qualquer alvo. Se Explodir em Raios foi reforçado, em vez disso, ele causa 4 pontos de dano àquele alvo.';
  assert.equal(optionalEffect(q.options[0], rules), 'Se Explodir em Raios foi reforçado, em vez disso, ele causa 4 pontos de dano àquele alvo.');
  const html = optionalCostsHTML(q, [], rules, 'Explodir em Raios');
  assert.match(html, /Explodir em Raios: reforçar\?/);
  assert.match(html, /data-q-none><b>Sem reforço/);
  assert.match(html, /data-q-opt="0"><b>Com reforço/);
  assert.match(html, /Falta 2 de mana/);
});
