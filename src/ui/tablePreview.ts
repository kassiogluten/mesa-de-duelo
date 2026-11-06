// Ver uma carta na mesa: a prévia que acompanha o mouse ou fica no canto (teclado), a carta aberta no inspetor (clique,
// botão direito, "i" ou segurar no toque), e qual carta cada elemento da mesa mostra (campo, mão, pilha, histórico,
// janelas de remoção, avisos).
import type { FCard } from '../forge/client';
import { emblemLabel, emblemSource, seenFace } from './cardFaces';
import { followCardPreview, hideCardPreview, inspectCard, showCardPreview } from './cardInspector';
import { exiledNotes, slotExiled } from './exiledUnder';
import { faceDownReminder } from './faceDownReminder';
import { suppressOpeningPreview } from './openingPresentation';
import { permanentStatus, permanentTypeChange, typeChangeText } from './permanentEffects';
import { ptOf } from './cardFaces';
import { stackPresentation } from './stackPresentation';
import type { TableCtx } from './tableContext';

/** Elementos da mesa que mostram uma carta. */
export const INSPECTABLE = '[data-fid],[data-peek],[data-event],[data-stack],[data-stack-inspect],[data-inspect],[data-q-card]';

export interface PreviewDeps extends Pick<TableCtx, 'state' | 'match' | 'timeline' | 'image' | 'playerName' | 'findCard'> {
  /** As cartas do histórico, das janelas de remoção e dos avisos, pela chave do evento. */
  eventCard(key: string): FCard | undefined;
}

export function createCardPreview(d: PreviewDeps) {
  function show(c: FCard | undefined, trigger?: HTMLElement, pinned = false, at?: { x: number; y: number }) {
    const state = d.state();
    if (!pinned && (d.match().stackGalleryOpen || trigger?.closest('#fStack') || (state && suppressOpeningPreview(state)))) return;
    const secret = !!c?.faceDown && !!c.hiddenFace?.name;
    const reminder = c ? faceDownReminder(c) : undefined;
    // Virada para baixo de outro jogador: a carta de lembrete, que só diz como ela foi virada (isso é público).
    if (c && reminder && !secret) {
      const card = { name: reminder.label, image: reminder.normal, text: reminder.text, typeLine: 'Criatura', power: c.power, toughness: c.toughness,
        basePower: c.basePower, baseToughness: c.baseToughness, counters: c.counters, damage: c.damage, keywords: c.keywords,
        notes: [`Virada para baixo (${reminder.label}): só quem a controla sabe qual carta é.`, ...permanentStatus(c, d.playerName, state?.you).map(seal => seal.label), ...exiledNotes(state, c)] };
      if (pinned) inspectCard(card, trigger); else showCardPreview(card, trigger, at);
      return;
    }
    if (c) c = seenFace(c);
    if (!c || c.faceDown || !c.name) { hideCardPreview(); return; }
    const source = c.emblem ? emblemSource(c) : c.name;
    const changed = permanentTypeChange(c);
    const card = { ...c, name: c.emblem ? emblemLabel(c) : c.name,
      image: c.image ?? d.image(source, 'normal', c.emblem ? undefined : c.print),
      text: ptOf(c.name)?.text || c.text,
      typeLine: c.emblem ? 'Emblema' : ptOf(c.name)?.type_line || c.printedType || c.typeLine,
      typeChange: changed ? typeChangeText(changed, c) : undefined,
      notes: [...(secret ? [`Virada para baixo${reminder ? ` (${reminder.label})` : ''}: só você pode ver qual carta é.`] : []), ...permanentStatus(c, d.playerName, state?.you).map(seal => seal.label), ...exiledNotes(state, c)],
      // O que ela (e o que está preso a ela) exilou, embaixo dela no inspetor (a virada para baixo só mostra qual é a quem pode ver).
      exiled: state ? slotExiled(state, c).map(({ card: x }) => {
        const name = x.faceDown ? x.hiddenFace?.name : x.name;
        return name ? { name, image: d.image(name, 'normal', x.faceDown ? undefined : x.print) } : { faceDown: true };
      }) : undefined };
    if (pinned) inspectCard(card, trigger); else showCardPreview(card, trigger, at);
  }
  function cardFromElement(el: HTMLElement): FCard | undefined {
    if (el.dataset.event) return d.eventCard(el.dataset.event);
    const stackId = el.dataset.stack ?? el.dataset.stackInspect;
    const state = d.state();
    if (stackId !== undefined && state) return (el.closest('#fStackGallery') ? state.stack : stackPresentation(state, d.timeline.current?.event).stack).find(item => item.id === Number(stackId))?.source;
    const id = el.dataset.inspect ?? el.dataset.fid ?? el.dataset.peek ?? el.dataset.qCard;
    return id === undefined ? undefined : d.findCard(Number(id));
  }
  return { show, cardFromElement };
}

export interface PreviewInputDeps extends Pick<TableCtx, 'root' | 'showPreview' | 'cardFromElement'> {
  handDrag: { readonly active: boolean; cancel(): void };
  /** As setas do item da pilha ligado ao elemento sob o mouse ou com o foco (tableStack.ts). */
  stackFocusOn(el: HTMLElement | null): void;
}

/** Mouse, foco e toque: a prévia, o destaque das setas da pilha e o segurar para ver. */
export function attachPreviewInput(d: PreviewInputDeps) {
  const { root } = d;
  const inspectable = INSPECTABLE;
  root.addEventListener('pointerover', e => {
    if ((e as PointerEvent).pointerType !== 'mouse') return;
    // Sobre um selo de marcador ou palavra-chave, vale o balão dele, sem a prévia da carta por cima.
    if ((e.target as HTMLElement).closest('.bfc .ctr')) { hideCardPreview(); return; }
    const el = (e.target as HTMLElement).closest<HTMLElement>(inspectable);
    // Com o mouse, a prévia acompanha o cursor; pelo teclado (focusin) ela fica no canto, como antes.
    if (el && !d.handDrag.active) d.showPreview(d.cardFromElement(el), el, false, { x: (e as PointerEvent).clientX, y: (e as PointerEvent).clientY });
  });
  root.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') followCardPreview(e.clientX, e.clientY); }, { passive: true });
  root.addEventListener('pointerover', e => d.stackFocusOn(e.target as HTMLElement));
  root.addEventListener('pointerout', e => d.stackFocusOn(e.relatedTarget as HTMLElement | null));
  root.addEventListener('focusin', e => d.stackFocusOn(e.target as HTMLElement));
  root.addEventListener('focusout', e => d.stackFocusOn(e.relatedTarget as HTMLElement | null));
  root.addEventListener('pointerout', e => {
    const to = (e as PointerEvent).relatedTarget as HTMLElement | null;
    if (!to?.closest?.(`${inspectable},.card-inspector-preview`)) hideCardPreview();
  });
  root.addEventListener('focusin', e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(inspectable);
    if (el && !d.handDrag.active) d.showPreview(d.cardFromElement(el), el);
  });
  root.addEventListener('focusout', e => {
    const to = e.relatedTarget as HTMLElement | null;
    if (!to?.closest?.(`${inspectable},.card-inspector-preview`)) hideCardPreview();
  });
  root.addEventListener('contextmenu', e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(inspectable);
    if (!el) return;
    e.preventDefault();
    if (!heldOpen) d.showPreview(d.cardFromElement(el), el, true);
  });
  /*
   * Segurar para ver: no toque, segurar uma carta parada abre a carta, no iPhone também (lá o toque longo não vira
   * contextmenu). O toque que abriu não joga a carta; mexer o dedo (rolar, arrastar da mão) desiste.
   */
  const HOLD_MS = 450;
  let hold: { pointer: number; x: number; y: number; timer: number } | null = null;
  let heldOpen = false;
  const endHold = () => { if (hold) clearTimeout(hold.timer); hold = null; };
  root.addEventListener('pointerdown', e => {
    endHold(); heldOpen = false;
    if (e.pointerType === 'mouse' || !e.isPrimary) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>(inspectable);
    if (!el) return;
    hold = { pointer: e.pointerId, x: e.clientX, y: e.clientY, timer: window.setTimeout(() => {
      hold = null;
      if (d.handDrag.active || !el.isConnected) return;
      d.handDrag.cancel(); heldOpen = true; d.showPreview(d.cardFromElement(el), el, true);
    }, HOLD_MS) };
  });
  root.addEventListener('pointermove', e => { if (hold?.pointer === e.pointerId && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 10) endHold(); }, { passive: true });
  root.addEventListener('pointerup', endHold);
  root.addEventListener('pointercancel', endHold);
  root.addEventListener('scroll', endHold, { capture: true, passive: true });
  root.addEventListener('keydown', () => { heldOpen = false; }, true);
  root.addEventListener('click', e => { if (heldOpen) { heldOpen = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
}
