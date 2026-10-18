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
type HudState = Pick<FState, 'turn' | 'phase' | 'activePlayer' | 'you' | 'players' | 'gameOver'>;

function owner(state: HudState) {
  const mine = state.activePlayer === state.you;
  const activeName = state.players.find(player => player.id === state.activePlayer)?.name;
  return state.gameOver ? 'Jogo encerrado' : mine ? 'Seu turno' : activeName === 'Oponente' ? 'Turno do oponente' : activeName ? `Turno de ${activeName}` : 'Preparando o jogo';
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
export function phaseHudHTML(state: HudState, activePortrait?: string): string {
  const step = STEPS[state.phase ?? ''];
  const activeIndex = PHASES.findIndex(([key]) => key === step?.group);
  const mine = state.activePlayer === state.you;
  const detail = state.gameOver ? 'Jogo concluído' : step?.detail ?? 'Aguardando o início do turno';
  const summary = `Turno ${state.turn} · ${owner(state)} · ${detail}`;
  return `<span class="sr-only">${esc(summary)}</span>${activePlayerPortrait(state, activePortrait)}
    <span class="phase-turn-badge ${mine ? 'mine' : 'theirs'}" aria-hidden="true" data-tip="${esc(`Turno ${state.turn} · ${owner(state)}`)}">${state.turn}</span>
    <ol class="phase-track ${state.gameOver ? '' : mine ? 'mine' : 'theirs'}" aria-hidden="true">${PHASES.map(([key, label, icon], index) => {
      const current = step?.group === key && !state.gameOver;
      const tip = current ? `${label} · ${detail}` : label;
      return `<li class="phase-step${current ? ' current' : ''}${index < activeIndex ? ' passed' : ''}" data-phase="${key}" data-tip="${esc(tip)}"><svg viewBox="0 0 24 24">${icon}</svg></li>`;
    }).join('')}</ol>`;
}

/**
 * Texto do botão de passar a prioridade: diz para onde o jogo vai, como no Arena. Só o rótulo muda; a ação
 * continua a mesma. Com algo na pilha, passar deixa o topo resolver.
 */
export function passLabel(state: Pick<FState, 'phase' | 'activePlayer' | 'you' | 'stack'>): string {
  if (state.stack.length) return 'Resolver';
  if (state.activePlayer !== state.you) return 'Passar';
  const group = STEPS[state.phase ?? '']?.group;
  return group === 'start' ? 'Para a principal 1' : group === 'main1' ? 'Para o combate' : group === 'combat' ? 'Para a principal 2'
    : group === 'main2' ? 'Para o fim do turno' : 'Passar';
}
