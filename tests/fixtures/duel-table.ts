import '../../src/style.css';
import { createForgeTableView } from '../../src/ui/forgeTable';
const card = (id: number, name: string, controller: number, extra = {}) => ({ id, name, controller, tapped: false, token: false, manaCost: '{1}{G}', typeLine: 'Creature — Elf', creature: true, power: 2, toughness: 2, ...extra });
const land = (id: number, controller: number) => card(id, 'Forest', controller, { creature: false, land: true, typeLine: 'Basic Land — Forest', manaCost: '' });
const players = [10, 23].map((id, seat) => ({ id, seat, name: seat ? 'Oponente' : 'Você', ai: seat === 1, life: 20 - seat * 4, library: 50, handCount: 5,
  hand: seat === 0 ? [card(300, 'Llanowar Elves', id, { manaCost: '{G}', typeLine: 'Creature — Elf Druid', power: 1, toughness: 1 }), land(301, id),
    card(302, 'Lightning Bolt', id, { creature: false, manaCost: '{R}', typeLine: 'Instant' }),
    card(303, 'Rampant Growth', id, { creature: false, manaCost: '{1}{G}', typeLine: 'Sorcery' }),
    card(304, 'Cultivate', id, { creature: false, manaCost: '{2}{G}', typeLine: 'Sorcery' })] : [],
  battlefield: [card(100 + seat, 'Soul Warden', id, { manaCost: '{W}' }), land(200 + seat, id), land(210 + seat, id),
    ...(seat === 0 ? [card(250, 'Druid Class', id, { creature: false, manaCost: '{1}{G}', typeLine: 'Enchantment — Class', classLevel: 2, classMaxLevel: 3 })] : [])],
  graveyard: [], exile: [], pool: {}, counters: seat === 0 ? { RAD: 3, ENERGY: 2 } : { POISON: 4, RAD: 1, EXPERIENCE: 2, CONTRACT: 1 } }));
const state: any = { type: 'state', config: { format: 'standard', matchLength: 'bo3' }, match: { gameNumber: 2, wins: [1, 0], draws: 0, over: false, phase: 'playing', ready: [false, false] },
  room: { code: 'ABCD', seat: 0, token: 't', started: true, config: { format: 'standard', matchLength: 'bo3' }, players: [{ name: 'Você', connected: true, rematch: false }, { name: 'Oponente', connected: true, rematch: false }] },
  you: 10, players, turn: 3, phase: 'MAIN1', activePlayer: 10, gameOver: false, log: [], decks: [], stack: [], combat: [], castable: [],
  input: { gen: 7, priority: true, message: '', ok: { label: 'OK', enabled: true }, cancel: { label: '', enabled: false }, selectable: [], actionable: [300, 302] }, events: [] };
const messages: unknown[] = [];
const client = { state, connected: true, send: (message: any) => { messages.push(message); simulateProliferate(message); simulateImprovise(message); simulatePayMana(message); } };
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
/** Cenário de improvisar: tocar num artefato marca ou desmarca e muda o que falta; confirmar vira os marcados. */
function simulateImprovise(message: any) {
  const input = state.input;
  if (!input.tapToPay || message.gen !== input.gen) return;
  if (message.type === 'card' && input.selectable.includes(message.id)) {
    const cards: number[] = input.selection.cards;
    if (cards.includes(message.id)) cards.splice(cards.indexOf(message.id), 1);
    else if (cards.length < input.selection.max) cards.push(message.id);
    input.tapToPay = { kind: 'improvise', remaining: improviseCost(4 - cards.length) };
    input.message = improviseMessage(input.tapToPay.remaining);
    input.gen++;
  } else if (message.type === 'ok') {
    const [me] = state.players;
    for (const c of me.battlefield) if (input.selection.cards.includes(c.id)) c.tapped = true;
    me.hand = me.hand.filter((c: any) => c.id !== 306);
    state.log.push(`Bola de Fogo: ${input.selection.cards.length} artefatos virados pelo improvisar; falta ${input.tapToPay.remaining}.`);
    Object.assign(state.input, { gen: input.gen + 1, priority: true, message: '', tapToPay: undefined, selection: undefined, selectable: [], card: undefined,
      ok: { label: 'OK', enabled: true }, cancel: { label: '', enabled: false } });
  } else return;
  setTimeout(() => view.render());
}
/** O que cada fonte do cenário de pagar mana gera ao ser virada. */
const MANA_SOURCES: Record<number, string[]> = { 200: ['G'], 210: ['G'], 334: ['R'], 335: ['C', 'C'] };
/** "{2}{R/G}{G}" → genérico e símbolos; e de volta, na ordem do motor (genérico primeiro). */
const parseCost = (cost: string) => {
  const syms = (cost.match(/\{[^}]+\}/g) ?? []).map(m => m.slice(1, -1));
  return { generic: syms.filter(x => /^\d+$/.test(x)).reduce((a, b) => a + Number(b), 0), shards: syms.filter(x => !/^\d+$/.test(x)) };
};
const costText = (c: { generic: number; shards: string[] }) => `${c.generic ? `{${c.generic}}` : ''}${c.shards.map(x => `{${x}}`).join('')}` || '0';
/** Pagar mana à mão: virar uma fonte paga o símbolo de cor que ela atende, senão o genérico; o que sobra vai para a reserva. */
function simulatePayMana(message: any) {
  const input = state.input;
  if (!input.paying || !input.manaCost || message.gen !== input.gen || message.type !== 'card' || !input.selectable.includes(message.id)) return;
  const [me] = state.players;
  const source = me.battlefield.find((c: any) => c.id === message.id);
  if (!source || source.tapped) return;
  source.tapped = true;
  const cost = parseCost(input.manaCost.remaining);
  for (const color of MANA_SOURCES[message.id] ?? ['C']) {
    const i = cost.shards.findIndex(x => x.split('/').includes(color));
    if (i >= 0) cost.shards.splice(i, 1);
    else if (cost.generic > 0) cost.generic--;
    else me.pool[color] = (me.pool[color] ?? 0) + 1;
  }
  const remaining = costText(cost);
  input.manaCost = { ...input.manaCost, remaining, total: input.manaCost.total ?? input.manaCost.remaining };
  input.message = `${input.card?.name ?? ''}

Pagar Custo de Mana: ${remaining}`;
  input.selectable = input.selectable.filter((id: number) => id !== message.id);
  input.gen++;
  setTimeout(() => view.render());
}
const improviseCost = (generic: number) => `${generic ? `{${generic}}` : ''}{R}`;
const improviseMessage = (remaining: string) => `Fireball (306) - Fireball (306) deals 4 damage divided evenly (rounded down) to \nOponente. (X=4)\nChoose artifact to tap for Improvise.\nRemaining mana cost is ${remaining}`;
const view = createForgeTableView(document.querySelector('#table')!, { onExit() {}, onRematch() {} });
view.attach(client as any, []); view.render();
const warden = (id: number) => ({ id, controller: 10, tapped: false, token: false, name: 'Soul Warden', manaCost: '{W}', typeLine: 'Creature — Human Cleric', creature: true, power: 1, toughness: 1 });
Object.assign(window, { fixture: { state, client, view, messages, render: () => view.render(),
  /**
   * Alerta de espera demorada: a mesa espera `player` há `ms` (como a ponte manda em `waiting`). O oponente vira uma
   * pessoa (Ana), já que a IA nunca recebe o alerta. Um estado novo, como chegaria da ponte, para o relógio ressincronizar.
   */
  wait(player: number, ms: number, kind = 'priority') {
    Object.assign(state.players[1], { ai: false, name: 'Ana' });
    state.room.players[1].name = 'Ana';
    (client as any).state = { ...state, activePlayer: 10, waiting: [{ player, kind, ms }] };
    view.render();
  },
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
  /** Proliferar com Toxrill: slime, -1/-1 e atordoamento nas criaturas do oponente contam a seu favor. */
  proliferateSlime() {
    const [me, opp] = state.players;
    me.battlefield.push({ ...card(262, 'Toxrill, the Corrosive', 10, { manaCost: '{5}{U}{U}{B}{B}', typeLine: 'Legendary Creature — Slug Horror', power: 7, toughness: 7 }), counters: { P1P1: 1 } });
    opp.battlefield[0].counters = { SLIME: 2, M1M1: 1 };
    opp.battlefield.push(card(263, 'Serra Angel', 23, { manaCost: '{3}{W}{W}', typeLine: 'Creature — Angel', power: 4, toughness: 4, counters: { SLIME: 1, STUN: 1 } }));
    Object.assign(state.input, { gen: 8, priority: false, message: 'Escolha qualquer número de permanentes e/ou jogadores para proliferar', actionable: [],
      ok: { label: 'OK', enabled: true }, cancel: { label: 'TODOS', enabled: true }, selectable: [101, 262, 263], selectablePlayers: [],
      selection: { cards: [101, 262, 263], players: [], min: 0, max: 3 },
      proliferate: { candidates: [
        { kind: 'card', id: 101, holder: 23, effect: 'good', suggested: true, counters: [{ type: 'SLIME', count: 2, effect: 'good' }, { type: 'M1M1', count: 1, effect: 'good' }] },
        { kind: 'card', id: 263, holder: 23, effect: 'good', suggested: true, counters: [{ type: 'SLIME', count: 1, effect: 'good' }, { type: 'STUN', count: 1, effect: 'good' }] },
        { kind: 'card', id: 262, holder: 10, effect: 'good', suggested: true, counters: [{ type: 'P1P1', count: 1, effect: 'good' }] },
      ] } });
    view.render();
  },
  /**
   * Improvisar: Bola de Fogo com X=4 e a Inspiring Statuary em campo. Os artefatos (Statuary, Ornithopter,
   * Darksteel Relic, Mind Stone) pagam {1} cada; tocar marca e desmarca, e Confirmar vira os marcados.
   */
  improvise() {
    const [me] = state.players;
    const artifact = (id: number, name: string, manaCost: string, extra = {}) => card(id, name, 10, { creature: false, manaCost, typeLine: 'Artifact', ...extra });
    if (!me.battlefield.some((c: any) => c.id === 330)) me.battlefield.push(
      artifact(330, 'Inspiring Statuary', '{3}'), artifact(331, 'Ornithopter', '{0}', { creature: true, typeLine: 'Artifact Creature — Thopter', power: 0, toughness: 2, keywords: ['FLYING'] }),
      artifact(332, 'Darksteel Relic', '{0}'), artifact(333, 'Mind Stone', '{2}'), { ...land(334, 10), name: 'Mountain', typeLine: 'Basic Land — Mountain' });
    const fireball = card(306, 'Fireball', 10, { creature: false, manaCost: '{X}{R}', typeLine: 'Sorcery', keywords: ['IMPROVISE'] });
    if (!me.hand.some((c: any) => c.id === 306)) me.hand.push(fireball);
    Object.assign(state.input, { gen: 11, priority: false, actionable: [], selectable: [330, 331, 332, 333], selectablePlayers: [], card: fireball,
      message: improviseMessage('{4}{R}'), ok: { label: 'OK', enabled: true }, cancel: { label: 'Cancelar', enabled: false },
      selection: { cards: [], min: 0, max: 4 }, tapToPay: { kind: 'improvise', remaining: '{4}{R}' } });
    view.render();
  },
  /**
   * Pagamento automático do Coral Merfolk ({1}{U}) com duas Ilhas e o Talisman of Dominance: `antes` vira as duas
   * Ilhas, como o Automático do Forge fazia; senão, o talismã paga o {1} e uma Ilha fica desvirada.
   */
  autoPay(antes = false) {
    const [me] = state.players;
    const island = (id: number, tapped: boolean) => ({ ...land(id, 10), name: 'Island', typeLine: 'Basic Land — Island', tapped });
    me.battlefield = [island(340, true), island(341, antes),
      card(342, 'Talisman of Dominance', 10, { creature: false, manaCost: '{2}', typeLine: 'Artifact', tapped: !antes })];
    me.hand = me.hand.filter((c: any) => c.id !== 343);
    state.stack = [{ id: 343, name: 'Coral Merfolk', controller: 10, text: 'Coral Merfolk', manaCost: '{1}{U}' }];
    Object.assign(state.input, { actionable: [], selectable: [] });
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
  /** Bênção da cidade no seu retrato e velocidade nos dois (a do oponente no máximo). */
  blessingSpeed() {
    const [me, opp] = state.players;
    Object.assign(me, { blessing: true, speed: 2, counters: {} });
    Object.assign(opp, { speed: 4, counters: {} });
    view.render();
  },
  /** Estados de uma vez só: monstruosa, suspeita, exaurida e um veículo tripulado. */
  oneTimeStates() {
    const [me, opp] = state.players;
    me.battlefield.push(card(273, 'Polukranos, World Eater', 10, { manaCost: '{2}{G}{G}', typeLine: 'Legendary Creature — Hydra', power: 8, toughness: 8, counters: { P1P1: 3 }, states: ['monstrous'] }),
      card(274, 'Glorybringer', 10, { manaCost: '{3}{R}{R}', typeLine: 'Creature — Dragon', power: 4, toughness: 4, keywords: ['FLYING', 'HASTE'], states: ['exerted'], tapped: true }),
      card(275, 'Smuggler\'s Copter', 10, { manaCost: '{2}', typeLine: 'Artifact Creature — Vehicle', power: 3, toughness: 3, keywords: ['FLYING'], states: ['crewed'], crewedBy: ['Llanowar Elves'] }));
    opp.battlefield.push(card(276, 'Gruff Triplets', 23, { manaCost: '{3}{G}{G}', typeLine: 'Creature — Satyr Warrior', power: 3, toughness: 3, keywords: ['MENACE'], states: ['suspected'] }));
    view.render();
  },
  /** Batalha do oponente que você defende. */
  battle() {
    state.players[1].battlefield.push(card(277, 'Invasion of Zendikar', 23, { creature: false, manaCost: '{3}{G}', typeLine: 'Battle — Siege', counters: { DEFENSE: 3 }, protector: 10 }));
    view.render();
  },
  /** Previstas no exílio: a sua de face para cima, com o custo previsto (dá para conjurar); a do oponente só o verso. */
  foretold() {
    const [me, opp] = state.players;
    me.exile.push(card(278, 'Saw It Coming', 10, { creature: false, manaCost: '{1}{U}{U}', typeLine: 'Instant', foretold: true, foretellCost: '{1}{U}' }));
    opp.exile.push({ id: 279, controller: 23, tapped: false, token: false, faceDown: true, foretold: true });
    Object.assign(state, { playableExile: [278], castable: [278] });
    view.render();
  },
  /**
   * Viradas para baixo no campo, com a carta de lembrete de cada tipo: a sua metamorfose (você vê qual carta é) e o
   * seu disfarce; do oponente, uma manifestada, uma encoberta e uma sem tipo conhecido (fica o verso). Uma prevista
   * no exílio continua com o verso. `?cenario=viradas`.
   */
  faceDown() {
    const [me, opp] = state.players;
    const down = (id: number, controller: number, kind?: string, extra = {}) => ({ id, controller, tapped: false, token: false, faceDown: true, creature: true, power: 2, toughness: 2, typeLine: 'Creature', ...(kind ? { faceDownKind: kind } : {}), ...extra });
    me.battlefield.push(
      down(370, 10, 'morph', { hiddenFace: { name: 'Exalted Angel', manaCost: '{4}{W}{W}', typeLine: 'Creature — Angel', creature: true, power: 4, toughness: 5 } }),
      down(371, 10, 'disguise', { keywords: ['WARD'], ward: '{2}', hiddenFace: { name: 'Fugitive Codebreaker', manaCost: '{1}{R}', typeLine: 'Creature — Goblin Rogue', creature: true, power: 2, toughness: 2 } }));
    opp.battlefield.push(down(372, 23, 'manifest'), down(373, 23, 'cloak', { keywords: ['WARD'], ward: '{2}', tapped: true }), down(374, 23));
    opp.exile.push({ id: 375, controller: 23, tapped: false, token: false, faceDown: true, foretold: true });
    view.render();
  },
  /** Dia ou noite na trilha de fases, com as mágicas que quem joga o turno já conjurou. */
  dayNight(time: 'day' | 'night' = 'day', spells = 0, active = 10) {
    Object.assign(state, { dayTime: time, activeSpells: spells, activePlayer: active });
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
  /**
   * Pagando o custo de mana à mão: a caixa de ação mostra o que falta com os símbolos, e virar uma fonte desconta.
   * Florestas (200, 210) dão {G}, a Montanha (334) dá {R} e o Sol Ring (335) dá {C}{C}. cost: o custo da carta;
   * effect: o custo vem de um efeito (Mana Leak), pago por você; pool: mana já na reserva.
   */
  payMana(opts: { name?: string; cost?: string; manaCost?: string; typeLine?: string; effect?: boolean; x?: number; life?: number; pool?: Record<string, number> } = {}) {
    const [me] = state.players;
    if (!me.battlefield.some((c: any) => c.id === 334)) me.battlefield.push(
      { ...land(334, 10), name: 'Mountain', typeLine: 'Basic Land — Mountain' },
      card(335, 'Sol Ring', 10, { creature: false, manaCost: '{1}', typeLine: 'Artifact' }));
    for (const c of me.battlefield) if ([200, 210, 334, 335].includes(c.id)) c.tapped = false;
    me.pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...opts.pool };
    const cost = opts.cost ?? '{4}{G}{G}';
    const name = opts.name ?? 'Craw Wurm';
    const source = card(307, name, opts.effect ? 23 : 10, { manaCost: opts.manaCost ?? cost, typeLine: opts.typeLine ?? 'Creature — Wurm', power: 6, toughness: 4 });
    Object.assign(state.input, { gen: 12, priority: false, actionable: [], selectable: [200, 210, 334, 335], selectablePlayers: [], card: source,
      message: `${name}

Pagar Custo de Mana: ${cost}`, paying: true, payingFor: opts.effect ? 'effect' : 'spell', canAutoPay: true, phyrexianLife: undefined,
      manaCost: { remaining: cost, ...(opts.x !== undefined ? { x: opts.x } : {}), ...(opts.life ? { life: opts.life } : {}) },
      ok: { label: 'Automático', enabled: true }, cancel: { label: 'Cancelar', enabled: true } });
    view.render();
  },
  /** Vira uma fonte de mana do cenário de pagar mana, como um toque na mesa. */
  tapForMana(id: number) { client.send({ type: 'card', id, gen: state.input.gen }); },
  /**
   * Gatilho pedindo alvo antes da pilha: Chupacabra Voraz no seu campo (e não fora da mesa) aparece na caixa de ação,
   * com o gatilho em destaque e o que falta marcar. chosen: já marcou o alvo; ability: habilidade ativada.
   */
  targetSource(mode: 'trigger' | 'chosen' | 'ability' = 'trigger') {
    const [me, opp] = state.players;
    const chupa = card(282, 'Ravenous Chupacabra', 10, { manaCost: '{2}{B}{B}', typeLine: 'Creature — Beast Horror', power: 2, toughness: 2 });
    const sorcerer = card(283, 'Prodigal Sorcerer', 10, { manaCost: '{2}{U}', typeLine: 'Creature — Human Wizard', power: 1, toughness: 1, tapped: mode === 'ability' });
    const bears = card(284, 'Grizzly Bears', 23, { manaCost: '{1}{G}', typeLine: 'Creature — Bear' });
    const giant = card(285, 'Hill Giant', 23, { manaCost: '{3}{R}', typeLine: 'Creature — Giant', power: 3, toughness: 3 });
    if (!me.battlefield.some((c: any) => c.id === 282)) { me.battlefield.push(chupa, sorcerer); opp.battlefield.push(bears, giant); }
    const ability = mode === 'ability'
      ? { source: sorcerer, kind: 'ability', text: '{T}: Feiticeiro Pródigo causa 1 ponto de dano a qualquer alvo.', ask: 'Select any target', valid: ['Any'], selectable: [100, 101, 282, 283, 284, 285], players: [10, 23] }
      : { source: chupa, kind: 'trigger', text: 'Quando Chupacabra Voraz entrar no campo de batalha, destrua a criatura alvo que um oponente controla.', ask: 'Select target creature an opponent controls', valid: ['Creature.OppCtrl'], selectable: [101, 284, 285], players: [] };
    const chosen = mode === 'chosen';
    Object.assign(state.input, { gen: 10, priority: false, actionable: [], selectable: ability.selectable, selectablePlayers: ability.players,
      message: `${ability.source.name} (${ability.source.id}) - ${ability.text}\n\n${ability.ask}${chosen ? '\nTargeted: \nGrizzly Bears (284)' : ''}`,
      ok: { label: 'OK', enabled: chosen }, cancel: { label: 'Cancelar', enabled: false }, card: ability.source,
      targeting: { source: ability.source.id, card: ability.source, kind: ability.kind, ability: ability.text, min: 1, max: 1, count: chosen ? 1 : 0, valid: ability.valid, cards: chosen ? [284] : [] } });
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
    const bolt = { id: 302, controller: 10, tapped: false, token: false, name: 'Lightning Bolt', manaCost: '{R}', typeLine: 'Instant', text: 'Lightning Bolt deals 3 damage to any target.', power: undefined, toughness: undefined };
    state.question = { id: 42, method: 'getAbilityToPlay', kind: 'choose', purpose: 'play-mode', title: 'Qual habilidade usar?', min: 0, max: 1, card: bolt, options: [
      { kind: 'ability', label: 'Lightning Bolt - Lightning Bolt deals 3 damage to any target. — Custo: {R}', mode: 'cast', spell: true, cost: '{R}', extra: [], description: 'Lightning Bolt deals 3 damage to any target.' },
      { kind: 'ability', label: 'Cycling {2} — Custo: {2}', mode: 'cycling', cost: '{2}', extra: [], description: 'Cycling {2}' },
      { kind: 'ability', label: 'Plot {1}{R} — Custo: {1}{R}', mode: 'plot', cost: '{1}{R}', extra: [], description: 'Plot {1}{R}' },
      { kind: 'ability', label: 'Evoke — Custo: sacrificar', mode: 'evoke', spell: true, cost: '', extra: ['Sacrifice a creature'], description: 'Evoke—Sacrifice a creature' },
    ] };
    view.render();
  },
  /**
   * Vidência e vigilância de várias cartas, como a ponte manda (o topo do grimório primeiro). "bottom" é a
   * escolha do fundo (ou do cemitério, na vigilância) e "top" a ordem das que ficam em cima.
   */
  library(effect: 'scry' | 'surveil' = 'scry', n = 3, step: 'bottom' | 'top' = 'bottom') {
    const top = [
      card(901, 'Lightning Bolt', 10, { creature: false, manaCost: '{R}', typeLine: 'Instant', text: 'Lightning Bolt deals 3 damage to any target.', power: undefined, toughness: undefined }),
      card(902, 'Counterspell', 10, { creature: false, manaCost: '{U}{U}', typeLine: 'Instant', text: 'Counter target spell.', power: undefined, toughness: undefined }),
      card(903, 'Forest', 10, { creature: false, land: true, manaCost: '', typeLine: 'Basic Land — Forest', text: '({T}: Add {G}.)', power: undefined, toughness: undefined }),
      card(904, 'Serra Angel', 10, { manaCost: '{3}{W}{W}', typeLine: 'Creature — Angel', power: 4, toughness: 4, text: 'Flying, vigilance' }),
      card(905, 'Llanowar Elves', 10, { manaCost: '{G}', typeLine: 'Creature — Elf Druid', power: 1, toughness: 1, text: '{T}: Add {G}.' }),
    ].slice(0, n);
    const options = top.map(c => ({ kind: 'card', card: c, label: `${c.name} (${c.id})` }));
    const title = step === 'top' ? 'Organize as cartas que irão no topo do seu grimório'
      : effect === 'scry' ? 'Escolha as cartas a serem colocadas no fundo do seu grimório' : 'Escolha as cartas pra colocar no cemitério';
    const library = step === 'top' ? 'top' : effect === 'scry' ? 'bottom' : 'graveyard';
    state.question = step === 'top' ? { id: 60 + n, method: 'order', kind: 'order', purpose: 'library', library, title, options }
      : { id: 70 + n, method: 'order', kind: 'choose', purpose: 'library', library, title, min: 0, max: n, options };
    view.render();
  },
  /**
   * Tutor (Demonic Tutor) num grimório de Commander: escolha de uma carta entre `n`, na ordem do grimório, como a
   * ponte manda. `max` acima de 1 é uma busca de várias cartas (as marcadas continuam marcadas ao trocar de filtro).
   */
  tutor(n = 24, max = 1) {
    const pool: [string, string, string][] = [
      ['Sol Ring', 'Artifact', '{1}'], ['Command Tower', 'Land', ''], ['Llanowar Elves', 'Creature — Elf Druid', '{G}'],
      ['Lightning Greaves', 'Artifact — Equipment', '{2}'], ['Steel Overseer', 'Artifact Creature — Construct', '{2}'],
      ['Cultivate', 'Sorcery', '{2}{G}'], ['Counterspell', 'Instant', '{U}{U}'], ['Garruk Wildspeaker', 'Legendary Planeswalker — Garruk', '{2}{G}{G}'],
      ['Animate Dead', 'Enchantment — Aura', '{1}{B}'], ['Forest', 'Basic Land — Forest', ''], ['Swords to Plowshares', 'Instant', '{W}'],
      ['Eternal Witness', 'Creature — Human Shaman', '{1}{G}{G}'], ['Rhystic Study', 'Enchantment', '{2}{U}'], ['Demonic Tutor', 'Sorcery', '{1}{B}'],
      ['Arcane Signet', 'Artifact', '{2}'], ['Birds of Paradise', 'Creature — Bird', '{G}'], ['Island', 'Basic Land — Island', ''],
      ['Beast Within', 'Instant', '{2}{G}'], ['Solemn Simulacrum', 'Artifact Creature — Golem', '{4}'], ['Kodama\'s Reach', 'Sorcery', '{2}{G}'],
      ['Smothering Tithe', 'Enchantment', '{3}{W}'], ['Wrath of God', 'Sorcery', '{2}{W}{W}'], ['Reliquary Tower', 'Land', ''], ['Serra Angel', 'Creature — Angel', '{3}{W}{W}'],
      ['Teferi, Hero of Dominaria', 'Legendary Planeswalker — Teferi', '{3}{W}{U}'], ['Brainstorm', 'Instant', '{U}'], ['Mind Stone', 'Artifact', '{2}'],
    ];
    const options = pool.slice(0, n).map(([name, typeLine, manaCost], i) => {
      const c = card(800 + i, name, 10, { typeLine, manaCost, creature: /Creature/.test(typeLine), land: /Land/.test(typeLine) });
      return { kind: 'card', card: c, label: name };
    });
    state.question = { id: 90 + n + max, method: 'getChoices', kind: 'choose', title: max > 1 ? `Escolha até ${max} cartas` : 'Escolha uma carta do seu grimório', min: 0, max, options };
    view.render();
  },
  /** Silverquill Silencer: nomear uma carta entre `total` nomes (dezenas de milhares por padrão), que a ponte manda só como texto. */
  nameACard(total = 34000) {
    const real = ['Lightning Bolt', 'Lightning Helix', 'Chain Lightning', 'Ball Lightning', 'Lightning Greaves', 'Counterspell', 'Llanowar Elves', 'Serra Angel', 'Sol Ring', 'Swords to Plowshares'];
    const options = [...real, ...Array.from({ length: Math.max(0, total - real.length) }, (_, i) => `Fixture Card ${i}`)].slice(0, total).sort();
    state.question = { id: 95, method: 'getChoices', kind: 'choose', purpose: 'card-name', title: 'Escolha o nome da carta nonland.', min: 1, max: 1, options,
      card: card(830, 'Silverquill Silencer', 10, { typeLine: 'Creature — Human Cleric', manaCost: '{W}{B}', power: 3, toughness: 2 }) };
    view.render();
  },
  /** Mão revelada (Telepathy): o oponente tem 5 cartas e você vê todas, ou só `shown` delas. */
  revealedHand(shown = 5) {
    const opp = state.players[1];
    const names: [string, Record<string, unknown>][] = [['Counterspell', { creature: false, typeLine: 'Instant', manaCost: '{U}{U}' }], ['Lightning Bolt', { creature: false, typeLine: 'Instant', manaCost: '{R}' }],
      ['Serra Angel', { typeLine: 'Creature — Angel', manaCost: '{3}{W}{W}', power: 4, toughness: 4 }], ['Llanowar Elves', { manaCost: '{G}', power: 1, toughness: 1 }], ['Island', { creature: false, land: true, typeLine: 'Basic Land — Island', manaCost: '' }]];
    opp.handCount = 5;
    opp.revealedHand = names.slice(0, shown).map(([n, extra], i) => card(600 + i, n, 23, extra));
    if (!shown) delete opp.revealedHand;
    view.render();
  },
  /** Peek / Gitaxian Probe: o Forge mostra a mão como um reveal() (min e max -1), com as cartas inteiras. */
  peekReveal() {
    const opp = 23;
    state.question = { id: 77, method: 'getChoices', kind: 'reveal', title: 'Olhando a mão de Oponente', min: -1, max: -1, options: [
      { kind: 'card', label: 'Counterspell', card: card(610, 'Counterspell', opp, { creature: false, typeLine: 'Instant', manaCost: '{U}{U}' }) },
      { kind: 'card', label: 'Serra Angel', card: card(611, 'Serra Angel', opp, { typeLine: 'Creature — Angel', manaCost: '{3}{W}{W}', power: 4, toughness: 4 }) },
      { kind: 'card', label: 'Island', card: card(612, 'Island', opp, { creature: false, land: true, typeLine: 'Basic Land — Island', manaCost: '' }) },
    ] };
    view.render();
  },
  /** Uma partida curta já jogada, para o histórico (Menu → Registro): turnos, mágicas com o que causaram, combate e gatilhos. */
  /** Janela de remoção: o oponente conjura Wrath of God e leva `mine` permanentes suas e `theirs` dele. */
  removal(mine = 8, theirs = 3) {
    const me = 10, opp = 23;
    const names = ['Llanowar Elves', 'Soul Warden', 'Serra Angel', 'Grizzly Bears', 'Blood Artist', 'Knight of Autumn', 'Elvish Mystic', 'Birds of Paradise', 'Wall of Omens', 'Baneslayer Angel', 'Sakura-Tribe Elder', 'Eternal Witness'];
    const mineCards = Array.from({ length: mine }, (_, i) => card(600 + i, names[i % names.length], me));
    const theirCards = Array.from({ length: theirs }, (_, i) => card(700 + i, names[(i + 5) % names.length], opp));
    const wrath = card(800, 'Wrath of God', opp, { creature: false, typeLine: 'Sorcery', manaCost: '{2}{W}{W}' });
    let seq = 0;
    const frame = (stackId?: number) => ({ turn: 2, phase: 'MAIN1', activePlayer: opp, combat: [], stack: stackId ? [{ id: stackId, source: wrath, controller: opp }] : [],
      players: [{ id: me, life: 20, handCount: 5, library: 50, battlefield: mineCards }, { id: opp, life: 20, handCount: 5, library: 50, battlefield: theirCards }] });
    const ev = (type: string, extra: any = {}) => ({ seq: ++seq, stateVersion: seq, type, ...extra });
    state.matchId = 'remocao';
    state.events = [ev('turn', { actor: opp, turn: 2 })];
    state.eventCursor = seq;
    view.render();
    setTimeout(() => {
      state.events = [...state.events,
        ev('spell-cast', { actor: opp, stackId: 9, sourceId: wrath.id, card: wrath, frame: frame(9) }),
        ...[...mineCards, ...theirCards].map(x => ev('left', { actor: x.controller, sourceId: x.id, card: x, reason: 'destroyed', from: 'Battlefield', to: 'Graveyard', stackId: 9, sourceName: 'Wrath of God', frame: frame(9) })),
        ev('resolved', { actor: opp, stackId: 9, sourceId: wrath.id, card: wrath, frame: frame(9) })];
      state.eventCursor = seq;
      view.render();
    }, 300);
  },
  history() {
    const me = 10, opp = 23;
    const c = (id: number, name: string, controller: number) => card(id, name, controller);
    const elves = c(400, 'Llanowar Elves', me), bears = c(401, 'Grizzly Bears', opp), angel = c(402, 'Serra Angel', opp), artist = c(403, 'Blood Artist', opp);
    const knight = c(404, 'Knight of Autumn', opp), warden = c(100, 'Soul Warden', me);
    let seq = 0;
    const frame = (stackId?: number, combat: any[] = []) => ({ turn: 0, phase: 'MAIN1', activePlayer: me, combat,
      stack: stackId ? [{ id: stackId }] : [], players: [{ id: me, life: 20, handCount: 5, library: 50, battlefield: [elves, warden] }, { id: opp, life: 20, handCount: 5, library: 50, battlefield: [bears, angel, artist, knight] }] });
    const ev = (type: string, extra: any = {}) => ({ seq: ++seq, stateVersion: seq, type, ...extra });
    const cast = (id: number, actor: number, src: any, extra: any = {}) => ev('spell-cast', { actor, stackId: id, sourceId: src.id, card: src, frame: frame(id), ...extra });
    const resolved = (id: number, actor: number, src: any, extra: any = {}) => ev('resolved', { actor, stackId: id, sourceId: src.id, card: src, frame: frame(id), ...extra });
    const trigger = (id: number) => ev('ability-activated', { actor: opp, trigger: true, stackId: id, sourceId: artist.id, card: artist, frame: frame(id) });
    state.matchId = 'historico';
    state.events = [
      ev('draw', { actor: me, count: 7 }), ev('draw', { actor: opp, count: 7 }),
      ev('turn', { actor: me, turn: 1 }), ev('land-played', { actor: me, card: c(500, 'Forest', me), frame: frame() }),
      cast(1, me, elves), ev('entered', { actor: me, sourceId: elves.id, card: elves, from: 'Stack', frame: frame(1) }), resolved(1, me, elves),
      ev('turn', { actor: opp, turn: 2 }), ev('draw', { actor: opp }), ev('land-played', { actor: opp, card: c(501, 'Mountain', opp), frame: frame() }),
      cast(2, opp, c(405, 'Lightning Bolt', opp), { targets: { cards: [elves.id] } }),
      ev('damage', { actor: opp, card: c(405, 'Lightning Bolt', opp), delta: -3, targets: { cards: [elves.id] }, frame: frame(2) }),
      resolved(2, opp, c(405, 'Lightning Bolt', opp)), ev('left', { actor: me, sourceId: elves.id, card: elves, reason: 'destroyed', from: 'Battlefield', to: 'Graveyard', frame: frame() }),
      ev('turn', { actor: me, turn: 3 }), ev('draw', { actor: me }),
      cast(3, me, c(406, 'Wrath of God', me)),
      ...[bears, angel, artist, knight].map(x => ev('left', { actor: opp, sourceId: x.id, card: x, reason: 'destroyed', from: 'Battlefield', to: 'Graveyard', frame: frame(3) })),
      resolved(3, me, c(406, 'Wrath of God', me)),
      trigger(11), trigger(12), trigger(13),
      ...[13, 12, 11].flatMap(id => [ev('life-changed', { actor: me, delta: -1, frame: frame(id) }), ev('life-changed', { actor: opp, delta: 1, frame: frame(id) }), resolved(id, opp, artist, { trigger: true })]),
      ev('turn', { actor: opp, turn: 4 }), ev('draw', { actor: opp }),
      ev('attackers', { actor: opp, cards: [angel.id, bears.id], targets: { players: [me] }, frame: frame(undefined, [{ attacker: angel.id, blockers: [] }, { attacker: bears.id, blockers: [] }]) }),
      ev('blockers', { actor: me, cards: [warden.id], frame: frame(undefined, [{ attacker: angel.id, blockers: [] }, { attacker: bears.id, blockers: [warden.id] }]) }),
      ev('damage', { actor: opp, combat: true, card: angel, delta: -4, targets: { players: [me] }, frame: frame() }),
      ev('damage', { actor: opp, combat: true, card: bears, delta: -2, targets: { cards: [warden.id] }, frame: frame() }),
      ev('damage', { actor: me, combat: true, card: warden, delta: -1, targets: { cards: [bears.id] }, frame: frame() }),
      ev('life-changed', { actor: me, delta: -4, frame: frame() }),
      ev('left', { actor: me, sourceId: warden.id, card: warden, reason: 'destroyed', from: 'Battlefield', to: 'Graveyard', frame: frame() }),
      ev('turn', { actor: me, turn: 5 }), ev('draw', { actor: me }),
      cast(4, me, c(407, 'Divination', me)), ev('draw', { actor: me }), ev('draw', { actor: me }), resolved(4, me, c(407, 'Divination', me)),
    ];
    state.eventCursor = seq;
    state.turn = 5;
    view.render();
  },
  /**
   * Tipo ganho (item 50): March of the Machines faz do Sol Ring uma criatura 1/1; do lado do oponente, Kormus Bell
   * anima um Pântano e Imprisoned in the Moon faz de uma criatura um terreno. Os campos são os que a ponte manda.
   */
  typeChange() {
    const [me, opp] = state.players;
    const perm = (id: number, controller: number, name: string, extra: Record<string, unknown>) => ({ id, controller, name, tapped: false, token: false, creature: false, ...extra });
    me.battlefield.push(perm(270, 10, 'March of the Machines', { manaCost: '{3}{U}', typeLine: 'Enchantment' }),
      perm(271, 10, 'Sol Ring', { manaCost: '{1}', typeLine: 'Artifact Creature', printedType: 'Artifact', typeChangedBy: ['March of the Machines'], creature: true, power: 1, toughness: 1, basePower: 1, baseToughness: 1, sick: false }));
    opp.battlefield.push(perm(272, 23, 'Kormus Bell', { manaCost: '{4}', typeLine: 'Artifact' }),
      perm(273, 23, 'Swamp', { land: true, typeLine: 'Basic Land Creature - Swamp', printedType: 'Basic Land - Swamp', typeChangedBy: ['Kormus Bell'], creature: true, power: 1, toughness: 1, basePower: 1, baseToughness: 1 }),
      perm(274, 23, 'Serra Angel', { manaCost: '{3}{W}{W}', land: true, typeLine: 'Land', printedType: 'Creature - Angel', typeChangedBy: ['Imprisoned in the Moon'] }));
    view.render();
  },
  /**
   * O valor que a carta conta (item 56), com os campos que a ponte manda: na mão, Combustion Technique (3 Lições no
   * cemitério), Accumulate Wisdom (2 de 3), Ghalta (custa 7 a menos) e Craterhoof (conta a si mesma ao entrar); no campo,
   * Thassa (devoção 2 de 5) e, do oponente, Scourge of Geier Reach. `lessons` muda as Lições do cemitério, ao vivo.
   */
  counts(lessons = 3) {
    const [me, opp] = state.players;
    const lessonNames = ['Introduction to Annihilation', 'Expanded Anatomy', 'Introduction to Prophecy', 'Environmental Sciences', 'Academic Probation'];
    const spell = (id: number, name: string, manaCost: string, typeLine: string, extra = {}) => card(id, name, 10, { creature: false, manaCost, typeLine, ...extra });
    const lessonsIn = (value: number) => ({ of: 'cards', zone: 'graveyard', whose: 'you', types: ['Lesson'], qualities: [], value });
    const creatures = me.battlefield.filter((c: any) => c.creature).length;
    const power = me.battlefield.filter((c: any) => c.creature).reduce((sum: number, c: any) => sum + (c.power ?? 0), 0);
    me.graveyard = lessonNames.slice(0, lessons).map((n, i) => spell(340 + i, n, '{2}', 'Sorcery — Lesson'));
    me.hand = [
      spell(350, 'Combustion Technique', '{1}{R}', 'Instant — Lesson', { counts: [{ ...lessonsIn(lessons), uses: [{ use: 'damage', amount: 2 + lessons, plus: 2 }] }] }),
      spell(351, 'Accumulate Wisdom', '{1}{U}', 'Instant — Lesson', { counts: [{ ...lessonsIn(lessons), uses: [{ use: 'threshold', min: 3 }] }] }),
      card(352, 'Ghalta, Primal Hunger', 10, { manaCost: '{10}{G}{G}', typeLine: 'Legendary Creature — Elder Dinosaur', power: 12, toughness: 12,
        counts: [{ of: 'cards', zone: 'battlefield', whose: 'you', types: ['Creature'], qualities: [], measure: 'power', value: power, uses: [{ use: 'costLess', amount: power }] }] }),
      card(353, 'Craterhoof Behemoth', 10, { manaCost: '{5}{G}{G}{G}', typeLine: 'Creature — Beast', power: 5, toughness: 5,
        counts: [{ of: 'cards', zone: 'battlefield', whose: 'you', types: ['Creature'], qualities: [], value: creatures, entering: creatures + 1, uses: [{ use: 'pt', power: `+${creatures + 1}`, toughness: `+${creatures + 1}` }] }] }),
      land(354, 10),
    ];
    me.handCount = me.hand.length;
    if (!me.battlefield.some((c: any) => c.id === 355)) me.battlefield.push(card(355, 'Thassa, God of the Sea', 10, { creature: false, manaCost: '{2}{U}', typeLine: 'Legendary Enchantment — God', printedType: 'Legendary Enchantment Creature — God',
      counts: [{ of: 'devotion', colors: ['U'], value: 2, uses: [{ use: 'creature', min: 5 }] }] }));
    const mine = me.battlefield.filter((c: any) => c.creature).length;
    if (!opp.battlefield.some((c: any) => c.id === 356)) opp.battlefield.push(card(356, 'Scourge of Geier Reach', 23, { manaCost: '{3}{R}', typeLine: 'Creature — Elemental', power: 3 + mine, toughness: 3 + mine, basePower: 3, baseToughness: 3,
      counts: [{ of: 'cards', zone: 'battlefield', whose: 'opponents', types: ['Creature'], qualities: [], value: mine, uses: [{ use: 'pt', power: `+${mine}`, toughness: `+${mine}` }] }] }));
    state.input.actionable = [350, 351, 354];
    view.render();
  },
} });
if (new URLSearchParams(location.search).get('cenario') === 'tipo-ganho') (window as any).fixture.typeChange();
if (new URLSearchParams(location.search).get('cenario') === 'contagens') (window as any).fixture.counts(Number(new URLSearchParams(location.search).get('licoes') ?? 3));
const cenario = new URLSearchParams(location.search).get('cenario');
if (cenario === 'proliferar') (window as any).fixture.proliferate();
if (cenario === 'viradas') (window as any).fixture.faceDown();
if (cenario === 'improvisar') (window as any).fixture.improvise();
// Pagar mana à mão: ?cenario=pagar (Craw Wurm, {4}{G}{G}); toque nos terrenos e no Sol Ring para descontar.
if (cenario === 'pagar') (window as any).fixture.payMana();
// Janela de remoção: ?cenario=remocao&minhas=8&dele=3 (Wrath of God do oponente).
if (cenario === 'remocao') { const q = new URLSearchParams(location.search); (window as any).fixture.removal(Number(q.get('minhas') ?? 8), Number(q.get('dele') ?? 3)); }
// Pagamento automático com o talismã: ?cenario=automatico (agora) ou ?cenario=automatico&antes=1 (o Forge antes).
if (cenario === 'automatico') (window as any).fixture.autoPay(new URLSearchParams(location.search).has('antes'));
// Alerta de espera demorada: ?cenario=espera&quem=10&ms=185000 (10 é você, 23 o oponente).
if (cenario === 'espera') { const q = new URLSearchParams(location.search); (window as any).fixture.wait(Number(q.get('quem') ?? 10), Number(q.get('ms') ?? 125000)); }
if (cenario === 'tutor') { const p = new URLSearchParams(location.search); (window as any).fixture.tutor(Number(p.get('n') ?? 24), Number(p.get('max') ?? 1)); }
// Conexão que cai: ?cenario=reconectando&tentativa=2, ou ?cenario=conexao-perdida (&sala=1 para a partida em sala).
if (cenario === 'reconectando') view.reconnecting(Number(new URLSearchParams(location.search).get('tentativa') ?? 1));
if (cenario === 'conexao-perdida') {
  if (new URLSearchParams(location.search).get('sala')) (state as any).session = { code: 'ABCD', token: 't' };
  view.disconnected();
}
