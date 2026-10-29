import { cardInfo, type CardInfo, type CardType, type Color } from '../cards';
import { cacheGet } from '../scryfall';
import { countEntries, deckPriceDescription, deckPriceText, type DeckData, type DeckEntry } from '../decks';
import { esc } from './cardtext';
import { BRACKET_DESCRIPTION, BRACKET_NAME, bracketLabel, deckBracket, type Bracket } from '../brackets';

export const CURVE = ['0', '1', '2', '3', '4', '5', '6+'];
export const CARD_GROUPS: [CardType, string][] = [
  ['creature', 'Criaturas'], ['planeswalker', 'Planeswalkers'], ['instant', 'Instantâneas'], ['sorcery', 'Feitiços'],
  ['artifact', 'Artefatos'], ['enchantment', 'Encantamentos'], ['battle', 'Batalhas'], ['other', 'Outras'], ['land', 'Terrenos'],
];
export interface DeckRow extends DeckEntry { info?: CardInfo; cmc?: number }
export function deckRows(entries: DeckEntry[]): DeckRow[] {
  return entries.map(e => { const sc = cacheGet(e.name); const info = sc ? cardInfo(sc) : undefined; return { ...e, info, cmc: sc?.cmc ?? info?.cmc }; });
}
export function groupedRows(entries: DeckEntry[]): { label: string; rows: DeckRow[] }[] {
  const rows = deckRows(entries);
  const byCost = (a: DeckRow, b: DeckRow) => (a.cmc ?? 0) - (b.cmc ?? 0) || a.name.localeCompare(b.name);
  return [...CARD_GROUPS.map(([type, label]) => ({ label, rows: rows.filter(r => r.info?.type === type).sort(byCost) })),
    { label: 'Cartas sem dados', rows: rows.filter(r => !r.info).sort(byCost) }].filter(g => g.rows.length);
}
export function deckStats(deck: DeckData) {
  const rows = deckRows(deck.cards), known = rows.filter(r => r.info), spells = known.filter(r => r.info!.type !== 'land');
  const curve = CURVE.map(() => 0);
  for (const r of spells) curve[Math.min(6, Math.floor(r.cmc ?? 0))] += r.count;
  const spellCount = countEntries(spells);
  return {
    total: countEntries(rows), sideboard: countEntries(deck.sideboard ?? []), unknown: countEntries(rows.filter(r => !r.info)),
    lands: countEntries(known.filter(r => r.info!.type === 'land')), creatures: countEntries(known.filter(r => r.info!.type === 'creature')),
    spells: countEntries(known.filter(r => !['land', 'creature'].includes(r.info!.type))), curve,
    average: spellCount ? spells.reduce((sum, r) => sum + (r.cmc ?? 0) * r.count, 0) / spellCount : null,
  };
}
export function deckColors(deck: DeckData): Color[] {
  const colors = new Set(deckRows([...(deck.commanders ?? []), ...deck.cards]).flatMap(r => r.info?.colors ?? []));
  return (['W', 'U', 'B', 'R', 'G'] as Color[]).filter(c => colors.has(c));
}
function coverRow(deck: DeckData): DeckRow | undefined {
  // Com comandante, a capa é só a dele: enquanto os dados dele não chegam, outra carta já carregada (Sol Ring,
  // Arcane Signet…) viraria a capa de vários decks ao mesmo tempo.
  if (deck.commanders?.length) return deckRows(deck.commanders).find(r => r.info?.artCrop);
  // A capa escolhida pelo jogador vale enquanto a carta estiver no deck principal, mesmo antes de os dados chegarem.
  const chosen = deck.format !== 'commander' && deck.cover ? deckRows(deck.cards).find(r => r.name === deck.cover) : undefined;
  if (chosen) return chosen;
  const rows = deckRows(deck.cards).filter(r => r.info?.artCrop).sort((a, b) => (b.cmc ?? 0) - (a.cmc ?? 0));
  return rows.find(r => r.info?.type === 'creature') ?? rows.find(r => r.info?.type !== 'land');
}
export function deckArt(deck: DeckData): string | undefined { return coverRow(deck)?.info?.artCrop; }
/** Nome da carta da capa, para os outros verem a mesma arte no lobby da sala. */
export function deckCover(deck: DeckData): string | undefined { return coverRow(deck)?.name; }
export function statsHTML(deck: DeckData): string {
  const stats = deckStats(deck), peak = Math.max(1, ...stats.curve);
  const partial = stats.unknown > 0;
  return `<div class="ds-stats">
    <div class="ds-counts"><span><b>${stats.creatures}</b> criaturas</span><span><b>${stats.spells}</b> outras mágicas</span><span><b>${stats.lands}</b> terrenos</span></div>
    <div class="ds-curve" role="img" aria-label="${esc(`Curva de mana${partial ? ' parcial' : ''}: ${stats.curve.map((n, i) => `custo ${CURVE[i]}, ${n} cartas`).join('; ')}`)}">${stats.curve.map((n, i) => `<span class="ds-bar"><b>${n || '–'}</b><i style="height:${n / peak * 52}px"></i><small>${CURVE[i]}</small></span>`).join('')}</div>
    <p class="ds-average">Custo médio${partial ? ' parcial' : ''}<b>${stats.average === null ? '–' : stats.average.toFixed(1).replace('.', ',')}</b><small>Sem terrenos</small></p>
    ${partial ? `<p class="ds-incomplete" role="status">Dados pendentes de ${stats.unknown} ${stats.unknown === 1 ? 'carta' : 'cartas'}. As estatísticas estão incompletas.</p>` : ''}
  </div>`;
}

/** O que o bracket quer dizer, para a dica do selo. */
export const bracketTitle = (b: Bracket) => `${bracketLabel(b)} · ${BRACKET_NAME[b]}: ${BRACKET_DESCRIPTION[b]}`;
/** Selo "Bracket 3" do deck de Commander; vazio nos outros formatos. */
export function bracketBadgeHTML(deck: DeckData, className: string) {
  const bracket = deckBracket(deck);
  return bracket ? `<span class="deck-bracket ${className}" title="${esc(bracketTitle(bracket))}">${bracketLabel(bracket)}</span>` : '';
}

/** Preço do deck com a dica explicando o valor. Fora de um botão, o valor recebe foco para a dica abrir no toque e no teclado. */
export function deckPriceHTML(deck: DeckData, className: string, focusable: boolean) {
  const text = deckPriceText(deck);
  if (!text) return '';
  const tip = `price-tip-${esc(deck.id)}`;
  return `<span class="deck-price ${className}"${focusable ? ` tabindex="0" aria-describedby="${tip}"` : ''}>${text}<span class="deck-price-tip" id="${tip}" role="tooltip">${esc(deckPriceDescription(deck))}</span></span>`;
}
