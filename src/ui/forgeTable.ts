import type { FState, ForgeClient, NoticeDetail } from '../forge/client';
import { KEYS } from '../storage';
import { createMotion } from './motion';
import { hideCardPreview } from './cardInspector';
import { type HistoryNames } from './historyLog';
import './removalNotice.css';
import { PresentationTimeline, stateWithFrame } from './presentationTimeline';
import { createGameAudio, tableMoment } from './audio';
import { PassLevelPreference } from './passLevel';
import { OpponentStopsPreference } from './opponentStops';
import { createTurnNotice } from './turnNotice';
import { createTurnBuzz } from './turnBuzz';
import { watchRowEdges } from './cardRow';
import { type DiagnosticEntry } from './matchDiagnostics';
import { fixPossessives } from './forgeText';
import { VERSION } from './changelog';
import { attachHandDrag, moveGroupInHand, moveInHand } from './handDrag';
import { exileShelfCards, validBlockSelection } from './playContext';
import { applyOpeningPresentation, suppressOpeningPreview } from './openingPresentation';
import './proliferate.css';
import { hasCommandZone } from '../decks';
import './undo.css';
import './focusView.css';
import './skipVote.css';
import './combatForecast.css';
import './choiceScreens.css';
import './choiceFilters.css';
import './libraryChoice.css';
import './piles.css';
import './combatDamage.css';
import './gameplay.css';
import './permanentEffects.css';
import './phaseHud.css';
import './gameOptions.css';
import './decisionPrompt.css';
import { tablePlayers } from './commanderTable';
import './commanderTable.css';
import './arenaModals.css';
import './cardStyle.css';
// Os temas (e o temas.css deles) continuam entrando aqui, na mesma posição da cascata de antes.
import './temas';
import './matchBar.css';
import './cardVote.css';
import './revealedHand.css';
import './upkeepMana.css';
import './awaitingDecision.css';
import './waitAlert.css';
import './duelPiles.css';
import './tableMoves.css';
import './handPeek.css';
import './tableHeaders.css';
import './combatPose.css';
import { installWheelSideways } from './wheelSideways';
import { newMatchState } from './tableState';
import { tableShellHTML } from './tableShell';
import { eventDescription as describeEvent, frameCard, targetsDescription as describeTargets, type EventView } from './eventText';
import { createCardFaces, ptOf, label } from './cardFaces';
import { fitLoneRows, fitRowWidths, layoutExileShelf, layoutCardDecision, layoutCounters, layoutStack, syncSeatScroll } from './tableLayout';
import { drawCombatArrows } from './tableArrows';
import { applyCombatPose } from './combatPose';
import { exileShelfHTML } from './zoneView';
import { outsideHand } from './handView';
import { passLevelVisible, type ActionView } from './actionPanel';
import { createAttackChoice } from './attackChoice';
import { createTableClocks } from './tableClocks';
import { createPassMenu, createStopMenu } from './passMenus';
import { createHistoryPanel } from './historyPanel';
import { createRemovalQueue } from './removalQueue';
import { createTableSettings } from './tableSettings';
import { createErrorsPanel } from './errorsPanel';
import { createAwaitingCallout, createToasts, createTurnBanner } from './tableNotices';
import type { TableCtx } from './tableContext';
import { findCard as findCardIn, fixForgeText, manaTone } from './tableCards';
import { createPresentationQueue } from './tablePresentation';
import { createModalFocus } from './tableModal';
import { createOpponentFocus } from './opponentFocus';
import { createTableHand } from './tableHand';
import { createTablePhases } from './tablePhases';
import { createTableSeats } from './tableSeats';
import { createActionBox } from './tableActionBox';
import { createTableQuestion } from './tableQuestion';
import { createTableStack } from './tableStack';
import { createTableZone } from './tableZone';
import { createTableOverlay } from './tableOverlay';
import { createTableTopBar } from './tableTopBar';
import { attachPreviewInput, createCardPreview } from './tablePreview';
import { attachTableKeyboard } from './tableKeyboard';
import { createInputActions } from './tableInputActions';
import { createUiActions } from './tableUiActions';
import { attachTableClicks } from './tableClicks';
import { finder } from './dom';

export interface ForgeTableOptions {
  onExit(): void;
  onRematch(): void;
  /** Sala de teste do Laboratório: fecha a sala para os dois lados e volta ao Laboratório. */
  onLabClose?(): void;
  /** "Enviar sugestão ou erro" no menu, "Relatar este erro" no painel de erros (com o relatório do painel) e "Relatar um problema" no fim do jogo. */
  onFeedback?(request: { kind: 'sugestao' | 'erro'; attach?: boolean; diagnostics?: string }): void;
  /** "Baixar gravação" no painel de erros (desenvolvimento): o mesmo arquivo que o relato envia. */
  onDownloadRecording?(): Promise<void>;
  /** Cada erro registrado no painel, para a gravação da partida. */
  onDiagnostic?(entry: DiagnosticEntry): void;
}

export interface ForgeTableView {
  attach(client: ForgeClient, portraits: (string | undefined)[]): void;
  render(): void;
  notice(text: string, error?: boolean, detail?: NoticeDetail): void;
  /** Conexão caiu e o navegador está tentando voltar sozinho. */
  reconnecting(attempt: number): void;
  /** reason substitui a explicação padrão (por exemplo, partida aberta em outra janela). */
  disconnected(reason?: string): void;
  /** Ação recusada pela ponte sem aviso: só vai para o painel "Erros da partida". */
  diagnostic(d: { code: string; action?: string; text: string }): void;
}

/** Ferramentas de desenvolvimento na mesa: no `npm run dev` ou com localStorage `KEYS.dev` = "1". */
function devTools() {
  try { return import.meta.env?.DEV === true || localStorage.getItem(KEYS.dev) === '1'; } catch { return false; }
}

/**
 * A mesa da partida. Este arquivo liga as partes (cada uma no seu arquivo `table*.ts`, com o que usa declarado em
 * `tableContext.ts`) e desenha a mesa na ordem certa (`renderTable`); o estado de cada parte fica dentro dela.
 */
export function createForgeTableView(root: HTMLElement, opts: ForgeTableOptions): ForgeTableView {
  // Vibração na sua vez (S19); criada antes do HTML porque a opção só aparece onde o aparelho vibra.
  const turnBuzz = createTurnBuzz();
  root.innerHTML = tableShellHTML({ feedback: !!opts.onFeedback, download: !!opts.onDownloadRecording && devTools(), buzz: turnBuzz.supported });

  const $ = finder(root);
  watchRowEdges(root);
  let client: ForgeClient | null = null;
  let portraits: (string | undefined)[] = [undefined, undefined];
  // Estado da partida aberta (tableState.ts): attach() troca o objeto inteiro.
  let match = newMatchState();
  // Relógios do turno e da partida e o alerta de espera demorada (tableClocks.ts).
  const clocks = createTableClocks(root, { state: () => client?.state, presenting: () => !!timeline.current, disconnected: () => match.disconnected, announce: text => announce(text), cue: volume => audio.cue('turn-self', volume) });
  const showBanner = createTurnBanner(root);
  // Momentos que já tocaram (resultado, cada mão inicial): voltar à mesa não repete o som.
  const playedMoments = new Set<string>();
  const motion = createMotion(root);
  const timeline = new PresentationTimeline();
  const audio = createGameAudio();
  // Nível de passar automaticamente (Opções e o selo junto dos botões); quem passa é a ponte.
  const passLevel = new PassLevelPreference(message => { if (client?.connected && !match.disconnected) client.send(message); });
  // Etapas do turno dos oponentes em que a ponte segura a prioridade para você.
  const opponentStops = new OpponentStopsPreference(message => { if (client?.connected && !match.disconnected) client.send(message); });
  const turnNotice = createTurnNotice();
  // Fim da partida: os nomes das permanentes (para ver quem transformou) e a mão inicial já distribuída.
  let fieldNames = new Map<number, string>(), fieldNamesMatch = '';
  let dealtHand = '', payingBefore = false;
  // Opções da partida (tableSettings.ts): som, jogo e aparência, com as preferências deste aparelho.
  const settings = createTableSettings(root, { audio, passLevel, turnNotice, turnBuzz, connected: () => !!client?.connected && !match.disconnected,
    passLevelChanged: () => { if (passMenu.open) passMenu.sync(); }, closeMenus: () => { setMenu(false, true); setLog(false); }, syncModal,
    hasState: () => !!client?.state, render: () => render(), rerender: () => renderTable(false) });
  const prefs = settings.prefs;
  let previousAnnouncement = '';
  const renderedContent = new WeakMap<HTMLElement, { html: string; first: ChildNode | null }>();
  const setHTML = (el: HTMLElement, html: string) => {
    const previous = renderedContent.get(el);
    if (previous?.html === html && previous.first === el.firstChild) return;
    el.innerHTML = html; renderedContent.set(el, { html, first: el.firstChild });
  };

  /** O que as partes da mesa compartilham (tableContext.ts); as partes criadas mais abaixo são lidas na hora do uso. */
  const ctx: TableCtx = {
    root, $, setHTML, opts, timeline, motion, audio, prefs,
    client: () => client,
    state: () => client?.state,
    match: () => match,
    portraits: () => portraits,
    frame: () => presentation.frame(),
    findCard: (id, withPrompt = true) => findCardIn(client?.state, presentation.frame(), id, withPrompt),
    playerName: id => id === client?.state?.you ? 'você' : client?.state?.players.find(p => p.id === id)?.name ?? `Jogador ${id}`,
    cardName: id => { const c = ctx.findCard(id, false); return c ? label(c) : 'Comandante'; },
    face: (...args) => faces.face(...args),
    faceStyle: (...args) => faces.faceStyle(...args),
    image: (...args) => faces.image(...args),
    eventDescription: (event, detailed = false) => describeEvent(eventView, event, detailed),
    targetsDescription: targets => describeTargets(eventView, targets),
    actionView: () => actionView(),
    announce: text => announce(text),
    render: () => render(),
    renderTable: () => renderTable(false),
    stopPresentation: () => presentation.stop(),
    syncModal: () => syncModal(),
    renderedInputIsCurrent: el => {
      const gen = el.closest<HTMLElement>('[data-gen]')?.dataset.gen;
      return !!client?.state && gen !== undefined && Number(gen) === client.state.input.gen && !match.disconnected;
    },
    showPreview: (c, trigger, pinned, at) => preview.show(c, trigger, pinned, at),
    cardFromElement: el => preview.cardFromElement(el),
    leaveOverlay,
  };
  const { findCard, playerName } = ctx;

  // Menus do nível de passar e das paradas no turno dos oponentes (passMenus.ts).
  const passMenu = createPassMenu(root, { state: () => client?.state, visible: s => passLevelVisible(actionView(), s), passLevel, setHTML });
  // Dá para marcar paradas quando a ponte oferece a opção e você está jogando.
  const stops = createStopMenu(root, { stops: opponentStops, hasState: () => !!client?.state, render: () => render(),
    editable: () => !!client?.connected && !match.disconnected && opponentStops.supported && !!client.state && !client.state.gameOver && !client.state.spectating });
  // A janela grande do centro (sideboard, resultado, conexão caída) e a escuta da caixa do resumo do jogo.
  const overlay = createTableOverlay(ctx);
  function setMenu(open: boolean, restore = false) {
    $('#fMenu').hidden = !open;
    // Toda vez que o menu abre, a linha do rodapé volta a mostrar a versão da mesa.
    const version = $('#fMenu').querySelector<HTMLElement>('[data-ui="version"]');
    if (open && version) { version.setAttribute('aria-pressed', 'false'); version.textContent = `Mesa de Duelo ${VERSION}`; }
    const trigger = root.querySelector<HTMLElement>('[data-ui="menu"]')!;
    trigger.setAttribute('aria-expanded', String(open));
    if (open) $('#fMenu').querySelector<HTMLElement>('button:not([hidden])')?.focus({ preventScroll: true });
    else if (restore) trigger.focus({ preventScroll: true });
  }
  function setLog(open: boolean, restore = false) {
    $('#fLogDrawer').hidden = !open;
    root.querySelector('[aria-controls="fLogDrawer"]')?.setAttribute('aria-expanded', String(open));
    if (open) { renderLog(); setMenu(false); errors.set(false); $('#fLogDrawer').querySelector<HTMLElement>('button')?.focus({ preventScroll: true }); }
    else if (restore) root.querySelector<HTMLElement>('[data-ui="menu"]')?.focus({ preventScroll: true });
  }
  // Gaveta "Erros da partida" (errorsPanel.ts).
  const errors = createErrorsPanel(root, { state: () => client?.state, onDiagnostic: entry => opts.onDiagnostic?.(entry), setHTML,
    onDownloadRecording: opts.onDownloadRecording && (() => opts.onDownloadRecording!()), closeOthers: () => { setMenu(false); setLog(false); } });
  settings.sync();
  // A mão (tableHand.ts) e o arraste para jogar ou arrumar as cartas (handDrag.ts).
  const hand = createTableHand({ ...ctx, drawing: () => presentation.drawing() });
  const handDrag = attachHandDrag(root, {
    state: () => match.disconnected || question.minimized() ? null : client?.state,
    canReorder: () => !match.disconnected && !!client?.state && !client.state.watching,
    beforeDrag: () => hideCardPreview(true),
    play: action => { presentation.stop(); client?.send(action); },
    reorder: (id, to) => { const groups = hand.groups(); const next = groups ? moveGroupInHand(groups, id, to) : moveInHand(match.handOrder, id, to); if (next) { match.handOrder = next; renderTable(false); } },
  });

  // A janela da frente e o foco que sobrevive ao redesenho (tableModal.ts).
  const modal = createModalFocus({ root, $, questionMinimized: () => question.minimized() });
  function syncModal() { modal.sync(); }
  function announce(message: string) {
    if (message === previousAnnouncement) return;
    previousAnnouncement = message;
    $('#fAnnouncement').textContent = message;
  }

  // A fila de apresentação (tablePresentation.ts): cada jogada nova mostrada um passo de cada vez.
  const presentation = createPresentationQueue(ctx);
  /** As setas de combate e de alvo, na mesa como a apresentação a mostra agora. */
  function drawArrows(s: FState) { const visual = stateWithFrame(s, presentation.frame()); applyCombatPose(root, visual); drawCombatArrows(root, visual); stack.drawTargetArrows(visual); }
  root.querySelectorAll<HTMLElement>('.row').forEach(row => {
    row.tabIndex = 0;
    row.setAttribute('aria-label', `${row.closest('.opp') ? 'Campo do oponente' : 'Seu campo'}: ${row.classList.contains('lands') ? 'terrenos e outros permanentes' : 'criaturas'}. Role para ver todas as cartas.`);
    row.addEventListener('scroll', () => { if (client?.state) drawArrows(client.state); }, { passive: true });
  });

  installWheelSideways(root);
  $('#fOpponents').addEventListener('scroll', () => { syncSeatScroll(root); if (client?.state) drawArrows(client.state); }, true);

  // ---------- Rostos das cartas e imagens do Scryfall (cardFaces.ts) ----------
  const faces = createCardFaces(root, { cardStyle: () => prefs.cardStyle, sleeve: playerId => client?.state?.players.find(p => p.id === playerId)?.sleeve, rerender: () => renderTable(false) });
  const { image, face } = faces;

  /** As prateleiras do grimório, do cemitério e do exílio ao lado da mão, cada uma com até duas cartas à vista. */
  function renderExileShelf(s: FState) {
    const cards = exileShelfCards(s), outside = outsideHand(s);
    const top = outside.filter(o => s.players.some(p => p.libraryTop?.id === o.c.id)).length, gy = outside.length - top;
    const shelf = $('#fExileShelf');
    const arena = root.querySelector<HTMLElement>('.forge')!;
    const any = cards.length + outside.length > 0;
    shelf.hidden = !any;
    arena.classList.toggle('has-exile-shelf', any);
    arena.style.setProperty('--exile-visible', String(Math.min(2, cards.length) + Math.min(2, gy) + Math.min(2, top)));
    arena.style.setProperty('--shelf-groups', String(Number(!!cards.length) + Number(!!gy) + Number(!!top)));
    setHTML(shelf, exileShelfHTML(s, c => face(c, 'normal'), cards, outside));
  }

  // A largura dos selos muda quando a fonte termina de carregar.
  document.fonts?.addEventListener('loadingdone', () => { if (!root.hidden) layoutCounters(root); });
  window.addEventListener('resize', () => {
    const s = client?.state;
    attack.syncPanelShift(); hand.placeControls();
    if (s?.type === 'state' && !root.hidden) { fitLoneRows(root); fitRowWidths(root); layoutCounters(root); layoutExileShelf(root); layoutCardDecision(root); layoutStack(root); syncSeatScroll(root); drawArrows(s); }
  });

  /** Celular: a mesa é estreita e os terrenos virados, que ocupam a largura de uma carta deitada, vão para um monte só. */
  const compactTable = matchMedia('(max-width: 760px), (max-height: 500px)');
  compactTable.addEventListener('change', () => { if (client?.state?.type === 'state' && !root.hidden) render(); });

  /** Saída animada de um modal respondido: uma cópia sem clique some aos poucos no lugar dele. */
  function leaveOverlay(el: HTMLElement) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('id');
    ghost.querySelectorAll('[id]').forEach(child => child.removeAttribute('id'));
    ghost.classList.add('overlay-leaving');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    el.after(ghost);
    ghost.addEventListener('animationend', event => { if (event.target === ghost) ghost.remove(); });
    window.setTimeout(() => ghost.remove(), 600);
  }

  // As partes da mesa, cada uma com o próprio estado.
  const focus = createOpponentFocus(ctx);
  /** O que a caixa de ação precisa da mesa (actionPanel.ts), lido na hora de cada desenho. */
  const actionView = (): ActionView => ({ findCard, playerName, observing: match.observing, disconnected: match.disconnected,
    clickLocked: gen => inputs.locked(gen),
    passLevel: passLevel.value, passLevelSupported: passLevel.supported, passingTurn: passLevel.passingTurn, passPending: passLevel.pending !== null, passMenuOpen: passMenu.open,
    attackAll: attack.allGen !== null, attackSelecting: attack.selected.size, attackBusy: attack.queue.busy });
  // Escolha de ataque (attackChoice.ts): criaturas marcadas, defensor fixado, "atacar com tudo", a fila e o painel "Atacar quem?".
  const attack = createAttackChoice(root, { client: () => client, disconnected: () => match.disconnected, findCard: id => findCard(id), notice, stopPresentation: () => presentation.stop(), render: () => renderTable(false) });
  const seats = createTableSeats({ ...ctx, attack, focus, compact: () => compactTable.matches });
  const zone = createTableZone(ctx);

  /** Frases dos eventos (eventText.ts), com os nomes da mesa. */
  const eventView: EventView = { state: () => client?.state, label, findCard: id => findCard(id), ptName: name => ptOf(name)?.name };

  const historyNames: HistoryNames = {
    player: id => id === undefined ? 'Jogador' : client?.state?.players.find(p => p.id === id)?.name ?? 'Jogador',
    card: event => event.card?.name && !event.card.faceDown ? label(event.card) : undefined,
    cardById: (id, event) => frameCard(id, event) ?? findCard(id, false),
    label,
    describe: event => ctx.eventDescription(event, true),
  };
  // Histórico (historyPanel.ts) e as janelas de remoção feitas por outro jogador (removalQueue.ts).
  const historyLog = createHistoryPanel(root, { timeline, names: historyNames, you: () => client?.state?.you, image, setHTML });
  const removals = createRemovalQueue(root, { timeline, names: historyNames, face, state: () => client?.state, setHTML, leave: leaveOverlay, syncModal,
    blocked: s => s.gameOver || match.disconnected || (!!s.question && !question.minimized()) || !$('#fOverlay').hidden || !$('#fZone').hidden || match.stackGalleryOpen });
  /** Histórico agrupado (Menu → Registro): só é montado com a gaveta aberta. */
  function renderLog() { historyLog.render(); }
  const stack = createTableStack({ ...ctx, modal, renderLog });

  const inputs = createInputActions({ ...ctx, attack, passMenu });
  const question = createTableQuestion({ ...ctx, modalStart: el => modal.start(el) });

  // ---------- Desenho ----------
  function render() { renderTable(true); }

  const renderAwaiting = createAwaitingCallout(root, () => audio.cue('turn-self', .5));
  const phases = createTablePhases({ ...ctx, opponentStops, stops, clocks, handAutoButton: hand.autoButton });
  const actionBox = createActionBox({ ...ctx, attack, settings, renderAwaiting });
  const topBar = createTableTopBar({ ...ctx, showBanner, turnBuzz });
  // Textos do Forge (pedido, pergunta, opções): o possessivo em inglês ("você's grimório") vira português. Repetir não muda nada.
  const playerNames = () => client?.state?.players.map(p => p.name) ?? [];

  /** Desenha a mesa inteira, região por região; `ingest` lê antes os eventos novos do estado (e pode começar um passo da apresentação). */
  function renderTable(ingest: boolean) {
    const s = client?.state;
    if (!s || s.type !== 'state') return;
    fixForgeText(s);
    passLevel.observe(s.preferences, !!client?.connected && !match.disconnected);
    opponentStops.observe(s.preferences, !!client?.connected && !match.disconnected); stops.sync();
    if (s.spectating) { turnNotice.reset(); turnBuzz.reset(); } else { turnNotice.observe(s); turnBuzz.observe(s); }
    const savedFocus = modal.snapshot();
    const scrollPositions = new Map([...root.querySelectorAll<HTMLElement>('.row, .hand, .exile-shelf-track, .table-seat > .field')].map(el => [el.id, { left: el.scrollLeft, top: el.scrollTop }]));
    const silently = presentation.silent();
    if (ingest && presentation.ingest(s, silently, st => removals.collect(st))) return;
    if (!validBlockSelection(s, match.selectedBlocker)) match.selectedBlocker = null;
    const visual = stateWithFrame(s, presentation.frame());
    seats.trackCounters(visual.players);
    attack.sync(s);
    const { me, opponents: seated } = tablePlayers(visual);
    // Quem desistiu sai da mesa: o Forge já tirou as cartas dessa pessoa do jogo, e o assento vazio só ocuparia espaço.
    const conceded = new Set((s.room?.players ?? []).filter(p => p.conceded && p.playerId !== undefined).map(p => p.playerId!));
    const remaining = seated.filter(p => !conceded.has(p.id));
    const opponents = remaining.length ? remaining : seated;
    const opp = opponents[0];
    const multiplayer = visual.players.length > 2;
    const arena = root.querySelector<HTMLElement>('.arena')!;
    arena.classList.toggle('multiplayer', multiplayer);
    arena.classList.toggle('commander-game', hasCommandZone(s.config?.format));
    arena.style.setProperty('--opponent-count', String(opponents.length));
    if (!me || !opp) return;
    if (s.input.attacking || s.input.blocking || s.input.selection) motion.cancelPresentation();
    motion.capture();

    const seatNotice = seats.render(s, visual, { me, opp, opponents, multiplayer });
    hand.render(s, me);
    renderExileShelf(s);
    stack.render();
    phases.render(visual, me, opp, opponents, multiplayer);
    const moment = tableMoment(s);
    if (moment && !playedMoments.has(moment.key)) { playedMoments.add(moment.key); audio.cue(moment.cue, .9); }
    actionBox.render(s, me, seatNotice);
    question.render();
    topBar.banner(s);
    seats.countLife();
    topBar.bars(s, multiplayer);
    overlay.render(s);

    zone.sync(s);
    removals.sync(s);
    root.querySelectorAll<HTMLElement>('[data-fid],[data-pid],[data-mana]').forEach(el => { el.dataset.gen = String(el.closest('.field,.avatar-slot') ? visual.input.gen : s.input.gen); });
    // Covered identical copies stay reachable through the group chooser, without dozens of duplicate Tab stops.
    root.querySelectorAll<HTMLElement>('.field .stack').forEach(pile => {
      const slots = [...pile.querySelectorAll<HTMLElement>(':scope > .slot')];
      slots.slice(0, -1).forEach(slot => slot.querySelectorAll<HTMLElement>('[tabindex],.inspect-card').forEach(el => { el.tabIndex = -1; }));
    });
    root.querySelectorAll<HTMLElement>('.row, .hand, .exile-shelf-track, .table-seat > .field').forEach(el => { const position = scrollPositions.get(el.id); el.scrollLeft = position?.left ?? 0; el.scrollTop = position?.top ?? 0; });
    applyOpeningPresentation(root, s);
    modal.restore(savedFocus);
    syncModal();
    layoutCounters(root);
    layoutExileShelf(root);
    layoutCardDecision(root);
    layoutStack(root);
    syncSeatScroll(root);
    applyCombatPose(root, visual);
    drawCombatArrows(root, visual);
    playMotion(s, visual, silently);
    stack.drawTargetArrows(visual);
    match.lastDamage = new Map(s.players.flatMap(p => p.battlefield.map(c => [c.id, c.damage ?? 0] as [number, number])));
  }

  /** O que anima depois do desenho: as cartas que mudaram de lugar, a mana do pagamento, quem transformou e a mão inicial. */
  function playMotion(s: FState, visual: FState, silently: boolean) {
    motion.play({ silent: silently || suppressOpeningPreview(s) || !!s.input.blocking || !!s.input.selection, semantic: !!s.events, paying: s.input.paying || payingBefore ? id => manaTone(findCard(id)) : undefined });
    // O último terreno do pagamento chega num estado em que o pagamento já acabou: ele também solta a mana.
    payingBefore = !!s.input.paying;
    // Mesma permanente com outro nome no campo: transformou (dupla face, dia e noite) ou virou cópia de outra.
    const names = new Map(visual.players.flatMap(p => p.battlefield.map(c => [c.id, c.faceDown ? '' : c.name ?? ''] as [number, string])));
    if (!silently && fieldNamesMatch === timeline.matchId) {
      const turned = [...names].filter(([id, n]) => n && fieldNames.get(id) && fieldNames.get(id) !== n).map(([id]) => id);
      if (turned.length) motion.transformed(turned);
    }
    fieldNames = names; fieldNamesMatch = timeline.matchId;
    // Mão inicial: as cartas saem do grimório; num mulligan, a mão anterior volta antes.
    if (s.input.opening === 'mulligan' && !s.gameOver) {
      const ids = (s.players.find(p => p.id === s.you)?.hand ?? []).map(c => c.id).join(',');
      if (ids && ids !== dealtHand) {
        const again = !!dealtHand;
        dealtHand = ids;
        if (!silently) motion.deal([...root.querySelectorAll<HTMLElement>('#fHand .hcard')], { returning: again ? 1 : 0 });
      }
    } else if (!s.input.opening) dealtHand = '';
  }

  const toasts = createToasts(root, { findCard: id => findCard(id), image, setHTML });
  const preview = createCardPreview({ ...ctx, eventCard: key => historyLog.card(key) ?? removals.card(key) ?? toasts.card(key) });
  function notice(text: string, error = false, detail?: NoticeDetail) {
    text = fixPossessives(text, playerNames());
    if (error) errors.record('aviso', text);
    if (error && client?.state?.input.attacking && attack.queue.busy) { attack.clear(true); renderTable(false); }
    if (error && client?.state?.sideboarding) { match.sideboardError = text; match.sideboardBusy = false; render(); }
    toasts.show(text, error, detail);
  }

  // ---------- Eventos ----------
  const ui = createUiActions({ ...ctx, attack, passMenu, settings, errors, removals, turnNotice, turnBuzz, hand, focus, setMenu, setLog,
    startPassingTurn: () => inputs.startPassingTurn(), toggleDetails: () => actionBox.toggleDetails(), minimizeQuestion: id => question.minimize(id),
    closeStackGallery: () => stack.closeGallery(), closeZone: () => zone.close() });
  attachTableClicks({ ...ctx, ui, phases, seats, question, zone, overlay, inputs, attack, historyLog, focus, stops, opponentStops, passMenu, passLevel, setMenu,
    closeStackGallery: () => stack.closeGallery(), compact: () => compactTable.matches });
  root.addEventListener('input', e => {
    const t = e.target as HTMLInputElement;
    if (!question.input(t)) return;
    if (t.id === 'fVolume') { audio.setVolume(Number(t.value) / 100); settings.sync(); }
  });
  attachPreviewInput({ ...ctx, handDrag, stackFocusOn: el => stack.focusOn(el) });
  // ---------- Ordem dos gatilhos: teclado e arrastar ----------
  question.attachTriggerInput();
  attachTableKeyboard({ ...ctx, modal, focus, stops, passMenu, removals, settings, errors, attack, setMenu, setLog,
    closeStackGallery: () => stack.closeGallery(), closeZone: () => zone.close(), questionMinimized: () => question.minimized(),
    switchZonePlayer: player => { if (client?.state) zone.switchPlayer(client.state, player); } });

  /** A conexão caiu (reconectando ou de vez): nada mais sai da mesa, e o que estava em andamento é largado. */
  function connectionLost() {
    match.disconnected = true; attack.clear(true); passLevel.reset(); opponentStops.reset(); settings.syncPassLevel(); stops.sync();
    if (match.stackGalleryOpen) stack.closeGallery();
    handDrag.cancel(); presentation.stop(); presentation.muteNext();
  }

  return {
    attach(c, pics) {
      match = newMatchState();
      passLevel.reset(); opponentStops.reset(); turnNotice.reset(); turnBuzz.reset();
      faces.reset();
      client = c; portraits = pics; attack.clear(true);
      $('#fStackGallery').hidden = true;
      handDrag.cancel(); presentation.stop(); timeline.reset(); presentation.muteNext(); hideCardPreview(true);
      motion.reset();
      $('#fOverlay').hidden = true;
      $('#fQuestion').hidden = true;
      $('#fZone').hidden = true;
      settings.syncPassLevel(); stops.sync(); settings.syncTurnNotice(); settings.syncDevice(); syncModal();
    },
    render,
    notice,
    reconnecting(attempt) {
      if (attempt === 1) errors.record('conexão', 'A conexão caiu; tentando voltar sozinho.');
      connectionLost();
      overlay.reconnecting(attempt);
    },
    diagnostic(d) { errors.record('ação ignorada', d.text, d.action ? `ação: ${d.action}` : undefined); },
    disconnected(reason) {
      errors.record('conexão', reason ?? 'Conexão perdida com o servidor da partida.');
      connectionLost();
      overlay.disconnected(reason, !!client?.state?.session);
    },
  };
}
