import { contaSessao, type ContaSessao } from './conta/session';
import { NAME_KEY } from './conta/prefs';

/**
 * Com que nome um relato vai (item 62). Com a conta conectada, o nome na mesa (que acompanha a conta) ou o apelido
 * dela, e o token, para a ponte confirmar pela sessão; sem conta, o nome das salas ({@code mesa:name}), que a ponte
 * guarda como "nome informado". Sem conta e sem nome: null, relato anônimo. E-mail nunca.
 */
export interface ReportAuthor { name: string; token: string | null }

/** Mesmo limite do campo de nome das salas e do apelido da conta. */
export const AUTHOR_NAME_LIMIT = 24;

export function reportAuthor(storage: Pick<Storage, 'getItem'> | null = globalThis.localStorage ?? null, sessao: ContaSessao | null = contaSessao()): ReportAuthor | null {
  let name = '';
  try { name = storage?.getItem(NAME_KEY)?.trim() ?? ''; } catch { /* sem armazenamento */ }
  if (sessao) name ||= sessao.conta.apelido?.trim() || sessao.conta.nome?.trim() || '';
  name = [...name.replace(/\s+/g, ' ')].slice(0, AUTHOR_NAME_LIMIT).join('').trim();
  if (!name && !sessao) return null;
  return { name, token: sessao?.token ?? null };
}
