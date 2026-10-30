import './style.css';
import { setupPwa } from './ui/pwa';
import { type DeckData } from './decks';
import { deckBracket } from './brackets';
import { mountDeckBuilder } from './ui/deckbuilder';
import { ForgeClient, FORGE_URL, type FState, type MatchConfig, type ClientMessage } from './forge/client';
import { createForgeTableView } from './ui/forgeTable';
import { deckArt, deckCover, mountLobby } from './ui/lobby';
import { enterLandscape, mountRotateGate } from './ui/landscape';
import { hideCardPreview } from './ui/cardInspector';
import { createFreeTableView, loadFreeTable } from './ui/freeTable';
import { MatchRecorder, type RecordingMeta } from './forge/recording';
import { buildReport, deviceInfo, encodeReport, latestMatch, loadLastMatch, localPreferences, saveLastMatch, setLiveMatch, startFeedbackQueue, type MatchAttachment } from './feedback';
import { openFeedbackForm } from './ui/feedbackForm';
import { VERSION } from './ui/changelog';
import { atualizarConta } from './conta/session';
import { esconderOneTap, mostrarOneTap } from './conta/google';
import { iniciarSincronia } from './ui/contaMenu';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="screen" id="scrLobby"></div>
  <div class="screen" id="scrGame" hidden></div>
  <div class="screen" id="scrDecks" hidden></div>
  <div class="screen" id="scrFree" hidden></div>
  <footer class="credits">Cartas e imagens: <a href="https://scryfall.com" target="_blank" rel="noopener">Scryfall</a>.
  Magic: The Gathering é marca da Wizards of the Coast; projeto de fã, sem afiliação.</footer>`;

const screens = { lobby: '#scrLobby', game: '#scrGame', decks: '#scrDecks', free: '#scrFree' } as const;
function show(name: keyof typeof screens) {
  hideCardPreview(true);
  screen = name;
  for (const [k, sel] of Object.entries(screens)) (document.querySelector(sel) as HTMLElement).hidden = k !== name;
  // A mesa livre usa as mesmas regras de tela da partida (tela cheia, girar o celular).
  document.body.dataset.screen = name === 'free' ? 'game' : name;
  // One Tap só na tela inicial e em Meus decks: nunca por cima da mesa.
  if (name === 'lobby' || name === 'decks') void mostrarOneTap(); else esconderOneTap();
}

let forge: ForgeClient | null = null;
let forgeUrl = '';
let lastMatch: [DeckData, DeckData | null, MatchConfig, (DeckData | null)[]?] | null = null;
let connecting: Promise<ForgeClient | null> | null = null;
let connectingUrl = '';
let connectionAttempt = 0;
let pendingStart: { resolve(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> } | null = null;
function finishStart(error?: string) {
  if (!pendingStart) return;
  clearTimeout(pendingStart.timer);
  if (error) pendingStart.reject(new Error(error)); else pendingStart.resolve();
  pendingStart = null;
}
let screen: keyof typeof screens = 'lobby';

/**
 * Partida no Forge em andamento (ou sala esperando o oponente): o que é preciso para redesenhar a mesa
 * e voltar ao mesmo assento se a conexão cair. code/token chegam da ponte em state.session.
 */
interface ForgeMatch { url: string; deck: DeckData; opp?: DeckData; opponents?: (DeckData | null)[]; net: boolean; config?: MatchConfig; code?: string; token?: string }
let current: ForgeMatch | null = null;
/** Assistindo à partida de uma sala: sem deck, sem assento e sem gravação; cair a conexão pede para assistir de novo. */
let watching: { url: string; code: string; name: string } | null = null;

/** Guardada no localStorage para voltar à partida mesmo depois de recarregar a página ou fechar a aba. */
const RESUME_KEY = 'mesa:resume';
function saveResume() {
  try { localStorage.setItem(RESUME_KEY, JSON.stringify(current)); } catch { /* sem armazenamento */ }
}
function clearResume() {
  try { localStorage.removeItem(RESUME_KEY); } catch { /* sem armazenamento */ }
}
function loadResume(): ForgeMatch | null {
  try {
    const m = JSON.parse(localStorage.getItem(RESUME_KEY) ?? 'null') as ForgeMatch | null;
    return m?.url && m.code && m.token && m.deck ? m : null;
  } catch { return null; }
}

/**
 * Gravação da partida para os relatos (item 28): estados recebidos, mensagens enviadas e erros. Fica na memória
 * e, de tempos em tempos, no IndexedDB, para relatar da tela inicial depois que a partida acabou.
 */
const recorder = new MatchRecorder({ app: VERSION });
/** Assento da partida gravada, para a ponte juntar o diário dela ao relato. Continua depois de sair da partida. */
let recordedSeat: Pick<MatchAttachment, 'url' | 'code' | 'token'> = {};
const recordingMeta = (m: ForgeMatch): RecordingMeta => ({ app: VERSION, net: m.net, format: m.config?.format, deck: forgeDeck(m.deck), device: deviceInfo(), preferences: localPreferences() });
const liveAttachment = (): MatchAttachment | null => recorder.empty ? null : { recording: recorder.snapshot(), ...recordedSeat };
setLiveMatch(liveAttachment);
let savedRevision = -1;
function persistRecording() {
  if (recorder.empty || recorder.revision === savedRevision) return;
  savedRevision = recorder.revision;
  void saveLastMatch(liveAttachment()!);
}
setInterval(persistRecording, 20000);
addEventListener('pagehide', persistRecording);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persistRecording(); });
startFeedbackQueue();

function download(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/gzip' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const forgeTable = createForgeTableView(document.querySelector('#scrGame')!, {
  onFeedback({ kind, attach, diagnostics }) {
    openFeedbackForm({ kind, from: 'partida', attach, diagnostics, match: latestMatch });
  },
  async onDownloadRecording() {
    const match = await latestMatch();
    if (!match) throw new Error('Nenhuma partida gravada.');
    const report = buildReport({ kind: 'erro', description: 'Gravação baixada do painel de erros.', from: 'partida', version: VERSION, recording: match.recording });
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    download(await encodeReport(report), `mesa-gravacao-${stamp}.json.gz`);
  },
  onDiagnostic(entry) { recorder.note(entry.kind, entry.text, entry.detail); },
  onExit() {
    persistRecording();
    forge?.send({ type: 'leave' });
    current = null; watching = null;
    clearResume();
    forge?.close(); forge = null;
    show('lobby'); lobby.showRoom(null); lobby.refresh();
  },
  onRematch() {
    // Assistindo, o único botão que chega aqui é o Reconectar.
    if (watching) { void autoRewatch(); return; }
    // Contra a IA ou em rede, a ponte recomeça a partida com os mesmos decks.
    if (forge?.connected && current) forge.send({ type: 'rematch' });
    else if (current?.token) void reconnect();
    else if (lastMatch) void startMatch(...lastMatch);
  },
});

mountRotateGate();
setupPwa();
void atualizarConta();

const freeTable = createFreeTableView(document.querySelector('#scrFree')!, {
  onExit() { show('lobby'); lobby.refresh(); },
});

const lobby = mountLobby(document.querySelector('#scrLobby')!, {
  onPlay: async (you, opp, config, opponents) => { void enterLandscape(); await startMatch(you, opp, config, opponents); },
  onFreePlay: (you, format) => { void enterLandscape(); leaveForge(); freeTable.open(you, format); show('free'); },
  onHost: async (you, name, url, config, visibility, code) => { void enterLandscape(); await startNetMatch(you, url, { type: 'host', name, deck: forgeDeck(you), cover: deckCover(you), bracket: deckBracket(you), config, visibility, ...(code ? { code } : {}) }, config); },
  onJoin: async (you, name, code, url) => { void enterLandscape(); await startNetMatch(you, url, { type: 'join', code, name, deck: forgeDeck(you), cover: deckCover(you), bracket: deckBracket(you) }); },
  onWatch: async (code, name, url) => { void enterLandscape(); await startWatching(url, code, name); },
  onValidate: async (deck, format, url) => (await requireForge(url)).validateDeck(forgeDeck(deck), format),
  onLookup: async (code, url) => (await requireForge(url)).lookupRoom(code),
  onListRooms: async url => (await requireForge(url)).listRooms(),
  onCancelRoom: () => { leaveForge(); lobby.setStatus(''); },
  onSay: key => forge?.send({ type: 'room-say', key }),
  onDecks: (action = 'library', format) => { builder.open({action, format}); show('decks'); },
  onEditDeck: deckId => { builder.open({action: 'edit', deckId}); show('decks'); },
});

const builder = mountDeckBuilder(document.querySelector('#scrDecks')!, {
  onBack: () => { lobby.refresh(); show('lobby'); },
  onChange: () => lobby.refresh(),
  fetchDeckSource: async (site, id) => (await requireForge(FORGE_URL)).fetchDeckSource(site, id),
  similarCards: async (oracleId, candidates) => (await requireForge(FORGE_URL)).similarCards(oracleId, candidates),
  validateDeck: async (deck, format) => {
    const result = await (await requireForge(FORGE_URL)).validateDeck(forgeDeck(deck), format);
    return {...result, issues: result.issues.map(issue => ({...issue, section: issue.section === 'main' || issue.section === 'sideboard' || issue.section === 'commander' ? issue.section : undefined}))};
  },
});

// Decks que chegaram da conta (outro aparelho, junção, lixeira) ou de outra aba: as duas telas se redesenham.
addEventListener('mesa:decks-sincronizados', () => { lobby.refresh(); builder.refresh(); });
iniciarSincronia();

const forgeDeck = (d: DeckData) => ({ name: d.name, cards: d.cards, sideboard: d.sideboard ?? [], commanders: d.commanders ?? [] });
/** Deck escolhido para o computador, com o bracket junto para a mesa mostrar na partida. */
const aiDeck = (d: DeckData) => ({ ...forgeDeck(d), bracket: deckBracket(d) });
async function requireForge(url: string): Promise<ForgeClient> {
  const client = await connectForge(url, null);
  if (!client) throw new Error('Não foi possível conectar ao servidor de jogo. Confira a conexão e tente novamente.');
  return client;
}

/**
 * Conecta à ponte (reaproveitando a conexão aberta com o mesmo endereço) e liga os eventos à mesa.
 * hint null: falha em silêncio, sem mexer na tela (usado nas tentativas de reconexão).
 */
async function connectForge(url: string, hint: string | null): Promise<ForgeClient | null> {
  if (forge?.connected && forgeUrl === url) return forge;
  if (connecting && connectingUrl === url) return connecting;
  connectingUrl = url;
  connecting = openForge(url, hint, ++connectionAttempt);
  const attempt = connecting;
  try { return await attempt; } finally { if (connecting === attempt) connecting = null; }
}

async function openForge(url: string, hint: string | null, attempt: number): Promise<ForgeClient | null> {
  forge?.close();
  forge = null;
  if (hint !== null) lobby.setStatus('Conectando à ponte do Forge…');
  const client = new ForgeClient();
  try {
    await client.connect(url);
  } catch {
    if (hint !== null && attempt === connectionAttempt) {
      lobby.setStatus(`Não encontrei a ponte do Forge em ${url}. ${hint}`, true);
      show('lobby');
    }
    return null;
  }
  if (attempt !== connectionAttempt) { client.close(); return null; }
  forge = client;
  forgeUrl = url;
  let prev: FState | null = null;
  client.onSend = msg => { if (forge === client && current) recorder.sent(msg); };
  client.onState = s => {
    if (forge !== client) return;
    const m = current;
    if (m) {
      // Revanche ou "Recomeçar": a ponte troca o matchId e a gravação começa de novo.
      if (s.matchId && recorder.matchId && s.matchId !== recorder.matchId) { persistRecording(); recorder.reset(recordingMeta(m)); }
      recorder.received(s);
      recordedSeat = { url: m.url, code: s.session?.code ?? m.code, token: s.session?.token ?? m.token };
    }
    if (m && s.session) {
      m.code = s.session.code;
      m.token = s.session.token;
      // Só partidas em andamento ficam guardadas: no fim não há para onde voltar.
      m.config = s.config ?? m.config;
      if (s.match?.over ?? s.gameOver) clearResume(); else saveResume();
    }
    // A mesa abre no primeiro estado (sala em rede, volta depois de recarregar) e é zerada quando
    // começa outra partida (revanche ou "Recomeçar").
    const fresh = prev && (prev.matchId !== s.matchId || prev.match?.gameNumber !== s.match?.gameNumber || (!s.match && ((prev.gameOver && !s.gameOver) || s.turn < prev.turn)));
    if (m && (screen !== 'game' || fresh)) enterForgeTable(client, m);
    else if (!m && watching && s.watching && (screen !== 'game' || fresh)) enterForgeTable(client, null);
    prev = s;
    finishStart();
    forgeTable.render();
  };
  client.onRoom = r => {
    if (current?.net && !r.started) {
      current.code = r.code; current.token = r.token; current.config = r.config;
      saveResume(); lobby.showRoom(r); lobby.setStatus(''); finishStart();
    }
  };
  client.onRoomSay = (seat, key) => lobby.roomSay(seat, key);
  client.onValidation = (validation, target) => {
    const message = `${target === 'opponent' ? 'Deck do computador: ' : ''}${validation.issues.map(issue => `${issue.card ? `${issue.card}: ` : ''}${issue.message}`).join(' ')}`;
    if (screen === 'game') forgeTable.notice(message, true);
    else { lobby.setStatus(message, true); finishStart(message); current = null; }
  };
  client.onNotice = (text, error, detail) => {
    if (error) finishStart(text);
    // Erros na mesa já entram pelo painel de erros (onDiagnostic).
    if (current && (!error || screen !== 'game')) recorder.note(error ? 'erro' : 'aviso', text);
    if (screen === 'game') forgeTable.notice(text, error, detail);
    else lobby.setStatus(text, error);
    // Voltando a assistir, a sala pode ter acabado: sem estado nesta conexão, volta ao início com o aviso.
    if (error && watching && !client.state && screen === 'game') { watching = null; show('lobby'); lobby.setStatus(text, true); return; }
    // Sala fechada ou código errado antes de a partida começar: volta ao formulário.
    if (error && current?.net && screen !== 'game') { current = null; lobby.showRoom(null); }
  };
  client.onDiagnostic = d => { if (forge === client) forgeTable.diagnostic(d); };
  client.onGone = text => {
    // A ponte não conhece mais a partida (encerrada ou ponte reiniciada): esquece e volta ao início.
    current = null; watching = null;
    clearResume();
    client.close();
    if (forge === client) forge = null;
    show('lobby');
    lobby.showRoom(null);
    lobby.setStatus(text, true);
  };
  client.onClose = () => {
    if (forge !== client) return;
    finishStart('A conexão com o servidor foi interrompida.');
    if (watching) void autoRewatch();
    else if (current?.token && client.replaced) forgeTable.disconnected('A partida foi aberta em outra janela. Reconecte para trazê-la de volta para cá.');
    else if (current?.token) void autoReconnect();
    else if (screen === 'game') forgeTable.disconnected();
    else if (current?.net) { current = null; lobby.showRoom(null); lobby.setStatus('A conexão com a ponte caiu.', true); }
  };
  return client;
}

function enterForgeTable(client: ForgeClient, m: ForgeMatch | null) {
  forgeTable.attach(client, m ? [deckArt(m.deck), ...(m.opponents ?? [m.opp ?? null]).map(d => d ? deckArt(d) : undefined)] : []);
  lobby.setStatus('');
  lobby.showRoom(null);
  show('game');
}

/** The server validates before replacing a session. Keep setup visible until acceptance. */
async function requestMatch(client: ForgeClient, match: ForgeMatch, message: ClientMessage) {
  finishStart('Uma nova solicitação substituiu a anterior.');
  current = match;
  persistRecording();
  recorder.reset(recordingMeta(match));
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (current === match) { client.send({type: 'leave'}); current = null; clearResume(); lobby.showRoom(null); }
      finishStart('O servidor demorou para iniciar a partida. Tente novamente.');
    }, 20000);
    pendingStart = {resolve, reject, timer};
    client.send(message);
  });
}
async function startMatch(you: DeckData, opp: DeckData | null, config: MatchConfig, opponents?: (DeckData | null)[]) {
  const client = await requireForge(FORGE_URL);
  lastMatch = [you, opp, config, opponents];
  lobby.setStatus('Preparando a mesa…');
  await requestMatch(client, {url: FORGE_URL, deck: you, opp: opp ?? undefined, opponents, config, net: false}, {type: 'start', you: forgeDeck(you), bracket: deckBracket(you), opponent: opp ? aiDeck(opp) : null, ...(opponents ? { opponents: opponents.map(d => d ? aiDeck(d) : null) } : {}), config});
}
async function startNetMatch(you: DeckData, url: string, message: ClientMessage, config?: MatchConfig) {
  const client = await requireForge(url);
  lobby.setStatus(message.type === 'host' ? 'Criando a sala…' : 'Entrando na sala…');
  await requestMatch(client, {url, deck: you, config, net: true}, message);
}

/** Assiste à partida de uma sala; resolve no primeiro estado, ou falha com o aviso da ponte. */
async function startWatching(url: string, code: string, name: string) {
  leaveForge();
  const client = await requireForge(url);
  finishStart('Uma nova solicitação substituiu a anterior.');
  watching = { url, code, name };
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => finishStart('O servidor demorou para responder. Tente novamente.'), 20000);
      pendingStart = {resolve, reject, timer};
      client.send({ type: 'watch', code, name });
    });
  } catch (error) { watching = null; throw error; }
}

/** Conexão caída assistindo: tenta assistir de novo, com intervalos crescentes, antes de oferecer o botão. */
async function autoRewatch() {
  if (reconnecting) return;
  reconnecting = true;
  const w = watching;
  try {
    for (const [i, delay] of [300, 1000, 2000, 3000, 5000, 8000].entries()) {
      if (watching !== w || !w) return;
      if (screen === 'game') forgeTable.reconnecting(i + 1);
      await new Promise(r => setTimeout(r, delay));
      if (watching !== w) return;
      const client = await connectForge(w.url, null);
      if (client) { client.send({ type: 'watch', code: w.code, name: w.name }); if (screen === 'game') enterForgeTable(client, null); return; }
    }
    if (watching === w && screen === 'game') forgeTable.disconnected();
  } finally {
    reconnecting = false;
  }
}

/** Abandona a partida do Forge em andamento (ou a sala esperando oponente), se houver. */
function leaveForge() {
  if (watching) { forge?.send({ type: 'leave' }); watching = null; }
  if (!current) return;
  finishStart('A solicitação foi cancelada.');
  forge?.send({ type: 'leave' });
  current = null;
  clearResume();
  lobby.showRoom(null);
}

/** Volta ao assento da partida atual. false se a ponte não respondeu. */
async function reconnect(): Promise<boolean> {
  const m = current;
  if (!m?.code || !m.token) return false;
  const client = await connectForge(m.url, null);
  if (!client || current !== m) return false;
  client.send({ type: 'rejoin', code: m.code, token: m.token });
  if (screen === 'game') enterForgeTable(client, m);
  return true;
}

let reconnecting = false;
/** Tenta voltar sozinho, com intervalos crescentes (~40 s no total), antes de oferecer o botão. */
async function autoReconnect() {
  if (reconnecting) return;
  reconnecting = true;
  const m = current;
  const delays = [300, 1000, 2000, 3000, 5000, 8000, 8000, 10000];
  try {
    for (let i = 0; i < delays.length; i++) {
      if (current !== m) return;
      if (screen === 'game') forgeTable.reconnecting(i + 1);
      await new Promise(r => setTimeout(r, delays[i]));
      if (current !== m) return;
      if (await reconnect()) return;
    }
    if (current === m && screen === 'game') forgeTable.disconnected();
  } finally {
    reconnecting = false;
  }
}

/** Ao abrir a página: se havia uma partida em andamento, volta para ela. */
async function resumeSaved(saved: ForgeMatch) {
  current = saved;
  // Recarregou a página no meio da partida: a gravação guardada continua de onde parou.
  const last = await loadLastMatch();
  if (current !== saved) return;
  if (last && last.code === saved.code) { recorder.resume(last.recording); recorder.note('conexão', 'Página recarregada; a gravação continua.'); }
  else recorder.reset(recordingMeta(saved));
  recordedSeat = { url: saved.url, code: saved.code, token: saved.token };
  lobby.setStatus('Voltando à partida em andamento…');
  if (await reconnect()) return;
  if (current === saved) {
    lobby.setStatus(`Não consegui voltar à partida em andamento: a ponte em ${saved.url} não respondeu. Recarregue a página para tentar de novo.`, true);
    current = null;
  }
}

show('lobby');

// Old shared links now open setup; no match starts without a format and deck choice.
if (location.hash === '#jogar') history.replaceState(null, '', location.pathname + location.search);
const saved = loadResume();
const savedFree = loadFreeTable();
// Link de convite (?sala=MESA): sai do endereço para recarregar a página não entrar de novo.
const roomLink = new URLSearchParams(location.search).get('sala')?.trim().toUpperCase();
if (roomLink) { const params = new URLSearchParams(location.search); params.delete('sala'); history.replaceState(null, '', location.pathname + (params.size ? `?${params}` : '') + location.hash); }
// Quem já está numa partida volta para ela; o link fica para depois.
if (saved) void resumeSaved(saved);
else if (roomLink) lobby.openRoomLink(roomLink);
else if (savedFree) { freeTable.resume(savedFree); show('free'); }
