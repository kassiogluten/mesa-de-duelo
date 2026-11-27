import { EVENTS } from '../storage';
import { ownArtEnabled, setOwnArtEnabled } from '../scryfallCards';
import { openOwnArtGallery } from './ownArtGallery';
import { ligarTemaItens, temaItemsHTML, temasDisponiveis } from './temas';
import { ICON_DOTS, ICON_BALLOON, ICON_TABLE, ICON_FLASK, ICON_REPLAY, ICON_TROPHY } from './icons';
import { hasUnseenReports } from '../myReports';
import { openMyReportsDialog } from './myReportsDialog';

/** Caixa de entrada: o item Meus relatos. */
const ICON_INBOX = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13 6.5 5h11L20 13v6H4v-6Z"/><path d="M4 13h5a3 3 0 0 0 6 0h5"/></svg>';

/** Leque de cartas: o item Ver a série das cartas da mesa. */
const ICON_CARDS = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="10" height="14" rx="1.5"/><path d="M9 3.5h9.5A1.5 1.5 0 0 1 20 5v13"/></svg>';

/** Interrogação: o item Como jogar. */
const ICON_HELP = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.4M12 16.8v.4"/></svg>';

/** Coração: o item Contador de vida, das partidas no papel. */
const ICON_HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';

/** Faísca: o item Laboratório de efeitos. */
const ICON_SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7ZM19 15c.3 1.9 1 2.7 3 3-2 .3-2.7 1-3 3-.3-2-1-2.7-3-3 2-.3 2.7-1.1 3-3Z"/></svg>';

/** Velocímetro: o item Teste de desempenho. */
const ICON_GAUGE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 17a8.5 8.5 0 1 1 15 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="m12 14.5 4-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="14.5" r="1.6" fill="currentColor"/></svg>';

/**
 * Botão ⋯ do cabeçalho: o que se usa de vez em quando, fora da linha das abas, em grupos (Partidas: Salas, Rever,
 * Torneios, Contador de vida; Laboratório: montar uma mesa, efeitos e o teste de desempenho; Aparência: cartas da mesa e o tema, em amostras numa linha; Ajuda:
 * Como jogar, relatar e Meus relatos). Um ponto no botão e no item Meus relatos avisa de resposta ainda não vista.
 */
export function mountMaisMenu(slot: HTMLElement, onFeedback: () => void) {
  slot.classList.add('tema', 'mais');
  slot.innerHTML = `<button type="button" class="news-btn tema-btn mais-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Mais opções" title="Mais opções">${ICON_DOTS}<span class="news-dot mais-dot" hidden></span></button>`
    + `<div class="tema-menu mais-menu" role="menu" aria-label="Mais opções" hidden>`
    + `<p class="mais-grupo" role="presentation">Partidas</p>`
    + `<a role="menuitem" href="/salas" data-mais="salas">${ICON_TABLE}<span>Salas e partidas ao vivo</span></a>`
    + `<a role="menuitem" href="/partidas#gravadas" data-mais="rever">${ICON_REPLAY}<span>Rever partidas</span></a>`
    + `<a role="menuitem" href="/torneios" data-mais="torneios">${ICON_TROPHY}<span>Torneios presenciais</span></a>`
    + `<a role="menuitem" href="/contador" data-mais="contador">${ICON_HEART}<span>Contador de vida (papel)</span></a>`
    + `<p class="mais-grupo" role="presentation">Laboratório</p>`
    + `<button type="button" role="menuitem" data-mais="lab" aria-label="Laboratório: montar uma mesa">${ICON_FLASK}<span>Montar uma mesa</span></button>`
    + `<a role="menuitem" href="/efeitos" data-mais="efeitos" aria-label="Laboratório de efeitos">${ICON_SPARK}<span>Efeitos</span></a>`
    + `<a role="menuitem" href="/desempenho" data-mais="desempenho" aria-label="Teste de desempenho do aparelho">${ICON_GAUGE}<span>Teste de desempenho</span></a>`
    + `<p class="mais-grupo" role="presentation">Aparência</p><button type="button" role="menuitemcheckbox" aria-checked="true" data-mais="own-art"><span>Cartas da mesa</span></button><button type="button" role="menuitem" data-mais="own-art-gallery" aria-haspopup="dialog">${ICON_CARDS}<span>Ver a série</span></button>`
    + (temasDisponiveis() ? `<div class="mais-tema-linha"><span aria-hidden="true">Tema</span><div class="mais-temas" role="group" aria-label="Tema da mesa">${temaItemsHTML()}</div></div>` : '')
    + `<p class="mais-grupo" role="presentation">Ajuda</p>`
    + `<button type="button" role="menuitem" data-mais="tour">${ICON_HELP}<span>Como jogar</span></button>`
    + `<button type="button" role="menuitem" data-mais="feedback">${ICON_BALLOON}<span>Enviar sugestão ou erro</span></button>`
    + `<button type="button" role="menuitem" data-mais="my-reports" aria-haspopup="dialog">${ICON_INBOX}<span>Meus relatos</span><span class="mais-item-dot" hidden></span></button>`
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
    if (item !== 'feedback' && item !== 'lab' && item !== 'tour') return;
    fechar();
    // O Laboratório é uma tela própria; quem a abre é o main.ts. O tour é da tela inicial: Meus decks volta para ela.
    if (item === 'lab') dispatchEvent(new CustomEvent(EVENTS.laboratorio));
    else if (item === 'tour') dispatchEvent(new CustomEvent(EVENTS.comoJogar));
    else onFeedback();
  });
}
