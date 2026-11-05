// A pilha na mesa: o painel ao lado (como a apresentação a mostra agora, com o item que está sendo jogado), a galeria
// em tela cheia e as setas de alvo, com o item sob o mouse ou com o foco em destaque.
import type { FState } from '../forge/client';
import { label, ptOf } from './cardFaces';
import { hideCardPreview } from './cardInspector';
import { stackPresentation } from './stackPresentation';
import { stackGalleryHTML, stackPanel, type StackView } from './stackView';
import { drawTargetArrows as drawTargets } from './tableArrows';
import { stateWithFrame } from './presentationTimeline';
import type { ModalFocus } from './tableModal';
import type { TableCtx } from './tableContext';

export interface StackDeps extends Pick<TableCtx, 'root' | '$' | 'setHTML' | 'state' | 'match' | 'timeline' | 'frame' | 'face' | 'playerName' | 'targetsDescription' | 'syncModal'> {
  modal: ModalFocus;
  /** O histórico da gaveta, redesenhado junto com a pilha. */
  renderLog(): void;
}

export function createTableStack(d: StackDeps) {
  const { root, $ } = d;
  const stackView = (): StackView => ({ face: c => d.face(c, 'normal'), label, ptText: name => ptOf(name)?.text, playerName: d.playerName, you: d.state()?.you, targetsText: d.targetsDescription });

  function closeGallery() {
    const match = d.match();
    match.stackGalleryOpen = false; $('#fStackGallery').hidden = true;
    root.querySelector('[data-ui="stack-open"]')?.setAttribute('aria-expanded', 'false');
    hideCardPreview(true); d.syncModal();
    const restore = () => {
      if (!d.modal.current() && !d.match().stackGalleryOpen) (root.querySelector<HTMLElement>('[data-ui="stack-open"]') ?? root.querySelector<HTMLElement>('#fAction button:not(:disabled)') ?? root.querySelector<HTMLElement>('[data-ui="menu"]'))?.focus({ preventScroll: true });
    };
    restore();
    // A live update may replace the priority controls later in this same render.
    queueMicrotask(() => { if (document.activeElement === document.body) restore(); });
  }
  function renderGallery(s: FState) {
    if (!d.match().stackGalleryOpen) return;
    const boardDecision = !s.input.selectableStacks?.length && (!!s.input.selection || !!s.input.blocking || !!s.input.suspendCast || !!s.input.paying || !!s.input.targeting || !!s.input.selectablePlayers?.length || !!s.input.selectable.length || (!s.input.priority && (s.input.ok.enabled || s.input.cancel.enabled)));
    if (!s.stack.length || s.question || s.gameOver || s.sideboarding || boardDecision) { closeGallery(); return; }
    const gallery = $('#fStackGallery');
    const track = gallery.querySelector<HTMLElement>('.stack-gallery-track');
    const scroll = { left: track?.scrollLeft ?? 0, top: track?.scrollTop ?? 0 };
    d.setHTML(gallery, stackGalleryHTML(stackView(), s));
    gallery.hidden = false;
    const next = gallery.querySelector<HTMLElement>('.stack-gallery-track')!;
    next.scrollLeft = scroll.left; next.scrollTop = scroll.top;
  }
  /** O painel da pilha, a galeria (se aberta) e o histórico. */
  function render() {
    const authoritative = d.state();
    if (!authoritative) return;
    const match = d.match();
    const presentation = stackPresentation(authoritative, d.timeline.current?.event);
    const s = { ...authoritative, stack: presentation.stack };
    const el = $('#fStack');
    const focused = d.modal.snapshot();
    const scrollTop = el.scrollTop;
    el.hidden = !s.stack.length;
    el.classList.toggle('minimized', match.stackMinimized);
    root.querySelector('.forge')!.classList.toggle('has-stack', !!s.stack.length);
    d.setHTML(el, s.stack.length ? stackPanel(stackView(), s, presentation.replaying, { minimized: match.stackMinimized, galleryOpen: match.stackGalleryOpen }) : '');
    el.scrollTop = scrollTop;
    renderGallery(authoritative);
    d.renderLog();
    d.modal.restore(focused);
  }

  /** Item da pilha cujas setas estão em destaque: o que está sob o mouse ou com o foco, ou o que mira a carta ou o jogador apontado. */
  let stackFocus: number | null = null;
  /** Setas de alvo (tableArrows.ts): da pilha que a mesa mostra agora, com o item em foco em destaque. */
  const drawTargetArrows = (s: FState) => { const now = d.state(); drawTargets(root, s, now ? stackPresentation(now, d.timeline.current?.event).stack : s.stack, stackFocus); };
  function focusFrom(el: HTMLElement | null): number | null {
    const s = d.state();
    if (!el || !s?.stack.length) return null;
    const item = el.closest<HTMLElement>('#fStack [data-stack], #fStackGallery [data-stack]');
    if (item) return Number(item.dataset.stack);
    const card = el.closest<HTMLElement>('.field [data-fid]');
    if (card) return s.stack.find(si => si.targets?.cards?.includes(Number(card.dataset.fid)))?.id ?? null;
    const player = el.closest<HTMLElement>('.avatar[data-pid]');
    if (player) return s.stack.find(si => si.targets?.players?.includes(Number(player.dataset.pid)))?.id ?? null;
    return null;
  }
  /** O mouse ou o foco foi para `el`: as setas do item da pilha ligado a ele ficam em destaque. */
  function focusOn(el: HTMLElement | null) {
    const id = focusFrom(el);
    if (id === stackFocus) return;
    stackFocus = id;
    const s = d.state();
    if (s) drawTargetArrows(stateWithFrame(s, d.frame()));
  }
  return { render, closeGallery, drawTargetArrows, focusOn };
}
