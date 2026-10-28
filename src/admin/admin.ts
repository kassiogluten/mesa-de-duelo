import '../style.css';
import './admin.css';
import { esc } from '../ui/cardtext';
import { readJson } from '../forge/recording';
import { cacheGet, fetchByNames, loadCardCache } from '../scryfall';
import { adminError, adminFetch, adminSession, saveAdminSession } from './session';
import { issueBody, issueTitle, newIssueUrl, reportOf } from './reportSummary';

/*
 * Área de admin (/admin.html): os relatos guardados na ponte, com estado, nota e issue, as partidas vivas e as
 * concluídas (histórico por mês) e os links das páginas de teste da mesa. A senha fica na ponte (MESA_ADMIN_PASSWORD); a página só guarda o token da sessão.
 */

type Status = 'novo' | 'visto' | 'issue' | 'resolvido' | 'descartado';
interface Item {
  code: string; receivedAt: string; kind: string | null; version: string | null; format: string | null; bytes: number;
  match: boolean; bridge: boolean; summary?: string;
  status: { status: Status; note?: string; issue?: string; updatedAt: string };
}
type Stored = Record<string, any>;

const STATUS: Record<Status, string> = { novo: 'Novo', visto: 'Visto', issue: 'Virou issue', resolvido: 'Resolvido', descartado: 'Descartado' };
const FORMATS: Record<string, string> = { commander: 'Commander', pauper: 'Pauper', sacola50: 'Sacola 50', free: 'Livre' };
const TEST_PAGES: [string, string, string][] = [
  ['/tests/fixtures/replay.html', 'Repetição de partida', 'Abre um relato ou o arquivo de "Baixar gravação" e repete a partida na mesa, quadro a quadro.'],
  ['/tests/fixtures/effects-lab.html', 'Laboratório de efeitos', 'Monta o campo e dispara dano, movimento, efeitos contínuos e moer, sem a ponte.'],
  ['/tests/fixtures/duel-table.html', 'Mesa 1×1', 'Partida fixa contra um oponente, com contadores, Classe e perguntas (gatilhos, jeitos de jogar, dano de combate) pelo console.'],
  ['/tests/fixtures/duel-table.html?cenario=proliferar', 'Proliferar', 'Escolha do proliferar com marcadores bons e ruins dos dois lados (veneno, +1/+1, −1/−1, lealdade, energia). Os cliques marcam e o Proliferar aplica os marcadores.'],
  ['/tests/fixtures/commander-table.html', 'Mesa de Commander', 'Quatro jogadores, para conferir o layout dos assentos, a pilha e o campo cheio.'],
  ['/tests/fixtures/commander-endgame.html', 'Commander: fim de partida', 'Quatro mesas cheias no fim do jogo (fichas, planeswalkers, equipamentos, comandantes em campo) para ajustar o posicionamento. Pelo console: fixture.pilha(), fixture.ataque(), fixture.eliminar().'],
  ['/tests/fixtures/extra-turn.html', 'Turno e combate extra', 'Roteiro de Time Walk e Relentless Assault: os cliques da mesa avançam a simulação.'],
];

const root = document.querySelector<HTMLElement>('#admin')!;
let items: Item[] = [];
let filter = { status: 'pendentes', kind: '', q: '' };
let selected: string | null = null;
const details = new Map<string, Stored>();
let notice = '';

const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const size = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
const kindBadge = (kind: string | null) => `<span class="adm-kind ${kind === 'erro' ? 'erro' : ''}">${kind === 'erro' ? 'Erro' : kind === 'sugestao' ? 'Sugestão' : '?'}</span>`;
const statusBadge = (status: Status) => `<span class="adm-status s-${status}">${STATUS[status] ?? status}</span>`;
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
    <main class="adm-main"><section id="admRelatos" aria-label="Relatos"></section><section id="admPartidas" aria-label="Partidas" hidden><div id="admVivas"></div><div id="admHistorico" class="adm-history"></div></section><section id="admPaginas" aria-label="Páginas de teste" hidden></section></main>`;
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
  if (current === 'partidas') { void loadMatches(); void loadHistory(historyMonth); matchesTimer = window.setInterval(() => { if (!document.hidden) void loadMatches(); }, 10000); }
}

// ---------------------------------------------------------------- partidas

interface LiveMatch {
  code: string; room: boolean; format: string; matchLength: string; playerCount: number; createdAt: string; startedAt?: string; matchId: string;
  state: string; gameNumber: number; turn?: number; phase?: string; activePlayer?: string;
  players: { name: string; ai: boolean; seat?: number; connected?: boolean; conceded?: boolean; deck?: string; life?: number; lost?: boolean }[];
}
let matchesTimer = 0;
const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.floor(s / 60) % 60} min`;
};

async function loadMatches() {
  const section = root.querySelector<HTMLElement>('#admVivas');
  if (!section) return;
  try {
    const response = await adminFetch('partidas');
    if (response.status === 401) { clearInterval(matchesTimer); login('A sessão acabou. Entre de novo.'); return; }
    if (!response.ok) { section.innerHTML = `<p class="adm-error">${esc(await adminError(response))}</p>`; return; }
    const matches = (await response.json() as { partidas: LiveMatch[] }).partidas;
    const playing = matches.filter(m => m.state === 'jogando').length;
    const online = matches.reduce((n, m) => n + m.players.filter(p => !p.ai && p.connected).length, 0);
    section.innerHTML = `<div class="adm-head"><h1>Partidas</h1><p class="adm-muted">${[`${playing} jogando`, matches.length > playing ? `${matches.length - playing} esperando ou encerrando` : null, `${online} ${online === 1 ? 'jogador conectado' : 'jogadores conectados'}`, `atualizado às ${new Date().toLocaleTimeString('pt-BR')}`].filter(Boolean).join(' · ')}</p>
        <button class="adm-ghost" data-act="matches">Atualizar</button></div>
      ${matches.length ? `<ul class="adm-matches">${matches.map(m => `<li class="adm-card adm-match">
        <div class="adm-row-top"><strong>${esc(m.room ? `Sala ${m.code}` : 'Contra o computador')}</strong><span class="adm-status s-${m.state === 'jogando' ? 'resolvido' : m.state === 'aguardando' ? 'novo' : 'visto'}">${esc(m.state)}</span>
          <time>${m.startedAt ? `há ${ago(m.startedAt)}` : `criada há ${ago(m.createdAt)}`}</time></div>
        <p class="adm-muted">${esc([FORMATS[m.format] ?? m.format, m.matchLength === 'bo3' ? `melhor de três, jogo ${m.gameNumber}` : null, `${m.playerCount} jogadores`,
          m.turn ? `turno ${m.turn}` : null, m.phase, m.activePlayer && `vez de ${m.activePlayer}`].filter(Boolean).join(' · '))}</p>
        <ul class="adm-players">${m.players.map(p => `<li class="${p.lost || p.conceded ? 'out' : ''}"><span class="adm-dot ${p.ai ? 'ai' : p.connected ? 'on' : 'off'}" title="${p.ai ? 'Computador' : p.connected ? 'Conectado' : 'Desconectado'}"></span>
          <strong>${esc(p.name)}</strong>${p.ai ? ' <span class="adm-muted">(IA)</span>' : ''}${p.life !== undefined ? ` · ${p.life} de vida` : ''}${p.lost ? ' · perdeu' : p.conceded ? ' · desistiu' : ''}
          ${p.deck ? `<span class="adm-muted"> · ${esc(p.deck)}</span>` : ''}</li>`).join('')}</ul>
        <p class="adm-muted adm-id">partida ${esc(m.matchId)}${m.room ? '' : ` · código ${esc(m.code)}`}</p></li>`).join('')}</ul>` : '<p class="adm-empty">Nenhuma partida na ponte agora.</p>'}`;
  } catch { section.innerHTML = '<p class="adm-error">Não consegui falar com a ponte. Ela está no ar?</p>'; }
}
addEventListener('hashchange', () => { if (root.querySelector('.adm-top')) syncTab(); });

// ---------------------------------------------------------------- histórico

/** Uma partida gravada, como a ponte grava (veja MatchHistory.java): os índices apontam para players. */
interface PastMatch {
  id: string; startedAt: string; endedAt: string; ms: number; format: string; length: string; mode: 'ia' | 'rede'; public?: boolean;
  /** Como acabou; as linhas gravadas antes do campo existir são todas concluídas. */
  end?: End;
  winner: number | null;
  players: { name?: string; ai: boolean; deck: string; colors: string; commander?: string; wins: number }[];
  games: { winner: number | null; turns: number; ms?: number; end?: string; result: string[]; mull: number[] }[];
}
const LOSS: Record<string, string> = { LifeReachedZero: 'vida', Conceded: 'desistência', Milled: 'grimório vazio', Poisoned: 'veneno', CommanderDamage: 'dano de comandante', SpellEffect: 'efeito de carta', OpponentWon: 'vitória de outro' };
type End = 'concluida' | 'concedida' | 'queda';
const ENDS: Record<End, [string, string]> = { concluida: ['Concluídas', 'concluída'], concedida: ['Concedidas', 'concedida'], queda: ['Quedas', 'queda'] };
const endOf = (m: PastMatch): End => m.end ?? 'concluida';
let historyMonth = '';
let historyMonths: string[] = [];
let historyEnd: End | '' = '';
let past: PastMatch[] = [];
const minutes = (ms: number) => ms < 60000 ? `${Math.round(ms / 1000)} s` : ms < 3600000 ? `${Math.round(ms / 60000)} min` : `${Math.floor(ms / 3600000)} h ${Math.round(ms / 60000) % 60} min`;
const monthName = (month: string) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
const playerName = (p: PastMatch['players'][number], i: number) => p.name ?? (p.ai ? 'IA' : i === 0 ? 'Jogador' : `Jogador ${i + 1}`);
const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

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
  const section = root.querySelector<HTMLElement>('#admHistorico')!;
  const months = historyMonths;
  // Os totais seguem o filtro de como a partida acabou.
  const shown = historyEnd ? past.filter(m => endOf(m) === historyEnd) : past;
  const count = (test: (m: PastMatch) => boolean) => shown.filter(test).length;
  const formats = Object.entries(FORMATS).map(([key, label]) => [label, count(m => m.format === key)] as const).filter(([, n]) => n);
  const games = shown.flatMap(m => m.games);
  // Decks humanos e da IA juntos: quantas partidas cada um jogou e quantas venceu.
  const decks = new Map<string, { played: number; won: number }>();
  for (const m of shown) m.players.forEach((p, i) => {
    const d = decks.get(p.deck) ?? { played: 0, won: 0 };
    d.played++; if (m.winner === i) d.won++;
    decks.set(p.deck, d);
  });
  const topDecks = [...decks].sort((a, b) => b[1].played - a[1].played || b[1].won - a[1].won).slice(0, 5);
  const tile = (label: string, value: string, detail = '') => `<div class="adm-card adm-tile${value.length > 12 ? ' long' : ''}"><span>${esc(label)}</span><strong>${esc(value)}</strong>${detail ? `<small>${esc(detail)}</small>` : ''}</div>`;
  const ending = (m: PastMatch, g: PastMatch['games'][number]) => {
    const losses = g.result.map((r, i) => LOSS[r] ? `${playerName(m.players[i], i)} por ${LOSS[r]}` : null).filter(Boolean).join(', ');
    if (g.end === 'Interrupted') return losses ? `interrompido (${losses})` : 'interrompido';
    return losses || (g.winner === null ? 'empate' : '');
  };
  const total = (end: End | '') => end ? past.filter(m => endOf(m) === end).length : past.length;
  section.innerHTML = `<div class="adm-head"><h2>Histórico</h2><p class="adm-muted">${historyMonth ? `${shown.length} ${shown.length === 1 ? 'partida' : 'partidas'} em ${esc(monthName(historyMonth))}` : 'Nenhuma partida gravada ainda.'}</p>
      ${months.length ? `<label class="adm-month">Mês<select data-history-month>${months.map(m => `<option value="${m}"${m === historyMonth ? ' selected' : ''}>${esc(monthName(m))}</option>`).join('')}</select></label>` : ''}
      ${historyMonth ? `<label class="adm-month">Fim<select data-history-end>${(['', 'concluida', 'concedida', 'queda'] as const).map(e => `<option value="${e}"${e === historyEnd ? ' selected' : ''}>${e ? ENDS[e][0] : 'Todas'} (${total(e)})</option>`).join('')}</select></label>` : ''}
      <button class="adm-ghost" data-act="history">Atualizar</button>${historyMonth ? '<button class="adm-ghost" data-act="history-download">Baixar .jsonl</button>' : ''}</div>
    ${shown.length ? `<div class="adm-tiles">
      ${tile('Partidas', String(shown.length), `${count(m => m.mode === 'ia')} contra a IA · ${count(m => m.mode === 'rede')} em rede`)}
      ${tile('Formatos', formats.map(([label, n]) => `${label} ${n}`).join(' · '))}
      ${tile('Duração média', minutes(average(shown.map(m => m.ms))), `${games.length} ${games.length === 1 ? 'jogo' : 'jogos'} no total`)}
      ${tile('Turnos por jogo', average(games.map(g => g.turns)).toFixed(1).replace('.', ','), `${games.flatMap(g => g.mull).reduce((a, b) => a + b, 0)} mulligans`)}
      <div class="adm-card adm-tile adm-decks"><span>Decks mais jogados</span><ol>${topDecks.map(([deck, d]) => `<li><strong>${esc(deck)}</strong> <small>${d.played} ${d.played === 1 ? 'partida' : 'partidas'} · ${Math.round(100 * d.won / d.played)}% de vitórias</small></li>`).join('')}</ol></div>
    </div>
    <ul class="adm-past">${shown.map(m => `<li class="adm-card adm-past-row">
      <div class="adm-row-top"><strong>${esc([FORMATS[m.format] ?? m.format, m.length === 'bo3' ? 'melhor de três' : null].filter(Boolean).join(' · '))}</strong>
        <span class="adm-status">${m.mode === 'ia' ? 'contra a IA' : m.public ? 'sala pública' : 'sala privada'}</span>${endOf(m) !== 'concluida' ? `<span class="adm-status e-${endOf(m)}">${ENDS[endOf(m)][1]}</span>` : ''}<time>${when(m.endedAt)}</time></div>
      <ul class="adm-players">${m.players.map((p, i) => `<li class="${m.winner === i ? 'won' : ''}"><span class="adm-dot ${p.ai ? 'ai' : 'on'}"></span>${commanderThumbs(p.commander)}<strong>${esc(playerName(p, i))}</strong>
        <span class="adm-muted"> · ${esc(p.commander ?? p.deck)} (${esc(p.colors)})</span>${m.length === 'bo3' ? ` · ${p.wins} ${p.wins === 1 ? 'vitória' : 'vitórias'}` : ''}${m.winner === i ? ' · venceu' : ''}</li>`).join('')}</ul>
      <p class="adm-muted">${esc([minutes(m.ms), ...m.games.map((g, n) => `${m.games.length > 1 ? `jogo ${n + 1}: ` : ''}${g.turns} turnos${ending(m, g) ? `, ${ending(m, g)}` : ''}`)].join(' · '))}</p></li>`).join('')}</ul>`
    : historyMonth ? `<p class="adm-empty">${historyEnd ? `Nenhuma partida ${ENDS[historyEnd][1]} neste mês.` : 'Nenhuma partida neste mês.'}</p>` : ''}`;
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
function visible() {
  const q = filter.q.trim().toLowerCase();
  return items.filter(item => (filter.status === 'todos' || (filter.status === 'pendentes' ? ['novo', 'visto'].includes(item.status.status) : item.status.status === filter.status))
    && (!filter.kind || item.kind === filter.kind)
    && (!q || item.code.toLowerCase().includes(q) || (item.summary ?? '').toLowerCase().includes(q) || (item.status.note ?? '').toLowerCase().includes(q) || (item.version ?? '').includes(q)));
}

function renderList(total = totalBytes) {
  totalBytes = total;
  const section = root.querySelector<HTMLElement>('#admRelatos')!;
  const count = (status: string) => items.filter(i => i.status.status === status).length;
  const shown = visible();
  const option = (value: string, text: string, current: string) => `<option value="${value}"${value === current ? ' selected' : ''}>${text}</option>`;
  section.innerHTML = `<div class="adm-head"><h1>Relatos</h1><p class="adm-muted">${items.length} guardados · ${size(totalBytes)} · ${count('novo')} novos</p>
      <button class="adm-ghost" data-act="reload">Atualizar</button></div>
    <div class="adm-filters">
      <label>Estado<select data-filter="status">${option('pendentes', `Pendentes (${count('novo') + count('visto')})`, filter.status)}${option('todos', `Todos (${items.length})`, filter.status)}
        ${(Object.keys(STATUS) as Status[]).map(s => option(s, `${STATUS[s]} (${count(s)})`, filter.status)).join('')}</select></label>
      <label>Tipo<select data-filter="kind">${option('', 'Todos', filter.kind)}${option('erro', 'Algo deu errado', filter.kind)}${option('sugestao', 'Sugestão', filter.kind)}</select></label>
      <label class="adm-search">Buscar<input type="search" data-filter="q" value="${esc(filter.q)}" placeholder="Código, texto, nota ou versão"></label>
    </div>
    <div class="adm-split${selected ? ' has-detail' : ''}">
      <ul class="adm-list" aria-label="Relatos">${shown.length ? shown.map(item => `<li><button class="adm-row${item.code === selected ? ' on' : ''}" data-code="${esc(item.code)}" aria-current="${item.code === selected}">
        <span class="adm-row-top"><strong>${esc(item.code)}</strong>${kindBadge(item.kind)}${statusBadge(item.status.status)}<time>${when(item.receivedAt)}</time></span>
        <span class="adm-row-text">${esc(item.summary ?? 'Abra para ver a descrição.')}</span>
        <span class="adm-row-meta">${esc([item.version && `v${item.version}`, item.format && (FORMATS[item.format] ?? item.format), item.match ? (item.bridge ? 'partida + ponte' : 'partida') : null, size(item.bytes), item.status.issue].filter(Boolean).join(' · '))}</span>
      </button></li>`).join('') : `<li class="adm-empty">${items.length ? 'Nenhum relato com esses filtros.' : 'Nenhum relato ainda.'}</li>`}</ul>
      <section class="adm-detail" id="admDetail" aria-live="polite"></section>
    </div>`;
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
  const r = reportOf(stored), rec = r.recording, meta = rec?.meta, d = r.device ?? meta?.device, bridge = stored.bridge;
  const rows = (pairs: [string, unknown][]) => `<dl class="adm-dl">${pairs.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(String(v))}</dd>`).join('')}</dl>`;
  const errors = (rec?.notes ?? []).filter((n: Stored) => n.kind !== 'aviso');
  const duration = rec ? Math.round((rec.endedAt - rec.startedAt) / 1000) : 0;
  panel.innerHTML = `<div class="adm-detail-head"><button class="adm-ghost adm-back" data-act="back">← Lista</button>
      <h2>${esc(code)}</h2>${kindBadge(item.kind)}${statusBadge(item.status.status)}</div>
    <blockquote class="adm-quote">${esc(r.description ?? '')}</blockquote>
    <div class="adm-actions">
      ${rec ? `<a class="arena-btn primary" href="/tests/fixtures/replay.html?relato=${encodeURIComponent(code)}" target="_blank" rel="noopener">Repetir na mesa</a>` : ''}
      <a class="arena-btn secondary" data-act="issue" href="${esc(newIssueUrl(stored))}" target="_blank" rel="noopener">Criar issue no GitHub</a>
      <button class="adm-ghost" data-act="copy">Copiar texto da issue</button>
      <button class="adm-ghost" data-act="download">Baixar arquivo</button>
      <button class="adm-ghost adm-danger" data-act="delete">Excluir</button>
    </div>
    <p class="adm-notice" role="status">${esc(notice)}</p>
    <form class="adm-card adm-status-form" id="admStatus">
      <h3>Tratamento</h3>
      <label>Estado<select name="status">${(Object.keys(STATUS) as Status[]).map(s => `<option value="${s}"${s === item.status.status ? ' selected' : ''}>${STATUS[s]}</option>`).join('')}</select></label>
      <label>Issue<input name="issue" value="${esc(item.status.issue ?? '')}" placeholder="#42 ou o link" maxlength="200"></label>
      <label class="adm-wide">Nota<textarea name="note" rows="3" maxlength="2000" placeholder="O que foi visto, o que falta, em que versão foi corrigido…">${esc(item.status.note ?? '')}</textarea></label>
      <div class="adm-wide adm-form-end"><span class="adm-muted">Atualizado em ${when(item.status.updatedAt)}</span><button class="arena-btn primary" type="submit">Salvar</button></div>
    </form>
    <h3>Detalhes</h3>
    ${rows([['recebido', when(stored.receivedAt ?? r.createdAt)], ['onde', r.from === 'partida' ? 'durante a partida' : 'tela inicial'], ['versão da mesa', r.app?.version],
      ['regras / motor', r.match?.rulesVersion && `${r.match.rulesVersion} / ${r.match.engineVersion ?? '?'}`], ['formato', r.match?.format && `${FORMATS[r.match.format] ?? r.match.format}${r.match.net ? ' em rede' : ''}, ${r.match.playerCount ?? '?'} jogadores`],
      ['jogadores', meta?.players?.map((p: Stored) => `${p.name}${p.ai ? ' (IA)' : ''}`).join(', ')],
      ['aparelho', d && `${d.viewport} (tela ${d.screen}, ${d.pixelRatio}×), ${d.touch ? 'toque' : 'sem toque'}, ${d.installed ? 'instalado' : 'no navegador'}`],
      ['navegador', d?.userAgent], ['preferências', r.preferences && Object.entries(r.preferences).map(([k, v]) => `${k}: ${v}`).join(', ')],
      ['partida', rec ? `${rec.frames.length} quadros${rec.droppedFrames ? ` (${rec.droppedFrames} cortados)` : ''}, ${Math.floor(duration / 60)} min ${duration % 60} s, ${rec.sent.length} ações` : 'não anexada'],
      ['diário da ponte', bridge ? `${bridge.snapshots?.length ?? 0} retratos, ${bridge.actions?.length ?? 0} ações` : rec ? 'não veio (partida já encerrada na ponte)' : null],
      ['tamanho', size(item.bytes)]])}
    ${errors.length ? `<h3>Erros registrados (${errors.length})</h3><ul class="adm-errors">${errors.slice(-40).map((n: Stored) => `<li><time>${new Date(n.at).toLocaleTimeString('pt-BR')}</time> <strong>${esc(n.kind)}</strong> ${esc(n.text)}${n.detail ? `<code>${esc(n.detail)}</code>` : ''}</li>`).join('')}</ul>` : ''}
    ${r.diagnostics ? `<details><summary>Relatório do painel de erros</summary><pre>${esc(r.diagnostics)}</pre></details>` : ''}
    ${bridge?.snapshots?.length ? `<details><summary>Retratos do Forge (${bridge.snapshots.length})</summary>${bridge.snapshots.map((s: Stored, i: number) => `<p class="adm-muted">Retrato ${i}: jogo ${s.gameNumber}, turno ${s.turn}, ${esc(s.phase)} (${s.reason === 'relato' ? 'no relato' : 'começo do turno'})</p>`).join('')}
      <p class="adm-muted">Para restaurar no Forge: <code>./scripts/rodar.sh --mode=replay --relato=${esc(code)}.json.gz --retrato=N</code> com o arquivo baixado.</p></details>` : ''}`;
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
