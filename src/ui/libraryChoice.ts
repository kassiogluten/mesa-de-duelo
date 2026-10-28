import type { FCard, FQuestion } from '../forge/client';
import { esc } from './cardtext';

/*
 * Vidência e vigilância de várias cartas. A ponte marca as duas perguntas do Forge (purpose "library"):
 * primeiro o que sai do topo (para o fundo ou para o cemitério), depois a ordem das que ficam em cima.
 * As cartas aparecem inteiras, na ordem do grimório (a da esquerda é a do topo); tocar na carta abre o
 * inspetor, e a escolha fica nos botões embaixo de cada uma.
 */

type Face = (c: FCard) => string;
type Text = (c: FCard) => string;

export type LibraryStep = 'bottom' | 'graveyard' | 'top';

export const isLibraryChoice = (q: FQuestion) => q.purpose === 'library' && !!q.library && (q.options?.length ?? 0) > 0;

/** Estado inicial de cada passo: ninguém sai do topo, e a ordem do topo é a de agora. */
export const libraryStart = (q: FQuestion) => q.library === 'top' ? (q.options ?? []).map((_, i) => i) : [];

/** Para onde vão as cartas que saem do topo neste passo. */
const away = (step: LibraryStep | undefined) => step === 'graveyard' ? { button: 'Cemitério', phrase: 'vai para o cemitério', many: 'vão para o cemitério' }
  : { button: 'Fundo', phrase: 'vai para o fundo', many: 'vão para o fundo' };

/** Marca a carta (índice da opção) para sair do topo ou para ficar nele; devolve se mudou. */
export function placeLibraryCard(picked: number[], option: number, leaves: boolean) {
  const at = picked.indexOf(option);
  if (leaves === at >= 0) return false;
  if (leaves) { picked.push(option); picked.sort((a, b) => a - b); } else picked.splice(at, 1);
  return true;
}

/** Troca a carta da posição `pos` com a vizinha (dir -1 sobe para o topo, +1 desce); devolve se mudou. */
export function moveLibraryCard(order: number[], pos: number, dir: -1 | 1) {
  const to = pos + dir;
  if (pos < 0 || pos >= order.length || to < 0 || to >= order.length) return false;
  [order[pos], order[to]] = [order[to], order[pos]];
  return true;
}

/** Resumo do passo de escolha, também lido pelo leitor de tela: "2 ficam no topo, 1 vai para o fundo." */
export function librarySummary(q: FQuestion, picked: number[]) {
  const total = q.options?.length ?? 0, out = picked.length, stay = total - out;
  const where = away(q.library);
  if (!out) return `Todas ficam no topo.`;
  if (!stay) return `Todas ${where.many}.`;
  return `${stay} ${stay === 1 ? 'fica' : 'ficam'} no topo, ${out} ${out === 1 ? where.phrase : where.many}.`;
}

export const libraryHeading = (q: FQuestion) => q.library === 'top' ? 'Ordem no topo do grimório'
  : q.library === 'graveyard' ? 'Vigilância: topo ou cemitério' : 'Vidência: topo ou fundo';

const hint = (q: FQuestion) => q.library === 'top'
  ? 'A da esquerda fica no topo: é a próxima que você compra. Use as setas para trocar a ordem e toque numa carta para lê-la.'
  : `As cartas estão na ordem do grimório: a da esquerda é a do topo. Escolha Topo ou ${away(q.library).button} embaixo de cada uma e toque numa carta para lê-la.`;

const ARROW = (dir: -1 | 1) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${dir < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}"/></svg>`;

/**
 * `picked`: no passo de escolha, as opções que saem do topo; no passo "top", a ordem inteira (índices das opções).
 * `label` e `type` dão o nome e o tipo como a mesa mostra (em português, quando houver), para o leitor de tela.
 */
export function libraryChoiceHTML(q: FQuestion, picked: number[], face: Face, label: Text, type: Text) {
  const opts = q.options ?? [];
  const ordering = q.library === 'top';
  const total = opts.length;
  const order = ordering ? picked : opts.map((_, i) => i);
  const where = away(q.library);
  const slots = order.map((option, pos) => {
    const o = opts[option];
    const card = typeof o === 'string' ? undefined : o?.card;
    if (!card) return '';
    const name = label(card), kind = type(card);
    const leaves = !ordering && picked.includes(option);
    const place = ordering ? `${pos + 1}ª de ${total}${pos === 0 ? ', no topo' : ''}` : `${pos + 1}ª do topo`;
    const now = ordering ? '' : leaves ? ` Escolhida: ${where.phrase}.` : ' Escolhida: fica no topo.';
    const controls = ordering
      ? `<div class="library-controls" role="group" aria-label="Mover ${esc(name)}">
          <button type="button" class="library-move" data-lib-move="${pos}:-1" ${pos === 0 ? 'disabled' : ''} aria-label="Subir ${esc(name)} para a ${pos}ª posição">${ARROW(-1)}</button>
          <button type="button" class="library-move" data-lib-move="${pos}:1" ${pos === total - 1 ? 'disabled' : ''} aria-label="Descer ${esc(name)} para a ${pos + 2}ª posição">${ARROW(1)}</button>
        </div>`
      : `<div class="library-controls" role="group" aria-label="Para onde vai ${esc(name)}">
          <button type="button" class="library-place" data-lib-place="top:${option}" aria-pressed="${!leaves}">Topo</button>
          <button type="button" class="library-place away" data-lib-place="away:${option}" aria-pressed="${leaves}">${where.button}</button>
        </div>`;
    return `<li class="library-slot${leaves ? ' leaves' : ''}" data-lib-slot="${option}">
      <div class="library-position" aria-hidden="true"><b>${pos + 1}</b><span>${leaves ? where.button : pos === 0 ? 'Topo' : ''}</span></div>
      <button type="button" class="library-card" data-inspect="${card.id}" aria-label="${esc(`${name}, ${kind}. ${place}.${now} Toque para ler a carta.`)}">
        <div class="library-face">${face(card)}</div>
      </button>
      ${controls}
    </li>`;
  }).join('');
  const summary = ordering ? '' : `<p class="q-hint library-summary" aria-live="polite">${esc(librarySummary(q, picked))}</p>`;
  // A carta que mandou olhar o topo (a vidência de um feitiço, a vigilância de uma criatura), para ler o que ela faz.
  const source = q.card && !q.card.faceDown && q.card.name
    ? `<button type="button" class="library-source" data-inspect="${q.card.id}" aria-label="${esc(`Pedido por ${label(q.card)}. Toque para ler a carta.`)}"><div class="library-source-face">${face(q.card)}</div><span>Pedido por <b>${esc(label(q.card))}</b></span></button>` : '';
  return `<div class="q-head"><h2>${libraryHeading(q)}</h2><button class="icon-btn q-minimize" data-ui="question-minimize" aria-label="Ver a mesa sem perder esta escolha">Ver a mesa</button></div>
    ${source}<p class="q-hint" id="fLibraryHelp">${esc(hint(q))}</p>
    <div class="library-direction" aria-hidden="true"><span>Topo do grimório</span><i></i><span>Mais abaixo</span></div>
    <ol class="library-row" aria-label="Cartas do topo do grimório, da primeira para a última" aria-describedby="fLibraryHelp">${slots}</ol>
    ${summary}
    <div class="q-actions">
      <button class="arena-btn primary big" data-q-submit>${ordering ? 'Confirmar ordem' : 'Confirmar'}</button>
    </div>`;
}
