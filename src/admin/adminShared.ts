/** Tipos, rótulos e formatos que as abas da área de admin dividem. */
export type Status = 'novo' | 'visto' | 'issue' | 'resolvido' | 'descartado';
export interface Item {
  code: string; receivedAt: string; kind: string | null; version: string | null; format: string | null; bytes: number;
  match: boolean; bridge: boolean; summary?: string;
  /** Quem enviou (item 62): apelido e conta vindos da sessão, ou só o nome informado pelo aparelho. Ausente: anônimo. */
  author?: { nickname?: string; account?: string; informed?: boolean };
  status: { status: Status; note?: string; issue?: string; updatedAt: string };
}
export type Stored = Record<string, any>;

export const STATUS: Record<Status, string> = { novo: 'Novo', visto: 'Visto', issue: 'Virou issue', resolvido: 'Resolvido', descartado: 'Descartado' };
export const FORMATS: Record<string, string> = { commander: 'Commander', standard: 'Standard', pauper: 'Pauper', sacola50: 'Sacola 50', free: 'Livre', oathbreaker: 'Oathbreaker', precon: 'Precon' };

export const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
export const size = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
export const kindBadge = (kind: string | null) => `<span class="adm-kind ${kind === 'erro' ? 'erro' : ''}">${kind === 'erro' ? 'Erro' : kind === 'sugestao' ? 'Sugestão' : '?'}</span>`;
export const statusBadge = (status: Status) => `<span class="adm-status s-${status}">${STATUS[status] ?? status}</span>`;
