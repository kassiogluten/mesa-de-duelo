// Página Torneios: torneios suíços presenciais, criados por uma conta e vistos por qualquer um com o link.
import './style.css';
import './ui/appHeader.css';
import './novidades.css';
import './partidas.css';
import './torneios.css';
import { contaSessao, contasLigadas, onContaChange } from './conta/session';
import { bridgeHttpUrl } from './forge/client';
import { criarHTML, listaHTML, torneioHTML, vazioHTML, type Resumo, type Torneio } from './torneios/view';
import { ILL_MESA, ILL_TROFEU } from './torneios/art';
import { ligarRelogio } from './torneios/clockControl';
import { mountContaMenu } from './ui/contaMenu';
import { esc } from './ui/cardtext';
import { iniciarTema } from './ui/temas';

iniciarTema();

/**
 * Torneios (/torneios): sem `?id`, os torneios da conta e o formulário de criar; com `?id=CÓDIGO`, um torneio.
 * Os dados vêm de /api/torneios/ (Tournaments na ponte), que sorteia, classifica e confere quem pode mexer. Quem só
 * olha (sem ser o organizador) vê a página se atualizar sozinha enquanto o torneio corre.
 */
const API = bridgeHttpUrl('/api/torneios/');
/** De quanto em quanto tempo a página de quem só olha busca o torneio de novo. */
const ATUALIZAR_MS = 15_000;
const codigo = new URLSearchParams(location.search).get('id')?.trim().toUpperCase() ?? '';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="home-top shared-shell-header vis-top pt-top">
    <a class="home-brand" href="/" aria-label="Mesa de Duelo — início"><span class="brand-mark" aria-hidden="true"></span><span>Mesa de Duelo</span></a>
    <a class="vis-back" href="${codigo ? '/torneios' : '/'}">${codigo ? 'Meus torneios' : 'Voltar ao jogo'}</a>
    <div data-app-conta></div>
  </header>
  <main class="vis pt-pagina tn-pagina">
    ${codigo ? '' : `<h1>Torneios</h1>
    <p class="vis-lead">Organize um torneio presencial no sistema suíço: inscreva os jogadores, sorteie as rodadas e lance os placares. A classificação e os desempates saem sozinhos, e qualquer pessoa com o link acompanha pelo celular. Na mesa, cada partida pode marcar a vida com o <a href="/contador">Contador de vida</a>.</p>`}
    <div data-conteudo></div>
    <p class="tn-status" role="status" aria-live="polite"></p>
  </main>`;
mountContaMenu(app.querySelector<HTMLElement>('[data-app-conta]')!);
const conteudo = app.querySelector<HTMLElement>('[data-conteudo]')!;
const status = app.querySelector<HTMLElement>('.tn-status')!;

let torneio: Torneio | null = null;
/** Quando o torneio chegou do servidor: o relógio acerta a hora deste aparelho por ela. */
let recebidoEm = 0;
const relogio = ligarRelogio(() => torneio ? { torneio, recebidoEm } : null);

/** O torneio sem o que muda a cada pedido (a hora do servidor e o que falta no relógio correndo), para comparar. */
const semHora = (t: Torneio | null) => JSON.stringify(t, function (this: Record<string, unknown>, k, v) {
  return k === 'agora' || (k === 'restanteMs' && this.estado === 'correndo') ? undefined : v;
});
let ocupado = false;
let pedido = 0;

const aviso = (html: string) => { conteudo.innerHTML = `<div class="pt-aviso">${html}</div>`; };
const erroTexto = (e: unknown) => e instanceof Error && e.name !== 'TypeError' && e.name !== 'TimeoutError' ? e.message : 'Sem conexão com o servidor. Tente de novo quando a internet voltar.';

/** Pedido à rota dos torneios, com o token da conta quando houver. */
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const s = contaSessao();
  const response = await fetch(API + path, {
    ...init, signal: AbortSignal.timeout(20_000),
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(s ? { Authorization: `Bearer ${s.token}` } : {}) },
  });
  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.error ?? 'Não deu para falar com o servidor agora. Tente de novo.');
  return body;
}

// ---------- Meus torneios ----------

async function carregarLista() {
  const meu = ++pedido;
  if (!contasLigadas()) { aviso('<p>As contas não estão ligadas neste servidor.</p>'); return; }
  if (!contaSessao()) { conteudo.innerHTML = vazioHTML(ILL_TROFEU, 'Entre com a conta para criar torneios.', 'Use o botão <strong>Fazer login com o Google</strong>, no alto da página. Para acompanhar um torneio, basta o link que o organizador compartilhou.'); return; }
  aviso('<p>Carregando…</p>');
  try {
    const r = await api<{ torneios: Resumo[] }>('');
    if (meu !== pedido) return;
    conteudo.innerHTML = `${criarHTML()}<h2 class="pt-titulo">Meus torneios <small>${r.torneios.length}</small></h2>${listaHTML(r.torneios)}`;
  } catch (e) {
    if (meu === pedido) aviso(`<p class="conta-erro" role="alert">${esc(erroTexto(e))}</p>`);
  }
}

// ---------- Um torneio ----------

function desenhar(foco?: string) {
  const t = torneio!;
  document.title = `${t.nome} · Torneios · Mesa de Duelo`;
  // Os formulários abertos (editar) e o que está sendo digitado sobrevivem à atualização sozinha.
  const editando = conteudo.querySelector<HTMLElement>('[data-editar]')?.hidden === false;
  const digitado = conteudo.querySelector<HTMLInputElement>('[data-inscrever] input')?.value ?? '';
  conteudo.innerHTML = torneioHTML(t);
  if (editando) abrirEditar(true);
  const campo = conteudo.querySelector<HTMLInputElement>('[data-inscrever] input');
  if (campo && digitado) campo.value = digitado;
  const alvo = foco ? conteudo.querySelector<HTMLElement>(foco) : null;
  // Os títulos das seções recebem o foco depois de sortear e encerrar.
  if (alvo?.matches('h2')) alvo.tabIndex = -1;
  alvo?.focus();
  relogio.tick();
  relogio.atualizarTelao();
}

async function carregarTorneio(silencioso = false) {
  const meu = ++pedido;
  if (!silencioso) aviso('<p>Carregando…</p>');
  try {
    const r = await api<{ torneio: Torneio }>(encodeURIComponent(codigo));
    if (meu !== pedido || ocupado) return;
    // Quem só olha não perde o lugar nem o que estava aberto: só redesenha quando mudou.
    if (silencioso && semHora(r.torneio) === semHora(torneio)) return;
    const abertos = [...conteudo.querySelectorAll<HTMLDetailsElement>('details[open] summary')].map(s => s.textContent);
    torneio = r.torneio;
    recebidoEm = Date.now();
    desenhar();
    conteudo.querySelectorAll<HTMLDetailsElement>('details').forEach(d => { if (abertos.includes(d.querySelector('summary')?.textContent ?? null)) d.open = true; });
  } catch (e) {
    if (meu !== pedido || silencioso) return;
    conteudo.innerHTML = vazioHTML(ILL_MESA, 'Torneio não encontrado.', `${esc(erroTexto(e))} <a href="/torneios">Ver meus torneios</a>`);
  }
}

/** Uma mudança do organizador: o servidor devolve o torneio inteiro, já classificado. */
async function mudar(method: string, path: string, body?: object, foco?: string) {
  if (ocupado || !torneio) return;
  ocupado = true;
  status.textContent = 'Salvando…';
  conteudo.setAttribute('aria-busy', 'true');
  try {
    const r = await api<{ torneio: Torneio }>(`${encodeURIComponent(torneio.id)}${path}`, { method, body: body ? JSON.stringify(body) : undefined });
    torneio = r.torneio;
    recebidoEm = Date.now();
    status.textContent = 'Salvo.';
    desenhar(foco);
  } catch (e) {
    status.textContent = '';
    mostrarErro(erroTexto(e));
  } finally {
    ocupado = false;
    conteudo.removeAttribute('aria-busy');
  }
}

function mostrarErro(texto: string) {
  conteudo.querySelector('.tn-erro')?.remove();
  conteudo.insertAdjacentHTML('afterbegin', `<p class="conta-erro tn-erro" role="alert">${esc(texto)}</p>`);
}

function abrirEditar(aberto: boolean) {
  const form = conteudo.querySelector<HTMLElement>('[data-editar]');
  if (!form) return;
  form.hidden = !aberto;
  conteudo.querySelector('[data-acao="editar"]')?.setAttribute('aria-expanded', String(aberto));
}

async function copiarLink() {
  const link = `${location.origin}/torneios?id=${encodeURIComponent(codigo)}`;
  try { await navigator.clipboard.writeText(link); status.textContent = 'Link copiado. Mande para os jogadores acompanharem.'; }
  catch { status.textContent = `Copie o link: ${link}`; }
}

conteudo.addEventListener('submit', async e => {
  const form = e.target as HTMLFormElement;
  e.preventDefault();
  const dados = Object.fromEntries(new FormData(form)) as Record<string, string>;
  if (form.matches('[data-criar]')) {
    const botao = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    botao.disabled = true;
    try {
      const r = await api<{ torneio: Torneio }>('', { method: 'POST', body: JSON.stringify({ nome: dados.nome, formato: dados.formato }) });
      location.href = `/torneios?id=${encodeURIComponent(r.torneio.id)}`;
    } catch (err) {
      botao.disabled = false;
      form.querySelector('.conta-erro')?.remove();
      form.insertAdjacentHTML('beforeend', `<p class="conta-erro" role="alert">${esc(erroTexto(err))}</p>`);
    }
    return;
  }
  if (form.matches('[data-inscrever]')) {
    form.querySelector('input')!.value = '';
    await mudar('POST', '/jogadores', { nome: dados.nome }, '[data-inscrever] input');
    return;
  }
  if (form.matches('[data-editar]')) {
    abrirEditar(false);
    await mudar('PUT', '', { nome: dados.nome, formato: dados.formato, ...(dados.rodadas ? { rodadas: Number(dados.rodadas) } : {}), ...(dados.minutos ? { minutos: Number(dados.minutos) } : {}) }, '[data-acao="editar"]');
  }
});

conteudo.addEventListener('click', async e => {
  const alvo = (e.target as HTMLElement).closest<HTMLElement>('button');
  if (!alvo || !torneio) return;
  const d = alvo.dataset;
  if (d.placar) {
    const [rodada, mesa, a, b, empates] = d.placar.split(':').map(Number);
    await mudar('PUT', `/rodadas/${rodada}/mesas/${mesa}`, { a, b, empates }, `[data-placar="${d.placar}"]`);
  } else if (d.limpar) {
    const [rodada, mesa] = d.limpar.split(':');
    await mudar('DELETE', `/rodadas/${rodada}/mesas/${mesa}`, undefined, `[data-placar^="${rodada}:${mesa}:"]`);
  } else if (d.tirar) await mudar('DELETE', `/jogadores/${d.tirar}`, undefined, '[data-inscrever] input');
  else if (d.sair) await mudar('POST', `/jogadores/${d.sair}/sair`, undefined, `[data-voltar="${d.sair}"]`);
  else if (d.voltar) await mudar('POST', `/jogadores/${d.voltar}/voltar`, undefined, `[data-sair="${d.voltar}"]`);
  else if (d.acao === 'copiar') await copiarLink();
  else if (d.acao === 'editar') abrirEditar(alvo.getAttribute('aria-expanded') !== 'true');
  else if (d.acao === 'sortear') await mudar('POST', '/rodadas', undefined, '#tn-atual');
  else if (d.acao === 'extra') await mudar('POST', '/rodadas', { extra: true }, '#tn-atual');
  else if (d.acao === 'relogio') {
    const acao = d.relogioAcao!;
    if (acao === 'zerar' && !confirm('Recomeçar o relógio com o tempo cheio, parado?')) return;
    await mudar('POST', '/relogio', { acao, ...(d.minutos ? { minutos: Number(d.minutos) } : {}) }, acao === 'ajustar' ? `[data-minutos="${d.minutos}"]` : '[data-relogio] button');
  } else if (d.acao === 'telao') relogio.abrirTelao();
  else if (d.acao === 'desfazer') await mudar('DELETE', `/rodadas/${d.rodada}`);
  else if (d.acao === 'encerrar') { if (confirm('Encerrar o torneio? A classificação de agora fica como a final. Dá para reabrir depois para corrigir.')) await mudar('POST', '/encerrar', undefined, '#tn-class'); }
  else if (d.acao === 'reabrir') await mudar('POST', '/reabrir');
  else if (d.acao === 'apagar') {
    if (!confirm(`Apagar o torneio "${torneio.nome}"? Isso não tem volta, e o link deixa de funcionar.`)) return;
    try { await api(encodeURIComponent(torneio.id), { method: 'DELETE' }); location.href = '/torneios'; }
    catch (err) { mostrarErro(erroTexto(err)); }
  }
});

if (codigo) {
  void carregarTorneio();
  // Quem só olha acompanha sozinho, enquanto a aba está à vista e o torneio não acabou.
  setInterval(() => {
    if (document.visibilityState === 'visible' && torneio && !torneio.organizadorSouEu && torneio.estado !== 'encerrado') void carregarTorneio(true);
  }, ATUALIZAR_MS);
  onContaChange(() => void carregarTorneio(true));
} else {
  onContaChange(() => void carregarLista());
  void carregarLista();
}
