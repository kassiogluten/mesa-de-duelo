import type { FState } from '../forge/client';

export const TURN_NOTICE_KEY = 'mesa:turnNotice';
const FLASH_MS = 1000;
const ICON = `${import.meta.env?.BASE_URL ?? '/'}pwa-192x192.png`;

export type NoticePermission = 'unsupported' | 'default' | 'granted' | 'denied';
type TurnState = Pick<FState, 'turn' | 'activePlayer' | 'you' | 'gameOver' | 'matchId' | 'session'>;

/** Um valor por turno seu; vazio no turno dos outros e fora do jogo. Mudou e não está vazio: começou um turno seu. */
export function myTurnKey(s: TurnState): string {
  if (s.gameOver || !(s.turn > 0) || s.activePlayer !== s.you) return '';
  return `${s.matchId ?? s.session?.code ?? ''}:${s.turn}`;
}

/** Só a escolha guardada liga a notificação; sem escolha, vale a permissão que o navegador já deu. */
export function noticeEnabled(saved: string | null, permission: NoticePermission): boolean {
  if (permission !== 'granted') return false;
  return saved !== 'off';
}

function permission(): NoticePermission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

/**
 * Aviso de "Seu turno" com a mesa em outra aba ou janela: o título da aba pisca até o jogador voltar e,
 * se ele ligou a opção e o navegador permite, aparece uma notificação do sistema.
 */
export function createTurnNotice() {
  let saved: string | null = null;
  try { saved = localStorage.getItem(TURN_NOTICE_KEY); } catch { /* Storage is optional. */ }
  let lastKey = '';
  let baseTitle = document.title;
  let flashTimer = 0;
  let shown: Notification | null = null;

  const away = () => document.hidden || !document.hasFocus();
  function stopFlash() {
    if (!flashTimer) return;
    clearInterval(flashTimer); flashTimer = 0;
    document.title = baseTitle;
  }
  function clear() {
    stopFlash();
    shown?.close(); shown = null;
  }
  function flash() {
    if (flashTimer) return;
    baseTitle = document.title;
    let on = true;
    document.title = `Seu turno! · ${baseTitle}`;
    flashTimer = window.setInterval(() => {
      on = !on;
      document.title = on ? `Seu turno! · ${baseTitle}` : baseTitle;
    }, FLASH_MS);
  }
  function notify(turn: number) {
    if (!noticeEnabled(saved, permission())) return;
    const options: NotificationOptions = { body: `Turno ${turn}: a mesa está esperando a sua jogada.`, icon: ICON, tag: 'mesa-seu-turno' };
    try {
      shown?.close();
      shown = new Notification('Seu turno', options);
      shown.onclick = () => { window.focus(); clear(); };
    } catch {
      // Celulares só mostram notificações pelo service worker.
      void navigator.serviceWorker?.ready.then(r => r.showNotification('Seu turno', options)).catch(() => {});
    }
  }

  window.addEventListener('focus', clear);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && document.hasFocus()) clear(); });

  return {
    get permission() { return permission(); },
    get enabled() { return noticeEnabled(saved, permission()); },
    /** Chamado a cada estado da partida. */
    observe(s: TurnState) {
      const key = myTurnKey(s);
      if (key && key !== lastKey && away()) { flash(); notify(s.turn); }
      if (!key) clear();
      lastKey = key;
    },
    /** Liga ou desliga a notificação do sistema; ligar pede a permissão (precisa vir de um clique). */
    async setEnabled(on: boolean) {
      if (on && permission() === 'default') await Notification.requestPermission().catch(() => 'default');
      saved = on ? 'on' : 'off';
      try { localStorage.setItem(TURN_NOTICE_KEY, saved); } catch { /* Storage is optional. */ }
    },
    reset() { lastKey = ''; clear(); },
  };
}
