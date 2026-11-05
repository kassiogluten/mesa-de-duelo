import { commanderRules, FORMAT_LABEL, hasCommandZone, readyDeckFits, type DeckData, type DeckFormat } from '../decks';
import { BRACKETS, bracketLabel, deckBracket, type Bracket } from '../brackets';
import { validateDeckLocal } from './deckRules';

/** O mesmo critério da lista e do sorteio do servidor: os decks prontos do formato (no Livre, todos os de 60 cartas). */
export const readyPool = (decks: DeckData[], format: DeckFormat | null) => decks.filter(d => d.builtin && readyDeckFits(d, format ?? 'free') && (!format || validateDeckLocal(d, format).status !== 'invalid'));
/** Nos decks prontos o bracket foi conferido à mão; o cálculo pelas cartas fica para quando faltar. */
const readyBracket = (d: DeckData) => d.bracket ?? deckBracket(d);
/** Os brackets que algum deck pronto tem: o controle só oferece máximos com deck. */
export const botBrackets = (decks: DeckData[]) => BRACKETS.filter(b => decks.some(d => readyBracket(d) === b));

/** O que decide os decks dos computadores: o formato, o máximo escolhido (null: segue o deck), o do deck e a série. */
export interface BotChoice {
  format: DeckFormat | null;
  botBracket: 'any' | Bracket | null;
  myBracket: Bracket | undefined;
  /** Precon com "só da série" marcado: a série do deck do jogador. */
  series: string | undefined;
}
/**
 * O bracket máximo dos computadores, no Commander e no Precon: o escolhido, ou o do deck do jogador enquanto ninguém
 * escolheu. Um máximo abaixo de todos os decks prontos sobe até o menor que existe; null é "Qualquer".
 */
export function botBracketMax(decks: DeckData[], choice: BotChoice): Bracket | null {
  if (!commanderRules(choice.format ?? undefined)) return null;
  const wanted = choice.botBracket ?? choice.myBracket ?? 'any';
  if (wanted === 'any') return null;
  const offered = botBrackets(decks);
  return offered.some(b => b <= wanted) ? wanted : offered[0] ?? null;
}
export function botPool(decks: DeckData[], choice: BotChoice) {
  const max = botBracketMax(decks, choice), series = choice.series;
  return decks.filter(d => (max === null || (readyBracket(d) ?? 0) <= max) && (!series || d.precon?.series === series));
}

/** O que conta como o mesmo deck na mesa: os comandantes, cada um pelo nome; sem comandante, o nome do deck. */
export const tableKeys = (d: DeckData) => d.commanders?.length ? d.commanders.map(c => c.name) : [`deck:${d.name}`];
/**
 * Os decks dos computadores: os escolhidos ficam, e cada aleatório (null) sai do pool sem repetir o comandante de
 * ninguém da mesa (table, os escolhidos e os já sorteados) enquanto houver outro; só repete quando o pool acaba.
 */
export function drawBots<T extends DeckData>(picks: (T | null)[], pool: T[], table: DeckData[], rnd = Math.random): (T | null)[] {
  const taken = new Set([...table, ...picks.filter((d): d is T => !!d)].flatMap(tableKeys));
  return picks.map(pick => {
    if (pick || !pool.length) return pick;
    const fresh = pool.filter(d => tableKeys(d).every(k => !taken.has(k)));
    const from = fresh.length ? fresh : pool, drawn = from[Math.floor(rnd() * from.length)]!;
    tableKeys(drawn).forEach(k => taken.add(k));
    return drawn;
  });
}

export interface SummaryChoice extends BotChoice {
  mode: 'ai' | 'net' | 'free';
  playerCount: number;
  commanderOpponents: string[];
  /** O deck escolhido para o computador no duelo (undefined: aleatório). */
  opponent: DeckData | undefined;
  matchLength: 'bo1' | 'bo3';
  pool: DeckData[];
}
/** A partida numa linha: "Commander · 4 jogadores · computadores aleatórios". */
export function matchSummary(o: SummaryChoice) {
  const { format, playerCount } = o;
  if (!format) return '';
  const parts = [FORMAT_LABEL[format]];
  if (o.mode === 'free') parts.push('Mesa livre');
  else if (o.mode === 'net') parts.push('Contra outras pessoas');
  else if (hasCommandZone(format ?? undefined)) {
    const random = o.commanderOpponents.slice(0, playerCount - 1).every(id => id === 'random');
    parts.push(`${playerCount} jogadores`, random ? (playerCount > 2 ? 'computadores aleatórios' : 'computador aleatório') : playerCount > 2 ? 'contra os computadores' : 'contra o computador');
    const max = botBracketMax(o.pool, o);
    if (max !== null) parts.push(`até ${bracketLabel(max)}`);
    if (o.series) parts.push('da mesma série');
  } else {
    parts.push(o.opponent ? `contra ${o.opponent.name}` : 'computador aleatório');
    if (o.matchLength === 'bo3') parts.push('melhor de três');
  }
  return parts.join(' · ');
}
