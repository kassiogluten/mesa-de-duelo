import lists from '../shared/commander-brackets.json' with { type: 'json' };
import type { DeckData } from './decks';

/**
 * Bracket do Commander (a faixa de poder oficial). O mínimo sai das cartas, com as listas de
 * shared/commander-brackets.json (update-commander-brackets.py); o resto é intenção de quem montou o deck, que escolhe
 * a partir do mínimo. Tudo local: nada de consultar sites ao abrir a biblioteca ou escolher deck.
 */
export type Bracket = 1 | 2 | 3 | 4 | 5;
export const BRACKETS: readonly Bracket[] = [1, 2, 3, 4, 5];
export const BRACKET_NAME: Record<Bracket, string> = { 1: 'Exibição', 2: 'Básico', 3: 'Melhorado', 4: 'Otimizado', 5: 'cEDH' };
export const BRACKET_DESCRIPTION: Record<Bracket, string> = {
  1: 'Deck temático, montado pela graça da partida mais do que para ganhar.',
  2: 'Do nível de um deck pré-montado: sem Game Changers e sem combos de duas cartas que ganham a partida.',
  3: 'Deck reforçado: até 3 Game Changers, e combos de duas cartas só no fim da partida.',
  4: 'O mais forte que o deck consegue, sem restrições além das cartas banidas.',
  5: 'Commander competitivo (cEDH), montado para torneio.',
};
/** Sem nada que pese nas cartas, o deck fica no nível de um pré-montado: o 1 é escolha consciente de quem monta. */
const DEFAULT_BRACKET: Bracket = 2;
/** Turnos extras a partir daqui dão para encadear, o que as faixas até a 3 não aceitam. */
const CHAINED_EXTRA_TURNS = 3;
/** bracketTag do Commander Spellbook → faixa mínima (a conversão que o próprio site usa na busca). */
const COMBO_MIN: Record<string, Bracket> = { E: 1, C: 2, O: 2, P: 3, S: 3, R: 4 };

export const isBracket = (v: unknown): v is Bracket => typeof v === 'number' && BRACKETS.includes(v as Bracket);
export const bracketLabel = (b: Bracket) => `Bracket ${b}`;

const key = (name: string) => name.trim().toLowerCase();
/** Nome inteiro e nome da face da frente: a lista guarda "Boom // Bust", o deck pode ter só "Boom". */
const faces = (name: string) => [key(name), key(name.split(' // ')[0])];
const listIndex = (names: string[]) => new Map(names.flatMap(name => faces(name).map(k => [k, name] as const)));
const GAME_CHANGERS = listIndex(lists.gameChangers), LAND_DENIAL = listIndex(lists.massLandDenial);
const EXTRA_TURNS = listIndex(lists.extraTurns), TUTORS = listIndex(lists.tutors);
const COMBOS = lists.combos.filter(c => COMBO_MIN[c.tag]).map(c => ({ cards: c.cards, min: COMBO_MIN[c.tag] }));

export interface BracketReason { min: Bracket; text: string }
/** min: a faixa mais baixa que as cartas permitem; reasons: o porquê, da que mais pesa para a que só informa. */
export interface BracketEstimate { min: Bracket; reasons: BracketReason[] }

const list = (names: string[]) => names.join(', ');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Bracket mínimo pelas cartas do deck e dos comandantes (o sideboard não entra na partida). */
export function estimateBracket(deck: Pick<DeckData, 'cards' | 'commanders'>): BracketEstimate {
  const present = new Set([...(deck.commanders ?? []), ...deck.cards].flatMap(e => faces(e.name)));
  const found = (index: Map<string, string>) => [...new Set([...present].map(k => index.get(k)).filter((n): n is string => !!n))].sort();
  const reasons: BracketReason[] = [];
  const gameChangers = found(GAME_CHANGERS);
  if (gameChangers.length) reasons.push({ min: gameChangers.length <= 3 ? 3 : 4, text: `${plural(gameChangers.length, 'Game Changer', 'Game Changers')}: ${list(gameChangers)}` });
  const landDenial = found(LAND_DENIAL);
  if (landDenial.length) reasons.push({ min: 4, text: `Destruição de terrenos em massa: ${list(landDenial)}` });
  const extraTurns = found(EXTRA_TURNS);
  if (extraTurns.length) reasons.push({ min: extraTurns.length >= CHAINED_EXTRA_TURNS ? 4 : 1, text: `${extraTurns.length >= CHAINED_EXTRA_TURNS ? `${extraTurns.length} cartas de turno extra, que dão para encadear` : 'Turno extra'}: ${list(extraTurns)}` });
  const combos = COMBOS.filter(c => c.cards.every(name => faces(name).some(k => present.has(k))));
  for (const min of [...new Set(combos.map(c => c.min))].sort((a, b) => b - a)) {
    const same = combos.filter(c => c.min === min).map(c => c.cards.join(' + '));
    reasons.push({ min, text: `${same.length === 1 ? 'Combo de duas cartas' : `${same.length} combos de duas cartas`}${min <= 2 ? ' que não ganham a partida sozinhos' : ''}: ${same.join('; ')}` });
  }
  // Os tutores saíram das regras de bracket em outubro de 2025 (os mais fortes são Game Changers): só informam, e os
  // que já contaram como Game Changer não se repetem.
  const tutors = found(TUTORS).filter(name => !gameChangers.includes(name));
  if (tutors.length) reasons.push({ min: 1, text: `${plural(tutors.length, 'tutor eficiente', 'tutores eficientes')}: ${list(tutors)}` });
  reasons.sort((a, b) => b.min - a.min);
  return { min: reasons.reduce<Bracket>((m, r) => r.min > m ? r.min : m, 1), reasons };
}

/**
 * Bracket do deck de Commander: o escolhido (ou o padrão, se ninguém escolheu), nunca abaixo do mínimo das cartas.
 * Fora do Commander, não há bracket.
 */
export function deckBracket(deck: DeckData): Bracket | undefined {
  if (deck.format !== 'commander') return undefined;
  const min = estimateBracket(deck).min, chosen = deck.bracket ?? (DEFAULT_BRACKET > min ? DEFAULT_BRACKET : min);
  return chosen > min ? chosen : min;
}
