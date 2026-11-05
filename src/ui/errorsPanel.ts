// A gaveta "Erros da partida" (no menu): avisos de erro, ações que o servidor ignorou, quedas de conexão e falhas da
// própria mesa, com o contador no menu, o relatório para copiar ou relatar e a gravação (desenvolvimento).
import type { FState } from '../forge/client';
import { esc } from './cardtext';
import { VERSION } from './changelog';
import { MatchDiagnostics, type DiagnosticEntry, type DiagnosticKind } from './matchDiagnostics';
import { finder } from './dom';

export interface ErrorsDeps {
  state(): FState | null | undefined;
  /** Cada erro registrado, para a gravação da partida. */
  onDiagnostic?(entry: DiagnosticEntry): void;
  onDownloadRecording?(): Promise<void>;
  setHTML(el: HTMLElement, html: string): void;
  /** Ao abrir a gaveta: fecha o menu e a gaveta do histórico. */
  closeOthers(): void;
}

export function createErrorsPanel(root: HTMLElement, d: ErrorsDeps) {
  const $ = finder(root);
  const diagnostics = new MatchDiagnostics();
  function record(kind: DiagnosticKind, text: string, detail?: string) {
    const s = d.state();
    const entry = diagnostics.add(kind, text, { matchId: s?.matchId ?? s?.session?.code, turn: s?.turn, phase: s?.phase }, detail);
    d.onDiagnostic?.(entry);
    render();
  }
  function render() {
    const open = !$('#fErrorsDrawer').hidden;
    if (open) diagnostics.markSeen();
    const count = $('#fErrorsCount');
    count.hidden = !diagnostics.unseen; count.textContent = String(diagnostics.unseen);
    if (!open) return;
    const time = (at: number) => new Date(at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    d.setHTML($('#fErrors'), diagnostics.entries.length ? [...diagnostics.entries].reverse().map(e => `<li class="error-entry ${e.kind === 'falha da mesa' || e.kind === 'conexão' ? 'serious' : ''}">
      <span class="error-meta">${time(e.at)} · ${esc(e.kind)}${e.repeats > 1 ? ` · ×${e.repeats}` : ''}${e.turn !== undefined ? ` · turno ${e.turn}` : ''}</span>
      <span>${esc(e.text)}</span>${e.detail ? `<code>${esc(e.detail)}</code>` : ''}</li>`).join('') : '<li class="errors-empty">Nenhum erro nesta sessão.</li>');
  }
  function report() {
    const s = d.state();
    return diagnostics.report({ 'versão da mesa': VERSION, regras: s?.rulesVersion, motor: s?.engineVersion, formato: s?.config?.format,
      jogadores: s?.players.length, partida: s?.matchId ?? s?.session?.code, navegador: navigator.userAgent });
  }
  function set(open: boolean, restore = false) {
    $('#fErrorsDrawer').hidden = !open;
    root.querySelector('[aria-controls="fErrorsDrawer"]')?.setAttribute('aria-expanded', String(open));
    $('#fErrorsStatus').textContent = '';
    if (open) { d.closeOthers(); render(); $('#fErrorsDrawer').querySelector<HTMLElement>('button')?.focus({ preventScroll: true }); }
    else if (restore) root.querySelector<HTMLElement>('[data-ui="menu"]')?.focus({ preventScroll: true });
  }
  function download() {
    const status = $('#fErrorsStatus');
    status.textContent = 'Preparando a gravação…';
    void d.onDownloadRecording?.().then(() => { status.textContent = 'Gravação baixada.'; }, () => { status.textContent = 'Não consegui preparar a gravação.'; });
  }
  function clear() { diagnostics.clear(); render(); $('#fErrorsStatus').textContent = 'Lista limpa.'; }
  function copy() {
    const text = report();
    const status = $('#fErrorsStatus');
    if (!navigator.clipboard) { status.textContent = 'Este navegador não permite copiar daqui.'; return; }
    void navigator.clipboard.writeText(text).then(() => { status.textContent = 'Relatório copiado.'; },
      () => { status.textContent = 'Não consegui copiar. Selecione o texto da lista e copie.'; });
  }
  // Falhas do próprio código da mesa durante a partida (o jogo segue, mas fica registrado).
  window.addEventListener('error', e => { if (!root.hidden && root.isConnected) record('falha da mesa', e.message || 'Erro inesperado', e.error?.stack?.split('\n').slice(0, 4).join('\n')); });
  window.addEventListener('unhandledrejection', e => { if (!root.hidden && root.isConnected) record('falha da mesa', String((e.reason as Error)?.message ?? e.reason ?? 'Promessa rejeitada'), (e.reason as Error)?.stack?.split('\n').slice(0, 4).join('\n')); });
  return { record, render, report, set, download, clear, copy };
}
