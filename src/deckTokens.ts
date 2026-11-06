// Fichas do deck: quais as cartas criam e as séries de cada uma no Scryfall, para o jogador escolher a arte.
import { request } from './scryfallApi';
import { images, lookupName, type Images } from './scryfallCards';
import type { DeckData, DeckToken } from './decks';
import { deckEntries } from './decks';

/** Uma ficha que as cartas do deck criam (a impressão padrão do Scryfall), com as cartas que a criam. */
export interface TokenKind { oracleId: string; name: string; typeLine: string; colors: string; power?: string; toughness?: string; image?: Images; sources: string[] }
/** Uma série da ficha. */
export interface TokenPrinting { set: string; cn: string; setName: string; image?: Images }

/** Fichas de cada carta, pelo nome em minúsculas (ids do Scryfall). Só nesta visita da página. */
const tokensOfCard = new Map<string, string[]>();
const tokenById = new Map<string, Omit<TokenKind, 'sources'> | null>();
const printingsOf = new Map<string, TokenPrinting[]>();

const WUBRG = 'WUBRG';
export const colorKey = (colors: unknown) => Array.isArray(colors) ? [...WUBRG].filter(c => colors.includes(c)).join('') : '';
/** Fichas que a mesa sabe mostrar: as de uma face (emblemas e fichas de duas faces ficam de fora). */
const isToken = (d: any) => d?.layout === 'token' && typeof d.oracle_id === 'string';

/** Imagem de uma série escolhida, pelo endereço de imagem do Scryfall. */
export const tokenImage = (t: Pick<DeckToken, 'set' | 'cn'>, version: keyof Images = 'normal') =>
  `https://api.scryfall.com/cards/${encodeURIComponent(t.set)}/${encodeURIComponent(t.cn)}?format=image&version=${version}`;

/** As fichas que as cartas do deck criam, na ordem do nome. Pede ao Scryfall só o que ainda não conhece. */
export async function deckTokens(deck: DeckData): Promise<TokenKind[]> {
  const names = [...new Set(deckEntries(deck).map(e => e.name))];
  const todo = names.filter(n => !tokensOfCard.has(n.toLowerCase()));
  for (let i = 0; i < todo.length; i += 75) {
    const chunk = todo.slice(i, i + 75);
    const { json } = await request('/cards/collection', { identifiers: chunk.map(name => ({ name: lookupName(name) })) });
    const byName = new Map<string, string[]>();
    for (const d of json?.data ?? []) {
      const ids = (Array.isArray(d.all_parts) ? d.all_parts : []).filter((p: any) => p.component === 'token' && typeof p.id === 'string').map((p: any) => p.id as string);
      byName.set(String(d.name).toLowerCase(), ids); byName.set(lookupName(String(d.name)).toLowerCase(), ids);
    }
    for (const n of chunk) tokensOfCard.set(n.toLowerCase(), byName.get(n.toLowerCase()) ?? byName.get(lookupName(n).toLowerCase()) ?? []);
  }
  const ids = [...new Set(names.flatMap(n => tokensOfCard.get(n.toLowerCase()) ?? []))].filter(id => !tokenById.has(id));
  for (let i = 0; i < ids.length; i += 75) {
    const chunk = ids.slice(i, i + 75);
    const { json } = await request('/cards/collection', { identifiers: chunk.map(id => ({ id })) });
    for (const d of json?.data ?? []) tokenById.set(d.id, isToken(d) ? { oracleId: d.oracle_id, name: d.name, typeLine: d.type_line ?? '', colors: colorKey(d.colors), power: d.power, toughness: d.toughness, image: images(d.image_uris) } : null);
    for (const id of chunk) if (!tokenById.has(id)) tokenById.set(id, null);
  }
  const kinds = new Map<string, TokenKind>();
  for (const n of names) for (const id of tokensOfCard.get(n.toLowerCase()) ?? []) {
    const t = tokenById.get(id); if (!t) continue;
    const kind = kinds.get(t.oracleId) ?? { ...t, sources: [] };
    if (!kind.sources.includes(n)) kind.sources.push(n);
    kinds.set(t.oracleId, kind);
  }
  return [...kinds.values()].sort((a, b) => a.name.localeCompare(b.name) || a.typeLine.localeCompare(b.typeLine));
}

/** As séries da ficha, das mais novas para as mais antigas (até 3 páginas do Scryfall). */
export async function tokenPrintings(oracleId: string): Promise<TokenPrinting[]> {
  const cached = printingsOf.get(oracleId); if (cached) return cached;
  const out: TokenPrinting[] = [];
  let path: string | null = `/cards/search?q=${encodeURIComponent(`oracleid:${oracleId}`)}&unique=prints&include_extras=true&order=released&dir=desc`;
  for (let page = 0; path && page < 3; page++) {
    const { status, json }: { status: number; json: any } = await request(path);
    if (status === 404) break;
    for (const d of json?.data ?? []) if (d.image_uris) out.push({ set: d.set, cn: d.collector_number, setName: d.set_name, image: images(d.image_uris) });
    path = json?.has_more && typeof json.next_page === 'string' ? json.next_page.replace('https://api.scryfall.com', '') : null;
  }
  printingsOf.set(oracleId, out);
  return out;
}

/** A escolha do deck para a ficha (pelo oracleId do Scryfall). */
export const chosenToken = (deck: DeckData, oracleId: string) => deck.tokens?.find(t => t.oracleId === oracleId);

/** Grava (ou tira, com `print` nulo) a série escolhida para a ficha no deck. */
export function chooseToken(deck: DeckData, kind: TokenKind, print: Pick<TokenPrinting, 'set' | 'cn'> | null) {
  const rest = (deck.tokens ?? []).filter(t => t.oracleId !== kind.oracleId);
  const next = print ? [...rest, { oracleId: kind.oracleId, name: kind.name, colors: kind.colors, ...(kind.power !== undefined ? { power: kind.power, toughness: kind.toughness } : {}), set: print.set, cn: print.cn }] : rest;
  if (next.length) deck.tokens = next; else delete deck.tokens;
}
