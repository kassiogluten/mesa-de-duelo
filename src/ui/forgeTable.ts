import type { FCard, FPlayer, FQuestion, FState, ForgeClient, NoticeDetail } from '../forge/client';
import { EVENTS, KEYS } from '../storage';
import { cacheGet } from '../scryfall';
import { cardInfo } from '../cards';
import { esc, richText, withoutCardIds } from './cardtext';
import { faceDownReminder } from './faceDownReminder';
import { createMotion } from './motion';
import { permanentStatus, permanentTypeChange, typeChangeText } from './permanentEffects';
import { toggleFullscreen } from './landscape';
import { followCardPreview, inspectCard, showCardPreview, hideCardPreview } from './cardInspector';
import { type HistoryNames } from './historyLog';
import './removalNotice.css';
import { PresentationTimeline, calloutDuration, presentationDuration, hasLiveDecision, stateWithFrame, type PresentationEvent, type PresentationFrame } from './presentationTimeline';
import { createGameAudio, tableMoment } from './audio';
import { PassLevelPreference, isPassLevel } from './passLevel';
import { OpponentStopsPreference } from './opponentStops';
import { createTurnNotice } from './turnNotice';
import { createTurnBuzz } from './turnBuzz';
import { screenWake } from './screenWake';
import { restoreRowScroll, rowScroll, syncAllRowEdges, watchRowEdges } from './cardRow';
import { type DiagnosticEntry } from './matchDiagnostics';
import { followSeats, forcedSeatReason, manualSeatChoice, visibleSeats, type SeatMemory } from './seatVisibility';
import { fixPossessives } from './forgeText';
import { VERSION } from './changelog';
import { HAND_GROUP_FROM, arrangeHand, attachHandDrag, groupHand, moveGroupInHand, moveInHand } from './handDrag';
import { exileShelfCards, canPlayExileCard, validBlockSelection, blockPairAction, selectedForInput, canSelectExileCard } from './playContext';
import { applyOpeningPresentation, suppressOpeningPreview } from './openingPresentation';
import { cardDecision, selectionMessage, tapToPayMessage, tapToPayShort } from './decisionPrompt';
import { isProliferating, proliferateClear, proliferatePanelHTML, proliferateSuggestion, proliferateToggle } from './proliferate';
import './proliferate.css';
import { hasCommandZone } from '../decks';
import { phaseHudHTML } from './phaseHud';
import { stackPresentation } from './stackPresentation';
import { skipBarHTML } from './skipVote';
import { undoBarHTML, undoButtonState } from './undo';
import { voteDialog } from './voteDialog';
import './undo.css';
import './focusView.css';
import './skipVote.css';
import { turnSpellsTotal } from './playerStatus';
import { forecastLineHTML, forecastText } from './combatForecast';
import './combatForecast.css';
import { dungeonViewHTML } from './dungeon';
import { isPlayMode, isTriggerOrder, newTriggerOrder, undoTrigger, type TriggerOrder } from './choiceScreens';
import './choiceScreens.css';
import { CHOICE_SORT_KEY, choiceLayout, choiceStatus, isFilterableChoice, newChoiceView, parseChoiceSort, type ChoiceSort, type ChoiceView } from './choiceFilters';
import './choiceFilters.css';
import { prefsChanged } from '../conta/sync';
import { isLibraryChoice, librarySummary, moveLibraryCard, placeLibraryCard } from './libraryChoice';
import './libraryChoice.css';
import { isPilesChoice, isPilesSplit, movePileCard, splitSummary } from './piles';
import './piles.css';
import { adjust, autoSplit, isCombatDamage, splitStatus } from './combatDamage';
import './combatDamage.css';
import './gameplay.css';
import './permanentEffects.css';
import './phaseHud.css';
import './gameOptions.css';
import './decisionPrompt.css';
import { tablePlayers, legalAttackTargets, legalAttackAllTargets, canPlayCommander } from './commanderTable';
import './commanderTable.css';
import './arenaModals.css';
import './cardStyle.css';
// Os temas (e o temas.css deles) continuam entrando aqui, na mesma posição da cascata de antes.
import './temas';
import './matchBar.css';
import { poolCost, shortInstruction, spokenMana } from './shortInstruction';
import './cardVote.css';
import { confirmUpkeepMana, upkeepManaKey } from './upkeepMana';
import { oppHandHTML, revealedCards } from './revealedHand';
import './revealedHand.css';
import './upkeepMana.css';
import './awaitingDecision.css';
import { isNameChoice, nameListHTML, nameMatches, nameStatus } from './nameChoice';
import { seatTurnChange, turnHighlight } from './turnHighlight';
import './waitAlert.css';
import './duelPiles.css';
import './tableMoves.css';
import './handPeek.css';
import { savedHandMode, toggleAuto, toggleShown, type HandMode } from './handMode';
import { isShortcutsKey, MATCH_SHORTCUTS, openShortcuts } from './shortcuts';
import { gameSummaryHTML } from './lifeChart';
import { installWheelSideways } from './wheelSideways';
import { newMatchState, newSeatState } from './tableState';
import { tableShellHTML } from './tableShell';
import { eventDescription as describeEvent, frameCard, targetsDescription as describeTargets, type EventView } from './eventText';
import { stackGalleryHTML, stackPanel, type StackView } from './stackView';
import { amountStatus, zoneWithArticle, choiceTypeLine, questionHTML as renderQuestion, questionBar as renderQuestionBar, newQuestionDraft, type QuestionView } from './questionView';
import { gameResult, lifeDetails, sideboardHTML, resultHTML, reconnectingHTML, disconnectedHTML } from './resultView';
import { createCardFaces, ptOf, label, seenFace, emblemSource, emblemLabel } from './cardFaces';
import { usable, canUse, fieldRow, isBackRow, backRow, type BoardView } from './permanentView';
import { matStyle, avatar, piles, commandCards, damageButton, focusButton, focusHTML, collapsedSeat, opponentSeat, type SeatView } from './seatView';
import { fitLoneRows, fitRowWidths, layoutExileShelf, layoutCardDecision, layoutCounters, layoutStack, syncSeatScroll } from './tableLayout';
import { drawCombatArrows, drawTargetArrows as drawTargets } from './tableArrows';
import { commanderLedgerHTML, exileShelfHTML, zoneHTML, zoneKey, type ZoneKind, type ZoneView } from './zoneView';
import { proliferateNames, buttons, passLevelVisible, passLevelControl, voteBoardPrompt, targetInfoOf, targetInfoHTML, targetInfoText, type ActionView } from './actionPanel';
import { createAttackChoice } from './attackChoice';
import { createTableClocks } from './tableClocks';
import { createPassMenu, createStopMenu } from './passMenus';
import { createHistoryPanel } from './historyPanel';
import { createRemovalQueue } from './removalQueue';
import { createTableSettings } from './tableSettings';
import { createErrorsPanel } from './errorsPanel';
import { attachTriggerOrder } from './triggerOrderInput';
import { createAwaitingCallout, createToasts, createTurnBanner } from './tableNotices';
import { handHTML, hiddenHandHTML, outsideHand, type HandFanItem } from './handView';
import { syncMatchMenu } from './matchMenu';

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

export function createForgeTableView(root: HTMLElement, opts: ForgeTableOptions): ForgeTableView {
  // Vibração na sua vez (S19); criada antes do HTML porque a opção só aparece onde o aparelho vibra.
  const turnBuzz = createTurnBuzz();
  /** O voto aberto na janela do centro, para avisar (som e vibração) só quando chega um novo. */
  let lastVoteKey = '';
  root.innerHTML = tableShellHTML({ feedback: !!opts.onFeedback, download: !!opts.onDownloadRecording && devTools(), buzz: turnBuzz.supported });

  const $ = (sel: string) => root.querySelector(sel) as HTMLElement;
  watchRowEdges(root);
  let client: ForgeClient | null = null;
  let portraits: (string | undefined)[] = [undefined, undefined];
  // Estado da partida aberta (tableState.ts): attach() troca o objeto inteiro; os assentos mudam junto com a partida.
  let match = newMatchState();
  let seats = newSeatState('');
  /** De quem era o turno no último desenho dos assentos, e a troca que o desenho atual mostra (só no desenho em que mudou). */
  let seatTurnPlayer: number | null | undefined;
  let seatTurn: { from: number | null; to: number | null } | null = null;
  // Relógios do turno e da partida e o alerta de espera demorada (tableClocks.ts).
  const clocks = createTableClocks(root, { state: () => client?.state, presenting: () => !!timeline.current, disconnected: () => match.disconnected, announce: text => announce(text), cue: volume => audio.cue('turn-self', volume) });
  let lastCombat = '';
  let zoneKind: ZoneKind = 'gy';
  /** Alvo no cemitério: a escolha que abriu o cemitério sozinha (fecha junto com ela) e a que o jogador fechou (não reabre). */
  let gyTargetOpened: string | null = null;
  let gyTargetDismissed: string | null = null;
  const showBanner = createTurnBanner(root);
  // Momentos que já tocaram (resultado, cada mão inicial): voltar à mesa não repete o som.
  const playedMoments = new Set<string>();
  const motion = createMotion(root);
  /**
   * Quando foi esse clique. Se o Forge recusar a ação (bloqueio inválido, por exemplo), o prompt não muda;
   * a ponte libera os botões depois de 1,5 s e a mesa também, senão o OK ficaria travado para sempre.
   */
  let clickedAt = 0;
  const CLICK_LOCK_MS = 1600;
  /** Manutenção (partida e turno) em que o jogador já confirmou gerar mana mesmo assim. */
  let upkeepManaConfirmed = '';
  /** Marcador com o balão aberto por clique (id da carta e tipo), até clicar fora. */
  let openCounter: string | null = null;
  /** Filtro por tipo e busca da escolha grande de cartas aberta (só mudam a tela, não a resposta). */
  let choiceView: ChoiceView | null = null;
  const viewFor = (q: FQuestion) => { if (choiceView?.id !== q.id) choiceView = newChoiceView(q.id); return choiceView; };
  /** Ordem das escolhas grandes de cartas; acompanha a conta, como as outras preferências da mesa. */
  let choiceSort: ChoiceSort = 'type';
  const readChoiceSort = () => { try { choiceSort = parseChoiceSort(localStorage.getItem(CHOICE_SORT_KEY)); } catch { /* Storage is optional. */ } };
  readChoiceSort();
  addEventListener(EVENTS.prefsSincronizadas, readChoiceSort);
  /** Divisão do dano de combate em andamento (bloqueio duplo ou atropelar). */
  let damageSplit: { id: number; amounts: number[] } | null = null;
  const splitFor = (q: FQuestion) => {
    if (damageSplit?.id !== q.id) damageSplit = { id: q.id, amounts: autoSplit(q) };
    return damageSplit.amounts;
  };
  /** Ordem dos gatilhos sendo montada na tela de ordenar gatilhos. */
  let triggerOrder: { id: number; t: TriggerOrder } | null = null;
  const triggersFor = (q: FQuestion) => {
    if (triggerOrder?.id !== q.id) triggerOrder = { id: q.id, t: newTriggerOrder(q.options?.length ?? 0) };
    return triggerOrder.t;
  };
  let groupTitle = '';
  // Instrução aberta com "Ver detalhes"; volta a ficar recolhida quando a instrução muda.
  let expandedPrompt = '';
  // Pergunta recolhida com "Ver a mesa": vira uma barra e a mesa fica à vista, só para olhar.
  let minimizedQuestion: number | null = null;
  const questionMinimized = () => { const s = client?.state; return !!s?.question && !s.gameOver && minimizedQuestion === s.question.id; };
  let shownInstruction = '';
  const timeline = new PresentationTimeline();
  const audio = createGameAudio();
  // Nível de passar automaticamente (Opções e o selo junto dos botões); quem passa é a ponte.
  const passLevel = new PassLevelPreference(message => { if (client?.connected && !match.disconnected) client.send(message); });
  // Etapas do turno dos oponentes em que a ponte segura a prioridade para você.
  const opponentStops = new OpponentStopsPreference(message => { if (client?.connected && !match.disconnected) client.send(message); });
  const turnNotice = createTurnNotice();
  let presentationTimer = 0;
  /** Oponente em foco: o campo dele em tela cheia, só para olhar (item 69). */
  let focusSeat: number | null = null;
  let focusReturn: HTMLElement | null = null;
  const seatMemory = (): SeatMemory => ({ hidden: seats.hidden, solo: seats.solo, retired: seats.retired, focus: seats.focus });
  let drawingNow = 0;
  let displayFrame: PresentationFrame | null = null;
  // Fim da partida (o momento antes do resultado), os nomes das permanentes (para ver quem transformou) e a mão inicial já distribuída.
  let finaleKey = '', finaleUntil = 0, wasPlaying = false;
  let fieldNames = new Map<number, string>(), fieldNamesMatch = '';
  let dealtHand = '', payingBefore = false;
  let silentNext = true;
  // Opções da partida (tableSettings.ts): som, jogo e aparência, com as preferências deste aparelho.
  const settings = createTableSettings(root, { audio, passLevel, turnNotice, turnBuzz, connected: () => !!client?.connected && !match.disconnected,
    passLevelChanged: () => { if (passMenu.open) passMenu.sync(); }, closeMenus: () => { setMenu(false, true); setLog(false); }, syncModal,
    hasState: () => !!client?.state, render: () => render(), rerender: () => renderTable(false) });
  const prefs = settings.prefs;
  let previousAnnouncement = '';
  let returnFocus: HTMLElement | null = null;
  let currentModal: HTMLElement | null = null;
  // Mão fixa, oculta ou automática (handMode.ts). Quem assiste começa sempre recolhida, e essa escolha não fica guardada.
  let handMode: HandMode = (() => {
    const hover = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
    try { return savedHandMode(localStorage.getItem(KEYS.hand), hover); } catch { return savedHandMode(null, hover); }
  })();
  let watchHandMode: HandMode = 'auto';
  // Guardado à parte: ele vive dentro da trilha de fases, que é redesenhada (e o tira do documento até voltar).
  const handAutoButton = root.querySelector<HTMLButtonElement>('#fHandAuto')!;
  let handCountSeen = -1;
  const renderedContent = new WeakMap<HTMLElement, { html: string; first: ChildNode | null }>();
  const setHTML = (el: HTMLElement, html: string) => {
    const previous = renderedContent.get(el);
    if (previous?.html === html && previous.first === el.firstChild) return;
    el.innerHTML = html; renderedContent.set(el, { html, first: el.firstChild });
  };
  /** O ícone da trilha com o nome à mostra (pela classe e pela fase, porque a trilha é redesenhada) e até quando. */
  let trailTip: { key: string; until: number } | null = null, trailTipTimer = 0;
  /** O que as peças do campo precisam da mesa (permanentView.ts), lido na hora de cada desenho. */
  const boardView = (): BoardView => ({ face, faceStyle, playerName, openCounter, lastDamage: match.lastDamage, selectedBlocker: match.selectedBlocker, compact: compactTable.matches,
    attackSelected: (s, id) => attack.selected.has(id) || attack.queue.queuedAttackers.includes(id) || (attack.allGen !== null && legalAttackTargets(s, { attacker: id, gen: attack.allGen }).length > 0),
    attackTargets: attack.targets });

  // "toggle" não sobe pela árvore: a escuta é na captura.
  root.addEventListener('toggle', e => {
    if ((e.target as HTMLElement).matches?.('[data-life-details]')) lifeDetailsOpen = (e.target as HTMLDetailsElement).open;
  }, true);
  // Menus do nível de passar e das paradas no turno dos oponentes (passMenus.ts).
  const passMenu = createPassMenu(root, { state: () => client?.state, visible: s => passLevelVisible(actionView(), s), passLevel, setHTML });
  // Dia ou noite do último desenho da trilha: o sol ou a lua pulsa quando vira.
  let lastDayTime: FState['dayTime'];
  // Dá para marcar paradas quando a ponte oferece a opção e você está jogando.
  const stops = createStopMenu(root, { stops: opponentStops, hasState: () => !!client?.state, render: () => render(),
    editable: () => !!client?.connected && !match.disconnected && opponentStops.supported && !!client.state && !client.state.gameOver && !client.state.spectating });
  /** Arte do tapete: a capa do deck que veio com a partida ou, em rede, a capa que a sala mostra de cada um. */
  function matArt(s: FState, p: FPlayer, idx: number): string | undefined {
    if (!prefs.playmat) return undefined;
    const cover = s.room?.players.find(rp => rp.playerId === p.id)?.cover, card = cover ? cacheGet(cover) : null;
    return portraits[idx] ?? (card ? cardInfo(card).artCrop : undefined);
  }
  /** O que os assentos e retratos precisam da mesa (seatView.ts), além das peças do campo. */
  const seatView = (): SeatView => ({ ...boardView(), image, portraits, matArt, counterBumps, spellsTotal: spellsTotal(), activePlayer: client?.state?.activePlayer, cardName, seats, seatMemory: seatMemory(), seatTurn });
  function syncMat(el: HTMLElement, art: string | undefined) {
    el.hidden = !art;
    if (el.getAttribute('style') !== matStyle(art)) el.setAttribute('style', matStyle(art));
  }
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
  function restoreLogFocus(key: string) {
    root.querySelector<HTMLElement>(`#fLog [data-log-toggle="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
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
  /** Pilhas de cópias iguais da mão cheia (handDrag.ts), ou null com a mão sem agrupar. */
  let handGroups: number[][] | null = null;
  const handDrag = attachHandDrag(root, {
    state: () => match.disconnected || questionMinimized() ? null : client?.state,
    canReorder: () => !match.disconnected && !!client?.state && !client.state.watching,
    beforeDrag: () => hideCardPreview(true),
    play: action => { stopPresentation(); client?.send(action); },
    reorder: (id, to) => { const next = handGroups ? moveGroupInHand(handGroups, id, to) : moveInHand(match.handOrder, id, to); if (next) { match.handOrder = next; renderTable(false); } },
  });

  function focusSnapshot() {
    const el = document.activeElement as HTMLElement | null;
    if (!el || !root.contains(el)) return null;
    const keys = ['data-ui', 'data-act', 'data-inspect', 'data-fid', 'data-pid', 'data-mana', 'data-ctr', 'data-event', 'data-log-toggle', 'data-stack', 'data-stack-inspect', 'data-peek', 'data-q-opt', 'data-q-filter', 'data-q-sort', 'data-lib-place', 'data-lib-move', 'data-pile-move', 'data-pile-pick', 'data-q-confirm', 'data-q-submit', 'data-q-none', 'data-q-keep', 'data-q-amount', 'data-trigger', 'data-trigger-undo', 'data-trigger-confirm', 'data-cd-add', 'data-cd-sub', 'data-cd-lethal', 'data-cd-auto', 'data-cd-confirm', 'data-group', 'data-stop-group', 'data-sb-main', 'data-sb-side'];
    const attr = keys.find(key => el.hasAttribute(key));
    const scope = el.parentElement?.closest('[id]')?.id;
    const selector = el.id ? `#${CSS.escape(el.id)}` : attr ? `${scope ? `#${CSS.escape(scope)} ` : ''}[${attr}="${CSS.escape(el.getAttribute(attr)!)}"]` : null;
    return selector ? { selector, start: el instanceof HTMLInputElement ? el.selectionStart : null, end: el instanceof HTMLInputElement ? el.selectionEnd : null } : null;
  }
  function restoreFocus(saved: ReturnType<typeof focusSnapshot>) {
    if (!saved || (document.activeElement !== document.body && document.activeElement?.isConnected)) return;
    const next = root.querySelector<HTMLElement>(saved.selector);
    if (!next || next.closest('[hidden]') || (next as HTMLButtonElement).disabled) return;
    next.focus({ preventScroll: true });
    if (next instanceof HTMLInputElement && saved.start !== null && saved.end !== null && next.type !== 'number') next.setSelectionRange(saved.start, saved.end);
  }
  function syncModal() {
    // Com o foco num oponente, a decisão que chegar espera atrás dele (a tela avisa); só o que se abre dali (cemitério, exílio) vem na frente.
    const focusOpen = !$('#fFocus').hidden;
    const required = (focusOpen ? ['#fZone'] : ['#fVote', '#fOverlay', '#fQuestion', '#fZone', '#fStackGallery', '#fRemoval']).map(id => $(id)).find(el => !el.hidden && !(el.id === 'fQuestion' && questionMinimized())) ?? (focusOpen ? $('#fFocus') : null);
    if (required && !$('#fSettings').hidden) {
      $('#fSettings').hidden = true;
      root.querySelector('[aria-controls="fSettings"]')?.setAttribute('aria-expanded', 'false');
    }
    const active = required ?? (!$('#fSettings').hidden ? $('#fSettings') : null);
    const previousModal = currentModal;
    if (active !== currentModal) {
      if (!currentModal && active) returnFocus = document.activeElement as HTMLElement | null;
      currentModal = active;
    }
    root.querySelectorAll<HTMLElement>('.arena > *').forEach(el => { el.inert = !!active && el !== active; });
    if (!active && previousModal && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    if (active && !active.contains(document.activeElement) && !document.querySelector('dialog[open]')) {
      modalStart(active)?.focus({ preventScroll: true });
    }
  }
  /** Onde o foco começa numa janela: a escolha principal (o modo recomendado, o primeiro gatilho, o botão de confirmar
   *  quando não há opções a marcar), para o Espaço apertá-la; senão, o primeiro controle. Nunca o "Ver a mesa", que fica no Esc. */
  function modalStart(active: HTMLElement) {
    return active.querySelector<HTMLElement>('[data-vote-start], .play-mode-option.recommended, [data-trigger], [data-cd-confirm]:not(:disabled), [data-ui="removal-ok"]')
      ?? (active.querySelector('[data-q-opt]') ? null : active.querySelector<HTMLElement>('.q-actions .arena-btn.primary:not(:disabled)'))
      ?? [...active.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), input, [tabindex="0"]')].find(el => !el.matches('[data-ui="question-minimize"]'));
  }
  function closeZone() {
    if (gyTargetOpened) { gyTargetDismissed = gyTargetOpened; gyTargetOpened = null; }
    match.zoneOf = null; match.groupIds = null; $('#fZone').hidden = true; syncModal();
  }
  /**
   * Escolha de alvo em que todos os alvos possíveis estão em cemitérios (Reanimar, Regrowth...): a chave da escolha e
   * o cemitério que abre primeiro, o seu se ele tiver alvo, senão o do primeiro oponente que tiver.
   */
  function graveyardTargeting(s: FState) {
    const t = s.input.targeting;
    if (!t || s.input.paying || s.input.vote || s.gameOver || s.question || s.watching || s.input.selectablePlayers?.length) return null;
    const selectable = new Set(s.input.selectable);
    const owners = s.players.map(p => ({ p, n: p.graveyard.filter(c => selectable.has(c.id)).length })).filter(o => o.n);
    if (!owners.length || owners.reduce((sum, o) => sum + o.n, 0) < selectable.size) return null;
    return { key: `${t.source}:${t.kind ?? ''}:${t.ability ?? ''}`, player: (owners.find(o => o.p.id === s.you) ?? owners[0]).p.id };
  }
  /** Abre o cemitério sozinho quando o alvo só pode estar nele, e fecha quando a escolha acaba. Fechado à mão, não volta. */
  function syncGraveyardTargeting(s: FState) {
    const target = graveyardTargeting(s);
    if (!target) {
      const opened = gyTargetOpened;
      gyTargetOpened = null;
      if (opened && zoneKind === 'gy' && match.zoneOf !== null && !match.groupIds) { match.zoneOf = null; $('#fZone').hidden = true; syncModal(); }
      if (!s.input.targeting) gyTargetDismissed = null;
      return;
    }
    if (target.key === gyTargetOpened || target.key === gyTargetDismissed) return;
    if (match.groupIds || (match.zoneOf !== null && zoneKind !== 'gy')) return;
    gyTargetOpened = target.key;
    if (match.zoneOf === null) { zoneKind = 'gy'; match.zoneOf = target.player; }
  }
  function closeStackGallery() {
    match.stackGalleryOpen = false; $('#fStackGallery').hidden = true;
    root.querySelector('[data-ui="stack-open"]')?.setAttribute('aria-expanded', 'false');
    hideCardPreview(true); syncModal();
    const restore = () => {
      if (!currentModal && !match.stackGalleryOpen) (root.querySelector<HTMLElement>('[data-ui="stack-open"]') ?? root.querySelector<HTMLElement>('#fAction button:not(:disabled)') ?? root.querySelector<HTMLElement>('[data-ui="menu"]'))?.focus({ preventScroll: true });
    };
    restore();
    // A live update may replace the priority controls later in this same render.
    queueMicrotask(() => { if (document.activeElement === document.body) restore(); });
  }
  function announce(message: string) {
    if (message === previousAnnouncement) return;
    previousAnnouncement = message;
    $('#fAnnouncement').textContent = message;
  }
  function renderedInputIsCurrent(el: HTMLElement) {
    const gen = el.closest<HTMLElement>('[data-gen]')?.dataset.gen;
    return !!client?.state && gen !== undefined && Number(gen) === client.state.input.gen && !match.disconnected;
  }

  function advancePresentation() {
    clearTimeout(presentationTimer);
    if (document.hidden || root.hidden || match.disconnected) { stopPresentation(); return; }
    let entry = timeline.advance();
    const s = client?.state;
    const draws: PresentationEvent[] = [], quick: PresentationEvent[] = [];
    while (entry?.audioOnly) {
      if (s) audio.play(entry.event, timeline.matchId, entry.audible, s.you);
      if (entry.event.type === 'draw' && entry.event.actor !== undefined) draws.push(entry.event);
      else if (entry.audible) quick.push(entry.event);
      entry = timeline.advance();
    }
    displayFrame = s && !hasLiveDecision(s) ? entry?.event.frame ?? null : null;
    drawingNow = s ? draws.filter(d => d.actor === s.you).reduce((n, d) => n + (d.count ?? 1), 0) : 0;
    renderTable(false);
    drawingNow = 0;
    // Embaralhar e marcadores não têm passo próprio: animam junto com a jogada, na mesa já desenhada.
    if (s) for (const event of quick) motion.quick(event, { you: s.you });
    // A mão inicial e os mulligans já têm a própria apresentação: sem voos por cima dela.
    const gameBegun = timeline.history.some(e => e.type === 'turn');
    if (s && draws.length && gameBegun && !suppressOpeningPreview(s)) {
      const incoming = [...root.querySelectorAll<HTMLElement>('#fHand .hcard.incoming')];
      for (const el of incoming) match.knownHand.add(Number(el.dataset.fid));
      for (const draw of draws) {
        const cards = draw.actor === s.you ? incoming : [];
        const arrivals = motion.drew(draw.actor!, draw.count ?? 1, { you: s.you, cards, fast: prefs.fast || hasLiveDecision(s), searched: !!draw.searched });
        cards.forEach((el, i) => match.arriving.set(Number(el.dataset.fid), performance.now() + (arrivals[i] ?? 0)));
      }
    }
    if (!entry || !s) return;
    const duration = presentationDuration(entry.event, prefs.fast || hasLiveDecision(s));
    // Dano dividido: os próximos danos da mesma mágica ou habilidade saem juntos, cada um para o seu alvo.
    const first = entry.event;
    const divided = first.type === 'damage' && !first.combat && !first.prevented && first.sourceId !== undefined
      ? timeline.takeWhile(e => e.type === 'damage' && !e.combat && !e.prevented && e.sourceId === first.sourceId) : [];
    // Luta: o golpe de volta (da criatura atingida na outra) sai junto, e as duas se chocam no meio.
    const fought = first.type === 'damage' && first.fight && first.targets?.cards?.length
      ? timeline.takeWhile(e => e.type === 'damage' && !!e.fight && e.sourceId === first.targets!.cards![0]) : [];
    if (first.type === 'mill') motion.milled(first, { you: s.you, fast: prefs.fast || hasLiveDecision(s), face: card => face(card, 'normal') });
    else if (first.type === 'entered' && (first.entries?.length ?? 0) > 1) motion.entered(first, { you: s.you, fast: prefs.fast || hasLiveDecision(s), face: card => face(card, 'normal'), hideDestination: !hasLiveDecision(s) });
    else for (const part of [entry, ...divided, ...fought]) {
      if (divided.length) part.event.divided = divided.length + 1;
      motion.present(part.event, { you: s.you, html: part.event.card ? face(part.event.card, 'normal') : undefined,
        label: eventDescription(part.event), duration, calloutDuration: calloutDuration(part.event, prefs.fast || hasLiveDecision(s)), hideDestination: !hasLiveDecision(s) });
    }
    audio.play(entry.event, timeline.matchId, entry.audible, s.you);
    if (entry.event.type === 'damage' && entry.event.targets?.players?.length) announce(eventDescription(entry.event));
    else if (!hasLiveDecision(s)) announce(eventDescription(entry.event));
    presentationTimer = window.setTimeout(advancePresentation, duration);
  }
  function stopPresentation() {
    clearTimeout(presentationTimer); timeline.catchUp(); displayFrame = null; match.arriving.clear();
    motion.cancelPresentation(); audio.silence();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopPresentation(); silentNext = true; }
    else if (!root.hidden) render();
  });
  root.querySelectorAll<HTMLElement>('.row').forEach(row => {
    row.tabIndex = 0;
    row.setAttribute('aria-label', `${row.closest('.opp') ? 'Campo do oponente' : 'Seu campo'}: ${row.classList.contains('lands') ? 'terrenos e outros permanentes' : 'criaturas'}. Role para ver todas as cartas.`);
    row.addEventListener('scroll', () => { if (client?.state) { const visual = stateWithFrame(client.state, displayFrame); drawCombatArrows(root, visual); drawTargetArrows(visual); } }, { passive: true });
  });

  installWheelSideways(root);
  $('#fOpponents').addEventListener('scroll', () => { syncSeatScroll(root); if (client?.state) { const visual = stateWithFrame(client.state, displayFrame); drawCombatArrows(root, visual); drawTargetArrows(visual); } }, true);

  // ---------- Rostos das cartas e imagens do Scryfall (cardFaces.ts) ----------
  const faces = createCardFaces(root, { cardStyle: () => prefs.cardStyle, sleeve: playerId => client?.state?.players.find(p => p.id === playerId)?.sleeve, rerender: () => renderTable(false) });
  const { image, face, faceStyle } = faces;

  function renderExileShelf(s: FState) {
    const cards = exileShelfCards(s);
    const shelf = $('#fExileShelf');
    const arena = root.querySelector<HTMLElement>('.forge')!;
    shelf.hidden = !cards.length;
    arena.classList.toggle('has-exile-shelf', !!cards.length);
    arena.style.setProperty('--exile-visible', String(Math.min(2, cards.length)));
    shelf.classList.toggle('scrolls', cards.length > 2);
    setHTML(shelf, exileShelfHTML(s, c => face(c, 'normal'), cards));
  }

  /** Setas de alvo (tableArrows.ts): da pilha que a mesa mostra agora, com o item em foco em destaque. */
  const drawTargetArrows = (s: FState) => drawTargets(root, s, client?.state ? stackPresentation(client.state, timeline.current?.event).stack : s.stack, stackFocus);

  /** Item da pilha cujas setas estão em destaque: o que está sob o mouse ou com o foco, ou o que mira a carta ou o jogador apontado. */
  let stackFocus: number | null = null;
  function stackFocusFrom(el: HTMLElement | null): number | null {
    const s = client?.state;
    if (!el || !s?.stack.length) return null;
    const item = el.closest<HTMLElement>('#fStack [data-stack], #fStackGallery [data-stack]');
    if (item) return Number(item.dataset.stack);
    const card = el.closest<HTMLElement>('.field [data-fid]');
    if (card) return s.stack.find(si => si.targets?.cards?.includes(Number(card.dataset.fid)))?.id ?? null;
    const player = el.closest<HTMLElement>('.avatar[data-pid]');
    if (player) return s.stack.find(si => si.targets?.players?.includes(Number(player.dataset.pid)))?.id ?? null;
    return null;
  }
  function setStackFocus(id: number | null) {
    if (id === stackFocus) return;
    stackFocus = id;
    if (client?.state) drawTargetArrows(stateWithFrame(client.state, displayFrame));
  }

  // A largura dos selos muda quando a fonte termina de carregar.
  document.fonts?.addEventListener('loadingdone', () => { if (!root.hidden) layoutCounters(root); });
  window.addEventListener('resize', () => {
    const s = client?.state;
    attack.syncPanelShift(); placeHandControls();
    if (s?.type === 'state' && !root.hidden) { fitLoneRows(root); fitRowWidths(root); layoutCounters(root); layoutExileShelf(root); layoutCardDecision(root); layoutStack(root); syncSeatScroll(root); const visual = stateWithFrame(s, displayFrame); drawCombatArrows(root, visual); drawTargetArrows(visual); }
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

  const countedLife = new WeakSet<Element>();
  function countLife() {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const el of root.querySelectorAll<HTMLElement>('.avatar[data-pid] > .life')) {
      if (countedLife.has(el)) continue;
      countedLife.add(el);
      const pid = Number(el.parentElement!.dataset.pid), to = Number(el.textContent);
      const from = match.shownLife.get(pid);
      match.shownLife.set(pid, to);
      if (from === undefined || from === to || Number.isNaN(to) || still) continue;
      const avatarEl = el.parentElement!, dir = to > from ? 'life-up' : 'life-down';
      avatarEl.classList.remove('life-up', 'life-down'); void avatarEl.offsetWidth; avatarEl.classList.add(dir);
      const start = performance.now(), duration = Math.min(700, 160 + Math.abs(to - from) * 60);
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        el.textContent = String(Math.round(from + (to - from) * (1 - (1 - t) ** 3)));
        if (t < 1 && el.isConnected) requestAnimationFrame(step);
        else { el.textContent = String(to); window.setTimeout(() => avatarEl.classList.remove(dir), 400); }
      };
      el.textContent = String(from);
      requestAnimationFrame(step);
    }
  }

  // Veneno primeiro (com 10 o jogador perde); os outros marcadores do jogador vêm depois, com nome em português.
  /** Tipos de marcador de jogador que mudaram neste desenho, para o selo pulsar uma vez. */
  let counterBumps = new Map<number, Set<string>>();
  const lastPlayerCounters = new Map<number, Record<string, number>>();
  function trackPlayerCounters(players: FPlayer[]) {
    counterBumps = new Map();
    for (const p of players) {
      const before = lastPlayerCounters.get(p.id), now: Record<string, number> = { ...p.counters, ...(p.ringTempted ? { RING: p.ringTempted } : {}), ...(p.monarch ? { MONARCH: 1 } : {}), ...(p.spellsCast ? { SPELLS: p.spellsCast } : {}),
        ...(p.blessing ? { BLESSING: 1 } : {}), ...(p.speed ? { SPEED: p.speed } : {}) };
      if (before) {
        const changed = new Set([...Object.keys(before), ...Object.keys(now)].filter(k => (before[k] ?? 0) !== (now[k] ?? 0) && (now[k] ?? 0) > 0));
        if (changed.size) counterBumps.set(p.id, changed);
      }
      lastPlayerCounters.set(p.id, { ...now });
    }
  }
  const spellsTotal = () => turnSpellsTotal(client?.state?.players ?? []);

  function openFocus(id: number) {
    if (focusSeat === null) focusReturn = document.activeElement as HTMLElement | null;
    focusSeat = id;
    hideCardPreview(true);
    renderTable(false);
    $('#fFocus').querySelector<HTMLElement>('.focus-close')?.focus({ preventScroll: true });
  }
  function closeFocus() {
    if (focusSeat === null) return;
    const id = focusSeat;
    focusSeat = null;
    hideCardPreview(true);
    renderTable(false);
    const back = focusReturn?.isConnected && root.contains(focusReturn) ? focusReturn : root.querySelector<HTMLElement>(`[data-focus-seat="${id}"]`);
    back?.focus({ preventScroll: true });
    focusReturn = null;
  }
  /** Nome de um comandante ou planeswalker na frase da previsão do combate. */
  const cardName = (id: number) => { const c = findCard(id, false); return c ? label(c) : 'Comandante'; };
  /** O que a caixa de ação precisa da mesa (actionPanel.ts), lido na hora de cada desenho. */
  const actionView = (): ActionView => ({ findCard, playerName, observing: match.observing, disconnected: match.disconnected,
    clickLocked: gen => match.clickedGen === gen && Date.now() - clickedAt < CLICK_LOCK_MS,
    passLevel: passLevel.value, passLevelSupported: passLevel.supported, passingTurn: passLevel.passingTurn, passPending: passLevel.pending !== null, passMenuOpen: passMenu.open,
    attackAll: attack.allGen !== null, attackSelecting: attack.selected.size, attackBusy: attack.queue.busy });
  // Escolha de ataque (attackChoice.ts): criaturas marcadas, defensor fixado, "atacar com tudo", a fila e o painel "Atacar quem?".
  const attack = createAttackChoice(root, { client: () => client, disconnected: () => match.disconnected, findCard: id => findCard(id), notice, stopPresentation, render: () => renderTable(false) });

  /** O que a janela de zona precisa da mesa (zoneView.ts). */
  const zoneCtx: ZoneView = { face, findCard: id => findCard(id), buttons: s => buttons(actionView(), s), targetHead: s => {
    const short = shortInstruction(s.input, name => ptOf(name)?.name || name), info = targetInfoOf(actionView(), s);
    return `<div class="zone-target">${short ? `<p class="q-hint zone-target-ask">${richText(short)}</p>` : ''}${info ? targetInfoHTML(info) : ''}</div>`;
  } };
  function zoneView(s: FState) {
    const el = $('#fZone');
    const p = s.players.find(pl => pl.id === match.zoneOf);
    if (!p && !match.groupIds) { closeZone(); return; }
    if (zoneKind === 'dungeon' && p && !match.groupIds) { setHTML(el, dungeonViewHTML(p)); el.hidden = false; syncModal(); return; }
    if (zoneKind === 'damage' && p && !match.groupIds) {
      setHTML(el, commanderLedgerHTML(s, p));
      el.hidden = false; syncModal(); return;
    }
    // Mão revelada (Telepathy e afins): só para ver; com o efeito fora do campo, a galeria fecha.
    if (zoneKind === 'hand' && p && !match.groupIds && !revealedCards(p).length) { closeZone(); return; }
    const key = zoneKey(zoneKind, match.zoneOf, match.groupIds);
    const before = el.hidden ? null : el.querySelector<HTMLElement>('.zone-view');
    const rows = before?.dataset.zone === key ? rowScroll(before) : [];
    setHTML(el, zoneHTML(zoneCtx, s, { kind: zoneKind, player: p, groupIds: match.groupIds, groupTitle, key }));
    const after = el.querySelector<HTMLElement>('.zone-view');
    if (after && after !== before) restoreRowScroll(after, rows);
    el.hidden = false;
    syncAllRowEdges(el);
    syncModal();
  }

  /** Frases dos eventos (eventText.ts), com os nomes da mesa. */
  const eventView: EventView = { state: () => client?.state, label, findCard: id => findCard(id), ptName: name => ptOf(name)?.name };
  const eventDescription = (event: PresentationEvent, detailed = false) => describeEvent(eventView, event, detailed);
  const targetsDescription = (targets: PresentationEvent['targets']) => describeTargets(eventView, targets);
  const stackView = (): StackView => ({ face: c => face(c, 'normal'), label, ptText: name => ptOf(name)?.text, playerName, you: client?.state?.you, targetsText: targetsDescription });
  function renderStackGallery(s: FState) {
    if (!match.stackGalleryOpen) return;
    const boardDecision = !s.input.selectableStacks?.length && (!!s.input.selection || !!s.input.blocking || !!s.input.suspendCast || !!s.input.paying || !!s.input.targeting || !!s.input.selectablePlayers?.length || !!s.input.selectable.length || (!s.input.priority && (s.input.ok.enabled || s.input.cancel.enabled)));
    if (!s.stack.length || s.question || s.gameOver || s.sideboarding || boardDecision) { closeStackGallery(); return; }
    const gallery = $('#fStackGallery');
    const track = gallery.querySelector<HTMLElement>('.stack-gallery-track');
    const scroll = { left: track?.scrollLeft ?? 0, top: track?.scrollTop ?? 0 };
    setHTML(gallery, stackGalleryHTML(stackView(), s));
    gallery.hidden = false;
    const next = gallery.querySelector<HTMLElement>('.stack-gallery-track')!;
    next.scrollLeft = scroll.left; next.scrollTop = scroll.top;
  }
  function renderActivity() {
    const authoritative = client?.state;
    if (!authoritative) return;
    const presentation = stackPresentation(authoritative, timeline.current?.event);
    const s = { ...authoritative, stack: presentation.stack };
    const el = $('#fStack');
    const focused = focusSnapshot();
    const scrollTop = el.scrollTop;
    el.hidden = !s.stack.length;
    el.classList.toggle('minimized', match.stackMinimized);
    root.querySelector('.forge')!.classList.toggle('has-stack', !!s.stack.length);
    setHTML(el, s.stack.length ? stackPanel(stackView(), s, presentation.replaying, { minimized: match.stackMinimized, galleryOpen: match.stackGalleryOpen }) : '');
    el.scrollTop = scrollTop;
    renderStackGallery(authoritative);
    renderLog();
    restoreFocus(focused);
  }

  const historyNames: HistoryNames = {
    player: id => id === undefined ? 'Jogador' : client?.state?.players.find(p => p.id === id)?.name ?? 'Jogador',
    card: event => event.card?.name && !event.card.faceDown ? label(event.card) : undefined,
    cardById: (id, event) => frameCard(id, event) ?? findCard(id, false),
    label,
    describe: event => eventDescription(event, true),
  };
  // Histórico (historyPanel.ts) e as janelas de remoção feitas por outro jogador (removalQueue.ts).
  const historyLog = createHistoryPanel(root, { timeline, names: historyNames, you: () => client?.state?.you, image, setHTML });
  const removals = createRemovalQueue(root, { timeline, names: historyNames, face, state: () => client?.state, setHTML, leave: leaveOverlay, syncModal,
    blocked: s => s.gameOver || match.disconnected || (!!s.question && !questionMinimized()) || !$('#fOverlay').hidden || !$('#fZone').hidden || match.stackGalleryOpen });
  /** Histórico agrupado (Menu → Registro): só é montado com a gaveta aberta. */
  function renderLog() { historyLog.render(); }

  /** Entre os jogos, o resumo do jogo que acabou fica recolhido; aberto ou fechado, continua assim ao redesenhar. */
  let lifeDetailsOpen = false;
  const lifeDetailsHTML = (s: FState) => lifeDetails(s, lifeDetailsOpen, name => ptOf(name)?.name || name);
  function sideboardingHTML(s: FState) {
    const sb = s.sideboarding!;
    if (!match.sideboardDraft || match.sideboardDraft.id !== sb.id) {
      match.sideboardDraft = { id: sb.id, main: structuredClone(sb.main), sideboard: structuredClone(sb.sideboard) };
      match.sideboardError = ''; match.sideboardBusy = false;
    }
    if (sb.ready) match.sideboardBusy = false;
    return sideboardHTML(s, match.sideboardDraft, { error: match.sideboardError, busy: match.sideboardBusy, details: lifeDetailsHTML(s), ptName: name => ptOf(name)?.name || name, feedback: !!opts.onFeedback });
  }

  /** Liga o atalho "Passar até o fim do turno" no turno de outro jogador (no seu, o botão Fim de turno faz o mesmo). */
  function startPassingTurn() {
    const s = client?.state;
    if (!client || !s || match.disconnected || passMenu.shortcut(s) !== 'available') return;
    const gen = s.input.gen;
    if (gen === match.clickedGen && Date.now() - clickedAt < CLICK_LOCK_MS) return;
    match.clickedGen = gen; clickedAt = Date.now();
    stopPresentation(); hideCardPreview(true);
    client.send({ type: 'pass-turn', gen });
    passMenu.set(false);
    render();
  }

  // ---------- Perguntas ----------

  /**
   * Busca digitada: esconde e mostra as cartas sem redesenhar a escolha, para não tirar o foco nem quebrar o acento
   * que ainda está sendo digitado. O próximo desenho já sai com o mesmo texto.
   */
  function applyChoiceSearch(q: FQuestion) {
    const layout = choiceLayout(q, { sort: choiceSort, view: viewFor(q), name: label, typeLine: c => choiceTypeLine(questionView(), c) });
    const box = $('#fQuestion');
    box.querySelectorAll<HTMLElement>('.q-opts [data-q-opt]').forEach(el => { el.hidden = !layout.visible.has(Number(el.dataset.qOpt)); });
    for (const g of layout.groups) {
      const heading = box.querySelector<HTMLElement>(`[data-q-group="${g.key}"]`);
      if (!heading) continue;
      const shown = g.indices.filter(i => layout.visible.has(i)).length;
      heading.hidden = !shown;
      heading.querySelector('span')!.textContent = String(shown);
    }
    const status = box.querySelector<HTMLElement>('#fQStatus');
    if (status) status.textContent = choiceStatus(layout, match.qState?.id === q.id ? match.qState.picked : []);
  }
  /** Nomear uma carta: a lista muda sem redesenhar a escolha, para não tirar o foco da busca. */
  const ptName = (name: string) => ptOf(name)?.name;
  function applyNameSearch(q: FQuestion) {
    const found = nameMatches(q, match.qState?.text ?? '', ptName);
    const box = $('#fQuestion');
    const list = box.querySelector<HTMLElement>('#fQNames');
    if (list) { list.innerHTML = nameListHTML(q, found, ptName); list.scrollTop = 0; }
    const status = box.querySelector<HTMLElement>('#fQNameStatus');
    if (status) status.textContent = nameStatus(found, match.qState?.text ?? '');
  }

  const questionView = (): QuestionView => ({ face: c => face(c, 'normal'), label, ptName, ptType: name => ptOf(name)?.type_line, ptText: name => ptOf(name)?.text, playerName,
    players: client?.state?.players ?? [], piles: pilesView(), choiceSort, choiceView: viewFor, damageSplit: splitFor, triggerOrder: triggersFor });
  function questionHTML(q: FQuestion) {
    if (!match.qState || match.qState.id !== q.id) match.qState = newQuestionDraft(q);
    return renderQuestion(questionView(), q, match.qState);
  }
  function questionBar(q: FQuestion) {
    return renderQuestionBar(questionView(), q, isTriggerOrder(q) ? triggerOrder?.id === q.id ? triggerOrder.t.placed : 0 : match.qState?.id === q.id ? match.qState.picked.length : 0);
  }
  function pilesView() { return { face: (c: FCard) => face(c, 'normal'), label, playerName, you: client?.state?.you }; }

  function answer(extra: { indices?: number[]; value?: boolean; text?: string; amounts?: number[] }) {
    const q = client?.state?.question;
    if (!q || !client) return;
    stopPresentation();
    client.send({ type: 'answer', id: q.id, ...extra });
    match.qState = null; triggerOrder = null; damageSplit = null;
    $('#fQuestion').hidden = true;
  }

  // ---------- Desenho ----------
  function render() { renderTable(true); }

  const renderAwaiting = createAwaitingCallout(root, () => audio.cue('turn-self', .5));
  // Textos do Forge (pedido, pergunta, opções): o possessivo em inglês ("você's grimório") vira português. Repetir não muda nada.
  const playerNames = () => client?.state?.players.map(p => p.name) ?? [];
  /** Nome para as frases da mesa; o próprio jogador é "você". */
  function playerName(id: number) { return id === client?.state?.you ? 'você' : client?.state?.players.find(p => p.id === id)?.name ?? `Jogador ${id}`; }
  function fixForgeText(s: FState) {
    const names = s.players.map(p => p.name);
    if (s.input?.message) s.input.message = fixPossessives(s.input.message, names);
    if (s.question) {
      s.question.title = fixPossessives(s.question.title, names);
      s.question.options = s.question.options?.map(o => typeof o === 'string' ? fixPossessives(o, names) : o);
    }
  }
  /** Modo da mão: as classes na mesa, o botão Auto, a seta (só com o Auto desligado) e a contagem com a mão oculta. */
  function syncHandMode(watching: boolean, handCount = handCountSeen) {
    const mode = watching ? watchHandMode : handMode;
    const arena = root.querySelector('.arena')!;
    arena.classList.toggle('hand-peek', mode === 'auto');
    arena.classList.toggle('hand-hidden', mode === 'oculta');
    const auto = handAutoButton;
    auto.setAttribute('aria-pressed', String(mode === 'auto'));
    auto.title = mode === 'auto' ? 'Mão automática ligada: recolhida, sobe ao passar o mouse. Clique para desligar' : 'Mão automática desligada: clique para ligar';
    $('#fHandMode').hidden = mode === 'auto';
    const toggle = $('#fHandToggle'), text = mode === 'fixa' ? 'Esconder a mão' : 'Mostrar a mão';
    toggle.hidden = mode === 'auto';
    toggle.setAttribute('aria-label', mode === 'oculta' && handCount >= 0 ? `${text} (${handCount} ${handCount === 1 ? 'carta' : 'cartas'})` : text);
    toggle.title = text;
    toggle.classList.toggle('shown', mode === 'fixa');
    const count = toggle.querySelector<HTMLElement>('.hand-count')!;
    count.hidden = mode !== 'oculta' || handCount < 0;
    count.textContent = String(Math.max(0, handCount));
    // Com a mão oculta, carta nova na mão faz a seta brilhar, para a compra não passar despercebida.
    if (mode === 'oculta' && handCountSeen >= 0 && handCount > handCountSeen) { toggle.classList.remove('arrived'); void toggle.offsetWidth; toggle.classList.add('arrived'); }
    handCountSeen = handCount;
    placeHandControls();
  }
  /**
   * Os botões ficam centralizados acima da mão, logo acima do topo das cartas em repouso (sem contar o mouse por cima,
   * que sobe a mão automática ou uma carta): as medidas sem transformação (offset*) não mudam com isso.
   */
  function placeHandControls() {
    const box = $('#fHandMode'), hand = $('#fHand');
    if (!box.offsetParent || !hand.offsetParent) return;
    const mode = client?.state?.watching ? watchHandMode : handMode;
    const arenaHeight = (box.offsetParent as HTMLElement).clientHeight;
    const slot = hand.querySelector<HTMLElement>('.hand-slot');
    const peek = parseFloat(getComputedStyle(hand).getPropertyValue('--peek-visible')) || 50;
    // Mão fixa: o topo das cartas e dos selos de custo dentro da mão, somado ao lugar da mão sem o deslizar (que pode
    // estar no meio da animação de abrir).
    const drawnTop = () => {
      const handTop = hand.getBoundingClientRect().top;
      return hand.offsetTop + Math.min(...[...hand.querySelectorAll<HTMLElement>('.hcard, .hcost')].map(el => el.getBoundingClientRect().top - handTop));
    };
    const cardsTop = !slot || mode === 'oculta' ? arenaHeight - 6
      : mode === 'auto' ? arenaHeight - peek - 14
      : drawnTop();
    box.style.left = `${Math.round(hand.offsetLeft + hand.offsetWidth / 2)}px`;
    box.style.top = `${Math.round(Math.max(4, cardsTop - box.offsetHeight - 8))}px`;
  }
  function applyHandMode(next: HandMode) {
    if (client?.state?.watching) watchHandMode = next;
    else {
      handMode = next;
      try { localStorage.setItem(KEYS.hand, next); localStorage.removeItem(KEYS.handHide); } catch { /* Storage is optional. */ }
    }
    syncHandMode(!!client?.state?.watching);
  }

  function renderTable(ingest: boolean) {
    const s = client?.state;
    if (!s || s.type !== 'state') return;
    fixForgeText(s);
    passLevel.observe(s.preferences, !!client?.connected && !match.disconnected);
    opponentStops.observe(s.preferences, !!client?.connected && !match.disconnected); stops.sync();
    if (s.spectating) { turnNotice.reset(); turnBuzz.reset(); } else { turnNotice.observe(s); turnBuzz.observe(s); }
    const savedFocus = focusSnapshot();
    const scrollPositions = new Map([...root.querySelectorAll<HTMLElement>('.row, .hand, .exile-shelf-track, .table-seat > .field')].map(el => [el.id, { left: el.scrollLeft, top: el.scrollTop }]));
    const silently = silentNext || document.hidden;
    if (ingest) {
      const beforeCurrent = timeline.current;
      timeline.ingest(s.matchId ?? s.session?.code ?? 'local', s.events ?? [], { silent: silently, cursor: s.eventCursor });
      silentNext = false;
      removals.collect(s);
      if (beforeCurrent && !timeline.current) { clearTimeout(presentationTimer); motion.cancelPresentation(); }
      if (silently || hasLiveDecision(s)) displayFrame = null;
      if (!timeline.current && timeline.queued) { advancePresentation(); return; }
    }
    if (!validBlockSelection(s, match.selectedBlocker)) match.selectedBlocker = null;
    const visual = stateWithFrame(s, displayFrame);
    trackPlayerCounters(visual.players);
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

    $('#fOpponents').hidden = !multiplayer;
    const matchKey = s.matchId ?? s.session?.code ?? '';
    if (matchKey !== seats.match) { seats = newSeatState(matchKey); match.handOrder = []; }
    const followed = followSeats(visual, opponents, seatMemory());
    seats.hidden = new Set(followed.memory.hidden); seats.solo = followed.memory.solo; seats.retired = followed.memory.retired; seats.focus = followed.memory.focus;
    // O aviso do que a mesa mudou sozinha vai junto com o anúncio do pedido atual, no fim da renderização.
    const seatNotice = s.spectating ? '' : followed.notices.join(' ');
    const shownSeats = visibleSeats(visual, opponents, { hidden: seats.hidden, solo: seats.solo });
    seatTurn = seatTurnChange(seatTurnPlayer, visual);
    seatTurnPlayer = visual.gameOver ? null : visual.activePlayer;
    // Ocultos viram uma coluna estreita; o espaço que sobra vai para os campos à vista.
    $('#fOpponents').style.gridTemplateColumns = opponents.map(p => shownSeats.has(p.id) ? 'minmax(0, 1fr)' : 'var(--collapsed-seat)').join(' ');
    $('#fOpponents').dataset.shown = String(shownSeats.size);
    setHTML($('#fOpponents'), multiplayer ? opponents.map((player, i) => shownSeats.has(player.id)
      ? opponentSeat(seatView(), visual, player, i, opponents.length, forcedSeatReason(visual, player)) : collapsedSeat(seatView(), visual, player, i)).join('') : '');
    const command = $('#fCommand');
    command.hidden = !(me.commanders?.length);
    setHTML(command, command.hidden ? '' : `<span class="command-heading">Comando</span><div class="command-track">${commandCards(seatView(), s, me)}</div>${damageButton(me)}`);
    setHTML($('#fOppHand'), multiplayer ? '' : oppHandHTML(opp, c => face(c, 'small'), label));
    $('#fOppHand').classList.toggle('revealed', !multiplayer && revealedCards(opp).length > 0);
    setHTML($('#fOppAvatar'), multiplayer ? '' : avatar(seatView(), visual, opp, 1) + focusButton(opp, ' duel-focus'));
    setHTML($('#fMeAvatar'), avatar(seatView(), visual, me, 0));
    setHTML($('#fOppPiles'), multiplayer ? '' : piles(seatView(), visual, opp) + (opp.commanders?.length ? `<div class="duel-command">${commandCards(seatView(), s, opp)}${damageButton(opp)}</div>` : ''));
    setHTML($('#fMePiles'), piles(seatView(), visual, me));
    setHTML($('#fOppLands'), multiplayer ? '' : backRow(boardView(), visual, opp));
    setHTML($('#fMeLands'), backRow(boardView(), visual, me));
    setHTML($('#fOppCreatures'), multiplayer ? '' : fieldRow(boardView(), visual, opp.battlefield.filter(c => !isBackRow(c))));
    setHTML($('#fMeCreatures'), fieldRow(boardView(), visual, me.battlefield.filter(c => !isBackRow(c))));
    syncMat($('#fOppMat'), multiplayer ? undefined : matArt(s, opp, 1));
    const focusPlayers = visual.players.filter(p => p.id !== visual.you && !p.eliminated);
    const focused = focusPlayers.find(p => p.id === focusSeat);
    if (focusSeat !== null && !focused) focusSeat = null;
    const focusView = $('#fFocus');
    focusView.hidden = !focused;
    setHTML(focusView, focused ? focusHTML(seatView(), s, visual, focused, focusPlayers, visual.players.filter(p => p.id !== visual.you).indexOf(focused) + 1) : '');
    syncMat($('#fMeMat'), matArt(s, me, 0));
    fitLoneRows(root);
    fitRowWidths(root);

    // Cartas do cemitério utilizáveis continuam na mão; o exílio tem seu próprio espaço.
    const extra = outsideHand(s);
    // A mão segue a ordem que o jogador arrumou: a comprada entra no fim e a jogada sai sem mexer no resto.
    match.handOrder = arrangeHand(match.handOrder, me.hand.map(c => c.id));
    const inHand = new Map(me.hand.map(c => [c.id, c]));
    // Mão cheia: cópias iguais (mesmo nome e custo, sem marcadores, as duas jogáveis ou não) viram uma pilha no lugar da
    // primeira. Não agrupa quando a mesa pede para escolher cartas da mão nem no começo da partida.
    const grouping = !s.watching && me.hand.length >= HAND_GROUP_FROM && !s.input.selection && !s.input.opening && !s.question;
    handGroups = grouping ? groupHand(match.handOrder, id => {
      const c = inHand.get(id)!;
      return c.faceDown || Object.values(c.counters ?? {}).some(Boolean) || selectedForInput(s, id) ? null : `${c.name}|${c.manaCost ?? ''}|${usable(s, id)}`;
    }) : null;
    const fan: HandFanItem[] = [...(handGroups ?? match.handOrder.map(id => [id])).map(ids => ({ c: inHand.get(ids[0])!, tag: '', copies: ids })), ...extra];
    $('#fHand').classList.toggle('crowded', fan.length > 7);
    syncHandMode(!!s.watching, me.hand.length);
    const drawsAhead = timeline.pendingDraws(s.you) + drawingNow > 0 && match.handPrimed && !suppressOpeningPreview(s) && timeline.history.some(e => e.type === 'turn');
    for (const [id, at] of match.arriving) if (at <= performance.now()) match.arriving.delete(id);
    const incoming = (id: number) => (drawsAhead && !match.knownHand.has(id)) || match.arriving.has(id);
    setHTML($('#fHand'), handHTML(s, fan, { face: c => face(c, 'normal'), incoming, playerName }));
    // Quem assiste não vê a mão de ninguém: a de baixo também fica de costas, só com a quantidade.
    if (s.watching) setHTML($('#fHand'), hiddenHandHTML(me));
    match.knownHand = new Set([...match.handOrder, ...extra.map(({ c }) => c.id)].filter(id => !incoming(id) || match.arriving.has(id)));
    placeHandControls();
    match.handPrimed = true;

    renderExileShelf(s);
    renderActivity();

    // De quem é o turno: etiqueta no trilho de fases e contorno na metade da mesa do jogador ativo (no Commander,
    // o assento do oponente da vez ganha o contorno no próprio desenho dos assentos).
    root.querySelector('.field.me')!.classList.toggle('turn', turnHighlight(visual, me.id) === 'mine');
    root.querySelector('.field.opp')!.classList.toggle('turn', !multiplayer && turnHighlight(visual, opp.id) === 'theirs');
    // Com vários jogadores, o retrato de quem joga o turno vai junto da trilha (mesmo índice dos retratos dos assentos).
    const activeSeat = !multiplayer ? -1 : visual.activePlayer === me.id ? 0 : opponents.findIndex(p => p.id === visual.activePlayer) + 1;
    setHTML($('#fPhases'), phaseHudHTML(visual, activeSeat >= 0 ? portraits[activeSeat] : undefined, { value: opponentStops.supported ? opponentStops.value : [], editable: stops.editable(), open: stops.group }));
    // O botão da mão automática mora ao lado do relógio do turno; a trilha é redesenhada, então ele volta para lá.
    const phases = $('#fPhases'), handAuto = handAutoButton, timer = phases.querySelector('.phase-timer');
    if (timer && handAuto.previousElementSibling !== timer) timer.after(handAuto);
    syncTrailTip();
    if (lastDayTime && visual.dayTime && visual.dayTime !== lastDayTime) root.querySelector('.phase-daynight')?.classList.add('bump');
    lastDayTime = visual.dayTime;
    stops.place();
    clocks.sync(visual);

    // Carta que o prompt cita mas que não está à vista na mesa (topo do grimório na vidência/vigilância).
    // A carta que vota fica à vista mesmo estando na pilha: é ela que explica o voto.
    // Na escolha de alvos (antes da pilha), a carta que pede o alvo aparece mesmo no campo, com a habilidade e o que falta.
    // A do topo do grimório conta como fora de vista: enquanto se olha (vidência 1, vigilância 1) ela vem também como
    // topo do monte, que é só uma miniatura.
    // Em qualquer outra decisão fora da prioridade (pagar, confirmar, escolher cartas ou jogadores para um custo ou para
    // o que um efeito pede ao resolver), a carta que pede também aparece, mesmo no campo ou entre as opções.
    const choosingTargets = !!s.input.targeting && !s.input.paying && !s.input.vote && !s.gameOver;
    root.querySelector('.arena')!.classList.toggle('choosing-targets', choosingTargets);
    const pc = s.input.vote?.card ?? (choosingTargets ? s.input.targeting!.card : undefined) ?? s.input.card ?? s.input.targeting?.card;
    const decision = cardDecision(s);
    const onLibraryTop = !!pc && s.players.some(p => p.libraryTop?.id === pc.id);
    const deciding = !s.gameOver && !s.question && !s.input.priority && !s.input.vote && !s.input.opening && !s.input.attacking && !s.input.blocking;
    const targetSource = !!pc && (choosingTargets ? pc.id === s.input.targeting!.source : deciding && !onLibraryTop);
    const promptCard = !s.input.suspendCast && pc && !pc.faceDown && pc.name && (!!s.input.vote || targetSource || onLibraryTop || !findCard(pc.id, false))
      ? targetSource
        ? `<div class="prompt-card target-source-card" data-peek="${pc.id}" role="button" tabindex="0" aria-label="Inspecionar ${esc(label(pc))}">${face(pc, 'normal')}</div>`
        : `<div class="prompt-card" data-peek="${pc.id}">${face(pc, 'normal')}</div>` : '';
    const targetInfo = choosingTargets ? targetInfoOf(actionView(), s) : null;
    $('#fAction').classList.toggle('target-source', !!promptCard && targetSource);
    const opening = s.input.opening;
    const moment = tableMoment(s);
    if (moment && !playedMoments.has(moment.key)) { playedMoments.add(moment.key); audio.cue(moment.cue, .9); }
    const prompt = s.gameOver ? '' : s.input.attacking ? attack.allGen !== null ? 'Atacar com tudo: escolha quem atacar.' : attack.selected.size ? `${attack.selected.size} ${attack.selected.size === 1 ? 'criatura selecionada' : 'criaturas selecionadas'}: escolha quem atacar.` : attack.pinned ? `Atacar ${attack.defenderName(s, attack.pinned)}: escolha suas criaturas. Limpe a seleção para escolher as cartas primeiro.` : 'Selecione suas criaturas e escolha quem atacar, ou escolha o defensor primeiro.'
      : s.input.commanderMove ? `${s.input.commanderMove.card ? label(s.input.commanderMove.card) : 'Seu comandante'} ${s.input.commanderMove.stays ? 'está n' : 'iria para '}${zoneWithArticle(s.input.commanderMove.to)}. Para onde vai?`
      : s.input.suspendCast ? 'Suspender: conjure agora sem pagar o custo de mana ou deixe a carta no exílio.'
      : s.input.blocking ? match.selectedBlocker ? `${label(findCard(match.selectedBlocker.blocker)!)}: escolha o atacante. Se já estiver bloqueando esse atacante, o clique remove o bloqueio.` : 'Escolha uma criatura sua e depois o atacante que ela vai bloquear.'
      : s.input.vote ? voteBoardPrompt(actionView(), s.input.vote) : s.input.priority && !s.input.paying && !s.input.targeting ? '' : opening === 'starting-player' || opening === 'play-draw' || opening === 'mulligan' || (opening === 'mulligan-bottom' && s.input.openingReturnCount !== undefined) ? ''
      : opening === 'mulligan-bottom' ? s.input.message.replace(/(\d+)\s+carta\(s\)/g, (_, n: string) => `${n} ${Number(n) === 1 ? 'carta' : 'cartas'}`)
      : s.input.tapToPay ? tapToPayMessage(s.input.tapToPay, s.input.card ? label(s.input.card) : undefined) : s.input.message;
    $('#fAction').classList.toggle('suspend-choice', !!s.input.suspendCast);
    $('#fAction').classList.toggle('card-decision', !!decision);
    $('#fAction').classList.toggle('hand-decision', !!decision?.inHand);
    root.querySelector('.arena')!.classList.toggle('has-hand-decision', !!decision?.inHand);
    const instruction = decision ? selectionMessage(prompt) : prompt;
    // O Forge manda "Carta (id) - texto da habilidade" antes do pedido; o pedido vem primeiro para não sumir no texto recolhido.
    const sourceFirst = decision ? null : instruction.match(/^(.+ \(\d+\) - [\s\S]*?)\n\n([\s\S]+)$/);
    const lines = (sourceFirst ? `${sourceFirst[2]}\n\n${sourceFirst[1]}` : instruction).split('\n');
    const heading = decision ? `<h2 class="decision-heading">${esc(withoutCardIds(lines.length > 1 ? lines.shift()! : 'Sua escolha'))}</h2>` : '';
    const prolifPanel = isProliferating(s) ? proliferatePanelHTML(s, proliferateNames(actionView(), s)) : '';
    const selectionCount = decision && !prolifPanel ? `<div class="decision-progress" role="status"><strong>${esc(decision.progress)}</strong><span>${esc(decision.instruction)}</span></div>` : '';
    shownInstruction = instruction;
    const expanded = !!instruction && expandedPrompt === instruction;
    const more = `<button class="prompt-more" data-ui="prompt-more" aria-controls="fPrompt" aria-expanded="${expanded}" hidden>${expanded ? 'Ver menos' : 'Ver detalhes'}</button>`;
    const attackPanel = attack.panelHTML(s);
    const myForecast = s.input.blocking ? s.forecast?.find(f => f.player === s.you) : undefined;
    const blockForecast = myForecast ? forecastLineHTML(myForecast, cardName) : '';
    $('#fAction').classList.toggle('attack-choosing', !!attackPanel);
    $('#fAction').classList.toggle('proliferating', !!prolifPanel);
    // Frase curta sempre à vista; o texto do Forge (habilidade inteira, pedido em inglês) fica em "Ver detalhes".
    const short = decision || !instruction ? null : shortInstruction(s.input.paying ? { ...s.input, reserve: poolCost(s.players.find(p => p.id === s.you)?.pool) } : s.input, name => ptOf(name)?.name || name);
    const forgeText = richText(lines.join('\n')).replace(/\n/g, '<br>');
    const promptBody = short ? `<strong class="prompt-short">${richText(short)}</strong><span class="prompt-forge"><br><br>${forgeText}</span>` : forgeText;
    const targetPanel = targetInfo && !decision ? targetInfoHTML(targetInfo) : '';
    setHTML($('#fAction'), `${promptCard}<div class="decision-copy">${heading}<div class="prompt${expanded ? ' expanded' : ''}${short ? ' has-short' : ''}" id="fPrompt">${promptBody}</div>${more}</div>${targetPanel}${selectionCount}${prolifPanel}${attackPanel}${blockForecast}<div class="btns">${buttons(actionView(), s)}</div>${passLevelControl(actionView(), s)}`);
    settings.syncPassLevel();
    attack.syncPanelShift();
    // "Ver detalhes" só aparece quando o texto não cabe nas linhas da caixa.
    const promptEl = root.querySelector<HTMLElement>('#fPrompt');
    const moreEl = root.querySelector<HTMLElement>('[data-ui="prompt-more"]');
    if (promptEl && moreEl) moreEl.hidden = !expanded && !short && promptEl.scrollHeight <= promptEl.clientHeight + 1;
    // O pedido é o último parágrafo do Forge ("Carta (id) - habilidade" vem antes); sem o número da carta.
    const request = instruction.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean).pop() ?? '';
    const awaiting = renderAwaiting(s, isProliferating(s) ? 'Proliferar: marque o que ganha marcadores'
      : s.input.tapToPay ? tapToPayShort(s.input.tapToPay, s.input.card ? label(s.input.card) : undefined) : short ?? withoutCardIds(request));
    // A previsão do combate vai junto: a cada bloqueio marcado ou desfeito, a frase muda e o leitor de tela lê de novo.
    const forecastSpoken = (s.forecast ?? []).map(f => forecastText(f, f.player === s.you ? null : s.players.find(p => p.id === f.player)?.name ?? 'O defensor', cardName)).join(' ');
    const targetSpoken = targetPanel && targetInfo ? ` ${targetInfoText(targetInfo)}` : '';
    announce([seatNotice, instruction ? `${awaiting ? 'Sua decisão. ' : ''}${short ? spokenMana(short) : withoutCardIds(instruction)}${targetSpoken}${decision ? ` ${decision.progress}. ${decision.instruction}` : ''}` : (opening === 'play-draw' || opening === 'starting-player' ? 'Escolha quem joga primeiro.' : opening === 'mulligan' ? `Mão inicial: ${me.hand.length} cartas.` : opening === 'mulligan-bottom' ? `Cartas a devolver: ${s.input.openingReturnRemaining ?? s.input.openingReturnCount ?? 0}.` : ''), forecastSpoken].filter(Boolean).join(' '));

    const qEl = $('#fQuestion');
    if (s.question && !s.gameOver) {
      if (minimizedQuestion !== null && minimizedQuestion !== s.question.id) minimizedQuestion = null;
      const minimized = questionMinimized();
      qEl.classList.toggle('minimized', minimized);
      // Escolha grande de cartas redesenhada (uma carta marcada, um filtro): continua onde estava, sem entrar de novo.
      const before = qEl.querySelector<HTMLElement>('.question');
      const typingName = document.activeElement?.id === 'fQNameSearch';
      const again = isFilterableChoice(s.question) && Number(before?.dataset.qid) === s.question.id ? before!.scrollTop : null;
      // Fileira de cartas (celular): marcar uma carta redesenha a escolha, mas a fileira fica onde estava.
      const rows = Number(before?.dataset.qid) === s.question.id ? rowScroll(before) : [];
      setHTML(qEl, minimized ? questionBar(s.question) : `<div class="question${isTriggerOrder(s.question) ? ' trigger-order' : isLibraryChoice(s.question) ? ' library-choice' : isPilesSplit(s.question) || isPilesChoice(s.question) ? ' piles' : isPlayMode(s.question) ? ' play-mode' : isCombatDamage(s.question) ? ' combat-damage' : ''}${again !== null ? ' settled' : ''}" data-qid="${s.question.id}" role="dialog" aria-modal="true" aria-label="${esc(s.question.title)}">${questionHTML(s.question)}</div>`);
      const after = qEl.querySelector<HTMLElement>('.question');
      if (s.question.kind === 'reveal' && !minimized && after && Number(before?.dataset.qid) !== s.question.id) motion.revealIn([...after.querySelectorAll<HTMLElement>('.q-face')]);
      if (again !== null && after && after !== before) after.scrollTop = again;
      if (after && after !== before) restoreRowScroll(after, rows);
      // A busca de nomes recebe o foco ao abrir e o mantém quando a escolha é redesenhada no meio da digitação.
      const nameSearch = after && after !== before ? after.querySelector<HTMLInputElement>('#fQNameSearch') : null;
      if (nameSearch && (typingName || Number(before?.dataset.qid) !== s.question.id)) {
        nameSearch.focus({ preventScroll: true });
        nameSearch.setSelectionRange(nameSearch.value.length, nameSearch.value.length);
      }
      qEl.hidden = false;
      syncAllRowEdges(qEl);
    } else {
      if (!qEl.hidden && !qEl.classList.contains('minimized')) leaveOverlay(qEl);
      qEl.hidden = true;
      qEl.classList.remove('minimized');
      match.qState = null;
      minimizedQuestion = null;
    }

    const newTurn = s.turn !== match.lastTurn && !s.gameOver && s.turn > 0;
    // Um combate extra começando ganha a mesma faixa, no mesmo turno.
    const combatKey = `${s.turn}:${s.combatNumber ?? 0}`;
    const extraCombatStarts = !newTurn && !s.gameOver && (s.combatNumber ?? 0) > 1 && combatKey !== lastCombat;
    if (s.combatNumber) lastCombat = combatKey;
    if (newTurn || extraCombatStarts) {
      match.lastTurn = s.turn;
      showBanner(s, newTurn);
    }

    countLife();

    syncMatchMenu(root, s, { multiplayer, labClose: !!opts.onLabClose, setHTML });
    // O voto que a mesa espera de você vai para o centro; a faixa do alto fica com o resto (quem falta, quem caiu).
    const vote = voteDialog(s);
    const skipBar = skipBarHTML(s, vote?.kind === 'skip') + (vote?.kind === 'undo' ? '' : undoBarHTML(s));
    const voteEl = $('#fVote');
    if (vote) {
      setHTML(voteEl, vote.html);
      voteEl.hidden = false;
      if (vote.key !== lastVoteKey) { audio.cue('turn-self', .45); turnBuzz.nudge(); }
    } else voteEl.hidden = true;
    lastVoteKey = vote?.key ?? '';
    setHTML($('#fSkipBar'), skipBar);
    $('#fSkipBar').hidden = !skipBar;
    $('#fMatchBar').hidden = multiplayer || !$('#fMatchBar').hasChildNodes();

    if (!s.gameOver) match.observing = false;
    // Fim da partida visto ao vivo: antes do resultado, o retrato de quem perdeu racha e o de quem ganhou acende.
    const overKey = s.gameOver ? `${timeline.matchId}:${s.match?.gameNumber ?? 1}` : '';
    if (s.gameOver && overKey !== finaleKey) {
      finaleKey = overKey;
      if (wasPlaying && !s.match?.abandoned && !match.disconnected) {
        const winners = s.players.filter(p => s.winner && p.name === s.winner).map(p => p.id);
        const losers = s.winner ? s.players.filter(p => p.name !== s.winner).map(p => p.id) : [];
        const ms = motion.finale(winners, losers);
        if (ms) { finaleUntil = performance.now() + ms; window.setTimeout(() => render(), ms + 20); }
      }
    }
    wasPlaying = !s.gameOver;
    const ov = $('#fOverlay');
    if (s.sideboarding && !match.disconnected && !s.match?.over) {
      setHTML(ov, sideboardingHTML(s));
      ov.hidden = false;
    } else if (s.gameOver && !match.disconnected && match.observing) {
      ov.hidden = true; ov.dataset.html = '';
    } else if (s.gameOver && !match.disconnected && performance.now() < finaleUntil) {
      ov.hidden = true; ov.dataset.html = '';
    } else if (s.gameOver && !match.disconnected) {
      const result = gameResult(s);
      const summary = gameSummaryHTML(s, name => ptOf(name)?.name || name);
      const html = resultHTML(s, { result, summary, still: !ov.hidden, lab: !!s.room?.lab && !!opts.onLabClose, feedback: !!opts.onFeedback });
      if (ov.hidden || ov.dataset.html !== html) { ov.innerHTML = html; ov.dataset.html = html; }
      ov.hidden = false;
    } else if (!match.disconnected) { ov.hidden = true; ov.dataset.html = ''; }

    syncGraveyardTargeting(s);
    if (match.zoneOf !== null || match.groupIds) zoneView(s);
    removals.sync(s);
    root.querySelectorAll<HTMLElement>('[data-fid],[data-pid],[data-mana]').forEach(el => { el.dataset.gen = String(el.closest('.field,.avatar-slot') ? visual.input.gen : s.input.gen); });
    // Covered identical copies stay reachable through the group chooser, without dozens of duplicate Tab stops.
    root.querySelectorAll<HTMLElement>('.field .stack').forEach(stack => {
      const slots = [...stack.querySelectorAll<HTMLElement>(':scope > .slot')];
      slots.slice(0, -1).forEach(slot => slot.querySelectorAll<HTMLElement>('[tabindex],.inspect-card').forEach(el => { el.tabIndex = -1; }));
    });
    root.querySelectorAll<HTMLElement>('.row, .hand, .exile-shelf-track, .table-seat > .field').forEach(el => { const position = scrollPositions.get(el.id); el.scrollLeft = position?.left ?? 0; el.scrollTop = position?.top ?? 0; });
    applyOpeningPresentation(root, s);
    restoreFocus(savedFocus);
    syncModal();
    layoutCounters(root);
    layoutExileShelf(root);
    layoutCardDecision(root);
    layoutStack(root);
    syncSeatScroll(root);
    drawCombatArrows(root, visual);
    motion.play({ silent: silently || suppressOpeningPreview(s) || !!s.input.blocking || !!s.input.selection, semantic: !!s.events, paying: s.input.paying || payingBefore ? manaTone : undefined });
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
    drawTargetArrows(visual);
    match.lastDamage = new Map(s.players.flatMap(p => p.battlefield.map(c => [c.id, c.damage ?? 0] as [number, number])));
  }

  /** A cor da mana de um terreno (ou da carta que dá mana), para a mana que voa dele até o custo. */
  function manaTone(id: number) {
    const c = findCard(id);
    if (!c) return undefined;
    const text = `${c.typeLine ?? ''} ${c.name ?? ''}`;
    const tones = ([['Plains', '#f4ecc2'], ['Island', '#5cb3ff'], ['Swamp', '#b48ad1'], ['Mountain', '#ff7150'], ['Forest', '#58c878']] as const)
      .filter(([type]) => text.includes(type)).map(([, tone]): string => tone);
    if (!tones.length && !c.land) {
      const pips = new Set((c.manaCost ?? '').match(/[WUBRG]/g) ?? []);
      const byPip: Record<string, string> = { W: '#f4ecc2', U: '#5cb3ff', B: '#b48ad1', R: '#ff7150', G: '#58c878' };
      tones.push(...[...pips].map(p => byPip[p]));
    }
    return tones.length === 1 ? tones[0] : tones.length > 1 ? '#f2b54c' : '#dadada';
  }

  function findCard(id: number, withPrompt = true): FCard | undefined {
    const s = client?.state;
    if (!s) return undefined;
    for (const p of stateWithFrame(s, displayFrame).players) {
      for (const c of [...p.hand, ...p.battlefield, ...p.graveyard, ...p.exile, ...(p.commandZone ?? []), ...(p.emblems ?? []), ...(p.libraryTop ? [p.libraryTop] : []), ...revealedCards(p)]) if (c.id === id) return c;
    }
    const onStack = s.stack.find(si => si.source?.id === id)?.source;
    if (onStack) return onStack;
    if (!withPrompt) return undefined;
    if (s.input.card?.id === id) return s.input.card;
    if (s.input.vote?.card.id === id) return s.input.vote.card;
    if (s.question?.card?.id === id) return s.question.card;
    if (s.input.suspendCast?.card.id === id) return s.input.suspendCast.card;
    if (s.input.targeting?.card?.id === id) return s.input.targeting.card;
    for (const o of s.question?.options ?? []) if (typeof o !== 'string' && o.card?.id === id) return o.card;
    return undefined;
  }

  function showPreview(c: FCard | undefined, trigger?: HTMLElement, pinned = false, at?: { x: number; y: number }) {
    if (!pinned && (match.stackGalleryOpen || trigger?.closest('#fStack') || (client?.state && suppressOpeningPreview(client.state)))) return;
    const secret = !!c?.faceDown && !!c.hiddenFace?.name;
    const reminder = c ? faceDownReminder(c) : undefined;
    // Virada para baixo de outro jogador: a carta de lembrete, que só diz como ela foi virada (isso é público).
    if (c && reminder && !secret) {
      const card = { name: reminder.label, image: reminder.normal, text: reminder.text, typeLine: 'Criatura', power: c.power, toughness: c.toughness,
        basePower: c.basePower, baseToughness: c.baseToughness, counters: c.counters, damage: c.damage, keywords: c.keywords,
        notes: [`Virada para baixo (${reminder.label}): só quem a controla sabe qual carta é.`, ...permanentStatus(c, playerName, client?.state?.you).map(seal => seal.label)] };
      if (pinned) inspectCard(card, trigger); else showCardPreview(card, trigger, at);
      return;
    }
    if (c) c = seenFace(c);
    if (!c || c.faceDown || !c.name) { hideCardPreview(); return; }
    const source = c.emblem ? emblemSource(c) : c.name;
    const changed = permanentTypeChange(c);
    const card = { ...c, name: c.emblem ? emblemLabel(c) : c.name,
      image: c.image ?? image(source, 'normal', c.emblem ? undefined : c.print),
      text: ptOf(c.name)?.text || c.text,
      typeLine: c.emblem ? 'Emblema' : ptOf(c.name)?.type_line || c.printedType || c.typeLine,
      typeChange: changed ? typeChangeText(changed, c) : undefined,
      notes: [...(secret ? [`Virada para baixo${reminder ? ` (${reminder.label})` : ''}: só você pode ver qual carta é.`] : []), ...permanentStatus(c, playerName, client?.state?.you).map(seal => seal.label)] };
    if (pinned) inspectCard(card, trigger); else showCardPreview(card, trigger, at);
  }
  function cardFromElement(el: HTMLElement): FCard | undefined {
    if (el.dataset.event) return historyLog.card(el.dataset.event) ?? removals.card(el.dataset.event) ?? toasts.card(el.dataset.event);
    const stackId = el.dataset.stack ?? el.dataset.stackInspect;
    if (stackId !== undefined && client?.state) return (el.closest('#fStackGallery') ? client.state.stack : stackPresentation(client.state, timeline.current?.event).stack).find(item => item.id === Number(stackId))?.source;
    const id = el.dataset.inspect ?? el.dataset.fid ?? el.dataset.peek ?? el.dataset.qCard;
    return id === undefined ? undefined : findCard(Number(id));
  }

  const toasts = createToasts(root, { findCard: id => findCard(id), image, setHTML });
  function notice(text: string, error = false, detail?: NoticeDetail) {
    text = fixPossessives(text, playerNames());
    if (error) errors.record('aviso', text);
    if (error && client?.state?.input.attacking && attack.queue.busy) { attack.clear(true); renderTable(false); }
    if (error && client?.state?.sideboarding) { match.sideboardError = text; match.sideboardBusy = false; render(); }
    toasts.show(text, error, detail);
  }

  function sendInputAction(act: 'ok' | 'cancel' | 'pass-turn' | 'resolve-all', gen: number) {
    const s = client?.state;
    if (!client || !s || match.disconnected || gen !== s.input.gen || s.question) return;
    if (act === 'pass-turn' ? !s.input.priority || !s.input.ok.enabled || s.input.paying || s.input.targeting || s.activePlayer !== s.you || !!s.stack.length
      : act === 'resolve-all' ? !s.input.priority || !s.input.ok.enabled || s.input.paying || s.input.targeting || s.stack.length < 2
      : !s.input[act].enabled) return;
    if (gen === match.clickedGen && Date.now() - clickedAt < CLICK_LOCK_MS) return;
    if (s.input.attacking) {
      if (attack.allGen !== null) {
        if (act === 'cancel') { attack.clear(); renderTable(false); }
        return;
      }
      if (attack.queue.busy || (act === 'ok' && attack.selected.size)) return;
      if (act === 'cancel' && !s.combat.length) {
        const targets = legalAttackAllTargets(s, gen);
        attack.clear();
        if (!targets.length) { announce('Nenhuma criatura pode atacar um defensor permitido.'); return; }
        attack.allGen = gen;
        if (targets.length === 1) attack.choose(s, targets[0], gen);
        else { stopPresentation(); hideCardPreview(true); renderTable(false); }
        return;
      }
    }
    if (s.input.attacking) attack.clear();
    match.clickedGen = gen; clickedAt = Date.now(); match.selectedBlocker = null;
    stopPresentation(); hideCardPreview(true);
    client.send({ type: act, gen });
    render();
    setTimeout(() => { if (match.clickedGen === gen) render(); }, CLICK_LOCK_MS + 50);
  }

  // ---------- Eventos ----------
  /** O ícone da trilha mais perto de um toque no espaço entre eles (a trilha tem 44 px de altura no toque). */
  function nearestTrailItem(x: number): HTMLElement | null {
    let best: HTMLElement | null = null, dist = Infinity;
    for (const el of root.querySelectorAll<HTMLElement>('#fPhases [data-tip]')) {
      const r = el.getBoundingClientRect(), d = Math.abs(x - (r.left + r.width / 2));
      if (r.width && d < dist) { best = el; dist = d; }
    }
    return best;
  }
  const trailTipKey = (el: HTMLElement) => `${el.classList[0]}:${el.dataset.phase ?? ''}`;
  function syncTrailTip() {
    if (trailTip && trailTip.until < performance.now()) trailTip = null;
    for (const el of root.querySelectorAll<HTMLElement>('#fPhases [data-tip]')) el.classList.toggle('tip-open', trailTip?.key === trailTipKey(el));
  }
  function showTrailTip(el: HTMLElement) {
    const key = trailTipKey(el);
    trailTip = trailTip?.key === key ? null : { key, until: performance.now() + 3000 };
    clearTimeout(trailTipTimer);
    if (trailTip) trailTipTimer = window.setTimeout(syncTrailTip, 3050);
    syncTrailTip();
  }
  /** Ações de cada botão com data-ui, por grupo: cada tabela é consultada no ponto do clique em que esses botões eram testados. */
  type UiTable = Record<string, (t: HTMLElement, e: MouseEvent, ui: string) => void>;
  const runUi = (table: UiTable, ui: string | undefined, t: HTMLElement, e: MouseEvent) => {
    if (!ui || !Object.hasOwn(table, ui)) return false;
    table[ui](t, e, ui);
    return true;
  };
  const onPassUi: UiTable = {
    // Nível de passar automaticamente: o selo abre a troca rápida; fora do menu, ele fecha.
    'pass-level': (_t, e) => { passMenu.set(!passMenu.open, e.detail === 0); },
    'pass-turn-shortcut': () => { startPassingTurn(); },
    'pass-turn-stop': () => { if (client?.connected && !match.disconnected) client.send({ type: 'pass-turn-stop' }); passMenu.set(false, true); },
  };
  const onPromptUi: UiTable = {
    'prompt-more': () => { expandedPrompt = expandedPrompt === shownInstruction ? '' : shownInstruction; renderTable(false); },
    'question-minimize': (_t, _e, ui) => {
      minimizedQuestion = ui === 'question-minimize' ? client?.state?.question?.id ?? null : null;
      hideCardPreview(true); renderTable(false); syncModal();
      (ui === 'question-minimize' ? root.querySelector<HTMLElement>('[data-ui="question-restore"]') : modalStart($('#fQuestion')))?.focus({ preventScroll: true });
    },
    'question-restore': (t, e, ui) => onPromptUi['question-minimize'](t, e, ui),
    'focus-close': () => { closeFocus(); },
  };
  const onViewUi: UiTable = {
    'hand-auto': () => { applyHandMode(toggleAuto(client?.state?.watching ? watchHandMode : handMode)); },
    'hand-toggle': () => { applyHandMode(toggleShown(client?.state?.watching ? watchHandMode : handMode)); },
    'stack-size': () => { match.stackMinimized = !match.stackMinimized; hideCardPreview(true); renderTable(false); },
    'row-scroll': (t) => {
      const control = t.closest<HTMLElement>('[data-scroll-row]')!;
      const row = document.getElementById(control.dataset.scrollRow!);
      if (row) row.scrollBy({ left: Number(control.dataset.scrollDirection) * Math.max(60, row.clientWidth * .75), behavior: 'smooth' });
    },
  };
  const onPanelUi: UiTable = {
    'stack-close': () => { closeStackGallery(); },
    'stack-replay': (t) => {
      const pile = t.closest<HTMLElement>('[data-stack-replay]');
      if (pile) showPreview(cardFromElement(pile), pile, true);
    },
    'stack-open': () => {
      const s = client?.state;
      if (!s?.stack.length || s.question || s.gameOver || s.sideboarding || match.disconnected) return;
      stopPresentation(); hideCardPreview(true); match.stackGalleryOpen = true; renderTable(false);
      $('#fStackGallery').querySelector<HTMLElement>('.stack-gallery-card.actionable, .stack-gallery-card')?.focus({ preventScroll: true });
    },
    'settings': () => { settings.syncTurnNotice(); settings.syncPlaymat(); settings.syncDevice(); settings.set(true); },
    'awake': () => { screenWake.setEnabled(!screenWake.enabled); settings.syncDevice(); },
    'buzz': () => { turnBuzz.setEnabled(!turnBuzz.enabled); settings.syncDevice(); },
    'shortcuts': () => { openShortcuts(MATCH_SHORTCUTS); },
    'settings-close': () => { settings.set(false); },
    'playmat': () => { settings.togglePlaymat(); },
    'turn-notice': () => { void turnNotice.setEnabled(!turnNotice.enabled).then(settings.syncTurnNotice); },
    'mute': () => { audio.setMuted(!audio.settings.muted); settings.sync(); },
    'sideboard-ready': (_t, _e, ui) => {
      const sb = client?.state?.sideboarding;
      if (!client || !sb || sb.ready || match.sideboardBusy || !match.sideboardDraft || sb.id !== match.sideboardDraft.id) return;
      match.sideboardBusy = true; match.sideboardError = '';
      if (ui === 'next-game') client.send({ type: 'next-game', id: sb.id });
      else client.send({ type: 'sideboard', id: sb.id, deck: { name: 'Deck da partida', cards: match.sideboardDraft.main, sideboard: match.sideboardDraft.sideboard } });
      render();
    },
    'next-game': (t, e, ui) => onPanelUi['sideboard-ready'](t, e, ui),
  };
  const onActionUi: UiTable = {
    'removal-ok': () => { removals.close(); },
    'attack-clear': () => { attack.clear(); renderTable(false); },
    'attack-remove': () => { const s = client?.state; if (s) attack.removeSelected(s); },
    'menu': () => { setMenu($('#fMenu').hidden); },
    'version': (t) => {
      // A versão da mesa vem do topo das Novidades; ao tocar, alterna para as versões que a ponte informou.
      const button = t.closest<HTMLElement>('[data-ui="version"]')!;
      const bridge = button.getAttribute('aria-pressed') !== 'true';
      const s = client?.state;
      button.setAttribute('aria-pressed', String(bridge));
      button.textContent = bridge ? `Regras ${s?.rulesVersion ?? '?'} · Motor ${s?.engineVersion ?? '?'}` : `Mesa de Duelo ${VERSION}`;
    },
    'log': () => { errors.set(false); setLog($('#fLogDrawer').hidden, true); },
    'errors': () => { errors.set($('#fErrorsDrawer').hidden, true); },
    'feedback': () => { setMenu(false); opts.onFeedback?.({ kind: 'sugestao' }); },
    'watchable': () => { setMenu(false); const listed = !!client?.state?.audience?.listed; client?.send({ type: 'watchable', on: !listed }); },
    'result-report': () => { opts.onFeedback?.({ kind: 'erro' }); },
    'errors-report': () => { opts.onFeedback?.({ kind: 'erro', attach: true, diagnostics: errors.report() }); },
    'errors-download': () => { errors.download(); },
    'errors-clear': () => { errors.clear(); },
    'errors-copy': () => { errors.copy(); },
    'fullscreen': () => { void toggleFullscreen(); },
    'undo': () => { const state = client?.state; if (state && !undoButtonState(state).disabled) client!.send({ type: 'undo-request' }); },
    'watch-player': (t) => {
      const player = Number(t.closest<HTMLElement>('[data-player]')?.dataset.player);
      if (client?.state?.watching && Number.isInteger(player) && player !== client.state.you) client.send({ type: 'watch-player', player });
    },
    'exit': () => {
      if (client?.state?.watching) { stopPresentation(); hideCardPreview(true); turnNotice.reset(); opts.onExit(); return; }
      if (client?.state?.gameOver || match.disconnected || confirm(client?.state?.room ? 'Desistir e sair da sala?' : 'Desistir desta partida?')) { stopPresentation(); hideCardPreview(true); turnNotice.reset(); client?.send({ type: 'concede' }); opts.onExit(); }
    },
    'lab-close': () => { if (client?.state?.gameOver || match.disconnected || confirm('Fechar a sala de teste? A partida acaba para os dois lados.')) { stopPresentation(); hideCardPreview(true); turnNotice.reset(); opts.onLabClose?.(); } },
    'rematch': () => { setMenu(false); opts.onRematch(); },
    'observe': (_t, _e, ui) => { match.observing = ui === 'observe'; render(); if (!match.observing) ($('#fOverlay').querySelector('[data-ui="observe"]') as HTMLElement | null)?.focus(); },
    'result': (t, e, ui) => onActionUi['observe'](t, e, ui),
    'zone-close': () => { closeZone(); },
  };
  root.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const ui = t.closest<HTMLElement>('[data-ui]')?.dataset.ui;
    // Na trilha de fases, tocar num ícone sem ação (turno, relógios, dia e noite, fases) mostra o nome dele por um
    // instante: no toque não existe o passar do mouse.
    // Gráfico de vida no fim do jogo: no toque, a coluna tocada mostra a vida de todos naquele turno.
    const lifeCol = t.closest<SVGGElement>('.lc-col');
    if (lifeCol) { for (const col of root.querySelectorAll('.lc-col.on')) if (col !== lifeCol) col.classList.remove('on'); lifeCol.classList.toggle('on'); return; }
    let tipped = t.closest<HTMLElement>('#fPhases [data-tip]');
    if (!tipped && !t.closest('button') && t.closest('#fPhases')) tipped = nearestTrailItem(e.clientX);
    if (tipped && !t.closest('button')) {
      const button = tipped.querySelector<HTMLButtonElement>('button');
      if (button) button.click(); else showTrailTip(tipped);
      return;
    }
    // Paradas no turno do oponente: o ícone da trilha abre o menu do grupo; fora dele, o menu fecha.
    const stopGroup = t.closest<HTMLElement>('[data-stop-group]')?.dataset.stopGroup;
    if (stopGroup) { stops.set(stops.group === stopGroup ? null : stopGroup, e.detail === 0); return; }
    const stop = t.closest<HTMLElement>('#fStopMenu [data-stop]');
    if (stop) { if (stops.editable()) opponentStops.toggle(stop.dataset.stop!); stops.sync(); render(); return; }
    if (stops.group && !t.closest('#fStopMenu')) stops.set(null);
    if (runUi(onPassUi, ui, t, e)) return;
    const level = t.closest<HTMLElement>('#fPassMenu [data-pass-level]')?.dataset.passLevel;
    if (level) { if (client?.connected && !match.disconnected && isPassLevel(level)) passLevel.change(level); passMenu.set(false, true); render(); return; }
    if (passMenu.open && !t.closest('#fPassMenu')) passMenu.set(false);
    if (runUi(onPromptUi, ui, t, e)) return;
    const focusTo = t.closest<HTMLElement>('[data-focus-seat]')?.dataset.focusSeat;
    if (focusTo !== undefined) { openFocus(Number(focusTo)); return; }
    // Na tela de foco, tocar numa carta só mostra; cemitério, exílio e dano de comandante abrem a lista para ver.
    if (t.closest('#fFocus')) {
      const card = t.closest<HTMLElement>('[data-fid],[data-peek],[data-inspect]');
      if (card && !t.closest('[data-gy] [data-peek]')) { showPreview(cardFromElement(card), card, true); return; }
      if (!t.closest('[data-gy]')) return;
    }
    // Com a escolha recolhida, a mesa é só para olhar: inspecionar, ver cemitério e menu, sem jogar nada.
    if (questionMinimized() && !t.closest('#fQuestion, #fMenu, .log-drawer, [data-ui], [data-inspect], [data-peek], [data-gy], [data-stack-inspect]')) return;
    const seatSolo = t.closest<HTMLElement>('[data-seat-solo]')?.dataset.seatSolo;
    const seatHide = t.closest<HTMLElement>('[data-seat-hide]')?.dataset.seatHide;
    const seatShow = t.closest<HTMLElement>('[data-seat-show]')?.dataset.seatShow;
    if (seatSolo !== undefined || seatHide !== undefined || seatShow !== undefined) {
      const name = (id: number) => client?.state?.players.find(p => p.id === id)?.name ?? 'Oponente';
      let message: string;
      // Escolha do jogador durante o foco no atacante: fica valendo depois do turno dele.
      seats.focus = manualSeatChoice(seatMemory()).focus;
      if (seatSolo !== undefined) {
        const id = Number(seatSolo);
        seats.solo = seats.solo === id ? null : id;
        message = seats.solo === null ? 'Mostrando todos os oponentes.' : `Mostrando só o campo de ${name(id)}. Os outros oponentes ficaram ocultos.`;
      } else if (seatHide !== undefined) {
        seats.hidden.add(Number(seatHide)); message = `Campo de ${name(Number(seatHide))} oculto.`;
      } else {
        const id = Number(seatShow);
        // "Mostrar" num "só este" desfaz o isolamento; fora dele, só tira o oponente da lista de ocultos.
        if (seats.solo !== null) { seats.hidden = new Set(client?.state?.players.filter(p => p.id !== seats.solo && p.id !== id && p.id !== client?.state?.you).map(p => p.id)); seats.solo = null; }
        seats.hidden.delete(id); message = `Campo de ${name(id)} à vista.`;
      }
      renderTable(false);
      // A renderização anuncia o pedido atual; o aviso da troca vem depois para não ser apagado.
      announce(message);
      const seat = seatShow ?? seatSolo ?? seatHide;
      const focus = root.querySelector<HTMLElement>(`[data-seat-player="${seat}"] [data-seat-solo]`) ?? root.querySelector<HTMLElement>(`[data-seat-player="${seat}"] [data-seat-show]`);
      focus?.focus({ preventScroll: true });
      return;
    }
    if (runUi(onViewUi, ui, t, e)) return;
    if (!t.closest('#fMenu') && ui !== 'menu') setMenu(false);
    if (runUi(onPanelUi, ui, t, e)) return;
    if (t.id === 'fStackGallery') { onPanelUi['stack-close'](t, e, 'stack-close'); return; }
    if (t.id === 'fSettings') { onPanelUi['settings-close'](t, e, 'settings-close'); return; }
    const swap = t.closest<HTMLElement>('[data-sb-main],[data-sb-side]');
    if (swap && match.sideboardDraft && !match.sideboardBusy && !client?.state?.sideboarding?.ready) {
      const fromMain = swap.hasAttribute('data-sb-main');
      const source = fromMain ? match.sideboardDraft.main : match.sideboardDraft.sideboard;
      const target = fromMain ? match.sideboardDraft.sideboard : match.sideboardDraft.main;
      const index = Number(fromMain ? swap.dataset.sbMain : swap.dataset.sbSide);
      const entry = source[index];
      if (entry) { const existing = target.find(c => c.name === entry.name && c.set === entry.set && c.cn === entry.cn); if (existing) existing.count++; else target.push({ name: entry.name, count: 1, ...(entry.set ? { set: entry.set, cn: entry.cn } : {}) }); if (--entry.count === 0) source.splice(index, 1); match.sideboardError = ''; render(); }
      return;
    }
    const sbInspect = t.closest<HTMLElement>('[data-sb-inspect]');
    if (sbInspect) { inspectCard({ name: sbInspect.dataset.sbInspect }, sbInspect); return; }
    const logToggle = t.closest<HTMLElement>('[data-log-toggle]');
    if (logToggle) {
      const key = logToggle.dataset.logToggle!;
      historyLog.toggle(key, logToggle.getAttribute('aria-expanded') !== 'true'); restoreLogFocus(key);
      return;
    }
    const inspecting = t.closest<HTMLElement>('[data-inspect],[data-event],[data-stack-inspect]');
    if (inspecting) { showPreview(cardFromElement(inspecting), inspecting, true); return; }
    const stackTarget = t.closest<HTMLElement>('[data-stack]');
    if (stackTarget && client?.state) {
      const id = Number(stackTarget.dataset.stack);
      if (!renderedInputIsCurrent(stackTarget)) return;
      if (!client.state.stack.some(item => item.id === id)) return;
      if (!client.state.question && client.state.input.selectableStacks?.includes(id)) {
        stopPresentation(); client.send({ type: 'stack', id, gen: Number(stackTarget.dataset.gen) });
        if (match.stackGalleryOpen) closeStackGallery();
      } else showPreview(cardFromElement(stackTarget), stackTarget, true);
      return;
    }
    const grouped = t.closest<HTMLElement>('[data-group]');
    if (grouped && client?.state) { match.groupIds = grouped.dataset.group!.split(',').map(Number); groupTitle = grouped.dataset.groupTitle ?? 'Cartas do grupo'; match.zoneOf = null; zoneView(client.state); return; }
    const purePeek = t.closest<HTMLElement>('[data-peek]');
    if (purePeek && !purePeek.closest('[data-gy]')) { showPreview(cardFromElement(purePeek), purePeek, true); return; }
    const renderedQuestion = t.closest<HTMLElement>('[data-qid]');
    if (renderedQuestion && Number(renderedQuestion.dataset.qid) !== client?.state?.question?.id) return;
    if (runUi(onActionUi, ui, t, e)) return;
    if (t.id === 'fZone') { onActionUi['zone-close'](t, e, 'zone-close'); return; }
    const ctr = t.closest<HTMLElement>('[data-ctr]')?.dataset.ctr ?? null;
    if (ctr || openCounter) {
      openCounter = ctr && ctr !== openCounter ? ctr : null;
      render();
      if (ctr) return; // clicar no marcador só mostra o texto, não usa a carta
    }
    if (!client) return;
    const gy = t.closest<HTMLElement>('[data-gy]');
    if (gy && client.state) { match.groupIds = null; match.zoneOf = +gy.dataset.gy!; zoneKind = gy.dataset.zone === 'exile' ? 'exile' : gy.dataset.zone === 'command' ? 'command' : gy.dataset.zone === 'damage' ? 'damage' : gy.dataset.zone === 'dungeon' ? 'dungeon' : gy.dataset.zone === 'hand' ? 'hand' : 'gy'; zoneView(client.state); return; }
    const libPlace = t.closest<HTMLElement>('[data-lib-place]');
    const libMove = t.closest<HTMLElement>('[data-lib-move]');
    const libQuestion = client.state?.question;
    if ((libPlace || libMove) && match.qState && libQuestion && isLibraryChoice(libQuestion) && match.qState.id === libQuestion.id) {
      if (libPlace) {
        const [to, option] = libPlace.dataset.libPlace!.split(':');
        if (placeLibraryCard(match.qState.picked, Number(option), to === 'away')) { render(); announce(librarySummary(libQuestion, match.qState.picked)); }
      } else {
        const [pos, dir] = libMove!.dataset.libMove!.split(':').map(Number);
        if (moveLibraryCard(match.qState.picked, pos, dir < 0 ? -1 : 1)) {
          render();
          // O foco acompanha a carta na nova posição (ou fica na outra seta, se esta acabou na ponta).
          const at = pos + dir;
          (root.querySelector<HTMLButtonElement>(`[data-lib-move="${at}:${dir}"]:not(:disabled)`) ?? root.querySelector<HTMLElement>(`[data-lib-move="${at}:${-dir}"]`))?.focus({ preventScroll: true });
          const moved = libQuestion.options?.[match.qState.picked[at]];
          if (moved && typeof moved !== 'string' && moved.card) announce(`${label(moved.card)}: ${at + 1}ª de ${match.qState.picked.length}${at === 0 ? ', no topo' : ''}.`);
        }
      }
      return;
    }
    const pileMove = t.closest<HTMLElement>('[data-pile-move]');
    const pilePick = t.closest<HTMLElement>('[data-pile-pick]');
    const pileQuestion = client.state?.question;
    if ((pileMove || pilePick) && match.qState && pileQuestion && match.qState.id === pileQuestion.id) {
      if (pilePick && isPilesChoice(pileQuestion)) { answer({ indices: [Number(pilePick.dataset.pilePick)] }); return; }
      if (pileMove && isPilesSplit(pileQuestion)) {
        const option = Number(pileMove.dataset.pileMove);
        movePileCard(match.qState.picked, option);
        render();
        // O foco segue a carta no outro monte.
        root.querySelector<HTMLElement>(`[data-pile-move="${option}"]`)?.focus({ preventScroll: true });
        announce(splitSummary(pileQuestion, match.qState.picked));
        return;
      }
    }
    const filter = t.closest<HTMLElement>('[data-q-filter]');
    const sortBy = t.closest<HTMLElement>('[data-q-sort]')?.dataset.qSort;
    const filtering = client.state?.question;
    if ((filter || sortBy) && filtering && isFilterableChoice(filtering)) {
      if (filter) viewFor(filtering).type = filter.dataset.qFilter || null;
      if (sortBy) {
        choiceSort = parseChoiceSort(sortBy);
        try { localStorage.setItem(CHOICE_SORT_KEY, choiceSort); } catch { /* Storage is optional. */ }
        prefsChanged();
      }
      render();
      const scroller = root.querySelector<HTMLElement>('#fQuestion .question');
      if (scroller) scroller.scrollTop = 0;
      announce(root.querySelector('#fQStatus')?.textContent ?? '');
      return;
    }
    const opt = t.closest<HTMLElement>('[data-q-opt]');
    if (opt && match.qState) {
      const q = client.state?.question;
      if (!q) return;
      const i = +opt.dataset.qOpt!;
      const isOrder = q.kind === 'order';
      if (!isOrder && (q.max ?? 1) === 1) { answer({ indices: [i] }); return; }
      const at = match.qState.picked.indexOf(i);
      if (at >= 0) match.qState.picked.splice(at, 1);
      else if (isOrder || match.qState.picked.length < (q.max ?? 1)) match.qState.picked.push(i);
      render();
      return;
    }
    const undoChoice = t.closest<HTMLElement>('[data-undo]')?.dataset.undo;
    if (undoChoice) { client.send(undoChoice === 'cancel' ? { type: 'undo-cancel' } : { type: 'undo-vote', value: undoChoice === 'yes' }); return; }
    const skip = t.closest<HTMLElement>('[data-skip-vote]');
    if (skip) { client.send({ type: 'skip-vote', target: Number(skip.dataset.skipVote), value: skip.dataset.value !== 'false' }); return; }
    const openQuestion = client.state?.question;
    if (openQuestion && isCombatDamage(openQuestion)) {
      const step = t.closest<HTMLElement>('[data-cd-add],[data-cd-sub],[data-cd-lethal]');
      if (step) {
        const how = step.hasAttribute('data-cd-add') ? 'add' : step.hasAttribute('data-cd-sub') ? 'sub' : 'lethal';
        const index = Number(step.dataset.cdAdd ?? step.dataset.cdSub ?? step.dataset.cdLethal);
        damageSplit = { id: openQuestion.id, amounts: adjust(openQuestion, splitFor(openQuestion), index, how) };
        const key = how === 'add' ? 'data-cd-add' : how === 'sub' ? 'data-cd-sub' : 'data-cd-lethal';
        render();
        // O foco fica no mesmo botão (ou no vizinho, se ele ficou desabilitado), e o novo valor é anunciado.
        const again = root.querySelector<HTMLButtonElement>(`[${key}="${index}"]`);
        (again && !again.disabled ? again : root.querySelector<HTMLElement>(`[data-cd-sub="${index}"]:not(:disabled), [data-cd-add="${index}"]:not(:disabled)`))?.focus();
        announce(splitStatus(openQuestion, damageSplit.amounts).message);
        return;
      }
      if (t.closest('[data-cd-auto]')) { damageSplit = { id: openQuestion.id, amounts: autoSplit(openQuestion) }; render(); return; }
      if (t.closest('[data-cd-confirm]')) {
        const amounts = splitFor(openQuestion);
        if (splitStatus(openQuestion, amounts).valid) answer({ amounts });
        return;
      }
    }
    const trigger = t.closest<HTMLElement>('[data-trigger]');
    if (trigger && openQuestion && isTriggerOrder(openQuestion)) {
      triggerInput.tap(openQuestion, Number(trigger.dataset.trigger));
      return;
    }
    if (t.closest('[data-trigger-undo]') && openQuestion && isTriggerOrder(openQuestion)) { if (undoTrigger(triggersFor(openQuestion))) render(); return; }
    if (t.closest('[data-trigger-confirm]') && openQuestion && isTriggerOrder(openQuestion)) { answer({ indices: [...triggersFor(openQuestion).order] }); return; }
    if (t.closest('[data-q-submit]') && match.qState) { answer({ indices: match.qState.picked }); return; }
    if (t.closest('[data-q-none]')) { answer({ indices: [] }); return; }
    if (t.closest('[data-q-keep]')) { answer({ indices: (client.state?.question?.options ?? []).map((_, i) => i) }); return; }
    const conf = t.closest<HTMLElement>('[data-q-confirm]');
    if (conf) { answer({ value: conf.dataset.qConfirm === 'true' }); return; }
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'phyrexian-life') {
      const control = t.closest<HTMLElement>('[data-act]')!, s = client?.state, gen = Number(control.dataset.gen);
      if (!renderedInputIsCurrent(control) || !client || !s || match.disconnected || gen !== s.input.gen || s.input.phyrexianLife === undefined) return;
      if (gen === match.clickedGen && Date.now() - clickedAt < CLICK_LOCK_MS) return;
      match.clickedGen = gen; clickedAt = Date.now();
      stopPresentation(); client.send({ type: 'player', id: s.you, gen });
      return;
    }
    if (act === 'ok' || act === 'cancel' || act === 'pass-turn' || act === 'resolve-all') {
      const control = t.closest<HTMLElement>('[data-act]')!;
      if (!renderedInputIsCurrent(control)) return;
      sendInputAction(act, Number(control.dataset.gen));
      return;
    }
    const prolifRow = t.closest<HTMLElement>('[data-prolif-kind]'), prolifTool = t.closest<HTMLElement>('[data-prolif]');
    if ((prolifRow || prolifTool) && client.state && isProliferating(client.state)) {
      const control = (prolifRow ?? prolifTool)!;
      if (!renderedInputIsCurrent(control)) return;
      const s = client.state;
      const message = prolifRow ? proliferateToggle(s, prolifRow.dataset.prolifKind === 'player' ? 'player' : 'card', Number(prolifRow.dataset.prolifId))
        : prolifTool!.dataset.prolif === 'suggested' ? proliferateSuggestion(s) : proliferateClear(s);
      if (message) { stopPresentation(); client.send(message); }
      return;
    }
    if (t.closest('.emblem')) return; // fica dentro do retrato, mas não é um clique no jogador
    const mana = t.closest<HTMLElement>('[data-mana]')?.dataset.mana;
    if (mana) { const control = t.closest<HTMLElement>('[data-mana]')!; if (renderedInputIsCurrent(control)) { stopPresentation(); client.send({ type: 'mana', color: mana, gen: Number(control.dataset.gen) }); } return; }
    const defender = t.closest<HTMLElement>('[data-defender]');
    if (defender && client.state) {
      attack.choose(client.state, { id: Number(defender.dataset.defender), kind: defender.dataset.defenderKind === 'card' ? 'card' : 'player' }, Number(defender.dataset.gen));
      return;
    }
    const pl = t.closest<HTMLElement>('[data-pid]');
    if (pl && client.state?.input.attacking) {
      attack.choose(client.state, { id: Number(pl.dataset.pid), kind: 'player' }, Number(pl.dataset.gen));
      return;
    }
    // Proliferar: o clique no retrato ou na carta passa pela mesma escolha da lista (o Forge confirmaria sozinho ao marcar o último).
    if (pl && client.state && isProliferating(client.state)) {
      const message = renderedInputIsCurrent(pl) ? proliferateToggle(client.state, 'player', Number(pl.dataset.pid)) : null;
      if (message) { stopPresentation(); client.send(message); }
      return;
    }
    if (pl) { if (renderedInputIsCurrent(pl) && client.state?.input.selectablePlayers?.includes(+pl.dataset.pid!)) { stopPresentation(); client.send({ type: 'player', id: +pl.dataset.pid!, gen: Number(pl.dataset.gen) }); } return; }
    const cd = t.closest<HTMLElement>('[data-fid]');
    if (!cd || !renderedInputIsCurrent(cd)) return;
    const s = client.state!;
    const id = Number(cd.dataset.fid), gen = Number(cd.dataset.gen);
    if (isProliferating(s) && gen === s.input.gen) {
      const message = proliferateToggle(s, 'card', id);
      if (message) { stopPresentation(); client.send(message); return; }
    }
    if (s.input.attacking && cd.closest('.field')) {
      if (s.input.attacking.attackers.includes(id)) { attack.tapAttacker(s, id, gen); return; }
      attack.choose(s, { id, kind: 'card' }, gen);
      return;
    }
    if (cd.hasAttribute('data-command-card') && !canPlayCommander(s, id, gen)) { showPreview(findCard(id), cd, true); return; }
    if (cd.hasAttribute('data-library-top')) { const top = findCard(id); if (!top || gen !== s.input.gen || !canUse(s, top)) { showPreview(top, cd, true); return; } }
    if (s.input.blocking && cd.closest('.field')) {
      if (s.input.blocking.blockers.includes(id)) {
        match.selectedBlocker = match.selectedBlocker?.blocker === id ? null : { blocker: id, gen };
        hideCardPreview(true); renderTable(false); return;
      }
      if (s.input.blocking.attackers.includes(id)) {
        const action = blockPairAction(s, match.selectedBlocker, id, gen);
        if (!action) { announce(match.selectedBlocker ? 'Essa criatura não pode bloquear esse atacante.' : 'Selecione primeiro uma criatura sua para bloquear.'); return; }
        match.selectedBlocker = null; stopPresentation(); hideCardPreview(true); client.send(action); renderTable(false); return;
      }
      return;
    }
    if (cd.hasAttribute('data-exile-card')) {
      if (s.input.suspendCast?.card.id === id) { sendInputAction('ok', gen); return; }
      if (!canPlayExileCard(s, id, gen) && !canSelectExileCard(s, id, gen)) { showPreview(findCard(id), cd, true); return; }
    }
    // Celular: sem lupa, tocar numa carta do oponente que não faz nada agora mostra a carta. Nas suas, o toque é sempre
    // do jogo (o terreno vira por mana mesmo fora da lista de usáveis); para ver, segure.
    const theirs = findCard(id)?.controller !== s.you;
    if (compactTable.matches && cd.closest('.field') && theirs && !usable(s, id) && !selectedForInput(s, id)) { showPreview(findCard(id), cd, true); return; }
    // Usar uma carta do cemitério ou do exílio fecha a janela, para a pergunta seguinte aparecer.
    // No alvo de cemitério aberto sozinho, a janela fica até a escolha acabar (com vários alvos, marca um de cada vez).
    if (cd.closest('#fZone') && !(gyTargetOpened && s.input.targeting)) closeZone();
    // Na sua manutenção, virar algo só para mana pede confirmação, uma vez por manutenção.
    const upkeepKey = upkeepManaKey(s, id);
    if (upkeepKey && upkeepKey !== upkeepManaConfirmed) {
      const card = findCard(id);
      void confirmUpkeepMana(card ? label(card) : 'esta carta').then(yes => {
        const now = client?.state;
        if (!yes || !now || match.disconnected || upkeepManaKey(now, id) !== upkeepKey) return;
        upkeepManaConfirmed = upkeepKey;
        stopPresentation();
        client!.send({ type: 'card', id, gen: now.input.gen });
      });
      return;
    }
    stopPresentation();
    client.send({ type: 'card', id: +cd.dataset.fid!, gen: Number(cd.dataset.gen) });
  });
  root.addEventListener('submit', e => {
    const form = e.target as HTMLElement;
    if (form.matches('[data-q-amount-form]')) {
      e.preventDefault();
      const q = client?.state?.question;
      if (q?.kind !== 'amount' || Number(form.closest<HTMLElement>('[data-qid]')?.dataset.qid) !== q.id) return;
      const status = amountStatus(q, match.qState);
      if (status.valid) answer({ amounts: status.amounts });
      return;
    }
    if (!form.matches('[data-q-text]')) return;
    e.preventDefault();
    if (Number((e.target as HTMLElement).closest<HTMLElement>('[data-qid]')?.dataset.qid) !== client?.state?.question?.id) return;
    answer({ text: (root.querySelector('#fQInput') as HTMLInputElement).value });
  });
  root.addEventListener('input', e => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'fQInput' && match.qState) match.qState.text = t.value;
    if (t.id === 'fQNameSearch' && match.qState && client?.state?.question && isNameChoice(client.state.question)) {
      match.qState.text = t.value;
      applyNameSearch(client.state.question);
    }
    if (t.id === 'fQSearch' && client?.state?.question && isFilterableChoice(client.state.question)) {
      viewFor(client.state.question).query = t.value;
      applyChoiceSearch(client.state.question);
    }
    if (t.hasAttribute('data-q-amount') && match.qState && client?.state?.question?.kind === 'amount') {
      const q = client.state.question;
      if (Number(t.closest<HTMLElement>('[data-qid]')?.dataset.qid) !== q.id) return;
      match.qState.amounts[Number(t.dataset.qAmount)] = t.value;
      const status = amountStatus(q, match.qState);
      $('#fAmountRemaining').textContent = status.text;
      (root.querySelector('[data-q-amount-submit]') as HTMLButtonElement).disabled = !status.valid;
    }
    if (t.id === 'fVolume') { audio.setVolume(Number(t.value) / 100); settings.sync(); }
  });
  const inspectable = '[data-fid],[data-peek],[data-event],[data-stack],[data-stack-inspect],[data-inspect],[data-q-card]';
  root.addEventListener('pointerover', e => {
    if ((e as PointerEvent).pointerType !== 'mouse') return;
    // Sobre um selo de marcador ou palavra-chave, vale o balão dele, sem a prévia da carta por cima.
    if ((e.target as HTMLElement).closest('.bfc .ctr')) { hideCardPreview(); return; }
    const el = (e.target as HTMLElement).closest<HTMLElement>(inspectable);
    // Com o mouse, a prévia acompanha o cursor; pelo teclado (focusin) ela fica no canto, como antes.
    if (el && !handDrag.active) showPreview(cardFromElement(el), el, false, { x: (e as PointerEvent).clientX, y: (e as PointerEvent).clientY });
  });
  root.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') followCardPreview(e.clientX, e.clientY); }, { passive: true });
  root.addEventListener('pointerover', e => setStackFocus(stackFocusFrom(e.target as HTMLElement)));
  root.addEventListener('pointerout', e => setStackFocus(stackFocusFrom(e.relatedTarget as HTMLElement | null)));
  root.addEventListener('focusin', e => setStackFocus(stackFocusFrom(e.target as HTMLElement)));
  root.addEventListener('focusout', e => setStackFocus(stackFocusFrom(e.relatedTarget as HTMLElement | null)));
  root.addEventListener('pointerout', e => {
    const to = (e as PointerEvent).relatedTarget as HTMLElement | null;
    if (!to?.closest?.(`${inspectable},.card-inspector-preview`)) hideCardPreview();
  });
  root.addEventListener('focusin', e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(inspectable);
    if (el && !handDrag.active) showPreview(cardFromElement(el), el);
  });
  root.addEventListener('focusout', e => {
    const to = e.relatedTarget as HTMLElement | null;
    if (!to?.closest?.(`${inspectable},.card-inspector-preview`)) hideCardPreview();
  });
  root.addEventListener('contextmenu', e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(inspectable);
    if (!el) return;
    e.preventDefault();
    if (!heldOpen) showPreview(cardFromElement(el), el, true);
  });
  /*
   * Segurar para ver: no toque, segurar uma carta parada abre a carta, no iPhone também (lá o toque longo não vira
   * contextmenu). O toque que abriu não joga a carta; mexer o dedo (rolar, arrastar da mão) desiste.
   */
  const HOLD_MS = 450;
  let hold: { pointer: number; x: number; y: number; timer: number } | null = null;
  let heldOpen = false;
  const endHold = () => { if (hold) clearTimeout(hold.timer); hold = null; };
  root.addEventListener('pointerdown', e => {
    endHold(); heldOpen = false;
    if (e.pointerType === 'mouse' || !e.isPrimary) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>(inspectable);
    if (!el) return;
    hold = { pointer: e.pointerId, x: e.clientX, y: e.clientY, timer: window.setTimeout(() => {
      hold = null;
      if (handDrag.active || !el.isConnected) return;
      handDrag.cancel(); heldOpen = true; showPreview(cardFromElement(el), el, true);
    }, HOLD_MS) };
  });
  root.addEventListener('pointermove', e => { if (hold?.pointer === e.pointerId && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 10) endHold(); }, { passive: true });
  root.addEventListener('pointerup', endHold);
  root.addEventListener('pointercancel', endHold);
  root.addEventListener('scroll', endHold, { capture: true, passive: true });
  root.addEventListener('keydown', () => { heldOpen = false; }, true);
  root.addEventListener('click', e => { if (heldOpen) { heldOpen = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  // ---------- Ordem dos gatilhos: teclado e arrastar ----------
  const triggerInput = attachTriggerOrder(root, { client: () => client, order: triggersFor, render: () => render(), announce: text => announce(text) });
  root.addEventListener('keydown', e => {
    // Enter na busca de nomes escolhe o primeiro achado; a seta para baixo desce para a lista.
    if ((e.target as HTMLElement).id === 'fQNameSearch' && (e.key === 'Enter' || e.key === 'ArrowDown')) {
      const first = root.querySelector<HTMLElement>('#fQNames [data-q-opt]');
      if (!first) return;
      e.preventDefault();
      if (e.key === 'Enter') first.click(); else first.focus();
    }
  });
  // "?" abre a lista de atalhos, como no Gmail e no GitHub.
  document.addEventListener('keydown', e => {
    if (!isShortcutsKey(e) || !root.isConnected || root.closest('[hidden]')) return;
    e.preventDefault();
    openShortcuts(MATCH_SHORTCUTS);
  });
  // Foco que ficou num elemento por um clique (ou pela mesa redesenhada depois dele), não por Tab. O :focus-visible
  // não serve: o navegador o liga assim que se aperta uma tecla, inclusive o próprio Espaço.
  let pointing = false, pointerFocus: EventTarget | null = null;
  document.addEventListener('pointerdown', () => { pointing = true; }, true);
  document.addEventListener('keydown', () => { pointing = false; }, true);
  document.addEventListener('focusin', e => { pointerFocus = pointing ? e.target : null; });
  const mouseFocused = (el: HTMLElement) => el === pointerFocus;
  // Espaço aperta o botão de passar da caixa de ação (passar, resolver, confirmar), como no Arena.
  // Fica de fora quando o foco está num campo de texto, num controle que o teclado alcançou (o Espaço já é dele) ou
  // quando uma janela está aberta. O foco que sobra de um clique (o terreno virado para pagar) não conta.
  document.addEventListener('keydown', e => {
    if (e.key !== ' ' || e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    if (!root.isConnected || root.closest('[hidden]') || !client?.state || match.disconnected) return;
    const target = e.target as HTMLElement;
    if (target !== document.body && target.closest('input, textarea, select, [contenteditable]')) return;
    if (target !== document.body && target.closest('button, a, [role="button"], [tabindex]') && !mouseFocused(target)) return;
    if (currentModal || document.querySelector('dialog[open], .feedback-overlay') || !$('#fMenu').hidden || !$('#fLogDrawer').hidden || !$('#fErrorsDrawer').hidden) return;
    // O botão de passar (OK, Resolver, "Para o combate"...): avança um passo. "Fim de turno" fica só no clique.
    const primary = root.querySelector<HTMLButtonElement>('#fAction .btns [data-act="ok"]:not(:disabled)');
    if (!primary) return;
    e.preventDefault();
    primary.click();
  });
  function escape(e: KeyboardEvent) {
    if (stops.group) { e.preventDefault(); stops.set(null, true); return; }
    if (passMenu.open) { e.preventDefault(); passMenu.set(false, true); return; }
    if (!$('#fRemoval').hidden) { e.preventDefault(); removals.close(); return; }
    if (!$('#fSettings').hidden) { e.preventDefault(); settings.set(false); return; }
    if (!$('#fMenu').hidden) { e.preventDefault(); setMenu(false, true); return; }
    if (!$('#fLogDrawer').hidden) { e.preventDefault(); setLog(false, true); return; }
    if (!$('#fErrorsDrawer').hidden) { e.preventDefault(); errors.set(false, true); return; }
    if (attack.selected.size || attack.pinned || attack.allGen !== null || attack.queue.queuedAttackers.length) { attack.clear(); e.preventDefault(); renderTable(false); return; }
    if (match.selectedBlocker) { match.selectedBlocker = null; e.preventDefault(); renderTable(false); return; }
    if (match.stackGalleryOpen) { e.preventDefault(); closeStackGallery(); return; }
    if (match.zoneOf !== null || match.groupIds) { closeZone(); return; }
    // Esc recolhe a escolha para ver a mesa, e o Esc seguinte a traz de volta.
    if (questionMinimized()) { e.preventDefault(); root.querySelector<HTMLElement>('[data-ui="question-restore"]')?.click(); return; }
    const minimize = currentModal === $('#fQuestion') ? currentModal.querySelector<HTMLElement>('[data-ui="question-minimize"]') : null;
    if (minimize) { e.preventDefault(); minimize.click(); return; }
    if (focusSeat !== null && !document.querySelector('dialog[open]')) { e.preventDefault(); closeFocus(); return; }
    hideCardPreview(true);
  }
  // Sem foco em lugar nenhum (o botão que abriu a janela foi redesenhado, ou o clique foi num canto vazio), a tecla
  // vai para a página e não passaria pela mesa: o Esc ainda fecha o que estiver aberto.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.target !== document.body || !root.isConnected || root.closest('[hidden]') || document.querySelector('dialog[open], .feedback-overlay')) return;
    escape(e);
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape') escape(e);
    // Abas do cemitério: as setas passam ao cemitério do jogador ao lado, e o foco vai junto.
    const zoneTab = (e.target as HTMLElement).closest<HTMLElement>('.zone-tab');
    if (zoneTab && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && client?.state) {
      const tabs = [...root.querySelectorAll<HTMLElement>('#fZone .zone-tab')];
      const next = tabs[(tabs.indexOf(zoneTab) + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      e.preventDefault(); match.zoneOf = +next.dataset.gy!; zoneView(client.state);
      root.querySelector<HTMLElement>(`#fZone .zone-tab[data-gy="${match.zoneOf}"]`)?.focus();
      return;
    }
    if (focusSeat !== null && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && (e.target as HTMLElement).closest('.focus-head')) {
      const ids = (client?.state?.players ?? []).filter(p => p.id !== client!.state!.you && !p.eliminated).map(p => p.id);
      const next = ids[(ids.indexOf(focusSeat) + (e.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length];
      if (next !== undefined && next !== focusSeat) { e.preventDefault(); openFocus(next); }
      return;
    }
    const target = e.target as HTMLElement;
    if (match.stackGalleryOpen && target.matches('.stack-gallery-card') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      const cards = [...$('#fStackGallery').querySelectorAll<HTMLElement>('.stack-gallery-card')];
      const index = cards.indexOf(target);
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? cards.length - 1 : Math.max(0, Math.min(cards.length - 1, index + (e.key === 'ArrowRight' ? 1 : -1)));
      e.preventDefault(); cards[next]?.focus({ preventScroll: true }); cards[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }); return;
    }
    if (e.key.toLowerCase() === 'i' && !target.matches('input,textarea,select')) {
      const el = target.closest<HTMLElement>(inspectable);
      if (el) { e.preventDefault(); showPreview(cardFromElement(el), el, true); return; }
    }
    if (e.key === 'Tab' && currentModal) {
      const focusable = [...currentModal.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select,[tabindex="0"]')].filter(el => !el.closest('[hidden]'));
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (first && e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (last && !e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    if (e.repeat) return;
    const el = target.closest<HTMLElement>('[data-mana],[data-ctr],[data-fid],[data-pid],[data-gy],[data-peek]');
    if (el && !el.matches('button') && (e.key === 'Enter' || (e.key === ' ' && !mouseFocused(target)))) { e.preventDefault(); el.click(); }
  });

  /** A conexão caiu (reconectando ou de vez): nada mais sai da mesa, e o que estava em andamento é largado. */
  function connectionLost() {
    match.disconnected = true; attack.clear(true); passLevel.reset(); opponentStops.reset(); settings.syncPassLevel(); stops.sync();
    if (match.stackGalleryOpen) closeStackGallery();
    handDrag.cancel(); stopPresentation(); silentNext = true;
  }

  return {
    attach(c, pics) {
      match = newMatchState();
      passLevel.reset(); opponentStops.reset(); turnNotice.reset(); turnBuzz.reset();
      faces.reset();
      client = c; portraits = pics; attack.clear(true);
      $('#fStackGallery').hidden = true;
      handDrag.cancel(); stopPresentation(); timeline.reset(); silentNext = true; hideCardPreview(true);
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
      const ov = $('#fOverlay');
      ov.hidden = false;
      ov.dataset.html = '';
      ov.innerHTML = reconnectingHTML(attempt);
      syncModal();
    },
    diagnostic(d) { errors.record('ação ignorada', d.text, d.action ? `ação: ${d.action}` : undefined); },
    disconnected(reason) {
      errors.record('conexão', reason ?? 'Conexão perdida com o servidor da partida.');
      connectionLost();
      const room = !!client?.state?.session;
      const ov = $('#fOverlay');
      ov.hidden = false;
      ov.dataset.html = '';
      ov.innerHTML = disconnectedHTML(reason, room);
      syncModal();
    },
  };
}
