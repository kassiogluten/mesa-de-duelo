import { countEntries, type DeckData, type DeckEntry } from '../decks';

export type DeckImportMode = 'merge' | 'replace';

/** Storage adds these defaults; they are not changes to a freshly created deck. */
export function deckImportSnapshot(deck: DeckData): string {
  const { builtin: _builtin, format, sideboard, ...rest } = deck;
  return JSON.stringify({ ...rest, builtin: false, format: format ?? 'free', sideboard: sideboard ?? [] });
}

function combine(entries: DeckEntry[]): DeckEntry[] {
  const result: DeckEntry[] = [];
  for (const entry of entries) {
    if (!entry.name.trim() || !Number.isSafeInteger(entry.count) || entry.count <= 0) throw new Error('A lista contém uma quantidade inválida.');
    const previous = result.find(e => ((e.oracleId && entry.oracleId && e.oracleId === entry.oracleId) || e.name.toLowerCase() === entry.name.toLowerCase())
      && e.set === entry.set && e.cn === entry.cn);
    if (previous) {
      if (!Number.isSafeInteger(previous.count + entry.count)) throw new Error(`Quantidade muito grande para ${entry.name}.`);
      previous.count += entry.count;
      previous.oracleId ??= entry.oracleId;
    } else result.push({ ...entry });
  }
  if (!Number.isSafeInteger(countEntries(result))) throw new Error('A lista contém cartas demais.');
  return result;
}

/** Build a review without changing the original deck or its identity/metadata. */
export function applyDeckImport(target: DeckData, incoming: DeckData, mode: DeckImportMode): DeckData {
  if (target.builtin) throw new Error('Crie uma cópia deste deck pronto antes de importar cartas.');
  if (mode !== 'merge' && mode !== 'replace') throw new Error('Escolha como aplicar a lista.');
  if (!incoming.cards.length && !incoming.sideboard?.length && !incoming.commanders?.length) throw new Error('A lista não contém cartas para importar.');
  const cards = combine([...(mode === 'merge' ? target.cards : []), ...incoming.cards]);
  const sideboard = combine([...(mode === 'merge' ? target.sideboard ?? [] : []), ...(incoming.sideboard ?? [])]);
  // Um comandante que já está na zona de comando não ganha segunda cópia ao adicionar a lista.
  const kept = mode === 'merge' ? target.commanders ?? [] : [];
  const commanders = combine([...kept, ...(incoming.commanders ?? []).filter(e => !kept.some(k => (k.oracleId && k.oracleId === e.oracleId) || k.name.toLowerCase() === e.name.toLowerCase()))]);
  const unresolved = [...new Set([...(mode === 'merge' ? target.unresolved ?? [] : []), ...(incoming.unresolved ?? [])])]
    .filter(name => [...cards, ...sideboard, ...commanders].some(entry => entry.name.toLowerCase() === name.toLowerCase()));
  return {
    ...target, cards, sideboard, commanders, unresolved,
    importHistory: [...new Set([...(target.importHistory ?? []), ...(target.importSource ? [target.importSource] : [])])],
    importSource: incoming.importSource ?? target.importSource,
    bracket: incoming.bracket ?? target.bracket,
    updatedAt: new Date().toISOString(),
  };
}

/** A lista editada substitui todas as seções, mas não conta como importação: a lista original importada continua a mesma. */
export function applyDeckListEdit(target: DeckData, incoming: DeckData): DeckData {
  const { importSource, importHistory, ...deck } = applyDeckImport(target, { ...incoming, importSource: undefined }, 'replace');
  return { ...deck, ...(target.importSource ? { importSource: target.importSource } : {}), ...(target.importHistory ? { importHistory: target.importHistory } : {}) };
}

export type DeckSection = 'commanders' | 'cards' | 'sideboard';
export interface DeckSectionChanges { section: DeckSection; added: DeckEntry[]; removed: DeckEntry[] }

/** O que entra e o que sai em cada seção, carta a carta (cada impressão conta separada). */
export function deckListChanges(before: DeckData, after: DeckData): DeckSectionChanges[] {
  const key = (e: DeckEntry) => `${e.name.toLowerCase()}|${e.set ?? ''}|${e.cn ?? ''}`;
  const counts = (entries: DeckEntry[]) => {
    const map = new Map<string, DeckEntry>();
    for (const e of entries) { const previous = map.get(key(e)); map.set(key(e), previous ? { ...previous, count: previous.count + e.count } : { ...e }); }
    return map;
  };
  return (['commanders', 'cards', 'sideboard'] as const).map(section => {
    const old = counts(before[section] ?? []), now = counts(after[section] ?? []);
    const added: DeckEntry[] = [], removed: DeckEntry[] = [];
    for (const [k, e] of now) { const diff = e.count - (old.get(k)?.count ?? 0); if (diff > 0) added.push({ ...e, count: diff }); }
    for (const [k, e] of old) { const diff = e.count - (now.get(k)?.count ?? 0); if (diff > 0) removed.push({ ...e, count: diff }); }
    return { section, added, removed };
  }).filter(c => c.added.length || c.removed.length);
}
