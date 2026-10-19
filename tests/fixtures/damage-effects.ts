import '../../src/style.css';
import { createForgeTableView } from '../../src/ui/forgeTable';

/*
 * Simulação interativa dos efeitos de dano na mesa de verdade, sem a ponte: cada botão do painel manda à mesa os
 * mesmos eventos `damage` / `life-changed` / `left` que a ponte manda (com o quadro público de cada instante).
 * Abra /tests/fixtures/damage-effects.html no `npm run dev`.
 */
const ME = 10, OPP = 23;
let nextId = 1000;
const card = (name: string, controller: number, extra: Record<string, unknown> = {}): any => ({ id: nextId++, name, controller, tapped: false, token: false, ...extra });
const land = (name: string, controller: number) => card(name, controller, { land: true, creature: false, typeLine: `Land — ${name}` });
const creature = (name: string, controller: number, power: number, toughness: number, manaCost: string, keywords: string[] = []) =>
  card(name, controller, { creature: true, power, toughness, basePower: power, baseToughness: toughness, damage: 0, manaCost, typeLine: 'Creature', keywords });

let players: any[] = [];
let state: any;
let seq = 0;

function setup() {
  players = [
    { id: ME, seat: 0, name: 'Você', ai: false, life: 20, library: 40, handCount: 0, hand: [], pool: {}, graveyard: [], exile: [], battlefield: [
      creature('Colossal Dreadmaw', ME, 6, 6, '{4}{G}{G}', ['TRAMPLE']),
      creature('Boros Swiftblade', ME, 1, 2, '{R}{W}', ['DOUBLE_STRIKE']),
      creature('White Knight', ME, 2, 2, '{W}{W}', ['FIRST_STRIKE']),
      creature('Vampire Nighthawk', ME, 2, 3, '{1}{B}{B}', ['FLYING', 'DEATHTOUCH', 'LIFELINK']),
      creature('Blighted Agent', ME, 1, 1, '{1}{U}', ['INFECT']),
      creature('Boggart Ram-Gang', ME, 3, 3, '{R/G}{R/G}{R/G}', ['HASTE', 'WITHER']),
      ...['Mountain', 'Mountain', 'Forest', 'Sulfurous Springs'].map(n => land(n, ME))] },
    { id: OPP, seat: 1, name: 'Oponente', ai: true, life: 20, library: 40, handCount: 4, hand: [], pool: {}, graveyard: [], exile: [], battlefield: [
      creature('Grizzly Bears', OPP, 2, 2, '{1}{G}'),
      creature('Hill Giant', OPP, 3, 3, '{3}{R}'),
      creature('Typhoid Rats', OPP, 1, 1, '{B}', ['DEATHTOUCH']),
      card('Jace Beleren', OPP, { planeswalker: true, typeLine: 'Legendary Planeswalker — Jace', manaCost: '{1}{U}{U}', counters: { LOYALTY: 3 } }),
      ...['Forest', 'Forest', 'Swamp'].map(n => land(n, OPP))] },
  ];
  state = {
    type: 'state', config: { format: 'free', matchLength: 'bo1' }, you: ME, players, turn: 6, phase: 'MAIN1', activePlayer: ME, gameOver: false,
    log: [], decks: [], stack: [], combat: [], castable: [], events: [], eventCursor: seq, matchId: 'damage-sim',
    input: { gen: 1, priority: false, message: 'Simulação de dano: use o painel ao lado.', ok: { label: 'OK', enabled: false }, cancel: { label: '', enabled: false }, selectable: [], actionable: [] },
  };
}

const player = (id: number) => players.find(p => p.id === id);
const find = (name: string) => players.flatMap(p => p.battlefield).find((c: any) => c.name === name);
const lightningBolt = () => card('Lightning Bolt', ME, { manaCost: '{R}', typeLine: 'Instant', text: 'Lightning Bolt deals 3 damage to any target.' });
const fireball = () => card('Fireball', ME, { manaCost: '{X}{R}', typeLine: 'Sorcery', text: 'Fireball deals X damage to any target.' });

/** Quadro público do instante: o que a mesa mostra enquanto o evento é apresentado. */
function frame() {
  return structuredClone({ turn: state.turn, phase: state.phase, activePlayer: state.activePlayer, stack: state.stack, combat: state.combat,
    players: players.map(p => ({ id: p.id, life: p.life, battlefield: p.battlefield, handCount: p.handCount, library: p.library })) });
}
let batch: any[] = [];
function emit(type: string, extra: Record<string, unknown>) {
  batch.push({ seq: ++seq, stateVersion: seq, type, ...extra, frame: frame() });
}
function damage(source: any, target: { card?: any; player?: number }, amount: number, flags: Record<string, unknown> = {}) {
  if (target.card?.creature && !flags.wither) target.card.damage = (target.card.damage ?? 0) + amount;
  if (target.card?.creature && flags.wither) { target.card.toughness -= amount; target.card.power -= amount; target.card.counters = { ...target.card.counters, M1M1: (target.card.counters?.M1M1 ?? 0) + amount }; }
  if (target.card?.planeswalker) target.card.counters.LOYALTY = Math.max(0, target.card.counters.LOYALTY - amount);
  const lethal = target.card?.creature ? (flags.deathtouch || target.card.damage >= target.card.toughness) : target.card?.planeswalker ? target.card.counters.LOYALTY <= 0
    : target.player !== undefined && !flags.infect && player(target.player).life - amount <= 0;
  emit('damage', { card: structuredClone(source), sourceId: source.id, actor: source.controller, delta: -amount,
    targets: { cards: target.card ? [target.card.id] : [], players: target.player !== undefined ? [target.player] : [] },
    combat: false, ...flags, ...(lethal ? { lethal: true } : {}), ...(target.card?.planeswalker ? { loyalty: true } : {}) });
}
function lifeChange(id: number, delta: number) { player(id).life += delta; emit('life-changed', { actor: id, delta }); }
function poison(id: number, n: number) { const p = player(id); p.counters = { ...p.counters, POISON: (p.counters?.POISON ?? 0) + n }; }
function dies(c: any) {
  const owner = player(c.controller);
  owner.battlefield = owner.battlefield.filter((x: any) => x !== c);
  owner.graveyard.push({ ...c, damage: 0 });
  emit('left', { card: structuredClone(c), sourceId: c.id, actor: c.controller, from: 'Battlefield', to: 'Graveyard' });
}
function send(note: string) {
  state.events = [...state.events, ...batch].slice(-60); state.eventCursor = seq; batch = [];
  state.input.gen++;
  guide(note);
  view.render();
}
/** Mágica na pilha durante a resolução: o projétil sai dela. */
function resolving(spell: any, fn: () => void, note: string) {
  state.phase = 'MAIN1'; state.combat = [];
  state.stack = [{ id: nextId++, text: spell.text, source: spell, controller: ME }];
  fn();
  state.stack = []; player(ME).graveyard.push(spell);
  emit('resolved', { card: structuredClone(spell), sourceId: spell.id, actor: ME, from: 'Stack', to: 'Graveyard' });
  send(note);
}
/** Combate: marca atacantes e bloqueadores, roda os golpes na etapa certa e limpa no fim. */
function combat(pairs: { attacker: any; blockers?: any[]; defender?: number }[], hits: () => void, note: string) {
  state.phase = 'COMBAT_DAMAGE'; state.activePlayer = pairs[0].attacker.controller;
  state.combat = pairs.map(p => ({ attacker: p.attacker.id, defender: p.defender ?? OPP, defenderKind: 'player', blockers: (p.blockers ?? []).map(b => b.id) }));
  for (const p of pairs) { p.attacker.attacking = true; p.attacker.tapped = true; for (const b of p.blockers ?? []) b.blocking = true; }
  hits();
  for (const p of pairs) { p.attacker.attacking = false; for (const b of p.blockers ?? []) b.blocking = false; }
  state.combat = []; state.phase = 'COMBAT_END';
  send(note);
}
const strike = (step: 'first-strike' | 'regular') => ({ combat: true, step });

const scenarios: [string, string, () => void][] = [
  ['Choque no jogador', 'Dano direto', () => resolving(lightningBolt(), () => { const bolt = state.stack[0].source; damage(bolt, { player: OPP }, 3); lifeChange(OPP, -3); },
    'Lightning Bolt: o projétil sai da pilha com rastro até o retrato do oponente, impacto e "−3".')],
  ['Choque na criatura (letal)', 'Dano direto', () => resolving(lightningBolt(), () => { const bears = find('Grizzly Bears') ?? find('Hill Giant'); damage(state.stack[0].source, { card: bears }, 3); dies(bears); },
    'O projétil acerta a criatura; dano letal: ela treme e escurece antes de ir ao cemitério.')],
  ['Choque no planeswalker', 'Dano direto', () => resolving(lightningBolt(), () => { const jace = find('Jace Beleren'); if (!jace) return; damage(state.stack[0].source, { card: jace }, 3); dies(jace); },
    'Dano a planeswalker: número laranja (lealdade caindo). Com 3 de lealdade, ele sai do campo.')],
  ['Bola de Fogo letal', 'Dano direto', () => resolving(fireball(), () => { damage(state.stack[0].source, { player: OPP }, player(OPP).life); lifeChange(OPP, -player(OPP).life); },
    'Dano letal no jogador: número grande, impacto maior e a mesa treme. (Clique em Recomeçar para voltar a 20.)')],
  ['Dor (terreno de dor)', 'Dano direto', () => { const springs = find('Sulfurous Springs'); springs.tapped = true; damage(springs, { player: ME }, 1, { self: true }); lifeChange(ME, -1); send('Dano a si mesmo: o golpe acontece no próprio retrato, sem trajeto.'); }],
  ['Ataque sem bloqueio (6)', 'Combate', () => { const wurm = find('Colossal Dreadmaw'); combat([{ attacker: wurm }], () => { damage(wurm, { player: OPP }, 6, strike('regular')); lifeChange(OPP, -6); },
    'Dano de combate grande: o atacante avança até o retrato e volta; número maior e tremor leve da mesa.') }],
  ['Bloqueio com revide', 'Combate', () => { const giant = find('Hill Giant'); const att = find('White Knight');
    if (!giant || !att) return;
    combat([{ attacker: giant, blockers: [att], defender: ME }], () => {
      damage(att, { card: giant }, 2, strike('first-strike'));
      damage(giant, { card: att }, 3, strike('regular')); dies(att);
    }, 'White Knight (iniciativa) bloqueia Hill Giant: primeiro o golpe com selo "Iniciativa", depois o revide do gigante, letal.') }],
  ['Atropelar', 'Combate', () => { const wurm = find('Colossal Dreadmaw'); const bears = find('Grizzly Bears') ?? find('Typhoid Rats'); if (!bears) return;
    combat([{ attacker: wurm, blockers: [bears] }], () => {
      damage(wurm, { card: bears }, bears.toughness, strike('regular'));
      damage(wurm, { player: OPP }, 6 - bears.toughness, { ...strike('regular'), trample: true });
      damage(bears, { card: wurm }, bears.power, strike('regular'));
      lifeChange(OPP, -(6 - bears.toughness)); dies(bears);
    }, 'Atropelar: o golpe acerta o bloqueador e o excesso segue até o jogador com o selo "Atropelar".') }],
  ['Golpe duplo', 'Combate', () => { const blade = find('Boros Swiftblade'); combat([{ attacker: blade }], () => {
      damage(blade, { player: OPP }, 1, { ...strike('first-strike'), doubleStrike: true }); lifeChange(OPP, -1);
      damage(blade, { player: OPP }, 1, { ...strike('regular'), doubleStrike: true }); lifeChange(OPP, -1);
    }, 'Golpe duplo: dois golpes, "1º golpe" na etapa de iniciativa e "2º golpe" na normal.') }],
  ['Toque mortífero', 'Combate', () => { const rats = find('Typhoid Rats'); const wurm = find('Colossal Dreadmaw'); if (!rats) return;
    combat([{ attacker: wurm, blockers: [rats] }], () => {
      damage(wurm, { card: rats }, 1, strike('regular')); damage(wurm, { player: OPP }, 5, { ...strike('regular'), trample: true });
      damage(rats, { card: wurm }, 1, { ...strike('regular'), deathtouch: true });
      lifeChange(OPP, -5); dies(rats); dies(wurm);
    }, 'Typhoid Rats bloqueia: 1 de dano com toque mortífero tem a caveira e mata o Dreadmaw.') }],
  ['Vínculo com a vida', 'Combate', () => { const hawk = find('Vampire Nighthawk'); combat([{ attacker: hawk }], () => {
      damage(hawk, { player: OPP }, 2, { ...strike('regular'), deathtouch: true, lifelink: true }); lifeChange(ME, 2); lifeChange(OPP, -2);
    }, 'Vínculo com a vida: o golpe no oponente e, logo depois, "+2" verde subindo do seu retrato.') }],
  ['Infectar', 'Combate', () => { const agent = find('Blighted Agent'); combat([{ attacker: agent }], () => {
      poison(OPP, 1); damage(agent, { player: OPP }, 1, { ...strike('regular'), infect: true });
    }, 'Infectar: em vez de dano, "+1 veneno" roxo no retrato e o marcador de veneno do oponente.') }],
  ['Murchar', 'Combate', () => { const gang = find('Boggart Ram-Gang'); const giant = find('Hill Giant'); if (!giant) return;
    combat([{ attacker: gang, blockers: [giant] }], () => {
      damage(gang, { card: giant }, 3, { ...strike('regular'), wither: true });
      damage(giant, { card: gang }, giant.power, strike('regular'));
      dies(giant);
    }, 'Murchar: o golpe vira marcadores −1/−1 ("−3/−3" roxo); o gigante encolhe e morre.') }],
];

const view = createForgeTableView(document.querySelector('#table')!, { onExit() { location.reload(); }, onRematch() { location.reload(); } });
setup();
const client = { state, connected: true, send() {} };
view.attach(client as any, []);

const panel = document.createElement('aside');
panel.setAttribute('aria-live', 'polite');
panel.style.cssText = 'position:fixed;z-index:80;left:12px;top:50%;transform:translateY(-50%);width:min(250px,30vw);max-height:92vh;overflow:auto;padding:12px 14px;border-radius:12px;background:#0c1222f2;border:1px solid #f2b54c66;color:#e9eef7;font:500 13px/1.45 system-ui,sans-serif;box-shadow:0 10px 30px #0009';
document.body.append(panel);
const button = 'display:block;width:100%;margin:4px 0;font:600 12px system-ui;padding:6px 10px;border-radius:8px;border:1px solid #ffffff30;background:#ffffff10;color:inherit;cursor:pointer;text-align:left';
function guide(text: string) {
  const groups = [...new Set(scenarios.map(s => s[1]))];
  panel.innerHTML = `<strong style="display:block;color:#f2b54c;margin-bottom:6px">Simulação: efeitos de dano</strong><p id="simNote" style="margin:0 0 8px">${text}</p>`
    + groups.map(g => `<div style="margin-top:8px;color:#9aa5bb;font-size:11px;text-transform:uppercase;letter-spacing:.06em">${g}</div>`
      + scenarios.map((s, i) => s[1] === g ? `<button type="button" data-sim="${i}" style="${button}">${s[0]}</button>` : '').join('')).join('')
    + `<button type="button" id="simReset" style="${button};margin-top:10px;text-align:center;border-radius:999px">Recomeçar</button>`
    + '<p style="margin:8px 0 0;color:#9aa5bb;font-size:11px">Com "reduzir movimento" ligado no sistema, só aparecem o número e o destaque.</p>';
  panel.querySelectorAll<HTMLElement>('[data-sim]').forEach(b => b.addEventListener('click', () => scenarios[Number(b.dataset.sim)][2]()));
  panel.querySelector('#simReset')!.addEventListener('click', () => { setup(); client.state = state; guide('Mesa de volta ao começo.'); view.attach(client as any, []); });
}
guide('Escolha um efeito. Cada botão manda à mesa os mesmos eventos que a ponte do Forge manda numa partida.');
send('Escolha um efeito. Cada botão manda à mesa os mesmos eventos que a ponte do Forge manda numa partida.');
