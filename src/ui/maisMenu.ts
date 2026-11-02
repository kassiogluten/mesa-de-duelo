import { ligarTemaItens, temaItemsHTML, temasDisponiveis } from './temas';

const DOTS = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
const BALAO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4V5Z"/></svg>';
const FRASCO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';

/** Botão ⋯ do cabeçalho: o que se usa de vez em quando (relatar, Laboratório, tema da mesa), fora da linha das abas. */
export function mountMaisMenu(slot: HTMLElement, onFeedback: () => void) {
  slot.classList.add('tema', 'mais');
  slot.innerHTML = `<button type="button" class="news-btn tema-btn mais-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Mais opções" title="Mais opções">${DOTS}</button>`
    + `<div class="tema-menu mais-menu" role="menu" aria-label="Mais opções" hidden>`
    + `<button type="button" role="menuitem" data-mais="feedback">${BALAO}<span>Enviar sugestão ou erro</span></button>`
    + `<button type="button" role="menuitem" data-mais="lab">${FRASCO}<span>Laboratório</span></button>`
    + (temasDisponiveis() ? `<p class="mais-grupo" role="presentation">Tema da mesa</p><div role="group" aria-label="Tema da mesa">${temaItemsHTML()}</div>` : '')
    + `</div>`;
  const button = slot.querySelector<HTMLButtonElement>('.mais-btn')!, menu = slot.querySelector<HTMLElement>('.mais-menu')!;
  const marcar = ligarTemaItens(menu);
  const outside = (e: Event) => { if (!slot.contains(e.target as Node)) fechar(); };
  const teclas = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { fechar(); button.focus(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const itens = [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')];
    const i = itens.indexOf(document.activeElement as HTMLElement);
    itens[(i + (e.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length]?.focus();
  };
  const fechar = () => {
    menu.hidden = true; button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', teclas);
  };
  button.addEventListener('click', () => {
    if (!menu.hidden) { fechar(); return; }
    marcar();
    menu.hidden = false; button.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', teclas);
    menu.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
  });
  menu.addEventListener('click', e => {
    const item = (e.target as HTMLElement).closest<HTMLElement>('[data-mais]')?.dataset.mais;
    if (item !== 'feedback' && item !== 'lab') return;
    fechar();
    // O Laboratório é uma tela própria; quem a abre é o main.ts.
    if (item === 'lab') dispatchEvent(new CustomEvent('mesa:laboratorio'));
    else onFeedback();
  });
}
