import type { FPlayer, FState } from '../forge/client';

/**
 * Quais oponentes aparecem com o campo inteiro numa partida de três ou mais jogadores. O jogador esconde ou
 * isola ("só este") oponentes; quem exige a atenção dele volta à vista sozinho enquanto durar a situação.
 */
export interface SeatChoice { hidden: ReadonlySet<number>; solo: number | null }

/** Por que um oponente oculto voltou à vista agora, ou null se nada pede o campo dele. */
export function forcedSeatReason(state: FState, player: FPlayer): string | null {
  if (player.eliminated) return null;
  const owns = (id: number) => player.battlefield.some(card => card.id === id);
  const you = state.you;
  // Atacando você (ou um planeswalker seu): os atacantes estão no campo dele.
  if (state.combat.some(entry => owns(entry.attacker) && (entry.defender === you || state.players.some(p => p.id === you && p.battlefield.some(card => card.id === entry.defender)))))
    return 'atacando você';
  // Uma escolha sua envolve cartas do campo dele: alvo, seleção ou planeswalker que você pode atacar.
  const input = state.input;
  if ([...input.selectable, ...(input.targeting?.cards ?? [])].some(owns)) return 'escolha sua';
  if (input.attacking?.defenders.some(target => target.kind === 'card' && owns(target.id))) return 'você pode atacar';
  if (input.blocking?.attackers.some(owns)) return 'você pode bloquear';
  return null;
}

/** Oponentes com o campo inteiro à vista. Sem nenhum escolhido, todos voltam (a mesa nunca fica sem oponentes). */
export function visibleSeats(state: FState, opponents: FPlayer[], choice: SeatChoice) {
  const chosen = (p: FPlayer) => choice.solo !== null ? p.id === choice.solo : !choice.hidden.has(p.id);
  const shown = new Set(opponents.filter(p => chosen(p) || forcedSeatReason(state, p)).map(p => p.id));
  if (!shown.size) for (const p of opponents) shown.add(p.id);
  return shown;
}
