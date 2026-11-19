// Página de teste da mesa: as escolhas com tela própria do item 142 (modos, cor, tipo de criatura, custos opcionais) e os pedidos da caixa de ação que vinham em inglês (sacrificar, manutenção cumulativa, alvo na pilha).
import { cachePut } from '../../src/scryfall';

type View = { render(): void };
/** O nome e o texto em português das cartas destas escolhas, como a mesa os teria depois de buscar a carta. */
const PT: [string, string, string?][] = [
  ["Kolaghan's Command", 'Comando de Kolaghan', 'Escolha dois —\n• Devolva o card de criatura alvo do seu cemitério para a sua mão.\n• O jogador alvo descarta um card.\n• Destrua o artefato alvo.\n• Comando de Kolaghan causa 2 pontos de dano a qualquer alvo.'],
  ['Izzet Charm', 'Amuleto Izzet', 'Escolha um —\n• Anule a mágica alvo que não seja de criatura, a menos que seu controlador pague {2}.\n• Amuleto Izzet causa 2 pontos de dano à criatura alvo.\n• Compre dois cards e depois descarte dois cards.'],
  ["Painter's Servant", 'Servo do Pintor'], ["Apostle's Blessing", 'Bênção do Apóstolo'], ['Convincing Mirage', 'Miragem Convincente'], ['Cavern of Souls', 'Caverna das Almas'],
  ['Burst Lightning', 'Explodir em Raios', 'Reforço {4}\nExplodir em Raios causa 2 pontos de dano a qualquer alvo. Se Explodir em Raios foi reforçado, em vez disso, ele causa 4 pontos de dano àquele alvo.'],
  ['Mystic Remora', 'Rêmora Mística'], ['Mana Leak', 'Vazamento de Mana'], ['Diabolic Edict', 'Édito Diabólico'],
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
