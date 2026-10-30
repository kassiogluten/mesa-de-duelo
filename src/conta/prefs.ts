/**
 * Preferências da mesa que acompanham a conta (docs/spec-login-google.md, fase 3). Cada tela continua lendo e
 * gravando a sua chave no localStorage como antes; a sincronia compara os valores com os da última vez que
 * sincronizou e envia só o que mudou aqui. Vale a última gravação, sem pergunta.
 */
export const SYNCED_PREFS = ['mesa:audio:v1', 'mesa:turnNotice', 'mesa:pace', 'mesa:passLevel', 'mesa:passResponses', 'mesa:autoPassNoActions', 'mesa:opponentStops', 'mesa:choiceSort', 'mesa:name'] as const;
export const NAME_KEY = 'mesa:name';

/** Valor de cada chave; null quando ela não existe. */
export type Prefs = Record<string, string | null>;

export function readPrefs(storage: Pick<Storage, 'getItem'> = localStorage): Prefs {
  const prefs: Prefs = {};
  for (const key of SYNCED_PREFS) { try { prefs[key] = storage.getItem(key); } catch { prefs[key] = null; } }
  return prefs;
}

export function writePrefs(values: Prefs, storage: Pick<Storage, 'setItem' | 'removeItem'> = localStorage) {
  for (const [key, value] of Object.entries(values)) {
    try { if (value === null) storage.removeItem(key); else storage.setItem(key, value); } catch { /* sem armazenamento */ }
  }
}

/** O que mudou aqui desde a última sincronia. */
export function localChanges(local: Prefs, synced: Prefs): Prefs {
  const out: Prefs = {};
  for (const key of SYNCED_PREFS) if ((local[key] ?? null) !== (synced[key] ?? null)) out[key] = local[key] ?? null;
  return out;
}

export interface PrefsMerge {
  /** Gravar aqui (veio de outro aparelho). */
  apply: Prefs;
  /** A nova foto do que está sincronizado. */
  synced: Prefs;
}

/** O que veio da conta entra aqui, a não ser nas chaves que mudaram aqui e ainda não subiram: essas sobem depois. */
export function mergeRemote(local: Prefs, synced: Prefs, remote: Prefs): PrefsMerge {
  const mine = localChanges(local, synced);
  const apply: Prefs = {}, next: Prefs = { ...synced };
  for (const [key, value] of Object.entries(remote)) {
    if (!(SYNCED_PREFS as readonly string[]).includes(key)) continue;
    next[key] = value;
    if (!(key in mine) && (local[key] ?? null) !== value) apply[key] = value;
  }
  return { apply, synced: next };
}

/**
 * Primeira vez desta conta neste navegador: o que a conta já tem vale aqui; o que ela não tem sobe daqui. Sem nome
 * na mesa dos dois lados, o apelido da conta (o primeiro nome do Google) vira o nome.
 */
export function firstPrefs(local: Prefs, remote: Prefs, nickname: string | undefined): PrefsMerge {
  const apply: Prefs = {}, synced: Prefs = {};
  for (const key of SYNCED_PREFS) {
    if (key in remote) { synced[key] = remote[key]; if ((local[key] ?? null) !== remote[key]) apply[key] = remote[key]; }
    else synced[key] = null;
  }
  const name = (key: string) => ((key in apply ? apply[key] : local[key]) ?? '').trim();
  if (!name(NAME_KEY) && nickname?.trim()) apply[NAME_KEY] = nickname.trim();
  return { apply, synced };
}
