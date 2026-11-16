// Quais fichas ganham um objeto em 3D ao serem criadas (Tesouro, Pista, Comida e Sangue), pelo tipo da carta, e quantas no máximo por jogada.
import type { FCard } from '../forge/client';

export type Trinket = 'treasure' | 'clue' | 'food' | 'blood';
const BY_TYPE: Record<string, Trinket> = { Treasure: 'treasure', Clue: 'clue', Food: 'food', Blood: 'blood' };

/** Numa jogada que cria muitas fichas de uma vez, só as primeiras ganham o objeto: o resto chega como sempre. */
export const TRINKET_LIMIT = 3;

/** O objeto de uma ficha de artefato que acabou de entrar, pelo subtipo ("Token Artifact — Treasure") ou, sem ele, pelo nome. */
export function trinketOf(card: Pick<FCard, 'token' | 'typeLine' | 'name'> | undefined): Trinket | null {
  // Só as fichas de artefato (uma criatura Food Elemental não é uma Comida).
  if (!card?.token || (card.typeLine && !/Artifact/.test(card.typeLine))) return null;
  const subtypes = card.typeLine?.split(/[—–-]/)[1];
  for (const word of (subtypes ?? card.name ?? '').match(/[A-Za-z]+/g) ?? []) if (BY_TYPE[word]) return BY_TYPE[word]!;
  return null;
}
