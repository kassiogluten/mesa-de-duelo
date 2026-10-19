import '../../src/style.css';
import { createForgeTableView } from '../../src/ui/forgeTable';
const card = (id: number, name: string, controller: number, extra = {}) => ({ id, name, controller, tapped: false, token: false, manaCost: '{1}{G}', typeLine: 'Creature — Elf', creature: true, power: 2, toughness: 2, ...extra });
const land = (id: number, controller: number) => card(id, 'Forest', controller, { creature: false, land: true, typeLine: 'Basic Land — Forest', manaCost: '' });
const players = [10, 23].map((id, seat) => ({ id, seat, name: seat ? 'Oponente' : 'Você', ai: seat === 1, life: 20 - seat * 4, library: 50, handCount: 5,
  hand: seat === 0 ? ['Llanowar Elves', 'Forest', 'Lightning Bolt', 'Rampant Growth', 'Cultivate'].map((n, i) => card(300 + i, n, id)) : [],
  battlefield: [card(100 + seat, 'Soul Warden', id, { manaCost: '{W}' }), land(200 + seat, id), land(210 + seat, id)],
  graveyard: [], exile: [], pool: {} }));
const state: any = { type: 'state', config: { format: 'standard', matchLength: 'bo3' }, match: { gameNumber: 2, wins: [1, 0], draws: 0, over: false, phase: 'playing', ready: [false, false] },
  room: { code: 'ABCD', seat: 0, token: 't', started: true, config: { format: 'standard', matchLength: 'bo3' }, players: [{ name: 'Você', connected: true, rematch: false }, { name: 'Oponente', connected: true, rematch: false }] },
  you: 10, players, turn: 3, phase: 'MAIN1', activePlayer: 10, gameOver: false, log: [], decks: [], stack: [], combat: [], castable: [],
  input: { gen: 7, priority: true, message: '', ok: { label: 'OK', enabled: true }, cancel: { label: '', enabled: false }, selectable: [], actionable: [300, 302] }, events: [] };
const messages: unknown[] = [];
const client = { state, connected: true, send: (message: unknown) => messages.push(message) };
const view = createForgeTableView(document.querySelector('#table')!, { onExit() {}, onRematch() {} });
view.attach(client as any, []); view.render();
const warden = (id: number) => ({ id, controller: 10, tapped: false, token: false, name: 'Soul Warden', manaCost: '{W}', typeLine: 'Creature — Human Cleric', creature: true, power: 1, toughness: 1 });
Object.assign(window, { fixture: { state, client, view, messages, render: () => view.render(),
  extras() {
    Object.assign(state, { turn: 6, extraTurn: true, extraTurns: [10], phase: 'MAIN2', combatNumber: undefined, extraCombats: 1, extraCombatAfter: ['MAIN2'] });
    view.render();
  },
  extraCombat() {
    Object.assign(state, { phase: 'COMBAT_DECLARE_ATTACKERS', combatNumber: 2, extraCombats: 0, extraCombatAfter: undefined });
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
