// As cartas reveladas que não seguram o jogo: a janela do seu próprio revelar sem escolha depois e os textos e as cartas dos avisos do que os outros revelam (que ficam na faixa das remoções).
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

const list = (names: string[]) => names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : names[0] ?? '';
const ZONES: Record<string, string> = { Library: 'do grimório', Hand: 'da mão', Graveyard: 'do cemitério', Exile: 'do exílio' };
/** "Lightning Bolt do grimório" ou "3 cartas da mão": o que outro jogador revelou, sem escolha depois. */
function revealedWhat(v: FRevealView) {
  const [only] = v.cards;
  const what = v.cards.length === 1 && only?.name && !only.faceDown ? label(only) : `${v.cards.length} ${v.cards.length === 1 ? 'carta' : 'cartas'}`;
  const where = ZONES[v.zone ?? ''];
  return where ? `${what} ${where}` : what;
}

/** O título e a linha de baixo: quem revelou, se ainda está escolhendo e o que escolheu. */
export function revealViewText(v: FRevealView): { title: string; line: string } {
  const source = v.source?.name ? label(v.source) : '';
  const names = v.cards.filter(c => v.chosen?.includes(c.id)).map(label);
  const line = source ? `${v.cards.length === 1 ? 'Carta revelada' : 'Cartas reveladas'} com ${source}.` : '';
  if (v.mine) return { title: 'Cartas reveladas do seu grimório', line };
  if (v.zone) return { title: `${v.owner ?? 'O oponente'} revelou ${revealedWhat(v)}`, line };
  const who = v.chooser ?? 'O oponente';
  if (v.waiting) return { title: `${who} está escolhendo…`, line: `${line} A janela mostra a escolha assim que ele terminar.`.trim() };
  if (names.length) return { title: `${who} escolheu ${list(names)}`, line };
  return { title: `${who} não escolheu nenhuma carta`, line };
}

/** O aviso na faixa: a carta que fez revelar e quem a controla (ou só quem revelou) e, embaixo, o que aconteceu. */
export function revealStripText(v: FRevealView): { head: string; what: string } {
  const who = v.chooser ?? v.owner ?? 'O oponente';
  const head = v.source?.name && !v.source.faceDown ? `${label(v.source)} (${who})` : who;
  if (v.zone) return { head, what: `${v.owner && v.owner !== who ? `${v.owner} revelou` : 'revelou'} ${revealedWhat(v)}` };
  const count = `revelou ${v.cards.length} ${v.cards.length === 1 ? 'carta' : 'cartas'}`;
  const names = v.cards.filter(c => v.chosen?.includes(c.id)).map(label);
  if (v.waiting) return { head, what: `${count} e está escolhendo…` };
  return { head, what: names.length ? `${count} e escolheu ${list(names)}` : `${count} e não escolheu nenhuma` };
}

/** As cartas reveladas, a escolhida em destaque e as outras apagadas depois da escolha; `thumb` desenha e guarda cada uma. */
export function revealCardsHTML(v: FRevealView, thumb: (key: string, c: FCard, chosen: boolean) => string) {
  const decided = !!v.chosen;
  return v.cards.map((c, i) => {
    const chosen = !!v.chosen?.includes(c.id);
    return `<div class="reveal-card${chosen ? ' chosen' : decided ? ' passed' : ''}">${thumb(`rv${v.seq}-${i}`, c, chosen)}${chosen ? '<span class="q-badge" aria-hidden="true">✓</span>' : ''}</div>`;
  }).join('');
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
    const items = revealCardsHTML(v, (key, c, chosen) => {
      cards.set(key, c);
      return `<button class="q-face" data-event="${key}" aria-label="Inspecionar ${esc(label(c))}${chosen ? ' (escolhida)' : ''}">${d.face(c, 'normal')}</button>`;
    });
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
