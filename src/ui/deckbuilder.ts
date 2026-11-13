// Meus decks: a biblioteca, criar, importar e editar decks, com busca de cartas e "Parecidas".
import { KEYS } from '../storage';
import './decks.css';
import { DEFAULT_DECKS, hasCommandZone, countEntries, deckEntries, exportDeckList, exportDeckRecovery, entryKey, getDeckStorageState, loadUserDecks, parseDeckList, promoteToCommander, saveUserDecks, type DeckData, type DeckEntry, type DeckFormat, type ParsedList } from '../decks';
import { type Color } from '../cards';
import { cacheGet, fetchByNames, fetchPrintings, preloadDeckImages, resolveCardNames, searchCards, translateCards, type ScryCard } from '../scryfall';
import { missingCardData } from './deckStats';
import { isBracket, type Bracket } from '../brackets';
import { deckLinkToList, parseDeckLink, type DeckSite } from '../deckLink';
import { cardCopyLimit, copiesInDeck, type ServerDeckValidation } from './deckRules';
import { inspectCard, showCardPreview, hideCardPreview } from './cardInspector';
import { openDeckPreview } from './deckPreview';
import { download, openDeckExport } from './deckExport';
import { mountAppHeader } from './appHeader';
import { applyDeckImport, applyDeckListEdit, deckImportSnapshot, deckListChanges, type DeckImportMode } from './deckImport';
import { toggleColor, type ColorFilter } from './deckFilters';
import './deckFilters.css';
import { mountDeckLayout } from './deckLayout';
import { montarAvisoConta } from './contaAviso';
import { buildSearchQuery, similarQuery } from './cardSearch';
import { deckIdentity, identityExempt, editHTML, importHTML, libraryHTML, printOf, resultsHTML, slotRole, statusHTML, type BuilderState } from './deckbuilderView';
import { finder } from './dom';
import { chooseToken, deckTokens, type TokenKind } from '../deckTokens';
import { openTokenPicker } from './deckTokensView';

interface BuilderOptions {
  onBack(): void;
  onChange(): void;
  initialFormat?: DeckFormat;
  onFormatChange?(format: DeckFormat): void;
  onPlay?(deck: DeckData): void;
  validateDeck?(deck: DeckData, format: DeckFormat): Promise<ServerDeckValidation>;
  /** JSON público do deck no Moxfield ou no Archidekt (pela ponte). */
  fetchDeckSource?(site: DeckSite, id: string): Promise<string>;
  /** Candidatas ordenadas pela semelhança com a carta, pelas tags do Tagger (pela ponte). */
  similarCards?(oracleId: string, candidates: string[]): Promise<{ oracleId: string; score: number; tags: string[] }[]>;
}
/** Páginas do Scryfall (175 cartas cada) lidas para achar as candidatas a "Parecidas". */
const SIMILAR_PAGES = 5;
export type DeckBuilderOpen = { action: 'create' | 'import' | 'library'; format?: DeckFormat } | { action: 'edit'; deckId: string; format?: DeckFormat };

export function mountDeckBuilder(root: HTMLElement, opts: BuilderOptions) {
  let user = loadUserDecks();
  let format: DeckFormat = opts.initialFormat ?? 'free';
  let selected: string | null = null;
  let view: 'library' | 'edit' | 'import' = 'library';
  let listQuery = '';
  let libraryColors = new Set<ColorFilter>();
  const ptName = (name: string) => cacheGet(name)?.pt?.name || name;
  let showReady = false;
  let notice = '';
  /** A busca dos dados das cartas falhou na tela aberta ('library' ou 'edit'); some ao trocar de tela. */
  let cardsError: 'library' | 'edit' | null = null;
  let saveError = getDeckStorageState().error ?? '';
  let removed: { deck: DeckData; index: number } | null = null;
  let section: 'main' | 'sideboard' | 'tokens' = 'main';
  let tokenKinds: TokenKind[] | null = null;
  let tokensError = false;
  let tokensSeq = 0;
  let searchOpen = false;
  let commanderSlot: number | null = null;
  let deckActionsOpen = false;
  let searchQuery = '';
  let searchType = '';
  let searchFunc = '';
  /** Carta das "Parecidas" em exibição; null na busca normal. */
  let similarTo: ScryCard | null = null;
  const similarTags = new Map<string, string[]>();
  const searchColors = new Set<Color>();
  let results: ScryCard[] = [];
  let searchSeq = 0;
  let nextPage = 1;
  let hasMore = false;
  let total = 0;
  let searching = false;
  let searchError = '';
  let validation: ServerDeckValidation | null = null;
  let validating = false;
  let validationSeq = 0;
  let validationError = '';
  let importDraft = { name: '', text: '' };
  /** Formato do deck novo que está sendo importado: começa vazio a cada importação, e o jogador precisa escolher antes de conferir a lista. */
  let importFormat: DeckFormat | null = null;
  /** Bracket que veio com o deck do link (Archidekt); vale só para Commander. */
  let importBracket: Bracket | undefined;
  let importBusy = false;
  let importError = '';
  let importSeq = 0;
  let importTarget: DeckData | null = null;
  let importMode: DeckImportMode | null = null;
  let importReview: { deck: DeckData; incoming: DeckData; parsed: ParsedList; missing: string[]; ambiguous: { name: string; options: string[] }[] } | null = null;
  let importAcknowledged = false;
  /** A tela de importação aberta em "Editar como lista": a lista do deck já preenchida, substituindo todas as seções. */
  let listEdit = false;
  /** Primeira carta de uma lista Commander de 100 sem seção de comandante, quando é uma criatura lendária. */
  let importCommanderOffer: string | null = null;
  const current = () => [...user, ...DEFAULT_DECKS].find(d => d.id === selected);
  const $ = finder(root);
  /** O que as telas desenham (deckbuilderView), lido na hora de cada desenho. */
  const state = (): BuilderState => ({
    format, ptName, user, view, listQuery, libraryColors, showReady, notice, cardsError, saveError, removed, section, tokenKinds, tokensError, searchOpen, commanderSlot,
    deckActionsOpen, searchQuery, searchType, searchFunc, similarTo, similarTags, searchColors, results, hasMore, total, searching, searchError,
    validation, validating, validationError, canValidate: !!opts.validateDeck, canSimilar: !!opts.similarCards,
    importDraft, importFormat, importBusy, importError, importTarget, importMode, importReview, importAcknowledged, listEdit, importCommanderOffer,
    importCanSave: importCanSave(),
  });

  root.innerHTML = `<div class="deck-workspace"><header data-app-header></header><div id="dwStatus" class="dw-status" role="status" aria-live="polite"></div><main id="dwContent"></main></div>`;
  function goHome() { setDeckActions(false); importSeq++; importBusy = false; validationSeq++; validating = false; hideCardPreview(); opts.onBack(); }
  function goLibrary() { setDeckActions(false); importSeq++; importBusy = false; validationSeq++; validating = false; view = 'library'; selected = null; hideCardPreview(); render(); }
  mountAppHeader(root.querySelector('[data-app-header]')!, { active: 'decks', onPlay: goHome, onDecks: goLibrary });

  function renderStatus() {
    const recovery = getDeckStorageState().recovery.length;
    $('#dwStatus').innerHTML = statusHTML(state(), recovery);
    $('#dwStatus').hidden = !$('#dwStatus').hasChildNodes();
  }
  function persist(message = '') {
    const result = saveUserDecks(user);
    saveError = result.ok ? '' : result.error;
    notice = result.ok ? message : '';
    renderStatus(); opts.onChange();
  }
  function changed(deck: DeckData) {
    deck.unresolved = deck.unresolved?.filter(name => deckEntries(deck).some(entry => entry.name === name));
    // A capa escolhida sai junto com a carta do deck principal; a capa volta a ser automática.
    if (deck.cover && !deck.cards.some(entry => entry.name === deck.cover)) delete deck.cover;
    deck.updatedAt = new Date().toISOString();
    validationSeq++; validation = null; validationError = ''; validating = false;
    persist();
  }
  function preserveRender(render: () => void) {
    const active = document.activeElement instanceof HTMLElement && root.contains(document.activeElement) ? document.activeElement : null;
    const actionFocus = !!active?.closest('#dwDeckActions');
    const key = actionFocus ? 'deck-actions' : active?.dataset.focus;
    deckActionsOpen = false;
    const input = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active : null;
    const range = input && ['text', 'search', 'textarea'].includes(input.type) ? [input.selectionStart, input.selectionEnd] as const : null;
    const x = window.scrollX, y = window.scrollY;
    render();
    if (key) {
      const target = [...root.querySelectorAll<HTMLElement>('[data-focus]')].find(el => el.dataset.focus === key);
      target?.focus({ preventScroll: true });
      if (range && target instanceof HTMLInputElement && range[0] !== null && range[1] !== null) target.setSelectionRange(range[0], range[1]);
    }
    window.scrollTo(x, y);
  }
  function renderLibrary() {
    $('#dwContent').innerHTML = libraryHTML(state());
    mountDeckLayout($('.dw-layout-host'), $('.dw-library'), KEYS.deckLayoutLibrary);
    montarAvisoConta(root);
    root.querySelector('.dw-ready')?.addEventListener('toggle', e => { const next = (e.target as HTMLDetailsElement).open; if (next !== showReady) { showReady = next; if (next) void loadData(); } });
  }
  function renderEdit() {
    const deck = current(); if (!deck) { view = 'library'; renderLibrary(); return; }
    $('#dwContent').innerHTML = editHTML(deck, state());
    if (searchOpen && !deck.builtin) renderResults();
  }
  function renderResults() {
    const el = root.querySelector('#dwResults'), deck = current(); if (!el || !deck) return;
    el.innerHTML = resultsHTML(deck, state());
  }
  function importCanSave() {
    return !!importReview && (!importTarget || !!importMode) && !importError
      && (!(importReview.parsed.skipped.length || importReview.parsed.ignored.length) || importAcknowledged)
      && !(listEdit && importTarget && !deckListChanges(importTarget, importReview.deck).length);
  }
  function renderImport() { $('#dwContent').innerHTML = importHTML(state()); }
  function beginImport(target?: DeckData, asList = false) {
    if (target?.builtin) return;
    setDeckActions(false);
    importSeq++; importBusy = false; validationSeq++; validating = false; validation = null; validationError = '';
    importTarget = target ? structuredClone(target) : null;
    listEdit = asList && !!target;
    importMode = target && (listEdit || !deckEntries(target).length) ? 'replace' : null;
    importDraft = { name: target?.name ?? '', text: listEdit ? exportDeckList(target!) : '' }; importFormat = null; importBracket = undefined; importReview = null; importError = ''; importAcknowledged = false; importCommanderOffer = null;
    view = 'import'; hideCardPreview(); render(); (root.querySelector<HTMLElement>('#dwImportText') ?? root.querySelector<HTMLElement>('[data-import-format]'))?.focus();
  }
  function saveImport() {
    if (!importReview || !importCanSave()) return;
    const deck = importReview.deck;
    if (importTarget) {
      const latest = loadUserDecks(), index = latest.findIndex(d => d.id === importTarget!.id), current = latest[index];
      user = [...latest];
      if (!current || deckImportSnapshot(current) !== deckImportSnapshot(importTarget)) {
        importError = listEdit ? 'Este deck mudou durante a revisão. Volte ao deck e abra Editar como lista de novo; suas cartas não foram alteradas.' : 'Este deck mudou durante a revisão. Volte ao deck e importe a lista novamente; suas cartas não foram alteradas.';
        renderImport(); return;
      }
      user[index] = deck;
    } else user = [deck, ...loadUserDecks()];
    persist(listEdit ? 'Mudanças salvas no deck.' : importTarget ? 'Lista salva no mesmo deck. Todas as seções foram atualizadas.' : 'Deck importado. Todas as seções foram preservadas.');
    importReview = null; importTarget = null; listEdit = false; importDraft = { name: '', text: '' }; edit(deck);
    preloadImages(deck);
  }
  /** Deixa as imagens do deck no cache do navegador, para a primeira partida não abrir com cartas em branco. */
  function preloadImages(deck: DeckData) {
    let art = false;
    try { art = localStorage.getItem(KEYS.cards) === 'art'; } catch { /* Storage is optional. */ }
    void preloadDeckImages(deckEntries(deck).map(e => e.name), art ? ['small', 'normal', 'art_crop'] : ['small', 'normal']).catch(() => {});
  }
  function render() { renderStatus(); if (view === 'library') renderLibrary(); else if (view === 'import') renderImport(); else renderEdit(); }
  async function loadData() {
    if (view === 'import') return;
    const requestView = view, requestSelected = selected;
    const target = view === 'edit' ? current() : undefined;
    const decks = target ? [target] : [...user, ...(showReady ? DEFAULT_DECKS : [])];
    const rerender = () => { if (view === requestView && selected === requestSelected) preserveRender(render); };
    try {
      // Na biblioteca, os comandantes (as capas) chegam antes da lista inteira.
      if (!target) await fetchByNames(decks.flatMap(d => (d.commanders ?? []).map(e => e.name))).then(() => fetchPrintings(decks.flatMap(d => d.commanders ?? []))).then(rerender).catch(() => {});
      await fetchByNames(decks.flatMap(d => deckEntries(d).map(e => e.name)), true); rerender();
      if (target) { await fetchPrintings(deckEntries(target)); rerender(); }
    }
    catch {
      // Na biblioteca, só avisa se faltar mesmo algum dado: sem rede, a legalidade vencida também falha a busca.
      if (view === requestView && selected === requestSelected && (view === 'edit' || missingCardData(decks))) { cardsError = view === 'edit' ? 'edit' : 'library'; renderStatus(); }
      return;
    }
    if (cardsError && view === requestView) { cardsError = null; renderStatus(); }
  }
  /** As fichas que as cartas do deck criam, para a aba Fichas (o Scryfall só é consultado pelo que ainda não se conhece). */
  async function loadTokens() {
    const deck = current(); if (!deck) return;
    const seq = ++tokensSeq; tokensError = false;
    try { const kinds = await deckTokens(deck); if (seq === tokensSeq) tokenKinds = kinds; }
    catch { if (seq === tokensSeq) { tokensError = true; tokenKinds = null; } }
    if (seq === tokensSeq && view === 'edit' && selected === deck.id) preserveRender(renderEdit);
  }
  function resetSearch() { searchSeq++; results = []; searchQuery = ''; searchType = ''; searchFunc = ''; similarTo = null; similarTags.clear(); searchColors.clear(); hasMore = false; searching = false; searchError = ''; }
  function edit(deck: DeckData) {
    deckActionsOpen = false;
    importSeq++; importBusy = false; validationSeq++; validating = false;
    selected = deck.id; view = 'edit'; section = 'main'; tokenKinds = null; tokensError = false; tokensSeq++; commanderSlot = null; searchOpen = !deck.cards.length && !deck.builtin && !hasCommandZone(deck.format);
    validation = null; validationError = ''; resetSearch(); hideCardPreview(); render(); void loadData();
  }
  function create() {
    const deck: DeckData = { id: crypto.randomUUID(), name: 'Novo deck', cards: [], sideboard: [], format, updatedAt: new Date().toISOString() };
    user.unshift(deck); persist(); edit(deck); $('#dwName')?.focus(); ($('#dwName') as HTMLInputElement)?.select();
  }
  function duplicate(source: DeckData) {
    const { price: _price, ...rest } = source;
    const deck: DeckData = { ...rest, id: crypto.randomUUID(), name: `${source.name} (cópia)`, builtin: false, cards: source.cards.map(e => ({ ...e })), commanders: source.commanders?.map(e => ({ ...e })) ?? [], sideboard: source.sideboard?.map(e => ({ ...e })) ?? [], ...(source.tokens ? { tokens: source.tokens.map(t => ({ ...t })) } : {}), sourceTemplateId: source.builtin ? source.id : source.sourceTemplateId, updatedAt: new Date().toISOString() };
    user.unshift(deck); persist('Cópia criada nos seus decks.'); edit(deck);
  }
  /** `key` é o nome da carta (busca) ou a linha do deck (`entryKey`), que separa as impressões da mesma carta. */
  function change(key: string, delta: number, move = false) {
    const deck = current(); if (!deck || deck.builtin || section === 'tokens') return;
    const pool = section === 'main' ? deck.cards : deck.sideboard ?? (deck.sideboard = []);
    // Da busca vem só o nome: soma na linha da carta (na impressão que ela tiver), se houver uma só.
    const same = pool.filter(e => e.name === key), existing = pool.find(e => entryKey(e) === key) ?? (same.length === 1 ? same[0] : undefined), name = existing?.name ?? key;
    const print = existing?.set ? { set: existing.set, ...(existing.cn ? { cn: existing.cn } : {}) } : {};
    if (delta > 0 && deck.format !== 'free' && copiesInDeck(deck, name) >= cardCopyLimit(name, cacheGet(name), deck.format)) { notice = hasCommandZone(deck.format) ? 'Você já tem o limite de cópias entre o deck e a zona de comando.' : 'Você já tem o limite de cópias entre o deck e o sideboard.'; renderStatus(); return; }
    if (existing) { existing.count = Math.max(0, existing.count + delta); if (!existing.count) pool.splice(pool.indexOf(existing), 1); }
    else if (delta > 0) pool.push({ name, count: 1, oracleId: cacheGet(name)?.oracle_id });
    else return;
    if (move) {
      const other = section === 'main' ? deck.sideboard ?? (deck.sideboard = []) : deck.cards;
      const destination = other.find(e => e.name === name && e.set === existing?.set && e.cn === existing?.cn); if (destination) destination.count++; else other.push({ name, count: 1, oracleId: cacheGet(name)?.oracle_id, ...print });
    }
    deck.unresolved = deck.unresolved?.filter(n => deckEntries(deck).some(e => e.name === n));
    changed(deck); preserveRender(renderEdit);
  }
  async function runSearch(more = false) {
    const deck = current(); if (!deck) return;
    if (!more) { similarTo = null; similarTags.clear(); }
    const asked = !!searchQuery.trim() || searchColors.size > 0 || !!searchType || !!searchFunc || commanderSlot !== null;
    const role = commanderSlot === null ? null : slotRole(deck, commanderSlot);
    const q = buildSearchQuery({ text: searchQuery, colors: searchColors, type: searchType, func: searchFunc, identity: role === null || role === 'signature' ? deckIdentity(deck) : null, identityExempt: identityExempt(deck), commanderSlot: role === null ? false : role === 'commander' || role });
    const seq = ++searchSeq;
    if (!asked) { results = []; searching = false; renderResults(); return; }
    searching = true; searchError = ''; if (!more) { results = []; nextPage = 1; } renderResults();
    try {
      const result = await searchCards(q, nextPage, deck.format);
      if (seq !== searchSeq) return;
      results = more ? [...results, ...result.cards] : result.cards; hasMore = result.hasMore; total = result.total; nextPage++;
    } catch (error) { if (seq !== searchSeq) return; searchError = `Não foi possível buscar as cartas: ${(error as Error).message}`; }
    searching = false; renderResults();
  }
  /** "Parecidas": busca no Scryfall as cartas das mesmas cores, tipo e custo próximo, e a ponte ordena pelas tags do Tagger. */
  async function runSimilar(card: ScryCard) {
    const deck = current(); if (!deck || !card.oracle_id) return;
    similarTo = card; similarTags.clear();
    const seq = ++searchSeq;
    results = []; hasMore = false; total = 0; searchError = ''; searching = true; renderResults();
    root.querySelector<HTMLElement>('[data-focus="back-to-text-head"]')?.focus();
    try {
      if (!opts.similarCards) throw new Error('Cartas parecidas precisam do servidor de jogo.');
      const q = similarQuery(card, deckIdentity(deck), identityExempt(deck)), byId = new Map<string, ScryCard>();
      for (let page = 1; page <= SIMILAR_PAGES; page++) {
        const result = await searchCards(q, page, deck.format, { translate: false });
        if (seq !== searchSeq) return;
        for (const c of result.cards) if (c.oracle_id && !byId.has(c.oracle_id)) byId.set(c.oracle_id, c);
        if (!result.hasMore) break;
      }
      const ranked = byId.size ? await opts.similarCards(card.oracle_id, [...byId.keys()]) : [];
      if (seq !== searchSeq) return;
      const found = ranked.flatMap(m => { const c = byId.get(m.oracleId); if (c) similarTags.set(c.name, m.tags); return c ? [c] : []; });
      // Só as que vão aparecer ganham a tradução (as candidatas podem ser centenas).
      await translateCards(found);
      if (seq !== searchSeq) return;
      results = found.map(c => cacheGet(c.name) ?? c); total = results.length;
    } catch (error) { if (seq !== searchSeq) return; searchError = `Não foi possível buscar as cartas parecidas: ${(error as Error).message}`; }
    searching = false; renderResults();
  }
  /** Link do Moxfield ou do Archidekt no lugar da lista: busca o deck e troca o link pela lista, que segue para a revisão. */
  async function resolveImportLink(): Promise<boolean> {
    const link = parseDeckLink(importDraft.text);
    if (!link) return true;
    if (!opts.fetchDeckSource) { importError = 'Importar por link precisa do servidor de jogo. Cole a lista em texto.'; renderImport(); return false; }
    const seq = ++importSeq; importBusy = true; importError = ''; renderImport();
    try {
      const deck = deckLinkToList(link.site, await opts.fetchDeckSource(link.site, link.id));
      if (seq !== importSeq || view !== 'import') return false;
      importDraft = { name: importDraft.name.trim() || deck.name, text: deck.text };
      importBracket = deck.bracket;
      return true;
    } catch (error) {
      if (seq === importSeq) { importError = `Não foi possível importar pelo link. ${(error as Error).message}`; importBusy = false; renderImport(); }
      return false;
    }
  }
  const applyToTarget = (target: DeckData, incoming: DeckData) => listEdit ? applyDeckListEdit(target, incoming) : applyDeckImport(target, incoming, importMode ?? 'replace');
  async function reviewImport() {
    const deckFormat = importTarget?.format ?? importFormat;
    if (!deckFormat) { importError = 'Escolha o formato do deck antes de importar.'; renderImport(); root.querySelector<HTMLElement>('[data-import-format]')?.focus(); return; }
    if (!(await resolveImportLink())) return;
    const source = { ...importDraft };
    const parsed = parseDeckList(source.text);
    if (!parsed.main.length && !parsed.commanders.length && (!importTarget || !parsed.sideboard.length)) { importError = 'Nenhuma carta reconhecida no deck principal. Confira a lista.'; renderImport(); return; }
    const seq = ++importSeq; importBusy = true; importError = ''; renderImport();
    try {
      const resolved = await resolveCardNames([...parsed.main, ...parsed.sideboard, ...parsed.commanders].map(e => e.name));
      if (seq !== importSeq || view !== 'import') return;
      const normalize = (entries: DeckEntry[]) => {
        const merged = new Map<string, DeckEntry>();
        for (const e of entries) {
          const name = resolved.found.get(e.name.toLowerCase()) ?? e.name, oracleId = cacheGet(name)?.oracle_id;
          const print = e.set ? { set: e.set, ...(e.cn ? { cn: e.cn } : {}) } : {};
          const key = `${oracleId ?? name.toLowerCase()}|${e.set ?? ''}|${e.cn ?? ''}`, previous = merged.get(key);
          if (previous) { if (!Number.isSafeInteger(previous.count + e.count)) throw new Error(`Quantidade muito grande para ${name}.`); previous.count += e.count; } else merged.set(key, { name, count: e.count, oracleId, ...print });
        }
        return [...merged.values()];
      };
      const incoming: DeckData = { id: crypto.randomUUID(), name: source.name.trim() || 'Deck importado', format: deckFormat, cards: normalize(parsed.main), sideboard: normalize(parsed.sideboard), commanders: normalize(parsed.commanders), importSource: source.text, unresolved: [...resolved.missing, ...resolved.ambiguous.map(a => a.name)], updatedAt: new Date().toISOString() };
      if (importBracket && deckFormat === 'commander') incoming.bracket = importBracket;
      importReview = { deck: importTarget ? applyToTarget(importTarget, incoming) : incoming, incoming, parsed, missing: resolved.missing, ambiguous: resolved.ambiguous };
      const first = incoming.cards[0], firstType = first ? cacheGet(first.name)?.type_line.split('//')[0] ?? '' : '';
      importCommanderOffer = deckFormat === 'commander' && !incoming.commanders?.length && countEntries(incoming.cards) === 100
        && first?.count === 1 && /\bLegendary\b/.test(firstType) && /\bCreature\b/.test(firstType) ? first.name : null;
      importAcknowledged = false; validation = null;
    } catch (error) { if (seq === importSeq) importError = `Não foi possível conferir as cartas. Sua lista foi preservada. ${(error as Error).message}`; }
    if (seq === importSeq) { importBusy = false; renderImport(); $('#dwImportHeading')?.focus(); }
  }
  async function validate() {
    const deck = view === 'import' ? importReview?.deck : current(); if (!deck || !opts.validateDeck) return;
    const snapshot = JSON.stringify(deck), seq = ++validationSeq;
    const stillCurrent = () => { const now = view === 'import' ? importReview?.deck : current(); return seq === validationSeq && now && JSON.stringify(now) === snapshot; };
    validating = true; validationError = ''; preserveRender(render);
    try { const result = await opts.validateDeck(deck, deck.format ?? 'free'); if (stillCurrent()) validation = result; }
    catch (error) { if (stillCurrent()) validationError = `Não foi possível conferir no servidor: ${(error as Error).message}`; }
    if (seq === validationSeq) { validating = false; preserveRender(render); }
  }

  function setDeckActions(open: boolean, restoreFocus = false) {
    deckActionsOpen = open;
    const trigger = root.querySelector<HTMLButtonElement>('[data-b="deck-actions"]');
    const panel = root.querySelector<HTMLElement>('#dwDeckActions');
    trigger?.setAttribute('aria-expanded', String(open));
    if (panel) panel.hidden = !open;
    if (open) { hideCardPreview(); panel?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); }
    else if (restoreFocus) trigger?.focus({ preventScroll: true });
  }
  document.addEventListener('pointerdown', e => {
    if (deckActionsOpen && e.target instanceof Node && !root.querySelector('.dw-deck-actions')?.contains(e.target)) setDeckActions(false);
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape' && deckActionsOpen) { e.preventDefault(); setDeckActions(false, true); }
    else if (e.key === 'ArrowDown' && (e.target as HTMLElement).matches('[data-b="deck-actions"]')) { e.preventDefault(); setDeckActions(true); }
  });
  root.addEventListener('focusout', e => {
    if (!deckActionsOpen) return;
    const actions = root.querySelector('.dw-deck-actions');
    // Focus briefly belongs to body between pointer-down and focus-in. Use the destination first.
    if (e.relatedTarget instanceof Node) {
      if (!actions?.contains(e.relatedTarget)) setDeckActions(false);
      return;
    }
    setTimeout(() => { if (deckActionsOpen && !root.querySelector('.dw-deck-actions')?.contains(document.activeElement)) setDeckActions(false); }, 0);
  });
  root.addEventListener('click', e => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('button'); if (!target || (target as HTMLButtonElement).disabled) return;
    const ds = target.dataset;
    if (ds.b === 'deck-actions') { setDeckActions(!deckActionsOpen, true); return; }
    if (target.closest('#dwDeckActions')) setDeckActions(false, true);
    if (ds.libraryColor) {
      const color = ds.libraryColor;
      libraryColors = color === 'clear' ? new Set() : toggleColor(libraryColors, color as ColorFilter);
      renderLibrary();
      root.querySelector<HTMLElement>(`[data-library-color="${color === 'clear' ? 'W' : color}"]`)?.focus();
      return;
    }
    if (ds.importFormat) {
      importFormat = format = ds.importFormat as DeckFormat; importError = ''; opts.onFormatChange?.(format);
      renderImport(); root.querySelector<HTMLElement>('#dwImportName')?.focus();
      return;
    }
    if (ds.inspect) { hideCardPreview(); inspectCard({ name: ds.inspect, print: printOf(ds) }, target); return; }
    if (ds.peek) { const deck = [...user, ...DEFAULT_DECKS].find(d => d.id === ds.peek); if (deck) openDeckPreview(deck, { selected: false, onPick: () => edit(deck), pickLabel: deck.builtin ? 'Ver deck' : 'Editar deck' }); return; }
    if (ds.select) { const deck = [...user, ...DEFAULT_DECKS].find(d => d.id === ds.select); if (deck) edit(deck); return; }
    if (ds.copy) { const deck = DEFAULT_DECKS.find(d => d.id === ds.copy); if (deck) duplicate(deck); return; }
    if (ds.commanderSlot !== undefined) { commanderSlot = Number(ds.commanderSlot); searchOpen = true; resetSearch(); renderEdit(); $('#dwCardQuery')?.focus(); void runSearch(); return; }
    if (ds.setCommander) {
      const deck = current(); if (!deck || deck.builtin || commanderSlot === null) return;
      const commanders = deck.commanders ?? (deck.commanders = []);
      commanders[commanderSlot] = { name: ds.setCommander, count: 1, oracleId: cacheGet(ds.setCommander)?.oracle_id };
      const focusSlot = commanderSlot; commanderSlot = null; searchOpen = false; changed(deck); renderEdit();
      root.querySelector<HTMLElement>(`[data-focus="commander:${focusSlot}"]`)?.focus(); return;
    }
    if (ds.removeCommander !== undefined) { const deck = current(); if (deck && !deck.builtin) { deck.commanders?.splice(Number(ds.removeCommander), 1); commanderSlot = null; searchOpen = false; resetSearch(); changed(deck); preserveRender(renderEdit); } return; }
    if (ds.section) { commanderSlot = null; section = ds.section as typeof section; if (section === 'tokens') { searchOpen = false; void loadTokens(); } preserveRender(renderEdit); return; }
    if (ds.token) { const deck = current(), kind = tokenKinds?.find(k => k.oracleId === ds.token); if (deck && kind) openTokenPicker(deck, kind, print => { if (deck.builtin) return; chooseToken(deck, kind, print); deck.updatedAt = new Date().toISOString(); persist(); preserveRender(renderEdit); }); return; }
    if (ds.add) { change(ds.add, 1); return; }
    if (ds.dec) { change(ds.dec, -1); return; }
    if (ds.move) { change(ds.move, -1, true); return; }
    if (ds.cover) {
      const deck = current(); if (!deck || deck.builtin || hasCommandZone(deck.format)) return;
      if (deck.cover === ds.cover) delete deck.cover; else deck.cover = ds.cover;
      changed(deck); preserveRender(renderEdit); return;
    }
    if (ds.promote) {
      const deck = current(); if (!deck || deck.builtin || deck.format !== 'commander' || !promoteToCommander(deck, ds.promote)) return;
      changed(deck); renderEdit(); root.querySelector<HTMLElement>('[data-focus="commander:0"]')?.focus(); return;
    }
    if (ds.similar) { const card = results.find(c => c.name === ds.similar); if (card) { hideCardPreview(); void runSimilar(card); } return; }
    if (ds.color) { const color = ds.color as Color; searchColors.has(color) ? searchColors.delete(color) : searchColors.add(color); target.setAttribute('aria-pressed', String(searchColors.has(color))); void runSearch(); return; }
    switch (ds.b) {
      case 'home': goHome(); break;
      case 'retry-tokens': void loadTokens(); break;
      case 'library': goLibrary(); break;
      case 'new': create(); break;
      case 'import': beginImport(); break;
      case 'import-current': { const deck = current(); if (deck) beginImport(deck); break; }
      case 'list-edit': { const deck = current(); if (deck) beginImport(deck, true); break; }
      case 'import-cancel': { user = loadUserDecks(); const deck = importTarget && user.find(d => d.id === importTarget!.id); importTarget = null; listEdit = false; if (deck) edit(deck); else goLibrary(); break; }
      case 'dup': { const deck = current(); if (deck) duplicate(deck); break; }
      case 'del': { const deck = current(); if (deck && !deck.builtin) { removed = { deck, index: user.indexOf(deck) }; user = user.filter(d => d.id !== deck.id); selected = null; view = 'library'; persist('Deck excluído.'); render(); } break; }
      case 'undo': if (removed) { user.splice(removed.index, 0, removed.deck); removed = null; persist('Deck restaurado.'); render(); } break;
      case 'export': { const deck = current(); setDeckActions(false, true); if (deck) openDeckExport(deck); break; }
      case 'source': { const deck = current(); if (deck?.importSource) download([...deck.importHistory ?? [], deck.importSource].join('\n\n// Importação seguinte\n\n'), 'listas-originais.txt'); break; }
      case 'export-import': download(importDraft.text, 'lista-original.txt'); break;
      case 'recovery': download(exportDeckRecovery(), 'recuperacao-decks.json', 'application/json'); break;
      case 'retry-save': persist(); break;
      case 'retry-cards': cardsError = null; renderStatus(); void loadData(); break;
      case 'clear-search': listQuery = ''; libraryColors = new Set(); renderLibrary(); break;
      case 'search': commanderSlot = null; searchOpen = !searchOpen; hideCardPreview(); renderEdit(); if (searchOpen) $('#dwCardQuery')?.focus(); break;
      case 'open-search': commanderSlot = null; searchOpen = true; renderEdit(); $('#dwCardQuery')?.focus(); break;
      case 'more': void runSearch(true); break;
      case 'retry-search': if (similarTo) void runSimilar(similarTo); else void runSearch(); break;
      case 'back-to-text': similarTo = null; similarTags.clear(); searchFunc = ''; results = []; renderEdit(); $('#dwCardQuery')?.focus(); void runSearch(); break;
      case 'validate': void validate(); break;
      case 'import-edit': validationSeq++; validating = false; importReview = null; validation = null; importError = ''; renderImport(); $('#dwImportText')?.focus(); break;
      case 'import-save': saveImport(); break;
      case 'import-commander-yes': case 'import-commander-no': {
        const name = importCommanderOffer; importCommanderOffer = null;
        if (ds.b === 'import-commander-yes' && name && importReview) {
          const incoming = importReview.incoming, index = incoming.cards.findIndex(e => e.name === name), entry = incoming.cards[index];
          if (entry) {
            incoming.cards.splice(index, 1); incoming.commanders = [entry];
            validationSeq++; validating = false; validation = null; validationError = ''; importError = '';
            try { importReview.deck = importTarget ? applyToTarget(importTarget, incoming) : incoming; }
            catch (error) { importError = (error as Error).message; }
          }
        }
        renderImport(); $('#dwImportHeading')?.focus(); break;
      }
    }
  });
  root.addEventListener('submit', e => {
    e.preventDefault(); const form = e.target as HTMLFormElement;
    if (form.id === 'dwImportForm') { if (!importBusy) void reviewImport(); }
    if (form.id === 'dwSearchForm') void runSearch();
  });
  root.addEventListener('input', e => {
    const input = e.target as HTMLInputElement;
    if (input.id === 'dwListQuery') { listQuery = input.value; preserveRender(renderLibrary); }
    if (input.id === 'dwCardQuery') searchQuery = input.value;
    if (input.id === 'dwImportName') importDraft.name = input.value;
    if (input.id === 'dwImportText') { importDraft.text = input.value; }
    if (input.id === 'dwName') { const deck = current(); if (deck && !deck.builtin) { deck.name = input.value; $('#dwDeckTitle').setAttribute('aria-label', deck.name || 'Deck sem nome'); changed(deck); } }
  });
  root.addEventListener('change', e => {
    const input = e.target as HTMLInputElement;
    if (input.id === 'dwImportFormat') { importFormat = input.value as DeckFormat; if (importError) importError = ''; }
    if (input.id === 'dwFormat' || input.id === 'dwImportFormat') { format = input.value as DeckFormat; opts.onFormatChange?.(format); if (view === 'library') renderLibrary(); else if (view === 'import' && !importReview) preserveRender(renderImport); }
    if (input.id === 'dwDeckFormat') { const deck = current(); if (deck && !deck.builtin) { deck.format = input.value as DeckFormat; format = deck.format; commanderSlot = null; section = 'main'; changed(deck); resetSearch(); preserveRender(renderEdit); void loadData(); } }
    if (input.dataset.commanderColor !== undefined) { const deck = current(), entry = deck?.commanders?.[Number(input.dataset.commanderColor)]; if (deck && !deck.builtin && entry) { if (/^[WBRG]$/.test(input.value)) entry.chosenColors = input.value; else delete entry.chosenColors; changed(deck); resetSearch(); preserveRender(renderEdit); } }
    if (input.id === 'dwBracket') { const deck = current(), value = Number(input.value); if (deck && !deck.builtin && isBracket(value)) { deck.bracket = value; changed(deck); preserveRender(renderEdit); } }
    if (input.id === 'dwSearchType') { searchType = input.value; void runSearch(); }
    if (input.id === 'dwSearchFunc') { searchFunc = input.value; void runSearch(); }
    if (input.name === 'importMode' && importTarget && importReview && (input.value === 'merge' || input.value === 'replace')) {
      importMode = input.value; validationSeq++; validating = false; validation = null; validationError = ''; importError = '';
      try { importReview.deck = applyDeckImport(importTarget, importReview.incoming, importMode); }
      catch (error) { importError = (error as Error).message; }
      preserveRender(renderImport);
    }
    if (input.id === 'dwImportAck') { importAcknowledged = input.checked; const button = root.querySelector<HTMLButtonElement>('[data-b="import-save"]'); if (button) button.disabled = !importCanSave(); }
  });
  const preview = (e: Event) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('[data-inspect]');
    if (card) showCardPreview({ name: card.dataset.inspect!, print: printOf(card.dataset) }, card);
  };
  root.addEventListener('pointerover', e => { if (e.pointerType === 'mouse') preview(e); });
  root.addEventListener('focusin', preview);
  root.addEventListener('pointerout', e => { if (!(e.relatedTarget instanceof Node) || !(e.target as HTMLElement).closest('[data-inspect]')?.contains(e.relatedTarget)) hideCardPreview(); });
  root.addEventListener('focusout', () => hideCardPreview());
  render();
  return {
    refresh(nextFormat?: DeckFormat) { user = loadUserDecks(); if (nextFormat) format = nextFormat; saveError = getDeckStorageState().error ?? ''; preserveRender(render); },
    open(options: DeckBuilderOpen) {
      importSeq++; importBusy = false; validationSeq++; validating = false; validation = null; validationError = ''; hideCardPreview();
      if (options.format) format = options.format;
      user = loadUserDecks();
      importTarget = null;
      if (options.action === 'create') create();
      else if (options.action === 'import') beginImport();
      else if (options.action === 'edit') { const deck = user.find(d => d.id === options.deckId); if (deck) edit(deck); else { notice = 'Este deck não está mais na sua coleção.'; goLibrary(); } }
      else { view = 'library'; selected = null; importReview = null; render(); void loadData(); }
    },
  };
}
