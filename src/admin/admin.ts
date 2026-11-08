import '../style.css';
import './admin.css';
import { esc } from '../ui/cardtext';
import { readJson } from '../forge/recording';
import { cacheGet, fetchByNames, loadCardCache } from '../scryfall';
import { adminError, adminFetch, adminSession, saveAdminSession } from './session';
import { issueBody, issueTitle } from './reportSummary';
import type { Item, Status, Stored } from './adminShared';
import { historyHTML, liveMatchesHTML, type End, type LiveMatch, type PastMatch } from './adminMatches';
import { reportDetailHTML, reportListHTML, type ReportFilter } from './adminReports';
import { funnelHTML, type FunnelWeek } from './adminFunnel';

/*
 * Área de admin (/admin.html): os relatos guardados na ponte, com estado, nota e issue, as partidas vivas e as
 * concluídas (histórico por mês) e os links das páginas de teste da mesa. A senha fica na ponte (MESA_ADMIN_PASSWORD); a página só guarda o token da sessão.
 */

const TEST_PAGES: [string, string, string][] = [
  ['/tests/fixtures/replay.html', 'Repetição de partida', 'Abre um relato ou o arquivo de "Baixar gravação" e repete a partida na mesa, quadro a quadro.'],
  ['/tests/fixtures/effects-lab.html', 'Laboratório de efeitos', 'Monta o campo e dispara dano, movimento, efeitos contínuos e moer, sem a ponte.'],
  ['/tests/fixtures/token-burst.html', 'Rajada de fichas', 'Hare Apparent no campo: conjura mais um ou dá blink em todos e mede quanto a mesa leva para mostrar as fichas.'],
  ['/tests/fixtures/room-lobby.html', 'Sala de espera', 'Sala em rede antes de começar, com a prateleira Seu deck: escolher um deck marca o seu lugar como pronto. window.fixture.room() muda o formato, os lugares e quem já escolheu.'],
  ['/tests/fixtures/duel-table.html','Mesa 1×1', 'Partida fixa contra um oponente, com contadores, Classe e perguntas (gatilhos, jeitos de jogar, dano de combate) pelo console.'],
  ['/tests/fixtures/duel-table.html?cenario=proliferar', 'Proliferar', 'Escolha do proliferar com marcadores bons e ruins dos dois lados (veneno, +1/+1, −1/−1, lealdade, energia). Os cliques marcam e o Proliferar aplica os marcadores.'],
  ['/tests/fixtures/duel-table.html?cenario=improvisar', 'Improvisar', 'Bola de Fogo com X=4 e a Inspiring Statuary em campo: os artefatos ficam destacados, cada toque marca ou desmarca e a caixa mostra quanto falta pagar. Confirmar vira os marcados. Simulado, sem a ponte.'],
  ['/tests/fixtures/commander-table.html', 'Mesa de Commander', 'Quatro jogadores, para conferir o layout dos assentos, a pilha e o campo cheio.'],
  ['/tests/fixtures/commander-endgame.html', 'Commander: fim de partida', 'Quatro mesas cheias no fim do jogo (fichas, planeswalkers, equipamentos, comandantes em campo) para ajustar o posicionamento. Pelo console: fixture.pilha(), fixture.ataque(), fixture.eliminar().'],
  ['/tests/fixtures/extra-turn.html', 'Turno e combate extra', 'Roteiro de Time Walk e Relentless Assault: os cliques da mesa avançam a simulação.'],
];

const root = document.querySelector<HTMLElement>('#admin')!;
let items: Item[] = [];
let filter: ReportFilter = { status: 'pendentes', kind: '', author: '', q: '' };
let selected: string | null = null;
const details = new Map<string, Stored>();
let notice = '';

const tab = () => location.hash === '#paginas' ? 'paginas' : location.hash === '#partidas' ? 'partidas' : 'relatos';

// ---------------------------------------------------------------- entrar

function login(message = '') {
  root.innerHTML = `<main class="adm-login"><form class="adm-card" id="admLogin">
    <span class="brand-mark" aria-hidden="true"></span><h1>Administração</h1><p>Mesa de Duelo</p>
    <label for="admPassword">Senha</label><input id="admPassword" type="password" autocomplete="current-password" required>
    <p class="adm-error" role="alert">${esc(message)}</p>
    <button class="arena-btn primary" type="submit">Entrar</button></form></main>`;
  const input = root.querySelector<HTMLInputElement>('#admPassword')!;
  input.focus();
  root.querySelector('form')!.addEventListener('submit', async e => {
    e.preventDefault();
    const button = root.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    button.disabled = true; button.textContent = 'Entrando…';
    try {
      const response = await adminFetch('login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: input.value }) }, null);
      if (!response.ok) { login(await adminError(response)); return; }
      saveAdminSession(await response.json());
      void start();
    } catch { login('Não consegui falar com a ponte. Ela está no ar?'); }
  });
}

async function start() {
  shell();
  await load();
}

// ---------------------------------------------------------------- moldura

function shell() {
  root.innerHTML = `<header class="adm-top"><a class="adm-brand" href="/"><span class="brand-mark" aria-hidden="true"></span>Mesa de Duelo</a>
    <nav class="adm-tabs" aria-label="Seções"><a href="#relatos" data-tab="relatos">Relatos</a><a href="#partidas" data-tab="partidas">Partidas</a><a href="#paginas" data-tab="paginas">Páginas de teste</a></nav>
    <button class="adm-ghost" data-act="logout">Sair</button></header>
    <main class="adm-main"><section id="admRelatos" aria-label="Relatos"></section><section id="admPartidas" aria-label="Partidas" hidden><div id="admVivas"></div><div id="admFunil" class="adm-history"></div><div id="admHistorico" class="adm-history"></div></section><section id="admPaginas" aria-label="Páginas de teste" hidden></section></main>`;
  root.querySelector('#admPaginas')!.innerHTML = `<h1>Páginas de teste</h1><p class="adm-muted">A mesa de verdade sem a ponte, para conferir telas e efeitos. Abrem numa aba nova.</p>
    <ul class="adm-pages">${TEST_PAGES.map(([href, title, text]) => `<li><a class="adm-card adm-page" href="${href}" target="_blank" rel="noopener"><strong>${esc(title)}</strong><span>${esc(text)}</span><code>${esc(href)}</code></a></li>`).join('')}</ul>`;
  syncTab();
}

function syncTab() {
  const current = tab();
  root.querySelectorAll<HTMLElement>('[data-tab]').forEach(a => a.setAttribute('aria-current', String(a.dataset.tab === current)));
  root.querySelector<HTMLElement>('#admRelatos')!.hidden = current !== 'relatos';
  root.querySelector<HTMLElement>('#admPaginas')!.hidden = current !== 'paginas';
  root.querySelector<HTMLElement>('#admPartidas')!.hidden = current !== 'partidas';
  clearInterval(matchesTimer);
  // Na aba de partidas, a lista se atualiza sozinha a cada 10 s.
  if (current === 'partidas') { void loadMatches(); void loadFunnel(); void loadHistory(historyMonth); matchesTimer = window.setInterval(() => { if (!document.hidden) void loadMatches(); }, 10000); }
}

let matchesTimer = 0;

async function loadMatches() {
  const section = root.querySelector<HTMLElement>('#admVivas');
  if (!section) return;
  try {
    const response = await adminFetch('partidas');
    if (response.status === 401) { clearInterval(matchesTimer); login('A sessão acabou. Entre de novo.'); return; }
    if (!response.ok) { section.innerHTML = `<p class="adm-error">${esc(await adminError(response))}</p>`; return; }
    const { partidas: matches, contas } = await response.json() as { partidas: LiveMatch[]; contas?: { total: number; aparelhos: number } };
    section.innerHTML = liveMatchesHTML(matches, contas);
  } catch { section.innerHTML = '<p class="adm-error">Não consegui falar com a ponte. Ela está no ar?</p>'; }
}
addEventListener('hashchange', () => { if (root.querySelector('.adm-top')) syncTab(); });

async function loadFunnel() {
  const section = root.querySelector<HTMLElement>('#admFunil');
  if (!section) return;
  try {
    const response = await adminFetch('funil');
    if (response.status === 401) return;
    if (!response.ok) { section.innerHTML = `<p class="adm-error">${esc(await adminError(response))}</p>`; return; }
    section.innerHTML = funnelHTML((await response.json() as { semanas: FunnelWeek[] }).semanas);
  } catch { section.innerHTML = '<p class="adm-error">Não consegui ler a contagem de visitantes na ponte.</p>'; }
}

// ---------------------------------------------------------------- histórico

let historyMonth = '';
let historyMonths: string[] = [];
let historyEnd: End | '' = '';
let past: PastMatch[] = [];

async function loadHistory(month = '') {
  const section = root.querySelector<HTMLElement>('#admHistorico');
  if (!section) return;
  try {
    const response = await adminFetch(month ? `historico/${month}` : 'historico');
    if (response.status === 401) { clearInterval(matchesTimer); login('A sessão acabou. Entre de novo.'); return; }
    if (!response.ok) { section.innerHTML = `<p class="adm-error">${esc(await adminError(response))}</p>`; return; }
    const json = await response.json() as { meses: string[]; mes: string; partidas: PastMatch[] };
    historyMonth = json.mes; past = json.partidas; historyMonths = json.meses;
    renderHistory();
    void loadCommanderArt();
  } catch { section.innerHTML = '<p class="adm-error">Não consegui ler o histórico na ponte.</p>'; }
}

function renderHistory() {
  root.querySelector<HTMLElement>('#admHistorico')!.innerHTML = historyHTML({ month: historyMonth, months: historyMonths, end: historyEnd, past }, commanderThumbs);
}

/** Miniaturas (arte recortada) dos comandantes de um jogador; "A + B" são dois parceiros. */
function commanderThumbs(commander?: string) {
  return (commander?.split(' + ') ?? []).map(name => {
    const sc = cacheGet(name), art = (sc?.pt?.image_uris ?? sc?.image_uris)?.art_crop;
    return art ? `<img class="adm-thumb" src="${esc(art)}" alt="" title="${esc(name)}" loading="lazy">` : `<span class="adm-thumb" title="${esc(name)}"></span>`;
  }).join('');
}

// O cache de cartas do Scryfall é o mesmo do jogo (IndexedDB); só busca na API os comandantes que ainda não estão nele.
let cardCache: Promise<void> | undefined;
async function loadCommanderArt() {
  try {
    await (cardCache ??= loadCardCache());
    const names = past.flatMap(m => m.players.flatMap(p => p.commander?.split(' + ') ?? []));
    const missing = names.filter(n => !cacheGet(n));
    renderHistory();
    if (missing.length) { await fetchByNames(missing); renderHistory(); }
  } catch { /* sem miniaturas: a lista continua com os nomes */ }
}

async function downloadHistory() {
  const response = await adminFetch(`historico/${historyMonth}.jsonl`);
  if (!response.ok) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await response.blob());
  a.download = `partidas-${historyMonth}.jsonl`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------- relatos

async function load() {
  const section = root.querySelector<HTMLElement>('#admRelatos')!;
  if (!items.length) section.innerHTML = '<p class="adm-muted">Carregando os relatos…</p>';
  try {
    const response = await adminFetch('relatos');
    if (response.status === 401) { login('A sessão acabou. Entre de novo.'); return; }
    if (!response.ok) { section.innerHTML = `<p class="adm-error">${esc(await adminError(response))}</p>`; return; }
    const json = await response.json() as { relatos: Item[]; totalBytes: number };
    items = json.relatos.reverse();
    renderList(json.totalBytes);
  } catch { section.innerHTML = '<p class="adm-error">Não consegui falar com a ponte. Ela está no ar?</p>'; }
}

let totalBytes = 0;
function renderList(total = totalBytes) {
  totalBytes = total;
  root.querySelector<HTMLElement>('#admRelatos')!.innerHTML = reportListHTML(items, { filter, selected, totalBytes });
  if (selected) void renderDetail(selected);
}

async function detail(code: string): Promise<Stored> {
  const cached = details.get(code);
  if (cached) return cached;
  const response = await adminFetch(`relatos/${encodeURIComponent(code)}`);
  if (!response.ok) throw new Error(await adminError(response));
  const stored = await readJson(new Uint8Array(await response.arrayBuffer())) as Stored;
  details.set(code, stored);
  return stored;
}

async function renderDetail(code: string) {
  const panel = root.querySelector<HTMLElement>('#admDetail');
  const item = items.find(i => i.code === code);
  if (!panel || !item) return;
  panel.innerHTML = `<p class="adm-muted">Abrindo ${esc(code)}…</p>`;
  let stored: Stored;
  try { stored = await detail(code); }
  catch (e) { panel.innerHTML = `<p class="adm-error">${esc((e as Error).message)}</p>`; return; }
  if (selected !== code) return;
  // Abrir um relato novo já o marca como visto.
  if (item.status.status === 'novo') void saveStatus(item, { ...item.status, status: 'visto' }, false);
  panel.innerHTML = reportDetailHTML(code, item, stored, notice);
}

async function saveStatus(item: Item, next: Item['status'], announce = true) {
  const response = await adminFetch(`relatos/${encodeURIComponent(item.code)}/estado`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next.status, note: next.note ?? '', issue: next.issue ?? '' }) });
  if (response.status === 401) { login('A sessão acabou. Entre de novo.'); return; }
  if (!response.ok) { notice = await adminError(response); renderList(); return; }
  item.status = await response.json();
  notice = announce ? 'Salvo.' : '';
  renderList();
}

function download(code: string, stored: Stored) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(stored)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${code}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

root.addEventListener('click', async e => {
  const target = e.target as HTMLElement;
  const row = target.closest<HTMLElement>('[data-code]');
  if (row) { selected = row.dataset.code!; notice = ''; renderList(); root.querySelector('#admDetail')?.scrollIntoView({ block: 'nearest' }); return; }
  const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
  const item = items.find(i => i.code === selected);
  switch (act) {
    case 'logout':
      await adminFetch('logout', { method: 'POST' }).catch(() => null);
      clearInterval(matchesTimer); saveAdminSession(null); items = []; details.clear(); selected = null; login();
      break;
    case 'reload': details.clear(); await load(); break;
    case 'matches': await loadMatches(); break;
    case 'funnel': await loadFunnel(); break;
    case 'history': await loadHistory(historyMonth); break;
    case 'history-download': await downloadHistory(); break;
    case 'back': selected = null; renderList(); break;
    case 'issue':
      // A issue abre no GitHub; aqui o relato já fica como "Virou issue", esperando o número.
      if (item && ['novo', 'visto'].includes(item.status.status)) { notice = 'Depois de criar, cole o número da issue em Tratamento.'; await saveStatus(item, { ...item.status, status: 'issue' }, false); notice = 'Depois de criar, cole o número da issue em Tratamento.'; renderList(); }
      break;
    case 'copy': {
      if (!item) break;
      const stored = await detail(item.code);
      try { await navigator.clipboard.writeText(`${issueTitle(stored)}\n\n${issueBody(stored)}`); notice = 'Texto da issue copiado.'; }
      catch { notice = 'Este navegador não deixou copiar.'; }
      renderList();
      break;
    }
    case 'download': if (item) download(item.code, await detail(item.code)); break;
    case 'delete': {
      if (!item || !confirm(`Excluir o relato ${item.code}? Não dá para desfazer.`)) break;
      const response = await adminFetch(`relatos/${encodeURIComponent(item.code)}`, { method: 'DELETE' });
      if (!response.ok) { notice = await adminError(response); renderList(); break; }
      items = items.filter(i => i !== item); details.delete(item.code); selected = null; notice = '';
      renderList(totalBytes - item.bytes);
      break;
    }
  }
});

root.addEventListener('submit', e => {
  const form = e.target as HTMLFormElement;
  if (form.id !== 'admStatus') return;
  e.preventDefault();
  const item = items.find(i => i.code === selected);
  const data = new FormData(form);
  if (item) void saveStatus(item, { ...item.status, status: data.get('status') as Status, note: String(data.get('note') ?? ''), issue: String(data.get('issue') ?? '') });
});

root.addEventListener('input', e => {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
  if (t.hasAttribute('data-history-month')) { void loadHistory(t.value); return; }
  if (t.hasAttribute('data-history-end')) { historyEnd = t.value as End | ''; renderHistory(); return; }
  if (!t.dataset.filter) return;
  filter = { ...filter, [t.dataset.filter]: t.value };
  if (t instanceof HTMLInputElement) {
    // Na busca, refaz só a lista para não tirar o foco do campo.
    const caret = t.selectionStart;
    renderList();
    const input = root.querySelector<HTMLInputElement>('[data-filter="q"]')!;
    input.focus(); input.setSelectionRange(caret, caret);
  } else renderList();
});

if (adminSession()) void start(); else login();
