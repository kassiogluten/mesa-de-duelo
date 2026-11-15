// Jogadas simuladas do laboratório de efeitos: cada botão monta a mesa e encadeia os eventos na ordem de uma partida (turno, mágicas, combate, cemitério, valor e Commander), como o servidor mandaria.

type Side = 'me' | 'opp';
type Ref = { card: number } | { player: number };
interface Command { cmd: string; [key: string]: any }

/** O que a mesa do laboratório (effects-lab.ts) empresta para as jogadas. */
export interface LabApi {
  ME: number; OPP: number;
  state(): any;
  player(id: number): any;
  newId(): number;
  add(side: Side, template: string, selected?: boolean): any;
  card(name: string, extra?: Record<string, unknown>): any;
  creature(name: string, power: number, toughness: number, manaCost: string, keywords?: string[]): any;
  emit(type: string, extra: Record<string, unknown>): void;
  flush(): void;
  damage(source: any, target: Ref, amount: number, flags?: Record<string, unknown>): void;
  settle(): void;
  lifeChange(id: number, delta: number): void;
  leave(c: any, to: string, reason?: string): void;
  combat(attacker: any, target: Ref): void;
  /** Um comando do painel (os mesmos botões das outras seções), sem desenhar: quem chama desenha. */
  run(cmd: Command): void;
}

/** Uma jogada: o que ela mostra (vai para a nota do painel) e os passos, com o atraso de cada um depois do anterior (ms). */
interface Play { note: string; steps: [number, () => void][] }

/** Os botões, por grupo e na ordem do painel (o painel não carrega a mesa: só precisa dos nomes). */
export const PLAY_BUTTONS: [group: string, plays: [key: string, label: string][]][] = [
  ['Turno e mágicas', [['upkeep', 'Começo do turno'], ['develop', 'Terreno e criatura'], ['bolt', 'Raio no oponente'], ['counter', 'Contramágica'], ['wrath', 'Ira de Deus']]],
  ['Combate', [['combat', 'Ataque com bloqueios'], ['swing', 'Ataque do oponente'], ['lethal', 'Ataque letal']]],
  ['Cemitério e exílio', [['graveyard', 'Moer e reanimar'], ['blink', 'Blink com gatilho'], ['sacrifice', 'Sacrificar para comprar'], ['flashback', 'Conjurar do cemitério'], ['removal', 'Exilar uma ameaça']]],
  ['Valor e Commander', [['walker', 'Planeswalker'], ['tokens', 'Fichas e marcadores'], ['commander', 'Comandante'], ['tutor', 'Tutor']]],
];

export function createLabPlays(lab: LabApi) {
  const { ME, OPP } = lab;
  const me = () => lab.player(ME), opp = () => lab.player(OPP);
  const basic = (name: string) => lab.card(name, { land: true, typeLine: `Basic Land — ${name}` });
  const put = (side: Side, c: any) => { const placed = { id: lab.newId(), controller: side === 'me' ? ME : OPP, ...c }; lab.player(placed.controller).battlefield.push(placed); return placed; };
  const creaturesOf = (p: any) => p.battlefield.filter((x: any) => x.creature);
  const spellCard = (name: string, typeLine: string, manaCost: string, text: string, controller = ME) =>
    ({ id: lab.newId(), name, controller, typeLine, manaCost, text, tapped: false, token: false });

  /** Mesa limpa para a jogada: campos com as permanentes pedidas, cemitérios e exílios vazios, vida 20 e a sua mão cheia. */
  function stage(mine: (string | (() => any))[], theirs: (string | (() => any))[], life: [number, number] = [20, 20]) {
    const s = lab.state();
    for (const p of [me(), opp()]) { p.battlefield = []; p.graveyard = []; p.exile = []; p.pool = {}; p.counters = {}; p.preventDamage = undefined; }
    me().life = life[0]; opp().life = life[1];
    Object.assign(s, { stack: [], combat: [], phase: 'MAIN1', activePlayer: ME, gameOver: false, winner: undefined });
    s.input = { ...s.input, paying: false, priority: false, ok: { label: 'OK', enabled: false }, cancel: { label: '', enabled: false } };
    for (const [side, list] of [['me', mine], ['opp', theirs]] as const) {
      for (const t of list) { if (typeof t === 'string') lab.add(side, t, false); else put(side, t()); }
    }
    lab.run({ cmd: 'hand', kind: 'deal' });
  }
  /**
   * Paga um custo com os seus terrenos desvirados (até `n`): cada um vira, um depois do outro, e a mana voa até o custo.
   * O primeiro passo espera `wait`; o último tira a mesa do pagamento e roda `then`.
   */
  function pay(n: number, cost: string, wait: number, then: () => void): [number, () => void][] {
    const lands = () => me().battlefield.filter((x: any) => x.land && !x.tapped).slice(0, n);
    const input = (paying: boolean) => { const s = lab.state(); s.input = { ...s.input, paying, message: paying ? `Pague ${cost}` : 'Laboratório de efeitos: use o painel.' }; };
    return [
      [wait, () => { input(true); const first = lands()[0]; if (first) first.tapped = true; }],
      ...Array.from({ length: n - 1 }, (): [number, () => void] => [380, () => { const next = lands()[0]; if (next) next.tapped = true; }]),
      [450, () => { input(false); then(); }],
    ];
  }
  /** Conjura da mão: a carta vai à pilha (com o alvo, se houver). Devolve o número da pilha. */
  function cast(spell: any, targets?: { cards: number[]; players: number[] }, from = 'Hand') {
    const stackId = lab.newId();
    lab.state().stack.push({ id: stackId, text: spell.text ?? spell.name, source: structuredClone(spell), controller: spell.controller, ...(targets ? { targets } : {}) });
    lab.emit('spell-cast', { card: structuredClone(spell), sourceId: spell.id, actor: spell.controller, from, to: 'Stack', stackId, ...(targets ? { targets } : {}) });
    return stackId;
  }
  /** Tira da pilha e manda a mágica para onde ela vai depois de resolver (cemitério, campo, exílio). */
  function resolve(spell: any, stackId: number, to = 'Graveyard') {
    const s = lab.state();
    s.stack = s.stack.filter((x: any) => x.id !== stackId);
    if (to === 'Graveyard') lab.player(spell.controller).graveyard.push(spell);
    lab.emit('resolved', { card: structuredClone(spell), sourceId: spell.id, actor: spell.controller, stackId, from: 'Stack', to });
  }
  function draw(n = 1) { for (let i = 0; i < n; i++) lab.run({ cmd: 'hand', kind: 'draw' }); }
  /** Declara os atacantes (viram, menos com vigilância) contra o oponente. */
  function attack(attackers: any[], actor = ME) {
    const s = lab.state(), defender = actor === ME ? OPP : ME;
    s.phase = 'COMBAT_DECLARE_ATTACKERS'; s.activePlayer = actor;
    for (const a of attackers) { a.attacking = true; if (!a.keywords?.includes('VIGILANCE')) a.tapped = true; }
    s.combat = attackers.map(a => ({ attacker: a.id, defender, defenderKind: 'player', blockers: [] }));
    lab.emit('attackers', { actor, attackers: attackers.map(a => a.id) });
  }
  /** Declara os bloqueios: cada par [atacante, bloqueador]. */
  function block(pairs: [any, any][], actor = OPP) {
    const s = lab.state();
    s.phase = 'COMBAT_DECLARE_BLOCKERS';
    for (const [a, b] of pairs) { b.blocking = true; const entry = s.combat.find((x: any) => x.attacker === a.id); if (entry) entry.blockers = [b.id]; }
    lab.emit('blockers', { actor, cards: pairs.map(([, b]) => b.id) });
  }
  function endCombat() {
    const s = lab.state();
    for (const p of [me(), opp()]) for (const c of p.battlefield) { c.attacking = false; c.blocking = false; }
    s.combat = []; s.phase = 'MAIN2';
  }

  // Cada jogada guarda as cartas que usa entre um passo e outro.
  let held: Record<string, any> = {};
  const plays: Record<string, Play> = {
    upkeep: {
      note: 'Começo do turno: a luz vai para o seu lado, tudo desvira em onda e você compra uma carta.',
      steps: [
        [0, () => {
          stage(['big', 'hawk', 'land', 'land', 'land'], ['small', 'land']);
          for (const c of me().battlefield) c.tapped = true;
          lab.state().activePlayer = OPP;
        }],
        [900, () => {
          const s = lab.state(); s.turn++; s.activePlayer = ME; s.phase = 'UPKEEP';
          lab.emit('turn', { actor: ME, turn: s.turn });
          for (const c of me().battlefield) c.tapped = false;
        }],
        [1500, () => { lab.state().phase = 'DRAW'; draw(); }],
        [1400, () => { lab.state().phase = 'MAIN1'; }],
      ],
    },
    develop: {
      note: 'Terreno e criatura: o terreno pousa, os terrenos pagam (a mana voa até o custo) e a criatura vai à pilha e entra no campo.',
      steps: [
        [0, () => { stage([() => basic('Forest'), () => basic('Forest')], ['small', 'land']); }],
        [900, () => { lab.run({ cmd: 'hand', kind: 'land' }); }],
        ...pay(2, '{1}{G}', 1900, () => lab.run({ cmd: 'hand', kind: 'creature' })),
      ],
    },
    bolt: {
      note: 'Raio no oponente: a Montanha paga, o Lightning Bolt vai à pilha com a seta até o oponente, o raio sai e ele perde 3.',
      steps: [
        [0, () => { stage([() => basic('Mountain'), 'small'], ['small', 'land']); }],
        ...pay(1, '{R}', 900, () => lab.run({ cmd: 'hand', kind: 'bolt' })),
      ],
    },
    counter: {
      note: 'Contramágica: você conjura o Anjo de Serra, o oponente responde com Counterspell, que resolve e anula o anjo.',
      steps: [
        [0, () => { stage(['land', 'land', 'land', 'land', 'land'], [() => basic('Island'), () => basic('Island'), 'small']); }],
        [900, () => { held.angel = { id: lab.newId(), controller: ME, ...lab.creature('Serra Angel', 4, 4, '{3}{W}{W}', ['FLYING', 'VIGILANCE']) }; held.angelStack = cast(held.angel); }],
        [1600, () => {
          for (const x of opp().battlefield.filter((y: any) => y.land)) x.tapped = true;
          held.counter = spellCard('Counterspell', 'Instant', '{U}{U}', 'Counter target spell.', OPP);
          held.counterStack = cast(held.counter, { cards: [held.angel.id], players: [] });
        }],
        [1700, () => {
          resolve(held.counter, held.counterStack);
          const s = lab.state(); s.stack = s.stack.filter((x: any) => x.id !== held.angelStack);
          me().graveyard.push(held.angel);
          lab.emit('countered', { card: structuredClone(held.angel), sourceId: held.angel.id, actor: ME, stackId: held.angelStack, from: 'Stack', to: 'Graveyard' });
        }],
      ],
    },
    wrath: {
      note: 'Ira de Deus no campo cheio: a mágica resolve e todas as criaturas são destruídas de uma vez (o Darksteel Myr, indestrutível, fica).',
      steps: [
        [0, () => { stage(['big', 'hawk', 'blade', 'token', 'land', 'land', 'land', 'land'], ['small', 'knight', 'spawn', 'myr', 'token', 'land', 'land']); }],
        [900, () => {
          for (const x of me().battlefield.filter((y: any) => y.land)) x.tapped = true;
          held.wrath = spellCard('Wrath of God', 'Sorcery', '{2}{W}{W}', 'Destroy all creatures. They can\'t be regenerated.');
          held.wrathStack = cast(held.wrath);
        }],
        [1800, () => {
          for (const c of [...creaturesOf(me()), ...creaturesOf(opp())]) if (!c.keywords?.includes('INDESTRUCTIBLE')) lab.leave(c, 'Graveyard', 'destroyed');
          resolve(held.wrath, held.wrathStack);
        }],
      ],
    },

    combat: {
      note: 'Combate: três atacam, o oponente bloqueia os três; iniciativa primeiro, depois atropelar, toque mortífero e vínculo com a vida, e quem levou dano letal morre.',
      steps: [
        [0, () => {
          stage(['blade', 'hawk', 'big', 'land', 'land'], ['knight', 'small', 'small', 'land']);
          [held.blade, held.hawk, held.big] = creaturesOf(me());
          [held.knight, held.bear1, held.bear2] = creaturesOf(opp());
        }],
        [900, () => { attack([held.blade, held.hawk, held.big]); }],
        [1700, () => { block([[held.blade, held.knight], [held.big, held.bear1], [held.hawk, held.bear2]]); }],
        [1700, () => {
          // Iniciativa: o golpe duplo e a iniciativa batem primeiro.
          lab.state().phase = 'COMBAT_FIRST_STRIKE_DAMAGE';
          lab.damage(held.blade, { card: held.knight.id }, 1, { combat: true, step: 'first-strike' });
          lab.damage(held.knight, { card: held.blade.id }, 2, { combat: true, step: 'first-strike' });
          lab.settle();
        }],
        [1800, () => {
          lab.state().phase = 'COMBAT_DAMAGE';
          lab.damage(held.big, { card: held.bear1.id }, 2, { combat: true, step: 'regular' });
          lab.damage(held.big, { player: OPP }, 4, { combat: true, step: 'regular', trample: true });
          lab.damage(held.bear1, { card: held.big.id }, 2, { combat: true, step: 'regular' });
          lab.damage(held.hawk, { card: held.bear2.id }, 2, { combat: true, step: 'regular' });
          lab.damage(held.bear2, { card: held.hawk.id }, 2, { combat: true, step: 'regular' });
          lab.settle();
        }],
        [2200, () => { endCombat(); }],
      ],
    },
    lethal: {
      note: 'Ataque letal: o oponente com 5 de vida não bloqueia, o golpe acaba com a partida e vem o fim (raios e confete para você).',
      steps: [
        [0, () => { stage(['big', 'hawk', 'land', 'land'], ['land', 'land'], [12, 5]); [held.big, held.hawk] = creaturesOf(me()); }],
        [900, () => { attack([held.big, held.hawk]); }],
        [1700, () => {
          lab.state().phase = 'COMBAT_DAMAGE';
          lab.damage(held.big, { player: OPP }, 6, { combat: true, step: 'regular' });
          lab.damage(held.hawk, { player: OPP }, 2, { combat: true, step: 'regular' });
          lab.settle();
        }],
        [1500, () => { endCombat(); Object.assign(lab.state(), { gameOver: true, winner: 'Você' }); }],
        [6000, () => { Object.assign(lab.state(), { gameOver: false, winner: undefined }); me().life = 20; opp().life = 20; }],
      ],
    },
    swing: {
      note: 'Ataque do oponente: duas criaturas dele atacam você, a sua bloqueia uma e a outra passa; a vida cai no seu retrato.',
      steps: [
        [0, () => { stage(['small', 'land', 'land'], ['big', 'ramgang', 'land']); [held.wall] = creaturesOf(me()); [held.big, held.ram] = creaturesOf(opp()); lab.state().activePlayer = OPP; }],
        [900, () => { const s = lab.state(); s.turn++; lab.emit('turn', { actor: OPP, turn: s.turn }); }],
        [1500, () => { attack([held.big, held.ram], OPP); }],
        [1700, () => { block([[held.ram, held.wall]], ME); }],
        [1700, () => {
          lab.state().phase = 'COMBAT_DAMAGE';
          lab.damage(held.big, { player: ME }, 6, { combat: true, step: 'regular' });
          lab.damage(held.ram, { card: held.wall.id }, 3, { combat: true, step: 'regular' });
          lab.damage(held.wall, { card: held.ram.id }, 2, { combat: true, step: 'regular' });
          lab.settle();
        }],
        [2200, () => { endCombat(); }],
      ],
    },

    graveyard: {
      note: 'Moer e reanimar: três cartas caem do grimório no cemitério, e o Anjo de Serra volta do cemitério com o anel roxo.',
      steps: [
        [0, () => { stage(['land', 'land', 'land'], ['small', 'land']); }],
        [900, () => { lab.run({ cmd: 'mill', side: 'me', n: 3 }); }],
        [2600, () => { lab.run({ cmd: 'extra', kind: 'reanimate', side: 'me' }); }],
      ],
    },
    blink: {
      note: 'Blink: a criatura some em luz e volta no mesmo lugar, e o gatilho de entrar compra uma carta.',
      steps: [
        [0, () => { stage(['hawk', 'small', 'land', 'land'], ['small', 'land']); held.target = creaturesOf(me())[1]; }],
        [900, () => { if (held.target) lab.run({ cmd: 'move', kind: 'blink', id: held.target.id }); }],
        [1800, () => { const c = held.target; if (c) lab.emit('ability-activated', { card: structuredClone(c), sourceId: c.id, actor: ME, trigger: true, text: `${c.name} - When this enters, draw a card.`, targets: { cards: [], players: [] }, stackId: lab.newId(), to: 'Stack' }); }],
        [1300, () => { draw(); }],
      ],
    },
    sacrifice: {
      note: 'Sacrificar: a ficha afunda em brasas e fumaça a caminho do cemitério, e você compra duas cartas.',
      steps: [
        [0, () => { stage(['token', 'token', 'small', 'artifact', 'land'], ['small', 'land']); held.goblin = me().battlefield.find((x: any) => x.token); }],
        [900, () => { const art = me().battlefield.find((x: any) => !x.creature && !x.land); if (art) lab.emit('ability-activated', { card: structuredClone(art), sourceId: art.id, actor: ME, text: `${art.name} - Sacrifice a creature: Draw two cards.`, targets: { cards: [], players: [] }, stackId: lab.newId(), to: 'Stack' }); }],
        [900, () => { if (held.goblin) lab.leave(held.goblin, 'Graveyard', 'sacrificed'); }],
        [1500, () => { draw(2); }],
      ],
    },
    flashback: {
      note: 'Conjurar do cemitério (flashback): a carta sai do cemitério com brilho roxo até a pilha, resolve, vai para o exílio e você compra duas.',
      steps: [
        [0, () => { stage(['land', 'land', 'small'], ['small', 'land']); }],
        [900, () => { lab.run({ cmd: 'extra', kind: 'flashback', side: 'me' }); }],
        [2600, () => { draw(2); }],
      ],
    },
    removal: {
      note: 'Exilar: Swords to Plowshares com a seta até a criatura do oponente, que se desfaz em luz; ele ganha a vida dela.',
      steps: [
        [0, () => { stage([() => basic('Plains'), 'small'], ['big', 'small', 'land']); held.threat = creaturesOf(opp())[0]; }],
        [900, () => {
          const plains = me().battlefield.find((x: any) => x.land); if (plains) plains.tapped = true;
          held.swords = spellCard('Swords to Plowshares', 'Instant', '{W}', 'Exile target creature. Its controller gains life equal to its power.');
          held.swordsStack = cast(held.swords, { cards: [held.threat.id], players: [] });
        }],
        [1700, () => { lab.leave(held.threat, 'Exile'); lab.lifeChange(OPP, held.threat.power ?? 0); resolve(held.swords, held.swordsStack); }],
      ],
    },

    walker: {
      note: 'Planeswalker: o Jace entra, usa +2, a criatura do oponente ataca o Jace e, com a lealdade de volta, vem o ultimate.',
      steps: [
        [0, () => { stage(['land', 'land', 'land'], ['small', 'land']); }],
        [900, () => { lab.run({ cmd: 'walker', kind: 'enter', side: 'me' }); }],
        [2000, () => { lab.run({ cmd: 'walker', kind: 'plus', side: 'me' }); }],
        [2200, () => {
          const jace = me().battlefield.find((x: any) => x.planeswalker), bear = creaturesOf(opp())[0];
          if (jace && bear) { lab.state().activePlayer = OPP; lab.combat(bear, { card: jace.id }); }
        }],
        [2600, () => { const jace = me().battlefield.find((x: any) => x.planeswalker); if (jace) jace.counters = { LOYALTY: 10 }; lab.state().activePlayer = ME; }],
        [400, () => { lab.run({ cmd: 'walker', kind: 'ult', side: 'me' }); }],
      ],
    },
    tokens: {
      note: 'Fichas e marcadores: quatro fichas chegam em cascata e cada uma ganha um marcador +1/+1, com faíscas verdes.',
      steps: [
        [0, () => { stage(['land', 'land', 'land'], ['small', 'land']); }],
        [900, () => { lab.run({ cmd: 'tokens', side: 'me', n: 4 }); }],
        [2400, () => {
          for (const t of me().battlefield.filter((x: any) => x.token)) {
            t.counters = { ...t.counters, P1P1: (t.counters?.P1P1 ?? 0) + 1 }; t.power++; t.toughness++; t.sick = false;
            lab.emit('counters', { card: structuredClone(t), sourceId: t.id, actor: ME, counter: 'P1P1', delta: 1 });
          }
        }],
      ],
    },
    commander: {
      note: 'Comandante: conjurado da zona de comando (a taxa sobe 2), entra no campo e, destruído, volta para a zona de comando.',
      steps: [
        [0, () => { stage(['land', 'land', 'land', 'land'], ['small', 'land']); me().commandZone = []; }],
        [900, () => { lab.run({ cmd: 'extra', kind: 'commander', side: 'me' }); }],
        [3800, () => { lab.run({ cmd: 'extra', kind: 'commander', side: 'me' }); }],
      ],
    },
    tutor: {
      note: 'Tutor: o Demonic Tutor resolve, a carta buscada sai dourada do grimório e ele embaralha.',
      steps: [
        [0, () => { stage(['land', 'land', 'small'], ['small', 'land']); }],
        [900, () => { for (const x of me().battlefield.filter((y: any) => y.land)) x.tapped = true; held.tutor = spellCard('Demonic Tutor', 'Sorcery', '{1}{B}', 'Search your library for a card, put that card into your hand, then shuffle.'); held.tutorStack = cast(held.tutor); }],
        [1500, () => { resolve(held.tutor, held.tutorStack); lab.run({ cmd: 'extra', kind: 'search', side: 'me' }); }],
      ],
    },
  };

  // Os passos da jogada em andamento (outra jogada, ou a mesma de novo, cancela o resto) e a fila do "Todas em sequência".
  let timers: number[] = [], queue: number[] = [];
  /** Roda a jogada: cada passo espera o seu atraso depois do anterior e desenha a mesa. Devolve a nota para o painel. */
  function start(key: string, inQueue = false) {
    const play = plays[key];
    if (!play) return undefined;
    for (const t of timers) clearTimeout(t);
    if (!inQueue) { for (const t of queue) clearTimeout(t); queue = []; }
    timers = []; held = {};
    let at = 0;
    for (const [ms, fn] of play.steps) {
      at += ms;
      if (at === 0) { fn(); continue; }
      timers.push(window.setTimeout(() => { fn(); lab.flush(); }, at));
    }
    return play.note;
  }
  /** Todas as jogadas, uma depois da outra, com uma pausa entre elas; tocar de novo (ou outra jogada) para. */
  function startAll() {
    if (queue.length) { for (const t of [...queue, ...timers]) clearTimeout(t); queue = []; timers = []; return 'Jogadas em sequência: paradas.'; }
    let at = 0;
    for (const [, list] of PLAY_BUTTONS) for (const [key] of list) {
      queue.push(window.setTimeout(() => { const note = start(key, true); if (note) lab.flush(); }, at));
      at += plays[key]!.steps.reduce((sum, [ms]) => sum + ms, 0) + 3500;
    }
    queue.push(window.setTimeout(() => { queue = []; }, at));
    return 'Jogadas em sequência: as 17, uma depois da outra (toque de novo para parar).';
  }
  return { start, startAll };
}

/** Os botões das jogadas, por grupo, para o painel. */
export function playButtons() {
  return PLAY_BUTTONS.map(([group, list]) => `<p class="play-group">${group}</p>${list.map(([key, label]) => `<button data-play="${key}">${label}</button>`).join('')}`).join('');
}
