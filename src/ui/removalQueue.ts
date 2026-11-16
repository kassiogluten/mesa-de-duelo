// As remoções feitas por outro jogador: a faixa minimizada no canto da mesa e a janela inteira, que mostra o que saiu e
// por quê, uma por mágica ou habilidade, navegando entre elas; aparecem depois que a mesa termina de mostrar a jogada.
import type { FCard, FState } from '../forge/client';
import { esc } from './cardtext';
import { label } from './cardFaces';
import { syncAllRowEdges } from './cardRow';
import { effectParts, type HistoryNames } from './historyLog';
import { DRAG_PILL, DRAG_RESET } from './icons';
import type { PresentationTimeline } from './presentationTimeline';
import { opensExpanded, removalAffects, removalNotices, removedByOwner, type RemovalNotice, type RemovalWindowMode } from './removalNotice';

/** Remoções guardadas de uma vez: com mais do que isso, ficam a primeira e as mais recentes (o histórico guarda todas). */
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
}

interface RemovalEntry {
  notice: RemovalNotice;
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
  const removalCards = new Map<string, FCard>();
  const $el = () => root.querySelector('#fRemoval') as HTMLElement;
  const $strip = () => root.querySelector('#fRemovalStrip') as HTMLElement;
  const ready = () => queue.filter(entry => entry.turn !== null);

  /** Junta as remoções novas do histórico. Ao abrir uma partida já em andamento, o que passou não aparece. */
  function collect(s: FState) {
    const last = d.timeline.history.at(-1)?.seq ?? 0;
    if (removalMatch !== d.timeline.matchId) { removalMatch = d.timeline.matchId; removalSeq = last; queue = []; expanded = false; return; }
    if (last <= removalSeq) return;
    if (!s.watching) for (const notice of removalNotices(d.timeline.history, removalSeq, s.you)) {
      const unseen = notice.removed.some(e => !d.timeline.shows(e.seq));
      // Uma remoção em massa que chega em dois pacotes continua sendo uma só.
      const same = queue.find(other => other.notice.cause.stackId === notice.cause.stackId);
      if (same) { same.notice.removed.push(...notice.removed); same.unseen ||= unseen; } else queue.push({ notice, unseen, turn: null });
    }
    removalSeq = last;
    if (queue.length > REMOVAL_QUEUE_LIMIT) {
      const [oldest] = queue;
      queue = [oldest!, ...queue.slice(-(REMOVAL_QUEUE_LIMIT - 1))];
      view = Math.min(view, queue.length - 1);
    }
  }

  /**
   * Com a mesa parada, as remoções novas ficam prontas: as que pedem a janela inteira a abrem sozinhas e o resto vai
   * para a faixa. No começo do seu turno, a faixa esquece as dos turnos anteriores (o histórico guarda todas).
   */
  function settle(s: FState) {
    const mode = d.mode();
    if (!d.timeline.current && !d.timeline.queued) {
      const fresh = queue.filter(entry => entry.turn === null);
      fresh.forEach(entry => { entry.turn = s.turn; });
      const opening = fresh.find(entry => opensExpanded(entry.notice, s.you, mode, entry.unseen));
      if (opening && !expanded) { expanded = true; view = ready().indexOf(opening); }
    }
    if (s.activePlayer === s.you && !expanded) queue = queue.filter(entry => entry.turn === null || entry.turn >= s.turn);
    if (mode === 'max' && ready().length) expanded = true;
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
    const { notice } = shown[view]!;
    const title = `${causeName(notice)} ${effectParts(notice.removed, d.names, undefined, false).join('; ')}`;
    const groups = removedByOwner(notice, s.you).map(({ owner, removed }) => `<section class="removal-group">
      <h3>${owner === s.you ? 'Suas' : `De ${esc(d.names.player(owner))}`} (${removed.length})</h3>
      <div class="q-opts cards">${removed.map(e => e.card ? thumb(`rm${e.seq}`, e.card) : '').join('')}</div></section>`).join('');
    const many = shown.length > 1;
    const nav = many ? `<div class="removal-nav"><button class="icon-btn" data-ui="removal-prev" aria-label="Remoção anterior"${view === 0 ? ' disabled' : ''}>‹</button><span>${view + 1} de ${shown.length}</span><button class="icon-btn" data-ui="removal-next" aria-label="Próxima remoção"${view === shown.length - 1 ? ' disabled' : ''}>›</button></div>` : '';
    const minimize = d.mode() === 'max' ? '' : '<button class="arena-btn secondary" data-ui="removal-minimize">Minimizar</button>';
    const { card } = notice.cause;
    return `<section class="question zone-view removal-notice" role="dialog" aria-modal="true" aria-labelledby="fRemovalTitle">
      <h2 id="fRemovalTitle">${esc(title)}</h2>
      <div class="removal-body">${card ? `<div class="removal-cause">${thumb('rm-cause', card)}</div>` : ''}<div class="removal-groups">${groups}</div></div>
      <div class="q-actions">${nav}${minimize}<button class="arena-btn primary" data-ui="removal-ok">${many ? 'OK, ver a próxima' : 'OK'}</button></div></section>`;
  }

  /** A faixa: a remoção mais recente, quantas há e se alguma levou permanente sua. */
  function stripHTML(shown: RemovalEntry[], s: FState) {
    d.names.you = s.you;
    const { notice } = shown.at(-1)!;
    const [only] = notice.removed;
    const owner = notice.removed.length === 1 && only ? only.actor === s.you ? ', sua' : `, de ${d.names.player(only.actor)}` : '';
    const what = `${effectParts(notice.removed, d.names).join('; ')}${owner}`;
    const more = shown.length - 1;
    const mine = shown.some(entry => removalAffects(entry.notice, s.you));
    const card = notice.cause.card;
    const art = card ? `<span class="removal-strip-card">${d.face(card, 'small')}</span>` : '';
    return `<div class="removal-strip${mine ? ' mine' : ''}${more ? ' many' : ''}" role="status">${DRAG_PILL}${DRAG_RESET}
      <button class="removal-strip-open" data-ui="removal-open" aria-label="Ver ${shown.length === 1 ? 'a remoção' : `as ${shown.length} remoções`}: ${esc(causeName(notice))} ${esc(what)}">${art}<span class="removal-strip-text"><strong>${esc(causeName(notice))}</strong><span>${esc(what)}</span><small>${more ? `e mais ${more === 1 ? '1 remoção' : `${more} remoções`} · ` : ''}toque para ver</small></span></button>
      <span class="removal-strip-side"><button class="removal-strip-close" data-ui="removal-dismiss" aria-label="Dispensar ${shown.length === 1 ? 'a remoção' : 'as remoções'}">×</button>${more ? `<span class="removal-strip-count" aria-hidden="true">${shown.length}</span>` : ''}</span></div>`;
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
  /** OK: a remoção na tela sai e a próxima toma o lugar; sem nenhuma, a janela fecha. */
  function close() {
    if ($el().hidden) return;
    const shown = ready();
    queue = queue.filter(entry => entry !== shown[view]);
    if (shown.length <= 1) { expanded = false; leaveWindow(); }
    redraw();
  }
  /** Minimizar (ou tocar fora): a janela vira a faixa, com as mesmas remoções. No "Sempre expandida", é o mesmo que OK. */
  function minimize() {
    if ($el().hidden) return;
    if (d.mode() === 'max') { close(); return; }
    expanded = false; leaveWindow(); redraw();
  }
  /** Tocar na faixa: a janela abre na primeira remoção. */
  function open() { if (!ready().length) return; expanded = true; view = 0; redraw(); }
  /** ×: a faixa esquece todas as remoções prontas. */
  function dismiss() { queue = queue.filter(entry => entry.turn === null); redraw(); }
  function step(delta: number) { view = Math.max(0, Math.min(view + delta, ready().length - 1)); redraw(); }

  // Tocar fora da janela minimiza; no "Sempre expandida" não faz nada, como antes.
  root.addEventListener('click', e => { if (e.target === $el() && !$el().hidden && d.mode() !== 'max') minimize(); });
  return {
    collect, sync, close, minimize, open, dismiss, step,
    /** A janela inteira está aberta. */
    expanded: () => !$el().hidden,
    card: (key: string) => removalCards.get(key),
  };
}
