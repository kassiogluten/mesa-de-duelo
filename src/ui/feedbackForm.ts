import { esc } from './cardtext';
import { VERSION } from './changelog';
import { DESCRIPTION_LIMIT, buildReport, recordingSize, sendReport, type FeedbackKind, type MatchAttachment } from '../feedback';
import './feedbackForm.css';

export interface FeedbackFormOptions {
  kind?: FeedbackKind;
  from: 'inicio' | 'partida';
  /** A partida que pode ir junto: a que está na mesa ou a última guardada no aparelho. */
  match(): Promise<MatchAttachment | null>;
  /** Marca "Anexar a partida" de saída (erro durante a partida, "Relatar este erro"). */
  attach?: boolean;
  /** Relatório do painel "Erros da partida", quando relatado de lá. */
  diagnostics?: string;
}

const FORMATS: Record<string, string> = { commander: 'Commander', standard: 'Standard', pauper: 'Pauper', sacola50: 'Sacola 50', free: 'Livre' };
const closeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';

function when(at: number) {
  const date = new Date(at), today = new Date();
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return date.toDateString() === today.toDateString() ? `de hoje às ${time}` : `de ${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${time}`;
}
const kb = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;

let open: HTMLElement | null = null;

/** Formulário curto de sugestão ou erro, sobre a tela inicial ou a partida. Enviar não pausa a partida. */
export function openFeedbackForm(options: FeedbackFormOptions) {
  open?.remove();
  const returnFocus = document.activeElement as HTMLElement | null;
  const overlay = document.createElement('div');
  overlay.className = 'feedback-overlay';
  overlay.innerHTML = `<section class="feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="fbTitle">
    <header class="feedback-heading"><h2 id="fbTitle">Enviar sugestão ou erro</h2><button type="button" class="feedback-close" data-fb="close" aria-label="Fechar">${closeIcon}</button></header>
    <form class="feedback-form" novalidate>
      <fieldset class="feedback-kind"><legend class="sr-only">Tipo de relato</legend>
        <label><input type="radio" name="fbKind" value="sugestao"><span>Sugestão</span></label>
        <label><input type="radio" name="fbKind" value="erro"><span>Algo deu errado</span></label>
      </fieldset>
      <label class="feedback-label" for="fbText">Descrição</label>
      <textarea id="fbText" rows="5" maxlength="${DESCRIPTION_LIMIT}" required aria-describedby="fbCount fbError" placeholder="O que você fez e o que aconteceu?"></textarea>
      <div class="feedback-under"><p id="fbError" class="feedback-error" hidden></p><p id="fbCount" class="feedback-count"></p></div>
      <div class="feedback-attach" hidden>
        <label class="feedback-check"><input type="checkbox" id="fbAttach" aria-describedby="fbMatch"><span>Anexar a partida</span></label>
        <p id="fbMatch"></p>
      </div>
      <p class="feedback-what" id="fbWhat"></p>
      <p class="feedback-status" id="fbStatus" role="status" aria-live="polite"></p>
      <footer class="feedback-actions"><button type="button" class="arena-btn secondary" data-fb="close">Cancelar</button><button type="submit" class="arena-btn primary">Enviar</button></footer>
    </form>
  </section>`;
  document.body.append(overlay);
  open = overlay;
  const $ = <T extends HTMLElement>(sel: string) => overlay.querySelector<T>(sel)!;
  const text = $<HTMLTextAreaElement>('#fbText'), attach = $<HTMLInputElement>('#fbAttach'), status = $('#fbStatus'), error = $('#fbError');
  let kind: FeedbackKind = options.kind ?? 'sugestao';
  let attachTouched = false, sending = false;
  let match: MatchAttachment | null = null;

  const close = () => {
    if (open === overlay) open = null;
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    returnFocus?.focus?.({ preventScroll: true });
  };
  function sync() {
    overlay.querySelectorAll<HTMLInputElement>('[name="fbKind"]').forEach(input => { input.checked = input.value === kind; });
    text.placeholder = kind === 'erro' ? 'O que você fez e o que aconteceu?' : 'Qual é a sua ideia?';
    const length = text.value.length;
    $('#fbCount').textContent = `${length.toLocaleString('pt-BR')} de ${DESCRIPTION_LIMIT.toLocaleString('pt-BR')}`;
    $('#fbWhat').innerHTML = `<strong>O que vai junto:</strong> o texto que você escreveu, a versão do jogo e o tipo de aparelho (navegador, tamanho da tela, toque e se o jogo está instalado)${attach.checked && match
      ? '. Com a partida, também o seu deck, os apelidos dos jogadores e as jogadas que você viu, para conseguirmos repetir o que aconteceu na mesa' : ''}. Nada de e-mail, conta ou IP.`;
  }
  function showError(message: string) { error.textContent = message; error.hidden = !message; text.setAttribute('aria-invalid', String(!!message)); }

  overlay.addEventListener('change', e => {
    const target = e.target as HTMLInputElement;
    if (target.name === 'fbKind') {
      kind = target.value === 'erro' ? 'erro' : 'sugestao';
      // Um erro durante a partida vai com ela; uma sugestão, não. Só enquanto o jogador não mexeu na caixa.
      if (!attachTouched && match) attach.checked = kind === 'erro' && (options.attach ?? options.from === 'partida');
    }
    if (target === attach) attachTouched = true;
    sync();
  });
  text.addEventListener('input', () => { if (text.value.trim()) showError(''); sync(); });
  overlay.addEventListener('click', e => { if ((e.target as HTMLElement).closest('[data-fb="close"]') && !sending) close(); });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !sending) { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    // Foco preso na janela, como nas outras janelas do jogo.
    const focusable = [...overlay.querySelectorAll<HTMLElement>('button, input, textarea, summary, [tabindex]:not([tabindex="-1"])')].filter(el => !el.closest('[hidden]') && !(el as HTMLButtonElement).disabled);
    const first = focusable[0], last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  };
  document.addEventListener('keydown', onKey, true);

  $('form').addEventListener('submit', async e => {
    e.preventDefault();
    if (sending) return;
    const description = text.value.trim();
    if (!description) { showError('Escreva o que aconteceu ou a sua ideia.'); text.focus(); return; }
    sending = true;
    const submit = $<HTMLButtonElement>('button[type="submit"]');
    submit.disabled = true; submit.textContent = 'Enviando…'; status.textContent = 'Enviando o relato…';
    const attached = attach.checked && match ? match : null;
    let result;
    try {
      const report = buildReport({ kind, description, from: options.from, version: VERSION, recording: attached?.recording ?? null, diagnostics: options.diagnostics });
      result = await sendReport(report, attached ?? undefined);
    } catch {
      result = { status: 'rejected' as const, text: 'Não consegui preparar o relato. Tente de novo.' };
    }
    sending = false;
    if (result.status === 'rejected') {
      submit.disabled = false; submit.textContent = 'Enviar'; status.textContent = ''; showError(result.text); return;
    }
    $('.feedback-form').innerHTML = `<div class="feedback-done">
      <p class="feedback-done-title">${result.status === 'sent' ? `Relato <strong>${esc(result.code)}</strong> enviado. Obrigado!` : 'Guardado; envio quando a conexão voltar.'}</p>
      <p>${result.status === 'sent' ? 'Se quiser falar com a gente sobre ele, cite o código.' : esc(result.text)}</p>
      <footer class="feedback-actions"><button type="button" class="arena-btn primary" data-fb="close">Fechar</button></footer></div>`;
    $('.feedback-done [data-fb="close"]').focus();
  });

  sync();
  text.focus();
  void options.match().then(async found => {
    if (!overlay.isConnected || !found?.recording.frames.length) return;
    match = found;
    const meta = found.recording.meta;
    attach.checked = kind === 'erro' && (options.attach ?? options.from === 'partida');
    $('.feedback-attach').hidden = false;
    const label = `Partida${meta.format ? ` de ${FORMATS[meta.format] ?? meta.format}` : ''} ${when(found.recording.startedAt)}`;
    $('#fbMatch').textContent = `${label} · calculando o tamanho…`;
    sync();
    try { $('#fbMatch').textContent = `${label} · cerca de ${kb(await recordingSize(found.recording))}`; }
    catch { $('#fbMatch').textContent = label; }
  });
}
