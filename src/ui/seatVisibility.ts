import type { FPlayer, FState } from '../forge/client';

/**
 * Quais oponentes aparecem com o campo inteiro numa partida de três ou mais jogadores. O jogador esconde ou
 * isola ("só este") oponentes; quem exige a atenção dele volta à vista sozinho enquanto durar a situação.
 */
export interface SeatChoice { hidden: ReadonlySet<number>; solo: number | null }

/** Foco automático no oponente que ataca você: a escolha de antes (null se o jogador mexeu na mesa durante o turno). */
export interface SeatFocus { attacker: number; turn: number; saved: SeatChoice | null }

/** O que a mesa lembra dos assentos: a escolha atual, quem já foi ocultado por ter saído e o foco do ataque. */
export interface SeatMemory extends SeatChoice { retired: ReadonlySet<number>; focus: SeatFocus | null }

export const emptySeatMemory = (): SeatMemory => ({ hidden: new Set(), solo: null, retired: new Set(), focus: null });

/** Se o oponente tem criaturas atacando você, um planeswalker seu ou uma batalha que você protege. */
export function attackingYou(state: FState, player: FPlayer) {
  const owns = (id: number) => player.battlefield.some(card => card.id === id);
  const you = state.you;
  const yours = (id: number) => state.players.some(p => p.battlefield.some(card => card.id === id && (p.id === you || card.protector === you)));
  return state.combat.some(entry => owns(entry.attacker) && entry.defender !== undefined && (entry.defender === you || yours(entry.defender)));
}

/** Por que um oponente oculto voltou à vista agora, ou null se nada pede o campo dele. */
export function forcedSeatReason(state: FState, player: FPlayer): string | null {
  if (player.eliminated) return null;
  const owns = (id: number) => player.battlefield.some(card => card.id === id);
  // Atacando você (ou um planeswalker seu): os atacantes estão no campo dele.
  if (attackingYou(state, player)) return 'atacando você';
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

/** Oculta quem saiu da partida numa escolha: sai do "só este" e entra entre os ocultos. */
function withoutSeat(choice: SeatChoice, id: number): SeatChoice {
  return { hidden: new Set([...choice.hidden, id]), solo: choice.solo === id ? null : choice.solo };
}

/**
 * A mesa acompanha os oponentes sozinha (partidas com dois ou mais oponentes):
 * - quem é eliminado, com outro oponente ainda na partida, fica oculto uma vez só ("Mostrar campo" traz de volta);
 * - o oponente da vez que declara ataque contra você fica em "só este" até o fim do turno dele, e então a escolha de
 *   antes volta, a menos que o jogador tenha mexido na mesa nesse meio-tempo (ver `manualSeatChoice`).
 * Devolve a nova memória e os avisos para leitores de tela do que mudou.
 */
export function followSeats(state: FState, opponents: FPlayer[], memory: SeatMemory): { memory: SeatMemory; notices: string[] } {
  const notices: string[] = [];
  const seated = new Set(opponents.map(p => p.id));
  const valid = (c: SeatChoice): SeatChoice => ({ hidden: c.hidden, solo: c.solo !== null && seated.has(c.solo) ? c.solo : null });
  let choice = valid(memory);
  let { retired, focus } = memory;
  if (opponents.length < 2) return { memory: { ...choice, retired, focus: null }, notices };

  // Fim do turno do atacante (ou ele saiu da partida): volta a escolha de antes, se o jogador não mexeu na mesa.
  const attacker = focus && opponents.find(p => p.id === focus!.attacker);
  if (focus && (state.turn !== focus.turn || state.activePlayer !== focus.attacker || !attacker || attacker.eliminated)) {
    if (focus.saved) {
      choice = valid(focus.saved);
      if (choice.solo !== focus.attacker) notices.push('Fim do turno do atacante: a mesa voltou a mostrar os oponentes como antes.');
    }
    focus = null;
  }

  // Eliminados com outro oponente ainda na partida: ocultos uma vez (também na escolha guardada pelo foco).
  const alive = opponents.filter(p => !p.eliminated);
  for (const p of opponents) {
    if (!p.eliminated || retired.has(p.id) || !alive.length) continue;
    retired = new Set([...retired, p.id]);
    choice = withoutSeat(choice, p.id);
    if (focus?.saved) focus = { ...focus, saved: withoutSeat(focus.saved, p.id) };
    notices.push(`${p.name} saiu da partida: campo oculto.`);
  }

  // O oponente da vez declarou ataque contra você: foco nele, uma vez por turno.
  const active = alive.find(p => p.id === state.activePlayer);
  if (active && !(focus && focus.attacker === active.id && focus.turn === state.turn) && attackingYou(state, active)) {
    focus = { attacker: active.id, turn: state.turn, saved: choice };
    if (choice.solo !== active.id) notices.push(`${active.name} está atacando você: mostrando só o campo dele.`);
    choice = { hidden: choice.hidden, solo: active.id };
  }
  return { memory: { ...choice, retired, focus }, notices };
}

/** O jogador mexeu em Ocultar, Só este ou Mostrar campo: a escolha dele fica, e o fim do turno não desfaz nada. */
export function manualSeatChoice(memory: SeatMemory): SeatMemory {
  return memory.focus ? { ...memory, focus: { ...memory.focus, saved: null } } : memory;
}

/** Se o campo está em "só este" porque o oponente ataca você (e o jogador ainda não mexeu na mesa). */
export const focusedByAttack = (memory: SeatMemory, id: number) => !!memory.focus?.saved && memory.focus.attacker === id && memory.solo === id;
