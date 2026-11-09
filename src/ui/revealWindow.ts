// A janela das cartas reveladas do topo de um grimório (Grisly Salvage, Satyr Wayfinder) para quem assiste: não segura o jogo e se atualiza com a escolha.
import type { FCard, FRevealView, FState } from '../forge/client';
import { esc } from './cardtext';
import { label } from './cardFaces';
import { syncAllRowEdges } from './cardRow';

export interface RevealWindowDeps {
  face(c: FCard, size: 'small' | 'normal'): string;
  /** Outra coisa na frente (pergunta, resultado, zona, galeria da pilha, conexão caída): a janela espera. */
  blocked(s: FState): boolean;
  setHTML(el: HTMLElement, html: string): void;
  leave(el: HTMLElement): void;
  syncModal(): void;
  /** Avisa o servidor que o jogador fechou a janela. */
  seen(seq: number): void;
}

/** O título e a linha de baixo: quem revelou, se ainda está escolhendo e o que escolheu. */
export function revealViewText(v: FRevealView): { title: string; line: string } {
  const source = v.source?.name ? label(v.source) : '';
  const names = v.cards.filter(c => v.chosen?.includes(c.id)).map(label);
  const line = source ? `Cartas reveladas com ${source}.` : '';
  if (v.mine) return { title: 'Cartas reveladas do seu grimório', line };
  const who = v.chooser ?? 'O oponente';
  if (v.waiting) return { title: `${who} está escolhendo…`, line: `${line} A janela mostra a escolha assim que ele terminar.`.trim() };
  if (names.length) return { title: `${who} escolheu ${names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : names[0]}`, line };
  return { title: `${who} não escolheu nenhuma carta`, line };
}

export function createRevealWindow(root: HTMLElement, d: RevealWindowDeps) {
  /** A última janela fechada: não volta, mesmo que o estado ainda a traga até o servidor saber. */
  let dismissed = -1;
  let showing = -1;
  const cards = new Map<string, FCard>();
  const $el = () => root.querySelector('#fReveal') as HTMLElement;
  function html(v: FRevealView) {
    cards.clear();
    const { title, line } = revealViewText(v);
    const decided = !!v.chosen;
    const items = v.cards.map((c, i) => {
      const key = `rv${v.seq}-${i}`, chosen = !!v.chosen?.includes(c.id);
      cards.set(key, c);
      return `<div class="reveal-card${chosen ? ' chosen' : decided ? ' passed' : ''}"><button class="q-face" data-event="${key}" aria-label="Inspecionar ${esc(label(c))}${chosen ? ' (escolhida)' : ''}">${d.face(c, 'normal')}</button>${chosen ? '<span class="q-badge" aria-hidden="true">✓</span>' : ''}</div>`;
    }).join('');
    return `<section class="question zone-view reveal-view" role="dialog" aria-modal="true" aria-labelledby="fRevealTitle">
      <h2 id="fRevealTitle">${esc(title)}</h2>${line ? `<p class="q-hint">${esc(line)}</p>` : ''}
      <div class="q-opts cards" aria-live="polite">${items}</div>
      <div class="q-actions"><button class="arena-btn primary" data-ui="reveal-ok">OK</button></div></section>`;
  }
  function sync(s: FState) {
    const el = $el(), v = s.revealView;
    if (!v || v.seq === dismissed || d.blocked(s)) { el.hidden = true; showing = -1; return; }
    const next = html(v);
    if (el.hidden || el.dataset.html !== next) { d.setHTML(el, next); el.dataset.html = next; }
    el.hidden = false; showing = v.seq;
    syncAllRowEdges(el);
  }
  /** OK: some, e o servidor esquece a janela. */
  function close() {
    const el = $el();
    if (el.hidden || showing < 0) return;
    dismissed = showing; d.seen(showing);
    d.leave(el); el.hidden = true; el.dataset.html = ''; showing = -1;
    d.syncModal();
  }
  return { sync, close, card: (key: string) => cards.get(key) };
}
