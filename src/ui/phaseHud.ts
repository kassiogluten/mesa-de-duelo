import type { FState } from '../forge/client';
import { esc } from './cardtext';
import { turnTimeText } from './clock';
import { holdingStop, stopsByGroup } from './opponentStops';

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
type HudState = Pick<FState, 'turn' | 'phase' | 'activePlayer' | 'you' | 'players' | 'gameOver' | 'extraTurn' | 'extraTurns' | 'combatNumber' | 'extraCombats' | 'dayTime' | 'activeSpells'> & { stack?: FState['stack']; match?: FState['match']; watching?: boolean };

/** O turno é de quem vê a mesa. Quem só assiste não tem turno: os textos usam o nome de quem joga, mesmo no 1x1. */
const yours = (state: HudState, id: number | null | undefined) => id === state.you && !state.watching;
const byName = (state: HudState) => state.players.length > 2 || !!state.watching;

function owner(state: HudState) {
  const mine = yours(state, state.activePlayer);
  const activeName = state.players.find(player => player.id === state.activePlayer)?.name;
  const extra = state.extraTurn ? ' extra' : '';
  return state.gameOver ? 'Jogo encerrado' : mine ? `Seu turno${extra}` : activeName === 'Oponente' ? `Turno${extra} do oponente` : activeName ? `Turno${extra} de ${activeName}` : 'Preparando o jogo';
}

/** "Turno extra" no começo de um turno extra, como a faixa de troca de turno mostra. */
export function turnBannerText(state: HudState) {
  const mine = yours(state, state.activePlayer);
  const name = state.players.find(player => player.id === state.activePlayer)?.name;
  if (state.extraTurn) return mine ? 'Turno extra' : byName(state) && name ? `Turno extra de ${name}` : 'Turno extra do oponente';
  return mine ? 'Seu turno' : byName(state) ? `Turno de ${name ?? 'outro jogador'}` : 'Turno do oponente';
}

/** Turnos extras que vêm depois deste, para a dica e os leitores de tela. */
export function upcomingTurnsText(state: HudState) {
  const queue = state.extraTurns ?? [];
  if (!queue.length) return '';
  const who = (id: number) => yours(state, id) ? 'seu' : byName(state) ? `de ${state.players.find(p => p.id === id)?.name ?? 'outro jogador'}` : 'do oponente';
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

const SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
// A lua da noite leva estrelas para não se confundir com o ícone da fase final.
const MOON = '<path d="M17 15.5A7 7 0 0 1 8.5 7a7 7 0 1 0 8.5 8.5z"/><path class="star" d="M17.5 3.5v3M16 5h3M21 9v2M20 10h2"/>';

/**
 * Regra de troca do dia e da noite para quem joga o turno: de dia, vira noite se ele não conjurar mágicas; de noite,
 * vira dia se ele conjurar duas ou mais. Diz também se, pelas mágicas do turno até agora, já está decidido.
 */
export function dayNightText(state: HudState): string {
  if (!state.dayTime) return '';
  const mine = yours(state, state.activePlayer);
  const name = state.players.find(p => p.id === state.activePlayer)?.name;
  const who = mine ? 'você' : byName(state) && name ? name : 'o oponente';
  const known = state.activeSpells != null, spells = state.activeSpells ?? 0;
  if (state.dayTime === 'day') {
    const rule = `Dia. Se ${who} não conjurar mágicas neste turno, vira noite no próximo turno.`;
    return !known ? rule : spells ? `${rule} Já ${spells === 1 ? 'foi conjurada 1 mágica' : `foram conjuradas ${spells} mágicas`}: continua dia.` : `${rule} Nenhuma mágica até agora.`;
  }
  const rule = `Noite. Se ${who} conjurar 2 mágicas ou mais neste turno, vira dia no próximo turno.`;
  return !known ? rule : spells >= 2 ? `${rule} Já foram conjuradas ${spells}: vira dia.` : `${rule} ${spells ? '1 mágica' : 'Nenhuma mágica'} até agora.`;
}

/** Sol ou lua ao lado do número do turno; some enquanto a partida não é nem dia nem noite. */
function dayNightHTML(state: HudState): string {
  if (!state.dayTime || state.gameOver) return '';
  const day = state.dayTime === 'day';
  return `<span class="phase-daynight ${day ? 'day' : 'night'}" aria-hidden="true" data-tip="${esc(dayNightText(state))}"><svg viewBox="0 0 24 24" aria-hidden="true">${day ? SUN : MOON}</svg></span>`;
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
  return `<span class="phase-active-portrait ${mine ? 'mine' : 'theirs'}" aria-hidden="true" data-tip="${esc(yours(state, player.id) ? 'Seu turno' : `Turno de ${player.name}`)}"${art ? ` style="background-image:url('${art}')"` : ''}>${initial}</span>`;
}

export { turnTimeText };

/**
 * Relógio da partida, no começo da trilha: quanto o jogo em andamento já dura, contado pelo servidor. Some no fim do
 * jogo (o resultado mostra a duração) e com um servidor que não manda o tempo. Numa série, conta só o jogo atual.
 */
function matchClockHTML(state: HudState): string {
  const elapsed = state.match?.elapsedMs;
  if (elapsed == null || state.gameOver) return '';
  const tip = (state.match?.gameNumber ?? 1) > 1 ? `Duração do jogo ${state.match!.gameNumber}` : 'Duração da partida';
  return `<span class="phase-match-clock" data-tip="${tip}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="7"/><path d="M12 9.5V13l2.5 1.5M10 3h4"/></svg><span data-match-timer aria-hidden="true">${turnTimeText(elapsed)}</span></span>`;
}

/** Paradas no turno dos oponentes na trilha: as etapas marcadas, se dá para mudá-las agora e o grupo com o menu aberto. */
export interface HudStops { value: readonly string[]; editable?: boolean; open?: string | null }

/** Nome do grupo da trilha, para o título do menu de paradas. */
export function phaseGroupLabel(group: string): string {
  return PHASES.find(([key]) => key === group)?.[1] ?? '';
}

/**
 * Trilha compacta de fases. Ela nunca avança o motor: os nomes aparecem ao passar o mouse e o resumo completo vai
 * para leitores de tela. A cor diz de quem é o turno. `activePortrait` é a arte do retrato de quem joga o turno,
 * mostrada só com mais de dois jogadores. Com `stops.editable`, cada ícone abre o menu das etapas daquele grupo
 * em que o jogo para no turno dos oponentes; os grupos com etapa marcada ganham um ponto.
 */
export function phaseHudHTML(state: HudState, activePortrait?: string, hudStops: HudStops | readonly string[] = []): string {
  const { value: stops, editable = false, open = null }: HudStops = Array.isArray(hudStops) ? { value: hudStops as readonly string[] } : hudStops as HudStops;
  const edit = editable && !state.gameOver;
  const step = STEPS[state.phase ?? ''];
  const activeIndex = PHASES.findIndex(([key]) => key === step?.group);
  const mine = state.activePlayer === state.you;
  const combat = state.gameOver ? '' : combatText(state);
  const baseDetail = state.gameOver ? 'Jogo concluído' : step?.detail ?? 'Aguardando o início do turno';
  const detail = step?.group === 'combat' && (state.combatNumber ?? 0) > 1 ? `${baseDetail} · Combate extra` : baseDetail;
  const upcoming = state.gameOver ? '' : upcomingTurnsText(state);
  const marked = state.gameOver ? new Map<string, string[]>() : stopsByGroup(stops);
  const holding = !state.gameOver && holdingStop({ ...state, stack: state.stack ?? [] }, stops);
  const summary = [`Turno ${state.turn}`, owner(state), state.gameOver ? '' : dayNightText(state), detail, holding ? 'Parada sua' : '', step?.group === 'combat' ? '' : combat, upcoming].filter(Boolean).join(' · ');
  return `<span class="sr-only">${esc(summary)}</span>${matchClockHTML(state)}${activePlayerPortrait(state, activePortrait)}
    <span class="phase-turn-badge ${mine ? 'mine' : 'theirs'}${state.extraTurn && !state.gameOver ? ' extra' : ''}" aria-hidden="true" data-tip="${esc([`Turno ${state.turn} · ${owner(state)}`, upcoming].filter(Boolean).join(' · '))}">${state.turn}</span>${state.gameOver ? '' : `
    <span class="phase-timer" data-turn-timer aria-hidden="true" data-tip="Tempo deste turno">0:00</span>`}${dayNightHTML(state)}
    <ol class="phase-track ${state.gameOver ? '' : mine ? 'mine' : 'theirs'}${edit ? ' editable' : ''}"${edit ? '' : ' aria-hidden="true"'}>${PHASES.map(([key, label, icon], index) => {
      const current = step?.group === key && !state.gameOver;
      const held = marked.get(key);
      const tip = open === key ? '' : [current ? `${label} · ${detail}` : label, key === 'combat' ? combat : '', held ? `Parada no turno do oponente: ${held.join(', ')}` : ''].filter(Boolean).join(' · ');
      // Selo no combate: quantos combates o turno tem até agora (contando os que ainda vêm).
      const combats = key === 'combat' && !state.gameOver ? Math.max(state.combatNumber ?? 0, 1) + (state.extraCombats ?? 0) : 0;
      const badge = combats > 1 ? `<b class="phase-combat-count">×${combats}</b>` : '';
      const stop = held ? '<i class="phase-stop-dot"></i>' : '';
      const svg = `<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`;
      const name = `${label}: paradas no turno do oponente${held ? ` (${held.join(', ')})` : ''}`;
      const body = edit ? `<button type="button" class="phase-step-btn" data-stop-group="${key}" aria-label="${esc(name)}" aria-haspopup="true" aria-expanded="${open === key}" aria-controls="fStopMenu">${svg}</button>` : svg;
      return `<li class="phase-step${current ? ' current' : ''}${current && holding ? ' held' : ''}${index < activeIndex ? ' passed' : ''}${open === key ? ' open' : ''}" data-phase="${key}"${tip ? ` data-tip="${esc(tip)}"` : ''}>${body}${badge}${stop}</li>`;
    }).join('')}</ol>`;
}

/** Para onde vai o botão de passar quando uma etapa extra muda a fase seguinte. */
const NEXT_LABEL: Record<string, string> = {
  UNTAP: 'Para o início extra', UPKEEP: 'Para a manutenção extra', DRAW: 'Comprar', MAIN1: 'Para a principal 1',
  COMBAT_BEGIN: 'Para o combate extra', MAIN2: 'Para a principal 2', END_OF_TURN: 'Para o fim do turno', CLEANUP: 'Para o fim do turno',
};

/**
 * Texto do botão de passar a prioridade: diz para onde o jogo vai, como no Arena. Só o rótulo muda; a ação
 * continua a mesma. Com algo na pilha, passar deixa o topo resolver.
 */
export function passLabel(state: Pick<FState, 'phase' | 'activePlayer' | 'you' | 'stack' | 'extraCombatAfter' | 'extraPhaseAfter'>): string {
  if (state.stack.length) return 'Resolver';
  if (state.activePlayer !== state.you) return 'Passar';
  const group = STEPS[state.phase ?? '']?.group;
  // Uma etapa extra muda o que vem depois: a manutenção extra depois do combate volta para a principal 2, não para a compra.
  const next = state.extraPhaseAfter?.[group === 'combat' ? 'COMBAT_END' : state.phase ?? ''];
  if (next && NEXT_LABEL[next]) return NEXT_LABEL[next];
  // Na sua manutenção, passar leva à compra.
  if (state.phase === 'UPKEEP') return 'Comprar';
  const after = state.extraCombatAfter ?? [];
  // Um combate extra pode vir logo depois do combate (Combat Celebrant) ou depois de uma principal (Relentless Assault).
  if ((group === 'combat' && after.includes('COMBAT_END')) || (group === 'main1' && after.includes('MAIN1')) || (group === 'main2' && after.includes('MAIN2'))) return 'Para o combate extra';
  return group === 'start' ? 'Para a principal 1' : group === 'main1' ? 'Para o combate' : group === 'combat' ? 'Para a principal 2'
    : group === 'main2' ? 'Para o fim do turno' : 'Passar';
}

/**
 * No seu turno, com a pilha vazia, qual botão fica em destaque: passar a etapa ou "Fim de turno". Até a principal 1
 * o comum é seguir (comprar, ir para o combate); do combate em diante, encerrar o turno.
 */
export function passIsPrimary(state: Pick<FState, 'phase'>): boolean {
  const group = STEPS[state.phase ?? '']?.group;
  return group === 'start' || group === 'main1';
}
