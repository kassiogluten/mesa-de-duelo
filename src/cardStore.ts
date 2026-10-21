/**
 * Armazém das cartas do Scryfall no IndexedDB, separado do localStorage onde ficam os decks: o cache de cartas pode
 * crescer sem disputar o espaço (cerca de 5 MB) que os decks usam. Sem IndexedDB (navegação privada, testes), tudo
 * vira no-op e as cartas ficam só na memória da página.
 */
const DB_NAME = 'mesa-de-duelo';
const STORE = 'scryfall';

let opening: Promise<IDBDatabase | null> | null = null;
function open(): Promise<IDBDatabase | null> {
  return opening ??= new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}

/** Todas as cartas guardadas, como pares [nome em minúsculas, carta]. */
export async function readAll<T>(): Promise<[string, T][]> {
  const db = await open();
  if (!db) return [];
  return new Promise(resolve => {
    try {
      const store = db.transaction(STORE, 'readonly').objectStore(STORE);
      const keys = store.getAllKeys(), values = store.getAll();
      values.onsuccess = () => resolve((keys.result ?? []).map((key, i) => [String(key), values.result[i] as T]));
      values.onerror = () => resolve([]);
    } catch { resolve([]); }
  });
}

let pending = new Map<string, unknown>();
let flushing: Promise<void> | null = null;
/** Grava em lote: várias cartas de uma mesma busca viram uma transação só. */
export function write(key: string, value: unknown) {
  pending.set(key, value);
  flushing ??= Promise.resolve().then(flush);
  return flushing;
}
async function flush() {
  const batch = pending;
  pending = new Map();
  flushing = null;
  const db = await open();
  if (!db || !batch.size) return;
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const [key, value] of batch) store.put(value, key);
      tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
    } catch { resolve(); }
  });
}
