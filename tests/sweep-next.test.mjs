import test from 'node:test';
import assert from 'node:assert/strict';
const { evenAmounts, stepAmount, lethalOf, amountChoiceHTML } = await import('../src/ui/amountChoice.ts');
const { evenSplit, extraPerTarget, totalCost } = await import('../src/ui/divideTargets.ts');
const { slotsOf, pickDestination, splitDestinationsHTML } = await import('../src/ui/splitDestinations.ts');
const { pilesNotice, rememberPiles } = await import('../src/ui/forgeRequest.ts');
const { revealTitle, noneLabel } = await import('../src/ui/questionView.ts');
const { rememberTopOrder, shuffleAfterOrder } = await import('../src/ui/libraryShuffle.ts');
const { stackEffectText } = await import('../src/ui/stackView.ts');

const bear = { id: 139, name: 'Grizzly Bears', creature: true, toughness: 2, damage: 0 };
const elf = { id: 140, name: 'Llanowar Elves', creature: true, toughness: 1 };
const forked = { id: 5, kind: 'amount', title: 'Distribua o total entre as opções', total: 2, amountOf: 'damage', card: { id: 121, name: 'Forked Bolt' },
  options: [{ kind: 'card', card: bear, label: 'Ursos Cinzentos (139)', min: 1, max: 2 }, { kind: 'card', card: elf, label: 'Elfos de Llanowar (140)', min: 1, max: 2 }] };

test('divided damage starts evenly, steps within the limits and says what dies', () => {
  assert.deepEqual(evenAmounts(forked), [1, 1]);
  assert.deepEqual(evenAmounts({ ...forked, total: 3, options: forked.options.map(o => ({ ...o, min: 0, max: 3 })) }), [2, 1]);
  assert.deepEqual(stepAmount(forked, [1, 1], 0, 1), [1, 1], 'nada sobra para pôr');
  assert.deepEqual(stepAmount(forked, [1, 1], 0, -1), [1, 1], 'o mínimo de cada alvo é 1');
  assert.equal(lethalOf(bear), 2);
  assert.equal(lethalOf({ ...bear, damage: 1 }), 1);
  const html = amountChoiceHTML({ face: c => `<i>${c.name}</i>`, label: c => c.name, players: [] }, forked, [1, 1]);
  assert.match(html, /Forked Bolt: divida 2 de dano/);
  assert.match(html, /Morre com 2/);
  assert.match(html, /Morre ✓/);
  assert.match(html, /Tudo dividido\./);
});

test('Fireball says the damage of each target and the cost with the extra targets', () => {
  assert.equal(extraPerTarget('This spell costs {1} more to cast for each target beyond the first.\nFireball deals X damage'), '{1}');
  assert.equal(extraPerTarget('Bola de Fogo custa {1} a mais para ser conjurada para cada alvo após o primeiro.'), '{1}');
  assert.deepEqual(totalCost('{X}{R}', 4, '{1}', 1), { cost: '{5}{R}', mana: 6 });
  const t = { source: 1, divideEvenly: { amount: 5, x: 5, available: 6 }, count: 2 };
  const split = evenSplit(t, '{X}{R}', 'This spell costs {1} more to cast for each target beyond the first.');
  assert.equal(split.line, '2 alvos: 2 de dano em cada. Sobra 1, que se perde.');
  assert.equal(split.cost, '{6}{R}');
  assert.equal(split.lack, 1);
  assert.equal(evenSplit({ source: 1 }, '{R}', ''), null);
});

test('Cultivate fills the battlefield slot first and the rest goes to the hand', () => {
  const q = { id: 6, kind: 'choose', purpose: 'split-destinations', title: 'Escolha até 2 cartas de seu grimório', min: 0, max: 2,
    destinations: [{ zone: 'Battlefield', count: 1, tapped: true }, { zone: 'Hand' }],
    options: [{ kind: 'card', card: { id: 1, name: 'Forest' }, label: 'Floresta' }, { kind: 'card', card: { id: 2, name: 'Island' }, label: 'Ilha' }] };
  assert.deepEqual(slotsOf(q), ['Campo (virado)', 'Mão']);
  const picked = [];
  pickDestination(q, picked, 1); pickDestination(q, picked, 0);
  assert.deepEqual(picked, [1, 0]);
  pickDestination(q, picked, 1);
  assert.deepEqual(picked, [0], 'tocar de novo tira a carta, e a outra sobe');
  const html = splitDestinationsHTML({ face: c => c.name, label: c => c.name }, q, [1]);
  assert.match(html, /Campo \(virado\)<\/b><span class="dest-face">Island/);
  assert.match(html, /Não procurar/);
});

test('the Fact or Fiction notice names both piles and where they went', () => {
  const q = { id: 7, kind: 'choose', purpose: 'piles-choose', title: 'Escolha uma pilha', card: { id: 1, name: 'Fact or Fiction' }, chosenTo: 'hand', otherTo: 'graveyard',
    piles: [{ option: 0, size: 2, cards: [1, 2] }, { option: 3, size: 3, cards: [4, 5, 6] }],
    options: ['', 'Plains', 'Island', '', 'Swamp', 'Mountain', 'Forest'].map(name => ({ label: name, card: { name } })) };
  rememberPiles(q, 0);
  const pt = { Plains: 'Planície', Island: 'Ilha', Swamp: 'Pântano', Mountain: 'Montanha', Forest: 'Floresta', 'Fact or Fiction': 'Fato ou Ficção' };
  const n = pilesNotice('valor do efeito de Fato ou Ficção para Jogador 1 é Jogador 1 escolhe a Pilha 1:\nPlains\nIsland\n', name => pt[name] ?? name);
  assert.equal(n.title, 'Fato ou Ficção');
  assert.equal(n.text, 'Jogador 1 ficou com o monte de 2 (Planície e Ilha) para a mão. Pântano, Montanha e Floresta vão para o cemitério.');
  assert.deepEqual(n.cards, ['Plains', 'Island']);
  // Sem a escolha guardada (quem dividiu os montes), só o monte escolhido.
  assert.equal(pilesNotice('valor do efeito de Fato ou Ficção para Jogador 1 é Jogador 1 escolhe a Pilha 2:\nSwamp\n', name => pt[name] ?? name).text, 'Jogador 1 ficou com o monte de 1 (Pântano).');
  assert.equal(pilesNotice('Outra coisa'), null);
});

test('buttons and titles say what they do', () => {
  assert.equal(revealTitle('Fato ou Ficção - Revelando cartas de seu grimório'), 'Fato ou Ficção: cartas reveladas do seu grimório');
  assert.equal(revealTitle('X - Revelando cartas da mão de Ana'), 'X: cartas reveladas da mão de Ana');
  assert.equal(noneLabel({ title: 'Escolha a carta de seu grimório', max: 1 }), 'Não procurar');
  assert.equal(noneLabel({ title: 'Escolha uma criatura', max: 1 }), 'Não escolher');
});

test('Ponder shows the cards just put on top when asking to shuffle', () => {
  const card = { id: 1, name: 'Ponder' };
  const q = { id: 8, kind: 'order', title: 'Escolha a ordem das cartas para inserir no grimório', card, options: ['Plains', 'Island', 'Swamp'].map((name, i) => ({ label: name, card: { id: 10 + i, name } })) };
  rememberTopOrder(q, [1, 0, 2]);
  const state = { question: undefined, input: { priority: false, message: 'Quer embaralhar o grimório?', card } };
  assert.deepEqual(shuffleAfterOrder(state).map(c => c.name), ['Island', 'Plains', 'Swamp']);
  assert.equal(shuffleAfterOrder({ ...state, input: { ...state.input, card: { name: 'Outra' } } }), null);
  assert.equal(shuffleAfterOrder({ ...state, input: { ...state.input, message: 'Outra pergunta' } }), null);
});

test('stack items read the printed Portuguese text of a spell', () => {
  const v = { ptText: name => (name === 'Faithless Looting' ? 'Compre dois cards e depois descarte dois cards.' : undefined) };
  assert.equal(stackEffectText(v, { id: 1, text: 'Pilhagem Infiel (121) - Jogador 1 draws two cards.', kind: 'spell', source: { name: 'Faithless Looting' } }), 'Compre dois cards e depois descarte dois cards.');
  assert.equal(stackEffectText(v, { id: 2, text: 'Raio (5) - Raio deals 3 damage.', kind: 'spell', source: { name: 'Bolt' } }), 'Raio deals 3 damage.');
  assert.equal(stackEffectText(v, { id: 3, text: 'Algo (9) - habilidade', kind: 'ability', source: { name: 'Faithless Looting' } }), 'habilidade');
});

test('an activated ability reads its own line of the Portuguese card text, without the paid cost', () => {
  const pt = 'Suspender 10 — {R}\nSacrifique um artefato, uma criatura ou um terreno: Remova um marcador temporal de Gargadonte Maior. Ative somente se Gargadonte Maior estiver suspenso.';
  const v = { ptText: name => (name === 'Greater Gargadon' ? pt : undefined) };
  const source = { name: 'Greater Gargadon', text: 'Suspend 10—{R}\r\n\r\nSacrifice an artifact, creature, or land: Remove a time counter from Greater Gargadon. Activate only if Greater Gargadon is suspended.' };
  const item = { id: 7, text: 'Gargadonte Maior (121) - Remove 1 Time counter fromGargadonte Maior (121).', kind: 'ability', line: 1, source };
  assert.equal(stackEffectText(v, item), 'Remova um marcador temporal de Gargadonte Maior. Ative somente se Gargadonte Maior estiver suspenso.');
  assert.equal(stackEffectText(v, { ...item, line: undefined }), 'Remove 1 Time counter fromGargadonte Maior (121).', 'sem a linha, fica a do servidor');
  assert.equal(stackEffectText(v, { ...item, source: { ...source, text: 'Sacrifice an artifact, creature, or land: Remove a time counter.' } }), 'Remove 1 Time counter fromGargadonte Maior (121).', 'linhas diferentes: não arrisca');
  assert.equal(stackEffectText({ ptText: () => undefined }, item), 'Remove 1 Time counter fromGargadonte Maior (121).', 'sem texto em português');
});
