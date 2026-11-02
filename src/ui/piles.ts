import type { FCard, FQuestion } from '../forge/client';
import { esc } from './cardtext';

/*
 * Dois montes (Fact or Fiction, Steam Augury, Epiphany at the Drownyard, Sphinx of Uthuun e afins). A ponte marca as
 * duas perguntas do Forge: separar (purpose "piles-split", as cartas marcadas formam o monte 1) e escolher um monte
 * (purpose "piles-choose", com a opção de cada monte e as cartas dele). Separar mostra os dois montes ao vivo, e
 * tocar numa carta a passa para o outro; escolher mostra os montes lado a lado, cada um com o seu botão.
 */

interface PilesView {
  face(c: FCard): string;
  label(c: FCard): string;
  playerName(id: number): string;
  you: number | undefined;
}

export const isPilesSplit = (q: FQuestion) => q.purpose === 'piles-split' && (q.options?.length ?? 0) > 0;
export const isPilesChoice = (q: FQuestion) => q.purpose === 'piles-choose' && q.piles?.length === 2;

/** No começo da divisão, todas as cartas estão no monte 1 (os índices marcados são os do monte 1). */
export const pilesStart = (q: FQuestion) => (q.options ?? []).map((_, i) => i);

/** Passa a carta (índice da opção) para o outro monte. */
export function movePileCard(firstPile: number[], option: number) {
  const at = firstPile.indexOf(option);
  if (at >= 0) firstPile.splice(at, 1);
  else { firstPile.push(option); firstPile.sort((a, b) => a - b); }
}

const ZONES: Record<string, [string, 'm' | 'f']> = {
  hand: ['mão', 'f'], graveyard: ['cemitério', 'm'], exile: ['exílio', 'm'], library: ['grimório', 'm'], battlefield: ['campo de batalha', 'm'],
};

/** "a sua mão", "o cemitério de Ana", ou só "a mão" sem `mine` (null quando a zona não é conhecida). */
function zoneOf(zone: string | undefined, owner: number | undefined, view: PilesView, mine = true) {
  const z = zone ? ZONES[zone] : undefined;
  if (!z) return null;
  const [name, g] = z;
  const article = g === 'f' ? 'a' : 'o';
  if (!mine) return `${article} ${name}`;
  return owner === undefined || owner === view.you ? `${article} ${g === 'f' ? 'sua' : 'seu'} ${name}` : `${article} ${name} de ${view.playerName(owner)}`;
}

const sourceName = (q: FQuestion, view: PilesView) => q.card && !q.card.faceDown && q.card.name ? view.label(q.card) : '';
const cardsText = (n: number) => `${n} ${n === 1 ? 'carta' : 'cartas'}`;

/** O que acontece depois que os montes estão separados, para quem separa. */
export function splitHint(q: FQuestion, view: PilesView) {
  const chosen = zoneOf(q.chosenTo, q.pileOwner, view), other = zoneOf(q.otherTo, q.pileOwner, view);
  if (!chosen || !other) return 'Depois, um dos montes é escolhido.';
  // Quem escolhe é o dono das cartas: as zonas são as dele, sem repetir o nome.
  if (q.ownerChooses && q.pileOwner !== undefined && q.pileOwner !== view.you)
    return `${view.playerName(q.pileOwner)} escolhe um dos montes para ${zoneOf(q.chosenTo, undefined, view, false)}; o outro vai para ${zoneOf(q.otherTo, undefined, view, false)}.`;
  if (q.ownerChooses) return `Você escolhe um dos montes para ${chosen}; o outro vai para ${other}.`;
  return `Um oponente escolhe qual monte vai para ${chosen}; o outro vai para ${other}.`;
}

/** O que acontece com o monte escolhido, para quem escolhe. */
export function choiceHint(q: FQuestion, view: PilesView) {
  const chosen = zoneOf(q.chosenTo, q.pileOwner, view), other = zoneOf(q.otherTo, q.pileOwner, view);
  return chosen && other ? `O monte que você escolher vai para ${chosen}; o outro, para ${other}.` : 'Escolha um dos montes.';
}

export const pilesHeading = (q: FQuestion, view: PilesView) => {
  const name = sourceName(q, view);
  const what = isPilesSplit(q) ? 'separe em dois montes' : 'escolha um monte';
  return name ? `${name}: ${what}` : what[0].toUpperCase() + what.slice(1);
};

const head = (q: FQuestion, view: PilesView) => `<div class="q-head"><h2>${esc(pilesHeading(q, view))}</h2><button class="icon-btn q-minimize" data-ui="question-minimize" aria-label="Ver a mesa sem perder esta escolha">Ver a mesa</button></div>`;

/** Resumo lido pelo leitor de tela a cada troca: "Monte 1: 2 cartas. Monte 2: 3 cartas." */
export function splitSummary(q: FQuestion, firstPile: number[]) {
  const total = q.options?.length ?? 0;
  return `Monte 1: ${cardsText(firstPile.length)}. Monte 2: ${cardsText(total - firstPile.length)}.`;
}

/** Separar: os dois montes ao vivo; tocar numa carta passa para o outro, "Ler" abre a carta. */
export function pilesSplitHTML(q: FQuestion, firstPile: number[], view: PilesView) {
  const opts = q.options ?? [];
  const piles = [opts.map((_, i) => i).filter(i => firstPile.includes(i)), opts.map((_, i) => i).filter(i => !firstPile.includes(i))];
  const column = (indices: number[], n: 1 | 2) => {
    const cards = indices.map(i => {
      const o = opts[i];
      const card = typeof o === 'string' ? undefined : o.card;
      if (!card) return '';
      const name = view.label(card);
      return `<li class="pile-slot">
        <button type="button" class="pile-card" data-pile-move="${i}" aria-label="${esc(`${name}, no monte ${n}. Toque para passar para o monte ${n === 1 ? 2 : 1}.`)}"><div class="pile-face">${view.face(card)}</div></button>
        <button type="button" class="pile-read" data-inspect="${card.id}" aria-label="${esc(`Ler ${name}`)}">Ler</button>
      </li>`;
    }).join('');
    return `<section class="pile-group" aria-label="Monte ${n}, ${cardsText(indices.length)}">
      <h3><b>Monte ${n}</b><span>${cardsText(indices.length)}</span></h3>
      <ul class="pile-row">${cards || '<li class="pile-empty">Vazio</li>'}</ul>
    </section>`;
  };
  return `${head(q, view)}
    <p class="q-hint" id="fPilesHelp">Toque numa carta para mudá-la de monte. ${esc(splitHint(q, view))}</p>
    <div class="pile-groups split" aria-describedby="fPilesHelp">${column(piles[0], 1)}${column(piles[1], 2)}</div>
    <p class="q-hint pile-summary" aria-live="polite">${esc(splitSummary(q, firstPile))}</p>
    <div class="q-actions"><button class="arena-btn primary big" data-q-submit>Confirmar montes</button></div>`;
}

/** Escolher: os dois montes lado a lado com as cartas de verdade; tocar numa carta só abre a carta. */
export function pilesChoiceHTML(q: FQuestion, view: PilesView) {
  const opts = q.options ?? [];
  const mine = q.pileOwner === undefined || q.pileOwner === view.you;
  const columns = (q.piles ?? []).map((pile, p) => {
    const n = p + 1;
    const shown = pile.cards.map(i => opts[i]).map(o => typeof o === 'string' ? undefined : o?.card).filter((c): c is FCard => !!c);
    // Monte virado para baixo: só o tamanho, com o verso das cartas.
    const hidden = Math.max(0, pile.size - shown.length);
    const cards = shown.map(card => `<li class="pile-slot"><button type="button" class="pile-card read" data-inspect="${card.id}" aria-label="${esc(`${view.label(card)}. Toque para ler a carta.`)}"><div class="pile-face">${view.face(card)}</div></button></li>`).join('')
      + Array.from({ length: hidden }, () => '<li class="pile-slot"><div class="pile-back" role="img" aria-label="Carta virada para baixo"></div></li>').join('');
    return `<section class="pile-group" aria-label="Monte ${n}, ${cardsText(pile.size)}">
      <h3><b>Monte ${n}</b><span>${cardsText(pile.size)}</span></h3>
      <ul class="pile-row">${cards || '<li class="pile-empty">Vazio</li>'}</ul>
      <button class="arena-btn primary pile-pick" data-pile-pick="${pile.option}">${mine ? 'Ficar com o monte' : 'Escolher o monte'} ${n}</button>
    </section>`;
  }).join('');
  return `${head(q, view)}
    <p class="q-hint">${esc(choiceHint(q, view))} Toque numa carta para lê-la.</p>
    <div class="pile-groups">${columns}</div>`;
}
