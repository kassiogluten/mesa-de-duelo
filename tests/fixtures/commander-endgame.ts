import '../../src/style.css';
import { createForgeTableView } from '../../src/ui/forgeTable';
/** Fim de partida de Commander com quatro mesas cheias: terrenos, artefatos, encantamentos, planeswalkers, fichas
 *  empilhadas, equipamentos e auras presos, comandantes em campo, marcadores e vidas baixas. Serve para ajustar o
 *  posicionamento da mesa; window.fixture traz atalhos (pilha, ataque, eliminar...) para mudar a cena pelo console. */
type Card = Record<string, any>;
let nextId = 1;
const make = (controller: number, name: string, extra: Card = {}): Card => ({ id: controller * 1000 + nextId++, name, controller, tapped: false, token: false, manaCost: '', typeLine: '', ...extra });
const creature = (c: number, name: string, manaCost: string, typeLine: string, power: number, toughness: number, extra: Card = {}) => make(c, name, { manaCost, typeLine, creature: true, power, toughness, ...extra });
const land = (c: number, name: string, extra: Card = {}) => make(c, name, { land: true, typeLine: /^(Plains|Island|Swamp|Mountain|Forest)$/.test(name) ? `Basic Land — ${name}` : 'Land', ...extra });
const artifact = (c: number, name: string, manaCost: string, extra: Card = {}) => make(c, name, { manaCost, typeLine: 'Artifact', ...extra });
const enchantment = (c: number, name: string, manaCost: string, extra: Card = {}) => make(c, name, { manaCost, typeLine: 'Enchantment', ...extra });
const walker = (c: number, name: string, manaCost: string, loyalty: number, extra: Card = {}) => make(c, name, { manaCost, typeLine: `Legendary Planeswalker — ${name.split(/[ ,]/)[0]}`, planeswalker: true, counters: { LOYALTY: loyalty }, ...extra });
const tokens = (n: number, f: (i: number) => Card) => Array.from({ length: n }, (_, i) => f(i));
const spell = (c: number, name: string, manaCost: string, typeLine: string) => make(c, name, { manaCost, typeLine });
const lands = (c: number, names: [string, number][], tapped = 0) => names.flatMap(([n, k]) => tokens(k, () => land(c, n))).map((l, i) => ({ ...l, tapped: i < tapped }));

const [ME, ATRAXA, KRENKO, URZA] = [10, 23, 36, 49];

// Você: Edgar Markov, vampiros com equipamentos.
const edgar = creature(ME, 'Edgar Markov', '{3}{R}{W}{B}', 'Legendary Creature — Vampire Knight', 6, 6, { commander: true, keywords: ['First strike', 'Haste'], counters: { P1P1: 2 } });
const cordial = creature(ME, 'Cordial Vampire', '{B}{B}', 'Creature — Vampire', 5, 5, { counters: { P1P1: 3 } });
const meField = [
  ...lands(ME, [['Plains', 3], ['Swamp', 4], ['Mountain', 2], ['Godless Shrine', 1], ['Blood Crypt', 1], ['Sacred Foundry', 1], ['Command Tower', 1], ['Arid Mesa', 1]], 6),
  artifact(ME, 'Sol Ring', '{1}', { tapped: true }), artifact(ME, 'Arcane Signet', '{2}'), artifact(ME, 'Skullclamp', '{1}', { typeLine: 'Artifact — Equipment' }),
  edgar, cordial,
  artifact(ME, 'Sword of Feast and Famine', '{3}', { typeLine: 'Artifact — Equipment', attachedTo: edgar.id }),
  artifact(ME, 'Shadowspear', '{1}', { typeLine: 'Legendary Artifact — Equipment', attachedTo: cordial.id }),
  creature(ME, 'Captivating Vampire', '{1}{B}{B}', 'Creature — Vampire', 3, 3),
  creature(ME, 'Legion Lieutenant', '{W}{B}', 'Creature — Vampire Knight', 3, 3),
  creature(ME, 'Stromkirk Captain', '{1}{B}{R}', 'Creature — Vampire Soldier', 3, 3, { keywords: ['First strike'] }),
  creature(ME, 'Vampire Nocturnus', '{1}{B}{B}{B}', 'Creature — Vampire', 3, 3, { sick: true }),
  creature(ME, 'Bloodline Keeper', '{2}{B}{B}', 'Creature — Vampire', 5, 5, { keywords: ['Flying'], tapped: true }),
  ...tokens(9, i => creature(ME, 'Vampire', '', 'Token Creature — Vampire', 3, 3, { token: true, keywords: ['Lifelink'], sick: i > 6 })),
  ...tokens(3, () => creature(ME, 'Vampire', '', 'Token Creature — Vampire', 4, 4, { token: true, keywords: ['Flying'] })),
  enchantment(ME, 'Anointed Procession', '{3}{W}'), enchantment(ME, 'Intangible Virtue', '{1}{W}'),
];

// Atraxa: superfriends e marcadores.
const atraxa = creature(ATRAXA, "Atraxa, Praetors' Voice", '{G}{W}{U}{B}', 'Legendary Creature — Phyrexian Angel Horror', 7, 7, { commander: true, keywords: ['Flying', 'Vigilance', 'Deathtouch', 'Lifelink'], counters: { P1P1: 3 } });
const atraxaField = [
  ...lands(ATRAXA, [['Forest', 3], ['Island', 2], ['Plains', 2], ['Swamp', 2], ['Command Tower', 1], ['Breeding Pool', 1], ['Hallowed Fountain', 1], ['Overgrown Tomb', 1], ['Watery Grave', 1], ["Exotic Orchard", 1]], 4),
  atraxa,
  creature(ATRAXA, 'Deepglow Skate', '{4}{U}', 'Creature — Fish', 3, 3),
  creature(ATRAXA, 'Evolution Sage', '{2}{G}', 'Creature — Elf Druid', 3, 2),
  creature(ATRAXA, 'Thrummingbird', '{1}{U}', 'Creature — Phyrexian Bird Horror', 1, 1, { keywords: ['Flying'], counters: { P1P1: 2 } }),
  creature(ATRAXA, 'Spike Feeder', '{1}{G}{G}', 'Creature — Spike', 4, 4, { counters: { P1P1: 4 } }),
  walker(ATRAXA, 'Vraska, Golgari Queen', '{2}{B}{G}', 6),
  walker(ATRAXA, 'Teferi, Hero of Dominaria', '{3}{W}{U}', 7),
  walker(ATRAXA, 'Tamiyo, Field Researcher', '{1}{G}{W}{U}', 4),
  walker(ATRAXA, 'Ajani, Mentor of Heroes', '{3}{G}{W}', 8),
  enchantment(ATRAXA, 'Doubling Season', '{4}{G}'), enchantment(ATRAXA, 'Inexorable Tide', '{3}{U}{U}'),
  artifact(ATRAXA, 'Arcane Signet', '{2}', { tapped: true }), artifact(ATRAXA, 'Chromatic Lantern', '{3}'),
];
const teferiEmblem = make(ATRAXA, 'Teferi, Hero of Dominaria Emblem', { emblem: true, typeLine: 'Emblem — Teferi', text: 'Sempre que você comprar um card, exile o permanente alvo que um oponente controla.' });

// Krenko: um mar de goblins.
const krenko = creature(KRENKO, 'Krenko, Mob Boss', '{2}{R}{R}', 'Legendary Creature — Goblin Warrior', 4, 4, { commander: true, tapped: true });
const krenkoField = [
  ...lands(KRENKO, [['Mountain', 12], ['Command Tower', 1]], 13),
  krenko,
  creature(KRENKO, 'Goblin Chieftain', '{1}{R}{R}', 'Creature — Goblin', 3, 3, { keywords: ['Haste'] }),
  creature(KRENKO, 'Siege-Gang Commander', '{3}{R}{R}', 'Creature — Goblin', 3, 3),
  creature(KRENKO, 'Goblin Warchief', '{1}{R}{R}', 'Creature — Goblin Warrior', 3, 3, { keywords: ['Haste'] }),
  creature(KRENKO, 'Skirk Prospector', '{R}', 'Creature — Goblin', 2, 2),
  make(KRENKO, 'Purphoros, God of the Forge', { manaCost: '{3}{R}', typeLine: 'Legendary Enchantment Creature — God', keywords: ['Indestructible'] }),
  enchantment(KRENKO, 'Impact Tremors', '{1}{R}'), enchantment(KRENKO, 'Goblin Bombardment', '{1}{R}'),
  artifact(KRENKO, 'Sol Ring', '{1}', { tapped: true }), artifact(KRENKO, 'Lightning Greaves', '{2}', { typeLine: 'Artifact — Equipment', attachedTo: krenko.id }),
  ...tokens(28, i => creature(KRENKO, 'Goblin', '', 'Token Creature — Goblin', 3, 3, { token: true, tapped: i < 10, sick: i >= 22 })),
  ...tokens(3, () => creature(KRENKO, 'Goblin', '', 'Token Creature — Goblin', 3, 3, { token: true, keywords: ['Haste'] })),
];

// Urza: artefatos, fichas de Construto e Tóptero.
const urza = creature(URZA, 'Urza, Lord High Artificer', '{2}{U}{U}', 'Legendary Creature — Human Artificer', 1, 4, { commander: true });
const urzaField = [
  ...lands(URZA, [['Island', 11], ['Command Tower', 1], ['Academy Ruins', 1], ['Inventors\' Fair', 1]], 3),
  urza,
  creature(URZA, 'Construct', '', 'Token Artifact Creature — Construct', 14, 14, { token: true }),
  creature(URZA, 'Construct', '', 'Token Artifact Creature — Construct', 14, 14, { token: true, tapped: true }),
  creature(URZA, 'Sai, Master Thopterist', '{2}{U}', 'Legendary Creature — Human Artificer', 1, 4),
  creature(URZA, 'Padeem, Consul of Innovation', '{3}{U}', 'Legendary Creature — Vedalken Artificer', 1, 4, { keywords: ['Hexproof'] }),
  ...tokens(7, i => creature(URZA, 'Thopter', '', 'Token Artifact Creature — Thopter', 1, 1, { token: true, keywords: ['Flying'], tapped: i < 4 })),
  walker(URZA, 'Karn, Scion of Urza', '{4}', 3),
  ...['Sol Ring', 'Mana Vault', 'Mind Stone', 'Thran Dynamo', 'Arcane Signet', 'Talisman of Dominance', 'Paradox Engine', "Sensei's Divining Top"]
    .map((n, i) => artifact(URZA, n, '{2}', { tapped: i < 5, typeLine: n === 'Paradox Engine' ? 'Legendary Artifact' : 'Artifact' })),
  enchantment(URZA, 'Rhystic Study', '{2}{U}'), enchantment(URZA, 'Mystic Remora', '{U}', { counters: { AGE: 3 } }),
];

const graveyard = (c: number, names: string[]) => names.map(n => spell(c, n, '{2}', 'Instant'));
const decks: Record<number, { name: string; field: Card[]; commander: Card; life: number; hand: number; library: number; grave: string[]; exile: string[]; counters?: Record<string, number> }> = {
  [ME]: { name: 'Você', field: meField, commander: edgar, life: 14, hand: 6, library: 41, grave: ['Swords to Plowshares', 'Lightning Helix', 'Anguished Unmaking', 'Utter End', 'Vampiric Tutor', 'Blood Artist', 'Sorin, Vengeful Bloodlord', 'Wrath of God', 'Elenda, the Dusk Rose', 'Drana, Liberator of Malakir', 'Kalastria Highborn', 'Butcher of Malakir'], exile: ['Path to Exile', 'Olivia Voldaren'], counters: { POISON: 3 } },
  [ATRAXA]: { name: 'Bruno', field: atraxaField, commander: atraxa, life: 23, hand: 4, library: 37, grave: ['Cyclonic Rift', 'Counterspell', 'Supreme Verdict', 'Assassin\'s Trophy', 'Fact or Fiction', 'Swan Song', 'Rampant Growth', 'Kodama\'s Reach', 'Cultivate', 'Farseek'], exile: ['Brainstorm'], counters: { ENERGY: 6, EXPERIENCE: 4 } },
  [KRENKO]: { name: 'Carla', field: krenkoField, commander: krenko, life: 7, hand: 2, library: 29, grave: ['Lightning Bolt', 'Chaos Warp', 'Vandalblast', 'Blasphemous Act', 'Goblin Matron', 'Goblin Recruiter', 'Beetleback Chief', 'Mogg War Marshal', 'Goblin Instigator', 'Hordeling Outburst', 'Dragon Fodder', 'Faithless Looting', 'Wheel of Fortune', 'Krenko, Tin Street Kingpin'], exile: [], counters: { POISON: 7 } },
  [URZA]: { name: 'Diego', field: urzaField, commander: urza, life: 3, hand: 9, library: 18, grave: ['Force of Will', 'Mana Drain', 'Fierce Guardianship', 'Pact of Negation', 'Mystic Sanctuary', 'Snap', 'Frantic Search'], exile: ['Ancestral Recall', 'Time Walk', 'Treasure Cruise', 'Dig Through Time'] },
};
const ids = [ME, ATRAXA, KRENKO, URZA];
const handCards = ['Vampiric Tutor', 'Swamp', 'Sorin, Imperious Bloodlord', 'Exquisite Blood', 'Teferi\'s Protection', 'Sanguine Bond'];
const players = ids.map((id, seat) => {
  const d = decks[id];
  return { id, seat, name: d.name, ai: id !== ME, life: d.life, library: d.library, handCount: d.hand,
    hand: id === ME ? handCards.map((n, i) => spell(ME, n, i === 1 ? '' : '{1}{B}', i === 1 ? 'Basic Land — Swamp' : 'Sorcery')).map((c, i) => i === 1 ? { ...c, land: true } : c) : [],
    battlefield: d.field, graveyard: graveyard(id, d.grave), exile: graveyard(id, d.exile), pool: id === ME ? { B: 2, W: 1 } : {}, counters: d.counters,
    commandZone: [], commanders: [{ id: d.commander.id, name: d.commander.name, casts: id === URZA ? 3 : 2, tax: id === URZA ? 6 : 4 }],
    commanderDamage: ids.filter(o => o !== id).map(o => ({ commanderId: decks[o].commander.id, damage: ({ [ME]: 9, [ATRAXA]: 14, [KRENKO]: 4, [URZA]: 0 } as Record<number, number>)[o] + (id === URZA ? 5 : 0) })),
    emblems: id === ATRAXA ? [teferiEmblem] : [], eliminated: false };
});
const actionable = [...meField.filter(c => c.creature && !c.sick && !c.tapped).map(c => c.id), ...players[0].hand.map(c => c.id)];
const state: any = { type: 'state', config: { format: 'commander', matchLength: 'bo1', playerCount: 4 }, you: ME, players, turn: 14, phase: 'MAIN1', activePlayer: ME,
  gameOver: false, log: ['Turno 14 de Você.', 'Carla perde 3 de vida (Impact Tremors).', 'Diego compra um card.'], decks: [], stack: [], combat: [], castable: [],
  input: { gen: 140, priority: true, message: '', ok: { label: 'OK', enabled: true }, cancel: { label: '', enabled: false }, selectable: [], actionable }, events: [] };

const messages: unknown[] = [];
const client = { state, connected: true, send: (message: unknown) => messages.push(message) };
const view = createForgeTableView(document.querySelector('#table')!, { onExit() {}, onRematch() {} });
view.attach(client as any, []); view.render();
const render = () => view.render();
const player = (id: number) => state.players.find((p: any) => p.id === id);
Object.assign(window, { fixture: { state, client, view, messages, render, player,
  /** Três itens na pilha, um de cada oponente. */
  pilha() {
    const src = (id: number, n: number) => player(id).graveyard[n];
    state.stack = [
      { id: 9001, text: 'Exile o permanente alvo.', source: src(ATRAXA, 3), controller: ATRAXA, targets: { cards: [edgar.id] } },
      { id: 9002, text: 'Cause 1 de dano a cada oponente.', source: player(KRENKO).battlefield.find((c: Card) => c.name === 'Impact Tremors'), controller: KRENKO },
      { id: 9003, text: 'Anule a mágica alvo.', source: src(URZA, 0), controller: URZA, targets: { stack: [9001] } },
    ];
    render();
  },
  /** Seu exército ataca: comandante em Diego, fichas divididas entre Carla e Bruno (e um planeswalker). */
  ataque() {
    const attackers = meField.filter(c => c.creature && !c.sick && !c.tapped);
    const vraska = atraxaField.find(c => c.name.startsWith('Vraska'))!;
    state.phase = 'COMBAT_DECLARE_BLOCKERS';
    state.combat = attackers.map((c, i) => {
      c.attacking = true; c.tapped = !c.keywords?.includes('Vigilance');
      const [defender, defenderKind] = c === edgar ? [URZA, 'player'] : i % 3 === 0 ? [vraska.id, 'card'] : i % 3 === 1 ? [KRENKO, 'player'] : [ATRAXA, 'player'];
      return { attacker: c.id, defender, defenderKind, blockers: [] };
    });
    const goblins = krenkoField.filter(c => c.name === 'Goblin' && !c.tapped).slice(0, 3);
    state.combat.filter((e: any) => e.defender === KRENKO).forEach((e: any, i: number) => { if (goblins[i]) { goblins[i].blocking = true; e.blockers = [goblins[i].id]; } });
    Object.assign(state.input, { priority: true, actionable: [] });
    render();
  },
  /** Tira um jogador da partida (padrão: Diego, com 3 de vida). */
  eliminar(id = URZA) { Object.assign(player(id), { eliminated: true, life: 0 }); render(); },
  /** Volta para a cena inicial. */
  limpar() { location.reload(); },
} });
