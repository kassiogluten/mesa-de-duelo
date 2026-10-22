import { allDecks, countEntries, deckSize, loadUserDecks, saveUserDecks, type DeckData, type DeckFormat } from '../decks';
import { FORGE_URL, type MatchConfig, type DeckValidation, type RoomInfo, type FRoom, type PublicRoom, type RoomVisibility } from '../forge/client';
import { cacheGet, fetchByNames } from '../scryfall';
import { mountAppHeader } from './appHeader';
import { esc, pip } from './cardtext';
import { openDeckPreview } from './deckPreview';
import { joinableRooms, publicRoomsHTML, type PublicRoomsState } from './publicRooms';
import { deckArt, deckColors } from './deckStats';
import { validateDeckLocal } from './deckRules';
import { siteFooterHTML } from './siteFooter';
import { colorFilterHTML, commanderLineHTML, matchesColors, matchesQuery, toggleColor, type ColorFilter } from './deckFilters';
import './deckFilters.css';
import './lobby.css';
export { deckArt, deckColors } from './deckStats';

type Mode = 'ai' | 'net' | 'free';
type DeckAction = 'library' | 'create' | 'import';
export interface Lobby {
  refresh(): void;
  setStatus(msg: string, error?: boolean): void;
  setBusy(busy: boolean): void;
  showRoom(room: FRoom | null): void;
}
export interface LobbyOptions {
  onPlay(you: DeckData, opp: DeckData | null, config: MatchConfig, opponents?: (DeckData | null)[]): Promise<void>;
  /** Mesa livre: sem servidor e sem regras automáticas. */
  onFreePlay(you: DeckData, format: DeckFormat): void;
  onHost(you: DeckData, name: string, url: string, config: MatchConfig, visibility: RoomVisibility): Promise<void>;
  onJoin(you: DeckData, name: string, code: string, url: string): Promise<void>;
  onValidate(deck: DeckData, format: DeckFormat, url: string): Promise<DeckValidation>;
  onLookup(code: string, url: string): Promise<RoomInfo>;
  /** Salas públicas abertas na ponte. */
  onListRooms(url: string): Promise<PublicRoom[]>;
  onCancelRoom(): void;
  onDecks(action?: DeckAction, format?: DeckFormat): void;
  onEditDeck(deckId: string): void;
}
const load = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const save = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* Browser-local preferences are optional. */ } };
const formatName = (f: DeckFormat | null) => f === 'commander' ? 'Commander' : f === 'pauper' ? 'Pauper' : f === 'free' ? 'Livre' : 'Escolha o formato';
const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
const MORE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';
const REFRESH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PENCIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z M13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
/** De quanto em quanto tempo a lista de salas públicas se atualiza sozinha, com a tela à vista. */
const ROOMS_EVERY_MS = 10_000;
// Último lugar da prateleira "Meus decks": um card vazio para começar um deck novo.
const NEW_DECK_TILE = '<div class="tile-wrap"><button type="button" class="deck-tile new-deck-tile" data-lobby="create"><span class="new-deck-plus" aria-hidden="true">+</span><span>Criar deck</span></button></div>';

export function mountLobby(root: HTMLElement, opts: LobbyOptions): Lobby {
  const remembered = load('mesa:format');
  let format: DeckFormat | null = remembered === 'free' || remembered === 'pauper' || remembered === 'commander' ? remembered : null;
  let mode: Mode = load('mesa:mode') === 'net' ? 'net' : load('mesa:mode') === 'free' ? 'free' : 'ai';
  let matchLength: MatchConfig['matchLength'] = load('mesa:matchLength') === 'bo3' ? 'bo3' : 'bo1';
  let playerCount = [2, 3, 4].includes(Number(load('mesa:commanderPlayers'))) ? Number(load('mesa:commanderPlayers')) : 4;
  let commanderOpponents = ['random', 'random', 'random'];
  try { const saved = JSON.parse(load('mesa:commanderOpponents') ?? 'null'); if (Array.isArray(saved)) commanderOpponents = commanderOpponents.map((fallback, i) => typeof saved[i] === 'string' ? saved[i] : fallback); } catch { /* Ignore invalid optional preferences. */ }
  const rememberedDeck = () => format ? load(`mesa:deck:${format}`) ?? (format === 'free' ? load('mesa:deck') : null) ?? '' : '';
  let youId = rememberedDeck();
  let oppId = load('mesa:opp') ?? 'random';
  let query = '', showIncompatible = false, busy = false;
  let colorFilter = new Set<ColorFilter>();
  const ptName = (name: string) => cacheGet(name)?.pt?.name || name;
  let room: RoomInfo | null = null, waitingRoom: FRoom | null = null;
  // Toda sala nova começa privada: só vira pública se o jogador escolher.
  let visibility: RoomVisibility = 'private';
  let publicRooms: PublicRoomsState = null, roomsHTML = '', roomsRequest = 0;
  let roomsTimer: ReturnType<typeof setInterval> | undefined;
  const validations = new Map<string, DeckValidation>();
  let preflight = 0;
  const key = (deck: DeckData) => JSON.stringify([url(), format, deck.cards, deck.sideboard ?? [], deck.commanders ?? []]);
  const selected = () => allDecks().find(d => d.id === youId);
  const netURL = () => (root.querySelector('#netUrl') as HTMLInputElement).value.trim() || FORGE_URL;
  const url = () => mode === 'net' ? netURL() : FORGE_URL;
  const netName = () => (root.querySelector('#netName') as HTMLInputElement).value.trim() || 'Jogador';
  const config = (): MatchConfig => ({ format: format!, matchLength: format === 'commander' ? 'bo1' : matchLength, playerCount: format === 'commander' ? playerCount : 2 });
  root.innerHTML = `<div class="lobby library-home"><div class="mat" aria-hidden="true"></div>
    <header class="home-top"></header>
    <main class="home-content"><div class="home-intro"><h1>Como jogar:</h1><p>Escolha seu deck, o formato de jogo e seu oponente.</p></div>
    <div class="play-layout">
      <aside class="match-sidebar" aria-label="Configuração da partida">
        <div class="match-setup">
        <fieldset class="match-choice format-choice"><legend>Formato</legend><div class="choice-segments" aria-describedby="formatHelp"><button type="button" data-setting="format" data-value="pauper">Pauper</button><button type="button" data-setting="format" data-value="free">Livre</button><button type="button" data-setting="format" data-value="commander">Commander</button></div><p class="setup-explanation" id="formatHelp"></p></fieldset>
        <fieldset class="match-choice"><legend id="opponentLegend">Oponente</legend><div class="opponent-cards">
          <button type="button" class="opponent-card" data-setting="opponent" data-value="ai"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 9 5v10l-9 5-9-5V7Zm0 10 9-5M12 12 3 7m9 5v10M7.5 4.5l9 5"/></svg><span><strong id="aiModeLabel">Computador</strong></span></button>
          <button type="button" class="opponent-card" data-setting="opponent" data-value="net"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3"/></svg><span><strong id="netModeLabel">Outra pessoa</strong></span></button>
          <button type="button" class="opponent-card free-card" data-setting="opponent" data-value="free"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h9a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M4 7v12a2 2 0 0 0 2 2h9"/></svg><span><strong>Mesa livre</strong></span></button>
        </div><p class="setup-explanation" id="freeHelp" hidden>Sem regras automáticas: você compra, vira, desvira e move as cartas como numa mesa de verdade. Para testar o deck sozinho.</p></fieldset>
        <fieldset class="match-choice duration-choice" id="durationChoice"><legend>Partida</legend><div class="choice-segments"><button type="button" data-setting="length" data-value="bo1">Única</button><button type="button" data-setting="length" data-value="bo3">Melhor de três</button></div></fieldset>
        <fieldset class="match-choice player-count-choice" id="playerCountChoice" hidden><legend>Jogadores</legend><div class="choice-segments"><button type="button" data-setting="players" data-value="2">2</button><button type="button" data-setting="players" data-value="3">3</button><button type="button" data-setting="players" data-value="4">4</button></div></fieldset>
        <div class="opponent-choice" id="aiPanel"><label for="oppSel">Deck do computador</label><select id="oppSel" class="input-field"></select></div>
        <div id="commanderAiPanel" class="commander-ai-panel" hidden></div>
        <section class="network-setup" id="netPanel" aria-label="Jogar com outra pessoa" hidden>
          <label for="netName">Seu nome<input id="netName" class="input-field" maxlength="24" autocomplete="nickname" placeholder="Jogador"></label>
          <section class="net-group" id="joinGroup" aria-labelledby="joinTitle"><h3 class="net-group-title" id="joinTitle">Entrar numa sala</h3>
            <section class="public-rooms" id="publicRooms" aria-labelledby="publicRoomsTitle"><div class="public-rooms-head"><h4 id="publicRoomsTitle">Salas públicas</h4><button type="button" class="link-btn" data-lobby="rooms-refresh" aria-label="Atualizar a lista de salas públicas">${REFRESH}Atualizar</button></div><div id="publicRoomList" aria-busy="false"></div><p class="sr-only" id="publicRoomsStatus" role="status" aria-live="polite"></p></section>
            <form data-join><label for="netCode">Ou digite o código da sala<span class="network-code"><input id="netCode" class="input-field" maxlength="4" autocomplete="off" spellcheck="false" placeholder="ABCD"><button type="submit" class="arena-btn secondary">Entrar</button></span></label></form>
          </section>
          <fieldset class="net-group visibility-choice" id="visibilityChoice"><legend class="net-group-title">Ou crie a sua sala</legend><div class="choice-segments" aria-describedby="visibilityHelp"><button type="button" data-setting="visibility" data-value="private">Privada</button><button type="button" data-setting="visibility" data-value="public">Pública</button></div><p class="setup-explanation" id="visibilityHelp"></p></fieldset>
          <details class="net-adv"><summary>Conexão</summary><label for="netUrl">Endereço do servidor</label><input id="netUrl" class="input-field" spellcheck="false" placeholder="${esc(FORGE_URL)}"></details>
          <div id="roomInfo" class="room-info" hidden></div><div id="netWait" class="net-wait" hidden></div>
        </section>
        </div>
        <div class="match-ready" aria-label="Resumo da partida"><div class="chosen-deck" id="chosenDeck"></div><button class="arena-btn primary big" id="startMatch" data-lobby="start" disabled>Jogar</button><p id="status" class="lobby-status" role="status" aria-live="polite"></p></div>
      </aside>
      <div class="deck-collection">
        <div class="library-toolbar"><label class="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></svg><input id="deckSearch" type="search" placeholder="Buscar um deck" aria-label="Buscar um deck"></label><div id="lobbyColorFilter"></div><label class="incompatible-toggle" id="incompatibleToggle" hidden><input type="checkbox" id="showIncompatible"> Mostrar incompatíveis</label></div>
        <section class="deck-shelf" aria-labelledby="myDecksTitle"><header class="shelf-heading"><div><h2 id="myDecksTitle">Meus decks <span id="personalCount"></span></h2></div><div class="shelf-actions"><button class="arena-btn secondary" data-lobby="library">Gerenciar decks</button></div></header><div id="personalTiles" class="deck-tiles"></div></section>
        <section class="deck-shelf ready-shelf" aria-labelledby="readyDecksTitle"><header class="shelf-heading"><div><h2 id="readyDecksTitle">Decks prontos para a mesa</h2><p>Escolha um para jogar ou faça a sua própria versão.</p></div></header><div id="readyTiles" class="deck-tiles"></div></section>
      </div>
    </div></main>${siteFooterHTML()}</div>`;
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  $('#netName').setAttribute('value', load('mesa:name') ?? '');
  $('#netUrl').setAttribute('value', load('mesa:forgeUrl') ?? '');
  const setStatus = (message: string, error = false) => { $('#status').textContent = message; $('#status').classList.toggle('error', error); };
  function allowed(deck: DeckData) {
    if (deck.format === 'commander' && format !== 'commander') return false;
    const local = validateDeckLocal(deck, format ?? 'free');
    return !format || showIncompatible || (validations.get(key(deck))?.valid ?? local.status !== 'invalid');
  }
  function matches(deck: DeckData) { return matchesQuery(deck, query, ptName) && matchesColors(deckColors(deck), colorFilter); }
  const filtering = () => !!query || colorFilter.size > 0;
  function validationLabel(deck: DeckData) {
    if (!format) return '';
    const cached = validations.get(key(deck));
    if (cached) return cached.valid ? `Válido para ${formatName(format)}` : 'Precisa de ajustes';
    const local = validateDeckLocal(deck, format);
    return local.status === 'invalid' ? 'Incompatível com o formato' : format && format !== 'free' ? '' : 'Livre';
  }
  function tiles(decks: DeckData[]) {
    return decks.map(d => {
      const art = deckArt(d), on = youId === d.id, label = validationLabel(d), colors = deckColors(d);
      return `<div class="tile-wrap${!d.builtin ? ' personal-tile' : ''}"><button type="button" class="deck-tile${on ? ' on' : ''}" data-deck="${esc(d.id)}" aria-pressed="${on}" aria-label="Escolher ${esc(d.name)}"><span class="tile-cover"><span class="tile-art"${art ? ` style="background-image:url('${esc(art)}')"` : ''}></span>${colors.length ? `<span class="tile-colors">${colors.map(pip).join('')}</span>` : ''}</span><span class="tile-check${on ? '' : ' empty'}" aria-hidden="true">${on ? '✓' : ''}</span><span class="tile-info"><span class="tile-name">${esc(d.name)}</span>${commanderLineHTML(d, ptName, 'tile-commander')}<span class="tile-meta"><span>${deckSize(d) + (d.format === 'commander' ? countEntries(d.commanders ?? []) : 0)} cartas</span></span>${label ? `<span class="tile-validity">${esc(label)}</span>` : ''}</span></button><button type="button" class="tile-more" data-tile-menu="${esc(d.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="Mais opções de ${esc(d.name)}">${MORE}</button><div class="tile-menu" role="menu" hidden><button type="button" role="menuitem" data-peek="${esc(d.id)}">${EYE}Ver as cartas</button>${!d.builtin ? `<button type="button" role="menuitem" data-edit-deck="${esc(d.id)}">${PENCIL}Editar</button>` : ''}</div></div>`;
    }).join('');
  }
  function refresh() {
    const focused = document.activeElement as HTMLElement | null;
    // Ver e Editar ficam no menu do deck, que fecha ao redesenhar: o foco volta para o botão do menu.
    const focusId = root.contains(focused) ? focused?.dataset.deck ?? focused?.dataset.tileMenu ?? focused?.dataset.peek ?? focused?.dataset.editDeck : undefined;
    const focusedOpponent = focused?.dataset.opponentSlot;
    const focusAttribute = focused?.dataset.deck ? 'deck' : 'tile-menu';
    const decks = allDecks(), personal = decks.filter(d => !d.builtin), ready = decks.filter(d => d.builtin);
    if (!decks.some(d => d.id === youId)) youId = '';
    const mine = personal.filter(matches), templates = ready.filter(d => matches(d) && allowed(d));
    $('#personalCount').textContent = personal.length ? String(personal.length) : '';
    $('#personalTiles').innerHTML = mine.length ? tiles(mine) + NEW_DECK_TILE : !personal.length ? `<div class="personal-empty"><div class="empty-cards" aria-hidden="true"><i></i><i></i><i></i></div><div><h3>Você ainda não tem nenhum deck.</h3><p>Comece com suas cartas favoritas ou importe uma lista que você já gosta de jogar.</p><button class="arena-btn primary" data-lobby="create">Criar meu primeiro deck</button></div></div>` : `<div class="shelf-empty"><p>${filtering() ? 'Nenhum dos seus decks corresponde à busca e às cores.' : `Você ainda não tem um deck válido para ${formatName(format)}.`}</p><button class="ghost-btn" data-lobby="${filtering() ? 'clear' : 'incompatible'}">${filtering() ? 'Limpar filtros' : 'Mostrar decks incompatíveis'}</button></div>`;
    $('#readyTiles').innerHTML = templates.length ? tiles(templates) : '<p class="shelf-empty">Nenhum deck pronto corresponde à seleção.</p>';
    $('#lobbyColorFilter').innerHTML = colorFilterHTML(colorFilter, 'data-color-filter');
    $('#incompatibleToggle').hidden = !format || format === 'free';
    $<HTMLInputElement>('#showIncompatible').checked = showIncompatible;
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-setting]')) {
      const setting = button.dataset.setting;
      const value = setting === 'format' ? format : setting === 'opponent' ? mode : setting === 'players' ? String(playerCount) : setting === 'visibility' ? visibility : matchLength;
      button.setAttribute('aria-pressed', String(button.dataset.value === value));
      button.disabled = busy || !!waitingRoom || (!!room && setting !== 'opponent');
    }
    $('#formatHelp').textContent = 'Escolha um formato para começar.';
    $('#formatHelp').hidden = !!format;
    header.setDisabled(busy || !!waitingRoom);
    $('.match-sidebar').classList.toggle('waiting-room', !!waitingRoom);
    $('#netPanel').hidden = mode !== 'net';
    $('#publicRooms').hidden = !!room;
    $('#visibilityChoice').hidden = !!room;
    $('#visibilityHelp').textContent = visibility === 'public' ? 'Aparece na lista acima para qualquer pessoa entrar.' : 'Só entra quem receber o código.';
    const commander = format === 'commander';
    const free = mode === 'free';
    $('#durationChoice').hidden = commander || free;
    $('#playerCountChoice').hidden = !commander || free;
    $('#freeHelp').hidden = !free;
    $('#opponentLegend').textContent = commander && playerCount > 2 ? 'Oponentes' : 'Oponente';
    $('#aiModeLabel').textContent = commander && playerCount > 2 ? 'Computadores' : 'Computador';
    $('#netModeLabel').textContent = commander && playerCount > 2 ? 'Outras pessoas' : 'Outra pessoa';
    $('#aiPanel').hidden = mode !== 'ai' || commander;
    $('#commanderAiPanel').hidden = mode !== 'ai' || !commander;
    const aiPool = ready.filter(d => (format === 'commander' ? d.format === 'commander' : d.format !== 'commander') && (!format || validateDeckLocal(d, format).status !== 'invalid'));
    if (oppId !== 'random' && !aiPool.some(d => d.id === oppId)) oppId = 'random';
    $<HTMLSelectElement>('#oppSel').innerHTML = '<option value="random">Aleatório entre os compatíveis</option>' + aiPool.map(d => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');
    $<HTMLSelectElement>('#oppSel').value = oppId;
    if (commander) {
      commanderOpponents = commanderOpponents.map(id => id === 'random' || aiPool.some(d => d.id === id) ? id : 'random');
      $('#commanderAiPanel').innerHTML = '<p class="commander-ai-heading">Decks dos computadores</p>' + commanderOpponents.slice(0, playerCount - 1).map((id, i) => `<label class="opponent-choice" for="commanderOpp${i}"><span class="computer-seat-number" aria-hidden="true">${i + 1}</span><select id="commanderOpp${i}" aria-label="Deck do computador ${i + 1}" class="input-field" data-opponent-slot="${i}"><option value="random">Deck aleatório</option>${aiPool.map(d => `<option value="${esc(d.id)}" ${id === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>`).join('');
    }
    for (const control of root.querySelectorAll<HTMLInputElement | HTMLButtonElement>('#oppSel, [data-opponent-slot], #netName, #netCode, #netUrl, [data-join] button, [data-join-room], [data-lobby=rooms-refresh], [data-lobby=library], [data-lobby=create], [data-lobby=import], [data-edit-deck]')) control.disabled = busy || !!waitingRoom;
    const deck = selected(), result = deck && format ? validations.get(key(deck)) : undefined;
    const invalid = !free && !!deck && !!format && (result ? !result.valid : validateDeckLocal(deck, format).status === 'invalid');
    const art = deck && deckArt(deck);
    $('#chosenDeck').innerHTML = `${art ? `<span class="chosen-art" style="background-image:url('${esc(art)}')" aria-hidden="true"></span>` : ''}${!deck ? `<span class="chosen-caption">${esc(formatName(format))}</span>` : ''}<strong>${esc(deck?.name ?? 'Escolha um deck para jogar')}</strong>${deck ? `<span>${result ? result.valid ? 'Verificado pelo servidor' : 'Precisa de ajustes' : deck.builtin ? 'Deck pronto' : 'Seu deck'}</span>` : ''}`;
    const start = $<HTMLButtonElement>('#startMatch');
    start.disabled = !format || !deck || invalid || busy || !!waitingRoom;
    start.textContent = busy ? 'Preparando…' : free ? 'Abrir mesa livre' : mode === 'ai' ? 'Jogar' : room ? 'Entrar na sala' : 'Criar sala';
    $('#roomInfo').hidden = !room;
    $('#roomInfo').innerHTML = room ? `<p>Sala <strong>${esc(room.code)}</strong> · ${esc(room.players[0]?.name ?? 'Anfitrião')} · ${formatName(room.config.format)} · ${room.config.matchLength === 'bo3' ? 'Melhor de três' : 'Partida única'} · ${room.players.length}/${room.capacity ?? room.config.playerCount ?? 2} jogadores</p><p>${selected() ? 'Para entrar com outro deck, escolha-o e confirme abaixo.' : 'Escolha um deck compatível e confirme abaixo.'}</p><button class="ghost-btn" data-lobby="cancel-lookup">Voltar a criar uma sala</button>` : '';
    $('#netWait').hidden = !waitingRoom;
    if (waitingRoom) {
      const capacity = waitingRoom.capacity ?? waitingRoom.config.playerCount ?? 2;
      $('#netWait').innerHTML = `<span>${waitingRoom.public ? 'Sala pública' : 'Sala privada'} · ${formatName(waitingRoom.config.format)} · ${waitingRoom.players.length}/${capacity} jogadores</span><strong class="net-code" aria-label="Código da sala">${esc(waitingRoom.code)}</strong><p class="room-invitation">${waitingRoom.public ? 'A sala aparece na lista de salas públicas. Você também pode compartilhar o código.' : 'Compartilhe o código para completar a mesa.'}</p><ol class="room-seats">${Array.from({length: capacity}, (_, seat) => { const player = waitingRoom!.players.find((p, i) => (p.seat ?? i) === seat); return `<li class="${player ? 'occupied' : ''}"><span>${player ? esc(player.name) : 'Lugar disponível'}${seat === waitingRoom!.seat ? ' · Você' : ''}</span><small>${player ? player.connected ? 'Pronto' : 'Reconectando…' : 'Aguardando'}</small></li>`; }).join('')}</ol><button class="arena-btn secondary" data-lobby="cancel-room">Sair da sala</button>`;
    }
    if (focusedOpponent !== undefined) root.querySelector<HTMLElement>(`[data-opponent-slot="${CSS.escape(focusedOpponent)}"]`)?.focus({preventScroll: true});
    if (focusId) root.querySelector<HTMLElement>(`[data-${focusAttribute}="${CSS.escape(focusId)}"]`)?.focus({preventScroll: true});
    syncRoomPolling();
  }
  // ---------- Salas públicas ----------
  // Só procura com "Outra pessoa" escolhido, fora de uma sala e com a aba à vista; com a partida na tela, o lobby fica escondido.
  const wantRooms = () => mode === 'net' && !waitingRoom && !room && document.visibilityState === 'visible';
  function syncRoomPolling() {
    if (wantRooms() && !roomsTimer) {
      void loadRooms();
      roomsTimer = setInterval(() => { if (!root.hidden && !busy) void loadRooms(); }, ROOMS_EVERY_MS);
    } else if (!wantRooms() && roomsTimer) { clearInterval(roomsTimer); roomsTimer = undefined; }
  }
  async function loadRooms(announce = false) {
    const request = ++roomsRequest, list = $('#publicRoomList');
    list.setAttribute('aria-busy', 'true');
    let next: PublicRoomsState;
    try { next = await opts.onListRooms(netURL()); } catch { next = 'error'; }
    if (request !== roomsRequest) return;
    list.setAttribute('aria-busy', 'false');
    publicRooms = next;
    renderRooms();
    if (announce) {
      const count = Array.isArray(next) ? joinableRooms(next).length : -1;
      $('#publicRoomsStatus').textContent = count < 0 ? 'Não foi possível ver as salas agora.' : count === 0 ? 'Nenhuma sala pública aberta.' : count === 1 ? 'Uma sala pública aberta.' : `${count} salas públicas abertas.`;
    }
  }
  function renderRooms() {
    const list = $('#publicRoomList'), html = publicRoomsHTML(publicRooms, busy || !!waitingRoom);
    if (html === roomsHTML) return;
    // A lista muda sozinha: quem estava com o foco num "Entrar" continua nele, ou vai para o Atualizar se a sala sumiu.
    const focused = document.activeElement as HTMLElement | null;
    const focusCode = focused && list.contains(focused) ? focused.dataset.joinRoom : undefined;
    list.innerHTML = roomsHTML = html;
    if (focusCode !== undefined) (list.querySelector<HTMLElement>(`[data-join-room="${CSS.escape(focusCode)}"]`) ?? $('[data-lobby=rooms-refresh]')).focus({preventScroll: true});
  }
  document.addEventListener('visibilitychange', () => syncRoomPolling());
  // A barra lateral ocupa só o que sobra da tela abaixo do topo dela, para o botão Jogar nunca ficar fora da vista.
  let fitFrame = 0;
  const fitSidebar = () => { fitFrame = 0; if (!root.isConnected) return; const bar = $('.match-sidebar'); bar.style.setProperty('--sidebar-room', `${Math.max(280, innerHeight - Math.max(bar.getBoundingClientRect().top, 16) - 16)}px`); };
  const queueFit = () => { if (!fitFrame) fitFrame = requestAnimationFrame(fitSidebar); };
  addEventListener('scroll', queueFit, {passive: true});
  addEventListener('resize', queueFit);
  const setBusy = (value: boolean) => { busy = value; refresh(); };
  function choose(deck: DeckData) {
    if (busy || waitingRoom) return;
    youId = deck.id;
    if (format) save(`mesa:deck:${format}`, youId);
    refresh();
    const request = ++preflight;
    if (!format) { setStatus('Escolha o formato antes de iniciar a partida.'); return; }
    if (mode === 'free') { setStatus(''); return; }
    const currentKey = key(deck);
    void opts.onValidate(deck, format, url()).then(result => {
      if (request !== preflight) return;
      validations.set(currentKey, result);
      refresh(); setStatus(result.valid ? '' : result.issues.map(i => `${i.card ? `${i.card}: ` : ''}${i.message}`).join(' '), !result.valid);
    }).catch(() => { if (request === preflight) setStatus('Deck selecionado. A validação será feita ao conectar para jogar.'); });
  }
  async function start() {
    const deck = selected();
    if (busy || !format || !deck) return;
    ++preflight;
    if (mode === 'free') { setStatus(''); opts.onFreePlay(deck, format); return; }
    const matchConfig = config(), endpoint = url(), playerName = netName(), selectedRoom = room, selectedMode = mode, roomVisibility = visibility, opponentId = oppId, selectedOpponents = commanderOpponents.slice(0, (config().playerCount ?? 2) - 1);
    setBusy(true); setStatus('Verificando o deck…');
    try {
      const result = await opts.onValidate(deck, matchConfig.format, endpoint);
      validations.set(key(deck), result);
      if (!result.valid) { setStatus(result.issues.map(i => `${i.card ? `${i.card}: ` : ''}${i.message}`).join(' '), true); return; }
      if (selectedMode === 'net') {
        if (selectedRoom) await opts.onJoin(deck, playerName, selectedRoom.code, endpoint);
        else await opts.onHost(deck, playerName, endpoint, matchConfig, roomVisibility);
      } else {
        const opponent = opponentId === 'random' ? null : allDecks().find(d => d.builtin && d.id === opponentId);
        if (opponent === undefined) { setStatus('Não há um deck do computador compatível com este formato.', true); return; }
        const opponents = matchConfig.format === 'commander' ? selectedOpponents.map(id => id === 'random' ? null : allDecks().find(d => d.builtin && d.id === id) ?? null) : undefined;
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
    const choice = target.closest<HTMLButtonElement>('[data-setting]');
    if (choice && !choice.disabled) {
      if (choice.dataset.setting === 'format') {
        format = choice.dataset.value === 'commander' ? 'commander' : choice.dataset.value === 'pauper' ? 'pauper' : 'free'; save('mesa:format', format); youId = rememberedDeck(); preflight++; setStatus('');
      } else if (choice.dataset.setting === 'opponent') {
        mode = choice.dataset.value === 'net' ? 'net' : choice.dataset.value === 'free' ? 'free' : 'ai'; save('mesa:mode', mode); room = null; preflight++; setStatus('');
      } else if (choice.dataset.setting === 'visibility') { visibility = choice.dataset.value === 'public' ? 'public' : 'private';
      } else if (choice.dataset.setting === 'players') { playerCount = Number(choice.dataset.value); save('mesa:commanderPlayers', String(playerCount));
      } else { matchLength = choice.dataset.value === 'bo3' ? 'bo3' : 'bo1'; save('mesa:matchLength', matchLength); }
      refresh(); return;
    }
    const menuButton = target.closest<HTMLButtonElement>('[data-tile-menu]');
    if (menuButton) { toggleTileMenu(menuButton); return; }
    closeTileMenus();
    const editId = target.closest<HTMLButtonElement>('[data-edit-deck]')?.dataset.editDeck;
    if (editId && !busy && !waitingRoom && loadUserDecks().some(d => d.id === editId)) { preflight++; opts.onEditDeck(editId); return; }
    const picked = target.closest<HTMLElement>('[data-deck]')?.dataset.deck;
    if (picked && !busy) { const deck = allDecks().find(d => d.id === picked); if (deck) choose(deck); return; }
    const peek = target.closest<HTMLElement>('[data-peek]')?.dataset.peek;
    if (peek && !busy && !waitingRoom) {
      const deck = allDecks().find(d => d.id === peek); if (!deck) return;
      openDeckPreview(deck, {selected: deck.id === youId, onPick: () => choose(deck), onCopy: deck.builtin ? () => {
        const copy: DeckData = {...structuredClone(deck), id: crypto.randomUUID(), name: `${deck.name} — minha versão`, builtin: false, sourceTemplateId: deck.id};
        const result = saveUserDecks([...loadUserDecks(), copy]); choose(copy);
        if (!result.ok) setStatus(result.error, true);
      } : undefined}); return;
    }
    const action = target.closest<HTMLElement>('[data-lobby]')?.dataset.lobby;
    if (!busy && !waitingRoom && ['library','create','import'].includes(action ?? '')) opts.onDecks(action as DeckAction, format ?? undefined);
    if (action === 'start') void start();
    if (action === 'clear') { query = ''; colorFilter = new Set(); $<HTMLInputElement>('#deckSearch').value = ''; refresh(); }
    if (action === 'incompatible') { showIncompatible = true; refresh(); }
    if (action === 'cancel-lookup' && !busy) { room = null; refresh(); }
    if (action === 'rooms-refresh' && !busy && !waitingRoom) void loadRooms(true);
    const joinCode = target.closest<HTMLButtonElement>('[data-join-room]')?.dataset.joinRoom;
    if (joinCode && !busy && !waitingRoom) findRoom(joinCode, true);
    if (action === 'cancel-room') { opts.onCancelRoom(); waitingRoom = null; refresh(); }
  });
  function closeTileMenus(except?: HTMLButtonElement) {
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-tile-menu][aria-expanded="true"]')) {
      if (button === except) continue;
      button.setAttribute('aria-expanded', 'false');
      (button.nextElementSibling as HTMLElement).hidden = true;
    }
  }
  function toggleTileMenu(button: HTMLButtonElement) {
    const open = button.getAttribute('aria-expanded') !== 'true';
    closeTileMenus(button);
    button.setAttribute('aria-expanded', String(open));
    const menu = button.nextElementSibling as HTMLElement;
    menu.hidden = !open;
    if (open) menu.querySelector<HTMLButtonElement>('button')?.focus();
  }
  // O menu fecha ao clicar fora dele ou quando o Tab leva o foco para outro lugar.
  document.addEventListener('pointerdown', e => { if (!(e.target as HTMLElement).closest?.('.tile-menu, [data-tile-menu]')) closeTileMenus(); });
  root.addEventListener('focusout', e => {
    const wrap = (e.target as HTMLElement).closest('.tile-wrap');
    if (wrap && e.relatedTarget && !wrap.contains(e.relatedTarget as Node)) closeTileMenus();
  });
  root.addEventListener('keydown', e => {
    const menu = (e.target as HTMLElement).closest<HTMLElement>('.tile-menu');
    if (!menu) return;
    const items = [...menu.querySelectorAll<HTMLButtonElement>('button')], at = items.indexOf(e.target as HTMLButtonElement);
    if (e.key === 'Escape') { e.preventDefault(); const button = menu.previousElementSibling as HTMLButtonElement; closeTileMenus(); button.focus(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus(); }
  });
  root.addEventListener('input', e => { if ((e.target as HTMLElement).id === 'deckSearch') { query = (e.target as HTMLInputElement).value.trim(); refresh(); } });
  root.addEventListener('change', e => {
    const target = e.target as HTMLInputElement;
    if (target.id === 'showIncompatible') showIncompatible = target.checked;
    if (target.dataset.opponentSlot !== undefined) { commanderOpponents[Number(target.dataset.opponentSlot)] = target.value; save('mesa:commanderOpponents', JSON.stringify(commanderOpponents)); }
    if (target.id === 'oppSel') { oppId = target.value; save('mesa:opp', oppId); }
    if (target.id === 'netName') save('mesa:name', target.value.trim());
    if (target.id === 'netUrl') { save('mesa:forgeUrl', target.value.trim()); room = null; validations.clear(); preflight++; }
    refresh();
  });
  root.addEventListener('submit', e => {
    if (!(e.target as HTMLElement).matches('[data-join]')) return;
    e.preventDefault(); if (busy) return;
    const code = $<HTMLInputElement>('#netCode').value.trim().toUpperCase();
    if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{4}$/.test(code)) { setStatus('Use o código de 4 caracteres da sala.', true); return; }
    findRoom(code, false);
  });
  /** Busca a sala pelo código e entra nela; pela lista de salas públicas é o mesmo caminho, com as mesmas regras. */
  function findRoom(code: string, fromList: boolean) {
    preflight++; setBusy(true); setStatus('Buscando sala…');
    void opts.onLookup(code, netURL()).then(info => {
      if (!info.available) throw new Error(info.players.length >= (info.capacity ?? info.config.playerCount ?? 2) ? `A sala ${info.code} já está completa.` : `A partida da sala ${info.code} já começou.`);
      room = info; format = info.config.format; matchLength = info.config.matchLength; playerCount = info.config.playerCount ?? info.capacity ?? 2; youId = rememberedDeck(); setStatus('');
      return true;
    }).catch(error => { setStatus(error instanceof Error ? error.message : 'Não foi possível encontrar a sala.', true); return false; }).then(found => {
      setBusy(false);
      // A sala da lista pode ter enchido ou começado nesse meio-tempo: a lista se atualiza.
      if (!found) { if (fromList) void loadRooms(); return; }
      // Com um deck lembrado que serve para o formato da sala, entra direto; senão pede o deck antes.
      const deck = selected();
      if (deck && validateDeckLocal(deck, format!).status !== 'invalid') void start();
      else setStatus(`Escolha um deck de ${formatName(format)} para entrar na sala ${room!.code}.`);
    });
  }
  const header = mountAppHeader($('.home-top'), {active: 'play', onPlay: () => {}, onDecks: () => { if (!busy && !waitingRoom) opts.onDecks('library', format ?? undefined); }});
  refresh();
  fitSidebar();
  void fetchByNames(allDecks().flatMap(d => [...d.cards, ...(d.sideboard ?? []), ...(d.commanders ?? [])].map(c => c.name))).then(refresh).catch(() => {});
  return { refresh, setStatus, setBusy, showRoom(nextRoom) {
    preflight++; waitingRoom = nextRoom;
    if (nextRoom) { mode = 'net'; format = nextRoom.config.format; matchLength = nextRoom.config.matchLength; playerCount = nextRoom.config.playerCount ?? nextRoom.capacity ?? 2; }
    refresh();
  }};
}
