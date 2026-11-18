// Os avisos do que outro jogador fez: as remoções (o que saiu do campo e por quê, uma por mágica ou habilidade) e as
// cartas que ele revelou. A faixa minimizada no canto da mesa e a janela inteira, navegando entre eles; aparecem depois
// que a mesa termina de mostrar a jogada. As cartas reveladas nunca abrem a janela sozinhas.
import type { FCard, FRevealView, FState } from '../forge/client';
import { esc } from './cardtext';
import { label } from './cardFaces';
import { syncAllRowEdges } from './cardRow';
import { effectParts, type HistoryNames } from './historyLog';
import { DRAG_PILL, DRAG_RESET } from './icons';
import type { PresentationTimeline } from './presentationTimeline';
import { opensExpanded, removalAffects, removalNotices, removedByOwner, type RemovalNotice, type RemovalWindowMode } from './removalNotice';
import { revealCardsHTML, revealStripText, revealViewText } from './revealWindow';

/** Avisos guardados de uma vez: com mais do que isso, ficam o primeiro e os mais recentes (o histórico guarda todas as remoções). */
const REMOVAL_QUEUE_LIMIT = 12;

export interface RemovalDeps {
  timeline: PresentationTimeline;
  names: HistoryNames;
  face(c: FCard, size: 'small' | 'normal'): string;
  state(): FState | null | undefined;
  /** Misto, sempre minimizada ou sempre expandida (Opções → Jogo). */
  mode(): RemovalWindowMode;
  /** Outra coisa na frente (pergunta, resultado, zona, galeria da pilha, conexão caída): a janela e a faixa esperam. */
  blocked(s: FState): boolean;
  setHTML(el: HTMLElement, html: string): void;
  /** A janela fechada some aos poucos no lugar dela. */
  leave(el: HTMLElement): void;
  syncModal(): void;
  /** Avisa o servidor que a mesa guardou as cartas reveladas (ele deixa de mandá-las). */
  seen(seq: number): void;
}

interface RemovalEntry {
  /** Uma remoção, ou (com `reveal`) cartas reveladas por outro jogador. */
  notice?: RemovalNotice;
  reveal?: FRevealView;
  /** A mesa não mostrou a saída (aba escondida, jogadas puladas com a fila cheia). */
  unseen: boolean;
  /** Pronta para aparecer (a mesa já terminou de mostrar a jogada) e em que turno ficou pronta. */
  turn: number | null;
}

export function createRemovalQueue(root: HTMLElement, d: RemovalDeps) {
  /** As remoções desta partida, na ordem; as que ainda não estão prontas esperam a mesa mostrar a jogada. */
  let queue: RemovalEntry[] = [];
  /** A janela inteira aberta e qual remoção ela mostra. */
  let expanded = false;
  let view = 0;
  let removalSeq = 0;
  let removalMatch: string | null = null;
  /** A última revelação já guardada (o servidor numera em ordem) e as que ele já sabe que a mesa guardou. */
  let revealSeq = 0;
  const acked = new Set<number>();
  const removalCards = new Map<string, FCard>();
  const $el = () => root.querySelector('#fRemoval') as HTMLElement;
  const $strip = () => root.querySelector('#fRemovalStrip') as HTMLElement;
  const ready = () => queue.filter(entry => entry.turn !== null);
  /** No "Sempre expandida", a janela das remoções não minimiza; só com cartas reveladas, ela minimiza como nos outros modos. */
  const pinned = () => d.mode() === 'max' && ready().some(entry => entry.notice);

  /**
   * As cartas reveladas por outro jogador que o estado traz: as novas entram na fila e as que já estão se atualizam
   * (a escolha de quem revelou). Terminada a escolha, o servidor pode esquecê-las.
   */
  function collectReveals(s: FState, skip: boolean) {
    for (const v of s.reveals ?? []) {
      const same = queue.find(entry => entry.reveal?.seq === v.seq);
      if (same) same.reveal = v;
      else if (v.seq > revealSeq && !skip && !s.watching) queue.push({ reveal: v, unseen: false, turn: null });
      if (!v.waiting && !acked.has(v.seq)) { acked.add(v.seq); d.seen(v.seq); }
    }
    revealSeq = Math.max(revealSeq, ...(s.reveals ?? []).map(v => v.seq));
  }

  /** Junta as remoções novas do histórico. Ao abrir uma partida já em andamento, o que passou não aparece. */
  function collect(s: FState) {
    const last = d.timeline.history.at(-1)?.seq ?? 0;
    if (removalMatch !== d.timeline.matchId) {
      removalMatch = d.timeline.matchId; removalSeq = last; queue = []; expanded = false; revealSeq = 0; acked.clear();
      collectReveals(s, true);
      return;
    }
    collectReveals(s, false);
    trim();
    if (last <= removalSeq) return;
    if (!s.watching) for (const notice of removalNotices(d.timeline.history, removalSeq, s.you)) {
      const unseen = notice.removed.some(e => !d.timeline.shows(e.seq));
      // Uma remoção em massa que chega em dois pacotes continua sendo uma só.
      const same = queue.find(other => other.notice?.cause.stackId === notice.cause.stackId);
      if (same?.notice) { same.notice.removed.push(...notice.removed); same.unseen ||= unseen; } else queue.push({ notice, unseen, turn: null });
    }
    removalSeq = last;
    trim();
  }
  function trim() {
    if (queue.length > REMOVAL_QUEUE_LIMIT) {
      const [oldest] = queue;
      queue = [oldest!, ...queue.slice(-(REMOVAL_QUEUE_LIMIT - 1))];
      view = Math.min(view, queue.length - 1);
    }
  }

  /**
   * Com a mesa parada, os avisos novos ficam prontos: as remoções que pedem a janela inteira a abrem sozinhas e o resto
   * (as cartas reveladas, sempre) vai para a faixa. No começo do seu turno, a faixa esquece os dos turnos anteriores.
   */
  function settle(s: FState) {
    const mode = d.mode();
    if (!d.timeline.current && !d.timeline.queued) {
      const fresh = queue.filter(entry => entry.turn === null);
      fresh.forEach(entry => { entry.turn = s.turn; });
      const opening = fresh.find(entry => entry.notice && opensExpanded(entry.notice, s.you, mode, entry.unseen));
      if (opening && !expanded) { expanded = true; view = ready().indexOf(opening); }
    }
    if (s.activePlayer === s.you && !expanded) queue = queue.filter(entry => entry.turn === null || entry.turn >= s.turn);
    if (pinned()) expanded = true;
    if (!ready().length) expanded = false;
    view = Math.max(0, Math.min(view, ready().length - 1));
  }

  function sync(s: FState) {
    settle(s);
    const el = $el(), strip = $strip();
    const shown = ready();
    const blocked = d.blocked(s) || !shown.length;
    const html = blocked || !expanded ? '' : windowHTML(shown, s);
    if (!html) el.hidden = true;
    else {
      if (el.hidden || el.dataset.html !== html) { d.setHTML(el, html); el.dataset.html = html; }
      el.hidden = false;
      syncAllRowEdges(el);
    }
    const bar = blocked || expanded ? '' : stripHTML(shown, s);
    if (!bar) { strip.hidden = true; strip.dataset.html = ''; }
    else {
      if (strip.hidden || strip.dataset.html !== bar) { d.setHTML(strip, bar); strip.dataset.html = bar; }
      strip.hidden = false;
    }
  }

  const causeName = (notice: RemovalNotice) => {
    const { card, name, controller } = notice.cause;
    return `${card?.name && !card.faceDown ? label(card) : name ?? 'Um efeito'} (${d.names.player(controller)})`;
  };
  const thumb = (key: string, c: FCard) => {
    removalCards.set(key, c);
    return `<button class="q-face" data-event="${key}" aria-label="Inspecionar ${esc(label(c))}">${d.face(c, 'normal')}</button>`;
  };

  function windowHTML(shown: RemovalEntry[], s: FState) {
    removalCards.clear();
    d.names.you = s.you;
    const { notice, reveal } = shown[view]!;
    const many = shown.length > 1;
    // Só remoções: a janela fala delas, como antes; com cartas reveladas no meio, são "avisos".
    const removalsOnly = shown.every(entry => entry.notice);
    const nav = many ? `<div class="removal-nav"><button class="icon-btn" data-ui="removal-prev" aria-label="${removalsOnly ? 'Remoção anterior' : 'Aviso anterior'}"${view === 0 ? ' disabled' : ''}>‹</button><span>${view + 1} de ${shown.length}</span><button class="icon-btn" data-ui="removal-next" aria-label="${removalsOnly ? 'Próxima remoção' : 'Próximo aviso'}"${view === shown.length - 1 ? ' disabled' : ''}>›</button></div>` : '';
    const minimize = pinned() ? '' : '<button class="arena-btn secondary" data-ui="removal-minimize">Minimizar</button>';
    const actions = `<div class="q-actions">${nav}${minimize}<button class="arena-btn primary" data-ui="removal-ok">${!many ? 'OK' : removalsOnly ? 'OK, ver a próxima' : 'OK, ver o próximo'}</button></div>`;
    if (reveal) {
      const text = revealViewText(reveal);
      const items = revealCardsHTML(reveal, (key, c, chosen) => {
        removalCards.set(key, c);
        return `<button class="q-face" data-event="${key}" aria-label="Inspecionar ${esc(label(c))}${chosen ? ' (escolhida)' : ''}">${d.face(c, 'normal')}</button>`;
      });
      return `<section class="question zone-view removal-notice reveal-view" role="dialog" aria-modal="true" aria-labelledby="fRemovalTitle">
      <h2 id="fRemovalTitle">${esc(text.title)}</h2>${text.line ? `<p class="q-hint">${esc(text.line)}</p>` : ''}
      <div class="q-opts cards" aria-live="polite">${items}</div>
      ${actions}</section>`;
    }
    if (!notice) return '';
    const title = `${causeName(notice)} ${effectParts(notice.removed, d.names, undefined, false).join('; ')}`;
    const groups = removedByOwner(notice, s.you).map(({ owner, removed }) => `<section class="removal-group">
      <h3>${owner === s.you ? 'Suas' : `De ${esc(d.names.player(owner))}`} (${removed.length})</h3>
      <div class="q-opts cards">${removed.map(e => e.card ? thumb(`rm${e.seq}`, e.card) : '').join('')}</div></section>`).join('');
    const { card } = notice.cause;
    return `<section class="question zone-view removal-notice" role="dialog" aria-modal="true" aria-labelledby="fRemovalTitle">
      <h2 id="fRemovalTitle">${esc(title)}</h2>
      <div class="removal-body">${card ? `<div class="removal-cause">${thumb('rm-cause', card)}</div>` : ''}<div class="removal-groups">${groups}</div></div>
      ${actions}</section>`;
  }

  /** A faixa: o aviso mais recente, quantos há e se alguma remoção levou permanente sua. */
  function stripHTML(shown: RemovalEntry[], s: FState) {
    d.names.you = s.you;
    const { notice, reveal } = shown.at(-1)!;
    let head = '', what = '', card: FCard | undefined;
    if (reveal) {
      ({ head, what } = revealStripText(reveal));
      // Uma carta só, à vista: é ela que aparece; senão, a carta que fez revelar.
      const [only] = reveal.cards;
      card = reveal.zone && reveal.cards.length === 1 && only?.name && !only.faceDown ? only : reveal.source ?? only;
    } else if (notice) {
      const [only] = notice.removed;
      const owner = notice.removed.length === 1 && only ? only.actor === s.you ? ', sua' : `, de ${d.names.player(only.actor)}` : '';
      head = causeName(notice); what = `${effectParts(notice.removed, d.names).join('; ')}${owner}`; card = notice.cause.card;
    }
    const more = shown.length - 1;
    const mine = shown.some(entry => entry.notice && removalAffects(entry.notice, s.you));
    // Só remoções: a faixa fala delas, como antes; com cartas reveladas no meio, são "avisos".
    const removalsOnly = shown.every(entry => entry.notice);
    const one = removalsOnly ? 'a remoção' : shown.length === 1 ? 'as cartas reveladas' : 'o aviso';
    const all = removalsOnly ? `as ${shown.length} remoções` : `os ${shown.length} avisos`;
    const rest = removalsOnly ? more === 1 ? '1 remoção' : `${more} remoções` : more === 1 ? '1 aviso' : `${more} avisos`;
    const art = card ? `<span class="removal-strip-card">${d.face(card, 'small')}</span>` : '';
    return `<div class="removal-strip${mine ? ' mine' : ''}${more ? ' many' : ''}${reveal ? ' reveal' : ''}" role="status">${DRAG_PILL}${DRAG_RESET}
      <button class="removal-strip-open" data-ui="removal-open" aria-label="Ver ${shown.length === 1 ? one : all}: ${esc(head)} ${esc(what)}">${art}<span class="removal-strip-text"><strong>${esc(head)}</strong><span>${esc(what)}</span><small>${more ? `e mais ${rest} · ` : ''}toque para ver</small></span></button>
      <span class="removal-strip-side"><button class="removal-strip-close" data-ui="removal-dismiss" aria-label="Dispensar ${shown.length === 1 ? one : removalsOnly ? 'as remoções' : 'os avisos'}">×</button>${more ? `<span class="removal-strip-count" aria-hidden="true">${shown.length}</span>` : ''}</span></div>`;
  }

  function redraw() {
    const s = d.state();
    if (s) sync(s);
    d.syncModal();
  }
  /** A janela fecha aos poucos (ou dá lugar à faixa). */
  function leaveWindow() {
    const el = $el();
    if (el.hidden) return;
    d.leave(el); el.hidden = true; el.dataset.html = '';
  }
  /** OK: o aviso na tela sai e o próximo toma o lugar; sem nenhum, a janela fecha. */
  function close() {
    if ($el().hidden) return;
    const shown = ready();
    queue = queue.filter(entry => entry !== shown[view]);
    if (shown.length <= 1) { expanded = false; leaveWindow(); }
    redraw();
  }
  /** Minimizar (ou tocar fora): a janela vira a faixa, com os mesmos avisos. No "Sempre expandida" com remoções, é o mesmo que OK. */
  function minimize() {
    if ($el().hidden) return;
    if (pinned()) { close(); return; }
    expanded = false; leaveWindow(); redraw();
  }
  /** Tocar na faixa: a janela abre no primeiro aviso. */
  function open() { if (!ready().length) return; expanded = true; view = 0; redraw(); }
  /** ×: a faixa esquece todos os avisos prontos. */
  function dismiss() { queue = queue.filter(entry => entry.turn === null); redraw(); }
  function step(delta: number) { view = Math.max(0, Math.min(view + delta, ready().length - 1)); redraw(); }

  // Tocar fora da janela minimiza; no "Sempre expandida" com remoções não faz nada, como antes.
  root.addEventListener('click', e => { if (e.target === $el() && !$el().hidden && !pinned()) minimize(); });
  return {
    collect, sync, close, minimize, open, dismiss, step,
    /** A janela inteira está aberta. */
    expanded: () => !$el().hidden,
    card: (key: string) => removalCards.get(key),
  };
}
