// As categorias das cartas de um deck (compra, remoção, ramp…), tiradas das tags de função do Tagger do Scryfall.

/**
 * Cada categoria diz que tags do Tagger (já com as tags-mãe, como o servidor manda) a carta precisa ter. As regras
 * acertam os casos em que a árvore do Tagger não basta: o terreno buscado pelo Cultivate não é tutor, o Dark Ritual
 * sozinho não acelera a mana de verdade e o Caminho para o Exílio dá o terreno ao oponente (é remoção, não ramp).
 */
export interface Category { id: CategoryId; label: string; hint: string; test(tags: ReadonlySet<string>): boolean }
export type CategoryId = 'ramp' | 'draw' | 'removal' | 'sweeper' | 'counter' | 'tutor' | 'recursion' | 'protection' | 'discard' | 'lifegain';

/** Tags de tutor que só dizem para onde a carta vai (tutor-to-hand) ou que buscam terreno: sozinhas, não fazem um tutor. */
const landOnlyTutor = (t: string) => t.startsWith('tutor-land') || t === 'tutor-to' || t.startsWith('tutor-to-');
export const CATEGORIES: readonly Category[] = [
  { id: 'ramp', label: 'Ramp', hint: 'Aceleram a mana: terrenos a mais, artefatos e criaturas que geram mana.',
    test: t => t.has('ramp') && !t.has('donate-rampant-growth') && (t.has('mana-producer') || t.has('land-ramp') || t.has('extra-land') || !t.has('ritual')) },
  { id: 'draw', label: 'Compra', hint: 'Compram cartas ou dão vantagem de cartas.', test: t => t.has('draw') || t.has('card-advantage') },
  { id: 'removal', label: 'Remoção', hint: 'Tiram uma permanente do oponente do jogo: destruir, exilar, devolver.', test: t => t.has('spot-removal') || (t.has('removal') && !t.has('sweeper')) },
  { id: 'sweeper', label: 'Limpa-campo', hint: 'Tiram várias permanentes de uma vez.', test: t => t.has('sweeper') },
  { id: 'counter', label: 'Anulação', hint: 'Anulam mágicas.', test: t => t.has('counterspell') },
  { id: 'tutor', label: 'Tutor', hint: 'Buscam uma carta no grimório (sem contar a busca de terrenos).', test: t => [...t].some(tag => tag.startsWith('tutor-') && !landOnlyTutor(tag)) },
  { id: 'recursion', label: 'Recursão', hint: 'Trazem cartas de volta do cemitério.', test: t => t.has('recursion') || t.has('reanimate') },
  { id: 'protection', label: 'Proteção', hint: 'Protegem suas permanentes: resistência, indestrutível, contra remoção.', test: t => t.has('protection') },
  { id: 'discard', label: 'Descarte', hint: 'Fazem o oponente descartar ou mexem na mão dele.', test: t => t.has('hand-disruption') },
  { id: 'lifegain', label: 'Ganho de vida', hint: 'Fazem você ganhar vida.', test: t => t.has('lifegain') },
];

export interface CategoryCount { category: Category; count: number; cards: { name: string; count: number }[] }

/**
 * Quantas cartas do deck há em cada categoria (cada cópia conta). Terrenos ficam de fora, como nas contas de Commander
 * (o Bojuka Bog não conta como remoção). `tags` é o que o servidor mandou por oracle_id.
 */
export function countCategories(rows: { name: string; count: number; oracleId?: string; land: boolean }[], tags: Map<string, string[]>): CategoryCount[] {
  const out = CATEGORIES.map(category => ({ category, count: 0, cards: [] as { name: string; count: number }[] }));
  for (const row of rows) {
    if (row.land || !row.oracleId) continue;
    const set = new Set(tags.get(row.oracleId) ?? []);
    if (!set.size) continue;
    for (const c of out) if (c.category.test(set)) { c.count += row.count; c.cards.push({ name: row.name, count: row.count }); }
  }
  return out;
}
