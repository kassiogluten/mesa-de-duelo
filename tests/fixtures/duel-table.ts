import '../../src/style.css';
import { createForgeTableView } from '../../src/ui/forgeTable';
const card = (id: number, name: string, controller: number, extra = {}) => ({ id, name, controller, tapped: false, token: false, manaCost: '{1}{G}', typeLine: 'Creature — Elf', creature: true, power: 2, toughness: 2, ...extra });
const land = (id: number, controller: number) => card(id, 'Forest', controller, { creature: false, land: true, typeLine: 'Basic Land — Forest', manaCost: '' });
const players = [10, 23].map((id, seat) => ({ id, seat, name: seat ? 'Oponente' : 'Você', ai: seat === 1, life: 20 - seat * 4, library: 50, handCount: 5,
  hand: seat === 0 ? ['Llanowar Elves', 'Forest', 'Lightning Bolt', 'Rampant Growth', 'Cultivate'].map((n, i) => card(300 + i, n, id)) : [],
  battlefield: [card(100 + seat, 'Soul Warden', id, { manaCost: '{W}' }), land(200 + seat, id), land(210 + seat, id),
    ...(seat === 0 ? [card(250, 'Druid Class', id, { creature: false, manaCost: '{1}{G}', typeLine: 'Enchantment — Class', classLevel: 2, classMaxLevel: 3 })] : [])],
  graveyard: [], exile: [], pool: {}, counters: seat === 0 ? { RAD: 3, ENERGY: 2 } : { POISON: 4, RAD: 1, EXPERIENCE: 2, CONTRACT: 1 } }));
const state: any = { type: 'state', config: { format: 'standard', matchLength: 'bo3' }, match: { gameNumber: 2, wins: [1, 0], draws: 0, over: false, phase: 'playing', ready: [false, false] },
  room: { code: 'ABCD', seat: 0, token: 't', started: true, config: { format: 'standard', matchLength: 'bo3' }, players: [{ name: 'Você', connected: true, rematch: false }, { name: 'Oponente', connected: true, rematch: false }] },
  you: 10, players, turn: 3, phase: 'MAIN1', activePlayer: 10, gameOver: false, log: [], decks: [], stack: [], combat: [], castable: [],
  input: { gen: 7, priority: true, message: '', ok: { label: 'OK', enabled: true }, cancel: { label: '', enabled: false }, selectable: [], actionable: [300, 302] }, events: [] };
const messages: unknown[] = [];
const client = { state, connected: true, send: (message: any) => { messages.push(message); simulateProliferate(message); } };
/** Cenário de proliferar: a escolha muda como a ponte mudaria, e confirmar dá +1 de cada marcador aos marcados. */
function simulateProliferate(message: any) {
  const input = state.input;
  if (!input.proliferate || message.gen !== input.gen) return;
  if (message.type === 'select-set') { input.selection = { ...input.selection, cards: message.cards, players: message.players }; input.gen++; }
  else if (message.type === 'ok') {
    const bump = (counters: Record<string, number>) => Object.keys(counters).forEach(k => { counters[k]++; });
    for (const p of state.players) {
      if (input.selection.players.includes(p.id)) bump(p.counters);
      for (const c of p.battlefield) if (input.selection.cards.includes(c.id)) bump(c.counters);
    }
    state.log.push(`Proliferar: ${input.selection.cards.length + input.selection.players.length} escolhidos.`);
    Object.assign(state.input, { gen: input.gen + 1, priority: true, message: '', proliferate: undefined, selection: undefined, selectable: [], selectablePlayers: [],
      ok: { label: 'OK', enabled: true }, cancel: { label: '', enabled: false } });
  } else return;
  setTimeout(() => view.render());
}
const view = createForgeTableView(document.querySelector('#table')!, { onExit() {}, onRematch() {} });
view.attach(client as any, []); view.render();
const warden = (id: number) => ({ id, controller: 10, tapped: false, token: false, name: 'Soul Warden', manaCost: '{W}', typeLine: 'Creature — Human Cleric', creature: true, power: 1, toughness: 1 });
Object.assign(window, { fixture: { state, client, view, messages, render: () => view.render(),
  proliferate() {
    const [me, opp] = state.players;
    me.battlefield[0].counters = { P1P1: 2 }; opp.battlefield[0].counters = { M1M1: 1 };
    me.battlefield.push({ ...warden(260), name: 'Llanowar Elves', counters: { M1M1: 1 } });
    opp.battlefield.push({ id: 261, controller: 23, tapped: false, token: false, name: 'Garruk Wildspeaker', manaCost: '{2}{G}{G}', typeLine: 'Legendary Planeswalker — Garruk', planeswalker: true, counters: { LOYALTY: 3 } });
    me.counters = { POISON: 2, ENERGY: 2 }; opp.counters = { POISON: 9 };
    Object.assign(state.input, { gen: 8, priority: false, message: 'Escolha qualquer número de permanentes e/ou jogadores para proliferar', actionable: [],
      ok: { label: 'OK', enabled: true }, cancel: { label: 'TODOS', enabled: true }, selectable: [100, 101, 260, 261], selectablePlayers: [10, 23],
      selection: { cards: [100], players: [], min: 0, max: 6 },
      proliferate: { candidates: [
        { kind: 'card', id: 100, holder: 10, effect: 'good', suggested: true, counters: [{ type: 'P1P1', count: 2, effect: 'good' }] },
        { kind: 'card', id: 101, holder: 23, effect: 'good', suggested: true, counters: [{ type: 'M1M1', count: 1, effect: 'good' }] },
        { kind: 'card', id: 260, holder: 10, effect: 'bad', suggested: false, counters: [{ type: 'M1M1', count: 1, effect: 'bad' }] },
        { kind: 'card', id: 261, holder: 23, effect: 'bad', suggested: false, counters: [{ type: 'LOYALTY', count: 3, effect: 'bad' }] },
        { kind: 'player', id: 10, holder: 10, effect: 'mixed', suggested: false, counters: [{ type: 'POISON', count: 2, effect: 'bad' }, { type: 'ENERGY', count: 2, effect: 'good' }] },
        { kind: 'player', id: 23, holder: 23, effect: 'good', suggested: true, counters: [{ type: 'POISON', count: 9, effect: 'good' }] },
      ] } });
    view.render();
  },
  /** Monarca, terrenos do turno, permanente roubada, atiçada, regeneração e escolhas da carta. */
  tableStatus() {
    const [me, opp] = state.players;
    Object.assign(me, { monarch: true, landsPlayed: 0, maxLands: 1, counters: {} });
    Object.assign(opp, { landsPlayed: 0, maxLands: 1, counters: {} });
    me.battlefield[0].shields = 1;
    me.battlefield.push({ ...land(270, 10), name: 'Cavern of Souls', typeLine: 'Land', chosen: { types: ['Elf'] } },
      { ...card(271, 'Pithing Needle', 10, { creature: false, manaCost: '{1}', typeLine: 'Artifact' }), chosen: { names: ['Grim Lavamancer'] } });
    opp.battlefield.push({ ...card(272, 'Llanowar Elves', 23, { manaCost: '{G}' }), owner: 10 });
    opp.battlefield[0].goadedBy = [10];
    view.render();
  },
  /** Mágicas do turno: Grapeshot na mão conta, então os retratos mostram quantas cada um conjurou. */
  spellsCast() {
    const [me, opp] = state.players;
    Object.assign(me, { spellsCast: 2, counters: {} });
    Object.assign(opp, { spellsCast: 1, counters: {} });
    me.hand.push(card(305, 'Grapeshot', 10, { creature: false, manaCost: '{1}{R}', typeLine: 'Sorcery', countsSpells: true }));
    view.render();
  },
  /** Topo do grimório à vista: o seu dá para conjurar (Future Sight), o do oponente está revelado (Courser of Kruphix). */
  libraryTop() {
    const [me, opp] = state.players;
    me.battlefield.push(card(280, 'Future Sight', 10, { creature: false, manaCost: '{2}{U}{U}{U}', typeLine: 'Enchantment' }));
    opp.battlefield.push(card(281, 'Courser of Kruphix', 23, { manaCost: '{1}{G}{G}', typeLine: 'Enchantment Creature — Centaur', power: 2, toughness: 4 }));
    me.libraryTop = card(290, 'Llanowar Elves', 10, { manaCost: '{G}', typeLine: 'Creature — Elf Druid', power: 1, toughness: 1 });
    opp.libraryTop = { ...land(291, 23) };
    state.castable = [290];
    view.render();
  },
  /** Pagando Gitaxian Probe ({U/P}) sem mana azul: o retrato e o botão pagam com vida. */
  phyrexian(pending = 0) {
    Object.assign(state.input, { gen: 9, priority: false, message: 'Gitaxian Probe\n\nPagar Custo de Mana: {U/P}', actionable: [], selectable: [200, 210], selectablePlayers: [10],
      paying: true, payingFor: 'spell', canAutoPay: false, phyrexianLife: pending,
      card: { id: 303, controller: 10, tapped: false, token: false, name: 'Gitaxian Probe', manaCost: '{U/P}', typeLine: 'Sorcery' },
      ok: { label: 'Automático', enabled: false }, cancel: { label: 'Cancelar', enabled: true } });
    view.render();
  },
  extras() {
    Object.assign(state, { turn: 6, extraTurn: true, extraTurns: [10], phase: 'MAIN2', combatNumber: undefined, extraCombats: 1, extraCombatAfter: ['MAIN2'] });
    view.render();
  },
  extraCombat() {
    Object.assign(state, { phase: 'COMBAT_DECLARE_ATTACKERS', combatNumber: 2, extraCombats: 0, extraCombatAfter: undefined });
    view.render();
  },
  combatDamage(trample = true, ordered = true) {
    const c = (id: number, name: string, power: number, toughness: number, controller: number) => ({ id, name, controller, tapped: false, token: false, creature: true, power, toughness, manaCost: '{3}{G}', typeLine: 'Creature' });
    const options: any[] = [
      { kind: 'card', card: c(801, 'Grizzly Bears', 2, 2, 23), label: 'Grizzly Bears', min: 0, max: 7, lethal: 2 },
      { kind: 'card', card: c(802, 'Hill Giant', 3, 3, 23), label: 'Hill Giant', min: 0, max: 7, lethal: 3 },
    ];
    if (trample) options.push({ kind: 'player', id: 23, label: 'Oponente', min: 0, max: 7, defender: true });
    state.question = { id: 43, method: 'assignCombatDamage', kind: 'amount', purpose: 'combat-damage', title: 'Distribua o dano de combate', total: 7, ordered, free: false, trample,
      card: c(800, 'Craw Wurm', 7, 4, 10), options, suggested: trample ? [2, 3, 2] : [2, 5] };
    view.render();
  },
  triggers() {
    state.question = { id: 41, method: 'order', kind: 'order', purpose: 'triggers', title: 'Reordenar habilidades simultâneas', options: [
      { kind: 'ability', card: warden(100), label: 'Soul Warden - Whenever another creature enters, you gain 1 life.', ability: 'Whenever another creature enters, you gain 1 life.' },
      { kind: 'ability', card: warden(100), label: 'Soul Warden - Whenever another creature enters, you gain 1 life.', ability: 'Whenever another creature enters, you gain 1 life.' },
      { kind: 'ability', card: { ...warden(104), name: 'Llanowar Elves', manaCost: '{G}' }, label: 'Llanowar Elves - When this enters, draw a card.', ability: 'When this enters, draw a card.' },
    ] };
    view.render();
  },
  castModes() {
    const bolt = { id: 302, controller: 10, tapped: false, token: false, name: 'Lightning Bolt', manaCost: '{R}', typeLine: 'Instant', text: 'Lightning Bolt deals 3 damage to any target.' };
    state.question = { id: 42, method: 'getAbilityToPlay', kind: 'choose', purpose: 'play-mode', title: 'Qual habilidade usar?', min: 0, max: 1, card: bolt, options: [
      { kind: 'ability', label: 'Lightning Bolt - Lightning Bolt deals 3 damage to any target. — Custo: {R}', mode: 'cast', spell: true, cost: '{R}', extra: [], description: 'Lightning Bolt deals 3 damage to any target.' },
      { kind: 'ability', label: 'Cycling {2} — Custo: {2}', mode: 'cycling', cost: '{2}', extra: [], description: 'Cycling {2}' },
      { kind: 'ability', label: 'Plot {1}{R} — Custo: {1}{R}', mode: 'plot', cost: '{1}{R}', extra: [], description: 'Plot {1}{R}' },
      { kind: 'ability', label: 'Evoke — Custo: sacrificar', mode: 'evoke', spell: true, cost: '', extra: ['Sacrifice a creature'], description: 'Evoke—Sacrifice a creature' },
    ] };
    view.render();
  },
} });
if (new URLSearchParams(location.search).get('cenario') === 'proliferar') (window as any).fixture.proliferate();
