// As trocas com o sideboard entre os jogos, sem tela: mover uma cópia, trocar duas cartas, o que saiu e entrou, a contagem e o filtro.
import { countEntries, entryKey, type DeckEntry } from '../decks';
import { CARD_GROUPS, CURVE, deckRows, type DeckRow } from './deckStats';
import type { CardType } from '../cards';

export type SideboardSide = 'main' | 'sideboard';
export interface SideboardLists { main: DeckEntry[]; sideboard: DeckEntry[] }
/** Os botões de tipo do filtro: cada um junta grupos de `CARD_GROUPS`. */
export type SideboardTypeFilter = '' | 'creature' | 'spell' | 'land';
export interface SideboardFilter { text: string; type: SideboardTypeFilter }
export const TYPE_FILTERS: [SideboardTypeFilter, string][] = [['', 'Todas'], ['creature', 'Criaturas'], ['spell', 'Outras mágicas'], ['land', 'Terrenos']];

const other = (side: SideboardSide): SideboardSide => side === 'main' ? 'sideboard' : 'main';

/** Passa uma cópia de `key` do lado `from` para o outro. False quando a carta não está lá. */
export function moveCopy(lists: SideboardLists, from: SideboardSide, key: string): boolean {
  const source = lists[from], target = lists[other(from)];
  const index = source.findIndex(e => entryKey(e) === key);
  const entry = source[index];
  if (!entry) return false;
  const existing = target.find(e => entryKey(e) === key);
  if (existing) existing.count++;
  else target.push({ name: entry.name, count: 1, ...(entry.oracleId ? { oracleId: entry.oracleId } : {}), ...(entry.set ? { set: entry.set, cn: entry.cn } : {}) });
  if (--entry.count === 0) source.splice(index, 1);
  return true;
}

/** Troca em par: uma cópia de `key` sai de `from` e uma de `otherKey` vem do outro lado no lugar dela. */
export function swapPair(lists: SideboardLists, from: SideboardSide, key: string, otherKey: string): boolean {
  if (!lists[from].some(e => entryKey(e) === key) || !lists[other(from)].some(e => entryKey(e) === otherKey)) return false;
  return moveCopy(lists, other(from), otherKey) && moveCopy(lists, from, key);
}

/** O que saiu do deck principal e o que entrou nele, comparado com a lista do jogo anterior. Por nome, com as cópias somadas. */
export function sideboardChanges(original: DeckEntry[], main: DeckEntry[]) {
  const byName = (entries: DeckEntry[]) => entries.reduce((m, e) => m.set(e.name, (m.get(e.name) ?? 0) + e.count), new Map<string, number>());
  const before = byName(original), after = byName(main);
  const out: DeckEntry[] = [], into: DeckEntry[] = [];
  for (const [name, n] of before) if ((after.get(name) ?? 0) < n) out.push({ name, count: n - (after.get(name) ?? 0) });
  for (const [name, n] of after) if ((before.get(name) ?? 0) < n) into.push({ name, count: n - (before.get(name) ?? 0) });
  return { out, into };
}

/** Diferença de cópias de cada impressão em relação ao jogo anterior: +2 quando entraram duas, −1 quando saiu uma. */
export function copyDelta(original: DeckEntry[], current: DeckEntry[], key: string) {
  const count = (entries: DeckEntry[]) => entries.find(e => entryKey(e) === key)?.count ?? 0;
  return count(current) - count(original);
}

const SPELL_TYPES = new Set<CardType>(CARD_GROUPS.map(([t]) => t).filter(t => t !== 'creature' && t !== 'land'));
function typeMatches(row: DeckRow, type: SideboardTypeFilter) {
  if (!type) return true;
  const t = row.info?.type;
  return type === 'spell' ? !!t && SPELL_TYPES.has(t) : t === type;
}
/** Sem acento e em minúsculas, para "relampago" achar "Relâmpago". */
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export function matchesSideboardFilter(row: DeckRow, filter: SideboardFilter) {
  const query = fold(filter.text.trim());
  return typeMatches(row, filter.type) && (!query || fold(row.name).includes(query) || fold(row.info?.label ?? '').includes(query));
}

/** Os grupos de uma coluna (Criaturas, Instantâneas…, Terrenos), cada um por custo, já com o filtro. */
export function sideboardGroups(entries: DeckEntry[], filter: SideboardFilter) {
  const rows = deckRows(entries).filter(r => matchesSideboardFilter(r, filter));
  const byCost = (a: DeckRow, b: DeckRow) => (a.cmc ?? 0) - (b.cmc ?? 0) || (a.info?.label ?? a.name).localeCompare(b.info?.label ?? b.name);
  return [...CARD_GROUPS.map(([type, label]) => ({ label, rows: rows.filter(r => r.info?.type === type).sort(byCost) })),
    { label: 'Outras cartas', rows: rows.filter(r => !r.info).sort(byCost) }].filter(g => g.rows.length);
}

/** Contagem do deck principal: total, terrenos, criaturas, outras mágicas e a curva das que não são terreno. */
export function sideboardStats(main: DeckEntry[]) {
  const rows = deckRows(main), known = rows.filter(r => r.info);
  const spells = known.filter(r => r.info!.type !== 'land');
  const curve = CURVE.map(() => 0);
  for (const r of spells) { const i = Math.min(CURVE.length - 1, Math.floor(r.cmc ?? 0)); curve[i] = (curve[i] ?? 0) + r.count; }
  return {
    total: countEntries(main),
    lands: countEntries(known.filter(r => r.info!.type === 'land')),
    creatures: countEntries(known.filter(r => r.info!.type === 'creature')),
    spells: countEntries(spells.filter(r => r.info!.type !== 'creature')),
    curve,
  };
}
