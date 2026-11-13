import { EVENTS } from '../storage';
import { ownArtEnabled, setOwnArtEnabled } from '../scryfallCards';
import { openOwnArtGallery } from './ownArtGallery';
import { ligarTemaItens, temaItemsHTML, temasDisponiveis } from './temas';
import { ICON_DOTS, ICON_BALLOON, ICON_TABLE, ICON_FLASK, ICON_REPLAY } from './icons';
import { hasUnseenReports } from '../myReports';
import { openMyReportsDialog } from './myReportsDialog';

/** Caixa de entrada: o item Meus relatos. */
const ICON_INBOX = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13 6.5 5h11L20 13v6H4v-6Z"/><path d="M4 13h5a3 3 0 0 0 6 0h5"/></svg>';

/** Leque de cartas: o item Ver a série das cartas da mesa. */
const ICON_CARDS = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="10" height="14" rx="1.5"/><path d="M9 3.5h9.5A1.5 1.5 0 0 1 20 5v13"/></svg>';


/**
 * Botão ⋯ do cabeçalho: o que se usa de vez em quando (relatar, Meus relatos, Laboratório, cartas da mesa, tema da
 * mesa), fora da linha das abas. Um ponto no botão e no item Meus relatos avisa de resposta ainda não vista.
 */
export function mountMaisMenu(slot: HTMLElement, onFeedback: () => void) {
  slot.classList.add('tema', 'mais');
  slot.innerHTML = `<button type="button" class="news-btn tema-btn mais-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Mais opções" title="Mais opções">${ICON_DOTS}<span class="news-dot mais-dot" hidden></span></button>`
    + `<div class="tema-menu mais-menu" role="menu" aria-label="Mais opções" hidden>`
    + `<button type="button" role="menuitem" data-mais="feedback">${ICON_BALLOON}<span>Enviar sugestão ou erro</span></button>`
    + `<button type="button" role="menuitem" data-mais="my-reports" aria-haspopup="dialog">${ICON_INBOX}<span>Meus relatos</span><span class="mais-item-dot" hidden></span></button>`
    + `<button type="button" role="menuitem" data-mais="lab">${ICON_FLASK}<span>Laboratório</span></button>`
    + `<a role="menuitem" href="/salas.html" data-mais="salas">${ICON_TABLE}<span>Salas e partidas ao vivo</span></a>`
    + `<a role="menuitem" href="/partidas.html#gravadas" data-mais="rever">${ICON_REPLAY}<span>Rever partidas</span></a>`
    + `<p class="mais-grupo" role="presentation">Aparência</p><button type="button" role="menuitemcheckbox" aria-checked="true" data-mais="own-art"><span>Cartas da mesa</span></button><button type="button" role="menuitem" data-mais="own-art-gallery" aria-haspopup="dialog">${ICON_CARDS}<span>Ver a série</span></button>`
    + (temasDisponiveis() ? `<p class="mais-grupo" role="presentation">Tema da mesa</p><div role="group" aria-label="Tema da mesa">${temaItemsHTML()}</div>` : '')
    + `</div>`;
  const button = slot.querySelector<HTMLButtonElement>('.mais-btn')!, menu = slot.querySelector<HTMLElement>('.mais-menu')!;
  const marcarTema = ligarTemaItens(menu);
  const ownArt = menu.querySelector<HTMLElement>('[data-mais="own-art"]')!;
  const marcarCartas = () => ownArt.setAttribute('aria-checked', String(ownArtEnabled()));
  addEventListener(EVENTS.ownArt, marcarCartas);
  const marcarRelatos = () => {
    const novo = hasUnseenReports();
    slot.querySelector<HTMLElement>('.mais-dot')!.hidden = !novo;
    menu.querySelector<HTMLElement>('.mais-item-dot')!.hidden = !novo;
    button.setAttribute('aria-label', novo ? 'Mais opções (um relato seu tem resposta)' : 'Mais opções');
    menu.querySelector<HTMLElement>('[data-mais="my-reports"]')!.setAttribute('aria-label', novo ? 'Meus relatos (tem resposta nova)' : 'Meus relatos');
  };
  addEventListener(EVENTS.meusRelatos, marcarRelatos);
  marcarRelatos();
  const marcar = () => { marcarTema(); marcarCartas(); };
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
    // Ligar e desligar as cartas da mesa não fecha o menu, como o tema: dá para ver a troca na hora.
    if (item === 'own-art') { setOwnArtEnabled(!ownArtEnabled()); return; }
    if (item === 'own-art-gallery') { fechar(); openOwnArtGallery(); return; }
    if (item === 'my-reports') { fechar(); openMyReportsDialog(); return; }
    if (item !== 'feedback' && item !== 'lab') return;
    fechar();
    // O Laboratório é uma tela própria; quem a abre é o main.ts.
    if (item === 'lab') dispatchEvent(new CustomEvent(EVENTS.laboratorio));
    else onFeedback();
  });
}
