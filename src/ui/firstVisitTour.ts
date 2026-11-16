// Tour da primeira visita: três balões sobre a tela inicial (escolher o deck, ajustar a partida, Jogar).
import { KEYS, save } from '../storage';
import { esc } from './cardtext';
import './firstVisitTour.css';

interface TourStep {
  /** A área destacada; a primeira que estiver à vista. */
  target: string[];
  title: string;
  text(root: HTMLElement): string;
}

const STEPS: TourStep[] = [
  { target: ['.ready-shelf', '.deck-collection'], title: 'Escolha um deck',
    text: () => 'Toque num deck pronto para jogar com ele. Os decks que você montar ficam em Meus decks.' },
  { target: ['.match-setup', '.match-sidebar'], title: 'Ajuste a partida',
    text: () => 'Escolha o formato, contra quem jogar e quantos jogadores sentam à mesa.' },
  { target: ['.match-ready'], title: 'Jogar',
    text: root => root.querySelector<HTMLButtonElement>('#startMatch')?.disabled
      ? 'Aqui fica o deck escolhido. O botão Jogar acende quando houver um deck que sirva no formato.'
      : 'Aqui fica o deck escolhido. Toque em Jogar para começar a partida.' },
];
/** Distância do balão até a área destacada e da beira da tela. */
const GAP = 14, MARGIN = 12;
/** À vista na página (o `offsetParent` não serve: a barra do Jogar no celular é fixa). */
const shown = (el: HTMLElement) => el.getClientRects().length > 0;

/** O tour sobre a tela inicial `root`: não bloqueia nada, só escurece o resto e explica a área da vez. */
export function createFirstVisitTour(root: HTMLElement) {
  let step = -1, frame = 0;
  const spot = Object.assign(document.createElement('div'), { className: 'tour-spot', hidden: true });
  const balloon = Object.assign(document.createElement('section'), { className: 'tour-balloon', hidden: true, tabIndex: -1 });
  balloon.setAttribute('role', 'dialog');
  balloon.setAttribute('aria-labelledby', 'tourTitle');
  const observer = new ResizeObserver(() => schedule());
  const target = () => STEPS[step]?.target.map(s => root.querySelector<HTMLElement>(s)).find(el => el && shown(el)) ?? null;
  const schedule = () => { if (!frame && step >= 0) frame = requestAnimationFrame(place); };

  function render() {
    const s = STEPS[step]!, last = step === STEPS.length - 1;
    balloon.innerHTML = `<p class="tour-count">${step + 1} de ${STEPS.length}</p><h2 id="tourTitle">${esc(s.title)}</h2><p class="tour-text">${esc(s.text(root))}</p>`
      + `<div class="tour-actions">${last ? '' : '<button type="button" class="link-btn" data-tour="skip">Pular</button>'}<button type="button" class="arena-btn secondary" data-tour="next">${last ? 'Entendi' : 'Próximo'}</button></div>`;
  }
  /** Põe o destaque sobre a área e o balão ao lado dela (direita, esquerda, embaixo, em cima ou, sem lugar, no pé da tela). */
  function place() {
    frame = 0;
    const el = target();
    spot.hidden = balloon.hidden = !el;
    if (!el) return;
    const r = el.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = innerHeight;
    const top = Math.max(r.top, 4) - 6, bottom = Math.min(r.bottom, vh - 4) + 6, left = r.left - 6, right = r.right + 6;
    Object.assign(spot.style, { top: `${top}px`, left: `${left}px`, width: `${right - left}px`, height: `${Math.max(bottom - top, 0)}px` });
    const w = balloon.offsetWidth, h = balloon.offsetHeight;
    const clampX = (x: number) => Math.min(Math.max(x, MARGIN), vw - w - MARGIN), clampY = (y: number) => Math.min(Math.max(y, MARGIN), vh - h - MARGIN);
    const spots: [boolean, number, number][] = [
      [right + GAP + w <= vw - MARGIN, right + GAP, clampY(top)],
      [left - GAP - w >= MARGIN, left - GAP - w, clampY(top)],
      [bottom + GAP + h <= vh - MARGIN, clampX(left + (right - left - w) / 2), bottom + GAP],
      [top - GAP - h >= MARGIN, clampX(left + (right - left - w) / 2), top - GAP - h],
    ];
    const [, x, y] = spots.find(([fits]) => fits) ?? [true, clampX((vw - w) / 2), vh - h - MARGIN];
    Object.assign(balloon.style, { left: `${x}px`, top: `${y}px` });
  }
  function go(next: number) {
    if (next >= STEPS.length) { close(); return; }
    observer.disconnect();
    step = next;
    // No celular os ajustes da partida começam recolhidos numa linha: o passo 2 os abre.
    const toggle = root.querySelector<HTMLElement>('[data-lobby=setup-toggle]');
    if (step === 1 && toggle && shown(toggle) && toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
    render();
    const el = target();
    if (el) {
      observer.observe(el);
      el.scrollIntoView({ block: el.offsetHeight > innerHeight ? 'start' : 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
    const layout = root.querySelector('.play-layout');
    if (layout) observer.observe(layout);
    place();
    balloon.focus({ preventScroll: true });
  }
  function close() {
    step = -1; observer.disconnect();
    spot.hidden = balloon.hidden = true;
    removeEventListener('scroll', schedule, true); removeEventListener('resize', schedule);
  }
  balloon.addEventListener('click', e => {
    const action = (e.target as HTMLElement).closest<HTMLElement>('[data-tour]')?.dataset.tour;
    if (action === 'skip') close();
    if (action === 'next') go(step + 1);
  });
  // Escolher um deck leva ao passo 2; tocar em Jogar fecha o tour (a partida começa). Na captura, porque a tela
  // inicial redesenha os cards ao escolher: depois dela, o card tocado já saiu da página.
  root.addEventListener('click', e => {
    if (step < 0 || balloon.contains(e.target as Node)) return;
    const t = e.target as HTMLElement, at = step;
    if (t.closest('[data-lobby=start]')) { close(); return; }
    const picked = at === 0 && !!t.closest('#personalTiles [data-deck], #readyTiles [data-deck]');
    // Depois do redesenho: o passo 2, ou o texto do passo 3, que muda com o botão Jogar aceso ou apagado.
    if (picked || at === 2) requestAnimationFrame(() => { if (step !== at) return; if (picked) go(1); else { render(); place(); } });
  }, true);
  root.addEventListener('keydown', e => { if (e.key === 'Escape' && step >= 0) close(); });
  root.append(spot, balloon);
  return {
    start() {
      save(KEYS.tour, '1');
      if (step < 0) { addEventListener('scroll', schedule, { capture: true, passive: true }); addEventListener('resize', schedule); }
      go(0);
    },
  };
}
