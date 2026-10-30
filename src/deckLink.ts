/**
 * Importar deck por link: reconhece links públicos do Moxfield e do Archidekt e converte a resposta da API (buscada
 * pela ponte, por causa do CORS) numa lista de texto que passa pela mesma revisão da importação colada.
 */
export type DeckSite = 'moxfield' | 'archidekt';
export interface DeckLink { site: DeckSite; id: string }
/** Só um link (com ou sem https, www, slug ou parâmetros); null para qualquer outro texto. */
export function parseDeckLink(text: string): DeckLink | null {
  const value = text.trim();
  if (!value || /\s/.test(value)) return null;
  const moxfield = value.match(/^(?:https?:\/\/)?(?:www\.)?moxfield\.com\/decks\/([A-Za-z0-9_-]{4,64})(?:[/?#].*)?$/i);
  if (moxfield) return { site: 'moxfield', id: moxfield[1] };
  const archidekt = value.match(/^(?:https?:\/\/)?(?:www\.)?archidekt\.com\/(?:api\/)?decks\/(\d{1,12})(?:[/?#].*)?$/i);
  if (archidekt) return { site: 'archidekt', id: archidekt[1] };
  return null;
}

import type { Bracket } from './brackets';

type Entry = { name: string; count: number; set?: string; cn?: string };
const line = (e: Entry) => `${e.count} ${e.name}${e.set ? ` (${e.set.toUpperCase()})${e.cn ? ` ${e.cn}` : ''}` : ''}`;
const section = (title: string, entries: Entry[]) => entries.length ? `${title}\n${entries.map(line).join('\n')}` : '';
/** A série (código do Scryfall) e o número de coleção, só quando parecem um código de verdade. */
function printing(set: unknown, cn: unknown): { set?: string; cn?: string } {
  if (typeof set !== 'string' || !/^[A-Za-z0-9]{2,6}$/.test(set)) return {};
  return { set: set.toLowerCase(), ...(typeof cn === 'string' && /^[\w★-]+$/.test(cn) ? { cn } : {}) };
}
function add(list: Entry[], name: unknown, count: unknown, print: { set?: string; cn?: string } = {}) {
  const n = typeof name === 'string' ? name.trim() : '';
  const c = typeof count === 'number' && Number.isSafeInteger(count) && count > 0 ? count : 0;
  if (!n || !c) return;
  const same = list.find(e => e.name === n && e.set === print.set && e.cn === print.cn);
  if (same) same.count += c; else list.push({ name: n, count: c, ...print });
}

/** Moxfield v3: boards.{commanders, mainboard, sideboard, companions}.cards → { quantity, card.name, card.set, card.cn }. */
function fromMoxfield(json: any) {
  const commanders: Entry[] = [], main: Entry[] = [], side: Entry[] = [];
  const board = (key: string, into: Entry[]) => {
    for (const item of Object.values<any>(json?.boards?.[key]?.cards ?? {})) add(into, item?.card?.name, item?.quantity, printing(item?.card?.set, item?.card?.cn));
  };
  board('commanders', commanders); board('mainboard', main); board('sideboard', side); board('companions', side);
  return { name: typeof json?.name === 'string' ? json.name : '', commanders, main, side };
}

/**
 * Archidekt: cards[] → { quantity, card.oracleCard.name, card.edition.editioncode, card.collectorNumber, categories };
 * categorias fora do deck (Maybeboard) ficam de fora.
 */
function fromArchidekt(json: any) {
  const commanders: Entry[] = [], main: Entry[] = [], side: Entry[] = [];
  const outside = new Set<string>((json?.categories ?? []).filter((c: any) => c?.includedInDeck === false).map((c: any) => String(c.name).toLowerCase()));
  for (const name of ['maybeboard', 'considering']) outside.add(name);
  for (const item of json?.cards ?? []) {
    const categories: string[] = (item?.categories ?? []).map((c: unknown) => String(c).toLowerCase());
    const name = item?.card?.oracleCard?.name ?? item?.card?.name, print = printing(item?.card?.edition?.editioncode, item?.card?.collectorNumber);
    if (categories.includes('commander')) add(commanders, name, item?.quantity, print);
    else if (categories.includes('sideboard')) add(side, name, item?.quantity, print);
    else if (categories.length && categories.every(c => outside.has(c))) continue;
    else add(main, name, item?.quantity, print);
  }
  return { name: typeof json?.name === 'string' ? json.name : '', commanders, main, side };
}

/** Lista em texto (formato de exportação do Moxfield), nome do deck de origem e, do Archidekt, o bracket do dono. */
export function deckLinkToList(site: DeckSite, body: string): { name: string; text: string; bracket?: Bracket } {
  let json: unknown;
  try { json = JSON.parse(body); } catch { throw new Error('O site devolveu uma resposta que não é um deck.'); }
  const deck = site === 'moxfield' ? fromMoxfield(json) : fromArchidekt(json);
  if (!deck.main.length && !deck.commanders.length) throw new Error('O deck está vazio ou é privado.');
  const text = [section('Commander', deck.commanders), section('Deck', deck.main), section('Sideboard', deck.side)].filter(Boolean).join('\n\n');
  // O bracket que o dono deu ao deck no Archidekt (edhBracket, null quando ele não escolheu).
  const bracket = site === 'archidekt' ? (json as { edhBracket?: unknown } | null)?.edhBracket : undefined;
  return { name: deck.name.trim(), text, ...(typeof bracket === 'number' && [1, 2, 3, 4, 5].includes(bracket) ? { bracket: bracket as Bracket } : {}) };
}
