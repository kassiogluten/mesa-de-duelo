// O que o fim do jogo conta além de quem venceu: a virada (quem venceu esteve com 5 de vida ou menos e voltou a 15 ou mais), a vitória por um fio (com 1 de vida) e o destaque do jogo (a jogada mais marcante, para ver de novo).
import type { FCard, FState } from '../forge/client';
import { historyTurns, type HistoryNames } from './historyLog';
import { replayable, type PresentationEvent } from './presentationTimeline';

/** A virada: chegar a esta vida (ou menos)… */
export const COMEBACK_LOW = 5;
/** …e depois voltar a esta (ou mais), e vencer. */
export const COMEBACK_HIGH = 15;

export interface EndingTitle { kind: 'comeback' | 'thread'; title: string; detail: string }

type EndState = Pick<FState, 'winner' | 'players' | 'lifeHistory' | 'you' | 'watching' | 'match'>;

/** Os títulos do jogo que acabou: a virada e a vitória por um fio, de quem venceu (para todos verem). */
export function endingTitles(s: EndState): EndingTitle[] {
  if (s.match?.abandoned || !s.winner) return [];
  const winner = s.players.find(p => p.name === s.winner);
  if (!winner) return [];
  const who = winner.id === s.you && !s.watching ? 'Você' : winner.name;
  const life = [...(s.lifeHistory ?? []).map(p => p.life[String(winner.id)]), winner.life].filter((n): n is number => Number.isFinite(n));
  const titles: EndingTitle[] = [];
  const low = life.findIndex(n => n <= COMEBACK_LOW);
  if (low >= 0 && life.slice(low + 1).some(n => n >= COMEBACK_HIGH)) {
    const lowest = Math.min(...life.slice(0, life.findIndex((n, i) => i > low && n >= COMEBACK_HIGH)));
    titles.push({ kind: 'comeback', title: 'Virada!', detail: `${who} chegou a ${lowest} de vida e virou o jogo.` });
  }
  if (winner.life === 1) titles.push({ kind: 'thread', title: 'Por um fio', detail: `${who} venceu com 1 de vida.` });
  return titles;
}

export interface GameHighlight { kind: string; text: string; card?: FCard; events: PresentationEvent[] }

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
/** Saídas do campo que tiram a permanente do jogo de alguém (morrer, ser exilada, voltar para a mão ou o grimório). */
const removal = (e: PresentationEvent) => e.type === 'left' && e.reason !== 'warped' && e.reason !== 'ninjutsu' && e.reason !== 'sneak' && e.to !== 'Battlefield';

/**
 * O destaque do jogo que acabou: entre as jogadas do Histórico (deste jogo, na melhor de três), a de mais dano em
 * jogadores, a de mais vida ganha ou a que mais tirou permanentes do campo, pesadas para caberem na mesma régua (uma
 * remoção vale 3 de dano; 4 de vida ganha, 3). Nenhuma passa do mínimo: sem destaque.
 */
export function gameHighlight(history: readonly PresentationEvent[], names: HistoryNames): GameHighlight | null {
  let start = history.length - 1;
  while (start >= 0 && !(history[start]!.type === 'turn' && history[start]!.turn === 1)) start--;
  const game = start < 0 ? history : history.slice(start);
  let best: (GameHighlight & { score: number }) | null = null;
  for (const line of historyTurns(game, names).flatMap(turn => turn.lines)) {
    if (!replayable(line.events)) continue;
    const damage = sum(line.events.filter(e => e.type === 'damage' && !e.prevented && e.targets?.players?.length).map(e => Math.abs(e.delta ?? 0)));
    const healed = sum(line.events.filter(e => e.type === 'life-changed' && (e.delta ?? 0) > 0).map(e => e.delta!));
    const removed = line.events.filter(removal).length;
    const options = [
      { kind: 'Maior golpe', score: damage, ok: damage >= 3 },
      { kind: 'Maior ganho de vida', score: healed * .75, ok: healed >= 4 },
      { kind: 'Maior limpeza', score: removed * 3, ok: removed >= 2 },
    ].filter(o => o.ok).sort((a, b) => b.score - a.score);
    const top = options[0];
    if (top && (!best || top.score >= best.score)) best = { kind: top.kind, score: top.score, text: line.text, card: line.card, events: line.events };
  }
  if (!best) return null;
  const { score: _, ...highlight } = best;
  return highlight;
}
