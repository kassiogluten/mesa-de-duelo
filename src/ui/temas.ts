import { esc } from './cardtext';
import './temas.css';

/** Cores da mesa (src/temas.css). O Noite azul é o de sempre e fica sem atributo na página. */
export const TEMAS = [
  { id: 'noite', nome: 'Noite azul', fundo: '#13203a' },
  { id: 'esmeralda', nome: 'Esmeralda', fundo: '#0f2a22' },
  { id: 'violeta', nome: 'Violeta', fundo: '#1f1a3d' },
  { id: 'carmesim', nome: 'Carmesim', fundo: '#33171a' },
  { id: 'grafite', nome: 'Grafite', fundo: '#1d1f24' },
  { id: 'oceano', nome: 'Oceano', fundo: '#0d2633' },
] as const;
export type Tema = typeof TEMAS[number]['id'];
export const TEMA_KEY = 'mesa:tema';

export const parseTema = (value: string | null | undefined): Tema => TEMAS.find(t => t.id === value)?.id ?? 'noite';

/** Sem cor relativa no CSS, os temas não pintam nada: a escolha nem aparece. */
export const temasDisponiveis = () => typeof CSS !== 'undefined' && CSS.supports('color', 'oklch(from red l c calc(h + 1))');

export function lerTema(): Tema {
  try { return parseTema(localStorage.getItem(TEMA_KEY)); } catch { return 'noite'; }
}

function aplicar(tema: Tema) {
  if (tema === 'noite') document.documentElement.removeAttribute('data-tema');
  else document.documentElement.dataset.tema = tema;
  dispatchEvent(new CustomEvent('mesa:tema'));
}

/** Grava a escolha (ela acompanha a conta) e pinta a página na hora. */
export function escolherTema(tema: Tema) {
  try { if (tema === 'noite') localStorage.removeItem(TEMA_KEY); else localStorage.setItem(TEMA_KEY, tema); } catch { /* sem armazenamento */ }
  aplicar(tema);
}

let ligado = false;
/** Pinta a página com o tema guardado e acompanha as trocas da conta e das outras abas. */
export function iniciarTema() {
  aplicar(lerTema());
  if (ligado) return;
  ligado = true;
  addEventListener('mesa:prefs-sincronizadas', () => aplicar(lerTema()));
  addEventListener('storage', e => { if (e.key === TEMA_KEY || e.key === null) aplicar(lerTema()); });
}

const amostra = (t: typeof TEMAS[number]) => `<span class="tema-amostra" aria-hidden="true" style="--amostra-fundo: ${t.fundo}"></span>`;

/** As opções de um <select> de tema. */
export const temaOptionsHTML = () => TEMAS.map(t => `<option value="${t.id}">${esc(t.nome)}</option>`).join('');

/** As paletas como itens de menu (no menu ⋯ do cabeçalho), cada uma com a amostra do fundo. */
export const temaItemsHTML = () => TEMAS.map(t => `<button type="button" role="menuitemradio" aria-checked="false" data-tema="${t.id}">${amostra(t)}<span>${esc(t.nome)}</span></button>`).join('');

/** Marca a paleta atual e troca de tema ao tocar num item; trocar não fecha o menu, para ver cada paleta na hora. */
export function ligarTemaItens(menu: HTMLElement) {
  const marcar = () => {
    const atual = lerTema();
    menu.querySelectorAll<HTMLElement>('[data-tema]').forEach(item => item.setAttribute('aria-checked', String(item.dataset.tema === atual)));
  };
  menu.addEventListener('click', e => {
    const item = (e.target as HTMLElement).closest<HTMLElement>('[data-tema]');
    if (!item) return;
    escolherTema(parseTema(item.dataset.tema));
    marcar();
  });
  addEventListener('mesa:tema', marcar);
  marcar();
  return marcar;
}
