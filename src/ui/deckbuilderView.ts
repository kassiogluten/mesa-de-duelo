import { COMMAND_DECK_SIZE, DEFAULT_DECKS, FORMAT_LABEL, hasCommandZone, SACOLA_HINT, countEntries, isBasic, isConstructed, deckEntries, deckSize, totalDeckSize, exportDeckList, entryKey, printLabel, readyDeckFits, type DeckData, type DeckEntry, type DeckFormat, type ParsedList } from '../decks';
import { cardInfo, type Color } from '../cards';
import { cacheGet, type ScryCard } from '../scryfall';
import { esc, manaHTML, pip } from './cardtext';
import { bracketBadgeHTML, CARD_DATA_ERROR, deckArt, deckColors, deckPriceHTML, groupedRows, statsHTML } from './deckStats';
import { BRACKET_DESCRIPTION, BRACKET_NAME, BRACKETS, bracketLabel, deckBracket, estimateBracket } from '../brackets';
import { cardCopyLimit, copiesInDeck, validateDeckLocal, type ServerDeckValidation } from './deckRules';
import { deckListChanges, type DeckImportMode } from './deckImport';
import { avisoContaHTML } from './contaAviso';
import { colorFilterHTML, commanderLineHTML, matchesColors, matchesQuery, type ColorFilter } from './deckFilters';
import { parseDeckLink } from '../deckLink';
import { FUNCTION_TAGS } from './cardSearch';
import { tokensTabHTML } from './deckTokensView';
import type { TokenKind } from '../deckTokens';

/**
 * O que a tela Meus decks desenha a partir do estado do editor: a biblioteca, o deck aberto (com a zona de comando,
 * a lista e a busca de cartas) e a importação. Nada aqui muda o estado; `mountDeckBuilder` monta o `BuilderState`.
 */
export interface BuilderState {
  format: DeckFormat;
  ptName(name: string): string;
  user: DeckData[];
  view: 'library' | 'edit' | 'import';
  listQuery: string;
  libraryColors: Set<ColorFilter>;
  showReady: boolean;
  notice: string;
  cardsError: 'library' | 'edit' | null;
  saveError: string;
  removed: { deck: DeckData; index: number } | null;
  section: 'main' | 'sideboard' | 'tokens';
  /** As fichas do deck aberto (aba Fichas): nulo enquanto procura. */
  tokenKinds: TokenKind[] | null;
  tokensError: boolean;
  searchOpen: boolean;
  commanderSlot: number | null;
  deckActionsOpen: boolean;
  searchQuery: string;
  searchType: string;
  searchFunc: string;
  similarTo: ScryCard | null;
  similarTags: Map<string, string[]>;
  searchColors: Set<Color>;
  results: ScryCard[];
  hasMore: boolean;
  total: number;
  searching: boolean;
  searchError: string;
  validation: ServerDeckValidation | null;
  validating: boolean;
  validationError: string;
  /** Há servidor para conferir o deck e para as "Parecidas". */
  canValidate: boolean;
  canSimilar: boolean;
  importDraft: { name: string; text: string };
  importBusy: boolean;
  importError: string;
  importTarget: DeckData | null;
  importMode: DeckImportMode | null;
  importReview: { deck: DeckData; incoming: DeckData; parsed: ParsedList; missing: string[]; ambiguous: { name: string; options: string[] }[] } | null;
  importAcknowledged: boolean;
  listEdit: boolean;
  importCommanderOffer: string | null;
  /** A revisão da importação pode ser salva. */
  importCanSave: boolean;
}

export const COLORS: Color[] = ['W', 'U', 'B', 'R', 'G'];
export const COLOR_NAME: Record<Color, string> = { W: 'Branco', U: 'Azul', B: 'Preto', R: 'Vermelho', G: 'Verde' };
const TYPE_FILTERS = [['Todos os tipos', ''], ['Criatura', 't:creature'], ['Instantânea', 't:instant'], ['Feitiço', 't:sorcery'], ['Artefato', 't:artifact'], ['Encantamento', 't:enchantment'], ['Terreno', 't:land']];
const formatLabel = (format: DeckFormat) => FORMAT_LABEL[format];
const SLOT_LABEL = { commander: 'Comandante', oathbreaker: 'Oathbreaker', signature: 'Mágica de assinatura' } as const;
/** A carta é um planeswalker (pela face da frente): no Oathbreaker, é o oathbreaker da zona de comando. */
const isPlaneswalker = (name: string) => /\bPlaneswalker\b/.test(cacheGet(name)?.type_line.split('//')[0] ?? '');
/** A impressão escolhida vai junto no botão da carta, para a prévia e o inspetor mostrarem a arte dela. */
const printData = (e: DeckEntry) => e.set ? ` data-set="${esc(e.set)}"${e.cn ? ` data-cn="${esc(e.cn)}"` : ''}` : '';
export const printOf = (ds: DOMStringMap) => ds.set ? { set: ds.set, cn: ds.cn } : undefined;
const formatOptions = (format: DeckFormat) => (['free', 'standard', 'pauper', 'sacola50', 'commander', 'oathbreaker'] as const).map(f => `<option value="${f}" ${format === f ? 'selected' : ''}>${FORMAT_LABEL[f]}</option>`).join('');

/** Avisos do alto da tela: erro ao salvar, dados das cartas que faltaram, recuperação e o desfazer da exclusão. */
export function statusHTML(s: BuilderState, recovery: number) {
  const { saveError, notice, cardsError, view, removed } = s;
  return `${saveError ? `<p class="dw-error">${esc(saveError)} <button type="button" class="dw-button" data-b="retry-save">Tentar salvar</button> <button type="button" class="dw-button" data-b="recovery">Exportar recuperação</button></p>` : notice ? `<p>${esc(notice)}</p>` : ''}${cardsError === view ? `<p class="dw-error">${esc(cardsError === 'edit' ? 'Alguns dados das cartas não foram carregados. O deck continua disponível.' : CARD_DATA_ERROR)} <button type="button" class="dw-button" data-b="retry-cards">Tentar de novo</button></p>` : ''}${recovery && !saveError ? `<p class="dw-error">Há ${recovery} registros preservados para recuperação. <button type="button" class="dw-button" data-b="recovery">Exportar recuperação</button></p>` : ''}${removed ? `<p>Deck excluído. <button type="button" class="dw-button" data-b="undo">Desfazer</button></p>` : ''}`;
}
function deckTileHTML(deck: DeckData, personal: boolean, s: BuilderState) {
  const { format, ptName } = s;
    const art = deckArt(deck), local = validateDeckLocal(deck, format), colors = deckColors(deck);
    return `<article class="dw-deck"><button type="button" class="dw-cover" data-peek="${esc(deck.id)}" aria-label="Ver cartas de ${esc(deck.name)}">${art ? `<img src="${esc(art)}" alt="" loading="lazy">` : '<span aria-hidden="true">▱</span>'}${colors.length ? `<span class="dw-cover-colors">${colors.map(pip).join('')}</span>` : ''}<span class="dw-cover-tag">${personal ? 'Seu deck' : 'Deck pronto'}</span></button><div class="dw-deck-info"><h3>${esc(deck.name)}</h3>${commanderLineHTML(deck, ptName, 'dw-deck-commander')}<p><span>${totalDeckSize(deck)} cartas${deck.sideboard?.length ? ` · ${countEntries(deck.sideboard)} no sideboard` : ''}</span>${deckPriceHTML(deck, 'dw-deck-price', true)}${bracketBadgeHTML(deck, 'dw-deck-bracket')}</p><p class="dw-deck-valid ${local.status}">${formatLabel(deck.format ?? 'free')}${isConstructed(format) ? ` · ${local.status === 'valid' ? `Compatível com ${FORMAT_LABEL[format]}` : local.status === 'invalid' ? 'Precisa de ajustes' : 'Não verificado'}` : ''}</p><div class="dw-actions"><button type="button" class="dw-button ${personal ? 'primary' : ''}" data-select="${esc(deck.id)}" data-focus="deck:${esc(deck.id)}">${personal ? 'Editar deck' : 'Ver deck'}</button>${!personal ? `<button type="button" class="dw-button" data-copy="${esc(deck.id)}">Criar cópia</button>` : ''}</div></div></article>`;
}
export function libraryHTML(s: BuilderState) {
  const { user, listQuery, libraryColors, format, showReady } = s;
    const match = (d: DeckData) => matchesQuery(d, listQuery, s.ptName) && matchesColors(deckColors(d), libraryColors);
    const filtering = !!listQuery.trim() || libraryColors.size > 0;
    const mine = user.filter(match), ready = DEFAULT_DECKS.filter(match).filter(d => readyDeckFits(d, format));
  const cardTile = (deck: DeckData, personal: boolean) => deckTileHTML(deck, personal, s);
  return `<section class="dw-library"><div class="dw-title"><div><p class="dw-eyebrow">Sua coleção</p><h1>Meus decks <small>${user.length}</small></h1><p>Crie, ajuste e escolha o seu próximo deck.</p></div><div class="dw-actions"><button type="button" class="dw-button" data-b="import">Importar lista</button><button type="button" class="dw-button primary" data-b="new">Criar deck</button></div></div>${avisoContaHTML(user.length > 0)}<div class="dw-library-tools"><label class="dw-search"><span>Buscar deck</span><input type="search" id="dwListQuery" data-focus="library-search" value="${esc(listQuery)}" placeholder="Nome do deck" autocomplete="off"></label><label class="dw-field">Formato<select id="dwFormat" data-focus="library-format">${formatOptions(format)}</select></label><div class="dw-field dw-color-field"><span>Cores</span>${colorFilterHTML(libraryColors, 'data-library-color')}</div></div>${mine.length ? `<div class="dw-deck-grid">${mine.map(d => cardTile(d, true)).join('')}</div>` : `<div class="dw-empty"><h2>${user.length ? filtering && libraryColors.size ? 'Nenhum deck com esse nome e essas cores.' : 'Nenhum deck com esse nome.' : 'Você ainda não tem nenhum deck.'}</h2><p>${user.length ? 'Tente outro nome, outras cores ou limpe os filtros.' : 'Crie seu primeiro deck, importe uma lista ou faça uma cópia de um deck pronto.'}</p><div class="dw-actions">${user.length ? '<button type="button" class="dw-button" data-b="clear-search">Limpar filtros</button>' : '<button type="button" class="dw-button primary" data-b="new">Criar deck</button><button type="button" class="dw-button" data-b="import">Importar lista</button>'}</div></div>`}<details class="dw-ready" ${showReady ? 'open' : ''}><summary>Decks prontos <small>${ready.length}</small><span>Escolha um ponto de partida</span></summary><div class="dw-deck-grid">${ready.map(d => cardTile(d, false)).join('') || `<p>Nenhum deck pronto com ${libraryColors.size ? 'esse nome e essas cores' : 'esse nome'}.</p>`}</div></details></section>`;
}
function validationHTML(deck: DeckData, s: BuilderState) {
  const { validation, validating, validationError } = s;
    const local = validateDeckLocal(deck, deck.format ?? 'free');
    const issues = validation?.issues ?? local.issues;
    const title = validation ? validation.valid ? 'Deck validado pelo servidor' : 'O deck precisa de ajustes' : local.status === 'invalid' ? 'O deck precisa de ajustes' : local.status === 'unknown' ? 'Legalidade não verificada' : 'Pronto para conferir';
    return `<div class="dw-validity ${validation?.valid === false || local.status === 'invalid' ? 'invalid' : ''}"><div><strong>${title}</strong><p>${validation?.valid ? `Regras: ${esc(validation.rulesVersion ?? 'versão atual')}` : 'Você pode salvar um rascunho. A partida só começa após a validação do servidor.'}</p></div>${s.canValidate ? `<button type="button" class="dw-button" data-b="validate" data-focus="validate" ${validating ? 'disabled' : ''}>${validating ? 'Conferindo…' : 'Conferir deck'}</button>` : ''}${issues.length ? `<details><summary>${issues.length} ${issues.length === 1 ? 'ponto para revisar' : 'pontos para revisar'}</summary><ul>${issues.map(i => `<li>${esc(i.card && !i.message.includes(i.card) ? `${i.card}: ${i.message}` : i.message)}</li>`).join('')}</ul></details>` : ''}${validationError ? `<p class="dw-error">${esc(validationError)}</p>` : ''}${deck.format === 'sacola50' ? `<p class="dw-note">${esc(SACOLA_HINT)}</p>` : ''}</div>`;
}
function entriesHTML(deck: DeckData, s: BuilderState) {
  const { section, searchOpen } = s;
    const entries = section === 'main' ? deck.cards : deck.sideboard ?? [];
    return groupedRows(entries).map(group => `<section class="dw-card-group"><h3>${group.label}<span>${countEntries(group.rows)}</span></h3><ul>${group.rows.map(row => {
      const label = row.info?.label ?? row.name;
      return `<li><button type="button" class="dw-card-name" data-inspect="${esc(row.name)}"${printData(row)} data-focus="inspect:${esc(entryKey(row))}"><span class="dw-card-art">${row.info?.artCrop ? `<img src="${esc(row.info.artCrop)}" alt="" loading="lazy">` : ''}</span><span>${esc(label)}${row.set ? ` <small class="dw-print" title="Impressão escolhida">${esc(printLabel(row))}</small>` : ''}</span><span class="dw-mana">${row.info ? manaHTML(row.info.manaCost) : ''}</span></button>${deck.builtin ? `<b class="dw-count">${row.count}</b>` : `<div class="dw-stepper"><button type="button" data-dec="${esc(entryKey(row))}" data-focus="dec:${esc(entryKey(row))}" aria-label="Remover uma cópia de ${esc(label)}">−</button><span>${row.count}</span><button type="button" data-add="${esc(entryKey(row))}" data-focus="add:${esc(entryKey(row))}" aria-label="Adicionar uma cópia de ${esc(label)}">+</button></div>`}<button type="button" class="dw-transfer" data-move="${esc(entryKey(row))}" data-focus="move:${esc(entryKey(row))}" ${deck.builtin || hasCommandZone(deck.format) ? 'hidden' : ''} title="${section === 'main' ? 'Mover uma cópia para o sideboard' : 'Mover uma cópia para o deck principal'}" aria-label="${section === 'main' ? 'Mover uma cópia para o sideboard' : 'Mover uma cópia para o deck principal'}: ${esc(label)}">${section === 'main' ? '→' : '←'}</button>${coverButtonHTML(deck, row.name, label, section)}</li>`;
    }).join('')}</ul></section>`).join('') || `<div class="dw-empty compact"><h3>${section === 'main' ? 'Deck vazio.' : 'Sideboard vazio.'}</h3>${!deck.builtin ? `<div class="dw-actions">${!searchOpen ? '<button type="button" class="dw-button primary" data-b="open-search">Adicionar cartas</button>' : ''}<button type="button" class="dw-button" data-b="import-current">Importar lista</button></div>` : ''}</div>`;
}
  /** Escolher a carta como capa do deck: só no deck principal, sem os básicos e fora do Commander e do Oathbreaker, onde a capa é o comandante. */
function coverButtonHTML(deck: DeckData, name: string, label: string, section: BuilderState['section']) {
    if (deck.builtin || hasCommandZone(deck.format) || section !== 'main' || isBasic(name)) return '';
    const chosen = deck.cover === name, text = chosen ? `Capa do deck: ${label}. Toque para voltar à capa automática` : `Usar ${label} como capa do deck`;
    return `<button type="button" class="dw-cover-pick" data-cover="${esc(name)}" data-focus="cover:${esc(name)}" aria-pressed="${chosen}" title="${chosen ? 'Capa do deck (toque para voltar à automática)' : 'Usar como capa do deck'}" aria-label="${esc(text)}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 16 5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.5"/></svg></button>`;
  }
function commanderHTML(deck: DeckData) {
    if (!hasCommandZone(deck.format)) return '';
    const commanders = deck.commanders ?? [], oath = deck.format === 'oathbreaker';
    const identity = new Set(deckIdentity(deck) ?? commanders.flatMap(e => cacheGet(e.name)?.color_identity ?? []));
    const eyebrow = (index: number) => oath ? SLOT_LABEL[slotRole(deck, index)] : index ? 'Segundo comandante' : 'Comandante';
    const add = !commanders.length ? `<span>+</span><strong>${oath ? 'Escolher oathbreaker' : 'Escolher comandante'}</strong><small>${oath ? 'Um planeswalker para liderar o deck' : 'Sua estratégia começa aqui'}</small>`
      : oath ? `+ ${SLOT_LABEL[slotRole(deck, commanders.length)]}` : '+ Segundo comandante';
    return `<section class="dw-commander-zone" aria-label="${oath ? 'Zona de comando' : 'Comandantes'}"><div class="dw-commander-cards">${commanders.map((entry, index) => {
      const sc = cacheGet(entry.name, entry), info = sc ? cardInfo(sc) : null;
      return `<article class="dw-commander"><button type="button" class="dw-commander-portrait" data-inspect="${esc(entry.name)}"${printData(entry)} aria-label="Ler ${esc(info?.label ?? entry.name)}">${info?.image ? `<img src="${esc(info.image)}" alt="${esc(info.label)}">` : esc(entry.name)}</button><div><p class="dw-eyebrow">${eyebrow(index)}</p><h2>${esc(info?.label ?? entry.name)}</h2>${!deck.builtin ? `<div class="dw-actions"><button type="button" class="dw-button" data-commander-slot="${index}" data-focus="commander:${index}">Trocar</button><button type="button" class="dw-button subtle" data-remove-commander="${index}" aria-label="Remover ${esc(info?.label ?? entry.name)}">Remover</button></div>` : ''}</div></article>`;
    }).join('')}${!deck.builtin && commanders.length < 2 ? `<button type="button" class="${commanders.length ? 'dw-button subtle dw-commander-add' : 'dw-commander-empty'}" data-commander-slot="${commanders.length}" data-focus="commander:${commanders.length}">${add}</button>` : ''}</div><div class="dw-commander-summary"><p class="dw-eyebrow">${FORMAT_LABEL[deck.format]}</p><strong>${totalDeckSize(deck)} <small>/ ${COMMAND_DECK_SIZE[deck.format]} cartas</small></strong><p>${COLORS.filter(c => identity.has(c)).map(pip).join('') || 'Identidade incolor'}</p><p class="dw-note">${deckSize(deck)} no deck · ${countEntries(commanders)} na zona de comando</p>${bracketHTML(deck)}</div></section>`;
  }
  /** O bracket do deck: o jogador escolhe a partir do mínimo das cartas, com o porquê do mínimo. */
  function bracketHTML(deck: DeckData) {
    const bracket = deckBracket(deck); if (!bracket) return '';
    const estimate = estimateBracket(deck), weighs = estimate.reasons.filter(r => r.min > 1), informs = estimate.reasons.filter(r => r.min === 1);
    const summary = estimate.min > 1 ? `Por que no mínimo ${bracketLabel(estimate.min)}?` : 'Nada nas cartas pede um bracket mais alto';
    return `<div class="dw-bracket"><label class="dw-field">Bracket<select id="dwBracket" data-focus="deck-bracket" ${deck.builtin ? 'disabled' : ''}>${BRACKETS.map(b => `<option value="${b}" ${b === bracket ? 'selected' : ''} ${b < estimate.min ? 'disabled' : ''}>${b} · ${BRACKET_NAME[b]}</option>`).join('')}</select></label><p class="dw-note">${esc(BRACKET_DESCRIPTION[bracket])}</p>${estimate.reasons.length ? `<details class="dw-bracket-why"><summary>${summary}</summary><ul>${[...weighs.map(r => `<li><b>${bracketLabel(r.min)}</b> ${esc(r.text)}</li>`), ...informs.map(r => `<li class="dw-bracket-info">${esc(r.text)} <small>(não muda o bracket)</small></li>`)].join('')}</ul></details>` : `<p class="dw-note">${summary}.</p>`}</div>`;
  }
  /** O papel de cada lugar da zona de comando: no Oathbreaker, o planeswalker e a mágica de assinatura. */
export function slotRole(deck: DeckData, slot: number): 'commander' | 'oathbreaker' | 'signature' {
    if (deck.format !== 'oathbreaker') return 'commander';
    const entry = deck.commanders?.[slot];
    if (entry) return isPlaneswalker(entry.name) ? 'oathbreaker' : 'signature';
    return (deck.commanders ?? []).some((e, i) => i !== slot && isPlaneswalker(e.name)) ? 'signature' : 'oathbreaker';
  }
  /** Identidade de cor do comandante (no Oathbreaker, a do planeswalker), para a busca não trazer cartas fora dela (null fora desses formatos ou sem comandante). */
export function deckIdentity(deck: DeckData): string[] | null {
    const commanders = deck.format === 'commander' ? deck.commanders ?? [] : deck.format === 'oathbreaker' ? (deck.commanders ?? []).filter(e => isPlaneswalker(e.name)) : [];
    if (!commanders.length || !commanders.every(e => cacheGet(e.name))) return null;
    return commanders.flatMap(e => cacheGet(e.name)?.color_identity ?? []);
  }
  /** A identidade que a busca está usando, à vista no painel (null quando a busca não filtra por ela). */
function searchIdentity(deck: DeckData, s: BuilderState): { colors: Color[]; names: string } | null {
  const { commanderSlot, ptName } = s;
    const identity = commanderSlot === null ? deckIdentity(deck) : null;
    if (!identity) return null;
    return { colors: COLORS.filter(c => identity.includes(c)), names: (deck.commanders ?? []).filter(e => deck.format !== 'oathbreaker' || isPlaneswalker(e.name)).map(e => ptName(e.name)).join(' e ') };
  }
function identityNoteHTML(deck: DeckData, s: BuilderState) {
  const id = searchIdentity(deck, s); if (!id) return '';
    return `<p class="dw-identity">Identidade de cor: ${id.colors.map(pip).join('') || 'incolor'} <span>· de ${esc(id.names)}</span></p>`;
  }
  /** Busca vazia no Commander: lembra que as cartas fora da identidade do comandante não aparecem. */
function identityEmptyHTML(deck: DeckData, s: BuilderState) {
  const id = searchIdentity(deck, s); if (!id) return '';
    const colors = id.colors.map(c => COLOR_NAME[c].toLowerCase());
    const within = colors.length ? `fora de ${colors.length > 1 ? `${colors.slice(0, -1).join(', ')} e ${colors[colors.length - 1]}` : colors[0]}` : 'colorida';
    return `<p class="dw-note">Nenhuma carta ${within} aparece: a identidade de ${esc(id.names)} limita a busca.</p>`;
  }
/** O deck aberto: nome, formato, ações, zona de comando, a lista da seção e o painel de busca. */
export function editHTML(deck: DeckData, s: BuilderState) {
  const { deckActionsOpen, searchOpen, section, commanderSlot, searchQuery, searchFunc, searchColors, searchType } = s;
    const art = deckArt(deck);
  return `<section class="dw-editor"><div class="dw-edit-breadcrumb"><button type="button" class="dw-button subtle" data-b="library"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>Meus decks</button></div><div class="dw-edit-head">${art ? `<img class="dw-edit-cover" src="${esc(art)}" alt="">` : ''}<div class="dw-edit-name">${deck.builtin ? `<h1 class="dw-deck-title">${esc(deck.name)}</h1>` : `<h1 class="dw-deck-title" id="dwDeckTitle" aria-label="${esc(deck.name || 'Deck sem nome')}"><input id="dwName" data-focus="deck-name" aria-label="Nome do deck" maxlength="80" value="${esc(deck.name)}"><svg class="dw-name-edit-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15z"/></svg></h1>`}</div><div class="dw-edit-controls"><label class="dw-field">Formato<select id="dwDeckFormat" data-focus="deck-format" ${deck.builtin ? 'disabled' : ''}>${formatOptions(deck.format ?? 'free')}</select></label><div class="dw-deck-actions"><button type="button" class="dw-button dw-actions-trigger" data-b="deck-actions" data-focus="deck-actions" aria-expanded="${deckActionsOpen}" aria-controls="dwDeckActions">Ações do deck<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><div class="dw-action-menu" id="dwDeckActions" ${deckActionsOpen ? '' : 'hidden'}>${!deck.builtin ? '<button type="button" class="dw-button" data-b="import-current" data-focus="action-import">Importar lista</button><button type="button" class="dw-button" data-b="list-edit" data-focus="action-list-edit">Editar como lista</button>' : ''}<button type="button" class="dw-button" data-b="export" data-focus="action-export">Exportar lista</button>${deck.importSource ? '<button type="button" class="dw-button" data-b="source" data-focus="action-source">Lista original</button>' : ''}<button type="button" class="dw-button" data-b="dup" data-focus="action-duplicate">${deck.builtin ? 'Criar uma cópia' : 'Duplicar'}</button>${!deck.builtin ? '<button type="button" class="dw-button danger" data-b="del" data-focus="action-delete">Excluir</button>' : ''}</div></div></div></div>${commanderHTML(deck)}${deck.builtin ? '<p class="dw-template-note">Este deck pronto pode ser usado como está. Crie uma cópia para editar suas cartas.</p>' : ''}<div class="dw-edit-layout ${searchOpen && !deck.builtin ? 'search-open' : ''}"><section class="dw-deck-panel">${totalDeckSize(deck) + countEntries(deck.sideboard ?? []) ? statsHTML(deck) + validationHTML(deck, s) : ''}<div class="dw-section-tabs" role="group" aria-label="Seção do deck"><button type="button" class="dw-button" data-section="main" data-focus="section-main" aria-pressed="${section === 'main'}">${hasCommandZone(deck.format) ? 'Deck' : 'Principal'} <b>${deckSize(deck)}${hasCommandZone(deck.format) ? `/${COMMAND_DECK_SIZE[deck.format] - countEntries(deck.commanders ?? [])}` : ''}</b></button><button type="button" class="dw-button" ${deck.format === 'commander' && !deck.sideboard?.length ? 'hidden' : ''} data-section="sideboard" data-focus="section-sideboard" aria-pressed="${section === 'sideboard'}">Sideboard <b>${countEntries(deck.sideboard ?? [])}</b></button><button type="button" class="dw-button" data-section="tokens" data-focus="section-tokens" aria-pressed="${section === 'tokens'}">Fichas${s.tokenKinds ? ` <b>${s.tokenKinds.length}</b>` : ''}</button>${!deck.builtin && section !== 'tokens' ? `<button type="button" class="dw-button ${searchOpen ? '' : 'primary'}" data-b="search" data-focus="toggle-search" aria-expanded="${searchOpen}">${searchOpen ? 'Fechar busca' : 'Adicionar cartas'}</button>` : ''}</div><div class="dw-card-list">${section === 'tokens' ? tokensTabHTML(deck, s.tokenKinds, s.tokensError, s.ptName) : entriesHTML(deck, s)}</div></section>${searchOpen && !deck.builtin ? `<aside class="dw-search-panel" aria-label="Buscar cartas"><h2>${commanderSlot !== null ? 'Escolher comandante' : `Adicionar ao ${section === 'main' ? 'deck principal' : 'sideboard'}`}</h2><form id="dwSearchForm"><label class="dw-field">Nome ou texto da carta<input id="dwCardQuery" data-focus="card-search" type="search" value="${esc(searchQuery)}" placeholder="Busque em português ou inglês" autocomplete="off"></label><button class="dw-button primary" type="submit">Buscar</button></form>${identityNoteHTML(deck, s)}<label class="dw-field dw-func-field">Função<select id="dwSearchFunc" data-focus="card-func"><option value="">Qualquer função</option>${FUNCTION_TAGS.map(tag => `<option value="${tag}" ${tag === searchFunc ? 'selected' : ''}>${tag}</option>`).join('')}</select></label><p class="dw-tagger">Função e <strong>Parecidas</strong> usam as tags do <a href="https://tagger.scryfall.com/" target="_blank" rel="noopener">Tagger</a>, o projeto de etiquetas da comunidade do Scryfall.</p><details class="dw-filters"><summary>Filtros e busca avançada</summary><div class="dw-colors">${COLORS.map(c => `<button type="button" data-color="${c}" aria-label="Filtrar por ${COLOR_NAME[c].toLowerCase()}" aria-pressed="${searchColors.has(c)}">${pip(c)}</button>`).join('')}</div><label class="dw-field">Tipo<select id="dwSearchType">${TYPE_FILTERS.map(([label, value]) => `<option value="${value}" ${value === searchType ? 'selected' : ''}>${label}</option>`).join('')}</select></label><p>Busca avançada: <code>mv&lt;=2</code> para custo, <code>o:"draw a card"</code> para texto. As cores incluem cartas incolores.</p></details>${isConstructed(deck.format) ? `<p class="dw-note">Cartas legais no ${deck.format === 'sacola50' ? 'Legacy' : FORMAT_LABEL[deck.format]}.</p>` : ''}<div id="dwResults"></div></aside>` : ''}</div></section>`;
}
/** Os resultados da busca de cartas (ou das "Parecidas"), com os botões de somar e tirar do deck. */
export function resultsHTML(deck: DeckData, s: BuilderState) {
  const { similarTo, searchError, searching, results, searchQuery, searchType, searchColors, searchFunc, commanderSlot, total, similarTags, section, hasMore } = s;
    const back = '<button type="button" class="dw-button" data-b="back-to-text" data-focus="back-to-text">Voltar à busca por texto</button>';
    const similarHead = similarTo ? `<div class="dw-similar-head"><p>Parecidas com <strong>${esc(cardInfo(similarTo).label)}</strong></p><button type="button" class="dw-button subtle" data-b="back-to-text" data-focus="back-to-text-head">Voltar à busca</button></div>` : '';
    if (searchError) { return `${similarHead}<p class="dw-error" role="alert">${esc(searchError)}</p><div class="dw-actions"><button type="button" class="dw-button" data-b="retry-search">Tentar novamente</button>${similarTo ? back : ''}</div>`; }
    if (searching && !results.length) { return `${similarHead}<p role="status">${similarTo ? 'Procurando cartas parecidas… Na primeira vez do dia pode levar alguns segundos.' : 'Buscando cartas…'}</p>`; }
    if (!results.length) {
      const filters = searchQuery.trim() || searchType || searchColors.size;
      return similarTo
        ? `${similarHead}<div class="dw-empty compact"><h3>Nenhuma carta parecida encontrada.</h3><p>Comparamos ${esc(cardInfo(similarTo).label)} com as cartas das mesmas cores, do mesmo tipo e de custo próximo${isConstructed(deck.format) ? `, legais no ${deck.format === 'sacola50' ? 'Legacy' : FORMAT_LABEL[deck.format]}` : ''}, e nenhuma tem função em comum no Tagger.</p><div class="dw-actions">${back}</div></div>`
        : searchFunc
          ? `<div class="dw-empty compact"><h3>Nenhuma carta com a função <code>${esc(searchFunc)}</code>${filters ? ' e esses filtros' : ''}.</h3><p>Tente outra função${filters ? ', limpe os filtros' : ''} ou procure pelo nome e pelo texto da carta.</p>${identityEmptyHTML(deck, s)}<div class="dw-actions">${back}</div></div>`
          : filters ? `<p class="dw-note">Nenhuma carta encontrada. Tente outros termos.</p>${identityEmptyHTML(deck, s)}` : '';
    }
    const canSimilar = commanderSlot === null && s.canSimilar;
    return `${similarHead}<p class="dw-note" role="status">${total} ${similarTo ? (total === 1 ? 'carta parecida' : 'cartas parecidas') : total === 1 ? 'carta encontrada' : 'cartas encontradas'}</p><div class="dw-results">${results.map(sc => {
      const tags = similarTo ? similarTags.get(sc.name) : undefined;
      const info = cardInfo(sc), count = countEntries((section === 'main' ? deck.cards : deck.sideboard ?? []).filter(e => e.name === sc.name));
      const full = deck.format !== 'free' && copiesInDeck(deck, sc.name) >= cardCopyLimit(sc.name, sc, deck.format);
      return `<article><button type="button" class="dw-result-art" data-inspect="${esc(sc.name)}" aria-label="Ler ${esc(info.label)}">${info.imageSmall ? `<img src="${esc(info.imageSmall)}" alt="" loading="lazy">` : esc(info.label)}</button><p title="${esc(info.label)}">${esc(info.label)}</p>${tags?.length ? `<p class="dw-result-tags" title="Tags em comum no Tagger">${tags.map(esc).join(' · ')}</p>` : ''}${canSimilar && sc.oracle_id ? `<button type="button" class="dw-similar" data-similar="${esc(sc.name)}" data-focus="similar:${esc(sc.name)}" aria-label="Cartas parecidas com ${esc(info.label)}">Parecidas</button>` : ''}${commanderSlot !== null ? `<button type="button" class="dw-button primary" data-set-commander="${esc(sc.name)}" data-focus="set-commander:${esc(sc.name)}">Escolher</button>` : `<div class="dw-stepper"><button type="button" data-dec="${esc(sc.name)}" data-focus="result-dec:${esc(sc.name)}" ${!count ? 'disabled' : ''} aria-label="Remover uma cópia de ${esc(info.label)}">−</button><span>${count}</span><button type="button" data-add="${esc(sc.name)}" data-focus="result-add:${esc(sc.name)}" ${full ? 'disabled' : ''} aria-label="Adicionar uma cópia de ${esc(info.label)}">+</button></div>`}</article>`;
    }).join('')}</div>${hasMore ? `<button type="button" class="dw-button dw-more" data-b="more" ${searching ? 'disabled' : ''}>${searching ? 'Carregando…' : 'Mais resultados'}</button>` : ''}`;
}
/** A importação: a lista colada (ou o link) e, depois de conferida, a revisão com o que entra e o que sai. */
export function importHTML(s: BuilderState) {
  const { importReview, importTarget, listEdit, importMode, importCommanderOffer, importAcknowledged, importError, importDraft, importBusy, format, ptName } = s;
    const review = importReview, target = importTarget;
    const needsChoice = !!target && !listEdit && !!deckEntries(target).length;
    const changes = review && target && listEdit ? deckListChanges(target, review.deck) : null;
    const sectionName = { commanders: 'Zona de comando', cards: hasCommandZone(target?.format) ? 'Deck' : 'Principal', sideboard: 'Sideboard' };
    const changeLine = (e: DeckEntry, sign: string) => `<li class="${sign === '+' ? 'add' : 'remove'}"><b>${sign}${e.count}</b> ${esc(ptName(e.name))}${e.set ? ` <small>${esc(printLabel(e))}</small>` : ''}</li>`;
    const changesHTML = !changes ? '' : changes.length
      ? `<div class="dw-list-changes"><h3>Mudanças</h3>${changes.map(c => `<section><h4>${sectionName[c.section]}</h4><ul>${c.added.map(e => changeLine(e, '+')).join('')}${c.removed.map(e => changeLine(e, '−')).join('')}</ul></section>`).join('')}</div>`
      : '<p class="dw-note">A lista está igual ao deck atual. Nada para salvar.</p>';
    const countLabel = (deck: DeckData) => `${deckSize(deck)} no principal · ${countEntries(deck.sideboard ?? [])} no sideboard${deck.commanders?.length ? ` · ${countEntries(deck.commanders)} na zona de comando` : ''}`;
  return `<section class="dw-import"><button type="button" class="dw-button subtle" data-b="import-cancel">← ${target ? 'Voltar ao deck' : 'Voltar aos meus decks'}</button><p class="dw-eyebrow">${listEdit ? (review ? '2. Revise as mudanças' : '1. Edite a lista') : review ? '2. Revise sua lista' : '1. Cole sua lista'}</p><h1 tabindex="-1" id="dwImportHeading">${listEdit ? 'Editar como lista' : target ? 'Importar lista neste deck' : 'Importar deck'}</h1><p>${target ? `<strong>${esc(target.name)}</strong> · ${formatLabel(target.format ?? 'free')}. O nome e o formato serão mantidos.` : 'Deck principal e sideboard serão preservados.'}</p>${review ? `<div class="dw-import-review"><h2>${esc(review.deck.name)}</h2>${importCommanderOffer && !(importMode === 'merge' && target?.commanders?.length) ? `<div class="dw-import-commander" role="group" aria-label="Sugestão de comandante"><p><strong>${esc(ptName(importCommanderOffer))}</strong> é uma criatura lendária e abre a lista de 100 cartas. Quer usá-la como comandante?</p><div class="dw-actions"><button type="button" class="dw-button primary" data-b="import-commander-yes" data-focus="import-commander-yes">Usar como comandante</button><button type="button" class="dw-button" data-b="import-commander-no" data-focus="import-commander-no">Deixar no deck</button></div></div>` : ''}${needsChoice ? `<fieldset class="dw-import-mode"><legend>Como aplicar a lista?</legend><label><input type="radio" name="importMode" value="merge" data-focus="import-merge" ${importMode === 'merge' ? 'checked' : ''}><span><strong>Adicionar às cartas atuais</strong><small>Soma as cópias da lista em cada seção. Um comandante que já está no deck não é repetido.</small></span></label><label><input type="radio" name="importMode" value="replace" data-focus="import-replace" ${importMode === 'replace' ? 'checked' : ''}><span><strong>Substituir todas as cartas</strong><small>Troca todas as seções, incluindo os comandantes, pela lista importada.</small></span></label></fieldset>` : ''}<div class="dw-import-counts" aria-live="polite">${target ? `<p><span>Deck atual</span><strong>${countLabel(target)}</strong></p>` : ''}<p><span>${target && !importMode ? 'Lista importada' : target ? 'Após salvar' : 'Lista reconhecida'}</span><strong>${countLabel(review.deck)}</strong></p></div>${changesHTML}${review.missing.length ? `<div class="dw-error"><strong>Cartas não reconhecidas</strong><p>Estas cartas serão preservadas no rascunho, sem permitir iniciar uma partida até serem corrigidas:</p><ul>${review.missing.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}${review.ambiguous.length ? `<div class="dw-error"><strong>Nomes de mais de uma carta</strong><p>Estes nomes servem para cartas diferentes. Volte à lista e troque pelo nome em inglês da carta certa; até lá elas ficam no rascunho, sem permitir iniciar uma partida:</p><ul>${review.ambiguous.map(a => `<li>${esc(a.name)}: ${a.options.map(esc).join(' ou ')}</li>`).join('')}</ul></div>` : ''}${review.parsed.skipped.length || review.parsed.ignored.length ? `<div class="dw-error"><p>${listEdit ? 'Estas linhas não foram entendidas e vão ficar fora do deck:' : 'Algumas linhas não serão adicionadas às cartas. A lista original ficará salva no rascunho.'}</p><ul>${[...review.parsed.skipped, ...review.parsed.ignored].map(line => `<li>${esc(line)}</li>`).join('')}</ul><label><input type="checkbox" id="dwImportAck" data-focus="import-ack" ${importAcknowledged ? 'checked' : ''}> ${listEdit ? 'Revisei as linhas acima e quero salvar sem elas.' : 'Revisei as linhas acima e quero guardar o rascunho.'}</label></div>` : ''}${!target || importMode ? validationHTML(review.deck, s) : '<p class="dw-note">Escolha uma opção para conferir o resultado antes de salvar.</p>'}<details><summary>${target && importMode ? 'Lista após salvar' : 'Lista reconhecida'}</summary><pre>${esc(exportDeckList(review.deck))}</pre></details>${importError ? `<p class="dw-error" role="alert">${esc(importError)}</p>` : ''}<div class="dw-actions"><button type="button" class="dw-button" data-b="import-edit">Voltar à lista</button><button type="button" class="dw-button primary" data-b="import-save" ${s.importCanSave ? '' : 'disabled'}>${listEdit ? 'Salvar mudanças' : target ? 'Salvar neste deck' : `Salvar ${review.missing.length || review.ambiguous.length ? 'rascunho' : 'deck'}`}</button></div></div>` : `<form id="dwImportForm">${!target ? `<div class="dw-import-fields"><label class="dw-field">Nome do deck<input id="dwImportName" data-focus="import-name" ${importBusy ? 'disabled' : ''} maxlength="80" value="${esc(importDraft.name)}" placeholder="Meu novo deck (ou o nome do link)"></label><label class="dw-field">Formato<select id="dwImportFormat" data-focus="import-format" ${importBusy ? 'disabled' : ''}>${formatOptions(format)}</select></label></div>` : ''}<label class="dw-field">${listEdit ? 'Lista do deck' : 'Lista de cartas ou link do deck'}<textarea id="dwImportText" data-focus="import-text" ${importBusy ? 'disabled' : ''} rows="13" spellcheck="false" required placeholder="https://moxfield.com/decks/…&#10;&#10;ou&#10;&#10;Deck&#10;4 Lightning Bolt&#10;20 Mountain&#10;&#10;Sideboard&#10;2 Duress">${esc(importDraft.text)}</textarea></label><p class="dw-note">${listEdit ? 'Uma carta por linha, com a quantidade na frente; nomes em português ou inglês. Mude as quantidades, apague ou acrescente linhas, e passe uma carta para baixo de outro título (Commander, Deck ou Sideboard) para trocá-la de seção. Antes de salvar, você confere o que entra e o que sai.' : 'Cole o link público de um deck do Moxfield, ou do Archidekt, ou a lista exportada do Arena, MTGO, Moxfield ou Archidekt. Uma carta por linha; nomes em português ou inglês. A seção Commander preserva seus comandantes. Maybeboard e fichas aparecem na revisão, sem entrar no deck.'}</p>${importError ? `<p class="dw-error" role="alert">${esc(importError)}</p>` : ''}<div class="dw-actions"><button class="dw-button primary" ${importBusy ? 'disabled' : ''}>${importBusy ? (parseDeckLink(importDraft.text) ? 'Buscando o deck…' : 'Conferindo cartas…') : listEdit ? 'Revisar mudanças' : 'Revisar importação'}</button>${listEdit ? '' : '<button type="button" class="dw-button" data-b="export-import">Baixar lista original</button>'}</div></form>`}</section>`;
}
