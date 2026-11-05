// A tela de ordenar gatilhos, no teclado e no arraste: as setas (e Home/End) movem o gatilho com o foco, arrastar para os
// lados o leva a outra posição, e um toque o põe na próxima posição livre. O leitor de tela ouve a posição nova.
import type { FQuestion, ForgeClient } from '../forge/client';
import { label } from './cardFaces';
import { hideCardPreview } from './cardInspector';
import { isTriggerOrder, moveTrigger, positionText, tapTrigger, type TriggerOrder } from './choiceScreens';

export interface TriggerOrderDeps {
  client(): ForgeClient | null;
  /** A ordem sendo montada para a pergunta aberta (guardada pela mesa). */
  order(q: FQuestion): TriggerOrder;
  render(): void;
  announce(text: string): void;
}

export function attachTriggerOrder(root: HTMLElement, d: TriggerOrderDeps) {
  /** O clique que termina um arraste não conta como toque. */
  let suppressTriggerClick = false;
  function focusTrigger(option: number) { root.querySelector<HTMLElement>(`[data-trigger="${option}"]`)?.focus({ preventScroll: false }); }
  function announceTrigger(q: FQuestion, option: number) {
    const order = d.order(q).order, pos = order.indexOf(option), o = q.options?.[option];
    const name = typeof o !== 'string' && o?.card ? label(o.card) : 'Gatilho';
    d.announce(`${name}: posição ${pos + 1} de ${order.length}, ${positionText(pos, order.length)}.`);
  }
  root.addEventListener('keydown', e => {
    const card = (e.target as HTMLElement).closest?.<HTMLElement>('[data-trigger]');
    const q = d.client()?.state?.question;
    if (!card || !q || !isTriggerOrder(q) || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    const order = d.order(q), option = Number(card.dataset.trigger), from = order.order.indexOf(option);
    const to = e.key === 'ArrowLeft' ? from - 1 : e.key === 'ArrowRight' ? from + 1 : e.key === 'Home' ? 0 : order.order.length - 1;
    if (moveTrigger(order, from, to)) d.render();
    focusTrigger(option); announceTrigger(q, option);
  }, true);
  root.addEventListener('pointerdown', e => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('[data-trigger]');
    const q = d.client()?.state?.question;
    if (!card || !q || !isTriggerOrder(q) || e.button !== 0) return;
    const row = card.closest<HTMLElement>('.trigger-row')!;
    const option = Number(card.dataset.trigger), startX = e.clientX, startY = e.clientY;
    const slot = card.closest<HTMLElement>('.trigger-slot')!;
    let dragging = false;
    const targetIndex = (x: number) => {
      const slots = [...row.querySelectorAll<HTMLElement>('.trigger-slot')].filter(el => el !== slot);
      return slots.filter(el => { const r = el.getBoundingClientRect(); return x > r.left + r.width / 2; }).length;
    };
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (!dragging && Math.hypot(dx, ev.clientY - startY) < 10) return;
      if (!dragging) {
        // Na vertical, o gesto é rolar a página; só arrasta quando o movimento é para os lados.
        if (Math.abs(ev.clientY - startY) > Math.abs(dx)) { stop(); return; }
        dragging = true; slot.classList.add('dragging'); hideCardPreview(true);
        try { card.setPointerCapture(ev.pointerId); } catch { /* sem captura, o arraste continua pelo root */ }
      }
      slot.style.transform = `translateX(${dx}px)`;
      const to = targetIndex(ev.clientX);
      row.querySelectorAll<HTMLElement>('.trigger-slot').forEach(el => el.classList.toggle('drop-before', el !== slot && [...row.children].filter(c => c !== slot).indexOf(el) === to));
    };
    const stop = () => { root.removeEventListener('pointermove', move); root.removeEventListener('pointerup', up); root.removeEventListener('pointercancel', stop); };
    const up = (ev: PointerEvent) => {
      stop();
      if (!dragging) return;
      suppressTriggerClick = true; setTimeout(() => { suppressTriggerClick = false; }, 0);
      const order = d.order(q), from = order.order.indexOf(option);
      slot.style.transform = '';
      if (!moveTrigger(order, from, targetIndex(ev.clientX))) slot.classList.remove('dragging');
      d.render(); focusTrigger(option); announceTrigger(q, option);
    };
    root.addEventListener('pointermove', move); root.addEventListener('pointerup', up); root.addEventListener('pointercancel', stop);
  });
  return {
    /** Toque num gatilho: vai para a próxima posição (ou sai dela); o fim de um arraste não conta. */
    tap(q: FQuestion, option: number) {
      if (suppressTriggerClick) { suppressTriggerClick = false; return; }
      if (tapTrigger(d.order(q), option)) { d.render(); focusTrigger(option); announceTrigger(q, option); }
    },
  };
}
