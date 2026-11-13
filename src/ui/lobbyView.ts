import { countEntries, deckSize, FORMAT_LABEL, hasCommandZone, type DeckData, type DeckFormat } from '../decks';
import { FORGE_URL, type RoomInfo } from '../forge/client';
import { esc, pip } from './cardtext';
import { bracketBadgeHTML, CARD_DATA_ERROR, deckArt, deckColors, deckPriceHTML } from './deckStats';
import { bracketLabel, deckBracket, type Bracket } from '../brackets';
import { commanderLineHTML } from './deckFilters';
import { siteFooterHTML } from './siteFooter';
import { ICON_EYE_LOBBY, ICON_MORE, ICON_REFRESH, ICON_PENCIL } from './icons';
import { AI_STYLES } from '../aiStyle';

/** O que a tela inicial desenha a partir do estado: o esqueleto, os cards dos decks e os textos de cada painel. */
export const formatName = (f: DeckFormat | null) => f ? FORMAT_LABEL[f] : 'Escolha o formato';
// Último lugar da prateleira "Meus decks": um card vazio para começar um deck novo.
const NEW_DECK_TILE = '<div class="tile-wrap"><button type="button" class="deck-tile new-deck-tile" data-lobby="create"><span class="new-deck-plus" aria-hidden="true">+</span><span>Criar deck</span></button></div>';

/** O esqueleto da tela inicial: os painéis que `refresh` preenche. */
export function lobbyHTML() {
  return `<div class="lobby library-home"><div class="mat" aria-hidden="true"></div>
    <header class="home-top"></header>
    <main class="home-content"><div class="home-intro"><h1 class="sr-only">Jogar</h1><section class="replay" id="replay" aria-labelledby="replayTitle" hidden><span class="replay-art" id="replayArt" aria-hidden="true"></span><div class="replay-info"><p class="replay-eyebrow">Sua última partida</p><h2 id="replayTitle"></h2><p class="replay-summary" id="replaySummary"></p></div><button type="button" class="arena-btn primary big replay-btn" id="replayStart" data-lobby="start">Jogar de novo</button></section></div>
    <div class="play-layout">
      <button type="button" class="setup-summary" data-lobby="setup-toggle" aria-expanded="false" aria-controls="matchSetup"><span class="setup-summary-text"><small>Partida</small><strong id="setupSummary"></strong></span><span class="setup-summary-action" id="setupSummaryAction" aria-hidden="true">Mudar</span></button>
      <aside class="match-sidebar" aria-label="Configuração da partida">
        <div class="match-setup" id="matchSetup">
        <fieldset class="match-choice format-choice"><legend>Formato</legend><div class="choice-segments" aria-describedby="formatHelp"><button type="button" data-setting="format" data-value="commander">Commander</button><button type="button" data-setting="format" data-value="others" aria-controls="formatOthers">Outros</button></div><div class="choice-segments format-others" id="formatOthers" role="group" aria-label="Outros formatos" hidden><button type="button" data-setting="format" data-value="standard">Standard</button><button type="button" data-setting="format" data-value="pauper">Pauper</button><button type="button" data-setting="format" data-value="sacola50">Sacola 50</button><button type="button" data-setting="format" data-value="oathbreaker">Oathbreaker</button><button type="button" data-setting="format" data-value="precon">Commander Precon</button><button type="button" data-setting="format" data-value="free">Livre</button></div><p class="setup-explanation" id="formatHelp"></p></fieldset>
        <fieldset class="match-choice"><legend id="opponentLegend">Oponente</legend><div class="opponent-cards">
          <button type="button" class="opponent-card" data-setting="opponent" data-value="ai"><span><strong id="aiModeLabel">Computador</strong></span></button>
          <button type="button" class="opponent-card" data-setting="opponent" data-value="net"><span><strong id="netModeLabel">Outra pessoa</strong></span></button>
          <button type="button" class="opponent-card free-card" data-setting="opponent" data-value="free"><span><strong>Mesa livre</strong></span></button>
        </div><p class="setup-explanation" id="freeHelp" hidden>Sem regras automáticas: você compra, vira, desvira e move as cartas como numa mesa de verdade. Para testar o deck sozinho.</p></fieldset>
        <fieldset class="match-choice duration-choice" id="durationChoice"><legend>Partida</legend><div class="choice-segments"><button type="button" data-setting="length" data-value="bo1">Única</button><button type="button" data-setting="length" data-value="bo3">Melhor de três</button></div></fieldset>
        <fieldset class="match-choice player-count-choice" id="playerCountChoice" hidden><legend>Jogadores</legend><div class="choice-segments"><button type="button" data-setting="players" data-value="2">2</button><button type="button" data-setting="players" data-value="3">3</button><button type="button" data-setting="players" data-value="4">4</button></div></fieldset>
        <div class="opponent-choice" id="aiPanel"><label for="oppSel">Deck do computador</label><select id="oppSel" class="input-field"></select></div>
        <div class="opponent-choice ai-style-choice" id="aiStylePanel"><label for="aiStyleSel">Estilo do computador</label><select id="aiStyleSel" class="input-field" aria-describedby="aiStyleHelp">${AI_STYLES.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</select><p class="setup-explanation" id="aiStyleHelp"></p></div>
        <fieldset class="match-choice bot-bracket-choice" id="botBracketChoice" hidden><legend>Bracket máximo dos bots</legend><div class="choice-segments" id="botBracketButtons"></div><p class="setup-explanation" id="botBracketHelp"></p></fieldset>
        <label class="same-series-choice" id="sameSeriesChoice" hidden><input type="checkbox" id="sameSeries"> <span id="sameSeriesLabel">Bots só da série do seu deck</span></label>
        <div id="commanderAiPanel" class="commander-ai-panel" hidden></div>
        <section class="network-setup" id="netPanel" aria-label="Jogar com outra pessoa" hidden>
          <label for="netName">Seu nome<input id="netName" class="input-field" maxlength="24" autocomplete="nickname" placeholder="Jogador"></label>
          <div class="net-tabs-block"><span class="side-label" id="netTabsLabel">Sala</span><div class="choice-segments net-tabs" role="tablist" aria-labelledby="netTabsLabel"><button type="button" role="tab" id="netTabJoin" data-net-tab="join" aria-controls="joinGroup">Entrar numa sala</button><button type="button" role="tab" id="netTabCreate" data-net-tab="create" aria-controls="createGroup">Criar sala</button></div></div>
          <section class="net-group" id="joinGroup" role="tabpanel" aria-labelledby="netTabJoin">
            <section class="public-rooms" id="publicRooms" aria-labelledby="publicRoomsTitle"><div class="public-rooms-head"><h4 id="publicRoomsTitle">Salas públicas</h4><button type="button" class="link-btn" data-lobby="rooms-refresh" aria-label="Atualizar a lista de salas públicas">${ICON_REFRESH}Atualizar</button></div><div id="publicRoomList" aria-busy="false"></div><p class="sr-only" id="publicRoomsStatus" role="status" aria-live="polite"></p></section>
            <form data-join><label for="netCode">Ou digite o código da sala<span class="network-code"><input id="netCode" class="input-field" maxlength="4" autocomplete="off" spellcheck="false" placeholder="ABCD"><button type="submit" class="arena-btn secondary">Entrar</button></span></label></form>
          </section>
          <div class="net-group" id="createGroup" role="tabpanel" aria-labelledby="netTabCreate"><fieldset class="match-choice visibility-choice"><legend>Tipo de sala</legend><div class="choice-segments" aria-describedby="visibilityHelp"><button type="button" data-setting="visibility" data-value="public">Pública</button><button type="button" data-setting="visibility" data-value="private">Privada</button></div><p class="setup-explanation" id="visibilityHelp"></p></fieldset><div class="room-code-choice"><label for="roomCode">Código da sala (opcional)<input id="roomCode" class="input-field" maxlength="4" autocomplete="off" spellcheck="false" placeholder="ABCD" aria-describedby="roomCodeHelp"></label><p class="setup-explanation" id="roomCodeHelp"></p></div></div>
          <details class="net-adv"><summary>Conexão</summary><label for="netUrl">Endereço do servidor</label><input id="netUrl" class="input-field" spellcheck="false" placeholder="${esc(FORGE_URL)}"></details>
          <div id="roomInfo" class="room-info" hidden></div>
        </section>
        </div>
        <div class="match-ready" aria-label="Resumo da partida"><div class="chosen-deck" id="chosenDeck"></div><div class="deck-fit" id="deckFit"><p class="deck-fit-text" id="deckFitText" role="status" aria-live="polite"></p><button type="button" class="link-btn" data-lobby="fit-formats" hidden>Ver os formatos do deck</button></div><button class="arena-btn primary big" id="startMatch" data-lobby="start" disabled>Jogar</button><p id="status" class="lobby-status" role="status" aria-live="polite"></p></div>
      </aside>
      <div class="deck-collection">
        <p class="cards-error" id="cardsError" role="alert" hidden><span>${esc(CARD_DATA_ERROR)}</span> <button type="button" class="ghost-btn" data-lobby="retry-cards">Tentar de novo</button></p>
        <div class="library-toolbar"><label class="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></svg><input id="deckSearch" type="search" placeholder="Buscar um deck" aria-label="Buscar um deck"></label><div id="lobbyColorFilter"></div><label class="incompatible-toggle" id="incompatibleToggle" hidden><input type="checkbox" id="showIncompatible"> Mostrar incompatíveis</label><div id="deckLayoutControl"></div></div>
        <section class="deck-shelf" aria-labelledby="myDecksTitle"><header class="shelf-heading"><div><h2 id="myDecksTitle">Meus decks <span id="personalCount"></span></h2></div><div class="shelf-actions"><button class="arena-btn secondary" data-lobby="library">Gerenciar decks</button></div></header><div id="personalTiles" class="deck-tiles"></div></section>
        <section class="deck-shelf ready-shelf" aria-labelledby="readyDecksTitle"><header class="shelf-heading"><div><h2 id="readyDecksTitle">Decks prontos para a mesa</h2><p id="readyDecksHelp">Escolha um para jogar ou faça a sua própria versão.</p></div></header><div id="readyTiles" class="deck-tiles"></div></section>
      </div>
    </div>
    <section class="room-lobby" id="roomLobby" aria-label="Sala de espera" hidden></section></main>${siteFooterHTML()}</div>`;
}

export interface TileContext {
  selectedId: string;
  inRoom: boolean;
  /** O formato escolhido na tela inicial e o da sala de espera, se houver. */
  format: DeckFormat | null;
  roomFormat?: DeckFormat;
  validity(deck: DeckData): string;
  ptName(name: string): string;
}
/** Os cards dos decks, com o menu de cada um (Ver as cartas, Editar). */
export function deckTilesHTML(decks: DeckData[], ctx: TileContext) {
  const { selectedId, inRoom, format, ptName } = ctx;
  return decks.map(d => {
    // Com o selo do formato, a etiqueta "Livre" (todo deck vale no Livre) só repetiria a informação.
    const formatTag = d.builtin && d.format && !hasCommandZone(d.format) ? FORMAT_LABEL[d.format] : d.precon && format !== 'precon' && ctx.roomFormat !== 'precon' ? 'Precon' : '';
    const art = deckArt(d), on = selectedId === d.id, bracket = deckBracket(d), colors = deckColors(d), validity = ctx.validity(d), label = formatTag && validity === 'Livre' ? '' : validity;
    return `<div class="tile-wrap${!d.builtin ? ' personal-tile' : ''}"><button type="button" class="deck-tile${on ? ' on' : ''}" data-deck="${esc(d.id)}" aria-pressed="${on}" aria-label="Escolher ${esc(d.name)}${bracket ? `, ${bracketLabel(bracket)}` : ''}"><span class="tile-cover"><span class="tile-art"${art ? ` style="background-image:url('${esc(art)}')"` : ''}></span>${colors.length ? `<span class="tile-colors">${colors.map(pip).join('')}</span>` : ''}</span><span class="tile-check${on ? '' : ' empty'}" aria-hidden="true">${on ? '✓' : ''}</span><span class="tile-info"><span class="tile-name">${esc(d.name)}</span>${commanderLineHTML(d, ptName, 'tile-commander')}<span class="tile-meta"><span>${deckSize(d) + (hasCommandZone(d.format) ? countEntries(d.commanders ?? []) : 0)} cartas</span>${deckPriceHTML(d, 'tile-price', false)}${bracketBadgeHTML(d, 'tile-format')}${formatTag ? `<span class="tile-format">${esc(formatTag)}</span>` : ''}</span>${label ? `<span class="tile-validity">${esc(label)}</span>` : ''}</span></button><button type="button" class="tile-more" data-tile-menu="${esc(d.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="Mais opções de ${esc(d.name)}">${ICON_MORE}</button><div class="tile-menu" role="menu" hidden><button type="button" role="menuitem" data-peek="${esc(d.id)}">${ICON_EYE_LOBBY}Ver as cartas</button>${!d.builtin && !inRoom ? `<button type="button" role="menuitem" data-edit-deck="${esc(d.id)}">${ICON_PENCIL}Editar</button>` : ''}</div></div>`;
  }).join('');
}
/** Precons agrupados por série, a mais recente primeiro, com o ano ao lado do nome. */
export function preconGroupsHTML(decks: DeckData[], ctx: TileContext) {
  const series = [...new Map(decks.map(d => [d.precon!.series, d.precon!])).values()].sort((a, b) => b.year - a.year || a.series.localeCompare(b.series, 'pt'));
  return series.map(p => `<section class="precon-series" aria-label="${esc(p.series)}"><h3 class="precon-series-title">${esc(p.series)} <span>${p.year}</span></h3><div class="deck-tiles">${deckTilesHTML(decks.filter(d => d.precon!.series === p.series), ctx)}</div></section>`).join('');
}
/** A prateleira "Meus decks": os cards e o de criar, ou o que fazer quando ela está vazia. */
export function personalShelfHTML(shown: DeckData[], owned: number, ctx: TileContext & { filtering: boolean }) {
  return shown.length ? deckTilesHTML(shown, ctx) + NEW_DECK_TILE : !owned ? `<div class="personal-empty"><div class="empty-cards" aria-hidden="true"><i></i><i></i><i></i></div><div><h3>Você ainda não tem nenhum deck.</h3><p>Comece com suas cartas favoritas ou importe uma lista que você já gosta de jogar.</p><button class="arena-btn primary" data-lobby="create">Criar meu primeiro deck</button></div></div>` : `<div class="shelf-empty"><p>${ctx.filtering ? 'Nenhum dos seus decks corresponde à busca e às cores.' : `Você ainda não tem um deck válido para ${formatName(ctx.format)}.`}</p><button class="ghost-btn" data-lobby="${ctx.filtering ? 'clear' : 'incompatible'}">${ctx.filtering ? 'Limpar filtros' : 'Mostrar decks incompatíveis'}</button></div>`;
}
/** Os botões do bracket máximo dos bots: "Qualquer" e os brackets que algum deck pronto tem. */
export function botBracketButtonsHTML(offered: Bracket[], max: Bracket | null, disabled: boolean) {
  return (['any', ...offered] as const).map(v => `<button type="button" data-bot-bracket="${v}" aria-pressed="${v === 'any' ? max === null : max === v}"${disabled ? ' disabled' : ''}${v === 'any' ? '' : ` aria-label="Até o ${bracketLabel(v)}"`}>${v === 'any' ? 'Qualquer' : v}</button>`).join('');
}
export function botBracketHelp(o: { empty: boolean; series: boolean; max: Bracket | null; chosen: boolean; mine: Bracket | undefined }) {
  return o.empty ? `Nenhum deck pronto cabe nessa escolha. Suba o máximo${o.series ? ' ou desmarque a série' : ''}.`
    : o.max === null ? 'Os bots jogam com decks de qualquer bracket.'
    : `Os bots jogam com decks até o ${bracketLabel(o.max)}${!o.chosen && o.mine === o.max ? ', o do seu deck' : ''}.`;
}
/** Um seletor de deck para cada computador do Commander. */
/** As opções de deck de um computador: os prontos e, se houver, os do jogador num grupo próprio ("Meus decks"). */
function botDeckOptionsHTML(pool: DeckData[], mine: DeckData[], selected?: string) {
  const options = (decks: DeckData[]) => decks.map(d => `<option value="${esc(d.id)}"${selected === d.id ? ' selected' : ''}>${esc(d.name)}</option>`).join('');
  return mine.length ? `<optgroup label="Decks prontos">${options(pool)}</optgroup><optgroup label="Meus decks">${options(mine)}</optgroup>` : options(pool);
}
export function commanderAiPanelHTML(slots: string[], pool: DeckData[], mine: DeckData[] = []) {
  return '<p class="commander-ai-heading side-label">Decks dos computadores</p>' + slots.map((id, i) => `<label class="opponent-choice" for="commanderOpp${i}"><span class="computer-seat-number" aria-hidden="true">${i + 1}</span><select id="commanderOpp${i}" aria-label="Deck do computador ${i + 1}" class="input-field" data-opponent-slot="${i}"><option value="random">Deck aleatório</option>${botDeckOptionsHTML(pool, mine, id)}</select></label>`).join('');
}
export const opponentOptionsHTML = (pool: DeckData[], mine: DeckData[] = []) => '<option value="random">Aleatório entre os compatíveis</option>' + botDeckOptionsHTML(pool, mine);
/** O deck escolhido, junto do botão Jogar. `result`: o que o servidor disse dele, se já disse. */
export function chosenDeckHTML(deck: DeckData | undefined, o: { format: DeckFormat | null; net: boolean; result?: { valid: boolean } }) {
  const art = deck && deckArt(deck);
  return `${art ? `<span class="chosen-art" style="background-image:url('${esc(art)}')" aria-hidden="true"></span>` : ''}${!deck ? `<span class="chosen-caption">${esc(formatName(o.format))}</span>` : ''}<strong>${esc(deck?.name ?? (o.net ? 'Sem deck por enquanto' : 'Escolha um deck para jogar'))}</strong>${!deck && o.net ? '<span>Escolha um aqui ou dentro da sala</span>' : ''}${deck ? `<span>${o.result ? o.result.valid ? 'Verificado pelo servidor' : 'Precisa de ajustes' : deck.builtin ? 'Deck pronto' : 'Seu deck'}</span>` : ''}`;
}
/** A sala encontrada pelo código, antes de entrar. */
export function roomInfoHTML(room: RoomInfo | null, hasDeck: boolean) {
  return room ? `<p>Sala <strong>${esc(room.code)}</strong> · ${esc(room.players[0]?.name ?? 'Anfitrião')} · ${formatName(room.config.format)} · ${room.config.matchLength === 'bo3' ? 'Melhor de três' : 'Partida única'} · ${room.players.length}/${room.capacity ?? room.config.playerCount ?? 2} jogadores</p><p>${hasDeck ? 'Para entrar com outro deck, escolha-o e confirme abaixo.' : 'Escolha um deck compatível ou entre sem deck e escolha lá dentro.'}</p><button class="ghost-btn" data-lobby="cancel-lookup">Escolher outra sala</button>` : '';
}
/** O que o leitor de tela anuncia depois de atualizar a lista de salas públicas (count -1: a lista não veio). */
export function publicRoomsStatusText(count: number, live: number) {
  const liveText = !live ? '' : live === 1 ? ' Uma partida em andamento para assistir.' : ` ${live} partidas em andamento para assistir.`;
  return count < 0 ? 'Não foi possível ver as salas agora.' : (count === 0 ? (live ? 'Nenhuma sala com lugar.' : 'Nenhuma sala pública aberta.') : count === 1 ? 'Uma sala pública aberta.' : `${count} salas públicas abertas.`) + liveText;
}
/** O texto do botão de baixo, conforme o oponente e a sala. */
export function startLabel(o: { busy: boolean; free: boolean; ai: boolean; room: boolean; joining: boolean }) {
  return o.busy ? 'Preparando…' : o.free ? 'Abrir mesa livre' : o.ai ? 'Jogar' : o.room ? 'Entrar na sala' : o.joining ? 'Escolha a sala' : 'Criar sala';
}
/** A prateleira de decks dentro da sala de espera: a explicação, e os seus decks e os prontos que servem no formato dela. */
export function roomDecksHelp(choosing: boolean, ready: boolean, format: DeckFormat) {
  return choosing ? 'Escolhendo o deck…'
    : ready ? `Decks que servem para ${formatName(format)}. Toque em outro para trocar até a partida começar.`
    : `Escolha um deck de ${formatName(format)} para jogar. A partida só começa quando todos tiverem deck.`;
}
/** `query` e `roomFormat` explicam a prateleira vazia: nada na busca, ou nenhum deck no formato da sala. */
export function roomDeckTilesHTML(mine: DeckData[], ready: DeckData[], ctx: TileContext, empty: { query: string; roomFormat: DeckFormat }) {
  const shelf = (title: string, decks: DeckData[]) => decks.length ? `<h3 class="room-decks-group">${title}</h3><div class="deck-tiles">${deckTilesHTML(decks, ctx)}</div>` : '';
  return mine.length || ready.length
    ? shelf('Meus decks', mine) + shelf('Decks prontos', ready)
    : `<p class="shelf-empty">${empty.query ? 'Nenhum deck corresponde à busca.' : `Nenhum deck serve para ${formatName(empty.roomFormat)}.`}</p>`;
}
export const ROOM_DECKS_SHELF = `<header class="shelf-heading"><div><h2 id="roomDecksTitle">Seu deck</h2><p id="roomDecksHelp"></p></div><label class="search room-deck-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></svg><input id="roomDeckSearch" type="search" placeholder="Buscar um deck" aria-label="Buscar um deck para esta sala"></label></header><div id="roomDeckTiles"></div>`;
