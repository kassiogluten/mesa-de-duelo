// Comandantes com Rulebreaker (Mystery Booster Commander): as cartas que eles liberam da identidade de cor e o deck sem tamanho máximo.
import type { ScryCard } from './scryfallCards';

export interface Rulebreaker {
  /** Cartas que podem entrar no deck fora da identidade de cor do comandante. */
  exempt?: (card: Pick<ScryCard, 'type_line' | 'cmc' | 'color_identity'>) => boolean;
  /** As mesmas cartas na sintaxe da busca do Scryfall, para a busca do deck não escondê-las. */
  query?: string;
  /** O que o jogador lê ao lado da identidade de cor. */
  label?: string;
  /** Deck sem tamanho máximo (ainda com pelo menos 100 cartas). */
  unlimitedSize?: boolean;
  /** Cor extra que o jogador escolhe no editor (Tolabow): só para instantâneas e feitiços. */
  colorChoice?: boolean;
  /** Falta escolher a cor extra. */
  missingChoice?: boolean;
}

const basic = (t: string) => /\bBasic\b.*\bLand\b/.test(t);
const front = (t: string) => t.split(' // ')[0] ?? t;

/** Os mesmos comandantes que o servidor aceita (as regras vêm do Forge); o Tolabow, que depende da cor escolhida, fica em `tolabow`. */
const RULEBREAKERS: Record<string, Rulebreaker> = {
  'valko indorian': { exempt: c => /\bPhyrexian\b/.test(c.type_line) || basic(c.type_line), query: '(t:phyrexian or t:basic)', label: 'cartas Phyrexian e terrenos básicos de qualquer cor' },
  'seluma, light of aysen': { exempt: c => /\bAngel\b/.test(c.type_line) || basic(c.type_line), query: '(t:angel or t:basic)', label: 'Anjos e terrenos básicos de qualquer cor' },
  'the unluckiest planeswalker': { exempt: c => /\bAura\b/.test(c.type_line) || basic(c.type_line), query: '(t:aura or t:basic)', label: 'Auras e terrenos básicos de qualquer cor' },
  'the everforger': {
    exempt: c => (/\bArtifact\b/.test(front(c.type_line)) && /\bCreature\b/.test(front(c.type_line))) || /\bEquipment\b/.test(c.type_line) || basic(c.type_line),
    query: '((t:artifact t:creature) or t:equipment or t:basic)', label: 'criaturas artefato, Equipamentos e terrenos básicos de qualquer cor',
  },
  'maular, the next evolution': { exempt: c => (/\bCreature\b/.test(front(c.type_line)) && (c.cmc ?? 0) >= 7) || basic(c.type_line), query: '((t:creature mv>=7) or t:basic)', label: 'criaturas de valor de mana 7 ou mais e terrenos básicos de qualquer cor' },
  'grizzlegom, hurloon hero': { exempt: c => /\bLand\b/.test(c.type_line), query: 't:land', label: 'terrenos de qualquer cor' },
  'whtz, the bibliophile': { unlimitedSize: true },
};

export const COLOR_WORD: Record<string, string> = { W: 'brancos', U: 'azuis', B: 'pretos', R: 'vermelhos', G: 'verdes' };

/** Tolabow, Loch Rascal: instantâneas e feitiços podem ter uma cor a mais, escolhida pelo jogador; terrenos básicos de qualquer cor. */
function tolabow(chosen: string | undefined): Rulebreaker {
  const color = chosen && /^[WBRG]$/.test(chosen) ? chosen : '';
  const allowed = new Set(['U', color]);
  return {
    colorChoice: true, missingChoice: !color,
    exempt: c => basic(c.type_line) || (!!color && /\b(Instant|Sorcery)\b/.test(c.type_line) && (c.color_identity ?? []).every(x => allowed.has(x))),
    query: color ? `(t:basic or ((t:instant or t:sorcery) id<=u${color.toLowerCase()}))` : 't:basic',
    label: color ? `instantâneas e feitiços também ${COLOR_WORD[color]} e terrenos básicos de qualquer cor` : 'terrenos básicos de qualquer cor (escolha a cor extra do Tolabow)',
  };
}
export const needsColorChoice = (name: string) => name.toLowerCase() === 'tolabow, loch rascal';

/** O Rulebreaker de cada comandante do deck que tem um. */
export function rulebreakersOf(commanders: { name: string; chosenColors?: string }[]): Rulebreaker[] {
  return commanders.map(e => needsColorChoice(e.name) ? tolabow(e.chosenColors) : RULEBREAKERS[e.name.toLowerCase()]).filter((r): r is Rulebreaker => !!r);
}
