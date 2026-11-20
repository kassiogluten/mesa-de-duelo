// Faixa do aviso do servidor (manutenção, reinício marcado): fixa no alto de qualquer tela, com o texto e a contagem.
import type { ServerNoticeData } from '../forge/client';
import { bridgeHttpUrl } from '../forge/client';
import { KEYS, loadJSON, saveJSON } from '../storage';
import { esc } from './cardtext';
import { ICON_CLOSE } from './icons';
import './serverNotice.css';

const ICON_WRENCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L4 16.7 7.3 20l5.3-5.3a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.4-.6-.6-2.4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';

/** Até quando a faixa fica depois do horário (o mesmo do servidor, ServerNotice.java): o reinício pode atrasar. */
export const EXPIRES_AFTER_MS = 10 * 60_000;
/** De quanto em quanto tempo a tela pergunta ao servidor (GET /api/aviso), para quem não está conectado a uma partida. */
const POLL_MS = 2 * 60_000;

/** Em que fase está o aviso: a faixa fechada volta sozinha quando ele muda de fase (a 5 min e a 1 min do horário). */
export type NoticeStage = 'far' | 'soon' | 'imminent' | 'past';
export function noticeStage(at: number | undefined, now: number): NoticeStage {
  if (!at) return 'far';
  const left = at - now;
  return left <= 0 ? 'past' : left <= 60_000 ? 'imminent' : left <= 5 * 60_000 ? 'soon' : 'far';
}

/** O horário no relógio de quem lê ("23:30"). */
export function clockTime(at: number) {
  return new Date(at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** O texto do admin, com {hora} trocado pelo horário no fuso de quem lê. */
export function noticeText(n: ServerNoticeData) {
  return n.at ? n.text.split('{hora}').join(clockTime(n.at)) : n.text;
}

/** Quanto falta: "em 12 min", "em 1 h 05 min", "em instantes", "agora". */
export function countdown(at: number, now: number) {
  const left = at - now;
  if (left <= 0) return 'agora';
  const minutes = Math.ceil(left / 60_000);
  if (minutes <= 1) return 'em instantes';
  if (minutes < 60) return `em ${minutes} min`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m ? `em ${h} h ${String(m).padStart(2, '0')} min` : `em ${h} h`;
}

/** O aviso ainda vale nesta tela (o relógio do aparelho pode estar um pouco diferente do servidor). */
export function noticeAlive(n: ServerNoticeData, now: number) {
  return !n.at || now <= n.at + EXPIRES_AFTER_MS;
}

/** A faixa: ícone, texto, a contagem (quando há horário) e o fechar. */
export function noticeHTML(n: ServerNoticeData, now: number) {
  const stage = noticeStage(n.at, now);
  const when = n.at ? `<span class="server-notice-when">${stage === 'past' ? 'Reiniciando…' : `${esc(clockTime(n.at))} · ${esc(countdown(n.at, now))}`}</span>` : '';
  return `<span class="server-notice-icon">${ICON_WRENCH}</span><p class="server-notice-text">${esc(noticeText(n))}</p>${when}<button type="button" class="server-notice-close" data-server-notice="close" aria-label="Fechar o aviso" title="Fechar o aviso">${ICON_CLOSE}</button>`;
}

/** Quem fechou a faixa: o aviso e a fase em que ele estava. */
interface Dismissed { id: string; stage: NoticeStage }

export function shouldShow(n: ServerNoticeData | null, dismissed: Dismissed | null, now: number) {
  if (!n || !noticeAlive(n, now)) return false;
  return !dismissed || dismissed.id !== n.id || dismissed.stage !== noticeStage(n.at, now);
}

/**
 * A faixa da página: recebe o aviso pelo WebSocket (quem está numa partida ou sala) e pergunta ao servidor de tempos
 * em tempos (quem está na tela inicial). Uma só por página, presa ao body, por cima de qualquer tela.
 */
function createServerNotice() {
  let current: ServerNoticeData | null = null;
  let el: HTMLElement | null = null;
  let timer = 0;
  /** O conteúdo que está na faixa agora. */
  let shown = '';

  function render() {
    const now = Date.now();
    // Enquanto o aviso vale, confere a cada 5 s: a contagem anda, a faixa fechada volta ao mudar de fase e acompanha a
    // barra do topo da mesa quando a partida começa ou acaba.
    if (current && noticeAlive(current, now)) { if (!timer) timer = window.setInterval(render, 5_000); }
    else { clearInterval(timer); timer = 0; }
    const show = shouldShow(current, loadJSON<Dismissed | null>(KEYS.avisoServidor, null), now);
    if (!show || !current) { if (el) el.hidden = true; return; }
    if (!el) {
      el = document.createElement('div');
      el.className = 'server-notice';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.addEventListener('click', e => {
        if (!(e.target as Element).closest('[data-server-notice="close"]') || !current) return;
        saveJSON(KEYS.avisoServidor, { id: current.id, stage: noticeStage(current.at, Date.now()) } satisfies Dismissed);
        render();
      });
      document.body.append(el);
    }
    el.dataset.stage = noticeStage(current.at, now);
    // Só troca o conteúdo quando ele muda: a região é lida pelo leitor de tela a cada troca.
    const html = noticeHTML(current, now);
    if (shown !== html) { el.innerHTML = html; shown = html; }
    el.hidden = false;
    place(el);
  }

  /** Na mesa, logo abaixo da barra do topo (menu, desfazer, relógio); nas outras telas, no alto. */
  function place(banner: HTMLElement) {
    const bar = [...document.querySelectorAll<HTMLElement>('.forge .topbar')].find(b => b.getClientRects().length > 0);
    const bottom = bar?.getBoundingClientRect().bottom ?? 0;
    banner.style.top = bottom > 0 ? `${Math.round(bottom + 8)}px` : '';
  }

  /** O aviso que o servidor mandou (null: retirado). */
  function set(n: ServerNoticeData | null) {
    current = n && typeof n.id === 'string' && typeof n.text === 'string' ? n : null;
    render();
  }

  async function poll() {
    if (document.hidden) return;
    try {
      const response = await fetch(bridgeHttpUrl('/api/aviso'), { cache: 'no-store' });
      if (!response.ok) return;
      const body = await response.json() as { notice?: ServerNoticeData | null };
      set(body.notice ?? null);
    } catch { /* servidor fora do ar: fica o que havia */ }
  }

  /** Começa a perguntar ao servidor (uma vez por página). */
  function watch() {
    void poll();
    window.setInterval(() => void poll(), POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void poll(); });
  }

  return { set, watch };
}

export const serverNotice = createServerNotice();
