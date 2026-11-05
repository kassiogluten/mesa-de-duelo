// Cache das cartas do Scryfall (memória e IndexedDB) e a busca por nome e por impressão.
import { PREFIXES } from './storage';
import * as cardStore from './cardStore';
import { scryfallFormat, type DeckFormat } from './decks';
import { request } from './scryfallApi';
import { faceView, images, isFaceAlias, legalityFresh, lookupName, printKey, slim, slimPt, validCard, withBasicArt, withPrinting, type Images, type PrintImages, type Printing, type ScryCard } from './scryfallCards';
import { preloadImages } from './scryfallImages';
export { legalityFresh, type Printing, type ScryCard } from './scryfallCards';
export { preloadImages } from './scryfallImages';

/**
 * As cartas do Scryfall que a página já conhece: na memória (`cacheGet` é síncrono) e no IndexedDB (`cardStore`),
 * com as imagens das impressões escolhidas nos decks. A forma de cada carta fica em `scryfallCards`; a fila de
 * pedidos, em `scryfallApi`.
 */
const memory = new Map<string, ScryCard>();
/** Chave antiga das cartas no localStorage: movidas para o IndexedDB ao abrir o jogo. */
const LEGACY_PREFIX = PREFIXES.scryfallLegacy;

/**
 * A carta pelo nome. Com a impressão escolhida no deck (série e número), a imagem é a dela assim que estiver no cache
 * (`fetchPrintings`), no lugar da padrão, da arte fixa dos básicos e da impressão em português; nome e texto continuam.
 */
export function cacheGet(name: string, print?: Partial<Printing> | null): ScryCard | null {
  const cached = memory.get(name.toLowerCase());
  if (!cached) return null;
  const printed = print?.set ? printings.get(printKey(name, { set: print.set, cn: print.cn })) : undefined;
  return printed?.image_uris ? withPrinting(cached, name, printed) : withBasicArt(cached);
}

const PRINT_PREFIX = 'print:';
const printings = new Map<string, PrintImages>();
/** Impressões que o Scryfall não achou nesta visita: não são pedidas de novo. */
const missingPrintings = new Set<string>();

/** Busca as imagens das impressões escolhidas que ainda não estão no cache. */
export async function fetchPrintings(entries: { name: string; set?: string; cn?: string }[]): Promise<void> {
  const todo = new Map<string, { name: string; print: Printing }>();
  for (const e of entries) {
    if (!e.set) continue;
    const print = { set: e.set, cn: e.cn }, key = printKey(e.name, print);
    if (!printings.has(key) && !missingPrintings.has(key)) todo.set(key, { name: e.name, print });
  }
  const list = [...todo.entries()];
  for (let i = 0; i < list.length; i += 75) {
    const chunk = list.slice(i, i + 75);
    const { json } = await request('/cards/collection', { identifiers: chunk.map(([, { name, print }]) =>
      print.cn ? { set: print.set, collector_number: print.cn } : { set: print.set, name: lookupName(name) }) });
    const found = new Set<string>();
    for (const d of json?.data ?? []) {
      const faces: any[] = Array.isArray(d.card_faces) ? d.card_faces : [];
      const faceImages = faces.map(f => images(f.image_uris));
      const p: PrintImages = { image_uris: images(d.image_uris) ?? faceImages[0], faceNames: faces.length ? faces.map(f => f.name) : undefined, faceImages: faceImages.some(Boolean) ? faceImages : undefined };
      // Pedida pelo número, a impressão volta com o nome da carta; pedida pelo nome, volta com o número.
      for (const [key, { name, print }] of chunk) {
        if (String(d.set).toLowerCase() !== print.set.toLowerCase()) continue;
        if (print.cn ? String(d.collector_number).toLowerCase() !== print.cn.toLowerCase() : lookupName(name).toLowerCase() !== String(d.name).split(' // ')[0]!.toLowerCase()) continue;
        printings.set(key, p); found.add(key); void cardStore.write(PRINT_PREFIX + key, p);
      }
    }
    for (const [key] of chunk) if (!found.has(key)) missingPrintings.add(key);
  }
}

/**
 * Carrega as cartas guardadas para a memória, antes das telas abrirem (cacheGet é síncrono). As cartas que ainda
 * estiverem no localStorage, de versões antigas, passam para o IndexedDB e saem de lá, liberando espaço para os decks.
 */
export async function loadCardCache() {
  try {
    const legacy: string[] = [];
    for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key?.startsWith(LEGACY_PREFIX)) legacy.push(key); }
    for (const key of legacy) {
      const name = key.slice(LEGACY_PREFIX.length);
      try {
        const c = JSON.parse(localStorage.getItem(key) ?? 'null');
        if (validCard(c) && !memory.has(name)) { memory.set(name, c); void cardStore.write(name, c); }
      } catch { /* entrada corrompida: só some */ }
      localStorage.removeItem(key);
    }
  } catch { /* localStorage bloqueado */ }
  // Versões antigas deixavam a magia preparada ocupar o nome de uma carta real (ver cachePut): esses registros
  // são descartados e a carta é buscada de novo pelo nome.
  for (const [name, c] of await cardStore.readAll<ScryCard>()) {
    if (name.startsWith(PRINT_PREFIX)) { if (c && typeof c === 'object') printings.set(name.slice(PRINT_PREFIX.length), c as PrintImages); continue; }
    if (validCard(c) && !memory.has(name) && !(c.layout === 'prepare' && isFaceAlias(name, c))) memory.set(name, c);
  }
}

/**
 * A carta pelo nome, para identificar a carta de um deck. A face preparada de outra carta (a "Exsanguinate" da
 * Stensian Sanguinist) não conta: o nome pode ser de uma carta real, e só o Scryfall diz qual é.
 */
function cachedCard(name: string): ScryCard | null {
  const c = cacheGet(name);
  const key = name.toLowerCase();
  return c && c.layout === 'prepare' && !!c.faceNames?.slice(1).some(face => face.toLowerCase() === key) ? null : c;
}

/**
 * Guarda a carta pelo nome completo e também pelo nome de cada face ("The Enigma Jewel", "Locus of Enlightenment").
 * A face nunca toma o lugar de uma carta de verdade com o mesmo nome: a magia preparada "Exsanguinate" da
 * Stensian Sanguinist não pode virar a Exsanguinate, senão o deck conta as duas como a mesma carta.
 */
export function cachePut(card: ScryCard) {
  memory.set(card.name.toLowerCase(), card);
  void cardStore.write(card.name.toLowerCase(), card);
  card.faceNames?.forEach((fn, i) => {
    if (!fn || fn.toLowerCase() === card.name.toLowerCase()) return;
    const existing = memory.get(fn.toLowerCase());
    if (existing && !isFaceAlias(fn.toLowerCase(), existing)) return;
    const view = faceView(card, i);
    memory.set(fn.toLowerCase(), view);
    void cardStore.write(fn.toLowerCase(), view);
  });
}

/**
 * Completa as cartas com a impressão em português, em lotes de buscas `lang:pt (!"A" or !"B" …)`.
 * Cartas sem tradução ficam marcadas para não serem procuradas de novo; falha de rede não marca nada.
 */
async function addPortuguese(cards: ScryCard[]) {
  // Registros guardados pelo nome de uma face apontam para a carta inteira: a tradução é gravada nela.
  const todo = [...new Map(cards.filter(c => !c.ptChecked).map(c => [c.name, cacheGet(c.name) ?? c])).values()];
  for (let i = 0; i < todo.length; i += 30) {
    const chunk = todo.slice(i, i + 30);
    const q = `lang:pt (${chunk.map(c => `!"${c.name.replace(/"/g, '')}"`).join(' or ')})`;
    try {
      const { status, json } = await request(`/cards/search?q=${encodeURIComponent(q)}&unique=cards`);
      const found = new Map<string, any>((status === 404 ? [] : json?.data ?? []).map((d: any) => [d.name.toLowerCase(), d]));
      for (const c of chunk) {
        const d = found.get(c.name.toLowerCase());
        if (d) c.pt = slimPt(d);
        c.ptChecked = true;
        cachePut(c);
      }
    } catch { /* sem rede: fica em inglês e tenta de novo depois */ }
  }
}

/** Busca cartas pelo nome exato. A chave do mapa é o nome em minúsculas. */
export async function fetchByNames(names: string[], refreshLegality = false): Promise<Map<string, ScryCard>> {
  const out = new Map<string, ScryCard>();
  const missing: string[] = [];
  for (const n of new Set(names)) {
    const c = cachedCard(n);
    if (c && (!refreshLegality || legalityFresh(c))) out.set(n.toLowerCase(), c); else missing.push(n);
  }
  for (let i = 0; i < missing.length; i += 75) {
    const chunk = missing.slice(i, i + 75);
    const { json } = await request('/cards/collection', { identifiers: chunk.map(name => ({ name: lookupName(name) })) });
    for (const d of json?.data ?? []) {
      const s = slim(d);
      cachePut(s);
      out.set(s.name.toLowerCase(), s);
    }
  }
  await addPortuguese([...out.values()]);
  return out;
}

/**
 * Endereços das imagens que a mesa mostra para estas cartas: cada face, na impressão em português
 * quando ela tem scan (a mesma escolha de `sc.pt?.image_uris ?? sc.image_uris`). Só olha o cache.
 */
export function cardImageUrls(names: string[], sizes: (keyof Images)[] = ['small', 'normal']): string[] {
  const urls = new Set<string>();
  for (const n of new Set(names)) {
    const c = cacheGet(n);
    if (!c) continue;
    const faces = Math.max(1, c.faceNames?.length ?? 0);
    for (let i = 0; i < faces; i++) {
      const u = (c.pt?.faceImages?.[i] ?? c.pt?.image_uris) ?? (c.faceImages?.[i] ?? c.image_uris);
      for (const s of sizes) if (u?.[s]) urls.add(u[s]!);
    }
  }
  return [...urls];
}

/** Acrescenta o nome, o texto e a imagem em português às cartas que ainda não procuraram a tradução. */
export async function translateCards(cards: ScryCard[]): Promise<void> { await addPortuguese(cards); }

/** Busca os dados (com a tradução) e pré-carrega as imagens das cartas de um deck recém-importado. */
export async function preloadDeckImages(names: string[], sizes?: (keyof Images)[]): Promise<number> {
  await fetchByNames(names);
  return preloadImages(cardImageUrls(names, sizes));
}

/** `translate: false` pula a busca da impressão em português (para listas grandes que a mesa só vai filtrar; veja `translateCards`). */
export async function searchCards(q: string, page = 1, format?: DeckFormat, { translate = true } = {}): Promise<{ cards: ScryCard[]; hasMore: boolean; total: number }> {
  const legality = scryfallFormat(format);
  if (legality) q = `(${q}) f:${legality}`;
  // Multilíngue para aceitar também o nome em português ("Golpe Relampejante").
  const { status, json } = await request(`/cards/search?q=${encodeURIComponent(q)}&unique=cards&order=name&include_multilingual=true&page=${page}`);
  if (status === 404) return { cards: [], hasMore: false, total: 0 };
  const cards: ScryCard[] = (json.data ?? []).map(slim);
  cards.forEach(cachePut);
  if (translate) await addPortuguese(cards);
  return { cards: cards.map(withBasicArt), hasMore: !!json.has_more, total: json.total_cards ?? cards.length };
}

/** Nomes de carta (em inglês) que começam como o texto digitado, para sugerir enquanto se escreve. */
export async function autocompleteNames(q: string): Promise<string[]> {
  if (q.trim().length < 2) return [];
  const { status, json } = await request(`/cards/autocomplete?q=${encodeURIComponent(q.trim())}`);
  return status === 404 ? [] : (json?.data ?? []).filter((n: unknown): n is string => typeof n === 'string');
}

/**
 * Confere nomes digitados ou colados contra o Scryfall e devolve o nome oficial (em inglês) de cada um.
 * Aceita a face da frente de cartas de duas faces e, para o que não achar, tenta o nome impresso
 * em outros idiomas (ex.: "Golpe Relampejante"). A chave do mapa é o nome de entrada em minúsculas.
 * Um nome impresso que serve para mais de uma carta ("Expulsar" é Cast Out e Expel) não é resolvido:
 * vai para `ambiguous` com as opções, para o jogador escolher em vez de ficar com a primeira.
 */
export async function resolveCardNames(names: string[]): Promise<{ found: Map<string, string>; missing: string[]; ambiguous: { name: string; options: string[] }[] }> {
  const found = new Map<string, string>();
  const todo: string[] = [];
  for (const n of new Set(names)) {
    const c = cachedCard(n);
    if (c) found.set(n.toLowerCase(), c.name); else todo.push(n);
  }
  for (let i = 0; i < todo.length; i += 75) {
    const chunk = todo.slice(i, i + 75);
    const { json } = await request('/cards/collection', { identifiers: chunk.map(name => ({ name: lookupName(name) })) });
    const byName = new Map<string, string>();
    for (const d of json?.data ?? []) {
      const s = slim(d);
      cachePut(s);
      byName.set(s.name.toLowerCase(), s.name);
    }
    for (const d of json?.data ?? []) for (const f of d.card_faces ?? []) if (f.name && !byName.has(String(f.name).toLowerCase())) byName.set(String(f.name).toLowerCase(), d.name);
    for (const n of chunk) { const hit = byName.get(n.toLowerCase()); if (hit) found.set(n.toLowerCase(), hit); }
  }
  const missing: string[] = [];
  const ambiguous: { name: string; options: string[] }[] = [];
  for (const n of todo.filter(n => !found.has(n.toLowerCase()))) {
    try {
      const r = await searchCards(`!"${n.replace(/"/g, '')}"`);
      const options = [...new Set(r.cards.map(c => c.name))];
      if (options.length === 1) found.set(n.toLowerCase(), options[0]!);
      else if (options.length) ambiguous.push({ name: n, options });
      else missing.push(n);
    } catch { missing.push(n); }
  }
  return { found, missing, ambiguous };
}
