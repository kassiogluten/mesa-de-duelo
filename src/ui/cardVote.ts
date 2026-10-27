import type { FCard, FQuestion, FVote } from '../forge/client';
import { esc, optionHTML, richText } from './cardtext';

export const isVote = (q: FQuestion) => q.purpose === 'vote';

const words = (label: string) => new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');

/**
 * O trecho do texto da carta que diz o que cada voto faz ("If carnage gets more votes, ..."). A frase que lista todas
 * as opções ("each player votes for time or money") não explica nenhuma; voto em jogador ou permanente fica sem trecho.
 */
export function voteSnippets(text: string, labels: string[]): string[] {
  const sentences = text.split(/\n+/).flatMap(line => line.split(/(?<=[.!?])\s+/)).map(s => s.replace(/^.*?\s+[—–]\s+/, '').trim()).filter(Boolean);
  const named = labels.map(words);
  return named.map(re => sentences.filter(s => re.test(s) && named.filter(other => other.test(s)).length === 1).join(' '));
}

/** "Time: Ana, Bruno · Money: Carlos", na ordem do primeiro voto de cada opção. */
export function voteTallyText(votes: FVote[], playerName: (id: number) => string): string {
  const groups = new Map<string, string[]>();
  for (const v of votes) groups.set(v.label, [...(groups.get(v.label) ?? []), playerName(v.player)]);
  return [...groups].map(([label, who]) => `${label}: ${who.join(', ')}`).join(' · ');
}

interface VoteView {
  face(c: FCard): string;
  label(c: FCard): string;
  /** Texto da carta para ler (o traduzido, quando houver). */
  rulesText(c: FCard): string;
  playerName(id: number): string;
}

/** Pedido de voto: a carta que vota com o texto dela, os votos já dados e, em cada opção, o que ela faz. */
export function voteHTML(q: FQuestion, view: VoteView): string {
  const card = q.card;
  const name = card ? view.label(card) : 'Votação';
  const opts = q.options ?? [];
  const options = opts.map(o => typeof o === 'string' ? o : o.label);
  const cards = opts.map(o => typeof o === 'string' ? undefined : o.card);
  const snippets = card?.text ? voteSnippets(card.text, options) : options.map(() => '');
  const rules = card ? view.rulesText(card) : '';
  const tally = q.votes?.length ? voteTallyText(q.votes, view.playerName) : '';
  // Voto em cartas fora do campo: as cartas viram as opções, como nas outras escolhas de carta.
  const items = options.map((label, i) => cards[i]
    ? `<button class="q-opt has-card" data-q-opt="${i}" data-q-card="${cards[i]!.id}"><div class="q-face">${view.face(cards[i]!)}</div><span>${esc(view.label(cards[i]!))}</span></button>`
    : `<button class="q-opt vote-opt" data-q-opt="${i}"><strong>${optionHTML(label)}</strong>${snippets[i] ? `<small>${richText(snippets[i])}</small>` : ''}</button>`).join('');
  return `<div class="q-head"><h2>Votação: ${esc(name)}</h2><button class="icon-btn q-minimize" data-ui="question-minimize" aria-label="Ver a mesa sem perder esta escolha">Ver a mesa</button></div>`
    + `<div class="vote-source">${card ? `<div class="q-face vote-card" data-peek="${card.id}" role="button" tabindex="0" aria-label="Ampliar ${esc(name)}">${view.face(card)}</div>` : ''}`
    + `<div class="vote-rules">${rules ? `<p>${richText(rules).replace(/\n/g, '<br>')}</p>` : ''}${tally ? `<p class="vote-tally"><span>Votos até agora</span> ${esc(tally)}</p>` : ''}</div></div>`
    + `<p class="q-hint">Em que você vota?</p><div class="q-opts vote-opts${cards.some(Boolean) ? ' cards' : ''}">${items}</div>`
    + `${(q.min ?? 1) === 0 ? '<div class="q-actions"><button class="arena-btn secondary" data-q-none>Não votar</button></div>' : ''}`;
}
