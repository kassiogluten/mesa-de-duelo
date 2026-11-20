// A aba Aviso: escreve o aviso do servidor (manutenção, reinício marcado), mostra a prévia da faixa e manda a todos.
import { esc } from '../ui/cardtext';
import { clockTime, countdown, noticeHTML } from '../ui/serverNotice';
import type { ServerNoticeData } from '../forge/client';
import { adminError, adminFetch } from './session';

/** O texto que já vem no campo; {hora} vira o horário no relógio de cada jogador. */
export const NOTICE_TEMPLATE = 'O servidor vai reiniciar para manutenção às {hora}. Termine a partida antes disso: as partidas em andamento serão encerradas.';
const MAX_TEXT = 500;

/** O horário do campo (HH:MM) como instante: hoje, ou amanhã se já passou. */
export function nextAt(time: string, now = new Date()) {
  const [h = NaN, m = NaN] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  const at = new Date(now); at.setHours(h, m, 0, 0);
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
  return at.getTime();
}

/** HH:MM daqui a `minutes`, arredondado para cima em 5 minutos. */
export function timeIn(minutes: number, now = new Date()) {
  const at = new Date(now.getTime() + minutes * 60_000);
  at.setMinutes(Math.ceil(at.getMinutes() / 5) * 5, 0, 0);
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

/** Hoje ou amanhã, para o admin conferir o dia antes de mandar. */
function dayOf(at: number, now = Date.now()) {
  return new Date(at).toDateString() === new Date(now).toDateString() ? 'Hoje' : 'Amanhã';
}

export function mountAdminNotice(section: HTMLElement, onExpired: () => void) {
  let current: ServerNoticeData | null = null;
  let connections = 0;
  let message = '';
  let text = NOTICE_TEMPLATE;
  let time = timeIn(30);

  function draft(): ServerNoticeData { return { id: 'previa', text: text.trim() || ' ', at: time ? nextAt(time) : undefined }; }

  function liveHTML() {
    if (!current) return '<p class="adm-muted">Nenhum aviso no ar.</p>';
    const when = current.at ? ` · ${dayOf(current.at)} às ${esc(clockTime(current.at))} (${esc(countdown(current.at, Date.now()))})` : '';
    return `<p><strong>No ar agora</strong>${when}</p><blockquote class="adm-notice-live">${esc(current.text)}</blockquote>
      <button type="button" class="adm-ghost" data-notice="clear">Retirar o aviso</button>`;
  }

  function previewHTML() {
    const at = time ? nextAt(time) : 0;
    const hint = at ? `${dayOf(at)} às ${esc(clockTime(at))}, ${esc(countdown(at, Date.now()))}.` : 'Sem horário: o aviso fica até ser retirado (e não pode usar {hora}).';
    return `<div class="adm-notice-preview" aria-label="Prévia da faixa"><div class="server-notice">${noticeHTML(draft(), Date.now())}</div></div><p class="adm-muted">${hint}</p>`;
  }

  function render() {
    section.innerHTML = `<div class="adm-head"><h1>Aviso do servidor</h1><button class="adm-ghost" data-notice="reload">Atualizar</button></div>
      <p class="adm-muted">Aparece numa faixa no alto da tela de todos os jogadores: na partida, na sala, assistindo e na tela inicial. Quem fecha a faixa a vê de novo a 5 minutos e a 1 minuto do horário. Ela some sozinha 10 minutos depois do horário.</p>
      <div class="adm-card adm-notice-card">${liveHTML()}<p class="adm-muted">Conexões abertas agora (partidas, salas e quem assiste): <strong>${connections}</strong>. Quem está na tela inicial recebe em até 2 minutos.</p></div>
      <form class="adm-card adm-notice-form" id="admNoticeForm">
        <h2>${current ? 'Trocar o aviso' : 'Novo aviso'}</h2>
        <label>Texto<textarea name="text" rows="3" maxlength="${MAX_TEXT}" aria-describedby="admNoticeHint">${esc(text)}</textarea></label>
        <p class="adm-muted" id="admNoticeHint"><code>{hora}</code> vira o horário no relógio de cada jogador. <span data-notice="count">${text.length}</span>/${MAX_TEXT} caracteres.</p>
        <div class="adm-notice-time">
          <label>Horário<input type="time" name="time" value="${esc(time)}"></label>
          <div class="adm-notice-quick" role="group" aria-label="Daqui a">${[15, 30, 60].map(m => `<button type="button" class="adm-ghost" data-notice-in="${m}">+${m === 60 ? '1 h' : `${m} min`}</button>`).join('')}<button type="button" class="adm-ghost" data-notice-in="0">Sem horário</button></div>
        </div>
        <div data-notice="preview">${previewHTML()}</div>
        <p class="adm-notice" role="status">${esc(message)}</p>
        <div class="adm-form-end"><span></span><button class="arena-btn primary" type="submit">${current ? 'Trocar e mandar para todos' : 'Mandar para todos'}</button></div>
      </form>`;
  }

  function refreshPreview() {
    const preview = section.querySelector<HTMLElement>('[data-notice="preview"]');
    if (preview) preview.innerHTML = previewHTML();
    const count = section.querySelector<HTMLElement>('[data-notice="count"]');
    if (count) count.textContent = String(text.length);
  }

  async function load() {
    try {
      const response = await adminFetch('aviso');
      if (response.status === 401) { onExpired(); return; }
      if (!response.ok) { message = await adminError(response); render(); return; }
      const body = await response.json() as { notice: ServerNoticeData | null; conexoes?: number };
      current = body.notice; connections = body.conexoes ?? 0; message = '';
    } catch { message = 'Não consegui falar com o servidor. Ele está no ar?'; }
    render();
  }

  async function send(method: 'PUT' | 'DELETE', body?: unknown) {
    try {
      const response = await adminFetch('aviso', { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      if (response.status === 401) { onExpired(); return; }
      if (!response.ok) { message = await adminError(response); render(); return; }
      await load();
      message = method === 'PUT' ? 'Aviso mandado para todos.' : 'Aviso retirado das telas.';
      render();
    } catch { message = 'Não consegui falar com o servidor. Ele está no ar?'; render(); }
  }

  section.addEventListener('click', e => {
    const el = e.target as Element;
    const quick = el.closest<HTMLElement>('[data-notice-in]');
    if (quick) { const m = Number(quick.dataset.noticeIn); time = m ? timeIn(m) : ''; section.querySelector<HTMLInputElement>('input[name="time"]')!.value = time; refreshPreview(); return; }
    const act = el.closest<HTMLElement>('[data-notice]')?.dataset.notice;
    if (act === 'reload') void load();
    if (act === 'clear' && confirm('Retirar o aviso da tela de todos os jogadores?')) void send('DELETE');
  });
  section.addEventListener('input', e => {
    const t = e.target as HTMLInputElement | HTMLTextAreaElement;
    if (t.name === 'text') text = t.value;
    else if (t.name === 'time') time = t.value;
    else return;
    refreshPreview();
  });
  section.addEventListener('submit', e => {
    if ((e.target as HTMLFormElement).id !== 'admNoticeForm') return;
    e.preventDefault();
    const at = time ? nextAt(time) : 0;
    const summary = at ? `${dayOf(at).toLowerCase()} às ${clockTime(at)}` : 'sem horário';
    if (!confirm(`Mandar o aviso (${summary}) para todos os jogadores agora?`)) return;
    void send('PUT', { text, at });
  });

  render();
  return { load };
}
