/**
 * Consultas do Scryfall da busca de cartas do construtor: texto, cores, tipo e função (tags do Tagger, `otag:`),
 * e a consulta das candidatas a "Parecidas" (mesmas cores, mesmo tipo e custo próximo). O formato do deck
 * entra depois, em `searchCards`.
 */

/** Tags de função do Tagger, com o nome do Scryfall (sem tradução). `otag:` já inclui as tags filhas. */
export const FUNCTION_TAGS = [
  'anthem', 'bounce', 'burn', 'cantrip', 'card-advantage', 'combat-trick', 'cost-reducer', 'counterspell', 'discard',
  'draw', 'extra-turn', 'flicker', 'fog', 'hand-disruption', 'lifegain', 'loot', 'mana-dork', 'mana-rock', 'mill',
  'protection', 'ramp', 'reanimate', 'recursion', 'removal', 'removal-artifact', 'removal-creature', 'removal-enchantment',
  'ritual', 'sacrifice-outlet', 'scry', 'surveil', 'sweeper', 'tutor',
] as const;

const ORDER = ['W', 'U', 'B', 'R', 'G'];
const letters = (colors: Iterable<string>) => ORDER.filter(c => new Set(colors).has(c)).join('').toLowerCase();

/** Filtro de identidade de cor (`id<=wu`, `id:c` para incolor). */
export function identityFilter(identity: Iterable<string>): string {
  const l = letters(identity);
  return l ? `id<=${l}` : 'id:c';
}

export interface SearchParts {
  text?: string;
  /** Cores marcadas no filtro (incluem as incolores). */
  colors?: Iterable<string>;
  /** Tipo do filtro, já na sintaxe do Scryfall (`t:creature`). */
  type?: string;
  /** Tag de função do Tagger. */
  func?: string;
  /** Identidade de cor do deck de Commander (do comandante); fica de fora ao escolher o comandante. */
  identity?: Iterable<string> | null;
  commanderSlot?: boolean;
}

export function buildSearchQuery(p: SearchParts): string {
  const colors = p.colors ? letters(p.colors) : '';
  const func = p.func && /^[a-z0-9-]+$/.test(p.func) ? `otag:${p.func}` : '';
  return [
    p.text?.trim() ?? '',
    colors ? `id<=${colors}` : '',
    p.type ?? '',
    func,
    p.commanderSlot ? '(is:commander or t:background)' : p.identity ? identityFilter(p.identity) : '',
  ].filter(Boolean).join(' ');
}

/** Grupo de tipo da carta, para só comparar com cartas do mesmo jeito (instantânea e feitiço juntos). */
export function typeGroup(typeLine: string): string {
  const t = (typeLine.split(' // ')[0] ?? '').toLowerCase();
  if (/\bland\b/.test(t)) return 't:land';
  if (/\bcreature\b/.test(t)) return 't:creature';
  if (/\bplaneswalker\b/.test(t)) return 't:planeswalker';
  if (/\bbattle\b/.test(t)) return 't:battle';
  if (/\b(instant|sorcery)\b/.test(t)) return '(t:instant or t:sorcery)';
  if (/\bartifact\b/.test(t)) return 't:artifact';
  if (/\benchantment\b/.test(t)) return 't:enchantment';
  return '';
}

export interface SimilarSource { type_line: string; cmc?: number; colors?: string[]; color_identity?: string[] }

/**
 * Candidatas a "Parecidas": mesmas cores, mesmo tipo e custo de mana a um de distância. Terrenos não têm cor
 * nem custo: comparam pela identidade de cor. No Commander, só o que cabe na identidade do comandante.
 */
export function similarQuery(card: SimilarSource, identity?: Iterable<string> | null): string {
  const group = typeGroup(card.type_line);
  const land = group === 't:land';
  const colors = letters(land ? card.color_identity ?? [] : card.colors ?? card.color_identity ?? []);
  const mv = Math.floor(card.cmc ?? 0);
  return [
    land ? `id=${colors || 'c'}` : `c=${colors || 'c'}`,
    group,
    land ? '' : `mv>=${Math.max(0, mv - 1)} mv<=${mv + 1}`,
    identity ? identityFilter(identity) : '',
  ].filter(Boolean).join(' ');
}
