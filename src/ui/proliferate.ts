import type { FState, ProliferateCandidate, ProliferateEffect } from '../forge/client';
import { esc } from './cardtext';
import { playerCounterName } from './playerCounters';

/*
 * Proliferar: cada permanente ou jogador com marcadores pode ganhar mais um de cada tipo. A ponte diz, para
 * quem prolifera, se cada marcador ajuda ou prejudica (um -1/-1 na criatura do oponente ajuda você). A lista
 * agrupa por isso, com seta e cor, e mostra o número antes → depois, para ninguém marcar o próprio veneno sem ver.
 */

const CARD_COUNTERS: Record<string, string> = {
  P1P1: '+1/+1', M1M1: '−1/−1', LOYALTY: 'Lealdade', DEFENSE: 'Defesa', SHIELD: 'Escudo', STUN: 'Atordoamento',
  TIME: 'Tempo', CHARGE: 'Carga', LORE: 'Saga', OIL: 'Óleo', AGE: 'Idade', FADE: 'Desvanecer', FLOOD: 'Inundação',
  DIVINITY: 'Divindade', QUEST: 'Missão', LEVEL: 'Nível', FINALITY: 'Finalidade', BOUNTY: 'Recompensa',
};
export const counterName = (type: string) => CARD_COUNTERS[type] ?? playerCounterName(type);

const GROUPS: { effect: ProliferateEffect; title: string; mark: string }[] = [
  { effect: 'good', title: 'Te ajuda', mark: '▲' },
  { effect: 'bad', title: 'Te prejudica', mark: '▼' },
  { effect: 'mixed', title: 'Ajuda e prejudica', mark: '±' },
  { effect: 'neutral', title: 'Sem efeito claro', mark: '•' },
];

export function isProliferating(s: FState) {
  return !!s.input.proliferate && !s.gameOver && !s.question && !s.input.priority;
}

export function proliferateSelected(s: FState, candidate: Pick<ProliferateCandidate, 'kind' | 'id'>) {
  const sel = s.input.selection;
  return candidate.kind === 'player' ? !!sel?.players?.includes(candidate.id) : !!sel?.cards.includes(candidate.id);
}

export function proliferateCandidate(s: FState, kind: 'card' | 'player', id: number) {
  return s.input.proliferate?.candidates.find(c => c.kind === kind && c.id === id);
}

function selectSet(s: FState, chosen: ProliferateCandidate[]) {
  return {
    type: 'select-set' as const, gen: s.input.gen,
    cards: chosen.filter(c => c.kind === 'card').map(c => c.id),
    players: chosen.filter(c => c.kind === 'player').map(c => c.id),
  };
}

/** Marca ou desmarca um só, mantendo o resto da escolha. */
export function proliferateToggle(s: FState, kind: 'card' | 'player', id: number) {
  const list = s.input.proliferate?.candidates ?? [];
  if (!proliferateCandidate(s, kind, id)) return null;
  return selectSet(s, list.filter(c => (c.kind === kind && c.id === id) !== proliferateSelected(s, c)));
}

export const proliferateSuggestion = (s: FState) => selectSet(s, (s.input.proliferate?.candidates ?? []).filter(c => c.suggested));
export const proliferateClear = (s: FState) => selectSet(s, []);

export function proliferateSummary(s: FState) {
  const chosen = (s.input.proliferate?.candidates ?? []).filter(c => proliferateSelected(s, c));
  const harmful = chosen.filter(c => c.effect === 'bad' || c.effect === 'mixed').length;
  const progress = chosen.length === 0 ? 'Nada marcado' : `${chosen.length} ${chosen.length === 1 ? 'marcado' : 'marcados'}`;
  const instruction = harmful
    ? `Atenção: ${harmful === 1 ? 'um marcado também te prejudica' : `${harmful} marcados também te prejudicam`}.`
    : chosen.length ? 'Confirme para dar mais um marcador de cada tipo.' : 'Toque no que deve ganhar marcadores, ou confirme sem proliferar.';
  return { count: chosen.length, harmful, progress, instruction };
}

export function proliferateOkLabel(s: FState) {
  const { count } = proliferateSummary(s);
  return count ? `Proliferar (${count})` : 'Não proliferar';
}

/** Selo do efeito no campo, para ler o tabuleiro sem abrir a lista. */
export function proliferateBoardClass(s: FState, kind: 'card' | 'player', id: number) {
  const c = isProliferating(s) ? proliferateCandidate(s, kind, id) : undefined;
  return c ? `prolif-${c.effect}` : '';
}

export interface ProliferateNames { name: (c: ProliferateCandidate) => string; whose: (c: ProliferateCandidate) => string }

function counterChip(c: ProliferateCandidate, counter: ProliferateCandidate['counters'][number]) {
  const next = counter.count + 1;
  const lethal = counter.type === 'POISON' && next >= 10 && c.kind === 'player';
  const arrow = counter.effect === 'good' ? '▲' : counter.effect === 'bad' ? '▼' : '';
  const extra = lethal ? ' · perde a partida' : '';
  return `<span class="prolif-ctr ${counter.effect}${lethal ? ' lethal' : ''}">${arrow ? `<i aria-hidden="true">${arrow}</i>` : ''}${esc(counterName(counter.type))} ${counter.count}→${next}${extra}</span>`;
}

export function proliferatePanelHTML(s: FState, names: ProliferateNames) {
  if (!isProliferating(s)) return '';
  const candidates = s.input.proliferate!.candidates;
  const row = (c: ProliferateCandidate) => {
    const on = proliferateSelected(s, c);
    const counters = c.counters.map(counter => counterChip(c, counter)).join('');
    const effects = c.counters.map(counter => `${counterName(counter.type)} ${counter.count} para ${counter.count + 1}, ${counter.effect === 'good' ? 'te ajuda' : counter.effect === 'bad' ? 'te prejudica' : 'sem efeito claro'}`).join('; ');
    return `<button class="prolif-row ${c.effect}${on ? ' on' : ''}" data-prolif-kind="${c.kind}" data-prolif-id="${c.id}" data-gen="${s.input.gen}" aria-pressed="${on}" aria-label="${esc(`${names.name(c)}, ${names.whose(c)}: ${effects}`)}">
      <span class="prolif-check" aria-hidden="true"></span>
      <span class="prolif-who"><b>${esc(names.name(c))}</b><small>${esc(names.whose(c))}</small></span>
      <span class="prolif-ctrs">${counters}</span>
    </button>`;
  };
  const groups = GROUPS.map(g => {
    const list = candidates.filter(c => c.effect === g.effect);
    return list.length ? `<div class="prolif-group ${g.effect}" role="group" aria-label="${g.title}"><h4><i aria-hidden="true">${g.mark}</i>${g.title}</h4>${list.map(row).join('')}</div>` : '';
  }).join('');
  const suggestion = proliferateSuggestion(s);
  const hasSuggestion = suggestion.cards.length + suggestion.players.length > 0;
  const summary = proliferateSummary(s);
  return `<section class="prolif" aria-labelledby="fProlifTitle">
    <h3 id="fProlifTitle">Proliferar</h3>
    <p class="prolif-help">Cada marcado ganha mais um marcador de cada tipo que já tem. Verde ▲ é bom para você; vermelho ▼ é ruim para você, mesmo nas cartas dos oponentes.</p>
    <div class="prolif-list">${groups}</div>
    <div class="prolif-tools">
      ${hasSuggestion ? `<button class="arena-btn secondary" data-prolif="suggested" data-gen="${s.input.gen}">Só o que me ajuda</button>` : ''}
      <button class="arena-btn secondary" data-prolif="clear" data-gen="${s.input.gen}" ${summary.count ? '' : 'disabled'}>Limpar</button>
    </div>
    <div class="decision-progress${summary.harmful ? ' warn' : ''}" role="status"><strong>${esc(summary.progress)}</strong><span>${esc(summary.instruction)}</span></div>
  </section>`;
}
