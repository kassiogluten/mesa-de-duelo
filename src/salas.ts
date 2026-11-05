import { KEYS } from './storage';
import './style.css';
import './ui/appHeader.css';
import './novidades.css';
import './salas.css';
import { ForgeClient, FORGE_URL, type PublicRoom } from './forge/client';
import { contagemTexto, filtrosHTML, listaHTML, type FiltrosSalas, type Situacao } from './salas/view';
import { mountContaMenu } from './ui/contaMenu';
import { iniciarTema } from './ui/temas';

iniciarTema();

/**
 * Salas (/salas.html, item 87): as salas públicas esperando jogadores e as partidas em andamento para assistir, num
 * lugar só, atualizadas sozinhas. A lista vem do servidor de jogo (a mesma da aba Entrar numa sala); entrar e assistir
 * voltam para a mesa pelo link da sala.
 */
const FILTROS_KEY = KEYS.salasFiltros;
const A_CADA_MS = 10_000;

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="home-top shared-shell-header vis-top pt-top sl-top">
    <a class="home-brand" href="/" aria-label="Mesa de Duelo — início"><span class="brand-mark" aria-hidden="true"></span><span>Mesa de Duelo</span></a>
    <a class="vis-back" href="/">Voltar ao jogo</a>
    <div data-app-conta></div>
  </header>
  <main class="vis sl-pagina">
    <h1>Salas</h1>
    <p class="vis-lead">Salas públicas esperando jogadores e partidas em andamento para assistir, inclusive as contra o computador. A lista se atualiza sozinha.</p>
    <p class="sl-resumo" data-resumo role="status" aria-live="polite"></p>
    <form class="sl-filtros" data-filtros aria-label="Filtros" hidden></form>
    <div data-lista aria-busy="true"><p class="vis-empty">Procurando salas…</p></div>
  </main>`;
mountContaMenu(app.querySelector<HTMLElement>('[data-app-conta]')!);
const lista = app.querySelector<HTMLElement>('[data-lista]')!, filtrosEl = app.querySelector<HTMLFormElement>('[data-filtros]')!, resumo = app.querySelector<HTMLElement>('[data-resumo]')!;

let filtros: FiltrosSalas = { formato: '', situacao: '' };
try { filtros = { ...filtros, ...JSON.parse(sessionStorage.getItem(FILTROS_KEY) ?? '{}') as Partial<FiltrosSalas> }; } catch { /* sem armazenamento */ }
let salas: PublicRoom[] | null = null;
let client: ForgeClient | null = null;
let ultimaLista = '', ultimosFiltros = '';

/** O endereço do servidor que a tela inicial usa (o campo avançado de Outra pessoa), ou o padrão. */
function enderecoDoServidor() {
  try { return localStorage.getItem(KEYS.forgeUrl)?.trim() || FORGE_URL; } catch { return FORGE_URL; }
}

async function conectar(): Promise<ForgeClient> {
  if (client?.connected) return client;
  const novo = new ForgeClient();
  await novo.connect(enderecoDoServidor(), 5000);
  client = novo;
  return novo;
}

function desenhar() {
  if (!salas) return;
  resumo.textContent = contagemTexto(salas) || 'Nenhuma sala aberta agora.';
  const f = filtrosHTML(salas, filtros);
  if (f !== ultimosFiltros) {
    const foco = (document.activeElement as HTMLElement | null)?.closest('[data-filtro], [data-situacao]') as HTMLElement | null;
    const chave = foco?.dataset.filtro ? `[data-filtro="${foco.dataset.filtro}"]` : foco?.dataset.situacao !== undefined ? `[data-situacao="${foco.dataset.situacao}"]` : '';
    filtrosEl.innerHTML = ultimosFiltros = f;
    if (chave) filtrosEl.querySelector<HTMLElement>(chave)?.focus();
  }
  filtrosEl.hidden = !salas.length && !filtros.formato && !filtros.situacao;
  const html = listaHTML(salas, filtros);
  if (html === ultimaLista) return;
  // A lista muda sozinha: quem estava com o foco num botão continua nele se a sala ainda está lá.
  const href = (document.activeElement as HTMLElement | null)?.closest<HTMLAnchorElement>('.sl-acao')?.getAttribute('href');
  lista.innerHTML = ultimaLista = html;
  if (href) lista.querySelector<HTMLElement>(`.sl-acao[href="${CSS.escape(href)}"]`)?.focus();
}

async function carregar() {
  if (document.visibilityState !== 'visible') return;
  try {
    salas = await (await conectar()).listRooms();
    lista.setAttribute('aria-busy', 'false');
    desenhar();
  } catch {
    client = null;
    lista.setAttribute('aria-busy', 'false');
    if (!salas) { lista.innerHTML = ultimaLista = '<p class="vis-empty" role="alert">Não foi possível ver as salas agora. A página tenta de novo sozinha.</p>'; resumo.textContent = ''; }
  }
}

function salvarFiltros() {
  try { sessionStorage.setItem(FILTROS_KEY, JSON.stringify(filtros)); } catch { /* fica só nesta visita */ }
  desenhar();
}
filtrosEl.addEventListener('submit', e => e.preventDefault());
filtrosEl.addEventListener('change', e => {
  const select = (e.target as HTMLElement).closest<HTMLSelectElement>('[data-filtro]');
  if (!select) return;
  filtros = { ...filtros, formato: select.value };
  salvarFiltros();
});
filtrosEl.addEventListener('click', e => {
  const botao = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-situacao]');
  if (!botao) return;
  filtros = { ...filtros, situacao: botao.dataset.situacao as Situacao };
  salvarFiltros();
});

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void carregar(); });
setInterval(() => void carregar(), A_CADA_MS);
void carregar();
