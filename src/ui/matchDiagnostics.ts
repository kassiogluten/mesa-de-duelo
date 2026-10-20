/** O que deu errado durante a partida, para o painel "Erros da partida" e para o relatório copiado. */
export type DiagnosticKind = 'aviso' | 'ação ignorada' | 'conexão' | 'falha da mesa';
export interface DiagnosticContext { matchId?: string; turn?: number; phase?: string | null }
export interface DiagnosticEntry extends DiagnosticContext {
  at: number;
  kind: DiagnosticKind;
  text: string;
  /** Ação do jogador recusada pela ponte (ok, card, attack…), ou a pilha do erro da mesa. */
  detail?: string;
  /** Quantas vezes o mesmo erro se repetiu em seguida. */
  repeats: number;
}
const LIMIT = 100;
const REPEAT_WINDOW_MS = 5000;

export class MatchDiagnostics {
  entries: DiagnosticEntry[] = [];
  private seen = 0;
  private now: () => number;
  constructor(now: () => number = Date.now) { this.now = now; }

  add(kind: DiagnosticKind, text: string, context: DiagnosticContext = {}, detail?: string) {
    const at = this.now(), last = this.entries.at(-1);
    // Um clique repetido num pedido vencido vira uma linha com contagem, não uma lista de linhas iguais.
    if (last && last.kind === kind && last.text === text && last.detail === detail && at - last.at < REPEAT_WINDOW_MS) {
      last.repeats++; last.at = at; this.seen = Math.min(this.seen, this.entries.length - 1); return last;
    }
    const entry: DiagnosticEntry = { at, kind, text, ...context, ...(detail ? { detail } : {}), repeats: 1 };
    this.entries.push(entry);
    if (this.entries.length > LIMIT) { this.entries.shift(); this.seen = Math.max(0, this.seen - 1); }
    return entry;
  }
  /** Erros ainda não vistos no painel, para o número no botão do menu. */
  get unseen() { return this.entries.length - this.seen; }
  markSeen() { this.seen = this.entries.length; }
  clear() { this.entries = []; this.seen = 0; }

  /** Texto para colar numa conversa ou num relato de bug: versões, partida e cada erro com turno e fase. */
  report(meta: Record<string, string | number | undefined>) {
    const lines = ['Mesa de Duelo: erros da partida', ...Object.entries(meta).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}: ${v}`), ''];
    if (!this.entries.length) lines.push('Nenhum erro registrado.');
    for (const e of this.entries) {
      const when = new Date(e.at).toISOString();
      const where = [e.matchId && `partida ${e.matchId}`, e.turn !== undefined && `turno ${e.turn}`, e.phase].filter(Boolean).join(', ');
      lines.push(`[${when}] ${e.kind}${e.repeats > 1 ? ` (×${e.repeats})` : ''}: ${e.text}${where ? ` — ${where}` : ''}${e.detail ? `\n    ${e.detail.replace(/\n/g, '\n    ')}` : ''}`);
    }
    return lines.join('\n');
  }
}
