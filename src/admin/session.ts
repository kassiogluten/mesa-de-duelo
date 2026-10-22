import { bridgeHttpUrl } from '../feedback';

/**
 * Sessão da área de admin: o token que a ponte devolve no login, guardado no localStorage para valer também
 * nas abas abertas a partir dela (a página de repetição abre os relatos com ele). Some ao sair ou ao vencer.
 */
const KEY = 'mesa:admin';
export const ADMIN_API = bridgeHttpUrl('/api/admin/');

export interface AdminSession { token: string; expiresAt: string }
/** Sem localStorage, a sessão vale só nesta página. */
let memory: AdminSession | null = null;

export function adminSession(): AdminSession | null {
  let session = memory;
  try { session = JSON.parse(localStorage.getItem(KEY) ?? 'null') as AdminSession | null ?? memory; } catch { /* fica a da memória */ }
  return session?.token && Date.parse(session.expiresAt) > Date.now() ? session : null;
}

export function saveAdminSession(session: AdminSession | null) {
  memory = session;
  try { if (session) localStorage.setItem(KEY, JSON.stringify(session)); else localStorage.removeItem(KEY); } catch { /* fica na memória */ }
}

/** Pedido à ponte com o token; 401 apaga a sessão guardada. */
export async function adminFetch(path: string, init: RequestInit = {}, session = adminSession()) {
  const response = await fetch(ADMIN_API + path, { ...init, headers: { ...init.headers, ...(session ? { Authorization: `Bearer ${session.token}` } : {}) } });
  if (response.status === 401) saveAdminSession(null);
  return response;
}

export async function adminError(response: Response) {
  const json = await response.json().catch(() => null) as { error?: string } | null;
  return json?.error ?? `A ponte respondeu ${response.status}.`;
}
