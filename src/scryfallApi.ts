/**
 * Cliente mínimo da API do Scryfall (https://scryfall.com/docs/api).
 * Respeita o intervalo pedido pela API entre requisições (uma fila só para a página inteira).
 */
export const API = 'https://api.scryfall.com';
const MIN_INTERVAL = 110;
/**
 * Busca, nome, aleatória e coleção aceitam só 2 por segundo (https://scryfall.com/docs/api/rate-limits).
 * Passar disso dá 429 sem cabeçalho CORS, que o navegador mostra como erro de CORS.
 */
const HEAVY_INTERVAL = 550;
const HEAVY = /^\/cards\/(search|named|random|collection)\b/;

let queue: Promise<unknown> = Promise.resolve();
let lastAt = 0;
let lastHeavyAt = 0;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function throttled<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const heavy = HEAVY.test(path);
  const run = queue.then(async () => {
    const wait = Math.max(lastAt + MIN_INTERVAL, heavy ? lastHeavyAt + HEAVY_INTERVAL : 0) - Date.now();
    if (wait > 0) await sleep(wait);
    lastAt = Date.now();
    if (heavy) lastHeavyAt = lastAt;
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function request(path: string, body?: unknown): Promise<{ status: number; json: any }> {
  return throttled(path, async () => {
    const res = await fetch(API + path, body === undefined
      ? { headers: { Accept: 'application/json' } }
      : { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    if (!res.ok && res.status !== 404) throw new Error(json?.details ?? `Scryfall respondeu ${res.status}`);
    return { status: res.status, json };
  });
}
