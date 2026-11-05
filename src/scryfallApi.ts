/**
 * Cliente mínimo da API do Scryfall (https://scryfall.com/docs/api).
 * Respeita o intervalo pedido pela API entre requisições (uma fila só para a página inteira).
 */
export const API = 'https://api.scryfall.com';
const MIN_INTERVAL = 110;

let queue: Promise<unknown> = Promise.resolve();
let lastAt = 0;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastAt + MIN_INTERVAL - Date.now();
    if (wait > 0) await sleep(wait);
    lastAt = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function request(path: string, body?: unknown): Promise<{ status: number; json: any }> {
  return throttled(async () => {
    const res = await fetch(API + path, body === undefined
      ? { headers: { Accept: 'application/json' } }
      : { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    if (!res.ok && res.status !== 404) throw new Error(json?.details ?? `Scryfall respondeu ${res.status}`);
    return { status: res.status, json };
  });
}
