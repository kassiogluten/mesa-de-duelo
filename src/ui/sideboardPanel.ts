// O painel de sideboard entre os jogos em uso: tocar para passar uma carta, arrastar (e trocar em par), o filtro, ver a carta grande e o scroll que fica onde estava.
import type { FState } from '../forge/client';
import { cacheGet, fetchByNames } from '../scryfall';
import { ptOf } from './cardFaces';
import { inspectCard } from './cardInspector';
import { DRAG_THRESHOLD } from './handDrag';
import { moveCopy, swapPair, type SideboardFilter, type SideboardSide, type SideboardTypeFilter } from './sideboardDraft';
import { sideboardHTML } from './sideboardView';
import type { TableCtx } from './tableContext';

export type SideboardPanelDeps = Pick<TableCtx, 'root' | 'setHTML' | 'opts' | 'state' | 'match' | 'render'>;

/** Quanto o dedo fica parado numa carta antes de ela "levantar" para ser arrastada (ou, solta sem mexer, ser vista grande). */
const HOLD_MS = 320;

interface Press { side: SideboardSide; key: string; name: string; x: number; y: number; id: number; touch: boolean; armed: boolean; dragging: boolean; timer: number; ghost: HTMLElement | null; tile: HTMLElement }

export function createSideboardPanel(d: SideboardPanelDeps, lifeDetailsHTML: (s: FState) => string) {
  let filter: SideboardFilter = { text: '', type: '' };
  let filterFor = -1, fetchedFor = -1;
  let press: Press | null = null;
  /** O clique que vem logo depois de soltar um arraste (ou de segurar para ver a carta) não move de novo. */
  let swallowClick = false;
  const overlay = () => d.root.querySelector<HTMLElement>('#fOverlay');
  const canEdit = () => { const m = d.match(); return !!m.sideboardDraft && !m.sideboardBusy && !d.state()?.sideboarding?.ready; };
  const changed = () => { d.match().sideboardError = ''; d.render(); };

  function html(s: FState) {
    const match = d.match();
    const sb = s.sideboarding!;
    if (!match.sideboardDraft || match.sideboardDraft.id !== sb.id) {
      match.sideboardDraft = { id: sb.id, main: structuredClone(sb.main), sideboard: structuredClone(sb.sideboard) };
      match.sideboardError = ''; match.sideboardBusy = false;
    }
    if (filterFor !== sb.id) { filter = { text: '', type: '' }; filterFor = sb.id; }
    if (sb.ready) match.sideboardBusy = false;
    // Sem os dados de alguma carta (imagem, tipo, custo), busca uma vez e redesenha quando chegarem.
    const missing = [...sb.main, ...sb.sideboard].map(e => e.name).filter(name => !cacheGet(name));
    if (missing.length && fetchedFor !== sb.id) { fetchedFor = sb.id; void fetchByNames(missing).then(() => d.render(), () => {}); }
    return sideboardHTML(s, match.sideboardDraft, { error: match.sideboardError, busy: match.sideboardBusy, details: lifeDetailsHTML(s), filter,
      ptName: name => ptOf(name)?.name || name, feedback: !!d.opts.onFeedback });
  }

  /** Desenha mantendo o scroll de cada coluna e do painel, e o foco (com o cursor do filtro) onde estavam. */
  function paint(ov: HTMLElement, s: FState) {
    const scroll = new Map<string, number>();
    ov.querySelectorAll<HTMLElement>('.sideboard-panel, [data-sb-scroll]').forEach(el => scroll.set(el.dataset.sbScroll ?? 'panel', el.scrollTop));
    const active = document.activeElement instanceof HTMLElement && ov.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = active?.dataset.focus;
    const moveSide = active?.dataset.sbMove;
    const moveIndex = moveSide ? [...ov.querySelectorAll(`[data-sb-move="${moveSide}"]`)].indexOf(active!) : -1;
    const caret = active instanceof HTMLInputElement ? [active.selectionStart, active.selectionEnd] as const : null;
    d.setHTML(ov, html(s));
    ov.querySelectorAll<HTMLElement>('.sideboard-panel, [data-sb-scroll]').forEach(el => { const top = scroll.get(el.dataset.sbScroll ?? 'panel'); if (top) el.scrollTop = top; });
    if (!active || ov.contains(active)) return;
    // A carta que saiu toda da coluna leva o foco para a que ficou no lugar dela.
    const buttons = moveSide ? [...ov.querySelectorAll<HTMLElement>(`[data-sb-move="${moveSide}"]`)] : [];
    const next = (focusKey ? [...ov.querySelectorAll<HTMLElement>('[data-focus]')].find(el => el.dataset.focus === focusKey) : undefined)
      ?? buttons[Math.min(moveIndex, buttons.length - 1)];
    if (!next) return;
    next.focus({ preventScroll: true });
    if (caret && next instanceof HTMLInputElement) next.setSelectionRange(caret[0], caret[1]);
  }

  function click(t: HTMLElement) {
    const match = d.match();
    if (swallowClick && t.closest('.sb-card')) return true;
    const move = t.closest<HTMLElement>('[data-sb-move]');
    if (move) {
      if (canEdit() && moveCopy(match.sideboardDraft!, move.dataset.sbMove as SideboardSide, move.dataset.sbKey ?? '')) changed();
      return true;
    }
    const inspect = t.closest<HTMLElement>('[data-sb-inspect]');
    if (inspect) { inspectCard({ name: inspect.dataset.sbInspect }, inspect); return true; }
    if (t.closest('[data-sb-reset]')) {
      const sb = d.state()?.sideboarding;
      if (sb && canEdit()) { match.sideboardDraft = { id: sb.id, main: structuredClone(sb.main), sideboard: structuredClone(sb.sideboard) }; changed(); }
      return true;
    }
    const type = t.closest<HTMLElement>('[data-sb-type]');
    if (type) { filter = { ...filter, type: (type.dataset.sbType ?? '') as SideboardTypeFilter }; d.render(); return true; }
    return false;
  }

  d.root.addEventListener('input', e => {
    const input = e.target as HTMLInputElement;
    if (!input.matches?.('[data-sb-filter]')) return;
    filter = { ...filter, text: input.value };
    d.render();
  });
  d.root.addEventListener('contextmenu', e => {
    const tile = (e.target as HTMLElement).closest<HTMLElement>('#fOverlay .sb-card');
    if (!tile) return;
    e.preventDefault();
    inspectCard({ name: tile.dataset.sbName }, tile);
  });

  /* Arrastar: com o mouse, a carta sai assim que o ponteiro anda; no toque, só depois de segurar (antes disso o dedo rola a lista). */
  function clearHighlights() {
    overlay()?.querySelectorAll('.sb-drop-over, .sb-swap-over').forEach(el => el.classList.remove('sb-drop-over', 'sb-swap-over'));
  }
  /** Onde a carta cairia: a coluna do outro lado e, se estiver sobre uma carta dela, essa carta (troca em par). */
  function dropAt(p: Press, x: number, y: number) {
    const under = document.elementFromPoint(x, y) as HTMLElement | null;
    const column = under?.closest<HTMLElement>('#fOverlay [data-sb-drop]');
    if (!column || column.dataset.sbDrop === p.side) return null;
    return { column, tile: under?.closest<HTMLElement>('.sb-card') ?? null };
  }
  function startDrag(p: Press) {
    p.dragging = true;
    const ghost = document.createElement('div');
    ghost.className = 'sb-ghost';
    ghost.innerHTML = p.tile.querySelector('.sb-card-move')?.innerHTML ?? '';
    ghost.style.width = `${p.tile.getBoundingClientRect().width}px`;
    document.body.append(ghost);
    p.ghost = ghost;
    p.tile.classList.add('sb-dragging');
  }
  function moveGhost(p: Press, x: number, y: number) {
    if (!p.ghost) return;
    p.ghost.style.transform = `translate(${x - p.ghost.offsetWidth / 2}px, ${y - p.ghost.offsetHeight * 0.4}px) rotate(-3deg)`;
    clearHighlights();
    const drop = dropAt(p, x, y);
    drop?.column.classList.add('sb-drop-over');
    drop?.tile?.classList.add('sb-swap-over');
    // Perto da borda de cima ou de baixo de uma coluna, ela rola sozinha.
    const body = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-sb-scroll]');
    if (body) { const r = body.getBoundingClientRect(); if (y < r.top + 40) body.scrollTop -= 14; else if (y > r.bottom - 40) body.scrollTop += 14; }
  }
  function end(drop: boolean, x = 0, y = 0) {
    const p = press;
    if (!p) return;
    press = null;
    window.clearTimeout(p.timer);
    p.ghost?.remove();
    p.tile.classList.remove('sb-dragging', 'sb-lift');
    clearHighlights();
    if (p.dragging || p.armed) { swallowClick = true; window.setTimeout(() => { swallowClick = false; }); }
    if (!drop) return;
    if (p.dragging) {
      const target = dropAt(p, x, y), draft = d.match().sideboardDraft;
      if (!target || !draft || !canEdit()) return;
      const otherKey = target.tile?.dataset.sbKey;
      if (otherKey ? swapPair(draft, p.side, p.key, otherKey) : moveCopy(draft, p.side, p.key)) changed();
    } else if (p.armed) inspectCard({ name: p.name }, p.tile);
  }
  d.root.addEventListener('pointerdown', e => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('#fOverlay .sb-card-move');
    const tile = button?.closest<HTMLElement>('.sb-card');
    if (!button || !tile || button.disabled || (e.pointerType === 'mouse' && e.button !== 0) || press) return;
    const touch = e.pointerType === 'touch';
    const p: Press = { side: button.dataset.sbMove as SideboardSide, key: button.dataset.sbKey ?? '', name: tile.dataset.sbName ?? '', x: e.clientX, y: e.clientY,
      id: e.pointerId, touch, armed: false, dragging: false, timer: 0, ghost: null, tile };
    if (touch) p.timer = window.setTimeout(() => { if (press === p) { p.armed = true; tile.classList.add('sb-lift'); } }, HOLD_MS);
    press = p;
  });
  window.addEventListener('pointermove', e => {
    const p = press;
    if (!p || e.pointerId !== p.id) return;
    if (!p.dragging) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD) return;
      if (p.touch && !p.armed) { end(false); return; } // o dedo andou antes de segurar: é rolagem
      if (!canEdit()) { end(false); return; }
      startDrag(p);
    }
    moveGhost(p, e.clientX, e.clientY);
  });
  window.addEventListener('pointerup', e => { if (press && e.pointerId === press.id) end(true, e.clientX, e.clientY); });
  window.addEventListener('pointercancel', e => { if (press && e.pointerId === press.id) end(false); });
  // Com a carta levantada no toque, o dedo arrasta a carta em vez de rolar a lista.
  window.addEventListener('touchmove', e => { if (press?.armed || press?.dragging) e.preventDefault(); }, { passive: false });

  return { paint, click };
}
