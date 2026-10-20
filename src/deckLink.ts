/**
 * Importar deck por link: reconhece links públicos do Moxfield e do Archidekt e o deck médio de um comandante no
 * EDHREC, e converte a resposta da API (buscada pela ponte, por causa do CORS) numa lista de texto que passa pela
 * mesma revisão da importação colada.
 */
export type DeckSite = 'moxfield' | 'archidekt' | 'edhrec';
export interface DeckLink { site: DeckSite; id: string }
/** De onde veio uma lista do EDHREC, para mostrar na revisão. */
export interface DeckOrigin { site: 'edhrec'; label: string; url: string; date: string; decks: number }

const EDHREC_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/;

/**
 * Slug do EDHREC a partir do nome em inglês: só a face da frente, sem acentos nem pontuação, espaços e hífens
 * viram um hífen. Parceiros e antecedentes entram na mesma ordem; se o EDHREC usar a ordem inversa, a ponte segue
 * o redirecionamento dele. Vazio quando não sobra nada (nome em outro alfabeto, por exemplo).
 */
export function edhrecSlug(commanders: string[]): string {
  const one = (name: string) => name.split(/\s*\/\/\s*/)[0].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s-]+/g, '-').replace(/^-+|-+$/g, '');
  const parts = commanders.map(one).filter(Boolean);
  const slug = parts.length === commanders.length ? parts.join('-') : '';
  return EDHREC_SLUG.test(slug) && slug.length <= 160 ? slug : '';
}

/** Só um link (com ou sem https, www, slug ou parâmetros); null para qualquer outro texto. */
export function parseDeckLink(text: string): DeckLink | null {
  const value = text.trim();
  if (!value || /\s/.test(value)) return null;
  const moxfield = value.match(/^(?:https?:\/\/)?(?:www\.)?moxfield\.com\/decks\/([A-Za-z0-9_-]{4,64})(?:[/?#].*)?$/i);
  if (moxfield) return { site: 'moxfield', id: moxfield[1] };
  const archidekt = value.match(/^(?:https?:\/\/)?(?:www\.)?archidekt\.com\/(?:api\/)?decks\/(\d{1,12})(?:[/?#].*)?$/i);
  if (archidekt) return { site: 'archidekt', id: archidekt[1] };
  const edhrec = value.match(/^(?:https?:\/\/)?(?:www\.)?edhrec\.com\/(?:average-decks|commanders)\/([a-z0-9-]{1,120})(?:\/([a-z0-9-]{1,40}))?(?:[/?#].*)?$/i);
  if (edhrec) {
    const id = [edhrec[1], edhrec[2]].filter(Boolean).join('/').toLowerCase();
    if (EDHREC_SLUG.test(id)) return { site: 'edhrec', id };
  }
  return null;
}

type Entry = { name: string; count: number };
const line = (e: Entry) => `${e.count} ${e.name}`;
const section = (title: string, entries: Entry[]) => entries.length ? `${title}\n${entries.map(line).join('\n')}` : '';
function add(list: Entry[], name: unknown, count: unknown) {
  const n = typeof name === 'string' ? name.trim() : '';
  const c = typeof count === 'number' && Number.isSafeInteger(count) && count > 0 ? count : 0;
  if (!n || !c) return;
  const same = list.find(e => e.name === n);
  if (same) same.count += c; else list.push({ name: n, count: c });
}

/** Moxfield v3: boards.{commanders, mainboard, sideboard, companions}.cards → { quantity, card.name }. */
function fromMoxfield(json: any) {
  const commanders: Entry[] = [], main: Entry[] = [], side: Entry[] = [];
  const board = (key: string, into: Entry[]) => {
    for (const item of Object.values<any>(json?.boards?.[key]?.cards ?? {})) add(into, item?.card?.name, item?.quantity);
  };
  board('commanders', commanders); board('mainboard', main); board('sideboard', side); board('companions', side);
  return { name: typeof json?.name === 'string' ? json.name : '', commanders, main, side };
}

/** Archidekt: cards[] → { quantity, card.oracleCard.name, categories }; categorias fora do deck (Maybeboard) ficam de fora. */
function fromArchidekt(json: any) {
  const commanders: Entry[] = [], main: Entry[] = [], side: Entry[] = [];
  const outside = new Set<string>((json?.categories ?? []).filter((c: any) => c?.includedInDeck === false).map((c: any) => String(c.name).toLowerCase()));
  for (const name of ['maybeboard', 'considering']) outside.add(name);
  for (const item of json?.cards ?? []) {
    const categories: string[] = (item?.categories ?? []).map((c: unknown) => String(c).toLowerCase());
    const name = item?.card?.oracleCard?.name ?? item?.card?.name;
    if (categories.includes('commander')) add(commanders, name, item?.quantity);
    else if (categories.includes('sideboard')) add(side, name, item?.quantity);
    else if (categories.length && categories.every(c => outside.has(c))) continue;
    else add(main, name, item?.quantity);
  }
  return { name: typeof json?.name === 'string' ? json.name : '', commanders, main, side };
}

/**
 * EDHREC, deck médio: deck.commander (nomes) e deck.cards agrupado por tipo, cada carta como par [nome, quantidade];
 * um grupo pode ter subgrupos (Land → Basics). A data é a do deck publicado mais recente da amostra.
 */
function fromEdhrec(json: any, slug: string) {
  const commanders: Entry[] = [], main: Entry[] = [];
  const named = Array.isArray(json?.deck?.commander) ? json.deck.commander : [];
  for (const name of named) add(commanders, name, 1);
  const isCommander = (name: unknown) => typeof name === 'string' && commanders.some(c => c.name === name.trim());
  const walk = (group: unknown, depth: number) => {
    if (Array.isArray(group)) {
      for (const pair of group) if (Array.isArray(pair) && !isCommander(pair[0])) add(main, pair[0], pair[1]);
    } else if (group && typeof group === 'object' && depth < 3) for (const inner of Object.values(group)) walk(inner, depth + 1);
  };
  walk(json?.deck?.cards, 0);
  const dates = Object.keys(json?.savedate_counts ?? {}).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const decks = Number(json?.container?.json_dict?.card?.num_decks);
  const label = commanders.map(c => c.name).join(' + ');
  const origin: DeckOrigin = { site: 'edhrec', label, url: `https://edhrec.com/average-decks/${slug}`, date: dates.at(-1) ?? '', decks: Number.isSafeInteger(decks) && decks > 0 ? decks : 0 };
  const variant = slug.includes('/') ? ` (${slug.split('/')[1].replace(/-/g, ' ')})` : '';
  return { name: label ? `${label}${variant} · deck médio` : '', commanders, main, side: [] as Entry[], origin };
}

const dateBR = (iso: string) => iso ? iso.split('-').reverse().join('/') : '';

/** Frase curta sobre a origem de uma lista do EDHREC (vai também como comentário no topo da lista salva). */
export function deckOriginText(origin: DeckOrigin, short = false): string {
  const parts = [short ? origin.label : `deck médio do EDHREC para ${origin.label}`];
  if (origin.decks) parts.push(`${origin.decks.toLocaleString('pt-BR')} decks publicados`);
  if (origin.date) parts.push(`dados até ${dateBR(origin.date)}`);
  return parts.join(', ');
}

/** Lista em texto (formato de exportação do Moxfield) e nome do deck de origem. No EDHREC, `id` é o slug. */
export function deckLinkToList(site: DeckSite, body: string, id = ''): { name: string; text: string; origin?: DeckOrigin } {
  let json: unknown;
  try { json = JSON.parse(body); } catch { throw new Error(site === 'edhrec' ? 'O EDHREC devolveu uma resposta que não é um deck.' : 'O site devolveu uma resposta que não é um deck.'); }
  const deck = site === 'moxfield' ? fromMoxfield(json) : site === 'archidekt' ? fromArchidekt(json) : fromEdhrec(json, id);
  if (!deck.main.length && !deck.commanders.length) throw new Error(site === 'edhrec' ? 'O EDHREC devolveu um deck médio vazio.' : 'O deck está vazio ou é privado.');
  const origin: DeckOrigin | undefined = 'origin' in deck ? (deck as { origin: DeckOrigin }).origin : undefined;
  const header = origin ? `// ${deckOriginText(origin)}\n// ${origin.url}\n\n` : '';
  const text = header + [section('Commander', deck.commanders), section('Deck', deck.main), section('Sideboard', deck.side)].filter(Boolean).join('\n\n');
  return { name: deck.name.trim(), text, ...(origin ? { origin } : {}) };
}
