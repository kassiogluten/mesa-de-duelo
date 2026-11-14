// Quais jogadas são momentos grandes (mágica de valor 6 ou mais, lendária entrando), para a fila dar mais tempo a elas e a mesa mostrá-las com mais peso.
import type { PresentationEvent } from './presentationTimeline';

/** Valor de mana de um custo impresso ("{4}{G}{G}" é 6; X vale 0; híbrido {2/W} vale 2), só da primeira face. */
export function manaValueOf(cost = '') {
  return (cost.split(' // ')[0]!.match(/\{[^}]+\}/g) ?? []).reduce((total, symbol) => {
    const inner = symbol.slice(1, -1);
    const number = /^(\d+)(?:\/|$)/.exec(inner);
    return total + (number ? Number(number[1]) : /^[XYZ]$/.test(inner) ? 0 : 1);
  }, 0);
}
/** Mágica a partir deste valor de mana é um momento grande (decidido em 14/11/2026). */
export const BIG_SPELL = 6;

/** Criatura ou planeswalker lendário entrando no campo: ganha a cena própria. */
export function legendaryEntry(event: PresentationEvent) {
  const card = event.card;
  return event.type === 'entered' && !event.repeat && !!card && /\bLegendary\b/.test(card.typeLine ?? '') && (!!card.creature || !!card.planeswalker);
}
/** Mágica grande sendo conjurada. */
export const bigSpell = (event: PresentationEvent) => event.type === 'spell-cast' && manaValueOf(event.card?.manaCost) >= BIG_SPELL;
