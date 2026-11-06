// Página Minhas partidas: as partidas da conta conectada, com filtros e números.
import { KEYS } from './storage';
import './style.css';
import './ui/appHeader.css';
import './novidades.css';
import './partidas.css';
import { contaFetch, contaSessao, contasLigadas, onContaChange } from './conta/session';
import { FORMAT_LABEL, type DeckFormat } from './decks';
import { consulta, filtrosHTML, gravadasHTML, numerosHTML, partidaHTML, type Filtros, type Partida, type Resposta } from './partidas/view';
import { deleteReplay, listReplays, REPLAY_LIMIT, type ReplaySummary } from './replays';
import { mountContaMenu } from './ui/contaMenu';
import { esc } from './ui/cardtext';
import { iniciarTema } from './ui/temas';

iniciarTema();

/**
 * Minhas partidas (/partidas.html), aberta pelo menu da conta: as partidas jogadas com a conta conectada e os números
 * delas. Os dados vêm de GET /api/conta/partidas (AccountMatches na ponte); só a própria conta os vê.
 */
const nomeDoFormato = (f: string) => FORMAT_LABEL[f as DeckFormat] ?? f;
const FILTROS_KEY = KEYS.partidasFiltros;

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="home-top shared-shell-header vis-top pt-top">
    <a class="home-brand" href="/" aria-label="Mesa de Duelo — início"><span class="brand-mark" aria-hidden="true"></span><span>Mesa de Duelo</span></a>
    <a class="vis-back" href="/">Voltar ao jogo</a>
    <div data-app-conta></div>
  </header>
  <main class="vis pt-pagina">
    <h1>Minhas partidas</h1>
    <p class="vis-lead">As partidas que você jogou com a conta conectada, contra o computador ou em salas, e as últimas gravadas neste aparelho, para rever. Só você vê esta página.</p>
    <div data-conteudo></div>
    <section class="pt-gravadas" data-gravadas aria-label="Partidas gravadas neste aparelho"></section>
  </main>`;
mountContaMenu(app.querySelector<HTMLElement>('[data-app-conta]')!);
const conteudo = app.querySelector<HTMLElement>('[data-conteudo]')!;
const gravadas = app.querySelector<HTMLElement>('[data-gravadas]')!;
/** As partidas gravadas neste aparelho (S21): a lista própria e o Rever nas partidas da conta. */
let locais: ReplaySummary[] = [];
const locaisIds = () => new Set(locais.map(g => g.id));
async function carregarGravadas() {
  locais = await listReplays();
  gravadas.innerHTML = gravadasHTML(locais, nomeDoFormato, REPLAY_LIMIT);
  if (ultima) desenhar();
}
gravadas.addEventListener('click', async e => {
  const botao = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-apagar]');
  if (!botao) return;
  botao.disabled = true;
  await deleteReplay(botao.dataset.apagar!);
  await carregarGravadas();
  gravadas.querySelector<HTMLElement>('#gravadas')?.focus();
});

let filtros: Filtros = { periodo: '', formato: '', deck: '' };
try { filtros = { ...filtros, ...JSON.parse(sessionStorage.getItem(FILTROS_KEY) ?? '{}') as Partial<Filtros> }; } catch { /* sem armazenamento */ }
let partidas: Partida[] = [];
let ultima: Resposta | null = null;
let pedido = 0;

const aviso = (html: string) => { conteudo.innerHTML = `<div class="pt-aviso">${html}</div>`; };

async function buscar(pagina: number): Promise<Resposta> {
  const response = await contaFetch(consulta(filtros, pagina));
  const body = await response.json().catch(() => null) as (Resposta & { error?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.error ?? 'Não deu para carregar as partidas agora. Tente de novo.');
  return body;
}

function desenhar() {
  const r = ultima!;
  const vazio = !r.filtros.formatos.length;
  if (vazio) {
    aviso('<h2>Nenhuma partida ainda</h2><p>As partidas que você jogar com a conta conectada aparecem aqui, com quantas venceu e com quais decks. As de antes desta página, ou jogadas sem entrar na conta, não aparecem.</p><p><a class="arena-btn primary" href="/">Jogar uma partida</a></p>');
    return;
  }
  const mais = partidas.length < r.total;
  conteudo.innerHTML = `
    <form class="pt-filtros" aria-label="Filtros">${filtrosHTML(filtros, r.filtros, nomeDoFormato)}</form>
    <section class="pt-numeros" aria-label="Números">${numerosHTML(r.numeros, nomeDoFormato)}</section>
    <h2 class="pt-titulo">Partidas <small>${r.total}</small></h2>
    ${r.total ? `<ol class="pt-lista">${partidas.map(p => partidaHTML(p, nomeDoFormato, locaisIds().has(p.id))).join('')}</ol>` : '<p class="vis-empty">Nenhuma partida com esses filtros.</p>'}
    ${mais ? '<button type="button" class="vis-more" data-mais>Carregar mais</button>' : ''}
    <p class="pt-nota">Partidas que caíram sem ninguém voltar aparecem na lista como <strong>Sem vencedor</strong>, mas não entram nos números.</p>`;
}

async function carregar() {
  const meu = ++pedido;
  if (!contasLigadas()) { aviso('<p>As contas não estão ligadas neste servidor.</p>'); return; }
  if (!contaSessao()) { aviso('<h2>Entre com a conta</h2><p>Use o botão <strong>Fazer login com o Google</strong>, no alto da página, para ver as suas partidas.</p>'); return; }
  if (!ultima) aviso('<p>Carregando…</p>');
  try {
    const r = await buscar(0);
    if (meu !== pedido) return;
    ultima = r; partidas = r.partidas;
    desenhar();
  } catch (e) {
    if (meu !== pedido) return;
    aviso(`<p class="conta-erro" role="alert">${esc(e instanceof Error && e.name !== 'TypeError' ? e.message : 'Sem conexão com o servidor. Tente de novo quando a internet voltar.')}</p>`);
  }
}

conteudo.addEventListener('change', e => {
  const select = (e.target as HTMLElement).closest<HTMLSelectElement>('[data-filtro]');
  if (!select) return;
  filtros = { ...filtros, [select.dataset.filtro!]: select.value };
  try { sessionStorage.setItem(FILTROS_KEY, JSON.stringify(filtros)); } catch { /* fica só nesta visita */ }
  void carregar().then(() => conteudo.querySelector<HTMLElement>(`[data-filtro="${select.dataset.filtro}"]`)?.focus());
});

conteudo.addEventListener('click', async e => {
  const botao = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-mais]');
  if (!botao || !ultima) return;
  botao.disabled = true; botao.textContent = 'Carregando…';
  const meu = pedido;
  try {
    const r = await buscar(Math.floor(partidas.length / ultima.porPagina));
    if (meu !== pedido) return;
    const primeira = partidas.length;
    ultima = r; partidas = [...partidas, ...r.partidas];
    desenhar();
    conteudo.querySelectorAll<HTMLElement>('.pt-partida')[primeira]?.setAttribute('tabindex', '-1');
    conteudo.querySelectorAll<HTMLElement>('.pt-partida')[primeira]?.focus();
  } catch (err) {
    botao.disabled = false; botao.textContent = 'Carregar mais';
    botao.insertAdjacentHTML('beforebegin', `<p class="conta-erro" role="alert">${esc(err instanceof Error ? err.message : 'Não deu para carregar.')}</p>`);
  }
});

// Entrar ou sair pelo menu do cabeçalho recarrega a lista.
onContaChange(() => { ultima = null; partidas = []; void carregar(); });
void carregar();
void carregarGravadas().then(() => { if (location.hash === '#gravadas') gravadas.querySelector<HTMLElement>('#gravadas')?.focus(); });
