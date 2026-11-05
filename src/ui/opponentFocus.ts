// Oponente em foco: o campo dele em tela cheia, só para olhar (item 69). Abre pelo botão do assento, troca de oponente
// pelas setas no título e, ao fechar, o foco volta para o botão que abriu.
import { hideCardPreview } from './cardInspector';
import type { TableCtx } from './tableContext';

export function createOpponentFocus(d: Pick<TableCtx, 'root' | '$' | 'renderTable'>) {
  let focusSeat: number | null = null;
  let focusReturn: HTMLElement | null = null;
  function open(id: number) {
    if (focusSeat === null) focusReturn = document.activeElement as HTMLElement | null;
    focusSeat = id;
    hideCardPreview(true);
    d.renderTable();
    d.$('#fFocus').querySelector<HTMLElement>('.focus-close')?.focus({ preventScroll: true });
  }
  function close() {
    if (focusSeat === null) return;
    const id = focusSeat;
    focusSeat = null;
    hideCardPreview(true);
    d.renderTable();
    const back = focusReturn?.isConnected && d.root.contains(focusReturn) ? focusReturn : d.root.querySelector<HTMLElement>(`[data-focus-seat="${id}"]`);
    back?.focus({ preventScroll: true });
    focusReturn = null;
  }
  return {
    open, close,
    /** O oponente em foco (null: nenhum). */
    seat: () => focusSeat,
    /** O oponente em foco saiu da partida: o foco fecha sem redesenhar. */
    drop() { focusSeat = null; },
  };
}
export type OpponentFocus = ReturnType<typeof createOpponentFocus>;
