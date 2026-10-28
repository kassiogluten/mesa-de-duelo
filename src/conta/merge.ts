import type { DeckData, DeckEntry } from '../decks';

/**
 * Regras de junção dos decks da conta com os do navegador (docs/spec-login-google.md), sem localStorage nem rede:
 * quem chama decide o que gravar e o que enviar. A regra de ouro é não perder deck: na dúvida, ficam os dois.
 */

export const COPY_SUFFIX = ' (deste aparelho)';

const entries = (list: DeckEntry[] | undefined) => {
  const counts = new Map<string, number>();
  for (const e of list ?? []) { const key = e.name.trim().toLowerCase(); counts.set(key, (counts.get(key) ?? 0) + e.count); }
  return [...counts].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, count]) => `${count} ${name}`).join('|');
};

/** O que o jogador vê do deck: nome, formato e cartas, sem id, datas nem histórico de importação. */
export function deckFingerprint(d: DeckData): string {
  return [d.name.trim(), d.format ?? '', entries(d.cards), entries(d.sideboard), entries(d.commanders)].join('#');
}
export const sameDeck = (a: DeckData, b: DeckData) => deckFingerprint(a) === deckFingerprint(b);

/** A versão deste navegador que ficou de lado num conflito: outro id e o nome marcado. */
export function deviceCopy(deck: DeckData, id: string, now: string): DeckData {
  const name = deck.name.endsWith(COPY_SUFFIX) ? deck.name : deck.name + COPY_SUFFIX;
  return { ...structuredClone(deck), id, name, updatedAt: now };
}

export interface FirstLoginPlan {
  /** Decks deste navegador que a conta não tem (nem com outro id): são eles que a pergunta conta. */
  onlyLocal: DeckData[];
  /** Mesmo id dos dois lados, com conteúdo diferente: se juntar, ficam os dois. */
  conflicts: { local: DeckData; account: DeckData }[];
}

/** Compara o navegador com a conta no primeiro login. Decks prontos nunca entram. */
export function planFirstLogin(local: DeckData[], account: DeckData[]): FirstLoginPlan {
  const byId = new Map(account.map(d => [d.id, d]));
  const prints = new Set(account.map(deckFingerprint));
  const plan: FirstLoginPlan = { onlyLocal: [], conflicts: [] };
  for (const deck of local) {
    if (deck.builtin) continue;
    const same = byId.get(deck.id);
    // Conteúdo diferente com o mesmo id, a não ser que a conta já tenha este conteúdo em outro deck.
    if (same) { if (!sameDeck(deck, same) && !prints.has(deckFingerprint(deck))) plan.conflicts.push({ local: deck, account: same }); }
    else if (!prints.has(deckFingerprint(deck))) plan.onlyLocal.push(deck);
  }
  return plan;
}

/** Quantos decks a pergunta do primeiro login menciona; zero quer dizer que não há o que perguntar. */
export const decksToAsk = (plan: FirstLoginPlan) => plan.onlyLocal.length + plan.conflicts.length;

export interface JoinResult {
  /** A biblioteca deste navegador depois de juntar. */
  decks: DeckData[];
  /** O que sobe para a conta: os decks só daqui e as cópias dos conflitos. */
  upload: DeckData[];
}

/**
 * "Juntar à conta". A ordem é a do navegador, que é a que o jogador conhece: no conflito, a versão da conta toma o
 * lugar e a cópia daqui vem logo depois; os decks que só a conta tem vão para o fim.
 */
export function joinAccount(local: DeckData[], account: DeckData[], newId: () => string, now: string): JoinResult {
  const plan = planFirstLogin(local, account);
  const only = new Set(plan.onlyLocal), conflicts = new Map(plan.conflicts.map(c => [c.local, c.account]));
  const byId = new Map(account.map(d => [d.id, d])), prints = new Map(account.map(d => [deckFingerprint(d), d]));
  const decks: DeckData[] = [], upload: DeckData[] = [], used = new Set<string>();
  for (const deck of local) {
    if (deck.builtin) continue;
    if (only.has(deck)) { decks.push(deck); upload.push(deck); continue; }
    const theirs = conflicts.get(deck) ?? byId.get(deck.id) ?? prints.get(deckFingerprint(deck))!;
    if (!used.has(theirs.id)) { decks.push(theirs); used.add(theirs.id); }
    if (conflicts.has(deck)) { const copy = deviceCopy(deck, newId(), now); decks.push(copy); upload.push(copy); }
  }
  for (const deck of account) if (!used.has(deck.id)) decks.push(deck);
  return { decks, upload };
}

/** Uma mudança deste aparelho que a conta recusou porque o deck mudou em outro aparelho desde a última vez. */
export interface PushConflict {
  /** A versão daqui; null se aqui o deck foi apagado. */
  local: DeckData | null;
  /** A versão da conta; null se lá o deck foi apagado. */
  account: DeckData | null;
}

export interface ConflictResolution {
  /** O deck com este id fica assim aqui; null tira daqui. */
  keep: DeckData | null;
  /** Enviar de novo: a versão daqui, sobre a da conta. */
  resend: DeckData | null;
  /** Uma cópia nova daqui para guardar e enviar. */
  copy: DeckData | null;
}

/**
 * Editar vence apagar, dos dois lados; duas edições diferentes ficam as duas (a da conta com o id, a daqui como
 * cópia); duas iguais, ou dois apagados, não têm conflito nenhum.
 */
export function resolveConflict(c: PushConflict, newId: () => string, now: string): ConflictResolution {
  const { local, account } = c;
  if (!local) return { keep: account, resend: null, copy: null };
  if (!account) return { keep: local, resend: local, copy: null };
  if (sameDeck(local, account)) return { keep: account, resend: null, copy: null };
  return { keep: account, resend: null, copy: deviceCopy(local, newId(), now) };
}

/** Uma mudança vinda da conta: o deck novo ou alterado, ou o id apagado. */
export type RemoteChange = { id: string; deck: DeckData } | { id: string; deleted: true };

/**
 * Aplica o que mudou em outro aparelho. Decks com mudança daqui ainda esperando envio ficam como estão: o envio é que
 * descobre o conflito e o resolve. Deck novo entra no começo, como um deck criado aqui.
 */
export function applyRemote(local: DeckData[], changes: RemoteChange[], pending: ReadonlySet<string>): DeckData[] {
  let decks = [...local];
  for (const change of changes) {
    if (pending.has(change.id)) continue;
    const index = decks.findIndex(d => d.id === change.id);
    if ('deleted' in change) { if (index >= 0) decks.splice(index, 1); }
    else if (index >= 0) decks[index] = change.deck;
    else decks = [change.deck, ...decks];
  }
  return decks;
}
