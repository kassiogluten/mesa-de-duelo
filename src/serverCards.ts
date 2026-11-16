// Dados das cartas pelo cache do servidor (/api/cartas), antes do Scryfall: cada carta com a impressão em português.
import { bridgeHttpUrl } from './forge/client';
import { lookupName } from './scryfallCards';

/**
 * O servidor guarda, para todos, cada carta já pedida e a impressão em português dela (CardDataCache.java), e responde
 * no formato do Scryfall, com `pt` (a impressão em português, ou null se não há) e `atualizada` (quando as legalidades
 * foram lidas). Os nomes que o Scryfall não conhece vêm em `faltam` e ficam de fora. O que ele não tem agora vem em
 * `depois`, e a mesa pede direto ao Scryfall, como antes; se ele não responde, tudo vai para `depois` e a mesa fica um
 * minuto sem perguntar a ele.
 */
const MAX = 200;
const TIMEOUT = 25_000;
const PAUSE = 60_000;
let pausedUntil = 0;

export interface ServerCards {
  /** Cartas no formato do Scryfall, com `pt` e `atualizada`. */
  data: any[];
  /** Nomes (o de busca, em minúsculas) para pedir direto ao Scryfall. */
  later: Set<string>;
}

/** O nome como o servidor o recebe e devolve em `depois`. */
export const serverKey = (name: string) => lookupName(name).trim().toLowerCase();
/** O mesmo filtro do servidor: nome que ele recusaria vai direto ao Scryfall. */
const accepted = (name: string) => { const n = lookupName(name).trim(); return n.length > 0 && n.length <= 150 && !/[\u0000-\u001f\u007f-\u009f]/.test(n); };

export async function serverCards(names: string[], url = bridgeHttpUrl('/api/cartas')): Promise<ServerCards> {
  const out: ServerCards = { data: [], later: new Set() };
  const asked = [...new Set(names.filter(accepted).map(n => lookupName(n).trim()))];
  for (const n of names) if (!accepted(n)) out.later.add(serverKey(n));
  for (let i = 0; i < asked.length; i += MAX) {
    const chunk = asked.slice(i, i + MAX);
    if (Date.now() < pausedUntil) { chunk.forEach(n => out.later.add(n.toLowerCase())); continue; }
    try {
      // text/plain não pede a confirmação prévia do CORS no `npm run dev`, em que o servidor fica em outra porta.
      const res = await fetch(url, { method: 'POST', body: JSON.stringify({ nomes: chunk }), headers: { 'Content-Type': 'text/plain' }, signal: AbortSignal.timeout(TIMEOUT) });
      const json = res.ok ? await res.json() : null;
      if (!Array.isArray(json?.cartas)) throw new Error(`servidor respondeu ${res.status}`);
      out.data.push(...json.cartas.filter((d: any) => typeof d?.name === 'string'));
      for (const n of json.depois ?? []) if (typeof n === 'string') out.later.add(n);
    } catch {
      pausedUntil = Date.now() + PAUSE;
      chunk.forEach(n => out.later.add(n.toLowerCase()));
    }
  }
  return out;
}
