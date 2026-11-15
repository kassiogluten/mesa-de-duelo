// Painéis da mesa que se arrastam pela alça: o limite antes de mover, sempre dentro da tela, o lugar guardado neste
// aparelho, dois cliques para voltar ao lugar de sempre e, no lugar de sempre, sair de cima das cartas que podem ser escolhidas.
import { load, loadJSON, save, saveJSON, type StorageKey } from '../storage';

export interface Shift { x: number; y: number }
export interface Box { left: number; top: number; right: number; bottom: number }
interface View { width: number; height: number }

/** Um painel arrastável: qual é a alça e onde ele guarda o lugar. */
export interface DragPanelSpec {
  /** Seletor das alças (o arraste começa nelas). */
  handle: string;
  /** Seletor do painel que se move. */
  panel: string;
  /** Onde o painel guarda o lugar, conforme o que ele mostra agora; null deixa o painel parado no lugar de sempre. */
  key(el: HTMLElement): StorageKey | null;
  /** O que o painel, no lugar de sempre, não deve cobrir (as cartas que podem ser escolhidas). */
  avoid?(el: HTMLElement): Box[];
}

/** Distância da borda da tela, movimento antes de o arraste começar e folga ao desviar de uma carta (px). */
const MARGIN = 4, THRESHOLD = 4, GAP = 8;

/** O quanto falta mover a caixa para ela voltar para dentro da tela (a borda de cima e a da esquerda ganham, se não couber). */
export function clampShift(box: Box, view: View): Shift {
  const axis = (start: number, end: number, size: number) =>
    start < MARGIN ? MARGIN - start : end > size - MARGIN ? Math.max(MARGIN - start, size - MARGIN - end) : 0;
  return { x: axis(box.left, box.right, view.width), y: axis(box.top, box.bottom, view.height) };
}

/** O menor deslocamento que tira a caixa de cima dos obstáculos sem sair da tela; null se nada está coberto ou não há espaço. */
export function dodgeShift(box: Box, obstacles: Box[], view: View): Shift | null {
  const covers = (s: Shift) => obstacles.some(o => box.left + s.x < o.right && box.right + s.x > o.left && box.top + s.y < o.bottom && box.bottom + s.y > o.top);
  if (!covers({ x: 0, y: 0 })) return null;
  const inside = (s: Shift) => box.left + s.x >= MARGIN && box.top + s.y >= MARGIN && box.right + s.x <= view.width - MARGIN && box.bottom + s.y <= view.height - MARGIN;
  // Para cima, para baixo e para os lados de cada obstáculo; vale o mais perto que não cobre nenhum.
  const options = obstacles.flatMap(o => [
    { x: 0, y: o.top - GAP - box.bottom }, { x: 0, y: o.bottom + GAP - box.top },
    { x: o.left - GAP - box.right, y: 0 }, { x: o.right + GAP - box.left, y: 0 },
  ]);
  return options.filter(s => inside(s) && !covers(s)).sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0] ?? null;
}

/** Leva o lugar guardado numa chave antiga para a nova (só se a nova ainda não tem um). */
export function moveStoredPlace(from: StorageKey, to: StorageKey) {
  const old = load(from);
  if (old === null) return;
  if (load(to) === null) save(to, old);
  save(from, null);
}

export function createDragPanels(root: HTMLElement, specs: DragPanelSpec[]) {
  const places = new Map<StorageKey, Shift | null>();
  const view = (): View => ({ width: innerWidth, height: innerHeight });
  function stored(key: StorageKey) {
    if (!places.has(key)) {
      const v = loadJSON<Shift | null>(key, null);
      places.set(key, v && Number.isFinite(v.x) && Number.isFinite(v.y) ? { x: v.x, y: v.y } : null);
    }
    return places.get(key)!;
  }
  function remember(key: StorageKey, shift: Shift | null) {
    places.set(key, shift);
    if (shift) saveJSON(key, shift); else save(key, null);
  }
  function place(el: HTMLElement, s: Shift | null) {
    el.classList.toggle('drag-moved', !!s);
    if (!s) { el.style.removeProperty('--drag-x'); el.style.removeProperty('--drag-y'); return; }
    el.style.setProperty('--drag-x', `${Math.round(s.x)}px`); el.style.setProperty('--drag-y', `${Math.round(s.y)}px`);
  }
  /** O deslocamento que o painel mostra agora. */
  function shown(el: HTMLElement): Shift {
    if (!el.classList.contains('drag-moved')) return { x: 0, y: 0 };
    const x = parseFloat(el.style.getPropertyValue('--drag-x')), y = parseFloat(el.style.getPropertyValue('--drag-y'));
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : { x: 0, y: 0 };
  }
  /** Põe o painel em `shift` trazido para dentro da tela (sem mudar o lugar guardado) e devolve onde ele ficou. */
  function put(el: HTMLElement, shift: Shift) {
    place(el, shift);
    const box = el.getBoundingClientRect();
    // Painel escondido (sem caixa): fica onde está, e o lugar certo sai no próximo desenho.
    const fix = box.width ? clampShift(box, view()) : { x: 0, y: 0 };
    if (!fix.x && !fix.y) return shift;
    const s = { x: shift.x + fix.x, y: shift.y + fix.y };
    place(el, s);
    return s;
  }
  function settle(spec: DragPanelSpec, el: HTMLElement) {
    const key = spec.key(el);
    place(el, null);
    if (!key) return;
    const shift = stored(key) ?? (spec.avoid ? dodgeShift(el.getBoundingClientRect(), spec.avoid(el), view()) : null);
    if (shift) put(el, shift);
  }
  /** Coloca cada painel no lugar dele; chamado a cada desenho e quando a janela muda de tamanho. */
  function sync() {
    for (const spec of specs) {
      const el = root.querySelector<HTMLElement>(spec.panel);
      if (el && !el.classList.contains('drag-active')) settle(spec, el);
    }
  }
  function grab(target: EventTarget | null) {
    for (const spec of specs) {
      const handle = (target as Element | null)?.closest?.<HTMLElement>(spec.handle);
      const el = handle?.closest<HTMLElement>(spec.panel);
      const key = el && spec.key(el);
      if (handle && el && key) return { spec, handle, el, key };
    }
    return null;
  }
  root.addEventListener('pointerdown', e => {
    const hit = e.button === 0 ? grab(e.target) : null;
    if (!hit) return;
    const { handle, el, key } = hit;
    const start = { x: e.clientX, y: e.clientY }, base = shown(el);
    let last: Shift | null = null;
    handle.setPointerCapture(e.pointerId);
    el.classList.add('drag-active');
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      if (!last && Math.hypot(dx, dy) < THRESHOLD) return;
      el.classList.add('drag-moving');
      last = put(el, { x: base.x + dx, y: base.y + dy });
    };
    const end = () => {
      handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', end); handle.removeEventListener('pointercancel', end);
      el.classList.remove('drag-active', 'drag-moving');
      // Guarda o lugar em que o painel ficou de fato (já trazido para dentro da tela).
      if (last) remember(key, last);
    };
    handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
    e.preventDefault();
  });
  root.addEventListener('dblclick', e => {
    const hit = grab(e.target);
    if (!hit) return;
    remember(hit.key, null);
    settle(hit.spec, hit.el);
  });
  return { sync };
}
