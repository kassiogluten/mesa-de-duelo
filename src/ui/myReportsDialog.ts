// Tela Meus relatos: os relatos enviados, cada um com o estado e a resposta, aberta pelo menu ⋯.
import { esc } from './cardtext';
import { finder } from './dom';
import { contaSessao } from '../conta/session';
import { STATUS_LABEL, markSeen, refreshMyReports, savedReports, type MyReport } from '../myReports';
import './feedbackForm.css';
import './myReportsDialog.css';

const closeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
const day = (at: number | string) => {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) || !date.getTime() ? '' : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

function cardHTML(r: MyReport) {
  const date = day(r.at);
  return `<li class="my-report${r.reply ? ' answered' : ''}">
    <div class="my-report-top"><strong>${esc(r.code)}</strong><span class="my-report-kind">${r.kind === 'erro' ? 'Algo deu errado' : 'Sugestão'}</span>${date ? `<time>${date}</time>` : ''}${r.status ? `<span class="my-report-status s-${r.status}">${STATUS_LABEL[r.status]}</span>` : ''}</div>
    ${r.summary ? `<p class="my-report-text">${esc(r.summary)}</p>` : ''}
    ${r.reply ? `<div class="my-report-reply"><p class="my-report-reply-label">Resposta${r.repliedAt && day(r.repliedAt) ? ` · ${day(r.repliedAt)}` : ''}</p><p class="my-report-reply-text">${esc(r.reply)}</p></div>` : ''}
  </li>`;
}

export function myReportsHTML(reports: MyReport[], state: { loading?: boolean; offline?: boolean }) {
  const note = state.loading ? 'Buscando as respostas…' : state.offline ? 'Não consegui falar com o servidor agora.' : '';
  return `${note ? `<p class="my-reports-note${state.offline ? ' offline' : ''}" role="status">${note}</p>` : ''}
    ${reports.length ? `<ul class="my-reports-list" aria-label="Relatos enviados">${reports.map(cardHTML).join('')}</ul>`
      : state.loading ? '' : '<p class="my-reports-empty">Você ainda não mandou relatos.</p>'}`;
}

let open: HTMLElement | null = null;

/** Abre a tela, consulta o servidor e marca as novidades como vistas. Sem conexão, mostra o que o aparelho guardou. */
export function openMyReportsDialog() {
  open?.remove();
  const returnFocus = document.activeElement as HTMLElement | null;
  const overlay = document.createElement('div');
  overlay.className = 'feedback-overlay my-reports-overlay';
  overlay.innerHTML = `<section class="feedback-dialog my-reports-dialog" role="dialog" aria-modal="true" aria-labelledby="myReportsTitle">
    <header class="feedback-heading"><h2 id="myReportsTitle">Meus relatos</h2><button type="button" class="feedback-close" data-fb="close" aria-label="Fechar">${closeIcon}</button></header>
    <div class="my-reports-body" aria-live="polite"></div>
    <p class="my-reports-foot">Cada relato tem uma resposta só. Para continuar o assunto, mande outro relato e cite o código.</p>
    <footer class="feedback-actions"><button type="button" class="arena-btn primary" data-fb="close">Fechar</button></footer>
  </section>`;
  document.body.append(overlay);
  open = overlay;
  const $ = finder(overlay);
  const body = $('.my-reports-body');
  // Enquanto o servidor não responde, já aparece o que o aparelho guardou, sem os estados.
  body.innerHTML = myReportsHTML(savedReports().map(r => ({ code: r.code, kind: r.kind, summary: r.summary, at: r.at })), { loading: true });

  const close = () => {
    if (open === overlay) open = null;
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    returnFocus?.focus?.({ preventScroll: true });
  };
  overlay.addEventListener('click', e => { if (e.target === overlay || (e.target as HTMLElement).closest('[data-fb="close"]')) close(); });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    // Foco preso na janela, como no formulário de relato.
    const focusable = [...overlay.querySelectorAll<HTMLElement>('button, [tabindex]:not([tabindex="-1"])')];
    const first = focusable[0], last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  };
  document.addEventListener('keydown', onKey, true);
  $<HTMLButtonElement>('.feedback-actions [data-fb="close"]').focus();

  void refreshMyReports(contaSessao()?.token ?? null).then(({ reports, offline }) => {
    if (!overlay.isConnected) return;
    body.innerHTML = myReportsHTML(reports, { offline });
    markSeen(reports);
  });
}
