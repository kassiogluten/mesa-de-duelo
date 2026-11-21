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
  /** `extra`: o que mais vai no evento (o `stackId` da mágica que resolve, num limpa campo). */
  leave(c: any, to: string, reason?: string, extra?: Record<string, unknown>): void;
  combat(attacker: any, target: Ref): void;
  /** Um comando do painel (os mesmos botões das outras seções), sem desenhar: quem chama desenha. */
  run(cmd: Command): void;
}

/** Uma jogada: o que ela mostra (vai para a nota do painel) e os passos, com o atraso de cada um depois do anterior (ms). */
interface Play { note: string; steps: [number, () => void][] }

/** Os botões, por grupo e na ordem do painel (o painel não carrega a mesa: só precisa dos nomes). */
export const PLAY_BUTTONS: [group: string, plays: [key: string, label: string][]][] = [
  ['Turno e mágicas', [['upkeep', 'Começo do turno'], ['develop', 'Terreno e criatura'], ['bolt', 'Raio no oponente'], ['counter', 'Contramágica'], ['ward', 'Ward anula'], ['wardPaid', 'Ward pago'],
    ['extraTurn', 'Turno extra'], ['storm', 'Tempestade'], ['kicker', 'Reforço'], ['xspell', 'Mágica com X'], ['cascade', 'Cascata']]],
  ['Aguentar e fase', [['indestructible', 'Raio na indestrutível'], ['regenerate', 'Regenerar'], ['doubleStrike', 'Golpe duplo'], ['phasing', 'Mudança de fase']]],
  ['Limpa campo', [['wrath', 'Ira de Deus'], ['damnation', 'Danação'], ['pyroclasm', 'Piroclasmo'], ['evacuation', 'Evacuação'], ['eviction', 'Despejo impiedoso']]],
  ['Combate', [['combat', 'Ataque com bloqueios'], ['swing', 'Ataque do oponente'], ['lethal', 'Ataque letal']]],
  ['Cemitério e exílio', [['graveyard', 'Moer e reanimar'], ['blink', 'Blink com gatilho'], ['sacrifice', 'Sacrificar para comprar'], ['flashback', 'Conjurar do cemitério'], ['removal', 'Exilar uma ameaça']]],
  ['Momentos da partida', [['creatures', 'Criaturas com som'], ['firstBlood', 'Primeiro sangue'], ['doubleKill', 'Eliminação dupla'], ['comeback', 'Virada no fim do jogo'], ['byAThread', 'Vitória por um fio'], ['crowded', 'Campo lotado range'], ['longTurn', 'Turno longo (ampulheta)']]],
  ['Valor e Commander', [['walker', 'Planeswalker'], ['tokens', 'Fichas e marcadores'], ['commander', 'Comandante'], ['commanderStrike', 'Golpe de comandante'], ['commanderThreat', 'Comandante ameaça (18/21)'], ['commanderLethal', 'Comandante chega a 21'], ['tutor', 'Tutor'], ['gameChanger', 'Game Changer']]],
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
    for (const p of [me(), opp()]) { p.battlefield = []; p.graveyard = []; p.exile = []; p.pool = {}; p.counters = {}; p.preventDamage = undefined; p.commanderDamage = undefined; }
    opp().commanders = undefined; opp().commandZone = undefined;
    me().life = life[0]; opp().life = life[1];
    // Só a jogada do Game Changer põe a mesa no Commander; as outras voltam à mesa livre.
    Object.assign(s, { stack: [], combat: [], phase: 'MAIN1', activePlayer: ME, gameOver: false, winner: undefined, config: { ...s.config, format: 'free' } });
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
  /**
   * Um fim de jogo: o jogo começa (turno 1) com a vida `life`, `blow` derruba o oponente e o resultado aparece com a vida
   * de cada turno (`turns`, você e o oponente), como o servidor manda no fim do jogo.
   */
  function ending(life: [number, number], turns: [number, number][], blow: () => void): [number, () => void][] {
    return [
      [0, () => { stage(['land', 'land', 'land', () => ({ ...lab.creature('Shivan Dragon', 7, 5, '{4}{R}{R}', ['FLYING']), typeLine: 'Creature — Dragon' })], ['land'], life); }],
      [500, () => { lab.emit('turn', { actor: ME, turn: 1 }); }],
      [700, blow],
      [2600, () => {
        const s = lab.state();
        s.lifeHistory = [...turns.map(([mine, theirs], i) => ({ turn: i + 1, life: { [ME]: mine, [OPP]: theirs } })), { turn: turns.length + 1, life: { [ME]: me().life, [OPP]: opp().life } }];
        Object.assign(s, { gameOver: true, winner: me().name });
      }],
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
  /**
   * O seu comandante (Prossh, 5/5) ataca o oponente, que já levou `before` de dano dele e tem o próprio comandante na
   * zona de comando (é ali, no duelo, que fica o "Dano X/21" dele).
   */
  function commanderSwing(before: number): [number, () => void][] {
    return [
      [0, () => {
        stage(['land', 'land', 'land'], ['small', 'land'], [40, 40 - before]);
        held.cmd = put('me', { ...lab.creature('Prossh, Skyraider of Kher', 5, 5, '{3}{B}{R}{G}', ['FLYING']), typeLine: 'Legendary Creature — Dragon', commander: true });
        const theirs = { id: lab.newId(), controller: OPP, ...lab.creature('Isamaru, Hound of Konda', 2, 2, '{W}'), typeLine: 'Legendary Creature — Dog', commander: true };
        opp().commanders = [{ id: theirs.id, name: theirs.name, tax: 0, casts: 0 }]; opp().commandZone = [theirs];
        opp().commanderDamage = [{ commanderId: held.cmd.id, damage: before }, { commanderId: theirs.id, damage: 0 }];
      }],
      [900, () => { attack([held.cmd]); }],
      [1700, () => { lab.state().phase = 'COMBAT_DAMAGE'; lab.damage(held.cmd, { player: OPP }, 5, { combat: true, step: 'regular', commander: true }); lab.settle(); }],
      [2400, () => { endCombat(); }],
    ];
  }
  /**
   * Limpa campo no campo cheio: a mágica de `spell()` vai à pilha e, ao resolver, `hit` tira cada criatura (com o
   * número da pilha, como a ponte manda).
   */
  function sweepPlay(note: string, spell: () => any, hit: (c: any, stackId: number) => void): Play {
    return {
      note,
      steps: [
        // Duas das suas criaturas viradas (atacaram neste turno): saem viradas.
        [0, () => { stage(['big', 'hawk', 'blade', 'token', 'land', 'land', 'land', 'land'], ['small', 'knight', 'spawn', 'myr', 'token', 'land', 'land']); for (const c of creaturesOf(me()).slice(0, 2)) c.tapped = true; }],
        [900, () => {
          held.sweep = spell();
          for (const x of lab.player(held.sweep.controller).battlefield.filter((y: any) => y.land)) x.tapped = true;
          held.sweepStack = cast(held.sweep);
        }],
        [1800, () => {
          for (const c of [...creaturesOf(me()), ...creaturesOf(opp())]) hit(c, held.sweepStack);
          // Como a ponte: as indestrutíveis que ficaram vêm depois de todas as saídas, antes de a mágica resolver.
          for (const c of held.stayed ?? []) stays(c, held.sweepStack, held.sweep.name);
          resolve(held.sweep, held.sweepStack);
        }],
      ],
    };
  }
  /**
   * O oponente mira a sua Aboleth Spawn (ward {2}) com um Lightning Bolt: o ward dispara e, sem o custo pago (`paid`
   * falso), anula o Bolt; pago, o Bolt resolve e a Spawn leva 3.
   */
  function wardPlay(note: string, paid: boolean): Play {
    const trigger = () => ({ id: held.wardStack, text: 'Ward {2} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.)', kind: 'trigger', source: structuredClone(held.spawn), controller: ME });
    const wardEvent = (type: string, extra: Record<string, unknown>) =>
      lab.emit(type, { card: structuredClone(held.spawn), sourceId: held.spawn.id, actor: ME, trigger: true, ward: true, stackId: held.wardStack, ...extra });
    return {
      note,
      steps: [
        [0, () => {
          stage(['spawn', 'land', 'land'], [() => basic('Mountain'), ...(paid ? [() => basic('Island'), () => basic('Island')] : []), 'small']);
          held.spawn = me().battlefield.find((x: any) => x.name === 'Aboleth Spawn');
        }],
        [900, () => {
          opp().battlefield.find((y: any) => y.name === 'Mountain').tapped = true;
          held.bolt = spellCard('Lightning Bolt', 'Instant', '{R}', 'Lightning Bolt deals 3 damage to any target.', OPP);
          held.boltStack = cast(held.bolt, { cards: [held.spawn.id], players: [] });
        }],
        [1100, () => {
          held.wardStack = lab.newId();
          lab.state().stack.unshift(trigger());
          wardEvent('ability-activated', { to: 'Stack', wardAgainst: held.boltStack, text: trigger().text });
        }],
        [1800, () => {
          const s = lab.state(); s.stack = s.stack.filter((x: any) => x.id !== held.wardStack);
          if (paid) for (const x of opp().battlefield.filter((y: any) => y.land)) x.tapped = true;
          else {
            s.stack = s.stack.filter((x: any) => x.id !== held.boltStack);
            opp().graveyard.push(held.bolt);
            lab.emit('countered', { card: structuredClone(held.bolt), sourceId: held.bolt.id, actor: OPP, stackId: held.boltStack, from: 'Stack', to: 'Graveyard' });
          }
          wardEvent('resolved', { from: 'Stack', to: 'Battlefield', held: !paid });
        }],
        ...(paid ? [[1300, () => {
          resolve(held.bolt, held.boltStack);
          lab.damage(held.bolt, { card: held.spawn.id }, 3);
        }] as [number, () => void]] : []),
      ],
    };
  }
  /** A permanente que ficou no campo no lugar de ser destruída, como a ponte avisa. */
  function stays(c: any, stackId: number | undefined, sourceName: string | undefined, how = 'indestructible') {
    lab.emit('survived', { card: structuredClone(c), sourceId: c.id, actor: c.controller, survived: how, ...(stackId === undefined ? {} : { stackId }), ...(sourceName ? { sourceName } : {}) });
  }
  /** Uma mágica sua que mira o oponente, com o que a deixa diferente (`extra`: reforço, X): paga, vai à pilha e resolve causando `amount`. */
  function burnPlay(note: string, spell: () => any, lands: number, cost: string, extra: Record<string, unknown>, amount: number): Play {
    return {
      note,
      steps: [
        [0, () => { stage([...Array.from({ length: lands }, () => () => basic('Mountain')), 'small'], ['small', 'land']); }],
        ...pay(lands, cost, 900, () => {
          held.spell = spell();
          held.stack = lab.newId();
          const targets = { cards: [], players: [OPP] };
          lab.state().stack.push({ id: held.stack, text: held.spell.text, source: structuredClone(held.spell), controller: ME, targets });
          lab.emit('spell-cast', { card: structuredClone(held.spell), sourceId: held.spell.id, actor: ME, from: 'Hand', to: 'Stack', stackId: held.stack, targets, ...extra });
        }),
        [1900, () => { resolve(held.spell, held.stack); lab.damage(held.spell, { player: OPP }, amount); lab.settle(); }],
      ],
    };
  }
  const plays: Record<string, Play> = {
    extraTurn: {
      note: 'Turno extra: o Time Warp resolve, o seu turno acaba e o próximo é seu de novo, com o relógio voltando no meio da mesa.',
      steps: [
        [0, () => { stage(['big', 'hawk', 'land', 'land', 'land', 'land', 'land'], ['small', 'land']); }],
        [900, () => {
          for (const x of me().battlefield.filter((y: any) => y.land)) x.tapped = true;
          held.warp = spellCard('Time Warp', 'Sorcery', '{3}{U}{U}', 'Target player takes an extra turn after this one.');
          held.warpStack = cast(held.warp, { cards: [], players: [ME] });
        }],
        [1700, () => { resolve(held.warp, held.warpStack); lab.state().extraTurns = [ME]; }],
        [1500, () => {
          const s = lab.state(); s.turn++; s.activePlayer = ME; s.phase = 'UPKEEP'; s.extraTurn = true; s.extraTurns = [];
          lab.emit('turn', { actor: ME, turn: s.turn, extra: true });
          for (const c of me().battlefield) c.tapped = false;
        }],
        [2200, () => { const s = lab.state(); s.phase = 'MAIN1'; s.extraTurn = false; }],
      ],
    },
    storm: {
      note: 'Tempestade: o Grapeshot vai à pilha, o gatilho da tempestade cria 4 cópias, que se desdobram da original em leque com "×4", e cada uma resolve causando 1.',
      steps: [
        [0, () => { stage([() => basic('Mountain'), () => basic('Mountain'), 'small'], ['small', 'land']); }],
        ...pay(2, '{1}{R}', 900, () => {
          held.shot = spellCard('Grapeshot', 'Sorcery', '{1}{R}', 'Grapeshot deals 1 damage to any target.\nStorm');
          held.shotStack = cast(held.shot, { cards: [], players: [OPP] });
        }),
        [1300, () => {
          held.stormStack = lab.newId();
          lab.state().stack.push({ id: held.stormStack, text: 'Storm (When you cast this spell, copy it for each spell cast before it this turn.)', kind: 'trigger', source: structuredClone(held.shot), controller: ME });
          lab.emit('ability-activated', { card: structuredClone(held.shot), sourceId: held.shot.id, actor: ME, trigger: true, stackId: held.stormStack, to: 'Stack', text: 'Storm' });
        }],
        [1500, () => {
          const s = lab.state(); s.stack = s.stack.filter((x: any) => x.id !== held.stormStack);
          held.copies = Array.from({ length: 4 }, () => {
            const copy = { ...structuredClone(held.shot), id: lab.newId() }, stackId = lab.newId(), targets = { cards: [], players: [OPP] };
            s.stack.push({ id: stackId, text: copy.text, source: structuredClone(copy), controller: ME, targets });
            lab.emit('spell-cast', { card: structuredClone(copy), sourceId: copy.id, actor: ME, to: 'Stack', stackId, targets, copy: true });
            return { copy, stackId };
          });
          lab.emit('resolved', { card: structuredClone(held.shot), sourceId: held.shot.id, actor: ME, trigger: true, stackId: held.stormStack, from: 'Stack', to: 'Stack' });
        }],
        ...[3, 2, 1, 0].map((i): [number, () => void] => [i === 3 ? 2200 : 1100, () => {
          const { copy, stackId } = held.copies[i];
          const s = lab.state(); s.stack = s.stack.filter((x: any) => x.id !== stackId);
          lab.emit('resolved', { card: structuredClone(copy), sourceId: copy.id, actor: ME, stackId, from: 'Stack' });
          lab.damage(copy, { player: OPP }, 1); lab.settle();
        }]),
        [1100, () => { resolve(held.shot, held.shotStack); lab.damage(held.shot, { player: OPP }, 1); lab.settle(); }],
      ],
    },
    kicker: burnPlay('Reforço: o Burst Lightning é conjurado com o reforço pago; quando chega à pilha, a energia converge na carta, "Reforço" sobe dela, e ele causa 4 em vez de 2.',
      () => spellCard('Burst Lightning', 'Instant', '{R}', 'Kicker {4}\nBurst Lightning deals 2 damage to any target. If this spell was kicked, it deals 4 damage instead.'), 5, '{4}{R}', { kicked: true }, 4),
    xspell: burnPlay('Mágica com X: a Fireball é conjurada com X = 6; quando chega à pilha, a energia converge nela com um anel grande, "X = 6" sobe da carta, e ela causa 6.',
      () => spellCard('Fireball', 'Sorcery', '{X}{R}', 'This spell costs {1} more to cast for each target beyond the first.\nFireball deals X damage divided evenly, rounded down, among any number of targets.'), 7, '{6}{R}', { x: 6 }, 6),
    cascade: {
      note: 'Cascata: a Bloodbraid Elf vai à pilha, o gatilho da cascata abre o topo do grimório em leque no meio da mesa, o Lightning Bolt acende e é conjurado de graça; as outras voltam para o fundo.',
      steps: [
        [0, () => { stage([() => basic('Mountain'), () => basic('Forest'), () => basic('Mountain'), () => basic('Forest')], ['small', 'land']); }],
        ...pay(4, '{2}{R}{G}', 900, () => {
          held.elf = { ...lab.creature('Bloodbraid Elf', 3, 2, '{2}{R}{G}', ['HASTE']), id: lab.newId(), controller: ME, typeLine: 'Creature — Elf Berserker', text: 'Haste\nCascade', tapped: false, token: false };
          held.elfStack = cast(held.elf);
        }),
        [1300, () => {
          held.cascadeStack = lab.newId();
          lab.state().stack.push({ id: held.cascadeStack, text: 'Cascade', kind: 'trigger', source: structuredClone(held.elf), controller: ME });
          lab.emit('ability-activated', { card: structuredClone(held.elf), sourceId: held.elf.id, actor: ME, trigger: true, stackId: held.cascadeStack, to: 'Stack', text: 'Cascade' });
        }],
        [1500, () => {
          const s = lab.state();
          const revealed = [basic('Forest'), lab.card('Shivan Dragon', { creature: true, typeLine: 'Creature — Dragon', manaCost: '{4}{R}{R}' }), basic('Mountain'), basic('Forest'),
            spellCard('Lightning Bolt', 'Instant', '{R}', 'Lightning Bolt deals 3 damage to any target.')].map(c => ({ id: lab.newId(), controller: ME, tapped: false, token: false, ...c }));
          held.found = revealed.at(-1);
          me().library = Math.max(0, (me().library ?? 40) - 1);
          lab.emit('cascade', { card: structuredClone(held.elf), sourceId: held.elf.id, actor: ME, stackId: held.cascadeStack, dig: 'cascade', revealed: structuredClone(revealed), hit: held.found.id, cast: true });
          held.foundStack = lab.newId();
          const targets = { cards: [], players: [OPP] };
          s.stack.push({ id: held.foundStack, text: held.found.text, source: structuredClone(held.found), controller: ME, targets });
          lab.emit('spell-cast', { card: structuredClone(held.found), sourceId: held.found.id, actor: ME, from: 'Exile', to: 'Stack', stackId: held.foundStack, targets });
          s.stack = s.stack.filter((x: any) => x.id !== held.cascadeStack);
          lab.emit('resolved', { card: structuredClone(held.elf), sourceId: held.elf.id, actor: ME, trigger: true, stackId: held.cascadeStack, from: 'Stack', to: 'Stack' });
        }],
        [4200, () => { resolve(held.found, held.foundStack); lab.damage(held.found, { player: OPP }, 3); lab.settle(); }],
        [1500, () => {
          const s = lab.state(); s.stack = s.stack.filter((x: any) => x.id !== held.elfStack);
          me().battlefield.push(held.elf);
          lab.emit('resolved', { card: structuredClone(held.elf), sourceId: held.elf.id, actor: ME, stackId: held.elfStack, from: 'Stack', to: 'Battlefield' });
          lab.emit('entered', { card: structuredClone(held.elf), sourceId: held.elf.id, actor: ME, from: 'Stack', to: 'Battlefield' });
        }],
      ],
    },
    indestructible: {
      note: 'Raio na indestrutível: o oponente acerta 3 de dano no seu Darksteel Myr (0/1); ele racha com o golpe, as rachaduras se fecham em dourado e ele fica no campo.',
      steps: [
        [0, () => { stage(['myr', 'small', 'land', 'land'], [() => basic('Mountain'), 'small']); held.myr = me().battlefield.find((x: any) => x.name === 'Darksteel Myr'); }],
        [900, () => {
          opp().battlefield.find((y: any) => y.name === 'Mountain').tapped = true;
          held.bolt = spellCard('Lightning Bolt', 'Instant', '{R}', 'Lightning Bolt deals 3 damage to any target.', OPP);
          held.boltStack = cast(held.bolt, { cards: [held.myr.id], players: [] });
        }],
        [1700, () => { lab.damage(held.bolt, { card: held.myr.id }, 3); resolve(held.bolt, held.boltStack); lab.settle(); }],
      ],
    },
    regenerate: {
      note: 'Regenerar: o oponente manda destruir a sua criatura com um Doom Blade; ela tinha um escudo de regeneração, então racha, as rachaduras se fecham em verde e ela fica no campo, virada.',
      steps: [
        [0, () => {
          stage([() => lab.creature('Drudge Skeletons', 1, 1, '{1}{B}'), 'small', 'land', 'land'], [() => basic('Swamp'), () => basic('Swamp'), 'small']);
          held.bones = me().battlefield.find((x: any) => x.name === 'Drudge Skeletons');
        }],
        [900, () => {
          for (const x of opp().battlefield.filter((y: any) => y.land)) x.tapped = true;
          held.blade = spellCard('Go for the Throat', 'Instant', '{1}{B}', 'Destroy target nonartifact creature.', OPP);
          held.bladeStack = cast(held.blade, { cards: [held.bones.id], players: [] });
        }],
        [1700, () => { held.bones.tapped = true; stays(held.bones, held.bladeStack, 'Go for the Throat', 'regenerated'); resolve(held.blade, held.bladeStack); }],
      ],
    },
    doubleStrike: {
      note: 'Golpe duplo: a sua Boros Swiftblade ataca sem bloqueio; no primeiro golpe, um corte atravessa o retrato do oponente e, no segundo, outro corte cruza o primeiro.',
      steps: [
        [0, () => { stage(['blade', 'land', 'land'], ['land', 'land']); [held.blade] = creaturesOf(me()); }],
        [900, () => { attack([held.blade]); }],
        [1700, () => { lab.state().phase = 'COMBAT_FIRST_STRIKE_DAMAGE'; lab.damage(held.blade, { player: OPP }, 1, { combat: true, step: 'first-strike' }); lab.settle(); }],
        [1500, () => { lab.state().phase = 'COMBAT_DAMAGE'; lab.damage(held.blade, { player: OPP }, 1, { combat: true, step: 'regular' }); lab.settle(); }],
        [1800, () => { endCombat(); }],
      ],
    },
    phasing: {
      note: 'Mudança de fase: as suas duas criaturas saem de fase (ondulam e ficam translúcidas, como miragem) e, no começo do seu turno, voltam firmes com um clarão.',
      steps: [
        [0, () => { stage(['big', 'hawk', 'land', 'land'], ['small', 'land']); held.out = creaturesOf(me()); }],
        [900, () => {
          for (const c of held.out) { c.phasedOut = true; lab.emit('phased', { card: structuredClone(c), sourceId: c.id, actor: ME, out: true }); }
          // Um passo qualquer leva junto a mudança de fase, que não tem passo próprio.
          lab.lifeChange(ME, 1);
        }],
        [3200, () => {
          const s = lab.state(); s.turn++; s.activePlayer = ME; s.phase = 'UNTAP';
          for (const c of held.out) { c.phasedOut = false; lab.emit('phased', { card: structuredClone(c), sourceId: c.id, actor: ME }); }
          lab.emit('turn', { actor: ME, turn: s.turn });
        }],
        [1500, () => { lab.state().phase = 'MAIN1'; }],
      ],
    },
    ward: wardPlay('Ward anula: o oponente mira a sua Aboleth Spawn com um Lightning Bolt, a cúpula de favos sobe em volta dela com o golpe batendo do lado da pilha e, sem o {2} pago, o Bolt é anulado e a cúpula acende e se desfaz em luz.', false),
    wardPaid: wardPlay('Ward pago: o oponente mira a sua Aboleth Spawn com um Lightning Bolt, a cúpula sobe, ele paga o {2}, a cúpula trinca e cai em cacos e o Bolt resolve.', true),
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
    wrath: sweepPlay('Ira de Deus no campo cheio: a onda de luz dourada sai do seu retrato e varre a mesa, e cada criatura racha quando ela passa (o Darksteel Myr, indestrutível, fica).',
      () => spellCard('Wrath of God', 'Sorcery', '{2}{W}{W}', 'Destroy all creatures. They can\'t be regenerated.'),
      (c, stackId) => { if (c.keywords?.includes('INDESTRUCTIBLE')) held.stayed = [...(held.stayed ?? []), c]; else lab.leave(c, 'Graveyard', 'destroyed', { stackId, sourceName: 'Wrath of God' }); }),
    damnation: sweepPlay('Danação do oponente: a névoa roxa sai do retrato dele e varre a mesa, e cada criatura racha quando ela passa.',
      () => spellCard('Damnation', 'Sorcery', '{2}{B}{B}', 'Destroy all creatures. They can\'t be regenerated.', OPP),
      (c, stackId) => { if (c.keywords?.includes('INDESTRUCTIBLE')) held.stayed = [...(held.stayed ?? []), c]; else lab.leave(c, 'Graveyard', 'destroyed', { stackId, sourceName: 'Damnation' }); }),
    evacuation: sweepPlay('Evacuação: a maré sai do seu retrato e cada criatura volta para a mão do dono quando ela passa (as fichas somem).',
      () => spellCard('Evacuation', 'Instant', '{3}{U}{U}', 'Return all creatures to their owners\' hands.'),
      (c, stackId) => lab.leave(c, 'Hand', undefined, { stackId, sourceName: 'Evacuation' })),
    eviction: sweepPlay('Despejo impiedoso (branco e preto): a onda dourada sai do seu retrato e cada criatura é sugada pelo portal quando ela passa.',
      () => spellCard('Merciless Eviction', 'Sorcery', '{4}{W}{B}', 'Choose one — Exile all artifacts; creatures; enchantments; planeswalkers.'),
      (c, stackId) => lab.leave(c, 'Exile', undefined, { stackId, sourceName: 'Merciless Eviction' })),
    pyroclasm: {
      note: 'Piroclasmo: a onda de fogo sai do seu retrato e cada criatura leva 2 de dano quando ela passa; depois, as que morreram racham todas juntas, sem outra onda.',
      steps: [
        [0, () => { stage(['hawk', 'blade', 'token', 'big', 'land', 'land'], ['small', 'knight', 'spawn', 'token', 'land', 'land']); }],
        [900, () => {
          for (const x of me().battlefield.filter((y: any) => y.land)) x.tapped = true;
          held.pyro = spellCard('Pyroclasm', 'Sorcery', '{1}{R}', 'Pyroclasm deals 2 damage to each creature.');
          held.pyroStack = cast(held.pyro);
        }],
        [1800, () => {
          for (const c of [...creaturesOf(me()), ...creaturesOf(opp())]) lab.damage(held.pyro, { card: c.id }, 2);
          resolve(held.pyro, held.pyroStack);
          lab.settle();
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
    commanderStrike: {
      note: 'Golpe de comandante: o seu Prossh ataca sem bloqueio, avança com aura dourada e a coroa se estampa no retrato do oponente; uma coroa pequena voa até o "Dano" dele, que rola de 8/21 para 13/21.',
      steps: commanderSwing(8),
    },
    commanderThreat: {
      note: 'Comandante ameaça: com 13 de dano do seu Prossh, o golpe leva o "Dano" do oponente a 18/21; de 15 em diante o número pulsa vermelho, e de 18 em diante o contador também treme de vez em quando.',
      steps: commanderSwing(13),
    },
    commanderLethal: {
      note: 'Comandante chega a 21: com 16 de dano do seu Prossh, o oponente leva o golpe que chega a 21; a coroa estremece, fica vermelha e se parte, e o "Dano" acende em vermelho.',
      steps: commanderSwing(16),
    },
    gameChanger: {
      note: 'Game Changer: numa partida de Commander, o Rhystic Study chega à pilha, a mesa escurece, um facho de luz cai sobre ele com poeira dourada, a gema gira sob a luz com "Game Changer" e o nome embaixo, e pousa como selo no canto. Ele resolve e fica no campo com o selo; depois, o Ancient Tomb é jogado com a mesma cena.',
      steps: [
        [0, () => { stage(['land', 'land', 'land'], ['small', 'land']); lab.state().config = { ...lab.state().config, format: 'commander' }; }],
        ...pay(3, '{2}{U}', 900, () => {
          held.study = spellCard('Rhystic Study', 'Enchantment', '{2}{U}', 'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.');
          held.studyStack = cast(held.study);
        }),
        [3600, () => {
          const s = lab.state(); s.stack = s.stack.filter((x: any) => x.id !== held.studyStack);
          me().battlefield.push(held.study);
          lab.emit('resolved', { card: structuredClone(held.study), sourceId: held.study.id, actor: ME, stackId: held.studyStack, from: 'Stack', to: 'Battlefield' });
          lab.emit('entered', { card: structuredClone(held.study), sourceId: held.study.id, actor: ME, from: 'Stack', to: 'Battlefield' });
        }],
        [1600, () => {
          const tomb = put('me', lab.card('Ancient Tomb', { land: true, typeLine: 'Land' }));
          lab.emit('land-played', { card: structuredClone(tomb), sourceId: tomb.id, actor: ME, to: 'Battlefield' });
        }],
      ],
    },
    creatures: {
      note: 'Criaturas com som: entram um urso (rosna), um elfo (sininhos da floresta), um dragão (ruge) e três fichas de Esquilo juntas (um som só, e um esquilo atravessa a borda de baixo da tela).',
      steps: [
        [0, () => { stage(['land', 'land', 'land'], ['small', 'land']); }],
        ...([['Grizzly Bears', 'Creature — Bear', '{1}{G}', 2, 2], ['Llanowar Elves', 'Creature — Elf Druid', '{G}', 1, 1], ['Shivan Dragon', 'Creature — Dragon', '{4}{R}{R}', 5, 5]] as const)
          .map(([name, typeLine, manaCost, power, toughness], i): [number, () => void] => [i ? 1900 : 900, () => {
            const c = put('me', { ...lab.creature(name, power, toughness, manaCost), typeLine });
            lab.emit('entered', { card: structuredClone(c), sourceId: c.id, actor: ME, from: 'Stack', to: 'Battlefield' });
          }]),
        [2200, () => {
          const stackId = lab.newId();
          for (let i = 0; i < 3; i++) {
            const t = put('me', { ...lab.creature('Squirrel', 1, 1, ''), typeLine: 'Token Creature — Squirrel', token: true });
            lab.emit('entered', { card: structuredClone(t), sourceId: t.id, actor: ME, from: 'None', to: 'Battlefield', stackId });
          }
        }],
      ],
    },
    firstBlood: {
      note: 'Primeiro sangue: o jogo começa (turno 1) e o seu urso acerta o oponente sem bloqueio; o retrato dele leva um corte vermelho, as bordas da mesa piscam, a faixa "Primeiro sangue" aparece e o narrador diz "First blood!". O segundo golpe já é um golpe comum.',
      steps: [
        [0, () => { stage(['land', 'land', () => ({ ...lab.creature('Grizzly Bears', 2, 2, '{1}{G}'), typeLine: 'Creature — Bear' })], ['land']); }],
        [600, () => { lab.emit('turn', { actor: ME, turn: 1 }); }],
        [900, () => { const bear = creaturesOf(me())[0]; if (bear) lab.combat(bear, { player: OPP }); }],
        [3200, () => { const bear = creaturesOf(me())[0]; if (bear) { bear.tapped = false; bear.attacking = false; lab.combat(bear, { player: OPP }); } }],
      ],
    },
    doubleKill: {
      note: 'Eliminação dupla: com os dois jogadores a 3 de vida, o Terremoto (X = 3) acerta os dois; os retratos se apagam um depois do outro, cada um com um corte em X, a faixa "Eliminação dupla" aparece no meio da mesa e o narrador diz "Double kill!".',
      steps: [
        [0, () => { stage(['land', 'land', 'land', 'land'], ['land', 'land'], [3, 3]); }],
        [900, () => {
          held.quake = spellCard('Earthquake', 'Sorcery', '{X}{R}', 'Earthquake deals X damage to each creature without flying and each player.');
          held.quakeStack = cast(held.quake);
        }],
        [1500, () => {
          lab.damage(held.quake, { player: OPP }, 3);
          lab.damage(held.quake, { player: ME }, 3);
          resolve(held.quake, held.quakeStack);
        }],
      ],
    },
    longTurn: {
      note: 'Turno longo: o seu turno já passa de 2 minutos; a ampulheta aparece no canto de cima do seu retrato, com a areia escorrendo, e vira de vez em quando. Some quando o turno passa.',
      steps: [
        [0, () => { stage(['land', 'land'], ['land']); }],
        [400, () => { lab.emit('turn', { actor: ME, turn: 2 }); lab.state().turnElapsedMs = 125_000; }],
      ],
    },
    crowded: {
      note: 'Campo lotado range: com 32 terrenos no seu campo, mais duas fichas entram; a mesa balança de leve e range, como madeira cedendo ao peso (no máximo uma vez a cada 15 s).',
      steps: [
        [0, () => { stage(Array.from({ length: 32 }, () => 'land'), ['land']); }],
        [900, () => { lab.run({ cmd: 'tokens', side: 'me', n: 2 }); }],
      ],
    },
    comeback: {
      note: 'Virada no fim do jogo: com 3 de vida, você ganha 15 de vida e o seu dragão derruba o oponente; o resultado traz "Virada!" em dourado ("Você chegou a 3 de vida e virou o jogo") e o destaque do jogo, o maior golpe, com "Ver de novo".',
      steps: ending([3, 7], [[20, 20], [3, 20], [3, 7]], () => {
        lab.lifeChange(ME, 15);
        const dragon = creaturesOf(me())[0];
        if (dragon) { dragon.sick = false; lab.combat(dragon, { player: OPP }); }
      }),
    },
    byAThread: {
      note: 'Vitória por um fio: com 1 de vida, o seu dragão derruba o oponente; o resultado traz "Por um fio" com o coração batendo devagar ("Você venceu com 1 de vida").',
      steps: ending([1, 7], [[20, 20], [6, 14], [1, 7]], () => {
        const dragon = creaturesOf(me())[0];
        if (dragon) { dragon.sick = false; lab.combat(dragon, { player: OPP }); }
      }),
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
    return 'Jogadas em sequência: todas, uma depois da outra (toque de novo para parar).';
  }
  return { start, startAll };
}

/** Os botões das jogadas, por grupo, para o painel. */
export function playButtons() {
  return PLAY_BUTTONS.map(([group, list]) => `<p class="play-group">${group}</p>${list.map(([key, label]) => `<button data-play="${key}">${label}</button>`).join('')}`).join('');
}
