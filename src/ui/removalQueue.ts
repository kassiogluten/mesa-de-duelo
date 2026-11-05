// As janelas de remoção: quando outro jogador destrói, exila ou devolve cartas, uma janela mostra o que saiu e por quê,
// uma por mágica ou habilidade, na ordem, depois que a mesa termina de mostrar a jogada.
import type { FCard, FState } from '../forge/client';
import { esc } from './cardtext';
import { label } from './cardFaces';
import { syncAllRowEdges } from './cardRow';
import { effectParts, type HistoryNames } from './historyLog';
import type { PresentationTimeline } from './presentationTimeline';
import { removalNotices, removedByOwner, type RemovalNotice } from './removalNotice';

/** Janelas de remoção esperando a vez: com mais do que isso, ficam a da tela e as mais recentes. */
const REMOVAL_QUEUE_LIMIT = 5;

export interface RemovalDeps {
  timeline: PresentationTimeline;
  names: HistoryNames;
  face(c: FCard, size: 'small' | 'normal'): string;
  state(): FState | null | undefined;
  /** Outra coisa na frente (pergunta, resultado, zona, galeria da pilha, conexão caída): a janela espera. */
  blocked(s: FState): boolean;
  setHTML(el: HTMLElement, html: string): void;
  /** A janela respondida some aos poucos no lugar dela. */
  leave(el: HTMLElement): void;
  syncModal(): void;
}

export function createRemovalQueue(root: HTMLElement, d: RemovalDeps) {
  /** As janelas que ainda vão abrir, a primeira na tela; cada uma é uma mágica ou habilidade. */
  let removalQueue: RemovalNotice[] = [];
  let removalSeq = 0;
  let removalMatch: string | null = null;
  const removalCards = new Map<string, FCard>();
  const $el = () => root.querySelector('#fRemoval') as HTMLElement;
  /** Junta as remoções novas do histórico. Ao abrir uma partida já em andamento, o que passou não abre janela. */
  function collect(s: FState) {
    const last = d.timeline.history.at(-1)?.seq ?? 0;
    if (removalMatch !== d.timeline.matchId) { removalMatch = d.timeline.matchId; removalSeq = last; removalQueue = []; return; }
    if (last <= removalSeq) return;
    if (!s.watching) for (const notice of removalNotices(d.timeline.history, removalSeq, s.you)) {
      // Uma remoção em massa que chega em dois pacotes continua sendo uma janela só.
      const same = removalQueue.find(other => other.cause.stackId === notice.cause.stackId);
      if (same) same.removed.push(...notice.removed); else removalQueue.push(notice);
    }
    removalSeq = last;
    // Muitas seguidas: ficam as mais recentes; o histórico guarda todas.
    if (removalQueue.length > REMOVAL_QUEUE_LIMIT) removalQueue = [removalQueue[0], ...removalQueue.slice(-(REMOVAL_QUEUE_LIMIT - 1))];
  }
  /** A janela abre quando a mesa termina de mostrar a jogada, e espera qualquer escolha ou outra janela fechar. */
  function sync(s: FState) {
    const el = $el();
    const blocked = d.blocked(s);
    const notice = removalQueue[0];
    if (!notice || blocked || (el.hidden && (d.timeline.current || d.timeline.queued))) { el.hidden = true; return; }
    const html = removalHTML(notice, s);
    if (el.hidden || el.dataset.html !== html) { d.setHTML(el, html); el.dataset.html = html; }
    el.hidden = false;
    syncAllRowEdges(el);
  }
  function removalHTML(notice: RemovalNotice, s: FState) {
    removalCards.clear();
    d.names.you = s.you;
    const { card, name, controller } = notice.cause;
    const cause = card?.name && !card.faceDown ? label(card) : name ?? 'Um efeito';
    const title = `${cause} (${d.names.player(controller)}) ${effectParts(notice.removed, d.names, undefined, false).join('; ')}`;
    const thumb = (key: string, c: FCard) => {
      removalCards.set(key, c);
      return `<button class="q-face" data-event="${key}" aria-label="Inspecionar ${esc(label(c))}">${d.face(c, 'normal')}</button>`;
    };
    const groups = removedByOwner(notice, s.you).map(({ owner, removed }) => `<section class="removal-group">
      <h3>${owner === s.you ? 'Suas' : `De ${esc(d.names.player(owner))}`} (${removed.length})</h3>
      <div class="q-opts cards">${removed.map(e => e.card ? thumb(`rm${e.seq}`, e.card) : '').join('')}</div></section>`).join('');
    const more = removalQueue.length - 1;
    return `<section class="question zone-view removal-notice" role="dialog" aria-modal="true" aria-labelledby="fRemovalTitle">
      <h2 id="fRemovalTitle">${esc(title)}</h2>
      <div class="removal-body">${card ? `<div class="removal-cause">${thumb('rm-cause', card)}</div>` : ''}<div class="removal-groups">${groups}</div></div>
      ${more ? `<p class="q-hint">${more === 1 ? 'Mais uma remoção' : `Mais ${more} remoções`} depois desta.</p>` : ''}
      <div class="q-actions"><button class="arena-btn primary" data-ui="removal-ok">OK</button></div></section>`;
  }
  /** OK na janela: ela sai e a próxima da fila (se houver) toma o lugar. */
  function close() {
    const el = $el();
    if (el.hidden) return;
    removalQueue.shift();
    d.leave(el); el.hidden = true; el.dataset.html = '';
    const s = d.state();
    if (s) sync(s);
    d.syncModal();
  }
  return { collect, sync, close, card: (key: string) => removalCards.get(key) };
}
