import type { FState } from '../forge/client';
import { esc } from './cardtext';

/** Cinco grupos como no Arena: início (desvirar, manutenção, compra), as duas principais, combate e final. */
const PHASES = [
  ['start', 'Início', '<path d="M19 12a7 7 0 1 1-2.05-4.95M19 4v4h-4"/>'],
  ['main1', 'Principal 1', '<rect x="7" y="4" width="10" height="16" rx="2"/>'],
  ['combat', 'Combate', '<path d="m5 5 14 14M19 5 5 19M5 15v4h4M19 15v4h-4"/>'],
  ['main2', 'Principal 2', '<rect x="7" y="4" width="10" height="16" rx="2"/><path d="M10 9h4M10 13h4"/>'],
  ['end', 'Final', '<path d="M17 15.5A7 7 0 0 1 8.5 7a7 7 0 1 0 8.5 8.5z"/>'],
] as const;
const STEPS: Record<string, { group: string; detail: string }> = {
  UNTAP: { group: 'start', detail: 'Desvirar' },
  UPKEEP: { group: 'start', detail: 'Manutenção' },
  DRAW: { group: 'start', detail: 'Compra' },
  MAIN1: { group: 'main1', detail: 'Fase principal antes do combate' },
  COMBAT_BEGIN: { group: 'combat', detail: 'Início do combate' },
  COMBAT_DECLARE_ATTACKERS: { group: 'combat', detail: 'Declaração de atacantes' },
  COMBAT_DECLARE_BLOCKERS: { group: 'combat', detail: 'Declaração de bloqueadores' },
  COMBAT_FIRST_STRIKE_DAMAGE: { group: 'combat', detail: 'Dano de iniciativa' },
  COMBAT_DAMAGE: { group: 'combat', detail: 'Dano de combate' },
  COMBAT_END: { group: 'combat', detail: 'Fim do combate' },
  MAIN2: { group: 'main2', detail: 'Fase principal depois do combate' },
  END_OF_TURN: { group: 'end', detail: 'Etapa final' },
  CLEANUP: { group: 'end', detail: 'Limpeza' },
};
type HudState = Pick<FState, 'turn' | 'phase' | 'activePlayer' | 'you' | 'players' | 'gameOver' | 'extraTurn' | 'extraTurns' | 'combatNumber' | 'extraCombats'>;

function owner(state: HudState) {
  const mine = state.activePlayer === state.you;
  const activeName = state.players.find(player => player.id === state.activePlayer)?.name;
  const extra = state.extraTurn ? ' extra' : '';
  return state.gameOver ? 'Jogo encerrado' : mine ? `Seu turno${extra}` : activeName === 'Oponente' ? `Turno${extra} do oponente` : activeName ? `Turno${extra} de ${activeName}` : 'Preparando o jogo';
}

/** "Turno extra" no começo de um turno extra, como a faixa de troca de turno mostra. */
export function turnBannerText(state: HudState) {
  const mine = state.activePlayer === state.you;
  const name = state.players.find(player => player.id === state.activePlayer)?.name;
  if (state.extraTurn) return mine ? 'Turno extra' : state.players.length > 2 && name ? `Turno extra de ${name}` : 'Turno extra do oponente';
  return mine ? 'Seu turno' : state.players.length > 2 ? `Turno de ${name ?? 'outro jogador'}` : 'Turno do oponente';
}

/** Turnos extras que vêm depois deste, para a dica e os leitores de tela. */
export function upcomingTurnsText(state: HudState) {
  const queue = state.extraTurns ?? [];
  if (!queue.length) return '';
  const who = (id: number) => id === state.you ? 'seu' : state.players.length > 2 ? `de ${state.players.find(p => p.id === id)?.name ?? 'outro jogador'}` : 'do oponente';
  const first = who(queue[0]);
  return queue.length === 1 ? `Depois: turno extra ${first}` : queue.every(id => id === queue[0]) ? `Depois: ${queue.length} turnos extras ${first}` : `Depois: ${queue.length} turnos extras, o próximo ${first}`;
}

/** Nome do combate atual e quantos ainda vêm neste turno. */
function combatText(state: HudState) {
  const n = state.combatNumber ?? 0, more = state.extraCombats ?? 0;
  const now = n > 1 ? `Combate extra${n > 2 ? ` (${n}º combate)` : ''}` : '';
  const next = more ? `${more === 1 ? 'mais um combate' : `mais ${more} combates`} neste turno` : '';
  return [now, next].filter(Boolean).join(' · ');
}

/** Só endereços de imagem simples entram no estilo inline; qualquer outra coisa cai na inicial do nome. */
const SAFE_PORTRAIT = /^(?:https?:\/\/|\/|data:image\/)[^"'()\\\s<>]*$/;

/**
 * No Commander com vários jogadores, o retrato de quem joga o turno fica junto da trilha, com a cor do dono
 * (dourado se for você, vermelho se for outro) e o nome na dica. No 1x1 a cor da trilha já basta.
 */
function activePlayerPortrait(state: HudState, portrait?: string): string {
  if (state.players.length <= 2 || state.gameOver) return '';
  const player = state.players.find(p => p.id === state.activePlayer);
  if (!player) return '';
  const mine = state.activePlayer === state.you;
  const art = portrait && SAFE_PORTRAIT.test(portrait) ? portrait : '';
  const initial = art ? '' : esc(Array.from(player.name.trim())[0]?.toUpperCase() ?? '?');
  return `<span class="phase-active-portrait ${mine ? 'mine' : 'theirs'}" aria-hidden="true" data-tip="${esc(mine ? 'Seu turno' : `Turno de ${player.name}`)}"${art ? ` style="background-image:url('${art}')"` : ''}>${initial}</span>`;
}

/**
 * Trilha compacta de fases, só informativa (nunca avança o motor). Ícones à vista; os nomes aparecem ao passar o
 * mouse e o resumo completo vai para leitores de tela. A cor diz de quem é o turno. `activePortrait` é a arte do
 * retrato de quem joga o turno, mostrada só com mais de dois jogadores.
 */
/** Tempo do turno no relógio da trilha: "0:07", "12:30" e, passando de uma hora, "1:02:05". */
export function turnTimeText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function phaseHudHTML(state: HudState, activePortrait?: string): string {
  const step = STEPS[state.phase ?? ''];
  const activeIndex = PHASES.findIndex(([key]) => key === step?.group);
  const mine = state.activePlayer === state.you;
  const combat = state.gameOver ? '' : combatText(state);
  const baseDetail = state.gameOver ? 'Jogo concluído' : step?.detail ?? 'Aguardando o início do turno';
  const detail = step?.group === 'combat' && (state.combatNumber ?? 0) > 1 ? `${baseDetail} · Combate extra` : baseDetail;
  const upcoming = state.gameOver ? '' : upcomingTurnsText(state);
  const summary = [`Turno ${state.turn}`, owner(state), detail, step?.group === 'combat' ? '' : combat, upcoming].filter(Boolean).join(' · ');
  return `<span class="sr-only">${esc(summary)}</span>${activePlayerPortrait(state, activePortrait)}
    <span class="phase-turn-badge ${mine ? 'mine' : 'theirs'}${state.extraTurn && !state.gameOver ? ' extra' : ''}" aria-hidden="true" data-tip="${esc([`Turno ${state.turn} · ${owner(state)}`, upcoming].filter(Boolean).join(' · '))}">${state.turn}</span>${state.gameOver ? '' : `
    <span class="phase-timer" data-turn-timer aria-hidden="true" data-tip="Tempo deste turno">0:00</span>`}
    <ol class="phase-track ${state.gameOver ? '' : mine ? 'mine' : 'theirs'}" aria-hidden="true">${PHASES.map(([key, label, icon], index) => {
      const current = step?.group === key && !state.gameOver;
      const tip = [current ? `${label} · ${detail}` : label, key === 'combat' ? combat : ''].filter(Boolean).join(' · ');
      // Selo no combate: quantos combates o turno tem até agora (contando os que ainda vêm).
      const combats = key === 'combat' && !state.gameOver ? Math.max(state.combatNumber ?? 0, 1) + (state.extraCombats ?? 0) : 0;
      const badge = combats > 1 ? `<b class="phase-combat-count">×${combats}</b>` : '';
      return `<li class="phase-step${current ? ' current' : ''}${index < activeIndex ? ' passed' : ''}" data-phase="${key}" data-tip="${esc(tip)}"><svg viewBox="0 0 24 24">${icon}</svg>${badge}</li>`;
    }).join('')}</ol>`;
}

/**
 * Texto do botão de passar a prioridade: diz para onde o jogo vai, como no Arena. Só o rótulo muda; a ação
 * continua a mesma. Com algo na pilha, passar deixa o topo resolver.
 */
export function passLabel(state: Pick<FState, 'phase' | 'activePlayer' | 'you' | 'stack' | 'extraCombatAfter'>): string {
  if (state.stack.length) return 'Resolver';
  if (state.activePlayer !== state.you) return 'Passar';
  const group = STEPS[state.phase ?? '']?.group;
  const after = state.extraCombatAfter ?? [];
  // Um combate extra pode vir logo depois do combate (Combat Celebrant) ou depois de uma principal (Relentless Assault).
  if ((group === 'combat' && after.includes('COMBAT_END')) || (group === 'main1' && after.includes('MAIN1')) || (group === 'main2' && after.includes('MAIN2'))) return 'Para o combate extra';
  return group === 'start' ? 'Para a principal 1' : group === 'main1' ? 'Para o combate' : group === 'combat' ? 'Para a principal 2'
    : group === 'main2' ? 'Para o fim do turno' : 'Passar';
}
