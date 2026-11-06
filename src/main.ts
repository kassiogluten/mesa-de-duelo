// Entrada da página do jogo: monta a tela inicial, a mesa, os decks e a mesa livre e troca entre elas.
import { EVENTS, KEYS, NAMES, load } from './storage';
import { DEFAULT_AI_STYLE, isAiStyle } from './aiStyle';
import './style.css';
import { setupPwa } from './ui/pwa';
import { type DeckData } from './decks';
import { deckBracket } from './brackets';
import { mountDeckBuilder } from './ui/deckbuilder';
import { ForgeClient, FORGE_URL, type MatchConfig, type ClientMessage, type LabScenario } from './forge/client';
import { createForgeTableView } from './ui/forgeTable';
import { screenWake } from './ui/screenWake';
import { deckArt, mountLobby } from './ui/lobby';
import { enterLandscape, mountRotateGate } from './ui/landscape';
import { hideCardPreview } from './ui/cardInspector';
import { createFreeTableView, loadFreeTable } from './ui/freeTable';
import { buildReport, encodeReport, latestMatch, loadLastMatch, startFeedbackQueue } from './feedback';
import { openFeedbackForm } from './ui/feedbackForm';
import { VERSION } from './ui/changelog';
import { atualizarConta } from './conta/session';
import { esconderOneTap, mostrarOneTap } from './conta/google';
import { iniciarSincronia } from './ui/contaMenu';
import { mountLab } from './ui/lab';
import { clearResume, loadResume, saveResume, type ForgeMatch } from './app/resume';
import { aiDeck, forgeDeck, LAB_DECK, matchOwner, NO_DECK, playerName, seatDeck } from './app/matchDecks';
import { createRecordingSession } from './app/recordingSession';
import { createForgeConnection } from './app/connection';
import { bindMatchClient, type MatchSession, type Screen } from './app/matchWiring';
import { RECONNECT_DELAYS, retryWithDelays, REWATCH_DELAYS } from './app/retry';
import { startupLinks } from './app/startupLinks';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="screen" id="scrLobby"></div>
  <div class="screen" id="scrGame" hidden></div>
  <div class="screen" id="scrDecks" hidden></div>
  <div class="screen" id="scrFree" hidden></div>
  <div class="screen" id="scrLab" hidden></div>
  <footer class="credits">Cartas e imagens: <a href="https://scryfall.com" target="_blank" rel="noopener">Scryfall</a>.
  Magic: The Gathering é marca da Wizards of the Coast; projeto de fã, sem afiliação.</footer>`;

const screens: Record<Screen, string> = { lobby: '#scrLobby', game: '#scrGame', decks: '#scrDecks', free: '#scrFree', lab: '#scrLab' };
function show(name: Screen) {
  hideCardPreview(true);
  session.screen = name;
  for (const [k, sel] of Object.entries(screens)) (document.querySelector(sel) as HTMLElement).hidden = k !== name;
  // A mesa livre usa as mesmas regras de tela da partida (tela cheia, girar o celular).
  document.body.dataset.screen = name === 'free' ? 'game' : name;
  // Tela acesa enquanto há partida ou mesa livre aberta (S18).
  screenWake.setActive(name === 'game' || name === 'free');
  // One Tap só na tela inicial e em Meus decks: nunca por cima da mesa.
  if (name === 'lobby' || name === 'decks') void mostrarOneTap(); else esconderOneTap();
}

/** A partida do assento (ou a sala esperando o oponente), a assistida e a tela à vista. */
const session: MatchSession = { current: null, watching: null, screen: 'lobby' };
let lastMatch: [DeckData, DeckData | null, MatchConfig, (DeckData | null)[]?] | null = null;
let pendingStart: { resolve(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> } | null = null;
function finishStart(error?: string) {
  if (!pendingStart) return;
  clearTimeout(pendingStart.timer);
  if (error) pendingStart.reject(new Error(error)); else pendingStart.resolve();
  pendingStart = null;
}

const recording = createRecordingSession();
const { recorder } = recording;
startFeedbackQueue();

function download(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/gzip' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const connection = createForgeConnection({
  onConnecting: () => lobby.setStatus('Conectando ao servidor…'),
  onUnreachable(url, hint) {
    lobby.setStatus(`Não encontrei o servidor em ${url}. ${hint}`, true);
    show('lobby');
  },
  bind: client => bindMatchClient(client, {
    session, connection, recording, table: forgeTable, lobby, show, enterTable: enterForgeTable, finishStart,
    autoRewatch: () => void autoRewatch(), autoReconnect: () => void autoReconnect(),
  }),
});
const requireForge = (url: string) => connection.require(url);

const forgeTable = createForgeTableView(document.querySelector('#scrGame')!, {
  onFeedback({ kind, attach, diagnostics }) {
    openFeedbackForm({ kind, from: 'partida', attach, diagnostics, match: latestMatch });
  },
  async onDownloadRecording() {
    const match = await latestMatch();
    if (!match) throw new Error('Nenhuma partida gravada.');
    const report = buildReport({ kind: 'erro', description: 'Gravação baixada do painel de erros.', from: 'partida', version: VERSION, recording: match.recording });
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    download(await encodeReport(report), `${NAMES.gravacaoArquivo}${stamp}.json.gz`);
  },
  onDiagnostic(entry) { recorder.note(entry.kind, entry.text, entry.detail); },
  onExit() {
    recording.persist();
    connection.client?.send({ type: 'leave' });
    session.current = null; session.watching = null;
    clearResume();
    connection.close();
    show('lobby'); lobby.showRoom(null); lobby.refresh();
  },
  onLabClose() {
    recording.persist();
    connection.client?.send({ type: 'lab-close' });
    session.current = null;
    clearResume();
    connection.close();
    labView.open(); show('lab'); scrollTo({top: 0});
  },
  onRematch() {
    // Assistindo, o único botão que chega aqui é o Reconectar.
    if (session.watching) { void autoRewatch(); return; }
    // Contra a IA ou em rede, a ponte recomeça a partida com os mesmos decks.
    const forge = connection.client;
    if (forge?.connected && session.current) forge.send({ type: 'rematch' });
    else if (session.current?.token) void reconnect();
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
  onHost: async (you, name, url, config, visibility, code) => { void enterLandscape(); await startNetMatch(you ?? NO_DECK, url, { type: 'host', name, ...seatDeck(you), config, visibility, ...(code ? { code } : {}) }, config); },
  onJoin: async (you, name, code, url) => { void enterLandscape(); await startNetMatch(you ?? NO_DECK, url, { type: 'join', code, name, ...seatDeck(you) }); },
  onChooseRoomDeck: async deck => {
    const forge = connection.client;
    if (!forge?.connected || !session.current?.net) throw new Error('A conexão com o servidor caiu.');
    await forge.chooseRoomDeck(seatDeck(deck));
    // A mesa, a gravação e a volta à partida passam a usar o deck escolhido na sala.
    if (session.current?.net) { session.current.deck = deck; recorder.meta.deck = forgeDeck(deck); saveResume(session.current); }
  },
  onJoinLab: async (code, name, url) => { void enterLandscape(); await startNetMatch(LAB_DECK, url, { type: 'join', code, name, deck: null }, undefined, true); },
  onWatch: async (code, name, url) => { void enterLandscape(); await startWatching(url, code, name); },
  onValidate: async (deck, format, url) => (await requireForge(url)).validateDeck(forgeDeck(deck), format),
  onLookup: async (code, url) => (await requireForge(url)).lookupRoom(code),
  onListRooms: async url => (await requireForge(url)).listRooms(),
  onCancelRoom: () => { leaveForge(); lobby.setStatus(''); },
  onSay: key => connection.client?.send({ type: 'room-say', key }),
  onFillWithComputers: () => connection.client?.send({ type: 'fill-computers' }),
  onReady: on => connection.client?.send({ type: 'room-ready', on }),
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
addEventListener(EVENTS.decksSincronizados, () => { lobby.refresh(); builder.refresh(); });
iniciarSincronia();

const labView = mountLab(document.querySelector('#scrLab')!, {
  onBack: () => { show('lobby'); lobby.refresh(); },
  onHost: scenario => startLab(scenario),
});
addEventListener(EVENTS.laboratorio, () => { labView.open(); show('lab'); scrollTo({top: 0}); });

function enterForgeTable(client: ForgeClient, m: ForgeMatch | null) {
  forgeTable.attach(client, m ? [deckArt(m.deck), ...(m.opponents ?? [m.opp ?? null]).map(d => d ? deckArt(d) : undefined)] : []);
  lobby.setStatus('');
  lobby.showRoom(null);
  show('game');
}

/** The server validates before replacing a session. Keep setup visible until acceptance. */
async function requestMatch(client: ForgeClient, match: ForgeMatch, message: ClientMessage) {
  finishStart('Uma nova solicitação substituiu a anterior.');
  session.current = match;
  recording.persist();
  recorder.reset(recording.meta(match));
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (session.current === match) { client.send({type: 'leave'}); session.current = null; clearResume(); lobby.showRoom(null); }
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
  await requestMatch(client, {url: FORGE_URL, deck: you, opp: opp ?? undefined, opponents, config, net: false}, {type: 'start', you: forgeDeck(you), bracket: deckBracket(you), opponent: opp ? aiDeck(opp) : null, ...(opponents ? { opponents: opponents.map(d => d ? aiDeck(d) : null) } : {}), config, aiStyle: chosenAiStyle(), ...playerName(), ...matchOwner(you)});
}
/** O estilo do computador escolhido na tela inicial (ou vindo da conta). */
function chosenAiStyle() { const v = load(KEYS.aiStyle); return isAiStyle(v) ? v : DEFAULT_AI_STYLE; }
async function startNetMatch(you: DeckData, url: string, message: ClientMessage, config?: MatchConfig, lab = false) {
  const client = await requireForge(url);
  lobby.setStatus(message.type === 'host' ? 'Criando a sala…' : 'Entrando na sala…');
  await requestMatch(client, {url, deck: you, config, net: true, lab}, message);
}
/** Cria a sala de teste do Laboratório; quem cria joga como Jogador 1. */
async function startLab(scenario: LabScenario) {
  leaveForge();
  // Os nomes da mesa são os do editor, para saber de que lado é cada carta (inclusive com as duas abas no mesmo aparelho).
  await startNetMatch(LAB_DECK, FORGE_URL, { type: 'lab-host', name: 'Jogador 1', scenario }, undefined, true);
}

/** Assiste à partida de uma sala; resolve no primeiro estado, ou falha com o aviso da ponte. */
async function startWatching(url: string, code: string, name: string) {
  leaveForge();
  const client = await requireForge(url);
  finishStart('Uma nova solicitação substituiu a anterior.');
  session.watching = { url, code, name };
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => finishStart('O servidor demorou para responder. Tente novamente.'), 20000);
      pendingStart = {resolve, reject, timer};
      client.send({ type: 'watch', code, name });
    });
  } catch (error) { session.watching = null; throw error; }
}

let reconnecting = false;
/** Conexão caída assistindo: tenta assistir de novo, com intervalos crescentes, antes de oferecer o botão. */
async function autoRewatch() {
  if (reconnecting) return;
  reconnecting = true;
  const w = session.watching;
  try {
    const outcome = await retryWithDelays(REWATCH_DELAYS, {
      alive: () => !!w && session.watching === w,
      onTry: n => { if (session.screen === 'game') forgeTable.reconnecting(n); },
      async attempt() {
        const client = await connection.connect(w!.url, null);
        if (client) { client.send({ type: 'watch', code: w!.code, name: w!.name }); if (session.screen === 'game') enterForgeTable(client, null); }
        return !!client;
      },
    });
    if (outcome === 'exhausted' && session.watching === w && session.screen === 'game') forgeTable.disconnected();
  } finally {
    reconnecting = false;
  }
}

/** Abandona a partida do Forge em andamento (ou a sala esperando oponente), se houver. */
function leaveForge() {
  if (session.watching) { connection.client?.send({ type: 'leave' }); session.watching = null; }
  if (!session.current) return;
  finishStart('A solicitação foi cancelada.');
  connection.client?.send({ type: 'leave' });
  session.current = null;
  clearResume();
  lobby.showRoom(null);
}

/** Volta ao assento da partida atual. false se a ponte não respondeu. */
async function reconnect(): Promise<boolean> {
  const m = session.current;
  if (!m?.code || !m.token) return false;
  const client = await connection.connect(m.url, null);
  if (!client || session.current !== m) return false;
  client.send({ type: 'rejoin', code: m.code, token: m.token });
  if (session.screen === 'game') enterForgeTable(client, m);
  return true;
}

/** Tenta voltar sozinho, com intervalos crescentes (~40 s no total), antes de oferecer o botão. */
async function autoReconnect() {
  if (reconnecting) return;
  reconnecting = true;
  const m = session.current;
  try {
    const outcome = await retryWithDelays(RECONNECT_DELAYS, {
      alive: () => session.current === m,
      onTry: n => { if (session.screen === 'game') forgeTable.reconnecting(n); },
      attempt: reconnect,
    });
    if (outcome === 'exhausted' && session.current === m && session.screen === 'game') forgeTable.disconnected();
  } finally {
    reconnecting = false;
  }
}

/** Ao abrir a página: se havia uma partida em andamento, volta para ela. */
async function resumeSaved(saved: ForgeMatch) {
  session.current = saved;
  // Recarregou a página no meio da partida: a gravação guardada continua de onde parou.
  const last = await loadLastMatch();
  if (session.current !== saved) return;
  if (last && last.code === saved.code) { recorder.resume(last.recording); recorder.note('conexão', 'Página recarregada; a gravação continua.'); }
  else recorder.reset(recording.meta(saved));
  recording.setSeat({ url: saved.url, code: saved.code, token: saved.token });
  lobby.setStatus('Voltando à partida em andamento…');
  if (await reconnect()) return;
  if (session.current === saved) {
    lobby.setStatus(`Não consegui voltar à partida em andamento: o servidor em ${saved.url} não respondeu. Recarregue a página para tentar de novo.`, true);
    session.current = null;
  }
}

show('lobby');

// Old shared links now open setup; no match starts without a format and deck choice.
if (location.hash === '#jogar') history.replaceState(null, '', location.pathname + location.search);
const saved = loadResume();
const savedFree = loadFreeTable();
// Link de convite (?sala=MESA) ou vindo da página Salas (?criar-sala=1): sai do endereço para recarregar a página não entrar de novo.
const links = startupLinks(location.search);
if (links.room || links.createRoom) history.replaceState(null, '', location.pathname + links.search + location.hash);
// Quem já está numa partida volta para ela; o link fica para depois.
if (saved) void resumeSaved(saved);
else if (links.room) lobby.openRoomLink(links.room);
else if (links.createRoom) lobby.openCreateRoom();
else if (savedFree) { freeTable.resume(savedFree); show('free'); }
