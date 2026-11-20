// Quais jogadas são momentos grandes (mágica de valor 6 ou mais, lendária entrando, comandante saindo da zona de comando, Game Changer chegando à mesa), para a fila dar mais tempo a elas e a mesa mostrá-las com mais peso.
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

/** O comandante entrando no campo depois de conjurado da zona de comando: mergulha no lugar e a arte sai da moldura. */
export const commanderEntry = (event: PresentationEvent) => event.type === 'entered' && !!event.commanderEntry && !!event.card;
/** Duração cheia da entrada do comandante, em ms (o Rápido e a fila cheia encurtam como os outros passos). */
export const COMMANDER_ENTRY = 1500;

/** Criatura ou planeswalker lendário entrando no campo: ganha a cena própria (o comandante tem a dele, acima). */
export function legendaryEntry(event: PresentationEvent) {
  const card = event.card;
  return event.type === 'entered' && !event.repeat && !event.commanderEntry && !!card && /\bLegendary\b/.test(card.typeLine ?? '') && (!!card.creature || !!card.planeswalker);
}
/** Mágica grande sendo conjurada. */
export const bigSpell = (event: PresentationEvent) => event.type === 'spell-cast' && manaValueOf(event.card?.manaCost) >= BIG_SPELL;

/** Game Changer conjurado ou jogado numa partida com as regras do Commander (marcado na fila, presentationTimeline.ts). */
export const gameChangerPlay = (event: PresentationEvent) => (event.type === 'spell-cast' || event.type === 'land-played') && !!event.gameChanger && !!event.card;
/** Duração cheia do passo do Game Changer, em ms: o voo e os 2,3 s da cena (o Rápido e a fila cheia encurtam como os outros). */
export const GAME_CHANGER = 3000;
/** A parte do passo que é o voo até a pilha (ou o campo); o resto é a cena. */
export const GAME_CHANGER_FLIGHT = .24;
