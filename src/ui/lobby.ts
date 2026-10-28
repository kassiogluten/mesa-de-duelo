import { allDecks, countEntries, DECK_FORMATS, deckSize, FORMAT_LABEL, loadUserDecks, SACOLA_HINT, saveUserDecks, type DeckData, type DeckFormat } from '../decks';
import { FORGE_URL, RequestError, type MatchConfig, type DeckValidation, type RoomInfo, type FRoom, type PublicRoom, type RoomSaying, type RoomVisibility } from '../forge/client';
import { cacheGet, fetchByNames } from '../scryfall';
import { mountAppHeader } from './appHeader';
import { esc, pip } from './cardtext';
import { openDeckPreview } from './deckPreview';
import { joinableRooms, publicRoomsHTML, type PublicRoomsState } from './publicRooms';
import { mountRoomLobby } from './roomLobby';
import { deckArt, deckColors, deckPriceHTML } from './deckStats';
import { validateDeckLocal } from './deckRules';
import { siteFooterHTML } from './siteFooter';
import { colorFilterHTML, commanderLineHTML, matchesColors, matchesQuery, toggleColor, type ColorFilter } from './deckFilters';
import './deckFilters.css';
import './lobby.css';
import { prefsChanged } from '../conta/sync';
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
}
export interface LobbyOptions {
  onPlay(you: DeckData, opp: DeckData | null, config: MatchConfig, opponents?: (DeckData | null)[]): Promise<void>;
  /** Mesa livre: sem servidor e sem regras automáticas. */
  onFreePlay(you: DeckData, format: DeckFormat): void;
  onHost(you: DeckData, name: string, url: string, config: MatchConfig, visibility: RoomVisibility, code: string): Promise<void>;
  onJoin(you: DeckData, name: string, code: string, url: string): Promise<void>;
  onValidate(deck: DeckData, format: DeckFormat, url: string): Promise<DeckValidation>;
  onLookup(code: string, url: string): Promise<RoomInfo>;
  /** Salas públicas abertas na ponte. */
  onListRooms(url: string): Promise<PublicRoom[]>;
  onCancelRoom(): void;
  onSay(key: RoomSaying): void;
  onDecks(action?: DeckAction, format?: DeckFormat): void;
  onEditDeck(deckId: string): void;
}
const load = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const save = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* Browser-local preferences are optional. */ } };
const formatName = (f: DeckFormat | null) => f ? FORMAT_LABEL[f] : 'Escolha o formato';
const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
const MORE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';
const REFRESH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PENCIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z M13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
/** De quanto em quanto tempo a lista de salas públicas se atualiza sozinha, com a tela à vista. */
const ROOMS_EVERY_MS = 10_000;
/** Os sorteados evitam O/0 e I/1, mas quem escolhe o código pode usar qualquer letra ou número. */
const ROOM_CODE = /^[A-Z0-9]{4}$/;
// Último lugar da prateleira "Meus decks": um card vazio para começar um deck novo.
const NEW_DECK_TILE = '<div class="tile-wrap"><button type="button" class="deck-tile new-deck-tile" data-lobby="create"><span class="new-deck-plus" aria-hidden="true">+</span><span>Criar deck</span></button></div>';

export function mountLobby(root: HTMLElement, opts: LobbyOptions): Lobby {
  const remembered = load('mesa:format');
  // Commander é o padrão; os demais ficam em "Outros", que volta ao último deles usado (Pauper na primeira vez).
  let format: DeckFormat | null = DECK_FORMATS.find(f => f === remembered) ?? 'commander';
  const otherFormat = (): DeckFormat => DECK_FORMATS.find(f => f !== 'commander' && f === load('mesa:otherFormat')) ?? 'pauper';
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
  let netTab: NetTab = load('mesa:netTab') === 'create' ? 'create' : 'join';
  let publicRooms: PublicRoomsState = null, roomsHTML = '', roomsRequest = 0;
  let roomsTimer: ReturnType<typeof setInterval> | undefined;
  const validations = new Map<string, DeckValidation>();
  let preflight = 0;
  const key = (deck: DeckData) => JSON.stringify([url(), format, deck.cards, deck.sideboard ?? [], deck.commanders ?? []]);
  const selected = () => allDecks().find(d => d.id === youId);
  const netURL = () => (root.querySelector('#netUrl') as HTMLInputElement).value.trim() || FORGE_URL;
  const url = () => mode === 'net' ? netURL() : FORGE_URL;
  const netName = () => (root.querySelector('#netName') as HTMLInputElement).value.trim() || 'Jogador';
  const roomCode = () => (root.querySelector('#roomCode') as HTMLInputElement).value.trim().toUpperCase();
  const roomCodeHelp = () => { $('#roomCodeHelp').textContent = roomCode() && visibility === 'private' ? 'Códigos fáceis podem ser adivinhados por outras pessoas.' : 'Deixe vazio para sortear.'; };
  const config = (): MatchConfig => ({ format: format!, matchLength: format === 'commander' ? 'bo1' : matchLength, playerCount: format === 'commander' ? playerCount : 2 });
  root.innerHTML = `<div class="lobby library-home"><div class="mat" aria-hidden="true"></div>
    <header class="home-top"></header>
    <main class="home-content"><div class="home-intro"><h1>Como jogar:</h1><p>Escolha seu deck, o formato de jogo e seu oponente.</p></div>
    <div class="play-layout">
      <aside class="match-sidebar" aria-label="Configuração da partida">
        <div class="match-setup">
        <fieldset class="match-choice format-choice"><legend>Formato</legend><div class="choice-segments" aria-describedby="formatHelp"><button type="button" data-setting="format" data-value="commander">Commander</button><button type="button" data-setting="format" data-value="others" aria-controls="formatOthers">Outros</button></div><div class="choice-segments format-others" id="formatOthers" role="group" aria-label="Outros formatos" hidden><button type="button" data-setting="format" data-value="pauper">Pauper</button><button type="button" data-setting="format" data-value="sacola50">Sacola 50</button><button type="button" data-setting="format" data-value="free">Livre</button></div><p class="setup-explanation" id="formatHelp"></p></fieldset>
        <fieldset class="match-choice"><legend id="opponentLegend">Oponente</legend><div class="opponent-cards">
          <button type="button" class="opponent-card" data-setting="opponent" data-value="ai"><span><strong id="aiModeLabel">Computador</strong></span></button>
          <button type="button" class="opponent-card" data-setting="opponent" data-value="net"><span><strong id="netModeLabel">Outra pessoa</strong></span></button>
          <button type="button" class="opponent-card free-card" data-setting="opponent" data-value="free"><span><strong>Mesa livre</strong></span></button>
        </div><p class="setup-explanation" id="freeHelp" hidden>Sem regras automáticas: você compra, vira, desvira e move as cartas como numa mesa de verdade. Para testar o deck sozinho.</p></fieldset>
        <fieldset class="match-choice duration-choice" id="durationChoice"><legend>Partida</legend><div class="choice-segments"><button type="button" data-setting="length" data-value="bo1">Única</button><button type="button" data-setting="length" data-value="bo3">Melhor de três</button></div></fieldset>
        <fieldset class="match-choice player-count-choice" id="playerCountChoice" hidden><legend>Jogadores</legend><div class="choice-segments"><button type="button" data-setting="players" data-value="2">2</button><button type="button" data-setting="players" data-value="3">3</button><button type="button" data-setting="players" data-value="4">4</button></div></fieldset>
        <div class="opponent-choice" id="aiPanel"><label for="oppSel">Deck do computador</label><select id="oppSel" class="input-field"></select></div>
        <div id="commanderAiPanel" class="commander-ai-panel" hidden></div>
        <section class="network-setup" id="netPanel" aria-label="Jogar com outra pessoa" hidden>
          <label for="netName">Seu nome<input id="netName" class="input-field" maxlength="24" autocomplete="nickname" placeholder="Jogador"></label>
          <div class="net-tabs-block"><span class="side-label" id="netTabsLabel">Sala</span><div class="choice-segments net-tabs" role="tablist" aria-labelledby="netTabsLabel"><button type="button" role="tab" id="netTabJoin" data-net-tab="join" aria-controls="joinGroup">Entrar numa sala</button><button type="button" role="tab" id="netTabCreate" data-net-tab="create" aria-controls="createGroup">Criar sala</button></div></div>
          <section class="net-group" id="joinGroup" role="tabpanel" aria-labelledby="netTabJoin">
            <section class="public-rooms" id="publicRooms" aria-labelledby="publicRoomsTitle"><div class="public-rooms-head"><h4 id="publicRoomsTitle">Salas públicas</h4><button type="button" class="link-btn" data-lobby="rooms-refresh" aria-label="Atualizar a lista de salas públicas">${REFRESH}Atualizar</button></div><div id="publicRoomList" aria-busy="false"></div><p class="sr-only" id="publicRoomsStatus" role="status" aria-live="polite"></p></section>
            <form data-join><label for="netCode">Ou digite o código da sala<span class="network-code"><input id="netCode" class="input-field" maxlength="4" autocomplete="off" spellcheck="false" placeholder="ABCD"><button type="submit" class="arena-btn secondary">Entrar</button></span></label></form>
          </section>
          <div class="net-group" id="createGroup" role="tabpanel" aria-labelledby="netTabCreate"><fieldset class="match-choice visibility-choice"><legend>Tipo de sala</legend><div class="choice-segments" aria-describedby="visibilityHelp"><button type="button" data-setting="visibility" data-value="private">Privada</button><button type="button" data-setting="visibility" data-value="public">Pública</button></div><p class="setup-explanation" id="visibilityHelp"></p></fieldset><div class="room-code-choice"><label for="roomCode">Código da sala (opcional)<input id="roomCode" class="input-field" maxlength="4" autocomplete="off" spellcheck="false" placeholder="ABCD" aria-describedby="roomCodeHelp"></label><p class="setup-explanation" id="roomCodeHelp"></p></div></div>
          <details class="net-adv"><summary>Conexão</summary><label for="netUrl">Endereço do servidor</label><input id="netUrl" class="input-field" spellcheck="false" placeholder="${esc(FORGE_URL)}"></details>
          <div id="roomInfo" class="room-info" hidden></div>
        </section>
        </div>
        <div class="match-ready" aria-label="Resumo da partida"><div class="chosen-deck" id="chosenDeck"></div><button class="arena-btn primary big" id="startMatch" data-lobby="start" disabled>Jogar</button><p id="status" class="lobby-status" role="status" aria-live="polite"></p></div>
      </aside>
      <div class="deck-collection">
        <div class="library-toolbar"><label class="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></svg><input id="deckSearch" type="search" placeholder="Buscar um deck" aria-label="Buscar um deck"></label><div id="lobbyColorFilter"></div><label class="incompatible-toggle" id="incompatibleToggle" hidden><input type="checkbox" id="showIncompatible"> Mostrar incompatíveis</label></div>
        <section class="deck-shelf" aria-labelledby="myDecksTitle"><header class="shelf-heading"><div><h2 id="myDecksTitle">Meus decks <span id="personalCount"></span></h2></div><div class="shelf-actions"><button class="arena-btn secondary" data-lobby="library">Gerenciar decks</button></div></header><div id="personalTiles" class="deck-tiles"></div></section>
        <section class="deck-shelf ready-shelf" aria-labelledby="readyDecksTitle"><header class="shelf-heading"><div><h2 id="readyDecksTitle">Decks prontos para a mesa</h2><p>Escolha um para jogar ou faça a sua própria versão.</p></div></header><div id="readyTiles" class="deck-tiles"></div></section>
      </div>
    </div>
    <section class="room-lobby" id="roomLobby" aria-label="Sala de espera" hidden></section></main>${siteFooterHTML()}</div>`;
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const roomLobby = mountRoomLobby($('#roomLobby'), {onSay: key => opts.onSay(key), onLeave: () => { opts.onCancelRoom(); waitingRoom = null; refresh(); }});
  $('#netName').setAttribute('value', load('mesa:name') ?? '');
  // O nome veio da conta (outro aparelho, ou o primeiro nome do Google): atualiza o campo, se ninguém estiver digitando.
  addEventListener('mesa:prefs-sincronizadas', () => {
    const input = $<HTMLInputElement>('#netName');
    if (document.activeElement !== input) input.value = load('mesa:name') ?? '';
  });
  $('#netUrl').setAttribute('value', load('mesa:forgeUrl') ?? '');
  // Na sala de espera a barra lateral some: os avisos (alguém voltou, erro da ponte) aparecem no lobby da sala.
  const setStatus = (message: string, error = false) => { $('#status').textContent = message; $('#status').classList.toggle('error', error); roomLobby.setStatus(message, error); };
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
      // Com o selo do formato, a etiqueta "Livre" (todo deck vale no Livre) só repetiria a informação.
      const formatTag = d.builtin && d.format && d.format !== 'commander' ? FORMAT_LABEL[d.format] : '';
      const art = deckArt(d), on = youId === d.id, colors = deckColors(d), validity = validationLabel(d), label = formatTag && validity === 'Livre' ? '' : validity;
      return `<div class="tile-wrap${!d.builtin ? ' personal-tile' : ''}"><button type="button" class="deck-tile${on ? ' on' : ''}" data-deck="${esc(d.id)}" aria-pressed="${on}" aria-label="Escolher ${esc(d.name)}"><span class="tile-cover"><span class="tile-art"${art ? ` style="background-image:url('${esc(art)}')"` : ''}></span>${colors.length ? `<span class="tile-colors">${colors.map(pip).join('')}</span>` : ''}</span><span class="tile-check${on ? '' : ' empty'}" aria-hidden="true">${on ? '✓' : ''}</span><span class="tile-info"><span class="tile-name">${esc(d.name)}</span>${commanderLineHTML(d, ptName, 'tile-commander')}<span class="tile-meta"><span>${deckSize(d) + (d.format === 'commander' ? countEntries(d.commanders ?? []) : 0)} cartas</span>${deckPriceHTML(d, 'tile-price', false)}${formatTag ? `<span class="tile-format">${esc(formatTag)}</span>` : ''}</span>${label ? `<span class="tile-validity">${esc(label)}</span>` : ''}</span></button><button type="button" class="tile-more" data-tile-menu="${esc(d.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="Mais opções de ${esc(d.name)}">${MORE}</button><div class="tile-menu" role="menu" hidden><button type="button" role="menuitem" data-peek="${esc(d.id)}">${EYE}Ver as cartas</button>${!d.builtin ? `<button type="button" role="menuitem" data-edit-deck="${esc(d.id)}">${PENCIL}Editar</button>` : ''}</div></div>`;
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
    // Os decks prontos do formato escolhido vêm primeiro; os outros compatíveis (como os do Livre no Sacola 50) depois.
    const mine = personal.filter(matches), templates = ready.filter(d => matches(d) && allowed(d)).sort((a, b) => Number(b.format === format) - Number(a.format === format));
    $('#personalCount').textContent = personal.length ? String(personal.length) : '';
    $('#personalTiles').innerHTML = mine.length ? tiles(mine) + NEW_DECK_TILE : !personal.length ? `<div class="personal-empty"><div class="empty-cards" aria-hidden="true"><i></i><i></i><i></i></div><div><h3>Você ainda não tem nenhum deck.</h3><p>Comece com suas cartas favoritas ou importe uma lista que você já gosta de jogar.</p><button class="arena-btn primary" data-lobby="create">Criar meu primeiro deck</button></div></div>` : `<div class="shelf-empty"><p>${filtering() ? 'Nenhum dos seus decks corresponde à busca e às cores.' : `Você ainda não tem um deck válido para ${formatName(format)}.`}</p><button class="ghost-btn" data-lobby="${filtering() ? 'clear' : 'incompatible'}">${filtering() ? 'Limpar filtros' : 'Mostrar decks incompatíveis'}</button></div>`;
    $('#readyTiles').innerHTML = templates.length ? tiles(templates) : '<p class="shelf-empty">Nenhum deck pronto corresponde à seleção.</p>';
    $('#lobbyColorFilter').innerHTML = colorFilterHTML(colorFilter, 'data-color-filter');
    $('#incompatibleToggle').hidden = !format || format === 'free';
    $<HTMLInputElement>('#showIncompatible').checked = showIncompatible;
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-setting]')) {
      const setting = button.dataset.setting;
      const value = setting === 'format' ? format : setting === 'opponent' ? mode : setting === 'players' ? String(playerCount) : setting === 'visibility' ? visibility : matchLength;
      const others = setting === 'format' && button.dataset.value === 'others';
      button.setAttribute('aria-pressed', String(others ? !!format && format !== 'commander' : button.dataset.value === value));
      if (others) button.setAttribute('aria-expanded', String(!!format && format !== 'commander'));
      button.disabled = busy || !!waitingRoom || (!!room && setting !== 'opponent');
    }
    $('#formatOthers').hidden = !format || format === 'commander';
    $('#formatHelp').textContent = format === 'sacola50' ? SACOLA_HINT : 'Escolha um formato para começar.';
    $('#formatHelp').hidden = !!format && format !== 'sacola50';
    header.setDisabled(busy || !!waitingRoom);
    $('.home-intro').hidden = $('.play-layout').hidden = !!waitingRoom;
    roomLobby.render(waitingRoom);
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
    const commander = format === 'commander';
    const free = mode === 'free';
    // Quem entra numa sala joga com as regras dela: duração e número de jogadores são escolhas de quem cria.
    const joining = mode === 'net' && netTab === 'join';
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
    const aiPool = ready.filter(d => (format === 'commander' ? d.format === 'commander' : d.format !== 'commander') && (!format || validateDeckLocal(d, format).status !== 'invalid'));
    if (oppId !== 'random' && !aiPool.some(d => d.id === oppId)) oppId = 'random';
    $<HTMLSelectElement>('#oppSel').innerHTML = '<option value="random">Aleatório entre os compatíveis</option>' + aiPool.map(d => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');
    $<HTMLSelectElement>('#oppSel').value = oppId;
    if (commander) {
      commanderOpponents = commanderOpponents.map(id => id === 'random' || aiPool.some(d => d.id === id) ? id : 'random');
      $('#commanderAiPanel').innerHTML = '<p class="commander-ai-heading side-label">Decks dos computadores</p>' + commanderOpponents.slice(0, playerCount - 1).map((id, i) => `<label class="opponent-choice" for="commanderOpp${i}"><span class="computer-seat-number" aria-hidden="true">${i + 1}</span><select id="commanderOpp${i}" aria-label="Deck do computador ${i + 1}" class="input-field" data-opponent-slot="${i}"><option value="random">Deck aleatório</option>${aiPool.map(d => `<option value="${esc(d.id)}" ${id === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>`).join('');
    }
    for (const control of root.querySelectorAll<HTMLInputElement | HTMLButtonElement>('#oppSel, [data-opponent-slot], #netName, #netCode, #roomCode, #netUrl, [data-join] button, [data-join-room], [data-lobby=rooms-refresh], [data-lobby=library], [data-lobby=create], [data-lobby=import], [data-edit-deck]')) control.disabled = busy || !!waitingRoom;
    const deck = selected(), result = deck && format ? validations.get(key(deck)) : undefined;
    const invalid = !free && !!deck && !!format && (result ? !result.valid : validateDeckLocal(deck, format).status === 'invalid');
    const art = deck && deckArt(deck);
    $('#chosenDeck').innerHTML = `${art ? `<span class="chosen-art" style="background-image:url('${esc(art)}')" aria-hidden="true"></span>` : ''}${!deck ? `<span class="chosen-caption">${esc(formatName(format))}</span>` : ''}<strong>${esc(deck?.name ?? 'Escolha um deck para jogar')}</strong>${deck ? `<span>${result ? result.valid ? 'Verificado pelo servidor' : 'Precisa de ajustes' : deck.builtin ? 'Deck pronto' : 'Seu deck'}</span>` : ''}`;
    const start = $<HTMLButtonElement>('#startMatch');
    start.disabled = !format || !deck || invalid || busy || !!waitingRoom || (joining && !room);
    start.textContent = busy ? 'Preparando…' : free ? 'Abrir mesa livre' : mode === 'ai' ? 'Jogar' : room ? 'Entrar na sala' : joining ? 'Escolha a sala' : 'Criar sala';
    $('#roomInfo').hidden = !room;
    $('#roomInfo').innerHTML = room ? `<p>Sala <strong>${esc(room.code)}</strong> · ${esc(room.players[0]?.name ?? 'Anfitrião')} · ${formatName(room.config.format)} · ${room.config.matchLength === 'bo3' ? 'Melhor de três' : 'Partida única'} · ${room.players.length}/${room.capacity ?? room.config.playerCount ?? 2} jogadores</p><p>${selected() ? 'Para entrar com outro deck, escolha-o e confirme abaixo.' : 'Escolha um deck compatível e confirme abaixo.'}</p><button class="ghost-btn" data-lobby="cancel-lookup">Escolher outra sala</button>` : '';
    if (focusedOpponent !== undefined) root.querySelector<HTMLElement>(`[data-opponent-slot="${CSS.escape(focusedOpponent)}"]`)?.focus({preventScroll: true});
    if (focusId) root.querySelector<HTMLElement>(`[data-${focusAttribute}="${CSS.escape(focusId)}"]`)?.focus({preventScroll: true});
    syncRoomPolling();
  }
  // ---------- Salas públicas ----------
  // Só procura com "Outra pessoa" escolhido, fora de uma sala e com a aba à vista; com a partida na tela, o lobby fica escondido.
  const wantRooms = () => mode === 'net' && netTab === 'join' && !waitingRoom && !room && document.visibilityState === 'visible';
  function syncRoomPolling() {
    if (wantRooms() && !roomsTimer) {
      void loadRooms();
      roomsTimer = setInterval(() => { if (!root.hidden && !busy) void loadRooms(); }, ROOMS_EVERY_MS);
    } else if (!wantRooms() && roomsTimer) { clearInterval(roomsTimer); roomsTimer = undefined; }
  }
  async function loadRooms(announce = false) {
    const request = ++roomsRequest, list = $('#publicRoomList');
    if (publicRooms === null) renderRooms();
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
    const matchConfig = config(), endpoint = url(), playerName = netName(), selectedRoom = room, selectedMode = mode, roomVisibility = visibility, chosenCode = roomCode(), opponentId = oppId, selectedOpponents = commanderOpponents.slice(0, (config().playerCount ?? 2) - 1);
    if (selectedMode === 'net' && !selectedRoom && chosenCode && !ROOM_CODE.test(chosenCode)) { setStatus('O código da sala precisa ter 4 letras ou números.', true); return; }
    setBusy(true); setStatus('Verificando o deck…');
    try {
      const result = await opts.onValidate(deck, matchConfig.format, endpoint);
      validations.set(key(deck), result);
      if (!result.valid) { setStatus(result.issues.map(i => `${i.card ? `${i.card}: ` : ''}${i.message}`).join(' '), true); return; }
      if (selectedMode === 'net') {
        if (selectedRoom) await opts.onJoin(deck, playerName, selectedRoom.code, endpoint);
        else await opts.onHost(deck, playerName, endpoint, matchConfig, roomVisibility, chosenCode);
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
        format = choice.dataset.value === 'others' ? otherFormat() : DECK_FORMATS.find(f => f === choice.dataset.value) ?? 'free'; save('mesa:format', format);
        if (format !== 'commander') save('mesa:otherFormat', format); youId = rememberedDeck(); preflight++; setStatus('');
      } else if (choice.dataset.setting === 'opponent') {
        mode = choice.dataset.value === 'net' ? 'net' : choice.dataset.value === 'free' ? 'free' : 'ai'; save('mesa:mode', mode); room = null; preflight++; setStatus('');
      } else if (choice.dataset.setting === 'visibility') { visibility = choice.dataset.value === 'public' ? 'public' : 'private';
      } else if (choice.dataset.setting === 'players') { playerCount = Number(choice.dataset.value); save('mesa:commanderPlayers', String(playerCount));
      } else { matchLength = choice.dataset.value === 'bo3' ? 'bo3' : 'bo1'; save('mesa:matchLength', matchLength); }
      refresh(); return;
    }
    const tab = target.closest<HTMLButtonElement>('[data-net-tab]');
    if (tab && !tab.disabled) { selectNetTab(tab.dataset.netTab === 'create' ? 'create' : 'join'); return; }
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
  /** Trocar de aba desfaz a sala encontrada pelo código: cada aba tem o seu caminho até o botão de baixo. */
  function selectNetTab(next: NetTab, focus = false) {
    if (next !== netTab) { netTab = next; save('mesa:netTab', netTab); room = null; preflight++; setStatus(''); refresh(); }
    if (focus) root.querySelector<HTMLElement>(`[data-net-tab="${next}"]`)?.focus();
  }
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
    const tab = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-net-tab]');
    if (tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      selectNetTab(e.key === 'Home' ? 'join' : e.key === 'End' ? 'create' : tab.dataset.netTab === 'join' ? 'create' : 'join', true);
      return;
    }
    const menu = (e.target as HTMLElement).closest<HTMLElement>('.tile-menu');
    if (!menu) return;
    const items = [...menu.querySelectorAll<HTMLButtonElement>('button')], at = items.indexOf(e.target as HTMLButtonElement);
    if (e.key === 'Escape') { e.preventDefault(); const button = menu.previousElementSibling as HTMLButtonElement; closeTileMenus(); button.focus(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus(); }
  });
  root.addEventListener('input', e => {
    const target = e.target as HTMLInputElement;
    if (target.id === 'deckSearch') { query = target.value.trim(); refresh(); }
    // Só letras e números, em maiúsculas: o código fica como os outros vão digitar.
    if (target.id === 'roomCode') { target.value = target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); roomCodeHelp(); }
  });
  root.addEventListener('change', e => {
    const target = e.target as HTMLInputElement;
    if (target.id === 'showIncompatible') showIncompatible = target.checked;
    if (target.dataset.opponentSlot !== undefined) { commanderOpponents[Number(target.dataset.opponentSlot)] = target.value; save('mesa:commanderOpponents', JSON.stringify(commanderOpponents)); }
    if (target.id === 'oppSel') { oppId = target.value; save('mesa:opp', oppId); }
    if (target.id === 'netName') { save('mesa:name', target.value.trim()); prefsChanged(); }
    if (target.id === 'netUrl') { save('mesa:forgeUrl', target.value.trim()); room = null; validations.clear(); preflight++; }
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
    void opts.onLookup(code, netURL()).then(info => {
      if (!info.available) throw new Error(info.players.length >= (info.capacity ?? info.config.playerCount ?? 2) ? `A sala ${info.code} já está completa.` : `A partida da sala ${info.code} já começou.`);
      room = info; netTab = 'join'; format = info.config.format; matchLength = info.config.matchLength; playerCount = info.config.playerCount ?? info.capacity ?? 2; youId = rememberedDeck(); setStatus('');
      return true;
    }).catch(error => {
      // Pelo link, a sala que ainda não existe pode ser criada ali: a aba Criar sala já vem com o código.
      if (fromLink && error instanceof RequestError && error.reason === 'room-not-found') { offerLinkRoom(code); return false; }
      setStatus(error instanceof Error ? error.message : 'Não foi possível encontrar a sala.', true); return false;
    }).then(found => {
      setBusy(false);
      // A sala da lista pode ter enchido ou começado nesse meio-tempo: a lista se atualiza.
      if (!found) { if (fromList) void loadRooms(); return; }
      // Com um deck lembrado que serve para o formato da sala, entra direto; senão pede o deck antes.
      const deck = selected(), fits = !!deck && validateDeckLocal(deck, format!).status !== 'invalid';
      // Pelo link, quem nunca jogou em rede escolhe o nome antes: senão entraria na sala como "Jogador".
      const unnamed = fromLink && !$<HTMLInputElement>('#netName').value.trim();
      if (fits && !unnamed) void start();
      else if (unnamed) { setStatus(fits ? `Digite seu nome e toque em Entrar na sala ${room!.code}.` : `Digite seu nome e escolha um deck de ${formatName(format)} para entrar na sala ${room!.code}.`); $('#netName').focus(); }
      else setStatus(`Escolha um deck de ${formatName(format)} para entrar na sala ${room!.code}.`);
    });
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
  const header = mountAppHeader($('.home-top'), {active: 'play', onPlay: () => {}, onDecks: () => { if (!busy && !waitingRoom) opts.onDecks('library', format ?? undefined); }});
  refresh();
  fitSidebar();
  // Os comandantes vêm primeiro: são as capas dos decks, e a lista inteira (milhares de cartas) demora a chegar.
  void fetchByNames(allDecks().flatMap(d => (d.commanders ?? []).map(c => c.name))).then(refresh).catch(() => {})
    .then(() => fetchByNames(allDecks().flatMap(d => [...d.cards, ...(d.sideboard ?? []), ...(d.commanders ?? [])].map(c => c.name)))).then(refresh).catch(() => {});
  return { refresh, setStatus, setBusy, roomSay: (seat, key) => roomLobby.say(seat, key), openRoomLink(code) {
    if (!ROOM_CODE.test(code)) { setStatus('O link da sala está incompleto. Peça o código para quem convidou você.', true); return; }
    if (busy || waitingRoom) return;
    mode = 'net'; netTab = 'join'; room = null;
    $<HTMLInputElement>('#netCode').value = code;
    findRoom(code, false, true);
  }, showRoom(nextRoom) {
    preflight++; waitingRoom = nextRoom;
    if (nextRoom) { mode = 'net'; format = nextRoom.config.format; matchLength = nextRoom.config.matchLength; playerCount = nextRoom.config.playerCount ?? nextRoom.capacity ?? 2; }
    refresh();
  }};
}
