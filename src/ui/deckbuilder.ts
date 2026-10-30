import './decks.css';
import { DEFAULT_DECKS, FORMAT_LABEL, readyDeckFits, SACOLA_HINT, countEntries, isBasic, isConstructed, deckEntries, deckSize, totalDeckSize, exportDeckList, exportDeckRecovery, entryKey, printLabel, getDeckStorageState, loadUserDecks, parseDeckList, saveUserDecks, type DeckData, type DeckEntry, type DeckFormat, type ParsedList } from '../decks';
import { cardInfo, type Color } from '../cards';
import { cacheGet, fetchByNames, fetchPrintings, preloadDeckImages, resolveCardNames, searchCards, translateCards, type ScryCard } from '../scryfall';
import { esc, manaHTML, pip } from './cardtext';
import { bracketBadgeHTML, deckArt, deckColors, deckPriceHTML, groupedRows, statsHTML } from './deckStats';
import { BRACKET_DESCRIPTION, BRACKET_NAME, BRACKETS, bracketLabel, deckBracket, estimateBracket, isBracket, type Bracket } from '../brackets';
import { deckLinkToList, parseDeckLink, type DeckSite } from '../deckLink';
import { cardCopyLimit, copiesInDeck, validateDeckLocal, type ServerDeckValidation } from './deckRules';
import { inspectCard, showCardPreview, hideCardPreview } from './cardInspector';
import { openDeckPreview } from './deckPreview';
import { download, openDeckExport } from './deckExport';
import { mountAppHeader } from './appHeader';
import { applyDeckImport, applyDeckListEdit, deckImportSnapshot, deckListChanges, type DeckImportMode } from './deckImport';
import { colorFilterHTML, commanderLineHTML, matchesColors, matchesQuery, toggleColor, type ColorFilter } from './deckFilters';
import './deckFilters.css';
import { avisoContaHTML, montarAvisoConta } from './contaAviso';
import { buildSearchQuery, FUNCTION_TAGS, similarQuery } from './cardSearch';

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
const COLORS: Color[] = ['W', 'U', 'B', 'R', 'G'];
const COLOR_NAME: Record<Color, string> = { W: 'Branco', U: 'Azul', B: 'Preto', R: 'Vermelho', G: 'Verde' };
const TYPE_FILTERS = [['Todos os tipos', ''], ['Criatura', 't:creature'], ['Instantânea', 't:instant'], ['Feitiço', 't:sorcery'], ['Artefato', 't:artifact'], ['Encantamento', 't:enchantment'], ['Terreno', 't:land']];
const formatLabel = (format: DeckFormat) => FORMAT_LABEL[format];
/** A impressão escolhida vai junto no botão da carta, para a prévia e o inspetor mostrarem a arte dela. */
const printData = (e: DeckEntry) => e.set ? ` data-set="${esc(e.set)}"${e.cn ? ` data-cn="${esc(e.cn)}"` : ''}` : '';
const printOf = (ds: DOMStringMap) => ds.set ? { set: ds.set, cn: ds.cn } : undefined;
const formatOptions = (format: DeckFormat) => (['free', 'standard', 'pauper', 'sacola50', 'commander'] as const).map(f => `<option value="${f}" ${format === f ? 'selected' : ''}>${FORMAT_LABEL[f]}</option>`).join('');

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
  let saveError = getDeckStorageState().error ?? '';
  let removed: { deck: DeckData; index: number } | null = null;
  let section: 'main' | 'sideboard' = 'main';
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
  /** Bracket que veio com o deck do link (Archidekt); vale só para Commander e nunca abaixo do mínimo. */
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
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;

  root.innerHTML = `<div class="deck-workspace"><header data-app-header></header><div id="dwStatus" class="dw-status" role="status" aria-live="polite"></div><main id="dwContent"></main></div>`;
  function goHome() { setDeckActions(false); importSeq++; importBusy = false; validationSeq++; validating = false; hideCardPreview(); opts.onBack(); }
  function goLibrary() { setDeckActions(false); importSeq++; importBusy = false; validationSeq++; validating = false; view = 'library'; selected = null; hideCardPreview(); render(); }
  mountAppHeader(root.querySelector('[data-app-header]')!, { active: 'decks', onPlay: goHome, onDecks: goLibrary });

  function renderStatus() {
    const recovery = getDeckStorageState().recovery.length;
    $('#dwStatus').innerHTML = `${saveError ? `<p class="dw-error">${esc(saveError)} <button type="button" class="dw-button" data-b="retry-save">Tentar salvar</button> <button type="button" class="dw-button" data-b="recovery">Exportar recuperação</button></p>` : notice ? `<p>${esc(notice)}</p>` : ''}${recovery && !saveError ? `<p class="dw-error">Há ${recovery} registros preservados para recuperação. <button type="button" class="dw-button" data-b="recovery">Exportar recuperação</button></p>` : ''}${removed ? `<p>Deck excluído. <button type="button" class="dw-button" data-b="undo">Desfazer</button></p>` : ''}`;
    $('#dwStatus').hidden = !$('#dwStatus').hasChildNodes();
  }
  function persist(message = '') {
    const result = saveUserDecks(user);
    saveError = result.ok ? '' : result.error;
    notice = result.ok ? message : '';
    renderStatus(); opts.onChange();
  }
  function changed(deck: DeckData) {
    // Uma carta que sobe o mínimo leva o bracket escolhido junto.
    if (deck.bracket && deck.format === 'commander') { const min = estimateBracket(deck).min; if (min > deck.bracket) deck.bracket = min; }
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
    const range = input && ['text', 'search', 'textarea'].includes(input.type) ? [input.selectionStart, input.selectionEnd] : null;
    const x = window.scrollX, y = window.scrollY;
    render();
    if (key) {
      const target = [...root.querySelectorAll<HTMLElement>('[data-focus]')].find(el => el.dataset.focus === key);
      target?.focus({ preventScroll: true });
      if (range && target instanceof HTMLInputElement && range[0] !== null && range[1] !== null) target.setSelectionRange(range[0], range[1]);
    }
    window.scrollTo(x, y);
  }
  function cardTile(deck: DeckData, personal: boolean) {
    const art = deckArt(deck), local = validateDeckLocal(deck, format), colors = deckColors(deck);
    return `<article class="dw-deck"><button type="button" class="dw-cover" data-peek="${esc(deck.id)}" aria-label="Ver cartas de ${esc(deck.name)}">${art ? `<img src="${esc(art)}" alt="" loading="lazy">` : '<span aria-hidden="true">▱</span>'}${colors.length ? `<span class="dw-cover-colors">${colors.map(pip).join('')}</span>` : ''}<span class="dw-cover-tag">${personal ? 'Seu deck' : 'Deck pronto'}</span></button><div class="dw-deck-info"><h3>${esc(deck.name)}</h3>${commanderLineHTML(deck, ptName, 'dw-deck-commander')}<p><span>${totalDeckSize(deck)} cartas${deck.sideboard?.length ? ` · ${countEntries(deck.sideboard)} no sideboard` : ''}</span>${deckPriceHTML(deck, 'dw-deck-price', true)}${bracketBadgeHTML(deck, 'dw-deck-bracket')}</p><p class="dw-deck-valid ${local.status}">${formatLabel(deck.format ?? 'free')}${isConstructed(format) ? ` · ${local.status === 'valid' ? `Compatível com ${FORMAT_LABEL[format]}` : local.status === 'invalid' ? 'Precisa de ajustes' : 'Não verificado'}` : ''}</p><div class="dw-actions"><button type="button" class="dw-button ${personal ? 'primary' : ''}" data-select="${esc(deck.id)}" data-focus="deck:${esc(deck.id)}">${personal ? 'Editar deck' : 'Ver deck'}</button>${!personal ? `<button type="button" class="dw-button" data-copy="${esc(deck.id)}">Criar cópia</button>` : ''}</div></div></article>`;
  }
  function renderLibrary() {
    const match = (d: DeckData) => matchesQuery(d, listQuery, ptName) && matchesColors(deckColors(d), libraryColors);
    const filtering = !!listQuery.trim() || libraryColors.size > 0;
    const mine = user.filter(match), ready = DEFAULT_DECKS.filter(match).filter(d => readyDeckFits(d, format));
    $('#dwContent').innerHTML = `<section class="dw-library"><div class="dw-title"><div><p class="dw-eyebrow">Sua coleção</p><h1>Meus decks <small>${user.length}</small></h1><p>Crie, ajuste e escolha o seu próximo deck.</p></div><div class="dw-actions"><button type="button" class="dw-button" data-b="import">Importar lista</button><button type="button" class="dw-button primary" data-b="new">Criar deck</button></div></div>${avisoContaHTML(user.length > 0)}<div class="dw-library-tools"><label class="dw-search"><span>Buscar deck</span><input type="search" id="dwListQuery" data-focus="library-search" value="${esc(listQuery)}" placeholder="Nome do deck" autocomplete="off"></label><label class="dw-field">Formato<select id="dwFormat" data-focus="library-format">${formatOptions(format)}</select></label><div class="dw-field dw-color-field"><span>Cores</span>${colorFilterHTML(libraryColors, 'data-library-color')}</div></div>${mine.length ? `<div class="dw-deck-grid">${mine.map(d => cardTile(d, true)).join('')}</div>` : `<div class="dw-empty"><h2>${user.length ? filtering && libraryColors.size ? 'Nenhum deck com esse nome e essas cores.' : 'Nenhum deck com esse nome.' : 'Você ainda não tem nenhum deck.'}</h2><p>${user.length ? 'Tente outro nome, outras cores ou limpe os filtros.' : 'Crie seu primeiro deck, importe uma lista ou faça uma cópia de um deck pronto.'}</p><div class="dw-actions">${user.length ? '<button type="button" class="dw-button" data-b="clear-search">Limpar filtros</button>' : '<button type="button" class="dw-button primary" data-b="new">Criar deck</button><button type="button" class="dw-button" data-b="import">Importar lista</button>'}</div></div>`}<details class="dw-ready" ${showReady ? 'open' : ''}><summary>Decks prontos <small>${ready.length}</small><span>Escolha um ponto de partida</span></summary><div class="dw-deck-grid">${ready.map(d => cardTile(d, false)).join('') || `<p>Nenhum deck pronto com ${libraryColors.size ? 'esse nome e essas cores' : 'esse nome'}.</p>`}</div></details></section>`;
    montarAvisoConta(root);
    root.querySelector('.dw-ready')?.addEventListener('toggle', e => { const next = (e.target as HTMLDetailsElement).open; if (next !== showReady) { showReady = next; if (next) void loadData(); } });
  }
  function validationHTML(deck: DeckData) {
    const local = validateDeckLocal(deck, deck.format ?? 'free');
    const issues = validation?.issues ?? local.issues;
    const title = validation ? validation.valid ? 'Deck validado pelo servidor' : 'O deck precisa de ajustes' : local.status === 'invalid' ? 'O deck precisa de ajustes' : local.status === 'unknown' ? 'Legalidade não verificada' : 'Pronto para conferir';
    return `<div class="dw-validity ${validation?.valid === false || local.status === 'invalid' ? 'invalid' : ''}"><div><strong>${title}</strong><p>${validation?.valid ? `Regras: ${esc(validation.rulesVersion ?? 'versão atual')}` : 'Você pode salvar um rascunho. A partida só começa após a validação do servidor.'}</p></div>${opts.validateDeck ? `<button type="button" class="dw-button" data-b="validate" data-focus="validate" ${validating ? 'disabled' : ''}>${validating ? 'Conferindo…' : 'Conferir deck'}</button>` : ''}${issues.length ? `<details><summary>${issues.length} ${issues.length === 1 ? 'ponto para revisar' : 'pontos para revisar'}</summary><ul>${issues.map(i => `<li>${esc(i.card && !i.message.includes(i.card) ? `${i.card}: ${i.message}` : i.message)}</li>`).join('')}</ul></details>` : ''}${validationError ? `<p class="dw-error">${esc(validationError)}</p>` : ''}${deck.format === 'sacola50' ? `<p class="dw-note">${esc(SACOLA_HINT)}</p>` : ''}</div>`;
  }
  function entriesHTML(deck: DeckData) {
    const entries = section === 'main' ? deck.cards : deck.sideboard ?? [];
    return groupedRows(entries).map(group => `<section class="dw-card-group"><h3>${group.label}<span>${countEntries(group.rows)}</span></h3><ul>${group.rows.map(row => {
      const label = row.info?.label ?? row.name;
      return `<li><button type="button" class="dw-card-name" data-inspect="${esc(row.name)}"${printData(row)} data-focus="inspect:${esc(entryKey(row))}"><span class="dw-card-art">${row.info?.artCrop ? `<img src="${esc(row.info.artCrop)}" alt="" loading="lazy">` : ''}</span><span>${esc(label)}${row.set ? ` <small class="dw-print" title="Impressão escolhida">${esc(printLabel(row))}</small>` : ''}</span><span class="dw-mana">${row.info ? manaHTML(row.info.manaCost) : ''}</span></button>${deck.builtin ? `<b class="dw-count">${row.count}</b>` : `<div class="dw-stepper"><button type="button" data-dec="${esc(entryKey(row))}" data-focus="dec:${esc(entryKey(row))}" aria-label="Remover uma cópia de ${esc(label)}">−</button><span>${row.count}</span><button type="button" data-add="${esc(entryKey(row))}" data-focus="add:${esc(entryKey(row))}" aria-label="Adicionar uma cópia de ${esc(label)}">+</button></div>`}<button type="button" class="dw-transfer" data-move="${esc(entryKey(row))}" data-focus="move:${esc(entryKey(row))}" ${deck.builtin || deck.format === 'commander' ? 'hidden' : ''} title="${section === 'main' ? 'Mover uma cópia para o sideboard' : 'Mover uma cópia para o deck principal'}" aria-label="${section === 'main' ? 'Mover uma cópia para o sideboard' : 'Mover uma cópia para o deck principal'}: ${esc(label)}">${section === 'main' ? '→' : '←'}</button>${coverButtonHTML(deck, row.name, label)}</li>`;
    }).join('')}</ul></section>`).join('') || `<div class="dw-empty compact"><h3>${section === 'main' ? 'Deck vazio.' : 'Sideboard vazio.'}</h3>${!deck.builtin ? `<div class="dw-actions">${!searchOpen ? '<button type="button" class="dw-button primary" data-b="open-search">Adicionar cartas</button>' : ''}<button type="button" class="dw-button" data-b="import-current">Importar lista</button></div>` : ''}</div>`;
  }
  /** Escolher a carta como capa do deck: só no deck principal, sem os básicos e fora do Commander, onde a capa é o comandante. */
  function coverButtonHTML(deck: DeckData, name: string, label: string) {
    if (deck.builtin || deck.format === 'commander' || section !== 'main' || isBasic(name)) return '';
    const chosen = deck.cover === name, text = chosen ? `Capa do deck: ${label}. Toque para voltar à capa automática` : `Usar ${label} como capa do deck`;
    return `<button type="button" class="dw-cover-pick" data-cover="${esc(name)}" data-focus="cover:${esc(name)}" aria-pressed="${chosen}" title="${chosen ? 'Capa do deck (toque para voltar à automática)' : 'Usar como capa do deck'}" aria-label="${esc(text)}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 16 5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.5"/></svg></button>`;
  }
  function commanderHTML(deck: DeckData) {
    if (deck.format !== 'commander') return '';
    const commanders = deck.commanders ?? [];
    const identity = new Set(commanders.flatMap(e => cacheGet(e.name)?.color_identity ?? []));
    return `<section class="dw-commander-zone" aria-label="Comandantes"><div class="dw-commander-cards">${commanders.map((entry, index) => {
      const sc = cacheGet(entry.name, entry), info = sc ? cardInfo(sc) : null;
      return `<article class="dw-commander"><button type="button" class="dw-commander-portrait" data-inspect="${esc(entry.name)}"${printData(entry)} aria-label="Ler ${esc(info?.label ?? entry.name)}">${info?.image ? `<img src="${esc(info.image)}" alt="${esc(info.label)}">` : esc(entry.name)}</button><div><p class="dw-eyebrow">${index ? 'Segundo comandante' : 'Comandante'}</p><h2>${esc(info?.label ?? entry.name)}</h2>${!deck.builtin ? `<div class="dw-actions"><button type="button" class="dw-button" data-commander-slot="${index}" data-focus="commander:${index}">Trocar</button><button type="button" class="dw-button subtle" data-remove-commander="${index}" aria-label="Remover ${esc(info?.label ?? entry.name)}">Remover</button></div>` : ''}</div></article>`;
    }).join('')}${!deck.builtin && commanders.length < 2 ? `<button type="button" class="${commanders.length ? 'dw-button subtle dw-commander-add' : 'dw-commander-empty'}" data-commander-slot="${commanders.length}" data-focus="commander:${commanders.length}">${commanders.length ? '+ Segundo comandante' : '<span>+</span><strong>Escolher comandante</strong><small>Sua estratégia começa aqui</small>'}</button>` : ''}</div><div class="dw-commander-summary"><p class="dw-eyebrow">Commander</p><strong>${totalDeckSize(deck)} <small>/ 100 cartas</small></strong><p>${COLORS.filter(c => identity.has(c)).map(pip).join('') || 'Identidade incolor'}</p><p class="dw-note">${deckSize(deck)} no deck · ${countEntries(commanders)} na zona de comando</p>${bracketHTML(deck)}</div></section>`;
  }
  /** O bracket do deck: o jogador escolhe a partir do mínimo das cartas, com o porquê do mínimo. */
  function bracketHTML(deck: DeckData) {
    const bracket = deckBracket(deck); if (!bracket) return '';
    const estimate = estimateBracket(deck), weighs = estimate.reasons.filter(r => r.min > 1), informs = estimate.reasons.filter(r => r.min === 1);
    const summary = estimate.min > 1 ? `Por que no mínimo ${bracketLabel(estimate.min)}?` : 'Nada nas cartas pede um bracket mais alto';
    return `<div class="dw-bracket"><label class="dw-field">Bracket<select id="dwBracket" data-focus="deck-bracket" ${deck.builtin ? 'disabled' : ''}>${BRACKETS.map(b => `<option value="${b}" ${b === bracket ? 'selected' : ''} ${b < estimate.min ? 'disabled' : ''}>${b} · ${BRACKET_NAME[b]}</option>`).join('')}</select></label><p class="dw-note">${esc(BRACKET_DESCRIPTION[bracket])}</p>${estimate.reasons.length ? `<details class="dw-bracket-why"><summary>${summary}</summary><ul>${[...weighs.map(r => `<li><b>${bracketLabel(r.min)}</b> ${esc(r.text)}</li>`), ...informs.map(r => `<li class="dw-bracket-info">${esc(r.text)} <small>(não muda o bracket)</small></li>`)].join('')}</ul></details>` : `<p class="dw-note">${summary}.</p>`}</div>`;
  }
  function renderEdit() {
    const deck = current(); if (!deck) { view = 'library'; renderLibrary(); return; }
    const art = deckArt(deck);
    $('#dwContent').innerHTML = `<section class="dw-editor"><div class="dw-edit-breadcrumb"><button type="button" class="dw-button subtle" data-b="library"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>Meus decks</button></div><div class="dw-edit-head">${art ? `<img class="dw-edit-cover" src="${esc(art)}" alt="">` : ''}<div class="dw-edit-name">${deck.builtin ? `<h1 class="dw-deck-title">${esc(deck.name)}</h1>` : `<h1 class="dw-deck-title" id="dwDeckTitle" aria-label="${esc(deck.name || 'Deck sem nome')}"><input id="dwName" data-focus="deck-name" aria-label="Nome do deck" maxlength="80" value="${esc(deck.name)}"><svg class="dw-name-edit-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15z"/></svg></h1>`}</div><div class="dw-edit-controls"><label class="dw-field">Formato<select id="dwDeckFormat" data-focus="deck-format" ${deck.builtin ? 'disabled' : ''}>${formatOptions(deck.format ?? 'free')}</select></label><div class="dw-deck-actions"><button type="button" class="dw-button dw-actions-trigger" data-b="deck-actions" data-focus="deck-actions" aria-expanded="${deckActionsOpen}" aria-controls="dwDeckActions">Ações do deck<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><div class="dw-action-menu" id="dwDeckActions" ${deckActionsOpen ? '' : 'hidden'}>${!deck.builtin ? '<button type="button" class="dw-button" data-b="import-current" data-focus="action-import">Importar lista</button><button type="button" class="dw-button" data-b="list-edit" data-focus="action-list-edit">Editar como lista</button>' : ''}<button type="button" class="dw-button" data-b="export" data-focus="action-export">Exportar lista</button>${deck.importSource ? '<button type="button" class="dw-button" data-b="source" data-focus="action-source">Lista original</button>' : ''}<button type="button" class="dw-button" data-b="dup" data-focus="action-duplicate">${deck.builtin ? 'Criar uma cópia' : 'Duplicar'}</button>${!deck.builtin ? '<button type="button" class="dw-button danger" data-b="del" data-focus="action-delete">Excluir</button>' : ''}</div></div></div></div>${commanderHTML(deck)}${deck.builtin ? '<p class="dw-template-note">Este deck pronto pode ser usado como está. Crie uma cópia para editar suas cartas.</p>' : ''}<div class="dw-edit-layout ${searchOpen && !deck.builtin ? 'search-open' : ''}"><section class="dw-deck-panel">${totalDeckSize(deck) + countEntries(deck.sideboard ?? []) ? statsHTML(deck) + validationHTML(deck) : ''}<div class="dw-section-tabs" role="group" aria-label="Seção do deck"><button type="button" class="dw-button" data-section="main" data-focus="section-main" aria-pressed="${section === 'main'}">${deck.format === 'commander' ? 'Deck' : 'Principal'} <b>${deckSize(deck)}${deck.format === 'commander' ? `/${100 - countEntries(deck.commanders ?? [])}` : ''}</b></button><button type="button" class="dw-button" ${deck.format === 'commander' && !deck.sideboard?.length ? 'hidden' : ''} data-section="sideboard" data-focus="section-sideboard" aria-pressed="${section === 'sideboard'}">Sideboard <b>${countEntries(deck.sideboard ?? [])}</b></button>${!deck.builtin ? `<button type="button" class="dw-button ${searchOpen ? '' : 'primary'}" data-b="search" data-focus="toggle-search" aria-expanded="${searchOpen}">${searchOpen ? 'Fechar busca' : 'Adicionar cartas'}</button>` : ''}</div><div class="dw-card-list">${entriesHTML(deck)}</div></section>${searchOpen && !deck.builtin ? `<aside class="dw-search-panel" aria-label="Buscar cartas"><h2>${commanderSlot !== null ? 'Escolher comandante' : `Adicionar ao ${section === 'main' ? 'deck principal' : 'sideboard'}`}</h2><form id="dwSearchForm"><label class="dw-field">Nome ou texto da carta<input id="dwCardQuery" data-focus="card-search" type="search" value="${esc(searchQuery)}" placeholder="Busque em português ou inglês" autocomplete="off"></label><button class="dw-button primary" type="submit">Buscar</button></form>${identityNoteHTML(deck)}<label class="dw-field dw-func-field">Função<select id="dwSearchFunc" data-focus="card-func"><option value="">Qualquer função</option>${FUNCTION_TAGS.map(tag => `<option value="${tag}" ${tag === searchFunc ? 'selected' : ''}>${tag}</option>`).join('')}</select></label><p class="dw-tagger">Função e <strong>Parecidas</strong> usam as tags do <a href="https://tagger.scryfall.com/" target="_blank" rel="noopener">Tagger</a>, o projeto de etiquetas da comunidade do Scryfall.</p><details class="dw-filters"><summary>Filtros e busca avançada</summary><div class="dw-colors">${COLORS.map(c => `<button type="button" data-color="${c}" aria-label="Filtrar por ${COLOR_NAME[c].toLowerCase()}" aria-pressed="${searchColors.has(c)}">${pip(c)}</button>`).join('')}</div><label class="dw-field">Tipo<select id="dwSearchType">${TYPE_FILTERS.map(([label, value]) => `<option value="${value}" ${value === searchType ? 'selected' : ''}>${label}</option>`).join('')}</select></label><p>Busca avançada: <code>mv&lt;=2</code> para custo, <code>o:"draw a card"</code> para texto. As cores incluem cartas incolores.</p></details>${isConstructed(deck.format) ? `<p class="dw-note">Cartas legais no ${deck.format === 'sacola50' ? 'Legacy' : FORMAT_LABEL[deck.format]}.</p>` : ''}<div id="dwResults"></div></aside>` : ''}</div></section>`;
    if (searchOpen && !deck.builtin) renderResults();
  }
  function renderResults() {
    const el = root.querySelector('#dwResults'), deck = current(); if (!el || !deck) return;
    const back = '<button type="button" class="dw-button" data-b="back-to-text" data-focus="back-to-text">Voltar à busca por texto</button>';
    const similarHead = similarTo ? `<div class="dw-similar-head"><p>Parecidas com <strong>${esc(cardInfo(similarTo).label)}</strong></p><button type="button" class="dw-button subtle" data-b="back-to-text" data-focus="back-to-text-head">Voltar à busca</button></div>` : '';
    if (searchError) { el.innerHTML = `${similarHead}<p class="dw-error" role="alert">${esc(searchError)}</p><div class="dw-actions"><button type="button" class="dw-button" data-b="retry-search">Tentar novamente</button>${similarTo ? back : ''}</div>`; return; }
    if (searching && !results.length) { el.innerHTML = `${similarHead}<p role="status">${similarTo ? 'Procurando cartas parecidas… Na primeira vez do dia pode levar alguns segundos.' : 'Buscando cartas…'}</p>`; return; }
    if (!results.length) {
      const filters = searchQuery.trim() || searchType || searchColors.size;
      el.innerHTML = similarTo
        ? `${similarHead}<div class="dw-empty compact"><h3>Nenhuma carta parecida encontrada.</h3><p>Comparamos ${esc(cardInfo(similarTo).label)} com as cartas das mesmas cores, do mesmo tipo e de custo próximo${isConstructed(deck.format) ? `, legais no ${deck.format === 'sacola50' ? 'Legacy' : FORMAT_LABEL[deck.format]}` : ''}, e nenhuma tem função em comum no Tagger.</p><div class="dw-actions">${back}</div></div>`
        : searchFunc
          ? `<div class="dw-empty compact"><h3>Nenhuma carta com a função <code>${esc(searchFunc)}</code>${filters ? ' e esses filtros' : ''}.</h3><p>Tente outra função${filters ? ', limpe os filtros' : ''} ou procure pelo nome e pelo texto da carta.</p>${identityEmptyHTML(deck)}<div class="dw-actions">${back}</div></div>`
          : filters ? `<p class="dw-note">Nenhuma carta encontrada. Tente outros termos.</p>${identityEmptyHTML(deck)}` : '';
      return;
    }
    const canSimilar = commanderSlot === null && !!opts.similarCards;
    el.innerHTML = `${similarHead}<p class="dw-note" role="status">${total} ${similarTo ? (total === 1 ? 'carta parecida' : 'cartas parecidas') : total === 1 ? 'carta encontrada' : 'cartas encontradas'}</p><div class="dw-results">${results.map(sc => {
      const tags = similarTo ? similarTags.get(sc.name) : undefined;
      const info = cardInfo(sc), count = countEntries((section === 'main' ? deck.cards : deck.sideboard ?? []).filter(e => e.name === sc.name));
      const full = deck.format !== 'free' && copiesInDeck(deck, sc.name) >= cardCopyLimit(sc.name, sc, deck.format);
      return `<article><button type="button" class="dw-result-art" data-inspect="${esc(sc.name)}" aria-label="Ler ${esc(info.label)}">${info.imageSmall ? `<img src="${esc(info.imageSmall)}" alt="" loading="lazy">` : esc(info.label)}</button><p title="${esc(info.label)}">${esc(info.label)}</p>${tags?.length ? `<p class="dw-result-tags" title="Tags em comum no Tagger">${tags.map(esc).join(' · ')}</p>` : ''}${canSimilar && sc.oracle_id ? `<button type="button" class="dw-similar" data-similar="${esc(sc.name)}" data-focus="similar:${esc(sc.name)}" aria-label="Cartas parecidas com ${esc(info.label)}">Parecidas</button>` : ''}${commanderSlot !== null ? `<button type="button" class="dw-button primary" data-set-commander="${esc(sc.name)}" data-focus="set-commander:${esc(sc.name)}">Escolher</button>` : `<div class="dw-stepper"><button type="button" data-dec="${esc(sc.name)}" data-focus="result-dec:${esc(sc.name)}" ${!count ? 'disabled' : ''} aria-label="Remover uma cópia de ${esc(info.label)}">−</button><span>${count}</span><button type="button" data-add="${esc(sc.name)}" data-focus="result-add:${esc(sc.name)}" ${full ? 'disabled' : ''} aria-label="Adicionar uma cópia de ${esc(info.label)}">+</button></div>`}</article>`;
    }).join('')}</div>${hasMore ? `<button type="button" class="dw-button dw-more" data-b="more" ${searching ? 'disabled' : ''}>${searching ? 'Carregando…' : 'Mais resultados'}</button>` : ''}`;
  }
  function importCanSave() {
    return !!importReview && (!importTarget || !!importMode) && !importError
      && (!(importReview.parsed.skipped.length || importReview.parsed.ignored.length) || importAcknowledged)
      && !(listEdit && importTarget && !deckListChanges(importTarget, importReview.deck).length);
  }
  function renderImport() {
    const review = importReview, target = importTarget;
    const needsChoice = !!target && !listEdit && !!deckEntries(target).length;
    const changes = review && target && listEdit ? deckListChanges(target, review.deck) : null;
    const sectionName = { commanders: 'Zona de comando', cards: target?.format === 'commander' ? 'Deck' : 'Principal', sideboard: 'Sideboard' };
    const changeLine = (e: DeckEntry, sign: string) => `<li class="${sign === '+' ? 'add' : 'remove'}"><b>${sign}${e.count}</b> ${esc(ptName(e.name))}${e.set ? ` <small>${esc(printLabel(e))}</small>` : ''}</li>`;
    const changesHTML = !changes ? '' : changes.length
      ? `<div class="dw-list-changes"><h3>Mudanças</h3>${changes.map(c => `<section><h4>${sectionName[c.section]}</h4><ul>${c.added.map(e => changeLine(e, '+')).join('')}${c.removed.map(e => changeLine(e, '−')).join('')}</ul></section>`).join('')}</div>`
      : '<p class="dw-note">A lista está igual ao deck atual. Nada para salvar.</p>';
    const countLabel = (deck: DeckData) => `${deckSize(deck)} no principal · ${countEntries(deck.sideboard ?? [])} no sideboard${deck.commanders?.length ? ` · ${countEntries(deck.commanders)} na zona de comando` : ''}`;
    $('#dwContent').innerHTML = `<section class="dw-import"><button type="button" class="dw-button subtle" data-b="import-cancel">← ${target ? 'Voltar ao deck' : 'Voltar aos meus decks'}</button><p class="dw-eyebrow">${listEdit ? (review ? '2. Revise as mudanças' : '1. Edite a lista') : review ? '2. Revise sua lista' : '1. Cole sua lista'}</p><h1 tabindex="-1" id="dwImportHeading">${listEdit ? 'Editar como lista' : target ? 'Importar lista neste deck' : 'Importar deck'}</h1><p>${target ? `<strong>${esc(target.name)}</strong> · ${formatLabel(target.format ?? 'free')}. O nome e o formato serão mantidos.` : 'Deck principal e sideboard serão preservados.'}</p>${review ? `<div class="dw-import-review"><h2>${esc(review.deck.name)}</h2>${importCommanderOffer && !(importMode === 'merge' && target?.commanders?.length) ? `<div class="dw-import-commander" role="group" aria-label="Sugestão de comandante"><p><strong>${esc(ptName(importCommanderOffer))}</strong> é uma criatura lendária e abre a lista de 100 cartas. Quer usá-la como comandante?</p><div class="dw-actions"><button type="button" class="dw-button primary" data-b="import-commander-yes" data-focus="import-commander-yes">Usar como comandante</button><button type="button" class="dw-button" data-b="import-commander-no" data-focus="import-commander-no">Deixar no deck</button></div></div>` : ''}${needsChoice ? `<fieldset class="dw-import-mode"><legend>Como aplicar a lista?</legend><label><input type="radio" name="importMode" value="merge" data-focus="import-merge" ${importMode === 'merge' ? 'checked' : ''}><span><strong>Adicionar às cartas atuais</strong><small>Soma as cópias da lista em cada seção. Um comandante que já está no deck não é repetido.</small></span></label><label><input type="radio" name="importMode" value="replace" data-focus="import-replace" ${importMode === 'replace' ? 'checked' : ''}><span><strong>Substituir todas as cartas</strong><small>Troca todas as seções, incluindo os comandantes, pela lista importada.</small></span></label></fieldset>` : ''}<div class="dw-import-counts" aria-live="polite">${target ? `<p><span>Deck atual</span><strong>${countLabel(target)}</strong></p>` : ''}<p><span>${target && !importMode ? 'Lista importada' : target ? 'Após salvar' : 'Lista reconhecida'}</span><strong>${countLabel(review.deck)}</strong></p></div>${changesHTML}${review.missing.length ? `<div class="dw-error"><strong>Cartas não reconhecidas</strong><p>Estas cartas serão preservadas no rascunho, sem permitir iniciar uma partida até serem corrigidas:</p><ul>${review.missing.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}${review.ambiguous.length ? `<div class="dw-error"><strong>Nomes de mais de uma carta</strong><p>Estes nomes servem para cartas diferentes. Volte à lista e troque pelo nome em inglês da carta certa; até lá elas ficam no rascunho, sem permitir iniciar uma partida:</p><ul>${review.ambiguous.map(a => `<li>${esc(a.name)}: ${a.options.map(esc).join(' ou ')}</li>`).join('')}</ul></div>` : ''}${review.parsed.skipped.length || review.parsed.ignored.length ? `<div class="dw-error"><p>${listEdit ? 'Estas linhas não foram entendidas e vão ficar fora do deck:' : 'Algumas linhas não serão adicionadas às cartas. A lista original ficará salva no rascunho.'}</p><ul>${[...review.parsed.skipped, ...review.parsed.ignored].map(line => `<li>${esc(line)}</li>`).join('')}</ul><label><input type="checkbox" id="dwImportAck" data-focus="import-ack" ${importAcknowledged ? 'checked' : ''}> ${listEdit ? 'Revisei as linhas acima e quero salvar sem elas.' : 'Revisei as linhas acima e quero guardar o rascunho.'}</label></div>` : ''}${!target || importMode ? validationHTML(review.deck) : '<p class="dw-note">Escolha uma opção para conferir o resultado antes de salvar.</p>'}<details><summary>${target && importMode ? 'Lista após salvar' : 'Lista reconhecida'}</summary><pre>${esc(exportDeckList(review.deck))}</pre></details>${importError ? `<p class="dw-error" role="alert">${esc(importError)}</p>` : ''}<div class="dw-actions"><button type="button" class="dw-button" data-b="import-edit">Voltar à lista</button><button type="button" class="dw-button primary" data-b="import-save" ${importCanSave() ? '' : 'disabled'}>${listEdit ? 'Salvar mudanças' : target ? 'Salvar neste deck' : `Salvar ${review.missing.length || review.ambiguous.length ? 'rascunho' : 'deck'}`}</button></div></div>` : `<form id="dwImportForm">${!target ? `<div class="dw-import-fields"><label class="dw-field">Nome do deck<input id="dwImportName" data-focus="import-name" ${importBusy ? 'disabled' : ''} maxlength="80" value="${esc(importDraft.name)}" placeholder="Meu novo deck (ou o nome do link)"></label><label class="dw-field">Formato<select id="dwImportFormat" data-focus="import-format" ${importBusy ? 'disabled' : ''}>${formatOptions(format)}</select></label></div>` : ''}<label class="dw-field">${listEdit ? 'Lista do deck' : 'Lista de cartas ou link do deck'}<textarea id="dwImportText" data-focus="import-text" ${importBusy ? 'disabled' : ''} rows="13" spellcheck="false" required placeholder="https://moxfield.com/decks/…&#10;&#10;ou&#10;&#10;Deck&#10;4 Lightning Bolt&#10;20 Mountain&#10;&#10;Sideboard&#10;2 Duress">${esc(importDraft.text)}</textarea></label><p class="dw-note">${listEdit ? 'Uma carta por linha, com a quantidade na frente; nomes em português ou inglês. Mude as quantidades, apague ou acrescente linhas, e passe uma carta para baixo de outro título (Commander, Deck ou Sideboard) para trocá-la de seção. Antes de salvar, você confere o que entra e o que sai.' : 'Cole o link público de um deck do Moxfield, ou do Archidekt, ou a lista exportada do Arena, MTGO, Moxfield ou Archidekt. Uma carta por linha; nomes em português ou inglês. A seção Commander preserva seus comandantes. Maybeboard e fichas aparecem na revisão, sem entrar no deck.'}</p>${importError ? `<p class="dw-error" role="alert">${esc(importError)}</p>` : ''}<div class="dw-actions"><button class="dw-button primary" ${importBusy ? 'disabled' : ''}>${importBusy ? (parseDeckLink(importDraft.text) ? 'Buscando o deck…' : 'Conferindo cartas…') : listEdit ? 'Revisar mudanças' : 'Revisar importação'}</button>${listEdit ? '' : '<button type="button" class="dw-button" data-b="export-import">Baixar lista original</button>'}</div></form>`}</section>`;
  }
  function beginImport(target?: DeckData, asList = false) {
    if (target?.builtin) return;
    setDeckActions(false);
    importSeq++; importBusy = false; validationSeq++; validating = false; validation = null; validationError = '';
    importTarget = target ? structuredClone(target) : null;
    listEdit = asList && !!target;
    importMode = target && (listEdit || !deckEntries(target).length) ? 'replace' : null;
    importDraft = { name: target?.name ?? '', text: listEdit ? exportDeckList(target!) : '' }; importBracket = undefined; importReview = null; importError = ''; importAcknowledged = false; importCommanderOffer = null;
    view = 'import'; hideCardPreview(); render(); $('#dwImportText')?.focus();
  }
  function saveImport() {
    if (!importReview || !importCanSave()) return;
    const deck = importReview.deck;
    if (importTarget) {
      const latest = loadUserDecks(), index = latest.findIndex(d => d.id === importTarget!.id);
      user = [...latest];
      if (index < 0 || deckImportSnapshot(latest[index]) !== deckImportSnapshot(importTarget)) {
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
    try { art = localStorage.getItem('mesa:cards') === 'art'; } catch { /* Storage is optional. */ }
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
    catch { if (view === 'edit') { notice = 'Alguns dados das cartas não foram carregados. O deck continua disponível.'; renderStatus(); } }
  }
  function resetSearch() { searchSeq++; results = []; searchQuery = ''; searchType = ''; searchFunc = ''; similarTo = null; similarTags.clear(); searchColors.clear(); hasMore = false; searching = false; searchError = ''; }
  function edit(deck: DeckData) {
    deckActionsOpen = false;
    importSeq++; importBusy = false; validationSeq++; validating = false;
    selected = deck.id; view = 'edit'; section = 'main'; commanderSlot = null; searchOpen = !deck.cards.length && !deck.builtin && deck.format !== 'commander';
    validation = null; validationError = ''; resetSearch(); hideCardPreview(); render(); void loadData();
  }
  function create() {
    const deck: DeckData = { id: crypto.randomUUID(), name: 'Novo deck', cards: [], sideboard: [], format, updatedAt: new Date().toISOString() };
    user.unshift(deck); persist(); edit(deck); $('#dwName')?.focus(); ($('#dwName') as HTMLInputElement)?.select();
  }
  function duplicate(source: DeckData) {
    const { price: _price, ...rest } = source;
    const deck: DeckData = { ...rest, id: crypto.randomUUID(), name: `${source.name} (cópia)`, builtin: false, cards: source.cards.map(e => ({ ...e })), commanders: source.commanders?.map(e => ({ ...e })) ?? [], sideboard: source.sideboard?.map(e => ({ ...e })) ?? [], sourceTemplateId: source.builtin ? source.id : source.sourceTemplateId, updatedAt: new Date().toISOString() };
    user.unshift(deck); persist('Cópia criada nos seus decks.'); edit(deck);
  }
  /** `key` é o nome da carta (busca) ou a linha do deck (`entryKey`), que separa as impressões da mesma carta. */
  function change(key: string, delta: number, move = false) {
    const deck = current(); if (!deck || deck.builtin) return;
    const pool = section === 'main' ? deck.cards : deck.sideboard ?? (deck.sideboard = []);
    // Da busca vem só o nome: soma na linha da carta (na impressão que ela tiver), se houver uma só.
    const same = pool.filter(e => e.name === key), existing = pool.find(e => entryKey(e) === key) ?? (same.length === 1 ? same[0] : undefined), name = existing?.name ?? key;
    const print = existing?.set ? { set: existing.set, ...(existing.cn ? { cn: existing.cn } : {}) } : {};
    if (delta > 0 && deck.format !== 'free' && copiesInDeck(deck, name) >= cardCopyLimit(name, cacheGet(name), deck.format)) { notice = deck.format === 'commander' ? 'Você já tem o limite de cópias entre o deck e a zona de comando.' : 'Você já tem o limite de cópias entre o deck e o sideboard.'; renderStatus(); return; }
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
    const q = buildSearchQuery({ text: searchQuery, colors: searchColors, type: searchType, func: searchFunc, identity: commanderSlot === null ? deckIdentity(deck) : null, commanderSlot: commanderSlot !== null });
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
  /** Identidade de cor do comandante, para a busca não trazer cartas fora dela (null fora do Commander ou sem comandante). */
  function deckIdentity(deck: DeckData): string[] | null {
    const commanders = deck.format === 'commander' ? deck.commanders ?? [] : [];
    if (!commanders.length || !commanders.every(e => cacheGet(e.name))) return null;
    return commanders.flatMap(e => cacheGet(e.name)?.color_identity ?? []);
  }
  /** A identidade que a busca está usando, à vista no painel (null quando a busca não filtra por ela). */
  function searchIdentity(deck: DeckData): { colors: Color[]; names: string } | null {
    const identity = commanderSlot === null ? deckIdentity(deck) : null;
    if (!identity) return null;
    return { colors: COLORS.filter(c => identity.includes(c)), names: (deck.commanders ?? []).map(e => ptName(e.name)).join(' e ') };
  }
  function identityNoteHTML(deck: DeckData) {
    const id = searchIdentity(deck); if (!id) return '';
    return `<p class="dw-identity">Identidade de cor: ${id.colors.map(pip).join('') || 'incolor'} <span>· de ${esc(id.names)}</span></p>`;
  }
  /** Busca vazia no Commander: lembra que as cartas fora da identidade do comandante não aparecem. */
  function identityEmptyHTML(deck: DeckData) {
    const id = searchIdentity(deck); if (!id) return '';
    const colors = id.colors.map(c => COLOR_NAME[c].toLowerCase());
    const within = colors.length ? `fora de ${colors.length > 1 ? `${colors.slice(0, -1).join(', ')} e ${colors[colors.length - 1]}` : colors[0]}` : 'colorida';
    return `<p class="dw-note">Nenhuma carta ${within} aparece: a identidade de ${esc(id.names)} limita a busca.</p>`;
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
      const q = similarQuery(card, deckIdentity(deck)), byId = new Map<string, ScryCard>();
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
    if (!(await resolveImportLink())) return;
    const source = { ...importDraft }, importFormat = importTarget?.format ?? format;
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
      const incoming: DeckData = { id: crypto.randomUUID(), name: source.name.trim() || 'Deck importado', format: importFormat, cards: normalize(parsed.main), sideboard: normalize(parsed.sideboard), commanders: normalize(parsed.commanders), importSource: source.text, unresolved: [...resolved.missing, ...resolved.ambiguous.map(a => a.name)], updatedAt: new Date().toISOString() };
      if (importBracket && importFormat === 'commander') { const min = estimateBracket(incoming).min; incoming.bracket = importBracket > min ? importBracket : min; }
      importReview = { deck: importTarget ? applyToTarget(importTarget, incoming) : incoming, incoming, parsed, missing: resolved.missing, ambiguous: resolved.ambiguous };
      const first = incoming.cards[0], firstType = first ? cacheGet(first.name)?.type_line.split('//')[0] ?? '' : '';
      importCommanderOffer = importFormat === 'commander' && !incoming.commanders?.length && countEntries(incoming.cards) === 100
        && first?.count === 1 && /Legendary/.test(firstType) && /Creature/.test(firstType) ? first.name : null;
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
    if (ds.section) { commanderSlot = null; section = ds.section as 'main' | 'sideboard'; preserveRender(renderEdit); return; }
    if (ds.add) { change(ds.add, 1); return; }
    if (ds.dec) { change(ds.dec, -1); return; }
    if (ds.move) { change(ds.move, -1, true); return; }
    if (ds.cover) {
      const deck = current(); if (!deck || deck.builtin || deck.format === 'commander') return;
      if (deck.cover === ds.cover) delete deck.cover; else deck.cover = ds.cover;
      changed(deck); preserveRender(renderEdit); return;
    }
    if (ds.similar) { const card = results.find(c => c.name === ds.similar); if (card) { hideCardPreview(); void runSimilar(card); } return; }
    if (ds.color) { const color = ds.color as Color; searchColors.has(color) ? searchColors.delete(color) : searchColors.add(color); target.setAttribute('aria-pressed', String(searchColors.has(color))); void runSearch(); return; }
    switch (ds.b) {
      case 'home': goHome(); break;
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
          const incoming = importReview.incoming, index = incoming.cards.findIndex(e => e.name === name);
          if (index >= 0) {
            const [entry] = incoming.cards.splice(index, 1); incoming.commanders = [entry];
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
    if (input.id === 'dwFormat' || input.id === 'dwImportFormat') { format = input.value as DeckFormat; opts.onFormatChange?.(format); if (view === 'library') renderLibrary(); else if (view === 'import' && !importReview) preserveRender(renderImport); }
    if (input.id === 'dwDeckFormat') { const deck = current(); if (deck && !deck.builtin) { deck.format = input.value as DeckFormat; format = deck.format; commanderSlot = null; section = 'main'; changed(deck); resetSearch(); preserveRender(renderEdit); void loadData(); } }
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
