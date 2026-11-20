// Companheiro do deck de Commander: a carta fora das 100, guardada no sideboard (onde o servidor a procura).
import type { DeckData, DeckEntry } from '../decks';
import { cacheGet } from '../scryfall';

/** Carta com a habilidade Companheiro; null quando o Scryfall ainda não respondeu. */
export function isCompanionCard(name: string): boolean | null {
  const card = cacheGet(name);
  return card ? /^Companion\s*[—–-]/m.test(card.oracle_text ?? '') : null;
}

/** O companheiro do deck de Commander: a única carta do sideboard, se ela tem Companheiro (ou ainda não se sabe). */
export function deckCompanion(deck: DeckData): DeckEntry | null {
  const side = deck.sideboard ?? [];
  if (deck.format !== 'commander' || side.length !== 1 || side[0]!.count !== 1) return null;
  return isCompanionCard(side[0]!.name) === false ? null : side[0]!;
}

/** O sideboard do Commander com algo além do companheiro (lista antiga ou importada): a aba aparece para o jogador corrigir. */
export const commanderSideboardExtra = (deck: DeckData) => deck.format === 'commander' && !!deck.sideboard?.length && !deckCompanion(deck);

/** Proibidos só como companheiro no Commander (continuam valendo no deck e como comandante). */
export const BANNED_AS_COMPANION = ['Lutri, the Spellchaser'];

/** Filtro do Scryfall para a vaga do companheiro, sem os proibidos nela. */
export const COMPANION_FILTER = ['keyword:companion', ...BANNED_AS_COMPANION.map(name => `-!"${name}"`)].join(' ');
