import { ACCOUNT_BACKUP_PREFIX, loadUserDecks, normalizeDeck, onUserDecksSaved, saveUserDecks, type DeckData } from '../decks';
import { applyRemote, decksToAsk, joinAccount, planFirstLogin, resolveConflict, type RemoteChange } from './merge';
import { contaFetch, contaSessao, contasLigadas, onContaChange } from './session';

/**
 * Sincronia de Meus decks com a conta (docs/spec-login-google.md). O localStorage continua sendo onde os decks
 * vivem; a conta é uma réplica. Cada gravação marca o que mudou numa fila guardada no localStorage, enviada em
 * segundo plano; sem rede, ela espera. Ao abrir o jogo, ao voltar para a aba e a cada 5 minutos, o jogo busca o que
 * mudou em outros aparelhos. As regras de junção e de conflito ficam em merge.ts.
 */
const KEY = 'mesa:conta:sync:v1';
const PULL_EVERY = 5 * 60_000;

export interface SyncState {
  /** Id opaco da conta dona destes decks. */
  conta: string;
  /** Última revisão da conta que este navegador viu. */
  rev: number;
  /** Revisão de cada deck na conta, base da próxima mudança dele. */
  base: Record<string, number>;
  pendentes: Record<string, 'salvo' | 'apagado'>;
}
export type SyncStatus = { kind: 'off' } | { kind: 'ok' } | { kind: 'enviando' } | { kind: 'offline'; pendentes: number } | { kind: 'erro'; text: string };

/** O que a pergunta do primeiro login precisa: quantos decks e a resposta do jogador. */
export type FirstLoginAnswer = 'juntar' | 'conta' | 'cancelar';
export type AskFirstLogin = (decks: number) => Promise<FirstLoginAnswer>;

let status: SyncStatus = { kind: 'off' };
let notice = '';
const listeners = new Set<() => void>();
let applying = false;
/** O conteúdo de cada deck na última gravação vista por esta aba, para saber o que mudou na próxima. */
let snapshot = new Map<string, string>();
let ask: AskFirstLogin = async () => 'cancelar';
let onSignedOutByChoice: () => Promise<void> = async () => {};
let running: Promise<void> | null = null;

export const syncStatus = () => status;
/** Aviso para o jogador (um deck recusado pela conta, por exemplo); some quando ele vê. */
export const syncNotice = () => notice;
export function clearSyncNotice() { notice = ''; notify(); }
export function onSyncChange(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
const notify = () => listeners.forEach(l => l());
const setStatus = (s: SyncStatus) => { status = s; notify(); };

function readState(): SyncState | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') as SyncState | null; } catch { return null; }
}
function writeState(s: SyncState | null) {
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* sem armazenamento: a fila fica só nesta aba */ }
}

/** Comparado como fica depois de lido: um deck da conta sem sideboard é o mesmo que o daqui com sideboard vazio. */
const content = (d: DeckData) => JSON.stringify(normalizeDeck(d));
const takeSnapshot = (decks: DeckData[]) => { snapshot = new Map(decks.map(d => [d.id, content(d)])); };

/** Grava decks que vieram da conta, sem marcá-los como mudança daqui. */
function saveFromAccount(decks: DeckData[]) {
  applying = true;
  try { saveUserDecks(decks); } finally { applying = false; }
  takeSnapshot(decks);
  dispatchEvent(new CustomEvent('mesa:decks-sincronizados'));
}

/** Cada gravação de Meus decks: o que mudou entra na fila, se este navegador estiver ligado a uma conta. */
function onSaved(decks: DeckData[]) {
  const before = snapshot;
  takeSnapshot(decks);
  if (applying) return;
  const s = readState();
  if (!s || !contaSessao() || contaSessao()!.conta.id !== s.conta) return;
  for (const d of decks) if (!d.builtin && before.get(d.id) !== content(d)) s.pendentes[d.id] = 'salvo';
  for (const id of before.keys()) if (!decks.some(d => d.id === id)) s.pendentes[id] = 'apagado';
  writeState(s);
  schedule();
}

let timer = 0;
/** Junta as gravações seguidas (digitar no editor grava várias vezes) num envio só. */
function schedule() { clearTimeout(timer); timer = window.setTimeout(() => void run(), 1500); }

/** Só uma aba sincroniza de cada vez; as outras esperam e depois leem o resultado do localStorage. */
function run(): Promise<void> {
  running ??= (async () => {
    try {
      const locks = (navigator as Navigator & { locks?: LockManager }).locks;
      if (locks) await locks.request('mesa-conta-sync', () => cycle());
      else await cycle();
    } finally { running = null; }
  })();
  return running;
}

async function cycle() {
  const session = contaSessao();
  if (!session) { setStatus({ kind: 'off' }); return; }
  let s = readState();
  if (!s || s.conta !== session.conta.id) {
    if (!await firstLogin(session.conta.id)) return;
    s = readState()!;
  }
  try {
    if (Object.keys(s.pendentes).length) { setStatus({ kind: 'enviando' }); await push(s); }
    await pull(readState()!);
    setStatus({ kind: 'ok' });
  } catch (e) {
    const pendentes = Object.keys(readState()?.pendentes ?? {}).length;
    // Sem rede (TypeError) ou servidor que não responde (TimeoutError): a fila espera a próxima vez.
    const offline = e instanceof TypeError || (e instanceof DOMException && e.name === 'TimeoutError');
    setStatus(offline ? { kind: 'offline', pendentes } : { kind: 'erro', text: e instanceof Error ? e.message : 'Falha ao sincronizar.' });
  }
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `O servidor respondeu ${response.status}.`);
  }
  return await response.json() as T;
}

interface StateResponse { rev: number; decks: { id: string; rev: number; deck?: DeckData; apagado?: true }[] }
const toChange = (c: StateResponse['decks'][number]): RemoteChange => c.apagado ? { id: c.id, deleted: true } : { id: c.id, deck: c.deck! };

/**
 * Primeiro login neste navegador (ou com outra conta): junta ou troca os decks, conforme a resposta do jogador.
 * Devolve false se ele desistiu de entrar.
 */
async function firstLogin(conta: string): Promise<boolean> {
  setStatus({ kind: 'enviando' });
  const state = await json<StateResponse>(await contaFetch('estado'));
  const account = state.decks.filter(c => c.deck).map(c => c.deck!);
  const local = loadUserDecks();
  const plan = planFirstLogin(local, account);
  const answer = decksToAsk(plan) ? await ask(decksToAsk(plan)) : 'juntar';
  if (answer === 'cancelar') { await onSignedOutByChoice(); setStatus({ kind: 'off' }); return false; }
  const base = Object.fromEntries(state.decks.map(c => [c.id, c.rev]));
  const pendentes: SyncState['pendentes'] = {};
  let decks: DeckData[];
  if (answer === 'conta') {
    // Com a hora inteira na chave, uma segunda troca no mesmo dia não apaga a primeira cópia.
    try { localStorage.setItem(ACCOUNT_BACKUP_PREFIX + new Date().toISOString(), JSON.stringify(local)); } catch { /* sem espaço: segue */ }
    decks = account;
  } else {
    const joined = joinAccount(local, account, () => crypto.randomUUID(), new Date().toISOString());
    decks = joined.decks;
    for (const d of joined.upload) pendentes[d.id] = 'salvo';
  }
  writeState({ conta, rev: state.rev, base, pendentes });
  saveFromAccount(decks);
  return true;
}

interface SyncResponse {
  rev: number;
  aplicadas: { id: string; rev: number }[];
  conflitos: { id: string; rev: number; deck?: DeckData; apagado?: true }[];
  recusadas: { id: string; motivo: string }[];
}

async function push(s: SyncState) {
  const decks = loadUserDecks();
  const byId = new Map(decks.map(d => [d.id, d]));
  const ids = Object.keys(s.pendentes);
  const mudancas = ids.map(id => {
    const deck = s.pendentes[id] === 'salvo' ? byId.get(id) : undefined;
    return deck ? { id, base: s.base[id] ?? 0, deck } : { id, base: s.base[id] ?? 0, apagar: true };
  });
  const result = await json<SyncResponse>(await contaFetch('sincronizar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mudancas }),
  }));
  // Relê: a fila pode ter crescido enquanto o pedido ia e voltava.
  const next = readState() ?? s;
  const sent = new Map(mudancas.map(m => [m.id, m]));
  let library = loadUserDecks(), changed = false;
  const stillSame = (id: string) => {
    const m = sent.get(id)!, now = library.find(d => d.id === id);
    return 'deck' in m ? !!now && content(now) === content(m.deck as DeckData) : !now;
  };
  for (const a of result.aplicadas) { next.base[a.id] = a.rev; if (stillSame(a.id)) delete next.pendentes[a.id]; }
  for (const r of result.recusadas) { delete next.pendentes[r.id]; notice = r.motivo; }
  for (const c of result.conflitos) {
    const local = library.find(d => d.id === c.id) ?? null;
    const resolution = resolveConflict({ local, account: c.deck ?? null }, () => crypto.randomUUID(), new Date().toISOString());
    next.base[c.id] = c.rev;
    if (resolution.resend) continue;
    delete next.pendentes[c.id];
    const index = library.findIndex(d => d.id === c.id);
    if (resolution.keep) { if (index >= 0) library[index] = resolution.keep; else library = [resolution.keep, ...library]; }
    else if (index >= 0) library.splice(index, 1);
    if (resolution.copy) { library.splice(Math.max(0, library.findIndex(d => d.id === c.id)) + 1, 0, resolution.copy); next.pendentes[resolution.copy.id] = 'salvo'; }
    changed = true;
  }
  writeState(next);
  if (changed) saveFromAccount(library);
  // Conflitos reenviados e cópias novas sobem na hora.
  if (result.conflitos.length && Object.keys(next.pendentes).length) await push(next);
}

async function pull(s: SyncState) {
  const state = await json<StateResponse>(await contaFetch(`estado/${s.rev}`));
  const next = readState() ?? s;
  if (state.decks.length) {
    const pending = new Set(Object.keys(next.pendentes));
    saveFromAccount(applyRemote(loadUserDecks(), state.decks.map(toChange), pending));
    for (const c of state.decks) if (!pending.has(c.id)) next.base[c.id] = c.rev;
  }
  next.rev = Math.max(next.rev, state.rev);
  writeState(next);
}

/** Quantas mudanças daqui ainda não chegaram à conta. */
export const pendingChanges = () => Object.keys(readState()?.pendentes ?? {}).length;

/** Tenta enviar o que falta agora (antes de sair da conta); devolve quantas mudanças ficaram sem enviar. */
export async function flush(): Promise<number> {
  await run().catch(() => {});
  return pendingChanges();
}

/** Ao sair da conta: "manter" deixa os decks como decks comuns daqui; "tirar" apaga Meus decks deste navegador. */
export function forgetAccount(removeDecks: boolean) {
  writeState(null);
  if (removeDecks) saveFromAccount([]);
  setStatus({ kind: 'off' });
}

/** Lixeira da conta: os decks apagados nos últimos 30 dias. */
export async function trash(): Promise<{ id: string; deck: DeckData; apagadoEm: string }[]> {
  return (await json<{ decks: { id: string; deck: DeckData; apagadoEm: string }[] }>(await contaFetch('lixeira'))).decks;
}

/** Devolve um deck da lixeira à conta e a este navegador. */
export async function restore(id: string) {
  const r = await json<{ id: string; rev: number; deck: DeckData }>(await contaFetch(`lixeira/${encodeURIComponent(id)}/restaurar`, { method: 'POST' }));
  const s = readState();
  if (s) { s.base[r.id] = r.rev; delete s.pendentes[r.id]; writeState(s); }
  saveFromAccount(applyRemote(loadUserDecks(), [{ id: r.id, deck: r.deck }], new Set()));
}

/**
 * Liga a sincronia: {@code askFirstLogin} mostra a pergunta do primeiro login; {@code signOut} sai da conta quando o
 * jogador desiste de entrar nela.
 */
export function startSync(askFirstLogin: AskFirstLogin, signOut: () => Promise<void>) {
  if (!contasLigadas()) return;
  ask = askFirstLogin;
  onSignedOutByChoice = signOut;
  takeSnapshot(loadUserDecks());
  onUserDecksSaved(onSaved);
  onContaChange(() => { if (contaSessao()) void run(); else setStatus({ kind: 'off' }); });
  addEventListener('online', () => void run());
  document.addEventListener('visibilitychange', () => { if (!document.hidden && contaSessao()) void run(); });
  setInterval(() => { if (!document.hidden && contaSessao()) void run(); }, PULL_EVERY);
  // Outra aba gravou decks: atualiza a foto do que esta aba conhece e redesenha a lista.
  addEventListener('storage', e => { if (e.key === 'mesa:decks:v2') { takeSnapshot(loadUserDecks()); dispatchEvent(new CustomEvent('mesa:decks-sincronizados')); } });
  if (contaSessao()) void run();
}
