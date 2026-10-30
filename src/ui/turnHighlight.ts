import type { FState } from '../forge/client';

type TurnState = Pick<FState, 'activePlayer' | 'you' | 'gameOver'>;
export type TurnSide = 'mine' | 'theirs';

/**
 * Destaque do campo de um jogador: dourado ('mine') no seu turno, vermelho ('theirs') no turno de um oponente,
 * nenhum fora do turno dele ou com o jogo encerrado. As mesmas cores do retrato de quem joga.
 */
export function turnHighlight(state: TurnState, playerId: number): TurnSide | null {
  if (state.gameOver || state.activePlayer === null || state.activePlayer !== playerId) return null;
  return playerId === state.you ? 'mine' : 'theirs';
}

/**
 * Troca do destaque entre os assentos dos oponentes, que são redesenhados a cada mudança: só no desenho em que
 * o turno passou, o assento que perdeu o destaque e o que ganhou recebem a classe da transição.
 */
export function seatTurnChange(previous: number | null | undefined, state: TurnState): { from: number | null; to: number | null } | null {
  const now = state.gameOver ? null : state.activePlayer;
  if (previous === undefined || previous === now) return null;
  return { from: previous, to: now };
}

