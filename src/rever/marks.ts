// Marcas da repetição de uma partida (S21): o turno e o jogo de cada quadro, os rótulos e o tempo entre um lance e outro ao tocar.
import type { FState } from '../forge/client';

export interface ReplayMark { index: number; turn: number; game: number; active: number | null; mine: boolean }

/** Percorre os estados uma vez: um turno que volta a ser menor é o começo de outro jogo da melhor de três. */
export function replayMarks(states: Iterable<{ state: Pick<FState, 'turn' | 'activePlayer' | 'you'> }>): ReplayMark[] {
  const out: ReplayMark[] = [];
  let game = 1, last = 0, index = 0;
  for (const { state } of states) {
    const turn = state.turn ?? 0;
    if (turn < last) game++;
    last = turn;
    out.push({ index: index++, turn, game, active: state.activePlayer ?? null, mine: state.activePlayer === state.you });
  }
  return out;
}

/** "Turno 3 · seu", "Jogo 2 · Turno 1 · do oponente"; antes do primeiro turno, "Começo". */
export function turnLabel(m: Pick<ReplayMark, 'turn' | 'game' | 'mine' | 'active'>, manyGames: boolean) {
  const prefix = manyGames ? `Jogo ${m.game} · ` : '';
  if (!m.turn) return `${prefix}Começo`;
  return `${prefix}Turno ${m.turn}${m.active === null ? '' : m.mine ? ' · seu' : ' · do oponente'}`;
}

/** Espera até o próximo lance ao tocar: o tempo de verdade, sem pausas longas nem lances grudados, dividido pela velocidade. */
export function frameDelay(at: number, nextAt: number | undefined, speed: number) {
  const real = nextAt === undefined ? 600 : nextAt - at;
  return Math.max(120, Math.min(2500, real)) / Math.max(1, speed);
}
