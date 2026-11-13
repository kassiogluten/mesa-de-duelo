// Aviso de resposta num relato: aparece uma vez por novidade, na tela inicial ou em Meus decks, nunca na partida.
import { esc } from './cardtext';
import { contaSessao } from '../conta/session';
import { markNotified, refreshMyReports, unnotifiedReports, type MyReport } from '../myReports';
import { openMyReportsDialog } from './myReportsDialog';
import './pwa.css';

/** O texto do aviso: o código quando é um relato só; a contagem quando são vários. */
export function noticeText(reports: MyReport[]) {
  if (reports.length > 1) return `Seus relatos têm ${reports.every(r => r.reply) ? 'resposta' : 'novidades'} (${reports.length})`;
  const r = reports[0]!;
  return `Seu relato ${r.code} ${r.reply ? 'tem resposta' : r.status === 'resolvido' ? 'foi resolvido' : 'foi encerrado'}`;
}

export function hideMyReportsNotice() { document.querySelector('.my-reports-notice')?.remove(); }

/** O mesmo molde do aviso de versão nova, no canto da tela, com Depois e Ver. */
export function showMyReportsNotice(reports: MyReport[]) {
  hideMyReportsNotice();
  const el = document.createElement('div');
  el.className = 'pwa-banner my-reports-notice';
  el.setAttribute('role', 'status');
  el.innerHTML = `<p><strong>${esc(noticeText(reports))}</strong>Veja em Meus relatos, no menu ⋯.</p><div class="pwa-actions"><button type="button" class="pwa-dismiss">Depois</button><button type="button" class="pwa-primary">Ver</button></div>`;
  el.querySelector('.pwa-dismiss')!.addEventListener('click', () => el.remove());
  el.querySelector('.pwa-primary')!.addEventListener('click', () => { el.remove(); openMyReportsDialog(); });
  document.body.append(el);
  return el;
}

/**
 * Chamar uma vez, no início: consulta a situação dos relatos (o que acende o ponto do menu ⋯) e mostra o aviso das
 * novidades ainda não avisadas, se {@code canNotify} deixar. Sem poder avisar agora, nada é marcado: fica para a próxima.
 */
export async function checkMyReports(canNotify: () => boolean) {
  const { reports } = await refreshMyReports(contaSessao()?.token ?? null);
  const fresh = unnotifiedReports(reports);
  if (!fresh.length || !canNotify()) return;
  showMyReportsNotice(fresh);
  markNotified(fresh);
}
