// Tela inicial: escolher deck e modo (contra a IA, outra pessoa, mesa livre), criar e entrar em salas.
import { EVENTS, KEYS, PREFIXES, load, save } from '../storage';
import { allDecks, commanderRules, hasCommandZone, isPrecon, readyDeckFits, DECK_FORMATS, FORMAT_LABEL, loadUserDecks, PRECON_HINT, SACOLA_HINT, saveUserDecks, type DeckData, type DeckFormat } from '../decks';
import { FORGE_URL, RequestError, type MatchConfig, type DeckValidation, type RoomInfo, type FRoom, type PublicRoom, type RoomSaying, type RoomVisibility } from '../forge/client';
import { cacheGet, fetchByNames, fetchPrintings } from '../scryfall';
import { mountAppHeader } from './appHeader';
import { openDeckPreview } from './deckPreview';
import { joinableRooms, watchableRooms } from './publicRooms';
import { contagemTexto } from '../salas/view';
import { confirmLeaveRoom, mountRoomLobby } from './roomLobby';
import { deckArt, deckColors, missingCardData } from './deckStats';
import { deckBracket, isBracket, type Bracket } from '../brackets';
import { validateDeckLocal } from './deckRules';
import { deckFitText, fitFormats, listJoin, openFormatPicker } from './deckFit';
import { colorFilterHTML, matchesColors, matchesQuery, toggleColor, type ColorFilter } from './deckFilters';
import { botBracketMax as bracketMaxFor, botBrackets, botPool as poolFor, matchSummary, readyPool as readyBotPool, type BotChoice } from './lobbyBots';
import { botBracketButtonsHTML, botBracketHelp, chosenDeckHTML, commanderAiPanelHTML, deckTilesHTML, formatName, lobbyHTML, opponentOptionsHTML, personalShelfHTML, preconGroupsHTML, ROOM_DECKS_SHELF, roomDeckTilesHTML, roomDecksHelp, roomInfoHTML, startLabel, type TileContext } from './lobbyView';
import { createRoomsPoller } from './lobbyRooms';
import { attachTileMenus } from './tileMenus';
import './deckFilters.css';
import './lobby.css';
import { prefsChanged } from '../conta/sync';
import { finder } from './dom';
export { deckArt, deckColors, deckCover } from './deckStats';

type Mode = 'ai' | 'net' | 'free';
type NetTab = 'join' | 'create';
type DeckAction = 'library' | 'create' | 'import';
export interface Lobby {
  refresh(): void;
  setStatus(msg: string, error?: boolean): void;
  setBusy(busy: boolean): void;
  showRoom(room: FRoom | null): void;
  roomSay(seat: number, key: RoomSaying): void;
  /** Link de convite (?sala=CÓDIGO): busca a sala e entra, como pelo código. */
  openRoomLink(code: string): void;
  /** Vindo da página Salas (?criar-sala=1): Outra pessoa, na aba Criar sala, pública. */
  openCreateRoom(): void;
}
export interface LobbyOptions {
  onPlay(you: DeckData, opp: DeckData | null, config: MatchConfig, opponents?: (DeckData | null)[]): Promise<void>;
  /** Mesa livre: sem servidor e sem regras automáticas. */
  onFreePlay(you: DeckData, format: DeckFormat): void;
  /** you null: cria ou entra sem deck, e escolhe lá dentro (onChooseRoomDeck). */
  onHost(you: DeckData | null, name: string, url: string, config: MatchConfig, visibility: RoomVisibility, code: string): Promise<void>;
  onJoin(you: DeckData | null, name: string, code: string, url: string): Promise<void>;
  /** Na sala de espera: escolhe ou troca o deck; recusa com o motivo. */
  onChooseRoomDeck(deck: DeckData): Promise<void>;
  /** Entrar numa sala de teste do Laboratório: sem deck, cada lado joga com as cartas do cenário. */
  onJoinLab(code: string, name: string, url: string): Promise<void>;
  /** Assistir à partida já começada de uma sala, sem deck e sem assento. */
  onWatch(code: string, name: string, url: string): Promise<void>;
  onValidate(deck: DeckData, format: DeckFormat, url: string): Promise<DeckValidation>;
  onLookup(code: string, url: string): Promise<RoomInfo>;
  /** Salas públicas na ponte, com lugar ou em andamento. */
  onListRooms(url: string): Promise<PublicRoom[]>;
  onCancelRoom(): void;
  onSay(key: RoomSaying): void;
  /** Na sala de espera, o anfitrião completa os lugares vazios com computadores. */
  onFillWithComputers(): void;
  onDecks(action?: DeckAction, format?: DeckFormat): void;
  onEditDeck(deckId: string): void;
}
/** A contagem de Salas no cabeçalho se atualiza com menos pressa que a lista aberta. */
const ROOM_COUNT_EVERY_MS = 30_000;
/** Os sorteados evitam O/0 e I/1, mas quem escolhe o código pode usar qualquer letra ou número. */
const ROOM_CODE = /^[A-Z0-9]{4}$/;
const WATCH_CODE = /^[A-Z0-9]{8}$/;

export function mountLobby(root: HTMLElement, opts: LobbyOptions): Lobby {
  const remembered = load(KEYS.format);
  // Commander é o padrão, com o Precon ao lado; os demais (Oathbreaker entre eles) ficam em "Outros", que abre os botões sem escolher nenhum.
  let format: DeckFormat | null = DECK_FORMATS.find(f => f === remembered) ?? 'commander';
  /** "Outros" tocado: os botões dos outros formatos ficam à vista enquanto o jogador escolhe um. */
  let othersOpen = false;
  const othersShown = () => othersOpen || (!!format && format !== 'commander' && format !== 'precon');
  let mode: Mode = load(KEYS.mode) === 'net' ? 'net' : load(KEYS.mode) === 'free' ? 'free' : 'ai';
  let matchLength: MatchConfig['matchLength'] = load(KEYS.matchLength) === 'bo3' ? 'bo3' : 'bo1';
  let playerCount = [2, 3, 4].includes(Number(load(KEYS.commanderPlayers))) ? Number(load(KEYS.commanderPlayers)) : 4;
  let commanderOpponents = ['random', 'random', 'random'];
  try { const saved = JSON.parse(load(KEYS.commanderOpponents) ?? 'null'); if (Array.isArray(saved)) commanderOpponents = commanderOpponents.map((fallback, i) => typeof saved[i] === 'string' ? saved[i] : fallback); } catch { /* Ignore invalid optional preferences. */ }
  const rememberedDeck = () => format ? load(PREFIXES.deck + format) ?? (format === 'free' ? load(KEYS.deckLegacy) : null) ?? '' : '';
  let youId = rememberedDeck();
  let oppId = load(KEYS.opp) ?? 'random';
  // Bracket máximo dos computadores (Commander e Precon): sem escolha guardada, segue o do deck do jogador.
  const savedBotBracket = load(KEYS.botBracket);
  let botBracket: 'any' | Bracket | null = savedBotBracket === 'any' ? 'any' : isBracket(Number(savedBotBracket)) ? Number(savedBotBracket) as Bracket : null;
  /** Precon: sortear os computadores só da série do deck do jogador. */
  let sameSeries = load(KEYS.preconSameSeries) === '1';
  let query = '', showIncompatible = false, busy = false;
  // Na sala de espera: o deck com que você está sentado ('' enquanto escolhe), a busca da prateleira e o pedido em andamento.
  let roomDeckId = '', roomQuery = '', choosingDeck = false;
  let colorFilter = new Set<ColorFilter>();
  const ptName = (name: string) => cacheGet(name)?.pt?.name || name;
  let room: RoomInfo | null = null, waitingRoom: FRoom | null = null;
  // Sala nova começa pública, para aparecer na lista; quem escolheu privada continua com privada.
  let visibility: RoomVisibility = load(KEYS.roomVisibility) === 'private' ? 'private' : 'public';
  let netTab: NetTab = load(KEYS.netTab) === 'create' ? 'create' : 'join';
  // No celular, os ajustes da partida começam resumidos numa linha; contra outra pessoa, abertos (é lá que se escolhe a sala).
  let setupOpen = mode === 'net';
  const validations = new Map<string, DeckValidation>();
  let preflight = 0;
  const key = (deck: DeckData) => JSON.stringify([url(), format, deck.cards, deck.sideboard ?? [], deck.commanders ?? []]);
  const selected = () => allDecks().find(d => d.id === youId);
  const netURL = () => (root.querySelector('#netUrl') as HTMLInputElement).value.trim() || FORGE_URL;
  const url = () => mode === 'net' ? netURL() : FORGE_URL;
  const netName = () => (root.querySelector('#netName') as HTMLInputElement).value.trim() || 'Jogador';
  const roomCode = () => (root.querySelector('#roomCode') as HTMLInputElement).value.trim().toUpperCase();
  const roomCodeHelp = () => { $('#roomCodeHelp').textContent = roomCode() && visibility === 'private' ? 'Códigos fáceis podem ser adivinhados por outras pessoas.' : 'Deixe vazio para sortear.'; };
  const config = (): MatchConfig => ({ format: format!, matchLength: hasCommandZone(format!) ? 'bo1' : matchLength, playerCount: hasCommandZone(format!) ? playerCount : 2 });
  root.innerHTML = lobbyHTML();
  const $ = finder(root);
  const roomLobby = mountRoomLobby($('#roomLobby'), {onSay: key => opts.onSay(key), onFillWithComputers: () => opts.onFillWithComputers(), onLeave: () => { opts.onCancelRoom(); waitingRoom = null; refresh(); }});
  $('#netName').setAttribute('value', load(KEYS.name) ?? '');
  // O nome veio da conta (outro aparelho, ou o primeiro nome do Google): atualiza o campo, se ninguém estiver digitando.
  addEventListener(EVENTS.prefsSincronizadas, () => {
    const input = $<HTMLInputElement>('#netName');
    if (document.activeElement !== input) input.value = load(KEYS.name) ?? '';
  });
  $('#netUrl').setAttribute('value', load(KEYS.forgeUrl) ?? '');
  // Na sala de espera a barra lateral some: os avisos (alguém voltou, erro da ponte) aparecem no lobby da sala.
  const setStatus = (message: string, error = false) => { $('#status').textContent = message; $('#status').classList.toggle('error', error); roomLobby.setStatus(message, error); };
  function allowed(deck: DeckData) {
    if (format === 'precon') return isPrecon(deck);
    if (hasCommandZone(deck.format) && format !== deck.format) return false;
    if (deck.builtin && format && !readyDeckFits(deck, format)) return false;
    const local = validateDeckLocal(deck, format ?? 'free');
    return !format || showIncompatible || (validations.get(key(deck))?.valid ?? local.status !== 'invalid');
  }
  /** Se o deck serve no formato, pelos mesmos critérios da lista de decks, sem esperar o servidor. */
  const fitsIn = (deck: DeckData, f: DeckFormat) => f === 'precon' ? isPrecon(deck) : !(hasCommandZone(deck.format) && f !== deck.format) && !(deck.builtin && !readyDeckFits(deck, f)) && validateDeckLocal(deck, f).status !== 'invalid';
  /** O deck escolhido não serve no formato: fora da mesa livre, onde qualquer deck abre. */
  const misfit = (deck: DeckData | undefined) => !!deck && !!format && mode !== 'free' && !fitsIn(deck, format);
  function matches(deck: DeckData) { return matchesQuery(deck, query, ptName) && matchesColors(deckColors(deck), colorFilter); }
  // ---------- Decks dos computadores (as regras ficam em lobbyBots) ----------
  const readyPool = () => readyBotPool(allDecks(), format);
  const myBracket = () => { const deck = selected(); return deck && !deck.precon ? deckBracket(deck) : deck?.bracket; };
  /** Precon com "só da série" marcado: a série do deck do jogador. */
  const botSeries = () => format === 'precon' && sameSeries ? selected()?.precon?.series : undefined;
  const botChoice = (): BotChoice => ({ format, botBracket, myBracket: myBracket(), series: botSeries() });
  const botBracketMax = (decks: DeckData[]) => bracketMaxFor(decks, botChoice());
  const botPool = (decks: DeckData[]) => poolFor(decks, botChoice());
  /** Depois de mudar o máximo ou a série: os decks escolhidos que ficaram de fora voltam para "Deck aleatório", com aviso. */
  function dropOutOfPool() {
    const pool = botPool(readyPool()), slots = commanderOpponents.slice(0, playerCount - 1);
    const dropped = slots.filter(id => id !== 'random' && !pool.some(d => d.id === id)).map(id => allDecks().find(d => d.id === id)?.name).filter((n): n is string => !!n);
    if (!dropped.length) return;
    commanderOpponents = commanderOpponents.map((id, i) => i < slots.length && id !== 'random' && !pool.some(d => d.id === id) ? 'random' : id);
    save(KEYS.commanderOpponents, JSON.stringify(commanderOpponents));
    toast(`${listJoin(dropped)} ${dropped.length === 1 ? 'ficou' : 'ficaram'} fora da escolha dos bots e ${dropped.length === 1 ? 'voltou' : 'voltaram'} para Deck aleatório.`);
  }
  const filtering = () => !!query || colorFilter.size > 0;
  function validationLabel(deck: DeckData) {
    if (!format) return '';
    const cached = validations.get(key(deck));
    if (cached) return cached.valid ? `Válido para ${formatName(format)}` : 'Precisa de ajustes';
    const local = validateDeckLocal(deck, format);
    return local.status === 'invalid' ? 'Incompatível com o formato' : format && format !== 'free' ? '' : 'Livre';
  }
  /** O que os cards dos decks precisam saber do estado da tela. */
  const tileContext = (selectedId = youId, inRoom = false): TileContext => ({ selectedId, inRoom, format, roomFormat: waitingRoom?.config.format, validity: validationLabel, ptName });
  /** Bracket máximo e "só da série" dos bots: só contra o computador, no Commander e no Precon. */
  function renderBotChoices(basePool: DeckData[], pool: DeckData[]) {
    const show = mode === 'ai' && commanderRules(format ?? undefined), disabled = busy || !!waitingRoom;
    $('#botBracketChoice').hidden = !show;
    if (show) {
      const max = botBracketMax(basePool), mine = myBracket(), focused = (document.activeElement as HTMLElement | null)?.dataset.botBracket;
      $('#botBracketButtons').innerHTML = botBracketButtonsHTML(botBrackets(basePool), max, disabled);
      if (focused) root.querySelector<HTMLElement>(`[data-bot-bracket="${focused}"]`)?.focus({preventScroll: true});
      $('#botBracketHelp').textContent = botBracketHelp({ empty: !pool.length, series: !!botSeries(), max, chosen: botBracket !== null, mine });
    }
    const series = format === 'precon' ? selected()?.precon?.series : undefined;
    $('#sameSeriesChoice').hidden = mode !== 'ai' || format !== 'precon';
    const box = $<HTMLInputElement>('#sameSeries');
    box.checked = sameSeries; box.disabled = disabled || !series;
    $('#sameSeriesLabel').textContent = series ? `Bots só da série do seu deck (${series})` : 'Bots só da série do seu deck';
  }
  /** Redesenha a tela inicial inteira a partir do estado, devolvendo o foco a quem o tinha. */
  function refresh() {
    const focused = document.activeElement as HTMLElement | null;
    // Ver e Editar ficam no menu do deck, que fecha ao redesenhar: o foco volta para o botão do menu.
    const focusId = root.contains(focused) ? focused?.dataset.deck ?? focused?.dataset.tileMenu ?? focused?.dataset.peek ?? focused?.dataset.editDeck : undefined;
    const focusedOpponent = focused?.dataset.opponentSlot;
    const focusAttribute = focused?.dataset.deck ? 'deck' : 'tile-menu';
    renderShelves();
    renderSettings();
    header.setDisabled(busy);
    $('.home-intro').hidden = $('.play-layout').hidden = !!waitingRoom;
    roomLobby.render(waitingRoom);
    renderRoomDecks();
    renderNetPanel();
    // Commander e Oathbreaker: de dois a quatro jogadores, com um deck para cada computador.
    const commander = hasCommandZone(format ?? undefined);
    const free = mode === 'free';
    // Quem entra numa sala joga com as regras dela: duração e número de jogadores são escolhas de quem cria.
    const joining = mode === 'net' && netTab === 'join';
    const aiPool = renderOpponents(commander, free, joining);
    renderReady(commander, free, joining, aiPool);
    if (focusedOpponent !== undefined) root.querySelector<HTMLElement>(`[data-opponent-slot="${CSS.escape(focusedOpponent)}"]`)?.focus({preventScroll: true});
    if (focusId) root.querySelector<HTMLElement>(`[data-${focusAttribute}="${CSS.escape(focusId)}"]`)?.focus({preventScroll: true});
    rooms.sync();
  }
  /** As prateleiras de decks (os seus e os prontos) e os filtros acima delas. */
  function renderShelves() {
    const decks = allDecks(), personal = decks.filter(d => !d.builtin), ready = decks.filter(d => d.builtin);
    if (!decks.some(d => d.id === youId)) youId = '';
    // Os decks prontos do formato escolhido vêm primeiro; os outros compatíveis (como os do Livre no Sacola 50) depois.
    const mine = personal.filter(matches), templates = ready.filter(d => matches(d) && allowed(d)).sort((a, b) => Number(b.format === format) - Number(a.format === format));
    $('#personalCount').textContent = personal.length ? String(personal.length) : '';
    $('#personalTiles').innerHTML = personalShelfHTML(mine, personal.length, { ...tileContext(), filtering: filtering() });
    // No Precon só valem os precons da mesa: a prateleira dos seus decks some e os precons vêm agrupados por série.
    const precon = format === 'precon';
    $('.deck-shelf:not(.ready-shelf)').hidden = precon;
    $('#readyDecksTitle').textContent = precon ? 'Precons de Commander' : 'Decks prontos para a mesa';
    $('#readyDecksHelp').textContent = precon ? 'Do jeito que saíram da caixa, agrupados por série.' : 'Escolha um para jogar ou faça a sua própria versão.';
    $('#readyTiles').classList.toggle('deck-tiles', !precon);
    $('#readyTiles').classList.toggle('precon-series-list', precon);
    $('#readyTiles').innerHTML = !templates.length ? '<p class="shelf-empty">Nenhum deck pronto corresponde à seleção.</p>' : precon ? preconGroupsHTML(templates, tileContext()) : deckTilesHTML(templates, tileContext());
    $('#lobbyColorFilter').innerHTML = colorFilterHTML(colorFilter, 'data-color-filter');
    $('#incompatibleToggle').hidden = !format || format === 'free' || format === 'precon';
    $<HTMLInputElement>('#showIncompatible').checked = showIncompatible;
  }
  /** Os botões de escolha (formato, oponente, duração, jogadores, tipo de sala) e a explicação do formato. */
  function renderSettings() {
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-setting]')) {
      const setting = button.dataset.setting;
      const value = setting === 'format' ? format : setting === 'opponent' ? mode : setting === 'players' ? String(playerCount) : setting === 'visibility' ? visibility : matchLength;
      const others = setting === 'format' && button.dataset.value === 'others';
      button.setAttribute('aria-pressed', String(others ? othersShown() : button.dataset.value === value));
      if (others) button.setAttribute('aria-expanded', String(othersShown()));
      button.disabled = busy || !!waitingRoom || (!!room && setting !== 'opponent');
    }
    $('#formatOthers').hidden = !othersShown();
    $('#formatHelp').textContent = format === 'sacola50' ? SACOLA_HINT : format === 'precon' ? PRECON_HINT : othersOpen && !format ? 'Escolha um dos outros formatos para começar.' : 'Escolha um formato para começar.';
    $('#formatHelp').hidden = !!format && format !== 'sacola50' && format !== 'precon';
  }
  /** Contra outra pessoa: as abas Entrar e Criar sala. */
  function renderNetPanel() {
    $('#netPanel').hidden = mode !== 'net';
    for (const tab of root.querySelectorAll<HTMLButtonElement>('[data-net-tab]')) {
      const on = tab.dataset.netTab === netTab;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      tab.disabled = busy || !!waitingRoom;
    }
    $('#joinGroup').hidden = netTab !== 'join';
    $('#createGroup').hidden = netTab !== 'create';
    $('#publicRooms').hidden = !!room;
    $('#visibilityHelp').textContent = visibility === 'public' ? 'Aparece na lista de salas públicas para qualquer pessoa entrar.' : 'Só entra quem receber o código.';
    roomCodeHelp();
  }
  /** Duração, jogadores e os decks dos computadores; devolve os decks que os computadores podem usar. */
  function renderOpponents(commander: boolean, free: boolean, joining: boolean) {
    // Contra outra pessoa, duração e jogadores ficam dentro da aba Criar sala, junto do tipo de sala.
    const roomSetup = mode === 'net' ? $('#createGroup') : $('.match-setup'), anchor = mode === 'net' ? $('.visibility-choice') : $('#aiPanel');
    for (const id of ['#durationChoice', '#playerCountChoice']) if ($(id).parentElement !== roomSetup) roomSetup.insertBefore($(id), anchor);
    $('#durationChoice').hidden = commander || free || joining;
    $('#playerCountChoice').hidden = !commander || free || joining;
    $('#freeHelp').hidden = !free;
    $('#opponentLegend').textContent = commander && playerCount > 2 ? 'Oponentes' : 'Oponente';
    $('#aiModeLabel').textContent = commander && playerCount > 2 ? 'Bots' : 'Bot';
    $('#netModeLabel').textContent = commander && playerCount > 2 ? 'Humanos' : 'Humano';
    $('#aiPanel').hidden = mode !== 'ai' || commander;
    $('#commanderAiPanel').hidden = mode !== 'ai' || !commander;
    const basePool = readyPool(), aiPool = commander ? botPool(basePool) : basePool;
    renderBotChoices(basePool, aiPool);
    if (oppId !== 'random' && !aiPool.some(d => d.id === oppId)) oppId = 'random';
    $<HTMLSelectElement>('#oppSel').innerHTML = opponentOptionsHTML(aiPool);
    $<HTMLSelectElement>('#oppSel').value = oppId;
    if (commander) {
      commanderOpponents = commanderOpponents.map(id => id === 'random' || aiPool.some(d => d.id === id) ? id : 'random');
      $('#commanderAiPanel').innerHTML = commanderAiPanelHTML(commanderOpponents.slice(0, playerCount - 1), aiPool);
    }
    for (const control of root.querySelectorAll<HTMLInputElement | HTMLButtonElement>('#oppSel, [data-opponent-slot], #netName, #netCode, #roomCode, #netUrl, [data-join] button, [data-join-room], [data-watch-room], [data-lobby=rooms-refresh], [data-lobby=library], [data-lobby=create], [data-lobby=import], [data-edit-deck]')) control.disabled = busy || !!waitingRoom;
    return aiPool;
  }
  /** O deck escolhido, o botão Jogar, o "Jogar de novo", o resumo da partida e onde o deck serve. */
  function renderReady(commander: boolean, free: boolean, joining: boolean, aiPool: DeckData[]) {
    const deck = selected(), result = deck && format ? validations.get(key(deck)) : undefined;
    const invalid = !free && !!deck && !!format && (result ? !result.valid : validateDeckLocal(deck, format).status === 'invalid');
    const art = deck && deckArt(deck);
    $('#chosenDeck').innerHTML = chosenDeckHTML(deck, { format, net: mode === 'net', result });
    const start = $<HTMLButtonElement>('#startMatch');
    // Contra outra pessoa o deck é opcional: sem um que sirva, entra (ou cria a sala) e escolhe lá dentro.
    const net = mode === 'net';
    // Contra o computador, um bot em "Deck aleatório" precisa de algum deck que caiba no máximo e na série.
    const noBotDeck = mode === 'ai' && commander && !aiPool.length && commanderOpponents.slice(0, playerCount - 1).includes('random');
    start.disabled = !format || (!net && (!deck || invalid)) || noBotDeck || busy || !!waitingRoom || (joining && !room);
    start.textContent = startLabel({ busy, free, ai: mode === 'ai', room: !!room, joining });
    // Quem já jogou vê o deck escolhido em destaque, com o resumo da partida e o botão de jogar de novo.
    const summary = summaryText();
    const replay = $('#replay');
    replay.hidden = !deck || !format || invalid || mode === 'net' || !!waitingRoom || !load(KEYS.played);
    if (!replay.hidden) {
      $('#replayArt').style.backgroundImage = art ? `url("${art}")` : '';
      $('#replayTitle').textContent = deck!.name;
      $('#replaySummary').textContent = summary;
      const again = $<HTMLButtonElement>('#replayStart');
      again.disabled = start.disabled;
      again.textContent = busy ? 'Preparando…' : free ? 'Abrir mesa livre' : 'Jogar de novo';
    }
    $('#setupSummary').textContent = summary || 'Escolha o formato';
    $('#setupSummaryAction').textContent = setupOpen ? 'Fechar' : 'Mudar';
    $('[data-lobby=setup-toggle]').setAttribute('aria-expanded', String(setupOpen));
    $('.play-layout').classList.toggle('setup-open', setupOpen);
    // Onde o deck serve: só muda o texto quando muda, para o leitor de tela não repetir a cada redesenho.
    const fitText = misfit(deck) ? deckFitText(format!, fitFormats(f => fitsIn(deck!, f), format!), f => FORMAT_LABEL[f], !!room) : '';
    if ($('#deckFitText').textContent !== fitText) $('#deckFitText').textContent = fitText;
    $('[data-lobby=fit-formats]').hidden = !fitText || !!room || busy || !!waitingRoom;
    $('#roomInfo').hidden = !room;
    $('#roomInfo').innerHTML = roomInfoHTML(room, !!selected());
  }
  /** A partida numa linha: "Commander · 4 jogadores · computadores aleatórios". */
  const summaryText = () => matchSummary({ ...botChoice(), mode, playerCount, commanderOpponents, matchLength, pool: readyPool(), opponent: oppId === 'random' ? undefined : allDecks().find(d => d.id === oppId) });
  // ---------- Salas públicas ----------
  // Só procura com "Outra pessoa" escolhido, fora de uma sala e com a aba à vista; com a partida na tela, o lobby fica escondido.
  const rooms = createRoomsPoller({
    $, listRooms: () => opts.onListRooms(netURL()), onRooms: list => showRoomCount(list),
    wanted: () => mode === 'net' && netTab === 'join' && !waitingRoom && !room && document.visibilityState === 'visible',
    idle: () => !root.hidden && !busy,
    disabled: () => busy || !!waitingRoom,
  });
  // A barra lateral ocupa só o que sobra da tela abaixo do topo dela, para o botão Jogar nunca ficar fora da vista.
  let fitFrame = 0;
  const fitSidebar = () => { fitFrame = 0; if (!root.isConnected) return; const bar = $('.match-sidebar'); bar.style.setProperty('--sidebar-room', `${Math.max(280, innerHeight - Math.max(bar.getBoundingClientRect().top, 16) - 16)}px`); };
  const queueFit = () => { if (!fitFrame) fitFrame = requestAnimationFrame(fitSidebar); };
  addEventListener('scroll', queueFit, {passive: true});
  addEventListener('resize', queueFit);
  /** Aviso que aparece no alto da tela inicial e some sozinho. */
  function toast(text: string) {
    let box = document.querySelector<HTMLElement>('.lobby-toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts lobby-toasts'; box.setAttribute('aria-live', 'polite'); document.body.append(box); }
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = text;
    box.append(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 4500);
  }
  const setBusy = (value: boolean) => { busy = value; refresh(); };
  function choose(deck: DeckData, picker = true) {
    if (busy || waitingRoom) return;
    youId = deck.id;
    if (format) save(PREFIXES.deck + format, youId);
    // O máximo dos bots segue o bracket do deck (e a série, no Precon) enquanto o jogador não escolhe outro.
    if (mode === 'ai') dropOutOfPool();
    refresh();
    const request = ++preflight;
    if (!format) { setStatus('Escolha o formato antes de iniciar a partida.'); return; }
    if (mode === 'free') { setStatus(''); return; }
    // Deck depois do formato: o seletor mostra onde ele serve (numa sala, o formato é dela e a linha junto do deck basta).
    if (picker && !room && misfit(deck)) void pickFormat(deck, format);
    const currentKey = key(deck);
    void opts.onValidate(deck, format, url()).then(result => {
      if (request !== preflight) return;
      validations.set(currentKey, result);
      refresh(); setStatus(result.valid ? '' : result.issues.map(i => `${i.card ? `${i.card}: ` : ''}${i.message}`).join(' '), !result.valid);
    }).catch(() => { if (request === preflight) setStatus('Deck selecionado. A validação será feita ao conectar para jogar.'); });
  }
  /** Troca o formato mantendo o deck escolhido (atalho do seletor). */
  function setFormat(next: DeckFormat) {
    format = next; save(KEYS.format, format); othersOpen = false;
  }
  /**
   * Um botão de formato tocado. "Outros" só mostra os botões dos formatos, sem escolher nenhum: o deck continua e é
   * conferido no formato escolhido. false: a tela já foi redesenhada (ou não há o que redesenhar).
   */
  function chooseFormat(value: string | undefined) {
    if (value === 'others') {
      if (!othersShown()) { othersOpen = true; format = null; preflight++; setStatus(''); refresh(); root.querySelector<HTMLElement>('#formatOthers [data-setting=format]')?.focus({preventScroll: true}); }
      return false;
    }
    const next = DECK_FORMATS.find(f => f === value) ?? 'free', deck = selected();
    // Num formato em que o deck serve, ele continua escolhido; sem deck, volta o último usado no formato.
    setFormat(next); preflight++; setStatus('');
    if (deck && fitsIn(deck, next)) { choose(deck, false); return false; }
    // Formato depois do deck: num formato em que o deck não serve, ele deixa de estar escolhido e um aviso diz por quê.
    const misfitDeck = deck && mode !== 'free' ? deck : null;
    youId = rememberedDeck();
    if (misfitDeck) {
      if (youId === misfitDeck.id) youId = '';
      toast(`${misfitDeck.name} não serve para ${FORMAT_LABEL[next]} e deixou de estar selecionado. Escolha um deck deste formato.`);
    }
    return true;
  }
  /** Seletor com só os formatos em que o deck serve, para o deck escolhido num formato em que ele não serve. */
  async function pickFormat(deck: DeckData, missing: DeckFormat) {
    if (document.querySelector('dialog.format-picker')) return;
    const current = format!;
    const answer = await openFormatPicker({deckName: deck.name, missing, current, fitting: fitFormats(f => fitsIn(deck, f), missing), label: f => FORMAT_LABEL[f], editable: !deck.builtin});
    if (!answer || busy || waitingRoom || room || format !== current || youId !== deck.id) return;
    if ('format' in answer) {
      if (answer.format === current) return;
      setFormat(answer.format); preflight++; setStatus('');
      choose(deck, false);
      root.querySelector<HTMLElement>(`[data-setting=format][data-value="${answer.format}"]`)?.focus({preventScroll: true});
    } else if (answer.action === 'edit') { preflight++; opts.onEditDeck(deck.id); }
    else openDeckPreview(deck, {selected: true, onPick: () => choose(deck)});
  }
  async function start() {
    const chosen = selected();
    // Contra outra pessoa, um deck que não serve no formato fica de fora: entra sem deck e escolhe na sala.
    const deck = mode === 'net' && chosen && !fitsIn(chosen, format!) ? undefined : chosen;
    if (busy || !format || (!deck && mode !== 'net')) return;
    ++preflight;
    save(KEYS.played, '1');
    if (mode === 'free') { setStatus(''); opts.onFreePlay(deck!, format); return; }
    const matchConfig = config(), endpoint = url(), playerName = netName(), selectedRoom = room, selectedMode = mode, roomVisibility = visibility, chosenCode = roomCode(), opponentId = oppId, selectedOpponents = commanderOpponents.slice(0, (config().playerCount ?? 2) - 1);
    if (selectedMode === 'net' && !selectedRoom && chosenCode && !ROOM_CODE.test(chosenCode)) { setStatus('O código da sala precisa ter 4 letras ou números.', true); return; }
    setBusy(true); setStatus(deck ? 'Verificando o deck…' : '');
    try {
      if (deck) {
        const result = await opts.onValidate(deck, matchConfig.format, endpoint);
        validations.set(key(deck), result);
        if (!result.valid) { setStatus(result.issues.map(i => `${i.card ? `${i.card}: ` : ''}${i.message}`).join(' '), true); return; }
      }
      if (selectedMode === 'net') {
        roomDeckId = deck?.id ?? ''; roomQuery = '';
        if (selectedRoom) await opts.onJoin(deck ?? null, playerName, selectedRoom.code, endpoint);
        else await opts.onHost(deck ?? null, playerName, endpoint, matchConfig, roomVisibility, chosenCode);
      } else if (deck) {
        const opponent = opponentId === 'random' ? null : allDecks().find(d => d.builtin && d.id === opponentId);
        if (opponent === undefined) { setStatus('Não há um deck do computador compatível com este formato.', true); return; }
        // Com bracket máximo ou série, o sorteio dos bots é feito aqui, entre os decks que cabem; sem eles, no servidor.
        const pool = botPool(readyPool()), filtered = botBracketMax(readyPool()) !== null || !!botSeries();
        if (hasCommandZone(matchConfig.format) && filtered && !pool.length && selectedOpponents.includes('random')) { setStatus('Nenhum deck pronto cabe no bracket máximo dos bots.', true); return; }
        const drawn = () => filtered ? pool[Math.floor(Math.random() * pool.length)] : null;
        const opponents = hasCommandZone(matchConfig.format) ? selectedOpponents.map(id => id === 'random' ? drawn() : allDecks().find(d => d.builtin && d.id === id) ?? null) : undefined;
        await opts.onPlay(deck, opponents?.[0] ?? opponent, matchConfig, opponents);
      }
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Não foi possível iniciar a partida.', true); }
    finally { setBusy(false); }
  }
  root.addEventListener('click', e => {
    const target = e.target as HTMLElement;
    const color = target.closest<HTMLButtonElement>('[data-color-filter]')?.dataset.colorFilter;
    if (color) {
      colorFilter = color === 'clear' ? new Set() : toggleColor(colorFilter, color as ColorFilter);
      refresh();
      // O foco fica na mesma cor (ou na primeira, depois de limpar) para continuar escolhendo pelo teclado.
      root.querySelector<HTMLElement>(`[data-color-filter="${color === 'clear' ? 'W' : color}"]`)?.focus();
      return;
    }
    const bracketChoice = target.closest<HTMLButtonElement>('[data-bot-bracket]');
    if (bracketChoice && !bracketChoice.disabled) {
      const value = bracketChoice.dataset.botBracket!;
      botBracket = value === 'any' ? 'any' : Number(value) as Bracket; save(KEYS.botBracket, String(botBracket));
      dropOutOfPool(); refresh();
      root.querySelector<HTMLElement>(`[data-bot-bracket="${value}"]`)?.focus({preventScroll: true});
      return;
    }
    const choice = target.closest<HTMLButtonElement>('[data-setting]');
    if (choice && !choice.disabled) {
      if (choice.dataset.setting === 'format') {
        if (!chooseFormat(choice.dataset.value)) return;
      } else if (choice.dataset.setting === 'opponent') {
        mode = choice.dataset.value === 'net' ? 'net' : choice.dataset.value === 'free' ? 'free' : 'ai'; save(KEYS.mode, mode); room = null; preflight++; setStatus('');
      } else if (choice.dataset.setting === 'visibility') { visibility = choice.dataset.value === 'public' ? 'public' : 'private'; save(KEYS.roomVisibility, visibility);
      } else if (choice.dataset.setting === 'players') { playerCount = Number(choice.dataset.value); save(KEYS.commanderPlayers, String(playerCount));
      } else { matchLength = choice.dataset.value === 'bo3' ? 'bo3' : 'bo1'; save(KEYS.matchLength, matchLength); }
      refresh(); return;
    }
    const tab = target.closest<HTMLButtonElement>('[data-net-tab]');
    if (tab && !tab.disabled) { selectNetTab(tab.dataset.netTab === 'create' ? 'create' : 'join'); return; }
    const menuButton = target.closest<HTMLButtonElement>('[data-tile-menu]');
    if (menuButton) { tileMenus.toggle(menuButton); return; }
    tileMenus.close();
    const editId = target.closest<HTMLButtonElement>('[data-edit-deck]')?.dataset.editDeck;
    if (editId && !busy && !waitingRoom && loadUserDecks().some(d => d.id === editId)) { preflight++; opts.onEditDeck(editId); return; }
    const picked = target.closest<HTMLElement>('[data-deck]')?.dataset.deck;
    if (picked && !busy) { const deck = allDecks().find(d => d.id === picked); if (deck) { if (waitingRoom) void chooseInRoom(deck); else choose(deck); } return; }
    const peek = target.closest<HTMLElement>('[data-peek]')?.dataset.peek;
    if (peek && !busy) {
      const deck = allDecks().find(d => d.id === peek); if (!deck) return;
      const pick = (d: DeckData) => { if (waitingRoom) void chooseInRoom(d); else choose(d); };
      // No Precon o deck vai como saiu da caixa: sem fazer a sua versão.
      const asBoxed = (waitingRoom?.config.format ?? format) === 'precon';
      openDeckPreview(deck, {selected: deck.id === (waitingRoom ? roomDeckId : youId), onPick: () => pick(deck), onCopy: deck.builtin && !asBoxed ? () => {
        const copy: DeckData = {...structuredClone(deck), id: crypto.randomUUID(), name: `${deck.name} — minha versão`, builtin: false, sourceTemplateId: deck.id};
        const result = saveUserDecks([...loadUserDecks(), copy]); pick(copy);
        if (!result.ok) setStatus(result.error, true);
      } : undefined}); return;
    }
    const action = target.closest<HTMLElement>('[data-lobby]')?.dataset.lobby;
    if (!busy && !waitingRoom && ['library','create','import'].includes(action ?? '')) opts.onDecks(action as DeckAction, format ?? undefined);
    if (action === 'start') void start();
    if (action === 'retry-cards') loadCards();
    if (action === 'setup-toggle') { setupOpen = !setupOpen; refresh(); }
    if (action === 'clear') { query = ''; colorFilter = new Set(); $<HTMLInputElement>('#deckSearch').value = ''; refresh(); }
    if (action === 'incompatible') { showIncompatible = true; refresh(); }
    if (action === 'fit-formats' && !busy && !waitingRoom && !room) { const deck = selected(); if (deck && misfit(deck)) void pickFormat(deck, format!); }
    if (action === 'cancel-lookup' && !busy) { room = null; refresh(); }
    if (action === 'rooms-refresh' && !busy && !waitingRoom) void rooms.load(true);
    const joinCode = target.closest<HTMLButtonElement>('[data-join-room]')?.dataset.joinRoom;
    if (joinCode && !busy && !waitingRoom) findRoom(joinCode, true);
    const watchCode = target.closest<HTMLButtonElement>('[data-watch-room]')?.dataset.watchRoom;
    if (watchCode) void watch(watchCode, true);
    if (action === 'cancel-room') { opts.onCancelRoom(); waitingRoom = null; refresh(); }
  });
  /** Trocar de aba desfaz a sala encontrada pelo código: cada aba tem o seu caminho até o botão de baixo. */
  function selectNetTab(next: NetTab, focus = false) {
    if (next !== netTab) { netTab = next; save(KEYS.netTab, netTab); room = null; preflight++; setStatus(''); refresh(); }
    if (focus) root.querySelector<HTMLElement>(`[data-net-tab="${next}"]`)?.focus();
  }
  // O menu "⋯" de cada card (Ver as cartas, Editar): um aberto de cada vez, pelo mouse ou pelo teclado.
  const tileMenus = attachTileMenus(root);
  root.addEventListener('keydown', e => {
    const tab = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-net-tab]');
    if (tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      selectNetTab(e.key === 'Home' ? 'join' : e.key === 'End' ? 'create' : tab.dataset.netTab === 'join' ? 'create' : 'join', true);
    }
  });
  root.addEventListener('input', e => {
    const target = e.target as HTMLInputElement;
    if (target.id === 'deckSearch') { query = target.value.trim(); refresh(); }
    if (target.id === 'roomDeckSearch') { roomQuery = target.value.trim(); renderRoomDeckTiles(); }
    // Só letras e números, em maiúsculas: o código fica como os outros vão digitar.
    if (target.id === 'roomCode') { target.value = target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); roomCodeHelp(); }
  });
  root.addEventListener('change', e => {
    const target = e.target as HTMLInputElement;
    if (target.id === 'showIncompatible') showIncompatible = target.checked;
    if (target.dataset.opponentSlot !== undefined) { commanderOpponents[Number(target.dataset.opponentSlot)] = target.value; save(KEYS.commanderOpponents, JSON.stringify(commanderOpponents)); }
    if (target.id === 'oppSel') { oppId = target.value; save(KEYS.opp, oppId); }
    if (target.id === 'sameSeries') { sameSeries = target.checked; save(KEYS.preconSameSeries, sameSeries ? '1' : '0'); dropOutOfPool(); }
    if (target.id === 'netName') { save(KEYS.name, target.value.trim()); prefsChanged(); }
    if (target.id === 'netUrl') { save(KEYS.forgeUrl, target.value.trim()); room = null; validations.clear(); preflight++; }
    refresh();
  });
  root.addEventListener('submit', e => {
    if (!(e.target as HTMLElement).matches('[data-join]')) return;
    e.preventDefault(); if (busy) return;
    const code = $<HTMLInputElement>('#netCode').value.trim().toUpperCase();
    if (!ROOM_CODE.test(code)) { setStatus('Use o código de 4 caracteres da sala.', true); return; }
    findRoom(code, false);
  });
  /** Busca a sala pelo código e entra nela; pela lista de salas públicas é o mesmo caminho, com as mesmas regras. */
  function findRoom(code: string, fromList: boolean, fromLink = false) {
    preflight++; setBusy(true); setStatus('Buscando sala…');
    let live = false, lab = '';
    void opts.onLookup(code, netURL()).then(info => {
      // Pelo código ou pelo link, a partida já começada abre para assistir.
      if (!info.available && info.started) { live = true; return false; }
      if (!info.available) throw new Error(info.players.length >= (info.capacity ?? info.config.playerCount ?? 2) ? `A sala ${info.code} já está completa.` : `A partida da sala ${info.code} já começou.`);
      if (info.lab) { lab = info.code; return false; }
      room = info; netTab = 'join'; format = info.config.format; matchLength = info.config.matchLength; playerCount = info.config.playerCount ?? info.capacity ?? 2; youId = rememberedDeck(); setStatus('');
      return true;
    }).catch(error => {
      // Pelo link, a sala que ainda não existe pode ser criada ali: a aba Criar sala já vem com o código.
      if (fromLink && ROOM_CODE.test(code) && error instanceof RequestError && error.reason === 'room-not-found') { offerLinkRoom(code); return false; }
      setStatus(error instanceof Error ? error.message : 'Não foi possível encontrar a sala.', true); return false;
    }).then(found => {
      setBusy(false);
      if (live) { void watch(code, fromList); return; }
      if (lab) { void joinLab(lab); return; }
      // A sala da lista pode ter enchido ou começado nesse meio-tempo: a lista se atualiza.
      if (!found) { if (fromList) void rooms.load(); return; }
      // Entra direto: com o deck lembrado, se ele serve para o formato da sala; senão sem deck, para escolher lá dentro.
      // Pelo link, quem nunca jogou em rede escolhe o nome antes: senão entraria na sala como "Jogador".
      const unnamed = fromLink && !$<HTMLInputElement>('#netName').value.trim();
      if (!unnamed) void start();
      else { setStatus(`Digite seu nome e toque em Entrar na sala ${room!.code}.`); $('#netName').focus(); }
    });
  }
  /** Sala de teste do Laboratório: entra direto, sem deck, como o Jogador 2 do cenário. */
  async function joinLab(code: string) {
    if (busy || waitingRoom) return;
    preflight++; setBusy(true); setStatus(`Entrando na sala de teste ${code}…`);
    try { await opts.onJoinLab(code, 'Jogador 2', netURL()); setStatus(''); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Não foi possível entrar na sala de teste.', true); }
    finally { setBusy(false); }
  }
  /** Assiste à partida da sala; sem nome digitado, os jogadores veem "Espectador". */
  async function watch(code: string, fromList: boolean) {
    if (busy || waitingRoom) return;
    preflight++; setBusy(true); setStatus(`Entrando para assistir à sala ${code}…`);
    try { await opts.onWatch(code, $<HTMLInputElement>('#netName').value.trim() || 'Espectador', netURL()); setStatus(''); }
    catch (error) {
      setStatus(error instanceof Error ? error.message : 'Não foi possível assistir a esta partida.', true);
      // A partida da lista pode ter acabado nesse meio-tempo: a lista se atualiza.
      if (fromList) void rooms.load();
    } finally { setBusy(false); }
  }
  /** Sala do link que ainda não existe: pública, com o código do link, esperando quem abriu confirmar em Criar sala. */
  function offerLinkRoom(code: string) {
    visibility = 'public'; $<HTMLInputElement>('#netCode').value = '';
    selectNetTab('create');
    $<HTMLInputElement>('#roomCode').value = code; refresh();
    const unnamed = !$<HTMLInputElement>('#netName').value.trim();
    setStatus(`A sala ${code} ainda não existe. ${unnamed ? 'Digite seu nome, confira' : 'Confira'} as opções e toque em Criar sala para abri-la com esse código.`);
    if (unnamed) $('#netName').focus();
  }
  // ---------- Seu deck, dentro da sala ----------
  /** O seu lugar na sala de espera, com o deck escolhido ou não. */
  const mySeat = () => waitingRoom?.players.find((p, i) => (p.seat ?? i) === waitingRoom!.seat);
  /** Os decks que servem para o formato da sala: os seus primeiro, depois os prontos (os do formato antes dos outros). */
  function roomDecks() {
    const f = waitingRoom!.config.format, decks = allDecks().filter(d => fitsIn(d, f) && matchesQuery(d, roomQuery, ptName));
    return { mine: decks.filter(d => !d.builtin), ready: decks.filter(d => d.builtin).sort((a, b) => Number(b.format === f) - Number(a.format === f)) };
  }
  /** A prateleira inteira só é montada ao entrar na sala: digitar na busca redesenha só os cards, sem perder o foco. */
  function renderRoomDecks() {
    const el = roomLobby.decks, show = !!waitingRoom && !waitingRoom.lab && !waitingRoom.started;
    el.hidden = !show;
    if (!show) { el.innerHTML = ''; return; }
    if (!el.firstChild) {
      el.innerHTML = ROOM_DECKS_SHELF;
      $<HTMLInputElement>('#roomDeckSearch').value = roomQuery;
    }
    renderRoomDeckTiles();
  }
  function renderRoomDeckTiles() {
    if (!waitingRoom || !$('#roomDeckTiles')) return;
    const f = waitingRoom.config.format, me = mySeat(), ready = me?.ready !== false;
    // Pontes antigas não mandam ready: o deck com que se entrou continua marcado.
    const selectedId = ready ? roomDeckId : '';
    $('#roomDecksHelp').textContent = roomDecksHelp(choosingDeck, ready, f);
    const focusedDeck = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('#roomDeckTiles [data-deck]')?.dataset.deck;
    const {mine, ready: templates} = roomDecks();
    $('#roomDeckTiles').innerHTML = roomDeckTilesHTML(mine, templates, tileContext(selectedId, true), { query: roomQuery, roomFormat: f });
    for (const tile of root.querySelectorAll<HTMLButtonElement>('#roomDeckTiles [data-deck]')) tile.disabled = choosingDeck;
    if (focusedDeck) root.querySelector<HTMLElement>(`#roomDeckTiles [data-deck="${CSS.escape(focusedDeck)}"]`)?.focus({preventScroll: true});
  }
  /** Senta com o deck escolhido na sala (ou troca o de antes); a partida começa sozinha quando todos tiverem deck. */
  async function chooseInRoom(deck: DeckData) {
    if (!waitingRoom || choosingDeck || (deck.id === roomDeckId && mySeat()?.ready !== false)) return;
    choosingDeck = true; setStatus(`Escolhendo ${deck.name}…`); renderRoomDeckTiles();
    try {
      await opts.onChooseRoomDeck(deck);
      roomDeckId = deck.id;
      // Fica lembrado como o deck do formato, como ao escolher na tela inicial.
      youId = deck.id; save(PREFIXES.deck + (waitingRoom?.config.format ?? format), deck.id);
      setStatus('');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Não foi possível escolher este deck.', true); }
    finally { choosingDeck = false; renderRoomDeckTiles(); }
  }
  const header = mountAppHeader($('.home-top'), {active: 'play', onPlay: () => {}, onDecks: () => { if (!busy && !waitingRoom) opts.onDecks('library', format ?? undefined); },
    async beforeNav(to) {
      if (!waitingRoom) return true;
      if (!await confirmLeaveRoom(waitingRoom.code, to) || !waitingRoom) return false;
      opts.onCancelRoom(); waitingRoom = null; refresh();
      return !busy;
    }});
  refresh();
  fitSidebar();
  // Salas no cabeçalho com a contagem (item 87): quantas salas esperam e quantas partidas dá para assistir.
  async function countRooms() {
    if (root.hidden || document.visibilityState !== 'visible') return;
    try { showRoomCount(await opts.onListRooms(netURL())); } catch { /* sem servidor: a contagem fica como estava */ }
  }
  function showRoomCount(rooms: PublicRoom[]) { header.setRooms(joinableRooms(rooms).length, watchableRooms(rooms).length, contagemTexto(rooms)); }
  void countRooms();
  setInterval(() => void countRooms(), ROOM_COUNT_EVERY_MS);
  let loadingCards = false;
  /** Busca os dados das cartas dos decks; se falhar e faltar a arte ou as cores de algum deck, avisa com Tentar de novo. */
  function loadCards() {
    if (loadingCards) return;
    loadingCards = true; $('#cardsError').hidden = true;
    let failed = false;
    const fail = () => { failed = true; };
    void fetchByNames(allDecks().flatMap(d => (d.commanders ?? []).map(c => c.name))).then(refresh)
      .then(() => fetchPrintings(allDecks().flatMap(d => d.commanders ?? []))).then(refresh).catch(fail)
      .then(() => fetchByNames(allDecks().flatMap(d => [...d.cards, ...(d.sideboard ?? []), ...(d.commanders ?? [])].map(c => c.name)))).then(refresh).catch(fail)
      .then(() => { loadingCards = false; $('#cardsError').hidden = !(failed && missingCardData(allDecks())); });
  }
  // Os comandantes vêm primeiro: são as capas dos decks, e a lista inteira (milhares de cartas) demora a chegar.
  loadCards();
  return { refresh, setStatus, setBusy, roomSay: (seat, key) => roomLobby.say(seat, key), openRoomLink(code) {
    // 8 caracteres: uma partida contra o computador, que só dá para assistir (o link do admin, por exemplo).
    if (!ROOM_CODE.test(code) && !WATCH_CODE.test(code)) { setStatus('O link da sala está incompleto. Peça o código para quem convidou você.', true); return; }
    if (busy || waitingRoom) return;
    mode = 'net'; netTab = 'join'; room = null;
    $<HTMLInputElement>('#netCode').value = code;
    findRoom(code, false, true);
  }, openCreateRoom() {
    if (busy || waitingRoom) return;
    mode = 'net'; netTab = 'create'; visibility = 'public'; room = null;
    refresh();
    $('#netName').focus();
  }, showRoom(nextRoom) {
    preflight++;
    if (!nextRoom) { roomDeckId = ''; roomQuery = ''; choosingDeck = false; }
    waitingRoom = nextRoom;
    // A partida começou (ou a sala acabou) com a pergunta de sair aberta: não há mais de onde sair.
    if (!nextRoom) document.querySelector<HTMLDialogElement>('dialog.room-leave')?.close();
    if (nextRoom && !nextRoom.lab) { mode = 'net'; format = nextRoom.config.format; matchLength = nextRoom.config.matchLength; playerCount = nextRoom.config.playerCount ?? nextRoom.capacity ?? 2; }
    refresh();
  }};
}
