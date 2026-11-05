// O que a mesa avisa por cima do jogo: o destaque da decisão que segura a partida (com o lembrete se ela ficar parada),
// a faixa de turno novo (e de combate extra) e os avisos que aparecem e somem no canto.
import type { FCard, FState, NoticeDetail } from '../forge/client';
import { esc } from './cardtext';
import { label } from './cardFaces';
import { awaitingDecision, waitingOnText } from './awaitingDecision';
import { turnBannerText } from './phaseHud';

const q = (root: HTMLElement, sel: string) => root.querySelector(sel) as HTMLElement;

/**
 * Decisão que segura a partida: aviso no centro da mesa, caixa de ação em destaque, o resto da mesa esmaecido
 * e, se ela ficar parada, um lembrete com som. Com outro jogador decidindo, o aviso diz por quem a mesa espera.
 */
export function createAwaitingCallout(root: HTMLElement, cue: () => void) {
  /** Decisão em espera (prompt e tipo) e o lembrete que reforça o aviso se ela ficar parada. */
  let awaitKey = '';
  let awaitTimer = 0;
  const AWAIT_REMINDER_MS = 8000;
  return function renderAwaiting(s: FState, text: string) {
    const awaiting = awaitingDecision(s);
    const arena = root.querySelector<HTMLElement>('.arena')!;
    const action = q(root, '#fAction');
    const callout = q(root, '#fAwait');
    // Na abertura, o título no centro já diz quem está decidindo; o aviso cairia em cima da mão.
    const waitingOn = awaiting || s.input.openingWait ? '' : waitingOnText(s);
    arena.classList.toggle('awaiting-decision', !!awaiting);
    // Só esmaece quando há cartas para escolher; numa pergunta de sim/não a mesa continua normal.
    arena.classList.toggle('focus-choices', !!awaiting && awaiting.kind !== 'confirm' && s.input.selectable.length > 0);
    action.classList.toggle('awaiting', !!awaiting);
    action.classList.toggle('centered-decision', !!awaiting?.centered && !s.input.suspendCast);
    if (awaiting) { action.setAttribute('role', awaiting.centered ? 'dialog' : 'region'); action.setAttribute('aria-label', 'Sua decisão'); }
    else { action.removeAttribute('role'); action.removeAttribute('aria-label'); }
    callout.classList.toggle('waiting-on', !awaiting && !!waitingOn);
    callout.querySelector('.await-text')!.textContent = awaiting ? text.replace(/\s+/g, ' ').trim() || 'Escolha para continuar.' : waitingOn;
    // A pergunta centralizada já está no meio da mesa: o aviso só repetiria o texto em cima dela.
    callout.hidden = !(awaiting && !awaiting.centered) && !waitingOn;
    const key = awaiting ? `${s.matchId ?? ''}:${s.input.gen}:${awaiting.kind}` : '';
    if (key !== awaitKey) {
      awaitKey = key;
      clearTimeout(awaitTimer);
      arena.classList.remove('decision-stale');
      if (key) awaitTimer = window.setTimeout(() => {
        if (awaitKey !== key) return;
        arena.classList.add('decision-stale');
        cue();
      }, AWAIT_REMINDER_MS);
    }
    return awaiting;
  };
}

/** A faixa de turno novo (ou "Combate extra"), com o anúncio falado numa região própria e o pulso no número do turno. */
export function createTurnBanner(root: HTMLElement) {
  let bannerTimer = 0;
  return function showBanner(s: FState, newTurn: boolean) {
    const el = q(root, '#fBanner');
    el.textContent = newTurn ? turnBannerText(s) : 'Combate extra';
    // Reinicia a animação mesmo se o banner anterior ainda estiver na tela. Só visual: não segura a fila de eventos.
    el.className = 'banner';
    void el.offsetWidth;
    el.className = `banner ${s.activePlayer === s.you ? 'mine' : 'theirs'}`;
    el.hidden = false;
    // A faixa é só visual: o leitor de tela ouve a troca de turno numa região própria, limpa antes para repetir a frase.
    if (newTurn) {
      const spoken = q(root, '#fTurnAnnouncement');
      spoken.textContent = '';
      window.setTimeout(() => { spoken.textContent = turnBannerText(s); }, 50);
    }
    clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => { el.hidden = true; }, 1200);
    // Pulso discreto no número do turno da trilha.
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.querySelector<HTMLElement>('#fPhases .phase-turn-badge')?.animate?.(
        [{ transform: 'scale(1)', boxShadow: '0 0 0 0 #fff0' }, { transform: 'scale(1.35)', boxShadow: '0 0 0 5px #ffffff40' }, { transform: 'scale(1)', boxShadow: '0 0 0 0 #fff0' }],
        { duration: 600, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  };
}

/** Os avisos do canto. Os com detalhe (ataque recusado e afins) mostram a carta, que abre ao toque. */
export function createToasts(root: HTMLElement, d: { findCard(id: number): FCard | undefined; image(name: string | undefined, size: 'small' | 'normal', print?: FCard['print']): string | undefined; setHTML(el: HTMLElement, html: string): void }) {
  /** Cartas mostradas nos avisos com detalhe, para o toque na miniatura abrir a carta. */
  const noticeCards = new Map<string, FCard>();
  let noticeSeq = 0;
  function show(text: string, error: boolean, detail?: NoticeDetail) {
    const el = document.createElement('div');
    el.className = `toast ${error ? 'error' : ''}`;
    if (!detail) el.textContent = text;
    else {
      // Ataque recusado e afins: o motivo por extenso e a carta que o causou; fica mais tempo e some ao tocar.
      const keys: string[] = [];
      const thumbs = (detail.cards ?? []).slice(0, 3).map(ref => {
        const c = d.findCard(ref.id) ?? ({ id: ref.id, name: ref.name } as FCard);
        const key = `nt${++noticeSeq}`;
        noticeCards.set(key, c); keys.push(key);
        const art = c.image ?? d.image(c.name, 'normal', c.print);
        return `<button class="notice-card" data-event="${key}" aria-label="Ver ${esc(label(c))}"${art ? ` style="background-image:url('${art}')"` : ''}>${art ? '' : `<span>${esc(label(c))}</span>`}</button>`;
      }).join('');
      el.classList.add('detailed');
      el.setAttribute('role', 'alert');
      d.setHTML(el, `${thumbs ? `<div class="notice-cards">${thumbs}</div>` : ''}<div class="notice-text">${detail.title ? `<strong>${esc(detail.title)}</strong>` : ''}<span>${esc(text)}</span></div>`);
      const dismiss = () => { el.classList.add('out'); setTimeout(() => { el.remove(); keys.forEach(key => noticeCards.delete(key)); }, 400); };
      el.addEventListener('click', e => { if (!(e.target as HTMLElement).closest('[data-event]')) dismiss(); });
      q(root, '#fToasts').append(el);
      setTimeout(dismiss, 8000);
      return;
    }
    q(root, '#fToasts').append(el);
    setTimeout(() => el.classList.add('out'), 4100);
    setTimeout(() => el.remove(), 4500);
  }
  return { show, card: (key: string) => noticeCards.get(key) };
}
