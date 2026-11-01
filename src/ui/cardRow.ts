/**
 * Fileiras de cartas das janelas de escolha (item 57): no celular, as cartas ficam numa fileira só que rola de
 * lado. A borda do lado que ainda tem cartas escurece (classes more-start e more-end) e a posição da fileira
 * sobrevive quando a janela é redesenhada (uma carta marcada não faz a fileira voltar ao começo).
 */
export const CARD_ROWS = '.q-opts.cards:not(.filtered):not(.vote-opts), .trigger-row';

/** Liga a sombra de cada borda conforme ainda há cartas escondidas daquele lado. */
export function syncRowEdges(row: HTMLElement) {
  const max = row.scrollWidth - row.clientWidth;
  const left = Math.abs(row.scrollLeft);
  row.classList.toggle('more-start', max > 1 && left > 1);
  row.classList.toggle('more-end', max > 1 && left < max - 1);
}

/**
 * Também marca a janela que rola para baixo (scrolls): só aí os botões presos ganham o fundo escuro que os
 * separa das cartas passando por trás.
 */
export function syncAllRowEdges(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(CARD_ROWS).forEach(syncRowEdges);
  root.querySelectorAll<HTMLElement>('.question').forEach(q => q.classList.toggle('scrolls', q.scrollHeight > q.clientHeight + 1));
}

/** Acompanha a rolagem de todas as fileiras dentro de root (o evento de rolagem não sobe: escuta na captura). */
export function watchRowEdges(root: HTMLElement) {
  root.addEventListener('scroll', e => {
    const row = e.target as HTMLElement;
    if (row.matches?.(CARD_ROWS)) syncRowEdges(row);
  }, { capture: true, passive: true });
  window.addEventListener('resize', () => syncAllRowEdges(root));
}

/** Posição de cada fileira, para devolver depois de redesenhar a mesma janela. */
export function rowScroll(container: ParentNode | null | undefined): number[] {
  return container ? [...container.querySelectorAll<HTMLElement>(CARD_ROWS)].map(row => row.scrollLeft) : [];
}

export function restoreRowScroll(container: ParentNode, saved: number[]) {
  container.querySelectorAll<HTMLElement>(CARD_ROWS).forEach((row, i) => { if (saved[i]) row.scrollLeft = saved[i]; });
}
