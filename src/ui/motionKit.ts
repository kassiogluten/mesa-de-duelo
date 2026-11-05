/**
 * O que todas as famílias de animação da mesa usam: as curvas (EASE e as molas), as contas de posição e a camada de
 * efeitos com o que a limpa (animações, timers, peças soltas e cartas escondidas durante um voo).
 */
export const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
// Moer: sem a arrancada do EASE, para a virada cair no meio do voo.
export const MILL_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
/** Mola amortecida (massa 1) como curva CSS `linear()`: passa um pouco do ponto e assenta. Sem `linear()` no navegador, fica o EASE. */
export function spring(stiffness: number, damping: number) {
  const w = Math.sqrt(stiffness), z = damping / (2 * w), wd = w * Math.sqrt(1 - z * z);
  const seconds = Math.log(300) / (z * w);
  const at = (t: number) => 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + z * w / wd * Math.sin(wd * t));
  const points = Array.from({ length: 41 }, (_, i) => i === 40 ? 1 : +at(seconds * i / 40).toFixed(3));
  const supported = typeof CSS !== 'undefined' && !!CSS.supports?.('animation-timing-function', 'linear(0, 1)');
  return { easing: supported ? `linear(${points.join(', ')})` : EASE, duration: Math.round(seconds * 1000) };
}
export const LANDING = spring(380, 20);
// Rearrumar (campo, mão, carta que muda de lugar): quase sem passar do ponto. Virar: passa uns 7° e volta.
export const SETTLE = spring(300, 24);
export const TAP = spring(420, 26);

export interface Point { cx: number; cy: number; w: number; h: number }
export interface Snap extends Point { el: HTMLElement; tapped: boolean; zone: string }
/** Onde uma carta da sua mão estava: o tamanho sem o giro do leque, e o giro à parte. */
export interface HandSpot extends Point { rot: number; seen: number }

export const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
export function center(el: Element | null | undefined): Point | undefined {
  const r = el?.getBoundingClientRect();
  return r?.width ? { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height } : undefined;
}
/** O centro da mesa, onde aparece a carta sem lugar no campo (ou o que não tem de onde sair), no tamanho de uma carta. */
export function stagePoint(bounds: { left: number; top: number; width: number; height: number }): Point {
  return { cx: bounds.left + bounds.width * .5, cy: bounds.top + bounds.height * .48, w: Math.min(112, bounds.height * .17), h: Math.min(156, bounds.height * .237) };
}
/** O giro de uma carta na tela (o leque gira cada carta um pouco). */
export function turnOf(el: Element | null | undefined) {
  const transform = el ? getComputedStyle(el).transform : 'none';
  if (!transform || transform === 'none') return 0;
  const m = new DOMMatrixReadOnly(transform);
  return Math.atan2(m.b, m.a) * 180 / Math.PI;
}

/** O que a mesa lembra entre um desenho e outro: onde cada carta estava, as da mão, as que acabaram de pousar e a pilha. */
export interface MotionState {
  cards: Map<string, Snap>;
  // A mão é redesenhada antes da jogada ser apresentada: o voo sai de onde a carta foi vista por último.
  handSpots: Map<string, HandSpot>;
  // Permanentes que acabaram de pousar: a resolução da própria mágica não voa outra cópia até elas.
  landedAt: Map<string, number>;
  // A carta do topo da pilha (no canto), da última vez que estava à vista: a mágica que resolve sai dali, mesmo com a pilha já vazia.
  stackSpot?: Point & { seen: number };
  primed: boolean;
}

export type MotionKit = ReturnType<typeof createMotionKit>;

/** A camada de efeitos de uma mesa: tudo o que cria (peças, animações, timers) é desfeito por `clear`. */
export function createMotionKit(root: HTMLElement) {
  const state: MotionState = { cards: new Map(), handSpots: new Map(), landedAt: new Map(), primed: false };
  const stackPile = () => root.querySelector<HTMLElement>('#fStack:not([hidden]) .stack-pile');
  const effects = new Set<HTMLElement>();
  // Avisos de habilidade abertos, do mais antigo ao mais novo, com a carta de cada um.
  const callouts: { note: HTMLElement; card: HTMLElement }[] = [];
  const hiddenCards = new Set<HTMLElement>();
  const animations = new Set<Animation>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const layer = () => root.firstElementChild as HTMLElement ?? root;
  const later = (fn: () => void, ms: number) => {
    const timer = setTimeout(() => { timers.delete(timer); fn(); }, ms);
    timers.add(timer);
  };
  const stage = () => stagePoint(layer().getBoundingClientRect());
  /** `easing: 'linear'` deixa cada quadro com o seu próprio ritmo (golpe e projétil precisam chegar na hora do impacto). */
  function animate(el: HTMLElement, frames: Keyframe[], duration: number, easing = EASE, delay = 0) {
    if (reduced()) return;
    const animation = el.animate(frames, { duration, easing, delay, fill: delay ? 'backwards' : 'auto' });
    animations.add(animation);
    animation.onfinish = animation.oncancel = () => animations.delete(animation);
  }
  function effect(className: string, point: Point, html?: string) {
    const el = document.createElement('div');
    el.className = className;
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = `left:${point.cx}px;top:${point.cy}px;width:${point.w}px;height:${point.h}px;--fw:${point.w}px`;
    if (html) el.innerHTML = html;
    track(el);
    return el;
  }
  /** Põe uma peça na camada de efeitos: sai com as outras na limpeza. */
  function track(el: HTMLElement) {
    layer().append(el); effects.add(el);
  }
  function clear() {
    for (const animation of animations) animation.cancel();
    animations.clear();
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    for (const el of effects) el.remove();
    effects.clear();
    callouts.length = 0;
    for (const el of hiddenCards) { el.style.opacity = ''; el.style.visibility = ''; }
    hiddenCards.clear();
    root.querySelectorAll('.damage-flash,.semantic-highlight,.attack-highlight,.lethal-hit,.heal-flash,.incoming,.walker-glow,.loyalty-up,.loyalty-down,.loyalty-zero,.control-glow,.finale-win,.finale-lose').forEach(el => el.classList.remove('damage-flash', 'semantic-highlight', 'attack-highlight', 'lethal-hit', 'heal-flash', 'incoming', 'walker-glow', 'loyalty-up', 'loyalty-down', 'loyalty-zero', 'control-glow', 'finale-win', 'finale-lose'));
  }
  function remove(el: HTMLElement) {
    el.remove(); effects.delete(el);
    const i = callouts.findIndex(c => c.note === el);
    if (i >= 0) callouts.splice(i, 1);
  }
  function pulse(el: HTMLElement | null, kind: boolean | 'attack-highlight' = false) {
    if (!el) return;
    const damage = kind === true;
    const cls = kind === 'attack-highlight' ? kind : damage ? 'damage-flash' : 'semantic-highlight';
    el.classList.add(cls);
    if (damage) animate(el, [{ translate: '0 0' }, { translate: '0 3px', offset: .25 }, { translate: '0 0' }], 260);
    later(() => el.classList.remove(cls), 850);
  }
  /** A carta do topo da pilha, se esteve à vista há pouco (a pilha some quando esvazia, antes da resolução ser mostrada). */
  const recentStack = () => state.stackSpot && performance.now() - state.stackSpot.seen < 5000 ? state.stackSpot : undefined;
  function floatNumber(at: Point, text: string, classes: string, badges: string[] = [], icon = '') {
    // Perto da borda de cima (retrato do oponente), o número desce em vez de subir para fora da tela.
    const below = at.cy - at.h / 2 < 90;
    // Perto da borda do lado (zona de comando, retrato no canto), o número fica inteiro na tela.
    const width = globalThis.innerWidth || 0;
    const cx = width > 180 ? Math.max(90, Math.min(width - 90, at.cx)) : at.cx;
    const marker = effect(`damage-number ${classes}${below ? ' below' : ''}`, { ...at, cx, cy: below ? at.cy + at.h / 2 + 6 : at.cy - at.h / 2, w: 120, h: 56 }, icon);
    const value = document.createElement('b'); value.textContent = text; marker.append(value);
    if (badges.length) {
      const list = document.createElement('span'); list.className = 'damage-badges'; marker.append(list);
      for (const badge of badges) { const tag = document.createElement('span'); tag.textContent = badge; list.append(tag); }
    }
    const rise = below ? 1 : -1;
    animate(marker, [{ opacity: 0, translate: `0 ${-6 * rise}px`, scale: '.7' }, { opacity: 1, translate: `0 ${6 * rise}px`, scale: '1.12', offset: .16 }, { opacity: 1, translate: `0 ${18 * rise}px`, scale: '1', offset: .7 }, { opacity: 0, translate: `0 ${30 * rise}px` }], 1100);
    later(() => remove(marker), 1150);
  }
  /**
   * Voo com peso: a carta sai do tamanho e do giro de onde estava, sobe em arco (cresce, como se viesse para perto),
   * inclina para o lado em que vai, deita de volta ao chegar, e a sombra acompanha a altura. `end` é o tamanho da peça.
   * `endRot` é o giro de chegada (a carta no leque); `fade` some no último trecho (entrar numa pilha ou numa carta);
   * `tint` soma um filtro ao voo (a mágica anulada vai apagada).
   */
  function fly(piece: HTMLElement, from: Point & { rot?: number }, to: Point, end: Point, duration: number,
    opts: { caption?: HTMLElement; delay?: number; endRot?: number; fade?: boolean; tint?: string } = {}) {
    const { caption, delay = 0 } = opts;
    const { frames, captionFrames } = flightFrames(from, to, end, opts);
    animate(piece, frames, duration, 'linear', delay);
    if (caption) animate(caption, captionFrames, duration, 'linear', delay);
  }
  /** Uma carta caindo numa pilha (cemitério, exílio, grimório): a pilha a recebe com um pulso de mola. */
  function absorb(pile: HTMLElement | null) {
    if (pile) animate(pile, [{ scale: '1.12' }, { scale: '1' }], LANDING.duration, LANDING.easing);
  }
  /** Pouso: a carta bate na mesa, passa um pouco do ponto e assenta (mola), com uma onda curta em volta. */
  function land(el: HTMLElement, withRipple = true) {
    animate(el, [{ scale: '1.1', translate: '0 -6px' }, { scale: '1', translate: '0 0' }], LANDING.duration, LANDING.easing);
    if (withRipple) ripple(center(el));
  }
  /** A onda dourada do pouso, em volta de uma carta ou de um monte. */
  function ripple(at: Point | undefined) {
    if (!at || reduced()) return;
    const ring = effect('land-ripple', { ...at, w: at.w * 1.04, h: at.h * 1.04 });
    animate(ring, [{ opacity: .85, scale: '.92' }, { opacity: 0, scale: '1.3' }], 460, 'cubic-bezier(.2,.7,.3,1)');
    later(() => remove(ring), 480);
  }
  /** Destruída: a carta racha e solta fragmentos no lugar em que estava. */
  function shatter(at: Point) {
    const crack = effect('shatter-flash', { ...at, w: at.w * 1.1, h: at.h * 1.1 });
    animate(crack, [{ opacity: .9, scale: '.9' }, { opacity: 0, scale: '1.2' }], 360);
    later(() => remove(crack), 380);
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2 + (i % 2 ? .3 : -.2), reach = 34 + (i * 17) % 30;
      const shard = effect('shatter-shard', { cx: at.cx + Math.cos(angle) * at.w * .18, cy: at.cy + Math.sin(angle) * at.h * .18, w: 8 + (i * 5) % 9, h: 10 + (i * 7) % 12 });
      animate(shard, [{ translate: '0 0', rotate: '0deg', opacity: 1 }, { translate: `${Math.cos(angle) * reach}px ${Math.sin(angle) * reach + 26}px`, rotate: `${(i % 2 ? 1 : -1) * (90 + i * 20)}deg`, opacity: 0 }], 520, 'cubic-bezier(.2,.6,.4,1)');
      later(() => remove(shard), 540);
    }
  }
  /** Dobra: um rasgo no espaço (anel girando em violeta e ciano) que se abre e se fecha sobre a carta. */
  function warpRift(at: Point | undefined, size: number) {
    if (!at || reduced()) return;
    const w = Math.min(Math.max(at.w, 60), 150) * 1.45 * size;
    const rift = effect('warp-rift', { ...at, w, h: w });
    animate(rift, [{ opacity: 0, scale: '.3', rotate: '0deg' }, { opacity: 1, scale: '1', rotate: '140deg', offset: .35 }, { opacity: .8, scale: '1.08', rotate: '260deg', offset: .7 }, { opacity: 0, scale: '.2', rotate: '420deg' }], 900, 'cubic-bezier(.3,.6,.3,1)');
    later(() => remove(rift), 920);
  }
  return {
    root, state, layer, later, stage, stackPile, recentStack, callouts, hiddenCards,
    animate, effect, track, clear, remove, pulse, floatNumber, fly, absorb, land, ripple, shatter, warpRift,
  };
}

/** Os quadros do voo de `fly` (e os da legenda, que fica sempre no tamanho de leitura). */
export function flightFrames(from: Point & { rot?: number }, to: Point, end: Point, opts: { endRot?: number; fade?: boolean; tint?: string } = {}) {
  const { endRot = 0, fade = false, tint = '' } = opts;
  const dx = from.cx - to.cx, dy = from.cy - to.cy, dist = Math.hypot(dx, dy) || 1;
  // Num caminho de lado, o arco sobe acima da linha reta; num caminho para cima, a altura fica por conta do tamanho.
  const bulge = Math.min(140, dist * .3) * (Math.abs(dx) / dist) + 16;
  const control = { x: dx * .5, y: dy * .5 - bulge };
  const s0 = Math.max(.4, Math.min(3, from.w / Math.max(1, end.w)));
  const lean = Math.max(-12, Math.min(12, -dx / 30));
  const r = (n: number, digits = 1) => +n.toFixed(digits);
  const frames: Keyframe[] = [], captionFrames: Keyframe[] = [];
  for (let i = 0, n = 20; i <= n; i++) {
    const u = i / n, t = (1 - Math.cos(Math.PI * u)) / 2, high = Math.sin(Math.PI * t), back = 1 - t;
    const x = back * back * dx + 2 * back * t * control.x, y = back * back * dy + 2 * back * t * control.y;
    const scale = (s0 + (1 - s0) * t) * (1 + .22 * high);
    // A legenda vai junto, mas sempre no tamanho de leitura.
    captionFrames.push({ offset: u, scale: String(r(1 / scale, 3)) });
    frames.push({
      offset: u,
      translate: `${r(x)}px ${r(y)}px`,
      scale: String(r(scale, 3)),
      rotate: `${r((from.rot ?? 0) * back * back + endRot * t * t + lean * high, 2)}deg`,
      transform: `translate(-50%, -50%) perspective(900px) rotateX(${r(18 * high)}deg)`,
      filter: `drop-shadow(0 ${r(6 + 26 * high)}px ${r(8 + 18 * high)}px rgb(0 0 0 / ${r(.5 - .2 * high, 2)}))${tint ? ` ${tint}` : ''}`,
      opacity: !i ? .9 : fade && u > .7 ? r(1 - (u - .7) / .3 * .9, 2) : 1,
    });
  }
  return { frames, captionFrames };
}
