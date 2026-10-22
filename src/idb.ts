/**
 * Banco do jogo no IndexedDB, separado do localStorage onde ficam os decks. Guarda as cartas do Scryfall (scryfall),
 * a gravação da última partida (gravacao) e os relatos esperando conexão para sair (relatos). Sem IndexedDB
 * (navegação privada, testes), open() devolve null e quem usa segue só com a memória da página.
 */
const DB_NAME = 'mesa-de-duelo';
export const STORES = { cards: 'scryfall', recording: 'gravacao', reports: 'relatos' } as const;

let opening: Promise<IDBDatabase | null> | null = null;
export function openDb(): Promise<IDBDatabase | null> {
  return opening ??= new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const request = indexedDB.open(DB_NAME, 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORES.cards)) db.createObjectStore(STORES.cards);
        if (!db.objectStoreNames.contains(STORES.recording)) db.createObjectStore(STORES.recording);
        if (!db.objectStoreNames.contains(STORES.reports)) db.createObjectStore(STORES.reports, { autoIncrement: true });
      };
      request.onsuccess = () => {
        // Outra aba com uma versão mais nova do jogo pede para atualizar o banco: esta solta a conexão.
        request.result.onversionchange = () => { request.result.close(); opening = null; };
        resolve(request.result);
      };
      request.onerror = request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}

/** Uma operação num armazém; qualquer falha vira fallback (o banco é opcional). */
export async function withStore<T>(store: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest | void, fallback: T): Promise<T> {
  const db = await openDb();
  if (!db) return fallback;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(store, mode);
      const request = run(tx.objectStore(store));
      tx.oncomplete = () => resolve(request ? request.result as T : fallback);
      tx.onerror = tx.onabort = () => resolve(fallback);
    } catch { resolve(fallback); }
  });
}
