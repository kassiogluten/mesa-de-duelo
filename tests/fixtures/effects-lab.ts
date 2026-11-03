import '../../src/style.css';
import { createForgeTableView } from '../../src/ui/forgeTable';

/*
 * Laboratório de efeitos (item 18 do roadmap): a mesa de verdade, sem a ponte, para montar o campo e disparar os
 * efeitos de dano (item 15), de movimento (item 16), os efeitos contínuos das permanentes (item 17), o mill (item 24),
 * a mão revelada do oponente (item 41, Telepathy e afins), várias fichas de uma vez (item 43) e os movimentos da 0.117.0
 * (bloqueio, luta, vidência, moeda, dado, embaralhar, equipar, controle, transformar, marcadores, busca, reanimar, conjurar
 * de outro monte, comandante, pagar, mão inicial, revelar e fim da partida).
 * Abra /tests/fixtures/effects-lab.html no `npm run dev`. A página mostra o painel e a mesa num quadro do tamanho
 * escolhido (?mesa abre só a mesa, que recebe os comandos do painel). Os eventos têm o mesmo formato que a ponte manda.
 */

type Side = 'me' | 'opp';
type Ref = { card: number } | { player: number } | { spell: true };
interface Command { cmd: string; [key: string]: any }

const ME = 10, OPP = 23;
const KEYWORDS: [string, string][] = [
  ['HEXPROOF', 'Resistência à magia'], ['WARD', 'Proteção contra alvos'], ['SHROUD', 'Manto'], ['INDESTRUCTIBLE', 'Indestrutível'],
  ['PROTECTION', 'Proteção'], ['FLYING', 'Voar'], ['DEATHTOUCH', 'Toque mortífero'], ['LIFELINK', 'Vínculo com a vida'],
  ['FIRST_STRIKE', 'Iniciativa'], ['DOUBLE_STRIKE', 'Golpe duplo'], ['VIGILANCE', 'Vigilância'], ['HASTE', 'Ímpeto'],
  ['DEFENDER', 'Defensor'], ['MENACE', 'Ameaçar'], ['TRAMPLE', 'Atropelar'], ['INFECT', 'Infectar'], ['WITHER', 'Murchar'], ['REACH', 'Alcance'],
];
const STATES: [string, string][] = [
  ['tapped', 'Virada'], ['sick', 'Enjoo de invocação'], ['token', 'Ficha'], ['faceDown', 'Virada para baixo'], ['phasedOut', 'Fora de fase'],
  ['cantAttack', 'Não pode atacar'], ['cantBlock', 'Não pode bloquear'], ['targeted', 'Alvo de algo na pilha'], ['preventDamage', 'Escudo (prevenir 3)'],
  ['P1P1', 'Marcador +1/+1'], ['M1M1', 'Marcador −1/−1'], ['copyOf', 'Cópia'], ['commander', 'Comandante (selo no dano)'],
];
const TEMPLATES: Record<string, [string, () => Record<string, unknown>]> = {
  small: ['Criatura pequena (Grizzly Bears)', () => creature('Grizzly Bears', 2, 2, '{1}{G}')],
  big: ['Criatura grande (Colossal Dreadmaw)', () => creature('Colossal Dreadmaw', 6, 6, '{4}{G}{G}', ['TRAMPLE'])],
  tapped: ['Criatura virada (Hill Giant)', () => ({ ...creature('Hill Giant', 3, 3, '{3}{R}'), tapped: true })],
  hawk: ['Toque mortífero + vínculo (Vampire Nighthawk)', () => creature('Vampire Nighthawk', 2, 3, '{1}{B}{B}', ['FLYING', 'DEATHTOUCH', 'LIFELINK'])],
  blade: ['Golpe duplo (Boros Swiftblade)', () => creature('Boros Swiftblade', 1, 2, '{R}{W}', ['DOUBLE_STRIKE'])],
  knight: ['Iniciativa + proteção (White Knight)', () => ({ ...creature('White Knight', 2, 2, '{W}{W}', ['FIRST_STRIKE', 'PROTECTION']), protection: ['black'] })],
  agent: ['Infectar (Blighted Agent)', () => creature('Blighted Agent', 1, 1, '{1}{U}', ['INFECT'])],
  ramgang: ['Murchar (Boggart Ram-Gang)', () => creature('Boggart Ram-Gang', 3, 3, '{R/G}{R/G}{R/G}', ['HASTE', 'WITHER'])],
  spawn: ['Ward {2} (Aboleth Spawn)', () => ({ ...creature('Aboleth Spawn', 2, 3, '{2}{U}', ['WARD']), ward: '{2}' })],
  myr: ['Indestrutível (Darksteel Myr)', () => ({ ...creature('Darksteel Myr', 0, 1, '{3}', ['INDESTRUCTIBLE']), typeLine: 'Artifact Creature — Myr' })],
  token: ['Ficha (Goblin)', () => ({ ...creature('Goblin', 1, 1, ''), token: true, typeLine: 'Token Creature — Goblin' })],
  walker: ['Planeswalker (Jace Beleren)', () => card('Jace Beleren', { planeswalker: true, typeLine: 'Legendary Planeswalker — Jace', manaCost: '{1}{U}{U}', counters: { LOYALTY: 3 } })],
  artifact: ['Artefato (Sol Ring)', () => card('Sol Ring', { typeLine: 'Artifact', manaCost: '{1}' })],
  enchantment: ['Encantamento (Oblivion Ring)', () => card('Oblivion Ring', { typeLine: 'Enchantment', manaCost: '{2}{W}' })],
  aura: ['Aura presa à selecionada (Pacifism)', () => card('Pacifism', { typeLine: 'Enchantment — Aura', manaCost: '{1}{W}' })],
  equipment: ['Equipamento preso à selecionada (Bonesplitter)', () => card('Bonesplitter', { typeLine: 'Artifact — Equipment', manaCost: '{1}' })],
  klass: ['Classe com nível (Druid Class)', () => card('Druid Class', { typeLine: 'Enchantment — Class', manaCost: '{1}{G}', classLevel: 2, classMaxLevel: 3 })],
  land: ['Terreno (Forest)', () => card('Forest', { land: true, typeLine: 'Basic Land — Forest' })],
  facedown: ['Virada para baixo (metamorfose)', () => ({ faceDown: true })],
};
/** Cartas que caem no cemitério ao moer, em rodízio. */
const MILL_POOL: [string, Record<string, unknown>][] = [
  ['Forest', { land: true, typeLine: 'Basic Land — Forest' }], ['Llanowar Elves', { creature: true, typeLine: 'Creature — Elf Druid', manaCost: '{G}' }],
  ['Lightning Bolt', { typeLine: 'Instant', manaCost: '{R}' }], ['Counterspell', { typeLine: 'Instant', manaCost: '{U}{U}' }],
  ['Island', { land: true, typeLine: 'Basic Land — Island' }], ['Giant Growth', { typeLine: 'Instant', manaCost: '{G}' }],
  ['Serra Angel', { creature: true, typeLine: 'Creature — Angel', manaCost: '{3}{W}{W}' }],
];
/** A mão para jogar: terrenos e criaturas, em rodízio. */
const HAND_POOL: [string, Record<string, unknown>][] = [
  ['Forest', { land: true, typeLine: 'Basic Land — Forest' }],
  ['Grizzly Bears', { creature: true, power: 2, toughness: 2, basePower: 2, baseToughness: 2, damage: 0, typeLine: 'Creature — Bear', manaCost: '{1}{G}' }],
  ['Island', { land: true, typeLine: 'Basic Land — Island' }],
  ['Serra Angel', { creature: true, power: 4, toughness: 4, basePower: 4, baseToughness: 4, damage: 0, typeLine: 'Creature — Angel', manaCost: '{3}{W}{W}', keywords: ['FLYING', 'VIGILANCE'] }],
  ['Llanowar Elves', { creature: true, power: 1, toughness: 1, basePower: 1, baseToughness: 1, damage: 0, typeLine: 'Creature — Elf Druid', manaCost: '{G}' }],
  ['Mountain', { land: true, typeLine: 'Basic Land — Mountain' }],
];
let nextId = 1000;
function card(name: string, extra: Record<string, unknown> = {}) { return { name, tapped: false, token: false, creature: false, ...extra }; }
function creature(name: string, power: number, toughness: number, manaCost: string, keywords: string[] = []) {
  return card(name, { creature: true, power, toughness, basePower: power, baseToughness: toughness, damage: 0, manaCost, typeLine: 'Creature', keywords });
}

if (new URLSearchParams(location.search).has('mesa')) table(); else panel();

// ---------------------------------------------------------------- mesa
function table() {
  const params = new URLSearchParams(location.search), slow = Number(params.get('lento')) || 1;
  const realTimeout = window.setTimeout.bind(window);
  if (slow > 1) {
    // Câmera lenta: os temporizadores e as animações da mesa andam juntos, para o voo e o que vem depois dele combinarem.
    window.setTimeout = ((fn: TimerHandler, ms = 0, ...args: unknown[]) => realTimeout(fn, ms * slow, ...args)) as typeof window.setTimeout;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>) { const a = animate.apply(this, args); a.playbackRate = 1 / slow; return a; };
  }
  let reduce = false;
  const media = window.matchMedia.bind(window);
  // "Reduzir movimento" só nesta página: a mesa pergunta ao navegador a cada efeito.
  window.matchMedia = (query: string) => query.includes('prefers-reduced-motion')
    ? { matches: reduce, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false } as MediaQueryList
    : media(query);
  const still = document.createElement('style');
  still.textContent = '*,*::before,*::after{animation-duration:0s!important;animation-iteration-count:1!important;transition:none!important}';

  let players: any[] = [];
  let state: any;
  let seq = 0;
  let batch: any[] = [];
  let commanderFlag = new Set<number>();

  function setup(full = false) {
    players = [
      { id: ME, seat: 0, name: 'Você', ai: false, life: 20, library: 40, handCount: 0, hand: [], pool: {}, graveyard: [], exile: [], battlefield: [] },
      { id: OPP, seat: 1, name: 'Oponente', ai: true, life: 20, library: 40, handCount: 4, hand: [], pool: {}, graveyard: [], exile: [], battlefield: [] },
    ];
    state = {
      type: 'state', config: { format: 'free', matchLength: 'bo1' }, you: ME, players, turn: 6, phase: 'MAIN1', activePlayer: ME, gameOver: false,
      log: [], decks: [], stack: [], combat: [], castable: [], events: [], eventCursor: seq, matchId: 'effects-lab',
      input: { gen: 1, priority: false, message: 'Laboratório de efeitos: use o painel.', ok: { label: 'OK', enabled: false }, cancel: { label: '', enabled: false }, selectable: [], actionable: [] },
    };
    commanderFlag = new Set();
    deal();
    const start: [Side, string][] = full
      ? [...(['small', 'big', 'tapped', 'hawk', 'blade', 'knight', 'agent', 'ramgang', 'spawn', 'myr', 'token', 'token', 'walker', 'artifact', 'enchantment', 'klass', 'land', 'land', 'land', 'land'] as const).map(t => ['me', t] as [Side, string]),
         ...(['small', 'small', 'big', 'hawk', 'knight', 'spawn', 'myr', 'token', 'token', 'token', 'walker', 'artifact', 'enchantment', 'facedown', 'land', 'land', 'land', 'land'] as const).map(t => ['opp', t] as [Side, string])]
      : [['me', 'big'], ['me', 'hawk'], ['me', 'blade'], ['me', 'land'], ['me', 'land'], ['opp', 'small'], ['opp', 'knight'], ['opp', 'walker'], ['opp', 'land']];
    for (const [side, t] of start) add(side, t, false);
    if (client) client.state = state;
  }
  const player = (id: number) => players.find(p => p.id === id);
  const sideOf = (side: Side) => player(side === 'me' ? ME : OPP);
  const all = () => players.flatMap(p => p.battlefield);
  const byId = (id: number) => all().find((c: any) => c.id === id);
  function add(side: Side, template: string, selected = true, attachTo?: number) {
    const owner = sideOf(side);
    const c: any = { id: nextId++, controller: owner.id, ...TEMPLATES[template][1]() };
    if (['aura', 'equipment'].includes(template)) {
      const host = byId(attachTo ?? -1) ?? owner.battlefield.find((x: any) => x.creature);
      if (host) c.attachedTo = host.id;
    }
    owner.battlefield.push(c);
    if (selected) lastAdded = c.id;
    return c;
  }
  let lastAdded: number | undefined;
  /** A permanente conjurada por dobra, que volta para o exílio no fim do turno (seção Dobra). */
  let warped = 0;
  let turnShown = false;
  /** Enche a sua mão até 6 cartas, com terrenos e criaturas. */
  function deal() {
    const me = player(ME);
    for (let i = me.hand.length; i < 6; i++) {
      const [name, extra] = HAND_POOL[i % HAND_POOL.length];
      me.hand.push({ id: nextId++, controller: ME, ...card(name, extra) });
    }
    me.handCount = me.hand.length;
  }
  /** Tira da sua mão a primeira carta que serve (terreno ou não), como a ponte faria ao jogar. */
  function fromHand(land: boolean) {
    const me = player(ME), c = me.hand.find((x: any) => !!x.land === land);
    if (!c) return undefined;
    me.hand = me.hand.filter((x: any) => x !== c); me.handCount = me.hand.length;
    return c;
  }

  function frame() {
    return structuredClone({ turn: state.turn, phase: state.phase, activePlayer: state.activePlayer, stack: state.stack, combat: state.combat,
      players: players.map(p => ({ id: p.id, life: p.life, battlefield: p.battlefield, handCount: p.handCount, library: p.library })) });
  }
  function emit(type: string, extra: Record<string, unknown>) { batch.push({ seq: ++seq, stateVersion: seq, type, ...extra, frame: frame() }); }
  function flush() {
    state.events = [...state.events, ...batch].slice(-80); state.eventCursor = seq; batch = [];
    state.input.gen++;
    // Como a ponte: um objeto novo a cada estado (a mesa guarda cálculos por estado).
    client.state = { ...state, players: players.map(p => ({ ...p })) };
    view.render(); report();
  }

  const isPlayer = (r: Ref): r is { player: number } => 'player' in r;
  const isCard = (r: Ref): r is { card: number } => 'card' in r;
  const targetsOf = (r: Ref) => ({ cards: isCard(r) ? [r.card] : [], players: isPlayer(r) ? [r.player] : [] });
  const has = (c: any, k: string) => !!c?.keywords?.includes(k);
  const bolt = () => ({ id: nextId++, name: 'Lightning Bolt', controller: ME, manaCost: '{R}', typeLine: 'Instant', text: 'Lightning Bolt deals 3 damage to any target.', tapped: false, token: false });

  /** Aplica um dano no estado e manda o evento como a ponte mandaria. */
  function damage(source: any, target: Ref, amount: number, flags: Record<string, unknown> = {}) {
    if (amount <= 0) return;
    const t = isCard(target) ? byId(target.card) : undefined;
    let prevented = 0;
    const shield = t ? t.preventDamage ?? 0 : isPlayer(target) ? player(target.player).preventDamage ?? 0 : 0;
    if (shield) {
      prevented = Math.min(shield, amount); amount -= prevented;
      if (t) t.preventDamage = shield - prevented || undefined; else if (isPlayer(target)) player(target.player).preventDamage = shield - prevented || undefined;
      emit('damage', { card: structuredClone(source), sourceId: source.id, actor: source.controller, delta: -prevented, targets: targetsOf(target), prevented: true, combat: !!flags.combat });
      if (!amount) return;
    }
    const infect = has(source, 'INFECT'), wither = has(source, 'WITHER') || (infect && !!t);
    const deathtouch = has(source, 'DEATHTOUCH'), lifelink = has(source, 'LIFELINK');
    let lethal = false;
    if (t?.planeswalker) { t.counters.LOYALTY = Math.max(0, t.counters.LOYALTY - amount); lethal = t.counters.LOYALTY <= 0; }
    else if (t?.creature) {
      if (wither) { t.toughness -= amount; t.power -= amount; t.counters = { ...t.counters, M1M1: (t.counters?.M1M1 ?? 0) + amount }; }
      else t.damage = (t.damage ?? 0) + amount;
      lethal = !has(t, 'INDESTRUCTIBLE') && (deathtouch || t.damage >= t.toughness) || t.toughness <= 0;
    } else if (isPlayer(target)) {
      const p = player(target.player);
      if (infect) p.counters = { ...p.counters, POISON: (p.counters?.POISON ?? 0) + amount };
      else lethal = p.life - amount <= 0;
    }
    const combat = !!flags.combat;
    emit('damage', { card: structuredClone(source), sourceId: source.id, actor: source.controller, delta: -amount, targets: targetsOf(target), combat,
      ...(combat ? { step: flags.step ?? 'regular' } : {}), ...(has(source, 'DOUBLE_STRIKE') ? { doubleStrike: true } : {}), ...(deathtouch ? { deathtouch: true } : {}),
      ...(lifelink ? { lifelink: true } : {}), ...(infect && isPlayer(target) ? { infect: true } : {}), ...(wither && t ? { wither: true } : {}),
      ...(t?.planeswalker ? { loyalty: true } : {}), ...(lethal ? { lethal: true } : {}), ...flags });
    if (lifelink) lifeChange(source.controller, amount);
    if (isPlayer(target) && !infect) pendingLoss.set(target.player, (pendingLoss.get(target.player) ?? 0) + amount);
    if (lethal && t) dying.add(t);
  }
  const pendingLoss = new Map<number, number>();
  const dying = new Set<any>();
  function lifeChange(id: number, delta: number) { player(id).life += delta; emit('life-changed', { actor: id, delta }); }
  /** Como no Forge: a vida cai de uma vez depois do dano, e as criaturas com dano letal morrem em seguida. */
  function settle() {
    for (const [id, n] of pendingLoss) lifeChange(id, -n);
    pendingLoss.clear();
    for (const c of dying) leave(c, 'Graveyard');
    dying.clear();
  }
  function leave(c: any, to: string, reason?: string) {
    const owner = player(c.controller);
    if (!owner.battlefield.includes(c)) return;
    owner.battlefield = owner.battlefield.filter((x: any) => x !== c && x.attachedTo !== c.id);
    const zone = to === 'Exile' ? owner.exile : to === 'Hand' ? owner.hand : owner.graveyard;
    if (to === 'Hand') owner.handCount++;
    zone.push({ ...c, damage: 0, tapped: false });
    emit('left', { card: structuredClone(c), sourceId: c.id, actor: c.controller, from: 'Battlefield', to, ...(reason ? { reason } : {}) });
  }

  const sourceCard = (r: Ref) => isCard(r) ? byId(r.card) : undefined;
  function withSpell(fn: (spell: any) => void) {
    const spell = bolt();
    state.phase = 'MAIN1'; state.combat = [];
    state.stack = [{ id: nextId++, text: spell.text, source: spell, controller: ME }];
    fn(spell);
    state.stack = []; player(ME).graveyard.push(spell);
    settle();
    emit('resolved', { card: structuredClone(spell), sourceId: spell.id, actor: ME, from: 'Stack', to: 'Graveyard' });
  }
  /** Combate: a fonte ataca; se o alvo for uma criatura, ela bloqueia e revida. Palavras-chave da fonte valem. */
  function combat(attacker: any, target: Ref, extra: Record<string, unknown> = {}) {
    const blocker = isCard(target) ? byId(target.card) : undefined;
    const defender = blocker ? blocker.controller : isPlayer(target) ? target.player : attacker.controller === ME ? OPP : ME;
    state.phase = 'COMBAT_DAMAGE'; state.activePlayer = attacker.controller;
    state.combat = [{ attacker: attacker.id, defender: blocker && !blocker.creature ? blocker.id : defender, defenderKind: blocker && !blocker.creature ? 'card' : 'player', blockers: blocker?.creature ? [blocker.id] : [] }];
    attacker.attacking = true; if (!has(attacker, 'VIGILANCE')) attacker.tapped = true;
    if (blocker?.creature) blocker.blocking = true;
    const commander = commanderFlag.has(attacker.id) ? { commander: true } : {};
    const strike = (step: 'first-strike' | 'regular', a: any, b: any, toBlocker: boolean) => {
      const power = Math.max(0, a.power);
      if (toBlocker && b) {
        const needed = has(a, 'DEATHTOUCH') ? 1 : Math.max(0, (b.toughness ?? 0) - (b.damage ?? 0));
        const onBlocker = has(a, 'TRAMPLE') ? Math.min(power, Math.max(needed, 0)) : power;
        damage(a, { card: b.id }, onBlocker, { combat: true, step });
        if (has(a, 'TRAMPLE') && power > onBlocker) damage(a, { player: b.controller }, power - onBlocker, { combat: true, step, trample: true, ...commander });
      } else damage(a, b ? { card: b.id } : { player: defender }, power, { combat: true, step, ...(b ? {} : commander) });
    };
    const firsts = (c: any) => has(c, 'FIRST_STRIKE') || has(c, 'DOUBLE_STRIKE');
    const regulars = (c: any) => !has(c, 'FIRST_STRIKE') || has(c, 'DOUBLE_STRIKE');
    const fighting = blocker?.creature ? blocker : undefined;
    const targetCard = blocker && !blocker.creature ? blocker : undefined;
    for (const step of ['first-strike', 'regular'] as const) {
      const go = step === 'first-strike' ? firsts : regulars;
      if (go(attacker) && !dying.has(attacker)) strike(step, attacker, fighting ?? targetCard, !!fighting);
      if (fighting && go(fighting) && !dying.has(fighting)) strike(step, fighting, attacker, false);
      settle();
    }
    Object.assign(attacker, extra.restore ?? {});
    attacker.attacking = false; if (fighting) fighting.blocking = false;
    state.combat = []; state.phase = 'COMBAT_END';
  }

  const commands: Record<string, (c: Command) => string | void> = {
    add: c => { add(c.side, c.template, true, c.attachTo); return `${TEMPLATES[c.template][0]} adicionada.`; },
    remove: c => { for (const p of players) p.battlefield = p.battlefield.filter((x: any) => x.id !== c.id && x.attachedTo !== c.id); return 'Removida.'; },
    clear: () => { for (const p of players) p.battlefield = []; return 'Campo limpo.'; },
    reset: () => { setup(); return 'Mesa de volta ao começo.'; },
    full: () => { setup(true); return 'Campo cheio: confira sobreposição e desempenho.'; },
    mill: c => {
      // Como a ponte: um evento por carta, do topo do grimório para o cemitério, com a mágica que mandou moer.
      const owner = sideOf(c.side), n = Math.min(Number(c.n), owner.library);
      if (!n) return 'O grimório está vazio.';
      for (let i = 0; i < n; i++) {
        const [name, extra] = MILL_POOL[(nextId + i) % MILL_POOL.length];
        const milled = { id: nextId++, controller: owner.id, ...card(name, extra) };
        owner.library--; owner.graveyard.push(milled);
        emit('mill', { card: structuredClone(milled), sourceId: milled.id, actor: owner.id, from: 'Library', to: 'Graveyard', sourceName: c.surveil ? 'Consider' : 'Thought Scour', ...(c.surveil ? { surveil: true } : {}) });
      }
      return c.surveil ? `Vidência: ${n} carta${n === 1 ? '' : 's'} do grimório para o cemitério.` : `Moer ${n}: as cartas saem do topo, viram e caem no cemitério; "−${n}" junto ao grimório.`;
    },
    tokens: c => {
      // Como a ponte: um `entered` por ficha, todas com a mesma resolução (`stackId`); a mesa junta num movimento só.
      const owner = sideOf(c.side), n = Number(c.n), resolution = nextId++;
      const kinds: [string, string][] = c.mixed ? [['Soldier', 'Token Creature — Soldier'], ['Spirit', 'Token Creature — Spirit']] : [['Soldier', 'Token Creature — Soldier']];
      for (let i = 0; i < n; i++) {
        const [name, typeLine] = kinds[i % kinds.length];
        const token = { id: nextId++, controller: owner.id, ...card(name, { token: true, creature: true, power: 1, toughness: 1, basePower: 1, baseToughness: 1, damage: 0, sick: true, typeLine, keywords: name === 'Spirit' ? ['FLYING'] : [] }) };
        owner.battlefield.push(token);
        emit('entered', { card: structuredClone(token), sourceId: token.id, actor: owner.id, from: null, to: 'Battlefield', stackId: resolution, sourceName: 'Raise the Alarm' });
      }
      return `Criar ${n} fichas: chegam juntas, em cascata curta, e o monte mostra "+${n}".`;
    },
    toggle: c => {
      const x = byId(c.id); if (!x) return;
      const on = !!c.value;
      if (KEYWORDS.some(([k]) => k === c.key)) {
        x.keywords = on ? [...new Set([...(x.keywords ?? []), c.key])] : (x.keywords ?? []).filter((k: string) => k !== c.key);
        if (c.key === 'WARD') x.ward = on ? c.ward || '{2}' : undefined;
        if (c.key === 'PROTECTION') x.protection = on ? (c.protection || 'red').split(',') : undefined;
      } else if (c.key === 'P1P1' || c.key === 'M1M1') {
        const n = on ? 1 : 0; const sign = c.key === 'P1P1' ? 1 : -1, before = x.counters?.[c.key] ?? 0;
        x.counters = { ...x.counters, [c.key]: n }; if (!n) delete x.counters[c.key];
        if (x.creature) { x.power += sign * (n - before); x.toughness += sign * (n - before); }
      } else if (c.key === 'preventDamage') x.preventDamage = on ? 3 : undefined;
      else if (c.key === 'copyOf') x.copyOf = on ? 'Clone' : undefined;
      else if (c.key === 'commander') { if (on) commanderFlag.add(x.id); else commanderFlag.delete(x.id); }
      else if (c.key === 'targeted') {
        state.stack = state.stack.filter((s: any) => !s.labTarget || s.labTarget !== x.id);
        if (on) { const spell = bolt(); state.stack.push({ id: nextId++, text: spell.text, source: spell, controller: x.controller === ME ? OPP : ME, targets: { cards: [x.id], players: [] }, labTarget: x.id }); }
      } else if (c.key === 'faceDown') {
        if (on) { x.labFace = { ...x }; for (const k of Object.keys(x)) if (!['id', 'controller', 'tapped', 'token', 'labFace'].includes(k)) delete x[k]; x.faceDown = true; }
        else if (x.labFace) { const { labFace } = x; for (const k of Object.keys(x)) delete x[k]; Object.assign(x, labFace, { tapped: x.tapped }); }
      } else x[c.key] = on || undefined;
    },
    damage: c => {
      const amount = Math.max(1, Number(c.amount) || 1);
      const src = sourceCard(c.source), tgt: Ref = c.target;
      const tgtCard = isCard(tgt) ? byId(tgt.card) : undefined;
      const fromSpell = !src || c.source.spell;
      const attackerFor = (keyword?: string) => {
        if (!src?.creature) return null;
        const restore = keyword && !has(src, keyword) ? { keywords: [...(src.keywords ?? [])] } : undefined;
        if (keyword && !has(src, keyword)) src.keywords = [...(src.keywords ?? []), keyword];
        return { src, restore };
      };
      switch (c.kind) {
        case 'burn': if (fromSpell) withSpell(spell => damage(spell, tgt, amount)); else { damage(src, tgt, amount); settle(); } return 'Dano direto: projétil da fonte até o alvo.';
        case 'lethal': {
          const n = tgtCard?.planeswalker ? tgtCard.counters.LOYALTY : tgtCard?.creature ? Math.max(1, tgtCard.toughness - (tgtCard.damage ?? 0)) : isPlayer(tgt) ? player(tgt.player).life : amount;
          withSpell(spell => damage(spell, tgt, n)); return 'Dano letal: na criatura, treme e escurece; no jogador, impacto maior e a mesa treme.';
        }
        case 'prevented': {
          if (tgtCard) tgtCard.preventDamage = (tgtCard.preventDamage ?? 0) + amount; else if (isPlayer(tgt)) player(tgt.player).preventDamage = (player(tgt.player).preventDamage ?? 0) + amount;
          withSpell(spell => damage(spell, tgt, amount + 1)); return `Escudo de ${amount}: domo azul com o número riscado; passa 1 de dano.`;
        }
        case 'divided': {
          const others: Ref[] = [{ player: OPP }, ...sideOf('opp').battlefield.filter((x: any) => x.creature).map((x: any) => ({ card: x.id }))]
            .filter(r => JSON.stringify(r) !== JSON.stringify(tgt)).slice(0, 2);
          withSpell(spell => [tgt, ...others].forEach(r => damage(spell, r, Math.max(1, Math.round(amount / 3)))));
          return 'Dano dividido: os projéteis saem juntos da mesma fonte, cada um com seu número.';
        }
        case 'pain': { const s = src ?? sideOf('me').battlefield.find((x: any) => x.land) ?? bolt(); damage(s, { player: s.controller ?? ME }, amount, { self: true }); settle(); return 'Dor: o dano acontece no próprio retrato, sem trajeto.'; }
        default: {
          const keyword = ({ trample: 'TRAMPLE', double: 'DOUBLE_STRIKE', first: 'FIRST_STRIKE', deathtouch: 'DEATHTOUCH', lifelink: 'LIFELINK', infect: 'INFECT', wither: 'WITHER' } as Record<string, string>)[c.kind];
          const a = attackerFor(keyword);
          if (!a) return 'Escolha como fonte uma criatura no campo.';
          if (c.kind === 'trample' && !tgtCard?.creature) return 'Atropelar: escolha como alvo uma criatura (ela bloqueia, o excesso vai para o jogador).';
          combat(a.src, tgt, { restore: a.restore });
          return ({ combat: 'Combate: o atacante avança até o alvo; uma criatura bloqueia e revida.', trample: 'Atropelar: o excesso segue até o jogador com o selo.',
            double: 'Golpe duplo: "1º golpe" e "2º golpe".', first: 'Iniciativa: o golpe sai antes do revide.', deathtouch: 'Toque mortífero: caveira e morte com qualquer dano.',
            lifelink: 'Vínculo com a vida: "+N" verde no retrato de quem controla.', infect: 'Infectar: veneno no jogador, −1/−1 na criatura.', wither: 'Murchar: marcadores −1/−1 em roxo.' } as Record<string, string>)[c.kind];
        }
      }
    },
    move: c => {
      const x = byId(c.id); if (!x) return 'Escolha uma permanente.';
      switch (c.kind) {
        case 'destroy': if (has(x, 'INDESTRUCTIBLE')) return 'Indestrutível: não sai do campo.'; leave(x, 'Graveyard', 'destroyed'); return 'Destruída: racha e cai no cemitério.';
        case 'sacrifice': leave(x, 'Graveyard', 'sacrificed'); return 'Sacrificada: afunda e vai para o cemitério.';
        case 'exile': leave(x, 'Exile'); return 'Exilada: se desfaz em luz.';
        case 'bounce': leave(x, 'Hand'); return 'Devolvida: sobe e voa até a mão.';
        case 'blink': {
          leave(x, 'Exile');
          const owner = player(x.controller); owner.exile = owner.exile.filter((e: any) => e.id !== x.id);
          const back = { ...x, tapped: false, damage: 0, sick: !!x.creature };
          owner.battlefield.push(back);
          emit('entered', { card: structuredClone(back), sourceId: back.id, actor: back.controller, from: 'Exile', to: 'Battlefield' });
          return 'Blink: some em luz e volta no mesmo lugar.';
        }
        case 'tap': x.tapped = !x.tapped; return x.tapped ? 'Virada, com peso.' : 'Desvirada.';
        case 'attack': {
          // Declarar ataque, como a ponte manda: a criatura vira, fica atacando e a mesa mostra "attackers".
          if (!x.creature) return 'Escolha uma criatura.';
          const defender = x.controller === ME ? OPP : ME;
          x.attacking = true; if (!has(x, 'VIGILANCE')) x.tapped = true;
          state.phase = 'COMBAT_DECLARE_ATTACKERS'; state.activePlayer = x.controller;
          state.combat = [{ attacker: x.id, defender, defenderKind: 'player', blockers: [] }];
          emit('attackers', { actor: x.controller, attackers: [x.id] });
          setTimeout(() => { x.attacking = false; state.combat = []; state.phase = 'MAIN1'; flush(); }, 2500);
          return 'Ataque: a criatura recua um pouco, avança na direção do oponente e volta.';
        }
        case 'untap-all': { const side = player(x.controller); side.battlefield.forEach((y: any) => { y.tapped = false; }); return 'Desvirar tudo: em onda.'; }
        case 'tap-all': { const side = player(x.controller); side.battlefield.forEach((y: any) => { if (y.land || y.creature) y.tapped = true; }); return 'Virou tudo.'; }
        case 'trigger': case 'ability': {
          const target: Ref = c.target;
          emit('ability-activated', { card: structuredClone(x), sourceId: x.id, actor: x.controller, trigger: c.kind === 'trigger', text: 'Habilidade', targets: targetsOf(target), stackId: nextId++, to: 'Stack' });
          return c.kind === 'trigger' ? 'Gatilho: aviso com o raio e feixe roxo até o alvo.' : 'Habilidade ativada: engrenagem e feixe dourado até o alvo.';
        }
      }
    },
    // Planeswalker (item 80): a entrada e as habilidades de lealdade, como a ponte manda (custo, ultimate e o texto da pilha).
    walker: c => {
      const owner = sideOf(c.side);
      if (c.kind === 'enter' || c.kind === 'enter-gold') {
        const gold = c.kind === 'enter-gold';
        const w = { id: nextId++, controller: owner.id, ...card(gold ? 'Nicol Bolas, Dragon-God' : 'Jace Beleren', { planeswalker: true,
          typeLine: gold ? 'Legendary Planeswalker — Bolas' : 'Legendary Planeswalker — Jace', manaCost: gold ? '{U}{B}{B}{B}{R}' : '{1}{U}{U}', counters: { LOYALTY: gold ? 4 : 3 } }) };
        owner.battlefield.push(w); lastAdded = w.id;
        emit('entered', { card: structuredClone(w), sourceId: w.id, actor: owner.id, from: 'Stack', to: 'Battlefield' });
        return `${w.name} entra: moldura na cor dele, anel de luz e o escudo de lealdade surgindo.`;
      }
      const picked = byId(c.id);
      const w: any = picked?.planeswalker ? picked : [...owner.battlefield].reverse().find((x: any) => x.planeswalker);
      if (!w) return 'Ponha um planeswalker no campo primeiro (Entrar).';
      const [cost, text] = ({ plus: ['+2', 'Each player draws a card.'], zero: ['0', 'Look at the top card of target player\'s library.'],
        minus: ['-1', 'Target player draws a card.'], ult: ['-10', 'Target player mills twenty cards.'] } as Record<string, [string, string]>)[c.kind];
      w.counters = { ...w.counters, LOYALTY: Math.max(0, (w.counters?.LOYALTY ?? 0) + Number(cost)) };
      const ultimate = c.kind === 'ult';
      emit('ability-activated', { card: structuredClone(w), sourceId: w.id, actor: w.controller, text: `${w.name} - ${text}`, targets: { cards: [], players: cost === '+2' ? [] : [w.controller === ME ? OPP : ME] },
        stackId: nextId++, to: 'Stack', loyalty: true, cost, ...(ultimate ? { ultimate: true } : {}) });
      return ultimate ? 'Ultimate: onda de luz pela mesa, aviso maior e o som da lealdade mais grave.' : `Lealdade ${cost.replace('-', '−')}: o escudo reage e o custo flutua acima dele.`;
    },
    // Dobra (item 86): conjurada pelo custo de dobra (a pilha diz cast.mode "warp") e, no fim do turno, de volta ao exílio.
    warp: c => {
      const me = player(ME);
      if (c.kind === 'cast') {
        const kite = { id: nextId++, controller: ME, ...card('Nova Hellkite', { creature: true, power: 4, toughness: 5, keywords: ['FLYING', 'HASTE'], typeLine: 'Creature — Dragon', manaCost: '{3}{R}{R}' }) };
        const stackId = nextId++;
        state.stack = [{ id: stackId, kind: 'spell', text: 'Nova Hellkite', source: structuredClone(kite), controller: ME, cast: { mode: 'warp' } }];
        emit('spell-cast', { card: structuredClone(kite), sourceId: kite.id, actor: ME, from: 'Hand', to: 'Stack', stackId });
        flush();
        setTimeout(() => {
          state.stack = []; me.battlefield.push(kite); lastAdded = kite.id; warped = kite.id;
          emit('resolved', { card: structuredClone(kite), sourceId: kite.id, actor: ME, stackId, from: 'Stack', to: 'Battlefield' });
          emit('entered', { card: structuredClone(kite), sourceId: kite.id, actor: ME, from: 'Stack', to: 'Battlefield' });
          flush();
        }, 1400);
        return 'Dobra: a carta chega à pilha rasgando o espaço (anel violeta e ciano), com o som de conjurar mais grave e com eco.';
      }
      const kite = me.battlefield.find((x: any) => x.id === warped);
      if (!kite) return 'Conjure por dobra primeiro.';
      me.battlefield = me.battlefield.filter((x: any) => x !== kite); me.exile = [...(me.exile ?? []), kite]; warped = 0;
      emit('left', { card: structuredClone(kite), sourceId: kite.id, actor: ME, from: 'Battlefield', to: 'Exile', reason: 'warped' });
      return 'Fim do turno: a permanente conjurada por dobra volta para o exílio com um rasgo menor no lugar dela.';
    },
    // Mão revelada (item 41): a ponte manda em revealedHand as cartas que você pode ver; esconder é tirar o campo.
    reveal: c => {
      const opp = sideOf('opp');
      const hand = ['Counterspell', 'Lightning Bolt', 'Serra Angel', 'Island'].map(name => ({ id: nextId++, controller: OPP, ...card(name, ({
        Counterspell: { typeLine: 'Instant', manaCost: '{U}{U}' }, 'Lightning Bolt': { typeLine: 'Instant', manaCost: '{R}' },
        'Serra Angel': { creature: true, power: 4, toughness: 4, typeLine: 'Creature — Angel', manaCost: '{3}{W}{W}' }, Island: { land: true, typeLine: 'Basic Land — Island' } } as Record<string, Record<string, unknown>>)[name]) }));
      opp.handCount = hand.length;
      if (c.kind === 'none') { delete opp.revealedHand; return 'Mão do oponente escondida de novo: o leque volta a ficar de costas.'; }
      opp.revealedHand = c.kind === 'one' ? hand.slice(0, 1) : hand;
      return c.kind === 'one' ? 'Uma carta da mão à vista: ela fica de face para cima e as outras de costas.' : 'Mão revelada (Telepathy): o leque do oponente vira de face para cima; toque numa carta para inspecionar.';
    },
    // Jogar da mão: o terreno vai direto ao campo; a criatura vai à pilha e, depois de um tempo, resolve e entra.
    hand: c => {
      const me = player(ME);
      if (c.kind === 'deal') { deal(); return 'Mão cheia de novo.'; }
      if (c.kind === 'draw') {
        // Como a ponte: um evento "draw" por carta, só com quem comprou; a carta nova aparece na mão.
        const [name, extra] = HAND_POOL[nextId % HAND_POOL.length];
        me.hand.push({ id: nextId++, controller: ME, ...card(name, extra) }); me.handCount = me.hand.length; me.library--;
        // A mesa só mostra o voo da compra depois que a partida começou (o primeiro turno passou pela mesa).
        if (!turnShown) { turnShown = true; emit('turn', { actor: ME, turn: state.turn }); }
        emit('draw', { actor: ME });
        return 'Compra: sobe do grimório em arco e vira de face para cima no leque.';
      }
      if (c.kind === 'bolt') {
        // Lightning Bolt da mão: entra no leque, vai à pilha, causa 3 ao oponente e cai no cemitério.
        const spell = { ...bolt(), id: nextId++ };
        me.hand.push(spell); me.handCount = me.hand.length;
        setTimeout(() => {
          me.hand = me.hand.filter((x: any) => x !== spell); me.handCount = me.hand.length;
          const stackId = nextId++;
          state.stack = [{ id: stackId, text: spell.text, source: structuredClone(spell), controller: ME }];
          emit('spell-cast', { card: structuredClone(spell), sourceId: spell.id, actor: ME, from: 'Hand', to: 'Stack', stackId, targets: { players: [OPP], cards: [] } });
          flush();
          setTimeout(() => {
            damage(spell, { player: OPP }, 3); settle();
            state.stack = []; me.graveyard.push(spell);
            emit('resolved', { card: structuredClone(spell), sourceId: spell.id, actor: ME, stackId, from: 'Stack', to: 'Graveyard', targets: { players: [OPP], cards: [] } });
            flush();
          }, 1200);
        }, 600);
        return 'Lightning Bolt: da mão para a pilha; o raio sai da pilha e a carta cai no cemitério.';
      }
      const picked = fromHand(c.kind === 'land');
      if (!picked) return c.kind === 'land' ? 'Não há terreno na mão: use "Encher a mão".' : 'Não há criatura na mão: use "Encher a mão".';
      if (c.kind === 'land') {
        me.battlefield.push(picked); lastAdded = picked.id;
        emit('land-played', { card: structuredClone(picked), sourceId: picked.id, actor: ME, to: 'Battlefield' });
        emit('entered', { card: structuredClone(picked), sourceId: picked.id, actor: ME, from: 'Hand', to: 'Battlefield' });
        return `${picked.name}: sai do leque, voa em arco e pousa no campo.`;
      }
      const stackId = nextId++;
      state.stack = [{ id: stackId, text: picked.name, source: structuredClone(picked), controller: ME }];
      emit('spell-cast', { card: structuredClone(picked), sourceId: picked.id, actor: ME, from: 'Hand', to: 'Stack', stackId });
      setTimeout(() => {
        state.stack = [];
        if (c.kind === 'countered') {
          me.graveyard.push(picked);
          emit('countered', { card: structuredClone(picked), sourceId: picked.id, actor: ME, stackId, from: 'Stack', to: 'Graveyard' });
          flush();
          return;
        }
        const arrived = { ...picked, sick: true };
        me.battlefield.push(arrived); lastAdded = arrived.id;
        emit('entered', { card: structuredClone(arrived), sourceId: arrived.id, actor: ME, from: 'Stack', to: 'Battlefield' });
        emit('resolved', { card: structuredClone(arrived), sourceId: arrived.id, actor: ME, stackId, from: 'Stack', to: 'Battlefield' });
        flush();
      }, 1200);
      return c.kind === 'countered' ? `${picked.name}: sai do leque para a pilha, é anulada, racha e cai no cemitério.` : `${picked.name}: sai do leque para a pilha e, ao resolver, pousa no campo.`;
    },
    style: c => {
      try { localStorage.setItem('mesa:cards', c.value); } catch { /* opcional */ }
      const select = document.querySelector<HTMLSelectElement>('#fCardStyle');
      if (select) { select.value = c.value; select.dispatchEvent(new Event('change', { bubbles: true })); }
      return c.value === 'art' ? 'Cartas em arte e texto.' : c.value === 'arena' ? 'Cartas no estilo Arena: só a arte no campo.' : 'Cartas com a imagem inteira.';
    },
    // Movimentos da 0.117.0: um botão para cada um, como a ponte manda (o selecionado é a permanente escolhida no painel).
    extra: c => {
      const me = player(ME), opp = player(OPP);
      const picked = byId(c.id);
      const mineFirst = (side: any, test: (x: any) => boolean) => side.battlefield.find(test);
      switch (c.kind) {
        case 'block': {
          const attacker = mineFirst(me, (x: any) => x.creature) ?? add('me', 'big', false);
          const blocker = mineFirst(opp, (x: any) => x.creature) ?? add('opp', 'small', false);
          attacker.attacking = true; attacker.tapped = true; blocker.blocking = true;
          state.phase = 'COMBAT_DECLARE_BLOCKERS'; state.activePlayer = ME;
          state.combat = [{ attacker: attacker.id, defender: OPP, defenderKind: 'player', blockers: [blocker.id] }];
          emit('blockers', { actor: OPP, cards: [blocker.id] });
          setTimeout(() => { attacker.attacking = false; blocker.blocking = false; state.combat = []; state.phase = 'MAIN1'; flush(); }, 2600);
          return 'Bloqueio: o bloqueador desliza até o atacante e volta, com a ligação acesa.';
        }
        case 'fight': {
          const a = mineFirst(me, (x: any) => x.creature) ?? add('me', 'big', false);
          const b = mineFirst(opp, (x: any) => x.creature) ?? add('opp', 'small', false);
          const spell = { id: nextId++, name: 'Prey Upon', controller: ME, manaCost: '{G}', typeLine: 'Sorcery', tapped: false, token: false };
          state.stack = [{ id: nextId++, text: 'Prey Upon', source: spell, controller: ME }];
          damage(a, { card: b.id }, a.power, { fight: true });
          damage(b, { card: a.id }, b.power, { fight: true });
          state.stack = []; me.graveyard.push(spell);
          settle();
          return 'Luta: as duas criaturas avançam juntas e se chocam no meio.';
        }
        case 'scry': emit('scry', { actor: c.side === 'opp' ? OPP : ME, top: 1, bottom: 2 }); return 'Vidência 3: as cartas sobem em leque; uma volta por cima e duas passam por baixo.';
        case 'coin': emit('coin', { actor: ME, heads: Math.random() < .5 }); return 'Moeda: gira no ar e cai no resultado.';
        case 'die': emit('die', { actor: ME, sides: 20, result: 1 + Math.floor(Math.random() * 20), sourceName: 'Delina, Wild Mage' }); return 'Dado: rola, troca de número e para no resultado.';
        case 'shuffle': emit('shuffle', { actor: c.side === 'opp' ? OPP : ME }); return 'Embaralhar: o grimório balança e as metades se abrem.';
        case 'attach': {
          const host = picked?.creature ? picked : mineFirst(me, (x: any) => x.creature);
          if (!host) return 'Escolha uma criatura.';
          let blade = all().find((x: any) => x.name === 'Bonesplitter');
          const moved = !!blade?.attachedTo;
          if (!blade) { blade = add(host.controller === ME ? 'me' : 'opp', 'equipment', false); delete blade.attachedTo; flush(); }
          blade.attachedTo = host.id;
          emit('attached', { card: structuredClone(blade), sourceId: blade.id, actor: blade.controller, targets: { cards: [host.id], players: [] }, ...(moved ? { moved: true } : {}) });
          return moved ? 'Equipar: o Bonesplitter passa para a criatura escolhida.' : 'Equipar: o Bonesplitter se prende à criatura escolhida.';
        }
        case 'control': {
          const x = picked ?? mineFirst(opp, (y: any) => y.creature);
          if (!x) return 'Escolha uma permanente.';
          const from = player(x.controller), to = x.controller === ME ? opp : me;
          from.battlefield = from.battlefield.filter((y: any) => y !== x); x.controller = to.id; to.battlefield.push(x);
          emit('control-changed', { card: structuredClone(x), sourceId: x.id, actor: to.id, previous: from.id });
          return 'Troca de controle: a carta atravessa a mesa e chega na cor do novo dono.';
        }
        case 'transform': {
          // Uma carta que já estava no campo: a mesa percebe a troca de face pelo nome que muda.
          const x = picked ?? mineFirst(me, (y: any) => y.creature);
          if (!x) return 'Ponha uma criatura no campo primeiro.';
          x.name = x.name === 'Insectile Aberration' ? 'Delver of Secrets' : 'Insectile Aberration';
          Object.assign(x, x.name === 'Insectile Aberration' ? { power: 3, toughness: 2, keywords: ['FLYING'], manaCost: '' } : { power: 1, toughness: 1, keywords: [], manaCost: '{U}' });
          return 'Transformar: a carta gira no lugar e mostra a outra face.';
        }
        case 'counters': case 'lore': {
          if (c.kind === 'lore') {
            let saga = all().find((x: any) => x.name === 'The Eldest Reborn');
            if (!saga) { saga = card('The Eldest Reborn', { typeLine: 'Enchantment — Saga', manaCost: '{4}{B}', counters: { LORE: 0 } }); saga.id = nextId++; saga.controller = ME; me.battlefield.push(saga); flush(); }
            saga.counters = { LORE: Math.min(3, (saga.counters?.LORE ?? 0) + 1) };
            emit('counters', { card: structuredClone(saga), sourceId: saga.id, actor: ME, counter: 'LORE', delta: 1 });
            return `Saga: capítulo ${['', 'I', 'II', 'III'][saga.counters.LORE]}.`;
          }
          const creatures = [...me.battlefield, ...opp.battlefield].filter((x: any) => x.creature).slice(0, 3);
          for (const x of creatures) {
            x.counters = { ...x.counters, P1P1: (x.counters?.P1P1 ?? 0) + 1 }; x.power++; x.toughness++;
            emit('counters', { card: structuredClone(x), sourceId: x.id, actor: x.controller, counter: 'P1P1', delta: 1 });
          }
          return 'Marcadores +1/+1: cada criatura cresce e o "+1/+1" sobe dela (um som só).';
        }
        case 'search': {
          const [name, extra] = HAND_POOL[1];
          me.hand.push({ id: nextId++, controller: ME, ...card(name, extra) }); me.handCount = me.hand.length; me.library--;
          if (!turnShown) { turnShown = true; emit('turn', { actor: ME, turn: state.turn }); }
          emit('draw', { actor: ME, searched: true });
          emit('shuffle', { actor: ME });
          return 'Busca no grimório: a carta sai dourada, e o grimório embaralha depois.';
        }
        case 'reanimate': {
          const dead = { id: nextId++, controller: ME, ...creature('Serra Angel', 4, 4, '{3}{W}{W}', ['FLYING', 'VIGILANCE']) };
          me.graveyard.push(dead); flush();
          setTimeout(() => {
            me.graveyard = me.graveyard.filter((x: any) => x !== dead);
            const back = { ...dead, sick: true }; me.battlefield.push(back);
            emit('entered', { card: structuredClone(back), sourceId: back.id, actor: ME, from: 'Graveyard', to: 'Battlefield' });
            flush();
          }, 700);
          return 'Reanimar: a carta sobe do cemitério em arco e chega com um anel roxo.';
        }
        case 'flashback': {
          const spell = { ...bolt(), name: 'Faithless Looting', manaCost: '{R}', typeLine: 'Sorcery', text: 'Draw two cards, then discard two cards.' };
          me.graveyard.push(spell); flush();
          setTimeout(() => {
            me.graveyard = me.graveyard.filter((x: any) => x !== spell);
            const stackId = nextId++;
            state.stack = [{ id: stackId, text: spell.text, source: structuredClone(spell), controller: ME }];
            emit('spell-cast', { card: structuredClone(spell), sourceId: spell.id, actor: ME, from: 'Graveyard', to: 'Stack', stackId });
            flush();
            setTimeout(() => { state.stack = []; me.exile.push(spell); emit('resolved', { card: structuredClone(spell), sourceId: spell.id, actor: ME, stackId, from: 'Stack', to: 'Exile' }); flush(); }, 1200);
          }, 700);
          return 'Conjurar do cemitério: a carta sai do cemitério com brilho roxo até a pilha.';
        }
        case 'commander': {
          // O seu comandante: volta à zona de comando ou é conjurado de lá (a taxa sobe 2).
          const cmd = { id: me.commanderId ?? nextId++, controller: ME, ...creature('Atraxa, Praetors\' Voice', 4, 4, '{G}{W}{U}{B}', ['FLYING', 'VIGILANCE', 'DEATHTOUCH', 'LIFELINK']), commander: true };
          me.commanderId = cmd.id;
          const onField = me.battlefield.find((x: any) => x.id === cmd.id);
          me.commanders = [{ id: cmd.id, name: cmd.name, tax: me.commanderTax ?? 0, casts: (me.commanderTax ?? 0) / 2 }];
          if (onField) {
            me.battlefield = me.battlefield.filter((x: any) => x !== onField);
            me.commandZone = [structuredClone(onField)];
            emit('left', { card: structuredClone(onField), sourceId: onField.id, actor: ME, from: 'Battlefield', to: 'Command' });
            return 'Comandante volta à zona de comando: voa em arco e a zona ganha uma onda dourada.';
          }
          me.commandZone = [cmd]; flush();
          setTimeout(() => {
            me.commandZone = []; me.commanderTax = (me.commanderTax ?? 0) + 2;
            me.commanders = [{ id: cmd.id, name: cmd.name, tax: me.commanderTax, casts: me.commanderTax / 2 }];
            const stackId = nextId++;
            state.stack = [{ id: stackId, text: cmd.name, source: structuredClone(cmd), controller: ME }];
            emit('spell-cast', { card: structuredClone(cmd), sourceId: cmd.id, actor: ME, from: 'Command', to: 'Stack', stackId });
            flush();
            setTimeout(() => {
              state.stack = []; const arrived = { ...cmd, sick: true }; me.battlefield.push(arrived);
              emit('entered', { card: structuredClone(arrived), sourceId: arrived.id, actor: ME, from: 'Stack', to: 'Battlefield' });
              emit('resolved', { card: structuredClone(arrived), sourceId: arrived.id, actor: ME, stackId, from: 'Stack', to: 'Battlefield' });
              flush();
            }, 1200);
          }, 700);
          return 'Comandante conjurado da zona de comando: sai dourado e a taxa "+2" sobe.';
        }
        case 'ability': {
          const x = picked ?? mineFirst(me, (y: any) => y.creature);
          if (!x) return 'Escolha uma permanente.';
          emit('ability-activated', { card: structuredClone(x), sourceId: x.id, actor: x.controller, text: 'Habilidade', targets: { cards: [], players: [] }, stackId: nextId++, to: 'Stack' });
          return 'Habilidade ativada: a carta se ergue um pouco da mesa e assenta.';
        }
        case 'pay': {
          // Pagando um custo: cada terreno que vira solta a mana até a caixa de ação.
          const lands = me.battlefield.filter((x: any) => x.land && !x.tapped).slice(0, 3);
          if (!lands.length) { add('me', 'land', false); add('me', 'land', false); return 'Pus dois terrenos: aperte de novo.'; }
          state.input = { ...state.input, paying: true, priority: false, message: 'Pague {2}{G}', ok: { label: 'OK', enabled: false }, cancel: { label: 'Cancelar', enabled: true } };
          lands.forEach((x: any, i: number) => setTimeout(() => { x.tapped = true; flush(); }, 300 + i * 450));
          setTimeout(() => { state.input = { ...state.input, paying: false, message: 'Laboratório de efeitos: use o painel.', cancel: { label: '', enabled: false } }; flush(); }, 300 + lands.length * 450 + 500);
          return 'Pagar: a mana sai de cada terreno que vira e voa até o custo.';
        }
        case 'opening': case 'mulligan': {
          const hand = Array.from({ length: 7 }, (_, i) => { const [name, extra] = HAND_POOL[(i + (c.kind === 'mulligan' ? 3 : 0)) % HAND_POOL.length]; return { id: nextId++, controller: ME, ...card(name, extra) }; });
          me.hand = hand; me.handCount = hand.length;
          state.input = { ...state.input, opening: 'mulligan', ok: { label: 'Manter', enabled: true }, cancel: { label: 'Mulligan', enabled: true } };
          setTimeout(() => { if (state.input.opening) { delete state.input.opening; state.input.ok = { label: 'OK', enabled: false }; state.input.cancel = { label: '', enabled: false }; flush(); } }, 9000);
          return c.kind === 'mulligan' ? 'Mulligan: a mão volta ao grimório, ele embaralha e sai uma nova.' : 'Mão inicial: as cartas saem do grimório uma a uma.';
        }
        case 'reveal': {
          state.question = { id: nextId++, kind: 'reveal', title: 'Oponente revelou', min: -1, max: -1, options: ['Lightning Bolt', 'Serra Angel', 'Island'].map(name => ({ card: { id: nextId++, controller: OPP, ...card(name) } })) };
          setTimeout(() => { delete state.question; flush(); }, 4000);
          return 'Revelar: as cartas da janela entram de costas e viram de face.';
        }
        case 'win': case 'lose': {
          state.gameOver = true; state.winner = c.kind === 'win' ? 'Você' : 'Oponente';
          setTimeout(() => { state.gameOver = false; delete state.winner; flush(); }, 5000);
          return c.kind === 'win' ? 'Vitória: o retrato do oponente racha e o seu acende antes do resultado.' : 'Derrota: o seu retrato racha e o do oponente acende.';
        }
      }
    },
    reduce: c => { reduce = !!c.value; if (reduce) document.head.append(still); else still.remove(); return reduce ? 'Reduzir movimento ligado nesta página.' : 'Movimento normal.'; },
  };

  function report(note?: string) {
    const kind = (c: any) => c.faceDown ? 'virada para baixo' : c.planeswalker ? 'planeswalker' : c.creature ? 'criatura' : c.land ? 'terreno' : c.attachedTo ? 'presa' : 'permanente';
    parent.postMessage({ lab: 'board', note, selected: lastAdded, players: players.map(p => ({ id: p.id, name: p.name, life: p.life })),
      cards: all().map((c: any) => ({ id: c.id, name: c.faceDown ? 'Carta virada para baixo' : c.name, side: c.controller === ME ? 'me' : 'opp', kind: kind(c), creature: !!c.creature,
        keywords: c.keywords ?? [], tapped: !!c.tapped, sick: !!c.sick, token: !!c.token, faceDown: !!c.faceDown, phasedOut: !!c.phasedOut, cantAttack: !!c.cantAttack, cantBlock: !!c.cantBlock,
        targeted: state.stack.some((s: any) => s.labTarget === c.id), preventDamage: !!c.preventDamage, P1P1: !!c.counters?.P1P1, M1M1: !!c.counters?.M1M1, copyOf: !!c.copyOf, commander: commanderFlag.has(c.id) })) }, '*');
  }

  const view = createForgeTableView(document.querySelector('#table')!, { onExit() { location.reload(); }, onRematch() { location.reload(); } });
  const client: any = { state: null, connected: true, send() {} };
  setup();
  client.state = state;
  view.attach(client, []);
  flush();
  window.addEventListener('message', ({ data }) => {
    if (!data?.cmd || !commands[data.cmd]) return;
    lastAdded = undefined;
    const note = commands[data.cmd](data);
    flush();
    if (note) report(note);
  });
  // Para ver ou fotografar um movimento: ?mesa&jogar=land,creature joga da mão, uma a cada 2,5 s (a primeira leva de eventos
  // da página não é apresentada, então jogue duas vezes). &lento=10 deixa a mesa dez vezes mais devagar. Além das jogadas da
  // mão, aceita move:<movimento> (na sua primeira criatura, como move:attack ou move:destroy), tokens:<quantas> e x:<movimento da
  // 0.117.0> (block, fight, scry, coin, die, shuffle, attach, control, transform, counters, lore, search, reanimate, flashback,
  // commander, ability, pay, opening, mulligan, reveal, win, lose).
  const plays = ['deal', ...(params.get('jogar')?.split(',') ?? [])];
  const run = (play: string) => {
    const [cmd, arg] = play.split(':');
    if (cmd === 'move') window.postMessage({ cmd, kind: arg, id: player(ME).battlefield.find((x: any) => x.creature)?.id }, '*');
    else if (cmd === 'x') window.postMessage({ cmd: 'extra', kind: arg, side: 'me' }, '*');
    else if (cmd === 'tokens') window.postMessage({ cmd, side: 'me', n: arg }, '*');
    else window.postMessage({ cmd: 'hand', kind: cmd }, '*');
  };
  if (plays.length > 1) plays.forEach((play, i) => realTimeout(() => run(play), 600 + i * 2500));
}

// ---------------------------------------------------------------- painel
function panel() {
  document.title = 'Laboratório de efeitos';
  document.body.innerHTML = '';
  const css = document.createElement('style');
  css.textContent = `
    body { margin: 0; background: #070b14; color: #e9eef7; font: 500 13px/1.4 system-ui, sans-serif; display: flex; height: 100dvh; overflow: hidden; }
    #lab { width: 300px; flex: none; overflow: auto; padding: 12px 14px 40px; box-sizing: border-box; background: #0c1222; border-right: 1px solid #f2b54c44; }
    #lab h1 { font-size: 15px; color: #f2b54c; margin: 0 0 4px; } #lab h2 { font-size: 11px; color: #9aa5bb; text-transform: uppercase; letter-spacing: .06em; margin: 14px 0 6px; }
    #lab p { margin: 0 0 6px; color: #c7cfdd; } #note { min-height: 36px; color: #ffe2a0; }
    #lab select, #lab input[type=number], #lab input[type=text] { width: 100%; box-sizing: border-box; margin: 2px 0 6px; padding: 5px 6px; border-radius: 6px; border: 1px solid #ffffff30; background: #131d30; color: inherit; font: inherit; }
    #lab button { margin: 2px 2px 2px 0; padding: 5px 9px; border-radius: 7px; border: 1px solid #ffffff30; background: #ffffff10; color: inherit; font: 600 12px system-ui; cursor: pointer; }
    #lab button:hover { background: #ffffff22; } #lab button.on { border-color: #f2b54c; color: #ffe2a0; }
    #lab label.chk { display: inline-flex; align-items: center; gap: 4px; width: 48%; margin: 1px 0; font-size: 12px; }
    #lab .row { display: flex; gap: 6px; } #lab .row > * { flex: 1; }
    #stage { flex: 1; position: relative; display: grid; place-items: center; overflow: hidden; background: repeating-linear-gradient(45deg, #0a0f1b 0 12px, #0c1220 12px 24px); }
    #frame { border: 0; background: #000; box-shadow: 0 0 0 1px #ffffff22, 0 20px 50px #000a; transform-origin: 50% 50%; }
    #size { position: absolute; top: 8px; right: 10px; font-size: 11px; color: #9aa5bb; }`;
  document.head.append(css);
  const lab = document.createElement('aside'); lab.id = 'lab';
  const stage = document.createElement('div'); stage.id = 'stage';
  const frame = document.createElement('iframe'); frame.id = 'frame'; frame.title = 'Mesa'; frame.src = `${location.pathname}?mesa`;
  const sizeTag = document.createElement('span'); sizeTag.id = 'size';
  stage.append(frame, sizeTag); document.body.append(lab, stage);

  const opt = (value: string, text: string) => `<option value="${value}">${text}</option>`;
  lab.innerHTML = `
    <h1>Laboratório de efeitos</h1><p id="note">Monte o campo, escolha fonte e alvo e dispare os efeitos.</p>
    <h2>Campo</h2>
    <div class="row"><select id="side">${opt('me', 'Você')}${opt('opp', 'Oponente')}</select></div>
    <select id="template">${Object.entries(TEMPLATES).map(([k, [name]]) => opt(k, name)).join('')}</select>
    <button data-c="add">Adicionar</button><button data-c="remove">Remover selecionada</button><button data-c="clear">Limpar campo</button><button data-c="full">Campo cheio</button><button data-c="reset">Recomeçar</button>
    <h2>Permanente selecionada</h2><select id="selected"></select>
    <div id="toggles"></div>
    <div class="row"><input type="text" id="ward" value="{2}" title="Custo do ward" aria-label="Custo do ward"><input type="text" id="protection" value="red" title="Proteção contra (red, black, artifact…)" aria-label="Proteção contra"></div>
    <h2>Dano (item 15)</h2>
    <label>Fonte</label><select id="source"></select><label>Alvo</label><select id="target"></select>
    <label>Quantidade</label><input type="number" id="amount" value="3" min="1" max="20">
    ${[['burn', 'Mágica'], ['combat', 'Combate'], ['trample', 'Atropelar'], ['double', 'Golpe duplo'], ['first', 'Iniciativa'], ['deathtouch', 'Toque mortífero'], ['lifelink', 'Vínculo'], ['infect', 'Infectar'], ['wither', 'Murchar'], ['prevented', 'Prevenido'], ['divided', 'Dividido'], ['pain', 'Dor'], ['lethal', 'Letal']]
      .map(([k, t]) => `<button data-d="${k}">${t}</button>`).join('')}
    <h2>Movimento (item 16, na selecionada)</h2>
    ${[['destroy', 'Destruir'], ['sacrifice', 'Sacrificar'], ['tap', 'Virar/desvirar'], ['attack', 'Atacar'],['tap-all', 'Virar tudo do lado'], ['untap-all', 'Desvirar tudo (onda)'], ['blink', 'Blink'], ['bounce', 'Devolver à mão'], ['exile', 'Exilar'], ['trigger', 'Gatilho → alvo'], ['ability', 'Habilidade → alvo']]
      .map(([k, t]) => `<button data-m="${k}">${t}</button>`).join('')}
    <h2>Moer (item 24, do lado escolhido em Campo)</h2>
    ${[['1', 'Moer 1'], ['3', 'Moer 3'], ['10', 'Moer 10']].map(([n, t]) => `<button data-mill="${n}">${t}</button>`).join('')}<button data-mill="2" data-surveil="1">Vidência 2 (cemitério)</button>
    <h2>Fichas (item 43, do lado escolhido em Campo)</h2>
    ${[['1', 'Criar 1'], ['3', 'Criar 3'], ['8', 'Criar 8'], ['20', 'Criar 20']].map(([n, t]) => `<button data-tokens="${n}">${t}</button>`).join('')}<button data-tokens="4" data-mixed="1">4 fichas mistas</button>
    <h2>Planeswalker (item 80, do lado escolhido em Campo)</h2>
    ${[['enter', 'Entrar (Jace)'], ['enter-gold', 'Entrar (multicolor)'], ['plus', '+2'], ['zero', '0'], ['minus', '−1'], ['ult', 'Ultimate (−10)']].map(([k, t]) => `<button data-walker="${k}">${t}</button>`).join('')}
    <h2>Dobra (item 86)</h2>
    ${[['cast', 'Conjurar por dobra'], ['back', 'Fim do turno: volta ao exílio']].map(([k, t]) => `<button data-warp="${k}">${t}</button>`).join('')}
    <h2>Jogar da mão</h2>
    ${[['land', 'Jogar terreno'], ['creature', 'Conjurar criatura'], ['countered', 'Conjurar e anular'], ['bolt', 'Lightning Bolt da mão'], ['draw', 'Comprar'], ['deal', 'Encher a mão']].map(([k, t]) => `<button data-hand="${k}">${t}</button>`).join('')}
    <h2>Movimentos da 0.117.0 (na selecionada, ou do lado escolhido)</h2>
    ${[['block', 'Bloquear'], ['fight', 'Lutar'], ['scry', 'Vidência 3'], ['coin', 'Moeda'], ['die', 'Dado d20'], ['shuffle', 'Embaralhar'], ['attach', 'Equipar'], ['control', 'Trocar de controle'],
       ['transform', 'Transformar'], ['counters', '+1/+1 em três'], ['lore', 'Saga: capítulo'], ['search', 'Buscar no grimório'], ['reanimate', 'Reanimar'], ['flashback', 'Conjurar do cemitério'],
       ['commander', 'Comandante (ida e volta)'], ['ability', 'Habilidade (se ergue)'], ['pay', 'Pagar com terrenos'], ['opening', 'Mão inicial'], ['mulligan', 'Mulligan'], ['reveal', 'Revelar'], ['win', 'Vitória'], ['lose', 'Derrota']]
      .map(([k, t]) => `<button data-x="${k}">${t}</button>`).join('')}
    <h2>Mão revelada (item 41)</h2>
    ${[['all', 'Revelar a mão do oponente'], ['one', 'Só uma carta à vista'], ['none', 'Esconder de novo']].map(([k, t]) => `<button data-reveal="${k}">${t}</button>`).join('')}
    <h2>Aparência e tela</h2>
    <select id="style">${opt('full', 'Imagem completa')}${opt('art', 'Arte e texto')}${opt('arena', 'Arena')}</select>
    <label class="chk" style="width:100%"><input type="checkbox" id="reduce"> Reduzir movimento (só nesta página)</label>
    <div>${[['desktop', 'Computador'], ['tablet', 'Tablet'], ['phone', 'Celular deitado']].map(([k, t]) => `<button data-s="${k}">${t}</button>`).join('')}</div>`;

  const $ = <T extends HTMLElement>(id: string) => lab.querySelector<T>(`#${id}`)!;
  lab.querySelector('#toggles')!.innerHTML = [...KEYWORDS, ...STATES].map(([k, t]) => `<label class="chk"><input type="checkbox" data-t="${k}"> ${t}</label>`).join('');
  let board: any = { cards: [], players: [] };
  const send = (cmd: Command) => frame.contentWindow?.postMessage(cmd, '*');
  const ref = (value: string) => value.startsWith('p') ? { player: Number(value.slice(1)) } : value === 'spell' ? { spell: true } : { card: Number(value.slice(1)) };
  const selectedId = () => Number($<HTMLSelectElement>('selected').value || NaN);

  function fill(select: HTMLSelectElement, items: [string, string][], keep: string) {
    select.innerHTML = items.map(([v, t]) => opt(v, t)).join('');
    if (items.some(([v]) => v === keep)) select.value = keep;
  }
  function syncToggles() {
    const c = board.cards.find((x: any) => x.id === selectedId());
    lab.querySelectorAll<HTMLInputElement>('[data-t]').forEach(box => {
      const k = box.dataset.t!;
      box.checked = !!c && (c.keywords.includes(k) || !!c[k]);
      box.disabled = !c;
    });
  }
  window.addEventListener('message', ({ data }) => {
    if (data?.lab !== 'board') return;
    board = data;
    if (data.note) $('note').textContent = data.note;
    const cards: [string, string][] = data.cards.map((c: any) => [`c${c.id}`, `${c.side === 'me' ? 'Você' : 'Oponente'}: ${c.name} (${c.kind})`]);
    const people: [string, string][] = data.players.map((p: any) => [`p${p.id}`, `Jogador: ${p.name} (${p.life} de vida)`]);
    const keepSel = data.selected !== undefined ? String(data.selected) : $<HTMLSelectElement>('selected').value;
    fill($('selected'), cards.map(([v, t]) => [v.slice(1), t]), keepSel);
    fill($('source'), [['spell', 'Mágica: Lightning Bolt'], ...cards], $<HTMLSelectElement>('source').value || `c${data.cards.find((c: any) => c.side === 'me' && c.creature)?.id}`);
    fill($('target'), [...people, ...cards], $<HTMLSelectElement>('target').value || `p${data.players[1]?.id}`);
    syncToggles();
  });
  $('selected').addEventListener('change', syncToggles);
  lab.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    if (b.dataset.c) send({ cmd: b.dataset.c, side: $<HTMLSelectElement>('side').value, template: $<HTMLSelectElement>('template').value, id: selectedId(), attachTo: selectedId() });
    if (b.dataset.d) send({ cmd: 'damage', kind: b.dataset.d, source: ref($<HTMLSelectElement>('source').value), target: ref($<HTMLSelectElement>('target').value), amount: $<HTMLInputElement>('amount').value });
    if (b.dataset.m) send({ cmd: 'move', kind: b.dataset.m, id: selectedId(), target: ref($<HTMLSelectElement>('target').value) });
    if (b.dataset.mill) send({ cmd: 'mill', side: $<HTMLSelectElement>('side').value, n: b.dataset.mill, surveil: !!b.dataset.surveil });
    if (b.dataset.tokens) send({ cmd: 'tokens', side: $<HTMLSelectElement>('side').value, n: b.dataset.tokens, mixed: !!b.dataset.mixed });
    if (b.dataset.warp) send({ cmd: 'warp', kind: b.dataset.warp });
    if (b.dataset.walker) send({ cmd: 'walker', kind: b.dataset.walker, side: $<HTMLSelectElement>('side').value, id: selectedId() });
    if (b.dataset.reveal) send({ cmd: 'reveal', kind: b.dataset.reveal });
    if (b.dataset.x) send({ cmd: 'extra', kind: b.dataset.x, id: selectedId(), side: $<HTMLSelectElement>('side').value });
    if (b.dataset.hand) send({ cmd: 'hand', kind: b.dataset.hand });
    if (b.dataset.s) resize(b.dataset.s);
  });
  lab.addEventListener('change', e => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.t) send({ cmd: 'toggle', id: selectedId(), key: t.dataset.t, value: t.checked, ward: $<HTMLInputElement>('ward').value, protection: $<HTMLInputElement>('protection').value });
    if (t.id === 'style') send({ cmd: 'style', value: t.value });
    if (t.id === 'reduce') send({ cmd: 'reduce', value: t.checked });
  });

  const SIZES: Record<string, [number, number] | null> = { desktop: null, tablet: [1024, 768], phone: [844, 390] };
  let size = 'desktop';
  function resize(next = size) {
    size = next;
    const box = stage.getBoundingClientRect();
    const [w, h] = SIZES[size] ?? [box.width, box.height];
    frame.style.width = `${w}px`; frame.style.height = `${h}px`;
    const scale = Math.min(1, (box.width - 24) / w, (box.height - 24) / h);
    frame.style.transform = SIZES[size] ? `scale(${scale})` : '';
    sizeTag.textContent = `${Math.round(w)}×${Math.round(h)}${SIZES[size] && scale < 1 ? ` (mostrado a ${Math.round(scale * 100)}%)` : ''}`;
    lab.querySelectorAll<HTMLButtonElement>('[data-s]').forEach(b => b.classList.toggle('on', b.dataset.s === size));
  }
  new ResizeObserver(() => resize()).observe(stage);
  resize();
}
