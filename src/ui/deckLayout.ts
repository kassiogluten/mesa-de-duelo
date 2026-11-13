import './deckLayout.css';
import { loadJSON, saveJSON } from '../storage';
import { ICON_GRID, ICON_LIST } from './icons';

/**
 * Como as listas de decks aparecem (tela inicial e Meus decks): em grade, com a quantidade de colunas escolhida, ou em
 * lista, uma linha por deck. O controle fica junto dos filtros e a escolha fica guardada no navegador, uma por tela.
 */

export type DeckLayoutMode = 'grid' | 'list';
export type DeckColumns = 2 | 3 | 4 | 5;
export interface DeckLayout { mode: DeckLayoutMode; cols: DeckColumns }

export const DECK_COLUMNS: DeckColumns[] = [2, 3, 4, 5];
const DEFAULT: DeckLayout = { mode: 'grid', cols: 4 };

/** A escolha guardada, ou a grade de 4 colunas se não houver (ou se o que está guardado não fizer sentido, como o antigo 'auto'). */
export function loadDeckLayout(key: string): DeckLayout {
  const raw = loadJSON<Partial<DeckLayout> | null>(key, null);
  return {
    mode: raw?.mode === 'list' ? 'list' : 'grid',
    cols: DECK_COLUMNS.includes(raw?.cols as DeckColumns) ? raw!.cols as DeckColumns : DEFAULT.cols,
  };
}

const colsLabel = (c: DeckColumns) => `${c} colunas`;
const CHEVRON = '<svg class="deck-layout-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** O botão Grade, que abre o menu das colunas, e o botão Lista. */
export function deckLayoutControlHTML(layout: DeckLayout) {
  const items = DECK_COLUMNS.map(c => `<button type="button" role="menuitemradio" data-deck-layout-cols="${c}" aria-checked="${layout.mode === 'grid' && layout.cols === c}">${colsLabel(c)}</button>`).join('');
  return `<div class="deck-layout" role="group" aria-label="Exibição dos decks"><div class="deck-layout-modes"><button type="button" class="deck-layout-grid" data-deck-layout-menu aria-haspopup="menu" aria-expanded="false" aria-pressed="${layout.mode === 'grid'}" aria-label="Ver em grade: escolher as colunas" title="Grade">${ICON_GRID}${CHEVRON}</button><button type="button" data-deck-layout-mode="list" aria-pressed="${layout.mode === 'list'}" aria-label="Ver em lista" title="Lista">${ICON_LIST}</button></div><div class="deck-layout-menu" role="menu" aria-label="Colunas da grade" hidden>${items}</div></div>`;
}

/** Marca na área dos decks a exibição escolhida; o CSS de cada tela desenha a grade e a lista a partir disso. */
export function applyDeckLayout(target: HTMLElement, layout: DeckLayout) {
  target.dataset.deckLayout = layout.mode;
  if (layout.mode === 'grid') {
    target.dataset.deckCols = String(layout.cols);
    target.style.setProperty('--deck-cols', String(layout.cols));
  } else {
    delete target.dataset.deckCols;
    target.style.removeProperty('--deck-cols');
  }
}

/**
 * Desenha o controle em `host` e o liga à área dos decks: cada mudança atualiza o controle no lugar (sem tirar o
 * foco), a área e o que está guardado. Devolve a escolha atual.
 */
export function mountDeckLayout(host: HTMLElement, target: HTMLElement, key: string, onChange?: (layout: DeckLayout) => void) {
  let layout = loadDeckLayout(key);
  host.innerHTML = deckLayoutControlHTML(layout);
  const trigger = host.querySelector<HTMLButtonElement>('[data-deck-layout-menu]')!, menu = host.querySelector<HTMLElement>('.deck-layout-menu')!;
  const items = () => [...menu.querySelectorAll<HTMLButtonElement>('[data-deck-layout-cols]')];
  const sync = () => {
    trigger.setAttribute('aria-pressed', String(layout.mode === 'grid'));
    host.querySelector('[data-deck-layout-mode="list"]')?.setAttribute('aria-pressed', String(layout.mode === 'list'));
    for (const b of items()) b.setAttribute('aria-checked', String(layout.mode === 'grid' && b.dataset.deckLayoutCols === String(layout.cols)));
    applyDeckLayout(target, layout);
  };
  const set = (next: DeckLayout) => { layout = next; saveJSON(key, layout); sync(); onChange?.(layout); };
  const outside = (e: Event) => { if (!host.contains(e.target as Node)) close(false); };
  function open() {
    menu.hidden = false; trigger.setAttribute('aria-expanded', 'true');
    (items().find(b => b.getAttribute('aria-checked') === 'true') ?? items()[0])?.focus();
    document.addEventListener('pointerdown', outside, true);
  }
  function close(focus = true) {
    if (menu.hidden) return;
    menu.hidden = true; trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    if (focus) trigger.focus();
  }
  host.addEventListener('click', e => {
    const el = e.target as Element;
    if (el.closest('[data-deck-layout-menu]')) { if (menu.hidden) open(); else close(); return; }
    const item = el.closest<HTMLButtonElement>('[data-deck-layout-cols]');
    if (item) { const c = item.dataset.deckLayoutCols!; set({ mode: 'grid', cols: Number(c) as DeckColumns }); close(); return; }
    if (el.closest('[data-deck-layout-mode="list"]')) set({ ...layout, mode: 'list' });
  });
  host.addEventListener('keydown', e => {
    if (menu.hidden) return;
    const list = items(), i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]?.focus(); }
    else if (e.key === 'Tab') close(false);
  });
  host.addEventListener('focusout', e => { if (!host.contains(e.relatedTarget as Node | null) && e.relatedTarget) close(false); });
  sync();
  return layout;
}
