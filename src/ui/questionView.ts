// A janela de pergunta no centro da mesa: o HTML de cada tipo de escolha (cartas, ordem, sim ou não, quantidades, texto,
// e os tipos com tela própria em outros módulos), e a barra que fica no lugar dela com "Ver a mesa" (arrastável pelo texto).
import type { FCard, FOption, FPlayer, FQuestion } from '../forge/client';
import { esc, optionHTML } from './cardtext';
import { ptTitle } from './forgeRequest';
import { DRAG_PILL, DRAG_RESET } from './icons';
import { choiceOrder, isPlayMode, isTriggerOrder, playModeHTML, triggerOrderHTML, type TriggerOrder } from './choiceScreens';
import { choiceGroupHTML, choiceLayout, choiceToolsHTML, isFilterableChoice, type ChoiceSort, type ChoiceView } from './choiceFilters';
import { isLibraryChoice, libraryChoiceHTML, libraryHeading, libraryStart } from './libraryChoice';
import { isPilesChoice, isPilesSplit, pilesChoiceHTML, pilesHeading, pilesSplitHTML, pilesStart } from './piles';
import { combatDamageHTML, isCombatDamage } from './combatDamage';
import { isVote, voteHTML } from './cardVote';
import { isNameChoice, nameChoiceHTML } from './nameChoice';
import { dungeonRoomHTML, isDungeonRoom } from './dungeon';
import { isReplacementOrder, replacementOrderHTML } from './replacementOrder';
import { isNumberChoice, numberChoiceHTML, rulesOf } from './numberChoice';
import { isModeChoice, modeChoiceHTML, modesAsk } from './modeChoice';
import { colorChoiceHTML, isColorChoice } from './colorChoice';
import { isTypeChoice, typeChoiceHTML } from './typeChoice';
import { isOptionalCosts, optionalCostsHTML } from './optionalCosts';
import { isSplitDestinations, splitDestinationsHTML } from './splitDestinations';
import { amountChoiceHTML, amountsOf, evenAmounts, isAmountChoice } from './amountChoice';
import type { QuestionDraft } from './tableState';

/** O que as perguntas precisam da mesa. */
export interface QuestionView {
  /** A carta em tamanho normal. */
  face(c: FCard): string;
  label(c: FCard): string;
  ptName(name: string): string | undefined;
  ptType(name: string | undefined): string | undefined;
  ptText(name: string | undefined): string | undefined;
  playerName(id: number): string;
  players: FPlayer[];
  piles: { face(c: FCard): string; label(c: FCard): string; playerName(id: number): string; you: number | undefined };
  choiceSort: ChoiceSort;
  choiceView(q: FQuestion): ChoiceView;
  /** Divisão do dano de combate em andamento e ordem dos gatilhos sendo montada (guardadas pela mesa). */
  damageSplit(q: FQuestion): number[];
  triggerOrder(q: FQuestion): TriggerOrder;
}

/** A seleção começa vazia (na escolha do grimório e na divisão em montes, já arrumada), com o texto e os valores iniciais. */
export function newQuestionDraft(q: FQuestion): QuestionDraft {
  return { id: q.id, picked: isLibraryChoice(q) ? libraryStart(q) : isPilesSplit(q) ? pilesStart(q) : [], text: q.initial ?? '', amounts: isAmountChoice(q) ? evenAmounts(q).map(String) : (q.options ?? []).map(o => String(typeof o === 'string' ? 0 : o.min ?? 0)) };
}

export const optLabel = (o: FOption | string) => (typeof o === 'string' ? o : o.label);
export function amountStatus(q: FQuestion, draft: QuestionDraft | null) {
  const options = q.options ?? [];
  const amounts = options.map((_, i) => Number(draft?.amounts[i]));
  const validValues = options.every((option, i) => {
    const n = Number(draft?.amounts[i]);
    const min = typeof option === 'string' ? 0 : option.min ?? 0;
    const max = typeof option === 'string' ? q.total ?? 0 : option.max ?? q.total ?? 0;
    return /^\d+$/.test(draft?.amounts[i] ?? '') && Number.isSafeInteger(n) && n >= min && n <= max;
  });
  const remaining = (q.total ?? 0) - amounts.reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);
  return { amounts, valid: validValues && remaining === 0, text: !validValues ? 'Respeite os limites indicados para cada alvo.' : remaining < 0 ? `Excesso: ${-remaining}.` : `Restante: ${remaining}.` };
}
/** Nome de cada zona para os botões do comandante, e com artigo para a frase ("para a mão"). */
export const ZONES: Record<string, [string, string]> = { Hand: ['Mão', 'a mão'], Library: ['Grimório', 'o grimório'], Graveyard: ['Cemitério', 'o cemitério'], Exile: ['Exílio', 'o exílio'] };
export const zoneName = (z: string) => ZONES[z]?.[0] ?? z;
export const zoneWithArticle = (z: string) => ZONES[z]?.[1] ?? z;
/** Comandante no cemitério ou no exílio (regra 903.9a): os botões dizem para onde ele vai. "Zona de comando" responde sim. */
export function commanderZoneHTML(v: QuestionView, q: FQuestion) {
  const place = q.zone === 'Exile' ? 'exílio' : 'cemitério';
  const name = q.card ? v.label(q.card) : 'Seu comandante';
  return `<div class="q-head"><h2>${esc(name)} está no ${place}</h2><button class="icon-btn q-minimize" data-ui="question-minimize" aria-label="Ver a mesa sem perder esta escolha">Ver a mesa</button></div>${q.card ? `<div class="q-card">${v.face(q.card)}</div>` : ''}
    <p class="q-hint">Seu comandante pode ir para a zona de comando ou ficar no ${place}.</p>
    <div class="q-actions"><button class="arena-btn primary" data-q-confirm="true">Zona de comando</button><button class="arena-btn secondary" data-q-confirm="false">${q.zone === 'Exile' ? 'Exílio' : 'Cemitério'}</button></div>`;
}
/** A linha de tipo do Forge (em inglês) decide os filtros; a do Scryfall em português só quando a do Forge não veio. */
export const choiceTypeLine = (v: Pick<QuestionView, 'ptType'>, c: FCard) => c.typeLine || v.ptType(c.name) || '';
export function questionHTML(v: QuestionView, q: FQuestion, draft: QuestionDraft) {
  if (isCombatDamage(q)) return combatDamageHTML(q, v.damageSplit(q), v.face, v.label, v.players);
  if (isTriggerOrder(q)) return triggerOrderHTML(q, v.triggerOrder(q), v.face, v.label);
  if (isPlayMode(q)) return playModeHTML(q, v.face, v.label);
  if (isLibraryChoice(q)) return libraryChoiceHTML(q, draft.picked, v.face, v.label, c => v.ptType(c.name) || c.typeLine || '');
  if (isVote(q)) return voteHTML(q, { face: v.face, label: v.label, rulesText: c => v.ptText(c.name) || c.text || '', playerName: v.playerName });
  if (isPilesSplit(q)) return pilesSplitHTML(q, draft.picked, v.piles);
  if (isPilesChoice(q)) return pilesChoiceHTML(q, v.piles);
  if (isReplacementOrder(q)) return replacementOrderHTML(q, draft.all !== false, v.face, v.label);
  if (isOptionalCosts(q)) return optionalCostsHTML(q, draft.picked, rulesOf(q.card, v.ptText), q.card ? v.label(q.card) : undefined);
  if (isTypeChoice(q)) return typeChoiceHTML(q, draft.text, q.card ? v.label(q.card) : undefined);
  if (isColorChoice(q)) return colorChoiceHTML(q, q.card ? v.label(q.card) : undefined);
  if (isModeChoice(q)) return modeChoiceHTML(q, draft.picked, rulesOf(q.card, v.ptText), q.card ? v.label(q.card) : undefined, q.card?.manaCost);
  if (isNumberChoice(q)) return numberChoiceHTML(q, draft.text, q.card ? v.face(q.card) : '', rulesOf(q.card, v.ptText), q.card?.name ? [q.card.name, v.label(q.card)] : undefined);
  const opts = q.options ?? [];
  const head = `<div class="q-head"><h2>${esc(ptTitle(q.title))}</h2><button class="icon-btn q-minimize" data-ui="question-minimize" aria-label="Ver a mesa sem perder esta escolha">Ver a mesa</button></div>${q.card ? `<div class="q-card">${v.face(q.card)}</div>` : ''}`;
  if (isDungeonRoom(q)) return dungeonRoomHTML(q, head, v.players.find(p => p.id === q.dungeonOwner));
  if (isNameChoice(q)) return nameChoiceHTML(q, head, draft.text, v.ptName);
  if (isSplitDestinations(q)) return splitDestinationsHTML({ face: v.face, label: v.label }, q, draft.picked);
  if (isAmountChoice(q)) return amountChoiceHTML({ face: v.face, label: v.label, players: v.players }, q, amountsOf(draft.amounts));
  if (q.kind === 'confirm' && q.purpose === 'commander-zone') return commanderZoneHTML(v, q);
  if (q.kind === 'confirm') {
    return `${head}<div class="q-actions">${opts.map((o, i) =>
      `<button class="arena-btn ${i === 0 ? 'primary' : 'secondary'}" data-q-confirm="${i === 0}">${optionHTML(optLabel(o))}</button>`).join('')}</div>`;
  }
  if (q.kind === 'reveal') {
    const anyCards = opts.some(o => typeof o !== 'string' && o.card);
    const revealHead = head.replace(`<h2>${esc(ptTitle(q.title))}</h2>`, `<h2>${esc(revealTitle(q.title))}</h2>`);
    return `${revealHead}<div class="q-opts ${anyCards ? 'cards' : ''}">${opts.map(o => typeof o !== 'string' && o.card
      ? `<div class="q-face" data-peek="${o.card.id}" role="button" tabindex="0" aria-label="Inspecionar ${esc(v.label(o.card))}">${v.face(o.card)}</div>`
      : `<div class="q-opt"><span>${esc(optLabel(o))}</span></div>`).join('')}</div>
      <div class="q-actions"><button class="arena-btn primary" data-q-none>Continuar</button></div>`;
  }
  if (q.kind === 'text') {
    return `${head}<form class="q-text" data-q-text><input id="fQInput" ${q.numeric ? 'type="number"' : ''} value="${esc(draft.text)}" aria-label="Resposta">
      <button class="arena-btn primary">Confirmar</button></form>`;
  }
  const isOrder = q.kind === 'order';
  const min = isOrder ? opts.length : q.min ?? 1;
  const max = isOrder ? opts.length : q.max ?? 1;
  const single = !isOrder && max === 1;
  const anyCards = opts.some(o => typeof o !== 'string' && o.card);
  const item = (i: number, hidden = false) => {
    const o = opts[i], pos = draft.picked.indexOf(i);
    if (o === undefined) return '';
    const on = pos >= 0 ? 'on' : '';
    const badge = isOrder && pos >= 0 ? `<span class="q-badge">${pos + 1}</span>` : on && !single ? '<span class="q-badge">✓</span>' : '';
    const card = typeof o !== 'string' && o.card ? `<div class="q-face">${v.face(o.card)}</div>` : '';
    const peek = typeof o !== 'string' && o.card && !o.card.faceDown && o.card.name ? ` data-q-card="${o.card.id}"` : '';
    return `<button class="q-opt ${on} ${card ? 'has-card' : ''}" data-q-opt="${i}"${peek}${hidden ? ' hidden' : ''}>${card}<span>${optionHTML(optLabel(o))}</span>${badge}</button>`;
  };
  // Escolha grande de cartas (tutor, cemitério, exílio): filtros por tipo, ordem e busca, sem mudar os índices da resposta.
  const layout = isFilterableChoice(q) ? choiceLayout(q, { sort: v.choiceSort, view: v.choiceView(q), name: v.label, typeLine: c => choiceTypeLine(v, c) }) : null;
  const tools = layout ? choiceToolsHTML(layout, v.choiceSort, v.choiceView(q), draft.picked) : '';
  const items = layout ? layout.groups.map(g => choiceGroupHTML(g, layout) + g.indices.map(i => item(i, !layout.visible.has(i))).join('')).join('')
    : choiceOrder(q, v.label).map(i => item(i)).join('');
  const n = draft.picked.length;
  // Mão revelada (Thoughtseize): as cartas que não podem ser escolhidas aparecem apagadas, para ver a mão inteira numa janela só.
  const revealed = q.revealed ?? [];
  const unavailable = revealed.map(c => `<div class="q-opt has-card unavailable" data-q-card="${c.id}" aria-disabled="true"><div class="q-face">${v.face(c)}</div><span>${esc(v.label(c))}</span></div>`).join('');
  const revealedHint = revealed.length ? `${q.revealedNote ? `${esc(q.revealedNote)} ` : ''}As cartas apagadas não podem ser escolhidas.` : '';
  const hint = isOrder ? `Toque na ordem desejada (a primeira fica ${q.firstAt === 'bottom' ? 'embaixo' : 'em cima'}).`
    : [single ? '' : `Escolha ${min === max ? min : `de ${min} a ${max}`}.`, revealedHint].filter(Boolean).join(' ');
  return `${head}${hint ? `<p class="q-hint">${hint}</p>` : ''}${tools}
    <div class="q-opts ${anyCards || revealed.length ? 'cards' : ''}${layout ? ' filtered' : ''}">${items}${unavailable}</div>
    <div class="q-actions">
      ${(q.min ?? 1) === 0 && !isOrder ? `<button class="arena-btn secondary" data-q-none>${noneLabel(q)}</button>` : ''}
      ${isOrder ? '<button class="arena-btn secondary" data-q-keep>Manter ordem</button>' : ''}
      ${!single && !isOrder && opts.length > 1 ? `<button class="arena-btn secondary" data-q-all>${n >= Math.min(max, opts.length) ? 'Desmarcar todas' : 'Selecionar todas'}</button>` : ''}
      ${!single ? pickCountHTML(n, min, max, opts.length) : ''}
      ${!single ? '<button class="arena-btn primary" data-q-submit>Confirmar</button>' : ''}
    </div>`;
}
/** "Fato ou Ficção - Revelando cartas de seu grimório" → "Fato ou Ficção: cartas reveladas do seu grimório". */
export function revealTitle(title: string) {
  const m = title.match(/^(.+?) - Revelando cartas (de|do|da) (.+)$/);
  if (!m) return ptTitle(title);
  const prep = m[2] === 'de' && /^seu\b/.test(m[3]!) ? 'do' : m[2] === 'de' && /^sua\b/.test(m[3]!) ? 'da' : m[2];
  return `${m[1]}: cartas reveladas ${prep} ${m[3]}`;
}
/** O botão de não escolher nada diz o que acontece: na busca no grimório, "Não procurar". */
export function noneLabel(q: FQuestion) {
  return /grimório|library/i.test(q.title) ? 'Não procurar' : (q.max ?? 1) === 1 ? 'Não escolher' : 'Nenhuma';
}
/** Selo "x / y" ao lado do Confirmar: verde quando a quantidade já vale; o aviso de faltar escolha aparece acima dele. */
function pickCountHTML(n: number, min: number, max: number, total: number) {
  const top = Math.min(max, total);
  const ready = n >= min && n <= max;
  const range = min === top ? `${top}` : `de ${min} a ${top}`;
  return `<p class="q-pick-warn" id="fQPickWarn" role="alert" hidden></p><span class="q-pick-count${ready ? ' ok' : ''}" id="fQPickCount" aria-label="${n} de ${top} escolhidas; escolha ${range}">${n}<small>/ ${top}</small></span>`;
}

/** Quantas faltam escolher na escolha comum de várias ou na ordem (que pede todas), ou nada se já dá para confirmar (as telas próprias têm a sua regra). */
export function missingPicks(q: FQuestion, picked: number) {
  if (isLibraryChoice(q) || isPilesSplit(q) || isTriggerOrder(q) || isReplacementOrder(q)) return 0;
  if (q.kind === 'order') return Math.max(0, (q.options?.length ?? 0) - picked);
  if (q.kind !== 'choose') return 0;
  return Math.max(0, (q.min ?? 1) - picked);
}

export function questionBar(v: QuestionView, q: FQuestion, picked: number) {
  const max = q.kind === 'order' ? q.options?.length ?? 0 : q.max ?? 1;
  const progress = (q.kind === 'choose' || q.kind === 'order') && max > 1 ? `<span>${picked} de ${max} ${max === 1 ? 'escolhida' : 'escolhidas'}</span>` : '';
  const title = isTriggerOrder(q) ? 'Ordene seus gatilhos' : isLibraryChoice(q) ? libraryHeading(q) : isPilesSplit(q) || isPilesChoice(q) ? pilesHeading(q, v.piles) : isVote(q) && q.card ? `Votação: ${v.label(q.card)}` : isReplacementOrder(q) ? 'Qual efeito aplicar primeiro?' : isPlayMode(q) ? 'Como jogar a carta' : isCombatDamage(q) ? 'Distribua o dano de combate' : isModeChoice(q) ? `${q.card ? `${v.label(q.card)}: ` : ''}${modesAsk(q.min ?? 1, q.max ?? 1)}` : isTypeChoice(q) ? 'Escolha um tipo de criatura' : isOptionalCosts(q) ? 'Custos opcionais' : ptTitle(q.title);
  return `<div class="question-bar" role="region" aria-label="Escolha pendente: ${esc(title)}">${DRAG_PILL}<div class="question-bar-text" title="Arraste para mover este aviso. Dois cliques o devolvem ao lugar."><strong>${esc(title)}</strong>${progress}<small>Olhando a mesa. A escolha continua esperando.</small></div>${DRAG_RESET}<button class="arena-btn primary" data-ui="question-restore">Voltar à escolha</button></div>`;
}
