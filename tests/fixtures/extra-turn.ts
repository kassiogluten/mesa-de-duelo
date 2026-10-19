import '../../src/style.css';
import { createForgeTableView } from '../../src/ui/forgeTable';

/*
 * Simulação interativa de turno extra (Time Walk) e combate extra (Relentless Assault) na mesa de verdade,
 * sem a ponte: os cliques da mesa avançam um roteiro local. Abra /tests/fixtures/extra-turn.html no `npm run dev`.
 */
const ME = 10, OPP = 23;
let nextId = 1000;
const card = (name: string, controller: number, extra: Record<string, unknown> = {}) => ({ id: nextId++, name, controller, tapped: false, token: false, ...extra });
const land = (name: string, controller: number) => card(name, controller, { land: true, creature: false, typeLine: `Basic Land — ${name}` });
const creature = (name: string, controller: number, power: number, toughness: number, manaCost: string) => card(name, controller, { creature: true, power, toughness, manaCost, typeLine: 'Creature' });

const timeWalk = card('Time Walk', ME, { manaCost: '{1}{U}', typeLine: 'Sorcery', text: 'Take an extra turn after this one.' });
const assault = card('Relentless Assault', ME, { manaCost: '{2}{R}{R}', typeLine: 'Sorcery', text: 'Untap all creatures that attacked this turn. After this main phase, there is an additional combat phase followed by an additional main phase.' });

const players: any[] = [
  { id: ME, seat: 0, name: 'Você', ai: false, life: 20, library: 40, handCount: 3, hand: [timeWalk, assault, land('Mountain', ME)], pool: {}, graveyard: [], exile: [],
    battlefield: [creature('Goblin Guide', ME, 2, 2, '{R}'), creature('Monastery Swiftspear', ME, 1, 2, '{R}'), ...['Island', 'Island', 'Mountain', 'Mountain'].map(n => land(n, ME))] },
  { id: OPP, seat: 1, name: 'Oponente', ai: true, life: 20, library: 40, handCount: 5, hand: [], pool: {}, graveyard: [], exile: [],
    battlefield: [creature('Grizzly Bears', OPP, 2, 2, '{1}{G}'), ...['Forest', 'Forest', 'Forest'].map(n => land(n, OPP))] },
];
const state: any = {
  type: 'state', config: { format: 'free', matchLength: 'bo1' }, you: ME, players, turn: 5, phase: 'MAIN1', activePlayer: ME, gameOver: false,
  log: [], decks: [], stack: [], combat: [], castable: [], events: [],
  input: { gen: 1, priority: true, message: '', ok: { label: 'OK', enabled: true }, cancel: { label: 'Fim de turno', enabled: true }, selectable: [], actionable: [] },
};

const me = () => players[0];
/** Fases em que a simulação para no seu turno; um combate extra entra na frente desta fila. */
let queue: string[] = ['COMBAT_DECLARE_ATTACKERS', 'MAIN2', 'END_OF_TURN'];
let combats = 0;
let landPlayed = false;
let opponentTimer = 0;

const untapAll = (pid: number) => players.find(p => p.id === pid).battlefield.forEach((c: any) => { c.tapped = false; });
const tap = (n: number) => me().battlefield.filter((c: any) => c.land && !c.tapped).slice(0, n).forEach((c: any) => { c.tapped = true; });

function playable() {
  const main = state.phase === 'MAIN1' || state.phase === 'MAIN2';
  if (state.activePlayer !== ME || state.stack.length || !main) return [];
  const untapped = me().battlefield.filter((c: any) => c.land && !c.tapped).length;
  return me().hand.filter((c: any) => (c === timeWalk && untapped >= 2) || (c === assault && untapped >= 4) || (c.land && !landPlayed)).map((c: any) => c.id);
}

function sync(note: string) {
  const mine = state.activePlayer === ME;
  me().handCount = me().hand.length;
  if (!state.phase?.startsWith('COMBAT')) delete state.combatNumber;
  Object.assign(state.input, {
    gen: state.input.gen + 1, priority: mine, actionable: playable(),
    ok: { label: 'OK', enabled: mine }, cancel: { label: mine ? 'Fim de turno' : '', enabled: mine },
  });
  guide(note);
  view.render();
}

function startMyTurn(extra: boolean) {
  clearTimeout(opponentTimer);
  state.turn++; state.activePlayer = ME; landPlayed = false; combats = 0;
  if (extra) state.extraTurn = true; else delete state.extraTurn;
  delete state.extraCombats; delete state.extraCombatAfter;
  untapAll(ME);
  state.phase = 'MAIN1';
  queue = ['COMBAT_DECLARE_ATTACKERS', 'MAIN2', 'END_OF_TURN'];
  sync(extra
    ? 'Turno extra! A faixa disse "Turno extra" e o número do turno na trilha ganhou um "+". Agora conjure Relentless Assault (4 terrenos) numa fase principal para ganhar um combate extra.'
    : 'Seu turno normal. Time Walk já foi usado; clique em Recomeçar para ver tudo de novo.');
}

function nextPhase() {
  const next = queue.shift();
  if (!next) return endTurn();
  // Como no Forge: o combate extra deixa de estar "por vir" quando começa, e o turno conta todos os combates.
  const extra = next === 'COMBAT_EXTRA';
  state.phase = extra ? 'COMBAT_DECLARE_ATTACKERS' : next;
  if (state.phase.startsWith('COMBAT')) { combats++; state.combatNumber = combats; }
  if (extra && state.extraCombats) {
    state.extraCombats -= 1;
    if (!state.extraCombats) { delete state.extraCombats; delete state.extraCombatAfter; }
  }
  const notes: Record<string, string> = {
    MAIN1: combats ? 'Principal extra, depois do combate extra. O combate normal do turno ainda vem.' : 'Principal 1.',
    COMBAT_EXTRA: combats > 1
      ? 'Combate extra: a faixa "Combate extra" passou e o ícone do combate mostra ×2. (Aqui não há declaração de ataque.)'
      : 'Este é o combate extra, que veio logo depois da principal 1. O combate normal do turno ainda vem depois da principal extra.',
    COMBAT_DECLARE_ATTACKERS: combats > 1
      ? 'Combate extra: a faixa "Combate extra" passou e o ícone do combate mostra ×2. (Aqui não há declaração de ataque.)'
      : 'Combate. Passe para a principal 2.',
    MAIN2: state.extraCombats
      ? 'Ainda há um combate extra por vir: o botão diz "Para o combate extra" e o atalho "Fim de turno" sumiu.'
      : combats > 1 ? 'Principal extra, depois do combate extra. Agora "Fim de turno" voltou.' : 'Principal 2.',
    END_OF_TURN: state.extraTurns?.length ? 'Etapa final. Passe para começar o turno extra.' : 'Etapa final. Passe para o turno do oponente.',
  };
  sync(notes[next] ?? next);
}

function endTurn() {
  if (state.extraTurns?.length) {
    state.extraTurns.shift();
    if (!state.extraTurns.length) delete state.extraTurns;
    return startMyTurn(true);
  }
  // Turno do oponente: passa sozinho pelas fases e devolve a vez.
  state.turn++; state.activePlayer = 23; delete state.extraTurn; delete state.extraCombats; delete state.extraCombatAfter;
  untapAll(23);
  const phases = ['MAIN1', 'COMBAT_DECLARE_ATTACKERS', 'MAIN2', 'END_OF_TURN'];
  const step = () => {
    const p = phases.shift();
    if (!p) return startMyTurn(false);
    state.phase = p;
    sync('Turno do oponente: passa sozinho. Depois a vez volta para você, num turno normal.');
    opponentTimer = window.setTimeout(step, 1100);
  };
  step();
}

function resolve() {
  const item = state.stack.pop();
  me().graveyard.push(item.source);
  if (item.source === timeWalk) {
    state.extraTurns = [...(state.extraTurns ?? []), ME];
    sync('Time Walk resolveu: um turno extra seu está na fila. Passe o mouse no número do turno (trilha de fases, embaixo à direita) para ver "Depois: turno extra seu". Depois termine o turno.');
    return;
  }
  // Depois desta principal: um combate e mais uma principal.
  queue.unshift('COMBAT_EXTRA', state.phase);
  state.extraCombats = (state.extraCombats ?? 0) + 1;
  state.extraCombatAfter = [state.phase];
  me().battlefield.filter((c: any) => c.creature).forEach((c: any) => { c.tapped = false; });
  sync('Relentless Assault resolveu: há um combate extra depois desta principal. Repare no botão "Para o combate extra", no ×2 do ícone do combate e que "Fim de turno" sumiu.');
}

const client = {
  state, connected: true,
  send(message: any) {
    if (state.activePlayer !== ME) return;
    if (message.type === 'card') {
      const c = me().hand.find((x: any) => x.id === message.id);
      if (!c || !state.input.actionable.includes(c.id)) return;
      me().hand = me().hand.filter((x: any) => x !== c);
      if (c.land) { landPlayed = true; me().battlefield.push(c); sync('Terreno jogado.'); return; }
      tap(c === timeWalk ? 2 : 4);
      state.stack.push({ id: nextId++, text: c.text, source: c, controller: ME });
      sync(`${c.name} está na pilha. Clique em "Resolver".`);
      return;
    }
    if (message.type === 'ok') { if (state.stack.length) resolve(); else nextPhase(); return; }
    if (message.type === 'cancel' || message.type === 'pass-turn') { queue = []; endTurn(); }
  },
};

// Roteiro na lateral: o que fazer agora e o que reparar na mesa.
const panel = document.createElement('aside');
panel.setAttribute('aria-live', 'polite');
panel.style.cssText = 'position:fixed;z-index:80;left:12px;top:50%;transform:translateY(-50%);width:min(260px,30vw);padding:12px 14px;border-radius:12px;background:#0c1222f2;border:1px solid #f2b54c66;color:#e9eef7;font:500 13px/1.45 system-ui,sans-serif;box-shadow:0 10px 30px #0009';
document.body.append(panel);
function guide(text: string) {
  panel.innerHTML = `<strong style="display:block;color:#f2b54c;margin-bottom:6px">Simulação: turno e combate extra</strong><p style="margin:0 0 10px">${text}</p><button type="button" id="simReset" style="font:600 12px system-ui;padding:6px 12px;border-radius:999px;border:1px solid #ffffff40;background:#ffffff10;color:inherit;cursor:pointer">Recomeçar</button>`;
  panel.querySelector('#simReset')!.addEventListener('click', () => location.reload());
}

const view = createForgeTableView(document.querySelector('#table')!, { onExit() { location.reload(); }, onRematch() { location.reload(); } });
view.attach(client as any, []);
sync('Seu turno (turno 5), principal 1. Clique em Time Walk na mão para conjurar.');
