// A janela de pergunta no centro da mesa: o HTML de cada tipo de escolha (cartas, ordem, sim ou não, quantidades, texto,
// e os tipos com tela própria em outros módulos), e a barra que fica no lugar dela com "Ver a mesa".
import type { FCard, FOption, FPlayer, FQuestion } from '../forge/client';
import { esc, optionHTML } from './cardtext';
import { choiceOrder, isPlayMode, isTriggerOrder, playModeHTML, triggerOrderHTML, type TriggerOrder } from './choiceScreens';
import { choiceGroupHTML, choiceLayout, choiceToolsHTML, isFilterableChoice, type ChoiceSort, type ChoiceView } from './choiceFilters';
import { isLibraryChoice, libraryChoiceHTML, libraryHeading, libraryStart } from './libraryChoice';
import { isPilesChoice, isPilesSplit, pilesChoiceHTML, pilesHeading, pilesSplitHTML, pilesStart } from './piles';
import { combatDamageHTML, isCombatDamage } from './combatDamage';
import { isVote, voteHTML } from './cardVote';
import { isNameChoice, nameChoiceHTML } from './nameChoice';
import { dungeonRoomHTML, isDungeonRoom } from './dungeon';
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
  return { id: q.id, picked: isLibraryChoice(q) ? libraryStart(q) : isPilesSplit(q) ? pilesStart(q) : [], text: q.initial ?? '', amounts: (q.options ?? []).map(o => String(typeof o === 'string' ? 0 : o.min ?? 0)) };
}

export const optLabel = (o: FOption | string) => (typeof o === 'string' ? o : o.label);
export function amountStatus(q: FQuestion, draft: QuestionDraft | null) {
  const amounts = (q.options ?? []).map((_, i) => Number(draft?.amounts[i]));
  const validValues = amounts.every((n, i) => {
    const option = q.options![i];
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
  const opts = q.options ?? [];
  const head = `<div class="q-head"><h2>${esc(q.title)}</h2><button class="icon-btn q-minimize" data-ui="question-minimize" aria-label="Ver a mesa sem perder esta escolha">Ver a mesa</button></div>${q.card ? `<div class="q-card">${v.face(q.card)}</div>` : ''}`;
  if (isDungeonRoom(q)) return dungeonRoomHTML(q, head, v.players.find(p => p.id === q.dungeonOwner));
  if (isNameChoice(q)) return nameChoiceHTML(q, head, draft.text, v.ptName);
  if (q.kind === 'amount') {
    const status = amountStatus(q, draft);
    return `${head}<form data-q-amount-form><div class="q-amounts">${opts.map((o, i) => {
      const min = typeof o === 'string' ? 0 : o.min ?? 0;
      const max = typeof o === 'string' ? q.total ?? 0 : o.max ?? q.total ?? 0;
      return `<label><span>${esc(optLabel(o))}<small>De ${min} a ${max}</small></span><input data-q-amount="${i}" type="number" inputmode="numeric" min="${min}" max="${max}" step="1" value="${esc(draft.amounts[i])}" aria-describedby="fAmountRemaining"></label>`;
    }).join('')}</div><p class="q-hint" id="fAmountRemaining" aria-live="polite">${status.text}</p><div class="q-actions"><button class="arena-btn primary" data-q-amount-submit ${status.valid ? '' : 'disabled'}>Confirmar distribuição</button></div></form>`;
  }
  if (q.kind === 'confirm' && q.purpose === 'commander-zone') return commanderZoneHTML(v, q);
  if (q.kind === 'confirm') {
    return `${head}<div class="q-actions">${opts.map((o, i) =>
      `<button class="arena-btn ${i === 0 ? 'primary' : 'secondary'}" data-q-confirm="${i === 0}">${optionHTML(optLabel(o))}</button>`).join('')}</div>`;
  }
  if (q.kind === 'reveal') {
    const anyCards = opts.some(o => typeof o !== 'string' && o.card);
    return `${head}<div class="q-opts ${anyCards ? 'cards' : ''}">${opts.map(o => typeof o !== 'string' && o.card
      ? `<div class="q-face" data-peek="${o.card.id}" role="button" tabindex="0" aria-label="Inspecionar ${esc(v.label(o.card))}">${v.face(o.card)}</div>`
      : `<div class="q-opt"><span>${esc(optLabel(o))}</span></div>`).join('')}</div>
      <div class="q-actions"><button class="arena-btn primary" data-q-none>OK</button></div>`;
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
  const ready = n >= min && n <= max;
  const hint = isOrder ? 'Toque na ordem desejada (a primeira fica em cima).'
    : single ? '' : `Escolha ${min === max ? min : `de ${min} a ${max}`}.`;
  return `${head}${hint ? `<p class="q-hint">${hint}</p>` : ''}${tools}
    <div class="q-opts ${anyCards ? 'cards' : ''}${layout ? ' filtered' : ''}">${items}</div>
    <div class="q-actions">
      ${(q.min ?? 1) === 0 && !isOrder ? '<button class="arena-btn secondary" data-q-none>Nenhum</button>' : ''}
      ${isOrder ? '<button class="arena-btn secondary" data-q-keep>Manter ordem</button>' : ''}
      ${!single ? `<button class="arena-btn primary" data-q-submit ${ready ? '' : 'disabled'}>Confirmar</button>` : ''}
    </div>`;
}
export function questionBar(v: QuestionView, q: FQuestion, picked: number) {
  const max = q.kind === 'order' ? q.options?.length ?? 0 : q.max ?? 1;
  const progress = (q.kind === 'choose' || q.kind === 'order') && max > 1 ? `<span>${picked} de ${max} ${max === 1 ? 'escolhida' : 'escolhidas'}</span>` : '';
  const title = isTriggerOrder(q) ? 'Ordene seus gatilhos' : isLibraryChoice(q) ? libraryHeading(q) : isPilesSplit(q) || isPilesChoice(q) ? pilesHeading(q, v.piles) : isVote(q) && q.card ? `Votação: ${v.label(q.card)}` : isPlayMode(q) ? 'Como jogar a carta' : isCombatDamage(q) ? 'Distribua o dano de combate' : q.title;
  return `<div class="question-bar" role="region" aria-label="Escolha pendente: ${esc(title)}"><div class="question-bar-text"><strong>${esc(title)}</strong>${progress}<small>Olhando a mesa. A escolha continua esperando.</small></div><button class="arena-btn primary" data-ui="question-restore">Voltar à escolha</button></div>`;
}
