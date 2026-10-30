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

/** Botão de tema no cabeçalho, com o menu das seis paletas. */
export function mountTemaMenu(slot: HTMLElement) {
  if (!temasDisponiveis()) { slot.hidden = true; return; }
  slot.classList.add('tema');
  slot.innerHTML = `<button type="button" class="news-btn tema-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Tema da mesa" title="Tema da mesa">`
    + `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.9 1.4-1.8l-.3-.9c-.4-1.1.4-2.3 1.6-2.3H17a4 4 0 0 0 4-4c0-5-4-9-9-9Z"/><circle cx="7.5" cy="11.5" r="1.2"/><circle cx="10" cy="7.5" r="1.2"/><circle cx="14.5" cy="7.5" r="1.2"/></svg></button>`
    + `<div class="tema-menu" role="menu" aria-label="Tema da mesa" hidden>${TEMAS.map(t => `<button type="button" role="menuitemradio" aria-checked="false" data-tema="${t.id}">${amostra(t)}<span>${esc(t.nome)}</span></button>`).join('')}</div>`;
  const button = slot.querySelector<HTMLButtonElement>('.tema-btn')!, menu = slot.querySelector<HTMLElement>('.tema-menu')!;
  const marcar = () => {
    const atual = lerTema();
    menu.querySelectorAll<HTMLElement>('[data-tema]').forEach(item => item.setAttribute('aria-checked', String(item.dataset.tema === atual)));
  };
  const outside = (e: Event) => { if (!slot.contains(e.target as Node)) fechar(); };
  const teclas = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { fechar(); button.focus(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const itens = [...menu.querySelectorAll<HTMLElement>('[data-tema]')];
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
    menu.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  });
  // Trocar de tema não fecha o menu: dá para passar pelas paletas e ver cada uma na hora.
  menu.addEventListener('click', e => {
    const item = (e.target as HTMLElement).closest<HTMLElement>('[data-tema]');
    if (!item) return;
    escolherTema(parseTema(item.dataset.tema));
    marcar();
  });
  addEventListener('mesa:tema', marcar);
}
