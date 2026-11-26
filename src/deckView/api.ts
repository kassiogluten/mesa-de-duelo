// Pedidos da tela de detalhes do deck ao servidor (/api/deck/ e /api/conta/publicos), com as artes e as funções guardadas no aparelho.
import { bridgeHttpUrl } from '../forge/client';
import { contaFetch } from '../conta/session';
import { withStore, STORES } from '../idb';
import type { DeckData } from '../decks';
import type { Images } from '../scryfallCards';

/** Uma impressão da carta que a partida mostra, como o servidor manda (CardPrints.java). */
export interface CardPrint {
  set: string; cn: string; setName?: string; released?: string; rarity?: string; artist?: string;
  border?: string; frame?: string[]; fullArt?: boolean; promo?: boolean; finishes?: string[];
  image: Images; faces?: { name?: string; image: Images }[];
}
/** O deck do link /d/CÓDIGO e quem o publicou. */
export interface PublicDeck { codigo: string; autor?: string; deck: DeckData; publicadoEm?: string; atualizadoEm?: string }

/** O servidor guarda as artes por 7 dias; o aparelho, pelo mesmo tempo, para nem perguntar a ele de novo. */
const TTL = 7 * 86_400_000;
const TIMEOUT = 25_000;
/** O endereço da rota no servidor; a query (?a=b) vai depois, porque bridgeHttpUrl a descarta. */
const api = (path: string) => bridgeHttpUrl(`/api/deck/${path}`);

interface Saved<T> { at: number; value: T }
const memory = new Map<string, Saved<unknown>>();
async function cached<T>(key: string): Promise<T | undefined> {
  const hit = memory.get(key) ?? await withStore<Saved<T> | undefined>(STORES.deckInfo, 'readonly', s => s.get(key), undefined);
  if (!hit || Date.now() - hit.at > TTL) return undefined;
  memory.set(key, hit);
  return hit.value as T;
}
function remember(key: string, value: unknown) {
  const saved = { at: Date.now(), value };
  memory.set(key, saved);
  void withStore(STORES.deckInfo, 'readwrite', s => s.put(saved, key), undefined);
}

async function errorText(res: Response, fallback: string) {
  const json = await res.json().catch(() => null) as { error?: string } | null;
  return json?.error ?? fallback;
}
async function getJson<T>(url: string, init: RequestInit, fallback: string): Promise<T> {
  let res: Response;
  try { res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) }); }
  catch { throw new Error('Sem conexão com o servidor. Tente de novo quando a internet voltar.'); }
  if (!res.ok) throw new Error(await errorText(res, fallback));
  return await res.json() as T;
}

/** Pedidos em andamento: abrir a troca de arte duas vezes seguidas não pede duas vezes. */
const inFlight = new Map<string, Promise<unknown>>();
function once<T>(key: string, run: () => Promise<T>): Promise<T> {
  const running = inFlight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const p = run().finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

/** As impressões da carta que a partida mostra: do aparelho, ou do servidor (que só vai ao Scryfall uma vez por semana). */
export function cardPrints(oracleId: string, name: string): Promise<CardPrint[]> {
  const key = `prints:${oracleId}`;
  return once(key, async () => {
    const saved = await cached<CardPrint[]>(key);
    if (saved) return saved;
    const json = await getJson<{ impressoes: CardPrint[] }>(`${api('impressoes')}?carta=${encodeURIComponent(oracleId)}&nome=${encodeURIComponent(name)}`, {},
      'Não foi possível buscar as artes desta carta agora.');
    remember(key, json.impressoes);
    return json.impressoes;
  });
}

/** As tags de função do Tagger de cada carta (oracle_id → tags); as que já estão no aparelho não vão ao servidor. */
export async function cardFunctions(oracleIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const missing: string[] = [];
  for (const id of new Set(oracleIds)) {
    const saved = await cached<string[]>(`fn:${id}`);
    if (saved) out.set(id, saved); else missing.push(id);
  }
  for (let i = 0; i < missing.length; i += 300) {
    const chunk = missing.slice(i, i + 300);
    // text/plain não pede a confirmação prévia do CORS no `npm run dev`, em que o servidor fica em outra porta.
    const json = await getJson<{ funcoes: Record<string, string[]> }>(api('funcoes'), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ cartas: chunk }) },
      'Não foi possível ler as funções das cartas agora.');
    for (const id of chunk) {
      const tags = json.funcoes[id] ?? [];
      out.set(id, tags);
      remember(`fn:${id}`, tags);
    }
  }
  return out;
}

/** O deck do link /d/CÓDIGO; o erro já vem na frase para o jogador. */
export const publicDeck = (code: string) =>
  getJson<PublicDeck>(api(`publico/${encodeURIComponent(code)}`), {}, 'Não foi possível abrir este deck agora.');

/** O código só tem letras e números sem os parecidos (0/O, 1/l/I), com 8 letras: o resto nem vai ao servidor. */
export const PUBLIC_CODE = /^[2-9a-km-np-zA-HJ-NP-Z]{8}$/;

async function conta<T>(path: string, init: RequestInit, fallback: string): Promise<T> {
  let res: Response;
  try { res = await contaFetch(path, init); }
  catch { throw new Error('Sem conexão com o servidor. Tente de novo quando a internet voltar.'); }
  if (res.status === 401) throw new Error('Entre de novo com sua conta para compartilhar.');
  if (!res.ok) throw new Error(await errorText(res, fallback));
  return await res.json() as T;
}
/** Os decks da conta com link público: id do deck → código. */
export const myPublicDecks = async () => new Map(Object.entries((await conta<{ publicos: Record<string, string> }>('publicos', {}, 'Não foi possível ler seus decks compartilhados.')).publicos));
/** Publica o deck (que precisa já estar na conta) e devolve o código do link. */
export const publishDeck = async (deckId: string) => (await conta<{ codigo: string }>(`publicos/${encodeURIComponent(deckId)}`, { method: 'POST' }, 'Não foi possível compartilhar o deck agora.')).codigo;
export const unpublishDeck = (deckId: string) => conta<unknown>(`publicos/${encodeURIComponent(deckId)}`, { method: 'DELETE' }, 'Não foi possível parar de compartilhar agora.');
/** O link que se manda para os outros. */
export const publicLink = (code: string, origin = location.origin) => `${origin}/d/${code}`;
