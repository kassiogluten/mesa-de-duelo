// Página de teste da mesa: as escolhas com tela própria do item 142 (modos, cor, tipo de criatura, custos opcionais) e os pedidos da caixa de ação que vinham em inglês (sacrificar, manutenção cumulativa, alvo na pilha).
import { cachePut } from '../../src/scryfall';
import { rememberPiles } from '../../src/ui/forgeRequest';
import { rememberTopOrder } from '../../src/ui/libraryShuffle';

type View = { render(): void; notice(text: string): void };
/** O nome e o texto em português das cartas destas escolhas, como a mesa os teria depois de buscar a carta. */
const PT: [string, string, string?][] = [
  ["Kolaghan's Command", 'Comando de Kolaghan', 'Escolha dois —\n• Devolva o card de criatura alvo do seu cemitério para a sua mão.\n• O jogador alvo descarta um card.\n• Destrua o artefato alvo.\n• Comando de Kolaghan causa 2 pontos de dano a qualquer alvo.'],
  ['Izzet Charm', 'Amuleto Izzet', 'Escolha um —\n• Anule a mágica alvo que não seja de criatura, a menos que seu controlador pague {2}.\n• Amuleto Izzet causa 2 pontos de dano à criatura alvo.\n• Compre dois cards e depois descarte dois cards.'],
  ["Painter's Servant", 'Servo do Pintor'], ["Apostle's Blessing", 'Bênção do Apóstolo'], ['Convincing Mirage', 'Miragem Convincente'], ['Cavern of Souls', 'Caverna das Almas'],
  ['Burst Lightning', 'Explodir em Raios', 'Reforço {4}\nExplodir em Raios causa 2 pontos de dano a qualquer alvo. Se Explodir em Raios foi reforçado, em vez disso, ele causa 4 pontos de dano àquele alvo.'],
  ['Mystic Remora', 'Rêmora Mística'], ['Mana Leak', 'Vazamento de Mana'], ['Diabolic Edict', 'Édito Diabólico'],
  ['Arc Lightning', 'Raio em Arco'], ['Fireball', 'Bola de Fogo', 'Esta mágica custa {1} a mais para ser conjurada para cada alvo após o primeiro.\nBola de Fogo causa X pontos de dano divididos igualmente, arredondados para baixo, entre qualquer número de alvos.'],
  ['Cultivate', 'Cultivar'], ['Wood Elves', 'Elfos da Floresta'], ['Fact or Fiction', 'Fato ou Ficção'], ['Ponder', 'Ponderar'],
  ['Faithless Looting', 'Pilhagem Infiel', 'Compre dois cards e depois descarte dois cards.\nRetrospectiva {2}{R}'],
  ['Forest', 'Floresta'], ['Island', 'Ilha'], ['Plains', 'Planície'], ['Swamp', 'Pântano'], ['Mountain', 'Montanha'], ['Grizzly Bears', 'Ursos Cinzentos'], ['Llanowar Elves', 'Elfos de Llanowar'],
];
for (const [name, pt, text] of PT) cachePut({ name, pt: { name: pt, text } } as any);
const card = (id: number, name: string, controller: number, extra = {}) => ({ id, name, controller, tapped: false, token: false, manaCost: '', typeLine: 'Instant', ...extra });

export function choiceScreens(state: any, view: View) {
  const ask = (question: any) => { state.question = question; view.render(); };
  return {
    /** Comando de Kolaghan, escolha dois: o modo de destruir artefato sem alvo. */
    modes(which: 'two' | 'one' = 'two') {
      if (which === 'one') {
        return ask({ id: 700, method: 'getChoices', kind: 'choose', purpose: 'modes', title: 'Jogador 1 ativou Amuleto Izzet - Escolha um modo', min: 1, max: 1, modeCount: 3,
          card: card(701, 'Izzet Charm', 10, { manaCost: '{U}{R}' }), options: [
            { label: 'Amuleto Izzet deals 2 damage to target creature.', modeIndex: 2, valid: ['Creature'] },
            { label: 'Draw two cards, then discard two cards. ', modeIndex: 3 }],
          unavailableModes: [{ modeIndex: 1, label: 'Counter target noncreature spell unless its controller pays {2}.', reason: 'target' }] });
      }
      ask({ id: 702, method: 'getChoices', kind: 'choose', purpose: 'modes', title: 'Jogador 1 ativou Comando de Kolaghan - Escolha um modo', min: 2, max: 2, modeCount: 4,
        card: card(703, "Kolaghan's Command", 10, { manaCost: '{1}{B}{R}' }), options: [
          { label: '• Devolva o card de criatura alvo de seu cemitério para a sua mão.', modeIndex: 1, valid: ['Creature.YouCtrl'], zones: ['Graveyard'] },
          { label: '• O jogador alvo descarta um card.', modeIndex: 2, valid: ['Player'] },
          { label: '• Comando de Kolaghan causa 2 pontos de dano à criatura ou ao jogador alvo.', modeIndex: 4, valid: ['Any'] }],
        unavailableModes: [{ modeIndex: 3, label: '• Destrua o artefato alvo.', reason: 'target' }] });
    },
    /** Cor (Painter's Servant), proteção (Apostle's Blessing) ou tipo de terreno básico (Convincing Mirage). */
    color(which: 'color' | 'protection' | 'land' = 'color') {
      const labels = which === 'color' ? ['WHITE', 'BLUE', 'BLACK', 'RED', 'GREEN'] : which === 'protection' ? ['white', 'blue', 'black', 'red', 'green', 'Artifact'] : ['Mountain', 'Swamp', 'Forest', 'Plains', 'Island'];
      const source = which === 'color' ? card(710, "Painter's Servant", 10, { manaCost: '{2}', typeLine: 'Artifact Creature — Scarecrow' })
        : which === 'protection' ? card(711, "Apostle's Blessing", 10, { manaCost: '{1}{W/P}' }) : card(712, 'Convincing Mirage', 10, { manaCost: '{1}{U}', typeLine: 'Enchantment — Aura' });
      ask({ id: 713, method: 'getChoices', kind: 'choose', title: which === 'color' ? 'Escolha uma cor' : which === 'protection' ? 'Escolha a proteção' : 'Escolha um tipo basic land',
        min: 1, max: 1, card: source, options: labels.map(label => ({ label })) });
    },
    /** Cavern of Souls com um deck de elfos. */
    creatureType() {
      const all = ['Advisor', 'Angel', 'Archer', 'Assassin', 'Barbarian', 'Beast', 'Bird', 'Cat', 'Cleric', 'Construct', 'Demon', 'Dinosaur', 'Dragon', 'Druid', 'Elemental', 'Elf', 'Faerie', 'Giant', 'Goblin',
        'Human', 'Hydra', 'Knight', 'Merfolk', 'Rogue', 'Shaman', 'Sliver', 'Soldier', 'Spirit', 'Vampire', 'Warrior', 'Wizard', 'Wolf', 'Zombie'];
      const counts: Record<string, number> = { Elf: 14, Druid: 6, Warrior: 3, Shaman: 2 };
      ask({ id: 720, method: 'getChoices', kind: 'choose', purpose: 'creature-type', title: 'Escolha um tipo creature', min: 1, max: 1,
        card: card(721, 'Cavern of Souls', 10, { typeLine: 'Land', land: true }), options: all.map(label => (counts[label] ? { label, count: counts[label] } : { label })) });
    },
    /** Burst Lightning com reforço; `lands`: a mana disponível. */
    kicker(lands = 5) {
      ask({ id: 730, method: 'getChoices', kind: 'choose', purpose: 'optional-costs', title: 'Selecionar custos opcionais', min: 0, max: 1, cost: { base: '{R}', each: '', available: lands },
        card: card(731, 'Burst Lightning', 10, { manaCost: '{R}', text: 'Kicker {4}\nBurst Lightning deals 2 damage to any target. If this spell was kicked, it deals 4 damage instead.' }),
        options: [{ label: 'Kicker – {4}', optional: 'Kicker1', cost: '{4}' }] });
    },
    /** Raio em Arco dividindo 3 de dano entre Grizzly Bears e Llanowar Elves. */
    divide() {
      const bear = card(801, 'Grizzly Bears', 23, { manaCost: '{1}{G}', typeLine: 'Creature — Bear', creature: true, power: 2, toughness: 2 });
      const elf = card(802, 'Llanowar Elves', 23, { manaCost: '{G}', typeLine: 'Creature — Elf Druid', creature: true, power: 1, toughness: 1 });
      ask({ id: 800, method: 'assignGenericAmount', kind: 'amount', title: 'Distribua o total entre as opções', total: 3, amountOf: 'damage', card: card(803, 'Arc Lightning', 10, { manaCost: '{2}{R}' }),
        options: [{ kind: 'card', card: bear, label: 'Ursos Cinzentos (801)', min: 1, max: 3 }, { kind: 'card', card: elf, label: 'Elfos de Llanowar (802)', min: 1, max: 3 }] });
    },
    /** Bola de Fogo com X = 4 e dois alvos marcados (uma criatura e o oponente). */
    fireball() {
      state.question = undefined;
      const fb = card(810, 'Fireball', 10, { manaCost: '{X}{R}', typeLine: 'Sorcery', text: 'This spell costs {1} more to cast for each target beyond the first.\nFireball deals X damage divided evenly, rounded down, among any number of targets.' });
      const target = state.players[1].battlefield[0].id;
      Object.assign(state.input, { gen: state.input.gen + 1, priority: false, message: 'Bola de Fogo (810) - Bola de Fogo custa {1} a mais para ser conjurada para cada alvo após o primeiro.\n\nSelect any target\n(3 more can be targeted)',
        ok: { label: 'OK', enabled: true }, cancel: { label: 'Cancelar', enabled: true }, selectable: state.players[1].battlefield.map((c: any) => c.id), selectablePlayers: [10, 23], selectableStacks: [], actionable: [],
        card: fb, targeting: { source: 810, card: fb, kind: 'spell', min: 0, max: 5, count: 2, cards: [target], players: [23], valid: ['Any'], divideEvenly: { amount: 4, x: 4, available: 6 } } });
      view.render();
    },
    /** Cultivate: os terrenos básicos achados e os dois destinos. */
    cultivate(picked = 0) {
      const names = ['Forest', 'Forest', 'Island', 'Plains', 'Mountain', 'Swamp'];
      ask({ id: 820, method: 'chooseEntitiesForEffect', kind: 'choose', purpose: 'split-destinations', title: 'Escolha até 2 cartas de seu grimório', min: 0, max: 2,
        destinations: [{ zone: 'Battlefield', count: 1, tapped: true }, { zone: 'Hand' }], card: card(821, 'Cultivate', 10, { manaCost: '{2}{G}', typeLine: 'Sorcery' }),
        options: names.map((name, i) => ({ kind: 'card', label: name, card: card(830 + i, name, 10, { land: true, typeLine: `Basic Land — ${name}` }) })) });
      // Como se a Ilha e uma Floresta já tivessem sido tocadas.
      if (picked) { for (const b of [2, 0].slice(0, picked)) document.querySelector<HTMLElement>(`[data-dest-pick="${b}"]`)?.click(); }
    },
    /** O aviso do Fato ou Ficção depois de escolher o monte de duas cartas. */
    pilesNotice() {
      const opts = ['', 'Plains', 'Island', '', 'Swamp', 'Mountain', 'Forest'].map((name, i) => ({ label: name, card: card(840 + i, name, 10) }));
      rememberPiles({ id: 840, method: 'getChoices', kind: 'choose', purpose: 'piles-choose', title: 'Escolha uma pilha', card: card(849, 'Fact or Fiction', 10), chosenTo: 'hand', otherTo: 'graveyard',
        piles: [{ option: 0, size: 2, cards: [1, 2] }, { option: 3, size: 3, cards: [4, 5, 6] }], options: opts }, 0);
      view.notice('valor do efeito de Fato ou Ficção para Jogador 1 é Jogador 1 escolhe a Pilha 1:\nPlains\nIsland\n');
    },
    /** Busca opcional do Wood Elves e as cartas reveladas do Fato ou Ficção. */
    buttons(which: 'search' | 'reveal' = 'search') {
      if (which === 'search') return ask({ id: 850, method: 'chooseSingleEntityForEffect', kind: 'choose', title: 'Escolha a carta de seu grimório', min: 0, max: 1,
        card: card(851, 'Wood Elves', 10, { manaCost: '{2}{G}', typeLine: 'Creature — Elf Scout' }), options: [{ kind: 'card', label: 'Floresta', card: card(852, 'Forest', 10, { land: true }) }] });
      ask({ id: 853, method: 'getChoices', kind: 'reveal', title: 'Fato ou Ficção - Revelando cartas de seu grimório', min: -1, max: -1, card: card(854, 'Fact or Fiction', 10, { manaCost: '{3}{U}' }),
        options: ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].map((name, i) => ({ kind: 'card', label: name, card: card(855 + i, name, 10, { land: true }) })) });
    },
    /** Ponder: as três cartas ordenadas no topo e a pergunta de embaralhar. */
    ponder() {
      const source = card(860, 'Ponder', 10, { manaCost: '{U}', typeLine: 'Sorcery' });
      const q = { id: 861, method: 'order', kind: 'order', title: 'Escolha a ordem das cartas para inserir no grimório', card: source,
        options: ['Island', 'Forest', 'Mountain'].map((name, i) => ({ kind: 'card', label: name, card: card(862 + i, name, 10, { land: true }) })) };
      rememberTopOrder(q as any, [0, 1, 2]);
      state.question = undefined;
      Object.assign(state.input, { gen: state.input.gen + 1, priority: false, message: 'Quer embaralhar o grimório?', ok: { label: 'Sim', enabled: true }, cancel: { label: 'Não', enabled: true },
        selectable: [], selectableStacks: [], selectablePlayers: [], actionable: [], card: source, targeting: undefined });
      view.render();
    },
    /** Pilhagem Infiel na pilha (abrir a pilha mostra o texto em português). */
    stackText() {
      state.question = undefined;
      state.stack = [{ id: 870, text: 'Pilhagem Infiel (871) - Jogador 1 draws two cards. Jogador 1 discards two cards.', kind: 'spell', controller: 10,
        source: card(871, 'Faithless Looting', 10, { manaCost: '{R}', typeLine: 'Sorcery' }) }];
      Object.assign(state.input, { gen: state.input.gen + 1, priority: true, message: '', ok: { label: 'OK', enabled: true }, cancel: { label: '', enabled: false }, targeting: undefined, card: undefined });
      view.render();
    },
    /** Pedidos da caixa de ação: o sacrifício do Diabolic Edict, a manutenção cumulativa da Mystic Remora e o alvo do Mana Leak na pilha. */
    request(which: 'edict' | 'remora' | 'leak' = 'edict') {
      const me = state.players[0];
      state.question = undefined;
      const base = { priority: false, selectable: [], selectableStacks: [], selectablePlayers: [], actionable: [] };
      if (which === 'edict') {
        Object.assign(state.input, base, { gen: state.input.gen + 1, message: 'Édito Diabólico (121)\n - O jogador alvo sacrifica uma criatura.\nEscolha 1 creature(s) a sacrifice.',
          ok: { label: 'OK', enabled: false }, cancel: { label: 'Cancelar', enabled: false }, selectable: me.battlefield.filter((c: any) => c.creature).map((c: any) => c.id),
          selection: { cards: [], min: 1, max: 1 }, card: card(121, 'Diabolic Edict', 23, { manaCost: '{1}{B}' }) });
      } else if (which === 'remora') {
        Object.assign(state.input, base, { gen: state.input.gen + 1, message: 'Cumulative upkeep for Rêmora Mística (129)\nRêmora Mística (129) - \n\nPagar Custo de Mana: {2}',
          ok: { label: 'Automático', enabled: true }, cancel: { label: 'Cancelar', enabled: true }, paying: true, canAutoPay: true, payingFor: 'effect', manaCost: { remaining: '{2}' },
          card: card(129, 'Mystic Remora', 10, { manaCost: '{U}', typeLine: 'Enchantment' }) });
      } else {
        state.stack = [{ id: 210, text: 'Ursos Cinzentos', kind: 'spell', controller: 23, source: card(209, 'Grizzly Bears', 23, { manaCost: '{1}{G}', typeLine: 'Creature — Bear', creature: true, power: 2, toughness: 2 }) }];
        Object.assign(state.input, base, { gen: state.input.gen + 1, message: 'Select target spell', ok: { label: 'OK', enabled: false }, cancel: { label: 'Cancelar', enabled: true },
          selectableStacks: [210], card: card(211, 'Mana Leak', 10, { manaCost: '{1}{U}' }) });
      }
      view.render();
    },
  };
}
