import { bridgeHttpUrl } from '../feedback';

/**
 * Conta do jogador (Entrar com Google): o token que a ponte devolve em /api/conta/entrar, guardado no localStorage
 * para valer em todas as abas e depois de fechar o jogo. Spec em docs/spec-login-google.md.
 */
const KEY = 'mesa:conta:v1';
export const CONTA_API = bridgeHttpUrl('/api/conta/');
export const GOOGLE_CLIENT_ID: string = import.meta.env?.VITE_GOOGLE_CLIENT_ID ?? '';

export interface ContaPerfil { nome?: string; foto?: string; apelido?: string }
export interface ContaSessao { token: string; expiresAt: string; conta: ContaPerfil }

/** Enquanto a sincronia dos decks não fica pronta, as contas só aparecem no `npm run dev` ou com "mesa:dev" = "1". */
export function contasLigadas(): boolean {
  if (!GOOGLE_CLIENT_ID) return false;
  try { return import.meta.env?.DEV === true || localStorage.getItem('mesa:dev') === '1'; } catch { return false; }
}

/** Sem localStorage, a sessão vale só nesta página. */
let memory: ContaSessao | null = null;
let lastError = '';
const listeners = new Set<() => void>();

export function contaSessao(): ContaSessao | null {
  let s = memory;
  try { s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as ContaSessao | null ?? memory; } catch { /* fica a da memória */ }
  return s?.token && Date.parse(s.expiresAt) > Date.now() ? s : null;
}

/** O último erro ao entrar, para o menu da conta mostrar; some no próximo login certo. */
export const contaErro = () => lastError;

/** Avisa quando a conta muda (nesta aba ou em outra). */
export function onContaChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const notify = () => listeners.forEach(l => l());
try { addEventListener('storage', e => { if (e.key === KEY) notify(); }); } catch { /* sem janela (testes) */ }

function salvar(s: ContaSessao | null) {
  memory = s;
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* fica na memória */ }
  notify();
}

/** Pedido à ponte com o token; 401 apaga a sessão guardada. */
export async function contaFetch(path: string, init: RequestInit = {}, s = contaSessao()) {
  const response = await fetch(CONTA_API + path, { ...init, headers: { ...init.headers, ...(s ? { Authorization: `Bearer ${s.token}` } : {}) } });
  if (response.status === 401 && s) salvar(null);
  return response;
}

async function mensagem(response: Response) {
  const json = await response.json().catch(() => null) as { error?: string } | null;
  return json?.error ?? 'Não foi possível entrar agora. Tente de novo.';
}

/** Troca a credencial do Google pela sessão da ponte. */
export async function entrar(credential: string): Promise<boolean> {
  try {
    const response = await fetch(CONTA_API + 'entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential }) });
    if (!response.ok) { lastError = await mensagem(response); notify(); return false; }
    lastError = '';
    salvar(await response.json() as ContaSessao);
    return true;
  } catch {
    lastError = 'Sem conexão com o servidor. Tente de novo quando a internet voltar.';
    notify();
    return false;
  }
}

/** Sai mesmo sem rede: o token some daqui, e a ponte o esquece quando vencer. */
export async function sair() {
  const s = contaSessao();
  salvar(null);
  if (s) await contaFetch('sair', { method: 'POST' }, s).catch(() => {});
}

/** Apaga a conta no servidor; devolve o erro para mostrar, ou '' quando deu certo. */
export async function apagarConta(): Promise<string> {
  try {
    const response = await contaFetch('conta', { method: 'DELETE' });
    if (!response.ok) return response.status === 401 ? 'A sessão acabou. Entre de novo para apagar a conta.' : await mensagem(response);
    salvar(null);
    return '';
  } catch { return 'Sem conexão com o servidor. Tente de novo quando a internet voltar.'; }
}

/** Ao abrir o jogo: confere a sessão e traz o perfil atualizado (a sessão também se renova na ponte). */
export async function atualizarConta() {
  const s = contaSessao();
  if (!s) return;
  try {
    const response = await contaFetch('eu', {}, s);
    if (response.ok) salvar({ ...s, conta: (await response.json() as { conta: ContaPerfil }).conta });
  } catch { /* sem rede: fica a sessão guardada */ }
}
