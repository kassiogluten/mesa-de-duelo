import { EVENTS } from '../storage';
import { ligarTemaItens, temaItemsHTML, temasDisponiveis } from './temas';
import { ICON_DOTS, ICON_BALLOON, ICON_TABLE, ICON_FLASK } from './icons';


/** Botão ⋯ do cabeçalho: o que se usa de vez em quando (relatar, Laboratório, tema da mesa), fora da linha das abas. */
export function mountMaisMenu(slot: HTMLElement, onFeedback: () => void) {
  slot.classList.add('tema', 'mais');
  slot.innerHTML = `<button type="button" class="news-btn tema-btn mais-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Mais opções" title="Mais opções">${ICON_DOTS}</button>`
    + `<div class="tema-menu mais-menu" role="menu" aria-label="Mais opções" hidden>`
    + `<button type="button" role="menuitem" data-mais="feedback">${ICON_BALLOON}<span>Enviar sugestão ou erro</span></button>`
    + `<button type="button" role="menuitem" data-mais="lab">${ICON_FLASK}<span>Laboratório</span></button>`
    + `<a role="menuitem" href="/salas.html" data-mais="salas">${ICON_TABLE}<span>Salas e partidas ao vivo</span></a>`
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
    if (item === 'lab') dispatchEvent(new CustomEvent(EVENTS.laboratorio));
    else onFeedback();
  });
}
