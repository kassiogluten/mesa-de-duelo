import { entryTiming, millTiming, type PresentationEvent } from './presentationTimeline';
import { damageLook, type DamageLook } from './damageEffects';
import { loyaltyLook, walkerArrives, walkerTone, type LoyaltyLook } from './planeswalkerEffects';

const KEYED = '[data-fid],[data-peek]';
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
// Moer: sem a arrancada do EASE, para a virada cair no meio do voo.
const MILL_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
/** Mola amortecida (massa 1) como curva CSS `linear()`: passa um pouco do ponto e assenta. Sem `linear()` no navegador, fica o EASE. */
function spring(stiffness: number, damping: number) {
  const w = Math.sqrt(stiffness), z = damping / (2 * w), wd = w * Math.sqrt(1 - z * z);
  const seconds = Math.log(300) / (z * w);
  const at = (t: number) => 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + z * w / wd * Math.sin(wd * t));
  const points = Array.from({ length: 41 }, (_, i) => i === 40 ? 1 : +at(seconds * i / 40).toFixed(3));
  const supported = typeof CSS !== 'undefined' && !!CSS.supports?.('animation-timing-function', 'linear(0, 1)');
  return { easing: supported ? `linear(${points.join(', ')})` : EASE, duration: Math.round(seconds * 1000) };
}
const LANDING = spring(380, 20);
// Rearrumar (campo, mão, carta que muda de lugar): quase sem passar do ponto. Virar: passa uns 7° e volta.
const SETTLE = spring(300, 24);
const TAP = spring(420, 26);
interface Point { cx: number; cy: number; w: number; h: number }
interface Snap extends Point { el: HTMLElement; tapped: boolean; zone: string }
/** Onde uma carta da sua mão estava: o tamanho sem o giro do leque, e o giro à parte. */
interface HandSpot extends Point { rot: number; seen: number }
export interface Motion {
  capture(): void;
  /** `paying`: a cor da mana de cada terreno, enquanto você paga um custo (o terreno que vira solta a mana até o custo). */
  play(options?: { silent?: boolean; semantic?: boolean; paying?: (id: number) => string | undefined }): void;
  present(event: PresentationEvent, options: { you: number; html?: string; label: string; duration: number; calloutDuration?: number; hideDestination?: boolean }): void;
  /** Compra: versos de carta saem do grimório e vão para a mão. `cards` são as cartas novas da sua mão, mostradas ao chegar. */
  drew(actor: number, count: number, options: { you: number; cards: HTMLElement[]; fast: boolean; searched?: boolean }): number[];
  /** Sem passo próprio, junto com a jogada: embaralhar (o grimório se mexe) e marcadores (a carta cresce e o número sobe). */
  quick(event: PresentationEvent, options: { you: number }): void;
  /** Permanentes que mudaram de face no campo (transformar, dia e noite): giram no lugar e mostram a face nova. */
  transformed(ids: number[]): void;
  /** Mão inicial: as cartas saem do grimório uma a uma; num mulligan, a mão anterior volta antes e o grimório embaralha. */
  deal(cards: HTMLElement[], options: { returning: number }): void;
  /** Cartas reveladas numa janela: entram de costas e viram de face, uma depois da outra. */
  revealIn(cards: HTMLElement[]): void;
  /** Fim da partida: o retrato de quem perdeu racha e escurece, o de quem ganhou acende. Devolve quanto dura (0 sem movimento). */
  finale(winners: number[], losers: number[]): number;
  /** Moer: as cartas saem do topo do grimório, viram de face para cima e caem no cemitério, uma depois da outra. */
  milled(event: PresentationEvent, options: { you: number; fast: boolean; face: (card: NonNullable<PresentationEvent['card']>) => string }): void;
  /** Várias permanentes da mesma resolução (fichas, blink em massa): chegam em cascata curta, e cada monte mostra quantas ganhou ("+8"). */
  entered(event: PresentationEvent, options: { you: number; fast: boolean; face: (card: NonNullable<PresentationEvent['card']>) => string; hideDestination?: boolean }): void;
  cancelPresentation(): void;
  reset(): void;
}
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
function center(el: Element | null | undefined): Point | undefined {
  const r = el?.getBoundingClientRect();
  return r?.width ? { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height } : undefined;
}

/** O texto da habilidade sem o nome da carta na frente ("Jace Beleren - +2: Each player draws a card." → "+2: Each…"). */
function abilityText(event: PresentationEvent) {
  const text = (event.text ?? '').trim();
  const name = event.card?.name;
  return name && text.startsWith(`${name} - `) ? text.slice(name.length + 3) : text;
}

/** Spatial presentation is separate from the board state and can never capture pointer input. */
export function createMotion(root: HTMLElement): Motion {
  let cards = new Map<string, Snap>();
  // A mão é redesenhada antes da jogada ser apresentada: o voo sai de onde a carta foi vista por último.
  const handSpots = new Map<string, HandSpot>();
  // Permanentes que acabaram de pousar: a resolução da própria mágica não voa outra cópia até elas.
  const landedAt = new Map<string, number>();
  // A carta do topo da pilha (no canto), da última vez que estava à vista: a mágica que resolve sai dali, mesmo com a pilha já vazia.
  let stackSpot: (Point & { seen: number }) | undefined;
  const stackPile = () => root.querySelector<HTMLElement>('#fStack:not([hidden]) .stack-pile');
  let primed = false;
  const effects = new Set<HTMLElement>();
  // Avisos de habilidade abertos, do mais antigo ao mais novo, com a carta de cada um.
  const callouts: { note: HTMLElement; card: HTMLElement }[] = [];
  const MAX_CALLOUTS = 3;
  const hiddenCards = new Set<HTMLElement>();
  const animations = new Set<Animation>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const layer = () => root.firstElementChild as HTMLElement ?? root;
  const later = (fn: () => void, ms: number) => {
    const timer = setTimeout(() => { timers.delete(timer); fn(); }, ms);
    timers.add(timer);
  };
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
    layer().append(el); effects.add(el);
    return el;
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
  const SKULL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a8 8 0 0 0-8 8c0 2.6 1.2 4.4 3 5.6V19a1 1 0 0 0 1 1h1v-2h2v2h2v-2h2v2h1a1 1 0 0 0 1-1v-3.4c1.8-1.2 3-3 3-5.6a8 8 0 0 0-8-8zm-3.5 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg>';
  function damageTarget(event: PresentationEvent) {
    const player = event.targets?.players?.[0];
    if (player !== undefined) {
      const el = root.querySelector<HTMLElement>(`.avatar[data-pid="${player}"]`);
      return { el, at: center(el?.querySelector('.life') ?? el), player };
    }
    const card = event.targets?.cards?.[0];
    const el = card === undefined ? null : root.querySelector<HTMLElement>(`.field [data-fid="${card}"]`);
    return { el, at: center(el), player: undefined };
  }
  /** De onde sai o golpe: a carta no campo, a pilha (mágica resolvendo) ou o centro da mesa. */
  function damageSource(event: PresentationEvent) {
    const id = event.sourceId ?? event.card?.id;
    const el = id === undefined ? null : root.querySelector<HTMLElement>(`.field [data-fid="${id}"]`);
    const at = center(el);
    if (el && at) return { el, at };
    const bounds = layer().getBoundingClientRect();
    return { el: null, at: center(root.querySelector('#fStack .stack-pile')) ?? recentStack() ?? { cx: bounds.left + bounds.width * .5, cy: bounds.top + bounds.height * .48, w: 0, h: 0 } };
  }
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
  function impact(event: PresentationEvent, look: DamageLook, target: ReturnType<typeof damageTarget>) {
    const at = target.at!;
    pulse(target.el, look.tone !== 'shield');
    const size = Math.max(64, Math.min(150, (target.player === undefined ? at.w : 90) * (look.heavy ? 1.5 : 1.15)));
    const burst = effect(`damage-impact ${look.tone}${look.heavy ? ' heavy' : ''}`, { ...at, w: size, h: size });
    animate(burst, [{ opacity: .95, scale: '.3' }, { opacity: .8, scale: '1', offset: .45 }, { opacity: 0, scale: '1.35' }], 520);
    later(() => remove(burst), 560);
    floatNumber(at, look.amount, `${look.tone}${look.heavy ? ' heavy' : ''}${look.lethal ? ' lethal' : ''}`, look.badges, look.deathtouch ? SKULL : '');
    const card = target.player === undefined ? target.el : null;
    if (look.lethal && card) {
      // Golpe letal: a carta treme e escurece; a ida para o cemitério vem no evento seguinte.
      card.classList.add('lethal-hit');
      animate(card, [{ translate: '0 0' }, { translate: '-4px 0', offset: .2 }, { translate: '4px 0', offset: .4 }, { translate: '-3px 0', offset: .6 }, { translate: '0 0' }], 380);
      later(() => card.classList.remove('lethal-hit'), 1100);
    }
    if (event.commander && target.player !== undefined) pulse(root.querySelector<HTMLElement>(`[data-zone="damage"][data-gy="${target.player}"]`));
    const arena = look.heavy ? root.querySelector<HTMLElement>('.arena') : null;
    if (arena) animate(arena, [{ translate: '0 0' }, { translate: '-5px 2px', offset: .2 }, { translate: '4px -2px', offset: .45 }, { translate: '-2px 1px', offset: .7 }, { translate: '0 0' }], 320);
  }
  /**
   * Dano: golpe do atacante até o alvo (combate), projétil com rastro da fonte até o alvo (mágica ou habilidade) ou
   * dor no próprio retrato. Com "reduzir movimento", só o número e o destaque no alvo.
   */
  function damage(event: PresentationEvent, duration: number, html?: string) {
    const target = damageTarget(event);
    if (!target.at) return;
    const look = damageLook(event);
    const source = damageSource(event);
    const from = source.at, to = target.at;
    const dx = to.cx - from.cx, dy = to.cy - from.cy;
    if (reduced() || look.motion === 'self' || Math.hypot(dx, dy) < 8) { impact(event, look, target); return; }
    if (look.motion === 'strike' && source.el && html) {
      // Luta: as duas avançam juntas uma contra a outra e se chocam no meio, em vez de chegar até o alvo.
      // O atacante avança quase até o alvo e volta; o impacto acontece no ponto mais à frente. Uma cópia faz o
      // trajeto porque as fileiras do campo cortam o que sai delas; a carta de verdade some enquanto isso.
      const tapped = !!source.el.closest('.tapped');
      const ghost = effect('presentation-piece strike-ghost', { ...from, w: tapped ? from.h : from.w, h: tapped ? from.w : from.h }, html);
      const turn = tapped ? '90deg' : '0deg';
      const reach = event.fight ? .42 : Math.max(0, 1 - (Math.min(to.w, to.h) * .55 + Math.min(from.w, from.h) * .4) / Math.hypot(dx, dy));
      const travel = Math.round(duration * .9);
      source.el.style.opacity = '0'; hiddenCards.add(source.el);
      animate(ghost, [
        { translate: '0 0', scale: '1', rotate: turn, easing: 'ease-out' },
        { translate: `${-dx * .06}px ${-dy * .06}px`, scale: '1.05', rotate: turn, offset: .18, easing: 'cubic-bezier(.55, 0, .9, .45)' },
        { translate: `${dx * reach}px ${dy * reach}px`, scale: '1.08', rotate: turn, offset: .45, easing: 'cubic-bezier(.2, .8, .2, 1)' },
        { translate: '0 0', scale: '1', rotate: turn }], travel, 'linear');
      later(() => impact(event, look, target), travel * .45);
      later(() => { remove(ghost); if (source.el && hiddenCards.delete(source.el)) source.el.style.opacity = ''; }, travel);
      return;
    }
    const travel = Math.round(duration * .55);
    const bolt = effect(`damage-bolt ${look.tone}`, { ...from, w: 22, h: 22 });
    bolt.style.cssText += `;--angle:${Math.atan2(dy, dx)}rad`;
    animate(bolt, [{ translate: '0 0', scale: '.6', opacity: .6 }, { translate: `${dx * .4}px ${dy * .4}px`, scale: '1.1', opacity: 1, offset: .5 }, { translate: `${dx}px ${dy}px`, scale: '1', opacity: 1 }], travel, 'cubic-bezier(.45, 0, .85, .55)');
    if (source.el) pulse(source.el);
    later(() => { remove(bolt); impact(event, look, target); }, travel);
  }
  /** Ganho de vida (vínculo com a vida ou qualquer outro): "+N" verde subindo do retrato. */
  function heal(event: PresentationEvent) {
    const avatar = event.actor === undefined ? null : root.querySelector<HTMLElement>(`.avatar[data-pid="${event.actor}"]`);
    const at = center(avatar?.querySelector('.life') ?? avatar);
    if (!avatar || !at || !event.delta || event.delta <= 0) return;
    avatar.classList.add('heal-flash');
    later(() => avatar.classList.remove('heal-flash'), 850);
    floatNumber(at, `+${event.delta}`, 'heal');
  }

  /** Brilho na cor do planeswalker em volta da carta; com "reduzir movimento", só a moldura acesa por um instante. */
  function walkerGlow(card: HTMLElement, tone: string, ms: number) {
    card.style.setProperty('--walker', tone);
    card.classList.add('walker-glow');
    later(() => card.classList.remove('walker-glow'), ms);
  }
  /**
   * Planeswalker chegando: a moldura acende na cor dele, um anel de luz se abre por trás da carta e o escudo de
   * lealdade surge com o valor inicial.
   */
  function walkerArrive(card: HTMLElement, event: PresentationEvent) {
    const tone = walkerTone(event.card);
    walkerGlow(card, tone, 1100);
    const at = center(card);
    if (!at || reduced()) return;
    const size = Math.max(at.w, at.h) * 1.5;
    const ring = effect('walker-ring', { ...at, w: size, h: size });
    ring.style.setProperty('--walker', tone);
    animate(ring, [{ opacity: 0, scale: '.45' }, { opacity: .95, scale: '.9', offset: .35 }, { opacity: 0, scale: '1.35' }], 760, 'ease-out');
    later(() => remove(ring), 800);
    animate(card, [{ filter: `brightness(1.6) drop-shadow(0 0 14px ${tone})` }, { filter: `brightness(1.1) drop-shadow(0 0 8px ${tone})`, offset: .5 }, { filter: 'none' }], 900, 'ease-out');
    const badge = card.querySelector<HTMLElement>(':scope > .pt.loyalty');
    if (badge) animate(badge, [{ opacity: 0, scale: '.2' }, { opacity: 1, scale: '1.45', offset: .55 }, { scale: '.95', offset: .8 }, { opacity: 1, scale: '1' }], 520, 'cubic-bezier(.3,.7,.4,1)', 240);
  }
  /**
   * Habilidade de lealdade: o escudo pula (sobe verde no +, desce vermelho no −), o custo flutua acima dele e o ultimate
   * solta uma onda de luz pela mesa. Com "reduzir movimento", só o número e a cor no escudo.
   */
  function loyaltyAbility(look: LoyaltyLook, card: HTMLElement, event: PresentationEvent) {
    const badge = card.querySelector<HTMLElement>(':scope > .pt.loyalty');
    // O número sobe do topo da carta, como o do dano: no escudo (embaixo) ele cobriria o texto e o aviso ao lado.
    const at = center(card);
    const tone = walkerTone(event.card);
    walkerGlow(card, tone, look.ultimate ? 1600 : 900);
    if (badge) {
      const cls = `loyalty-${look.tone}`;
      badge.classList.add(cls);
      later(() => badge.classList.remove(cls), 1000);
      const lift = look.tone === 'up' ? '-5px' : look.tone === 'down' ? '4px' : '0';
      animate(badge, [{ scale: '1', translate: '0 0' }, { scale: '1.5', translate: `0 ${lift}`, offset: .35 }, { scale: '.94', translate: '0 0', offset: .7 }, { scale: '1', translate: '0 0' }], 520, 'cubic-bezier(.3,.7,.4,1)');
    }
    if (at && look.cost) floatNumber(at, look.cost, `loyalty-cost ${look.tone}${look.ultimate ? ' heavy' : ''}`, look.ultimate ? ['Ultimate'] : []);
    if (!look.ultimate) return;
    const from = center(card);
    if (!from || reduced()) return;
    const bounds = layer().getBoundingClientRect();
    const size = Math.max(bounds.width, bounds.height) * .9;
    const wave = effect('walker-wave', { ...from, w: size, h: size });
    wave.style.setProperty('--walker', tone);
    animate(wave, [{ opacity: .9, scale: '.05' }, { opacity: .55, scale: '.6', offset: .5 }, { opacity: 0, scale: '1.1' }], 1100, 'cubic-bezier(.2,.6,.3,1)');
    later(() => remove(wave), 1150);
    const arena = root.querySelector<HTMLElement>('.arena');
    if (arena) animate(arena, [{ translate: '0 0' }, { translate: '-3px 1px', offset: .25 }, { translate: '3px -1px', offset: .5 }, { translate: '0 0' }], 300, 'linear', 120);
  }

  /**
   * Habilidade (gatilho ou ativada) não move a carta: com a fonte no campo, ela brilha e ganha um aviso ao lado;
   * fora do campo, a carta aparece parada no centro. Uma cópia voando parecia a criatura saindo do campo.
   */
  function ability(event: PresentationEvent, card: HTMLElement | null, options: { label: string; html?: string; duration: number; calloutDuration?: number }) {
    const rect = card?.getBoundingClientRect();
    const look = loyaltyLook(event);
    if (card && rect?.width) {
      pulse(card);
      if (look) loyaltyAbility(look, card, event);
      // Habilidade ativada: a carta se ergue um pouco da mesa enquanto a habilidade sai dela, e assenta de novo.
      else if (!event.trigger) animate(card, [
        { translate: '0 0', scale: '1', filter: 'none' },
        { translate: '0 -9px', scale: '1.05', filter: 'drop-shadow(0 14px 12px rgb(0 0 0 / .45))', offset: .28 },
        { translate: '0 -9px', scale: '1.05', filter: 'drop-shadow(0 14px 12px rgb(0 0 0 / .45))', offset: .72 },
        { translate: '0 0', scale: '1', filter: 'none' }], Math.max(600, options.duration), 'cubic-bezier(.3,.7,.4,1)');
      // Um aviso por carta, e poucos de uma vez: vários gatilhos seguidos não viram uma pilha de balões.
      for (const old of callouts.filter(c => c.card === card)) remove(old.note);
      while (callouts.length >= MAX_CALLOUTS) remove(callouts[0].note);
      const hold = Math.max(options.duration, options.calloutDuration ?? 0);
      const note = document.createElement('div');
      note.className = `ability-callout${event.trigger ? ' trigger' : ''}${look ? ` loyalty ${look.tone}` : ''}${look?.ultimate ? ' ultimate' : ''}`;
      note.setAttribute('aria-hidden', 'true');
      // Raio para gatilho, engrenagem para habilidade ativada, o escudo com o custo na de lealdade; o texto diz qual é.
      if (look) {
        const chip = document.createElement('b'); chip.className = 'loyalty-chip'; chip.textContent = look.cost || '0';
        note.append(chip);
      } else note.innerHTML = event.trigger
        ? '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.4 5-.1-3 2-1.6-2-3.4-2.4 1a8 8 0 0 0-2.6-1.5L15 2.5h-4l-.4 2.5A8 8 0 0 0 8 6.5l-2.4-1-2 3.4 2 1.6-.1 3-2 1.6 2 3.4 2.4-1A8 8 0 0 0 10.6 19l.4 2.5h4l.4-2.5a8 8 0 0 0 2.6-1.5l2.4 1 2-3.4z"/></svg>';
      const text = document.createElement('span'); text.textContent = options.label;
      const detail = look ? abilityText(event) : '';
      if (detail) { const small = document.createElement('small'); small.textContent = detail; text.append(small); }
      note.append(text);
      layer().append(note); effects.add(note); callouts.push({ note, card });
      // Ao lado da carta, do lado que tiver espaço; sem sair da tela.
      const width = note.offsetWidth, height = note.offsetHeight;
      const right = rect.right + 10 + width <= innerWidth - 8;
      note.style.left = `${right ? rect.right + 10 : Math.max(8, rect.left - 10 - width)}px`;
      note.style.top = `${Math.min(innerHeight - height - 8, Math.max(8, rect.top + rect.height / 2 - height / 2))}px`;
      note.classList.add(right ? 'right' : 'left');
      if (!reduced()) animate(note, [{ opacity: 0, translate: right ? '-6px 0' : '6px 0' }, { opacity: 1, translate: '0 0', offset: .18 }, { opacity: 1, offset: .82 }, { opacity: 0 }], hold);
      later(() => remove(note), hold);
      beams(event, card);
      return;
    }
    if (!options.html) return;
    const bounds = layer().getBoundingClientRect();
    const stage: Point = { cx: bounds.left + bounds.width * .5, cy: bounds.top + bounds.height * .48, w: Math.min(112, bounds.height * .17), h: Math.min(156, bounds.height * .237) };
    const piece = effect('presentation-piece', stage, options.html);
    const caption = document.createElement('span');
    caption.className = 'presentation-caption'; caption.textContent = options.label; piece.append(caption);
    if (!reduced()) animate(piece, [{ opacity: 0, scale: '.96' }, { opacity: 1, scale: '1', offset: .2 }, { opacity: 1, offset: .82 }, { opacity: 0 }], options.duration);
    later(() => remove(piece), options.duration);
  }

  /** Feixe da carta de origem até cada alvo do gatilho ou da habilidade; com "reduzir movimento", só o destaque no alvo. */
  function beams(event: PresentationEvent, card: HTMLElement) {
    const from = center(card);
    if (!from) return;
    const targets = [...(event.targets?.cards ?? []).map(id => root.querySelector<HTMLElement>(`.field [data-fid="${id}"]`)),
      ...(event.targets?.players ?? []).map(id => root.querySelector<HTMLElement>(`.avatar[data-pid="${id}"]`))].filter((el): el is HTMLElement => !!el && el !== card);
    targets.forEach((el, i) => {
      const to = center(el);
      if (!to) return;
      const dx = to.cx - from.cx, dy = to.cy - from.cy, length = Math.hypot(dx, dy);
      later(() => pulse(el), 260 + i * 60);
      if (reduced() || length < 8) return;
      const beam = effect(`ability-beam${event.trigger ? ' trigger' : ''}`, { cx: from.cx, cy: from.cy, w: length, h: 4 });
      beam.style.cssText += `;--angle:${Math.atan2(dy, dx)}rad`;
      animate(beam, [{ scale: '0 1', opacity: .9 }, { scale: '1 1', opacity: 1, offset: .45 }, { scale: '1 1', opacity: 0 }], 700, 'ease-out', i * 60);
      later(() => remove(beam), 760 + i * 60);
    });
  }
  /** Para onde a carta vai ao sair do campo: cemitério, exílio, grimório ou mão. */
  function destination(event: PresentationEvent, mine: boolean, seat: Element | null, hand: Point, stage: Point) {
    const piles = (selector: string) => center(seat?.querySelector(`.piles ${selector}`)) ?? center(root.querySelector(`${mine ? '#fMePiles' : '#fOppPiles'} ${selector}`));
    if (event.to === 'Hand') return hand;
    if (event.to === 'Command') return center(commandOf(event, mine, seat)) ?? stage;
    if (event.to === 'Exile') return piles('.exile') ?? piles('.gy') ?? stage;
    if (event.to === 'Library') return piles('.lib') ?? stage;
    return piles('.gy') ?? stage;
  }
  /** O monte de destino em si (para recebê-la com um pulso); na mão não há monte. */
  function pileOf(event: PresentationEvent, mine: boolean, seat: Element | null) {
    const pile = (selector: string) => seat?.querySelector<HTMLElement>(`.piles ${selector}`) ?? root.querySelector<HTMLElement>(`${mine ? '#fMePiles' : '#fOppPiles'} ${selector}`);
    if (event.to === 'Hand') return null;
    if (event.to === 'Command') return commandOf(event, mine, seat);
    if (event.to === 'Exile') return pile('.exile') ?? pile('.gy');
    if (event.to === 'Library') return pile('.lib');
    return pile('.gy');
  }
  /** A carta na zona de comando (o comandante que volta, ou de onde ele é conjurado), ou a zona inteira. */
  function commandOf(event: PresentationEvent, mine: boolean, seat: Element | null) {
    const id = event.card?.id ?? event.sourceId;
    return (id === undefined ? null : root.querySelector<HTMLElement>(`[data-command-card][data-fid="${id}"]`))
      ?? seat?.querySelector<HTMLElement>('.seat-command')
      ?? root.querySelector<HTMLElement>(mine ? '#fCommand:not([hidden])' : '#fOppPiles .duel-command')
      ?? root.querySelector<HTMLElement>(mine ? '#fMeAvatar' : '#fOppAvatar');
  }
  /** De que monte sai uma carta que não estava na mão: cemitério, exílio, grimório ou zona de comando. */
  function zonePoint(zone: string | undefined, event: PresentationEvent, mine: boolean, seat: Element | null, hand: Point, stage: Point) {
    if (!zone || !['Graveyard', 'Exile', 'Library', 'Command'].includes(zone)) return undefined;
    return destination({ ...event, to: zone }, mine, seat, hand, stage);
  }
  /** O brilho de quem vem de um monte especial: roxo do cemitério, branco do exílio, dourado da zona de comando. */
  function zoneGlow(zone: string | undefined) {
    return zone === 'Graveyard' ? 'drop-shadow(0 0 12px #a46bff)' : zone === 'Exile' ? 'drop-shadow(0 0 12px #fff)' : zone === 'Command' ? 'drop-shadow(0 0 12px #f2b54c)' : '';
  }
  /** Reanimar: um anel roxo sobe da carta que voltou do cemitério, e ela brilha por um instante. */
  function reanimate(card: HTMLElement) {
    const at = center(card);
    if (!at || reduced()) return;
    const ring = effect('reanimate-ring', { ...at, w: at.w * 1.35, h: at.h * 1.2 });
    animate(ring, [{ opacity: 0, scale: '.6', translate: '0 10px' }, { opacity: .95, scale: '1', translate: '0 0', offset: .4 }, { opacity: 0, scale: '1.25', translate: '0 -14px' }], 820, 'ease-out');
    later(() => remove(ring), 860);
    animate(card, [{ filter: 'brightness(1.5) drop-shadow(0 0 14px #a46bff)' }, { filter: 'none' }], 900, 'ease-out');
  }
  /** A carta do topo da pilha, se esteve à vista há pouco (a pilha some quando esvazia, antes da resolução ser mostrada). */
  const recentStack = () => stackSpot && performance.now() - stackSpot.seen < 5000 ? stackSpot : undefined;
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
  /**
   * Saída do campo com um movimento por motivo: destruída racha antes de cair no cemitério, sacrificada vai escurecida,
   * exilada se desfaz em luz, devolvida voa em arco até o lugar dela no leque. Morrer por dano e o resto voam em arco
   * para o monte certo, que pulsa ao recebê-la.
   */
  function leave(event: PresentationEvent, from: Point, to: Point, end: Point, piece: HTMLElement, duration: number,
    opts: { caption?: HTMLElement; into?: HTMLElement | null; endRot?: number; fade?: boolean } = {}) {
    const { caption, into = null, endRot = 0, fade = true } = opts;
    if (event.to !== 'Exile') {
      if (event.reason === 'destroyed') shatter(from);
      const tint = event.reason === 'destroyed' ? 'brightness(.7) grayscale(.6)' : event.reason === 'sacrificed' ? 'brightness(.55) sepia(.4)' : '';
      fly(piece, from, to, end, duration, { caption, endRot, fade, tint });
      if (into) later(() => absorb(into), duration * .85);
    } else {
      // Some no lugar, em luz; não precisa atravessar a mesa até a pilha do exílio.
      piece.style.left = `${from.cx}px`; piece.style.top = `${from.cy}px`;
      const ring = effect('exile-ring', { ...from, w: end.w * 1.3, h: end.w * 1.3 });
      animate(ring, [{ opacity: 0, scale: '.5' }, { opacity: .9, scale: '1', offset: .4 }, { opacity: 0, scale: '1.3' }], duration);
      later(() => remove(ring), duration);
      animate(piece, [{ opacity: 1, scale: '1', filter: 'brightness(1)' }, { opacity: .9, scale: '1.04', filter: 'brightness(2.2) saturate(.3)', offset: .45 }, { opacity: 0, scale: '1.1', filter: 'brightness(3) blur(3px)' }], duration);
    }
  }
  /**
   * Voo com peso: a carta sai do tamanho e do giro de onde estava, sobe em arco (cresce, como se viesse para perto),
   * inclina para o lado em que vai, deita de volta ao chegar, e a sombra acompanha a altura. `end` é o tamanho da peça.
   * `endRot` é o giro de chegada (a carta no leque); `fade` some no último trecho (entrar numa pilha ou numa carta);
   * `tint` soma um filtro ao voo (a mágica anulada vai apagada).
   */
  function fly(piece: HTMLElement, from: Point & { rot?: number }, to: Point, end: Point, duration: number,
    opts: { caption?: HTMLElement; delay?: number; endRot?: number; fade?: boolean; tint?: string } = {}) {
    const { caption, delay = 0, endRot = 0, fade = false, tint = '' } = opts;
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
    animate(piece, frames, duration, 'linear', delay);
    if (caption) animate(caption, captionFrames, duration, 'linear', delay);
  }
  /** O giro de uma carta na tela (o leque gira cada carta um pouco). */
  function turnOf(el: Element | null | undefined) {
    const transform = el ? getComputedStyle(el).transform : 'none';
    if (!transform || transform === 'none') return 0;
    const m = new DOMMatrixReadOnly(transform);
    return Math.atan2(m.b, m.a) * 180 / Math.PI;
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

  /** O grimório de um jogador (o seu, o do oponente no duelo, ou o do assento no Commander). */
  function libraryOf(actor: number | undefined, you: number) {
    const mine = actor === you;
    const seat = mine || actor === undefined ? null : root.querySelector(`[data-seat-player="${actor}"]`);
    return seat?.querySelector<HTMLElement>('.piles .lib') ?? root.querySelector<HTMLElement>(`${mine ? '#fMePiles' : '#fOppPiles'} .lib`);
  }
  /** Um rótulo curto junto a um monte (acima dele, ou abaixo se o monte está no alto da tela). */
  function pileTag(at: Point, text: string, className: string, ms: number) {
    const below = at.cy - at.h / 2 < 90;
    const tag = effect(`mill-count ${className}${below ? ' below' : ''}`, { ...at, cy: below ? at.cy + at.h / 2 + 4 : at.cy - at.h / 2 - 4, w: 0, h: 0 });
    tag.textContent = text;
    animate(tag, [{ opacity: 0, scale: '.7' }, { opacity: 1, scale: '1.15', offset: .12 }, { opacity: 1, scale: '1', offset: .75 }, { opacity: 0 }], ms);
    later(() => remove(tag), ms);
  }
  /** Embaralhar: o grimório balança e duas metades se abrem para os lados e voltam, como num embaralhar de mesa. */
  function shuffle(libEl: HTMLElement | null) {
    const lib = center(libEl);
    if (!libEl || !lib || reduced()) return;
    animate(libEl, [{ rotate: '0deg' }, { rotate: '-5deg', offset: .2 }, { rotate: '4deg', offset: .45 }, { rotate: '-2deg', offset: .7 }, { rotate: '0deg' }], 460, 'ease-in-out');
    for (const side of [-1, 1]) {
      const half = effect('presentation-piece shuffle-ghost', lib, '<div class="back"></div>');
      animate(half, [{ translate: '0 0', rotate: '0deg' }, { translate: `${side * lib.w * .55}px -4px`, rotate: `${side * 8}deg`, offset: .4 }, { translate: `${side * lib.w * .2}px -2px`, rotate: `${side * -4}deg`, offset: .7 }, { translate: '0 0', rotate: '0deg' }], 480, 'cubic-bezier(.4,0,.2,1)');
      later(() => remove(half), 500);
    }
  }
  /** Bloqueio: cada bloqueador desliza um pouco na direção do atacante que bloqueou e volta, com a ligação acesa entre os dois. */
  function blocks(event: PresentationEvent) {
    let order = 0;
    const blocked = new Set<string>();
    for (const { attacker, blockers } of event.frame?.combat ?? []) {
      const a = center(root.querySelector(`.field [data-fid="${attacker}"]`));
      for (const id of blockers) {
        const el = root.querySelector<HTMLElement>(`.field [data-fid="${id}"]`);
        if (!el) continue;
        blocked.add(String(id));
        pulse(el);
        const b = center(el);
        if (!a || !b || reduced()) continue;
        const dx = a.cx - b.cx, dy = a.cy - b.cy, dist = Math.hypot(dx, dy) || 1;
        const reach = Math.min(dist * .3, 48) / dist, delay = Math.min(order++, 8) * 70;
        animate(el, [{ translate: '0 0', scale: '1' }, { translate: `${dx * reach}px ${dy * reach}px`, scale: '1.05', offset: .45 }, { translate: `${dx * reach}px ${dy * reach}px`, scale: '1.05', offset: .6 }, { translate: '0 0', scale: '1' }],
          560, 'cubic-bezier(.3,.7,.4,1)', delay);
        const link = effect('ability-beam block-link', { cx: b.cx, cy: b.cy, w: dist, h: 3 });
        link.style.cssText += `;--angle:${Math.atan2(dy, dx)}rad`;
        animate(link, [{ scale: '0 1', opacity: .9 }, { scale: '1 1', opacity: 1, offset: .45 }, { scale: '1 1', opacity: 0 }], 720, 'ease-out', delay);
        later(() => remove(link), 760 + delay);
      }
    }
    // Sem o quadro do combate (ponte antiga), só o destaque de sempre.
    root.querySelectorAll<HTMLElement>('.slot.blocking > .bfc').forEach(el => { if (!blocked.has(el.dataset.fid ?? '')) pulse(el); });
  }
  /** Vidência: as cartas sobem do grimório em leque; as do topo voltam por cima e as do fundo deslizam por baixo do monte. */
  function scry(event: PresentationEvent, you: number) {
    const libEl = libraryOf(event.actor, you), lib = center(libEl);
    if (!lib) return;
    const top = event.top ?? 0, bottom = event.bottom ?? 0, n = Math.min(5, top + bottom);
    pileTag(lib, top && bottom ? `${top} no topo · ${bottom} no fundo` : top ? `${top} no topo` : `${bottom} no fundo`, 'scry-count', 1500);
    if (reduced() || !n) { pulse(libEl); return; }
    const w = Math.max(lib.w, 56) * 1.15, h = w * 1.4;
    const inward = lib.cy < innerHeight / 2 ? 1 : -1;
    const topShown = Math.min(top, n);
    for (let i = 0; i < n; i++) {
      const toBottom = i >= topShown;
      const spread = (i - (n - 1) / 2) * w * .6;
      const ghost = effect(`presentation-piece draw-ghost scry-ghost ${toBottom ? 'to-bottom' : 'to-top'}`, { ...lib, w, h }, '<div class="back"></div>');
      const shrink = `${lib.w / w} ${lib.h / h}`, lift = inward * (h * .85 + 12);
      animate(ghost, [
        { translate: '0 0', scale: shrink, rotate: '0deg', opacity: .9 },
        { translate: `${spread}px ${lift}px`, scale: '1', rotate: `${(i - (n - 1) / 2) * 4}deg`, opacity: 1, offset: .35 },
        { translate: `${spread}px ${lift}px`, scale: '1', rotate: `${(i - (n - 1) / 2) * 4}deg`, opacity: 1, offset: .6 },
        // O topo volta por cima; o fundo passa por baixo do monte e some atrás dele.
        toBottom ? { translate: `0 ${-inward * lib.h * .35}px`, scale: shrink, rotate: '0deg', opacity: 0 } : { translate: '0 0', scale: shrink, rotate: '0deg', opacity: 1 }],
        940, 'cubic-bezier(.3,.7,.3,1)', i * 45);
      later(() => remove(ghost), 940 + i * 45);
    }
    later(() => absorb(libEl), 900);
  }
  /** Moeda e dado: giram no centro da mesa e param no resultado, com quem jogou embaixo. */
  function chance(event: PresentationEvent, label: string, duration: number) {
    const bounds = layer().getBoundingClientRect();
    const coin = event.type === 'coin';
    const size = Math.max(64, Math.min(96, bounds.height * .12));
    const at: Point = { cx: bounds.left + bounds.width * .5, cy: bounds.top + bounds.height * .46, w: size, h: size };
    const piece = effect(`chance-piece ${coin ? `coin ${event.heads ? 'heads' : 'tails'}` : 'die'}`, at);
    const value = document.createElement('b');
    const final = coin ? (event.heads ? 'Cara' : 'Coroa') : String(event.result ?? '?');
    value.textContent = final; piece.append(value);
    if (!coin && event.sides) { const sides = document.createElement('small'); sides.textContent = `d${event.sides}`; piece.append(sides); }
    const caption = document.createElement('span'); caption.className = 'presentation-caption'; caption.textContent = label; piece.append(caption);
    const hold = Math.max(duration, 1100);
    later(() => remove(piece), hold);
    if (reduced()) return;
    if (coin) {
      // Sobe girando no ar (cinco voltas) e cai mostrando o lado que saiu.
      animate(piece, [
        { opacity: 0, translate: '0 40px', scale: '.6', rotate: 'x 0deg' },
        { opacity: 1, translate: '0 -60px', scale: '1.1', rotate: 'x 900deg', offset: .35 },
        { opacity: 1, translate: '0 0', scale: '1', rotate: 'x 1800deg', offset: .62, easing: 'cubic-bezier(.3,1.5,.5,1)' },
        { opacity: 1, translate: '0 0', scale: '1', rotate: 'x 1800deg', offset: .88 },
        { opacity: 0, translate: '0 0', scale: '1', rotate: 'x 1800deg' }], hold, 'cubic-bezier(.3,.6,.4,1)');
      return;
    }
    // O dado rola de lado, trocando de número, e para no resultado com um quique.
    const sides = Math.max(2, event.sides ?? 6), result = event.result ?? 1;
    for (let i = 0; i < 6; i++) later(() => { value.textContent = String(((result + i * 7) % sides) + 1); }, 60 + i * 80);
    later(() => { value.textContent = final; }, 60 + 6 * 80);
    animate(piece, [
      { opacity: 0, translate: '-120px 30px', rotate: '-200deg', scale: '.7' },
      { opacity: 1, translate: '-40px -20px', rotate: '-60deg', scale: '1', offset: .25 },
      { opacity: 1, translate: '0 0', rotate: '0deg', scale: '1.12', offset: .5 },
      { opacity: 1, translate: '0 0', rotate: '0deg', scale: '1', offset: .6 },
      { opacity: 1, translate: '0 0', rotate: '0deg', scale: '1', offset: .88 },
      { opacity: 0, translate: '0 0', rotate: '0deg', scale: '1' }], hold, 'cubic-bezier(.3,.6,.4,1)');
  }
  /** Equipar ou encantar: a criatura recebe a carta com um pulso e um anel dourado; a carta presa acende ao encaixar. */
  function attach(event: PresentationEvent, card: HTMLElement | null) {
    const hostId = event.targets?.cards?.[0], player = event.targets?.players?.[0];
    const host = hostId !== undefined ? root.querySelector<HTMLElement>(`.field [data-fid="${hostId}"]`) : player !== undefined ? root.querySelector<HTMLElement>(`.avatar[data-pid="${player}"]`) : null;
    if (card) later(() => animate(card, [{ filter: 'brightness(1.9) drop-shadow(0 0 10px #ffe2a0)' }, { filter: 'none' }], 520, 'ease-out'), event.moved ? SETTLE.duration * .6 : 0);
    if (!host) return;
    later(() => {
      pulse(host);
      animate(host, [{ scale: '1.07' }, { scale: '1' }], LANDING.duration, LANDING.easing);
      const at = center(host);
      if (!at || reduced()) return;
      const ring = effect('attach-ring', { ...at, w: at.w * 1.12, h: at.h * 1.08 });
      animate(ring, [{ opacity: .9, scale: '.94' }, { opacity: 0, scale: '1.22' }], 560, 'cubic-bezier(.2,.7,.3,1)');
      later(() => remove(ring), 600);
    }, event.moved ? SETTLE.duration * .6 : 0);
  }
  /** Troca de controle: a carta atravessa a mesa do campo de quem controlava para o de quem controla agora, e chega com a cor dele. */
  function control(event: PresentationEvent, card: HTMLElement | null, old: Point | undefined, options: { you: number; html?: string; label: string; duration: number; hideDestination?: boolean }) {
    if (!card) return;
    const mine = event.actor === options.you;
    const mark = (el: HTMLElement) => {
      el.classList.add('control-glow', mine ? 'mine' : 'theirs');
      later(() => el.classList.remove('control-glow', 'mine', 'theirs'), 1200);
      const at = center(el);
      if (!at || reduced()) return;
      const ring = effect(`control-ring${mine ? ' mine' : ''}`, { ...at, w: at.w * 1.1, h: at.h * 1.1 });
      animate(ring, [{ opacity: .95, scale: '.95' }, { opacity: 0, scale: '1.3' }], 620, 'cubic-bezier(.2,.7,.3,1)');
      later(() => remove(ring), 660);
    };
    const to = center(card);
    if (!old || !to || reduced() || !options.html) { pulse(card); mark(card); return; }
    const piece = effect('presentation-piece', to, options.html);
    const caption = document.createElement('span'); caption.className = 'presentation-caption'; caption.textContent = options.label; piece.append(caption);
    fly(piece, old, to, to, options.duration, { caption });
    if (options.hideDestination) { card.style.opacity = '0'; hiddenCards.add(card); }
    const id = event.card?.id ?? event.sourceId;
    later(() => {
      remove(piece);
      if (hiddenCards.delete(card)) card.style.opacity = '';
      const landed = root.querySelector<HTMLElement>(`.field [data-fid="${id}"]`) ?? card;
      land(landed, false); mark(landed);
    }, options.duration);
  }
  /** Marcadores numa permanente: ela cresce um pouco e assenta, e o número sobe dela (o capítulo, numa saga). */
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  function counters(event: PresentationEvent) {
    const seen = new Set<string>();
    for (const one of event.grouped ?? [event]) {
      const id = one.card?.id ?? one.sourceId;
      if (id === undefined || one.targets?.players?.length || seen.has(String(id))) continue;
      seen.add(String(id));
      const el = root.querySelector<HTMLElement>(`.field [data-fid="${id}"]`), at = center(el);
      if (!el || !at) continue;
      animate(el, [{ scale: '1' }, { scale: '1.09', offset: .3 }, { scale: '1' }], LANDING.duration, LANDING.easing);
      const n = one.delta ?? 1, kind = one.counter ?? '';
      const lore = kind === 'LORE' ? (one.card?.counters?.LORE ?? n) : 0;
      const text = lore ? `Capítulo ${ROMAN[lore] ?? lore}` : /^P\d+P\d+$/.test(kind) ? `+${n}/+${n}` : /^M\d+M\d+$/.test(kind) ? `−${n}/−${n}` : '';
      if (text) floatNumber({ ...at, h: at.h * .6 }, text, `counter-float${/^M\d+M\d+$/.test(kind) ? ' harmful' : ''}${lore ? ' lore' : ''}`);
    }
  }
  /** A mana sai do terreno que acabou de virar e voa até o custo que falta pagar, na caixa de ação. */
  function manaOrb(card: HTMLElement, tone: string, delay: number) {
    const from = center(card), to = center(root.querySelector('#fAction .prompt-short') ?? root.querySelector('#fAction'));
    if (!from || !to || reduced()) return;
    const orb = effect('mana-orb', { ...from, w: 18, h: 18 });
    orb.style.setProperty('--mana', tone);
    const dx = to.cx - from.cx, dy = to.cy - from.cy;
    animate(orb, [
      { translate: '0 0', scale: '.4', opacity: 0 },
      { translate: `${dx * .1}px ${dy * .1 - 22}px`, scale: '1.2', opacity: 1, offset: .25 },
      { translate: `${dx}px ${dy}px`, scale: '.7', opacity: .9 }], 620, 'cubic-bezier(.4,0,.3,1)', delay);
    later(() => remove(orb), 640 + delay);
  }

  return {
    capture() {
      cards = new Map();
      root.querySelectorAll<HTMLElement>(KEYED).forEach(el => {
        const key = el.dataset.fid ?? el.dataset.peek!;
        if (cards.has(key)) return;
        const at = center(el);
        if (at) cards.set(key, { ...at, el, tapped: !!el.closest('.tapped'), zone: el.parentElement?.closest('[id]')?.id ?? '' });
      });
      const now = performance.now();
      const pile = center(stackPile());
      if (pile) stackSpot = { ...pile, seen: now };
      for (const [key, spot] of handSpots) if (now - spot.seen > 5000) handSpots.delete(key);
      root.querySelectorAll<HTMLElement>('#fHand [data-fid]').forEach(el => {
        const at = center(el);
        if (!at) return;
        handSpots.set(el.dataset.fid!, { ...at, w: el.offsetWidth || at.w, h: el.offsetHeight || at.h, rot: turnOf(el), seen: now });
      });
    },
    play(options = {}) {
      if (options.silent || reduced()) { primed = true; return; }
      const seen = new Set<string>();
      let untapWave = 0;
      root.querySelectorAll<HTMLElement>(KEYED).forEach(el => {
        const key = el.dataset.fid ?? el.dataset.peek!;
        if (seen.has(key)) return;
        seen.add(key);
        const at = center(el), before = cards.get(key);
        if (!at) return;
        if (before) {
          const zone = el.parentElement?.closest('[id]')?.id ?? '';
          if (options.semantic && zone !== before.zone) return;
          const dx = before.cx - at.cx, dy = before.cy - at.cy;
          const turned = before.tapped !== !!el.closest('.tapped');
          if (Math.abs(dx) + Math.abs(dy) < 2 && !turned) return;
          const slot = el.closest<HTMLElement>('.slot') ?? el;
          if (turned && slot !== el) {
            // Virar tem peso: a mola passa um pouco do ponto e assenta. Desvirar em lote vai em onda, uma carta depois da outra.
            const untapping = before.tapped;
            const tone = !untapping ? options.paying?.(Number(key)) : undefined;
            if (tone) manaOrb(el, tone, 90);
            animate(slot, [{ translate: `${dx}px ${dy}px`, rotate: untapping ? '90deg' : '-90deg' }, { translate: '0 0', rotate: '0deg' }],
              TAP.duration, TAP.easing, untapping ? Math.min(untapWave++, 12) * 45 : 0);
          } else {
            // Mudou de tamanho também (o campo apertou, a carta foi para outra fileira): cresce ou encolhe junto com o passo.
            const grow = before.w / at.w;
            const sized = Math.abs(grow - 1) > .03 && grow > .3 && grow < 3;
            animate(slot, [{ translate: `${dx}px ${dy}px`, ...(sized ? { scale: String(+grow.toFixed(3)) } : {}) }, { translate: '0 0', ...(sized ? { scale: '1' } : {}) }],
              SETTLE.duration, SETTLE.easing);
          }
        } else if (primed && !options.semantic) {
          animate(el.closest<HTMLElement>('.slot') ?? el, [{ opacity: 0, scale: '.9' }, { opacity: 1, scale: '1' }], SETTLE.duration, SETTLE.easing);
        }
      });
      primed = true;
    },
    present(event, options) {
      // Nothing here mutates card state, waits on a network reply, or creates a priority stop.
      if (document.hidden || root.hidden) return;
      if (event.type === 'damage') { damage(event, options.duration, options.html); return; }
      // Perder vida já aparece no dano (e pagar vida não é dano); só o ganho tem número próprio.
      if (event.type === 'life-changed') { heal(event); return; }
      if (event.type === 'attackers') {
        // Ataque é só vermelho: o dourado fica para seleção e bloqueio.
        // Cada atacante recua um pouco e avança na direção do oponente (para cima, se está na metade de baixo da mesa),
        // um depois do outro, e volta com mola.
        const middle = center(layer())?.cy ?? 0;
        root.querySelectorAll<HTMLElement>('.slot.attacking > .bfc').forEach((el, i) => {
          pulse(el, 'attack-highlight');
          const ahead = (center(el)?.cy ?? 0) > middle ? -1 : 1;
          animate(el, [{ translate: '0 0' }, { translate: `0 ${-7 * ahead}px`, offset: .3 }, { translate: `0 ${16 * ahead}px`, scale: '1.04', offset: .55 }, { translate: '0 0', scale: '1' }],
            560, 'cubic-bezier(.3,.7,.4,1)', Math.min(i, 8) * 70);
        });
        const banner = effect('combat-banner', { cx: 0, cy: 0, w: 0, h: 0 });
        banner.removeAttribute('style');
        banner.textContent = options.label;
        if (!reduced()) animate(banner, [{ opacity: 0, scale: '.96' }, { opacity: 1, scale: '1', offset: .15 }, { opacity: 1, offset: .8 }, { opacity: 0 }], options.duration);
        later(() => remove(banner), options.duration);
        return;
      }
      if (event.type === 'blockers') { blocks(event); return; }
      if (event.type === 'scry') { scry(event, options.you); return; }
      if (event.type === 'coin' || event.type === 'die') { chance(event, options.label, options.duration); return; }
      const id = event.card?.id ?? event.sourceId;
      const card = id === undefined ? null : root.querySelector<HTMLElement>(`.field [data-fid="${id}"]`);
      if (event.type === 'attached') { attach(event, card); return; }
      if (event.type === 'control-changed') { control(event, card, id === undefined ? undefined : cards.get(String(id)), options); return; }
      if (event.type === 'turn' || !options.html) return;
      if (event.type === 'ability-activated') { ability(event, card, options); return; }
      if (event.type === 'resolved' && !event.trigger && card && id !== undefined && performance.now() - (landedAt.get(String(id)) ?? -Infinity) < 4000) { pulse(card); return; }
      const old = id === undefined ? undefined : cards.get(String(id));
      const bounds = layer().getBoundingClientRect();
      const stage: Point = { cx: bounds.left + bounds.width * .5, cy: bounds.top + bounds.height * .48, w: Math.min(112, bounds.height * .17), h: Math.min(156, bounds.height * .237) };
      const mine = event.actor === options.you;
      const seat = !mine && event.actor !== undefined ? root.querySelector(`[data-seat-player="${event.actor}"]`) : null;
      const hand = center(seat?.querySelector('.seat-hand')) ?? center(root.querySelector(mine ? '#fHand' : '#fOppHand')) ?? center(root.querySelector(mine ? '#fMeAvatar' : '#fOppAvatar')) ?? stage;
      const target = center(card);
      // Saindo da sua mão: do lugar exato da carta no leque, com o tamanho e o giro dela.
      const spot = id !== undefined && (event.type === 'land-played' || event.from === 'Hand') ? handSpots.get(String(id)) : undefined;
      // Conjurar do cemitério, do exílio ou da zona de comando: sai do monte, com o brilho dele.
      const zoneFrom = !spot && !old ? zonePoint(event.from, event, mine, seat, hand, stage) : undefined;
      let from: Point = spot ?? old ?? zoneFrom ?? hand, to: Point = stage;
      // Conjurar: a mágica vai até a carta do topo da pilha, no canto; com a pilha recolhida, fica no centro da mesa.
      const pileEl = event.type === 'spell-cast' ? stackPile() : null, pile = center(pileEl);
      if (pile) to = pile;
      // Resolver e anular saem da pilha, no canto; o monte que recebe a carta pulsa quando ela chega.
      const fromStack = recentStack() ?? stage;
      let into: HTMLElement | null = null, handBack: HTMLElement | null = null;
      if (event.type === 'land-played' || event.type === 'entered') {
        // Reanimar, buscar no grimório e voltar da zona de comando: a carta sai do monte de onde veio.
        from = event.from === 'Stack' ? fromStack : spot ?? (event.from !== 'Exile' ? zonePoint(event.from, event, mine, seat, hand, stage) : undefined) ?? hand;
        to = target ?? center(seat?.querySelector('.lands')) ?? center(root.querySelector(mine ? '#fMeLands' : '#fOppLands')) ?? stage;
      } else if (event.type === 'resolved') {
        from = fromStack;
        const targetId = event.targets?.players?.[0];
        const targetCard = event.targets?.cards?.[0];
        // Habilidade ou gatilho de uma permanente: volta para a carta que a gerou. Mágica: cai no cemitério (ou para onde foi).
        if (!target && event.to && !['Battlefield', 'Stack'].includes(event.to)) { to = destination(event, mine, seat, hand, stage); into = pileOf(event, mine, seat); }
        else to = target ?? center(targetId !== undefined ? root.querySelector(`.avatar[data-pid="${targetId}"]`) : targetCard !== undefined ? root.querySelector(`.field [data-fid="${targetCard}"]`) : null) ?? stage;
      } else if (event.type === 'left') {
        from = old ?? target ?? stage;
        to = destination(event, mine, seat, hand, stage);
        into = pileOf(event, mine, seat);
        // Devolvida à sua mão: voa até o lugar dela no leque, já no giro dele, e a carta da mão aparece quando ela chega.
        const back = event.to === 'Hand' && mine && id !== undefined ? root.querySelector<HTMLElement>(`#fHand [data-fid="${id}"]`) : null, at = center(back);
        if (back && at) { to = { ...at, w: back.offsetWidth || at.w, h: back.offsetHeight || at.h }; handBack = back; }
      } else if (event.type === 'discard') {
        // Sai do lugar dela na mão (ou da mão do oponente), já de face para cima, e cai no cemitério.
        from = spot ?? old ?? hand;
        to = destination({ ...event, to: 'Graveyard' }, mine, seat, hand, stage);
        into = pileOf({ ...event, to: 'Graveyard' }, mine, seat);
      } else if (event.type === 'countered') {
        from = fromStack;
        to = destination({ ...event, to: 'Graveyard' }, mine, seat, hand, stage);
        into = pileOf({ ...event, to: 'Graveyard' }, mine, seat);
      }
      if (event.type === 'entered' && event.from === 'Exile') from = to; // Blink: volta no mesmo lugar, em luz.
      // Pousa no campo (terreno, ou permanente que entrou vinda da pilha ou da mão): termina no tamanho da carta no campo, sem salto ao trocar.
      const landing = !!card && !!target && (event.type === 'land-played' || (event.type === 'entered' && event.from !== 'Exile'));
      const settled = event.type === 'resolved' || event.type === 'countered';
      // Em arco até um monte, uma carta ou o leque: termina no tamanho de onde entra.
      const arcs = settled || event.type === 'discard' || (event.type === 'left' && event.to !== 'Exile');
      // Keep large cards readable while travelling, independent of a tiny hand or pile's dimensions. Saindo da pilha, a carta
      // já começa grande (no tamanho dela) e termina no tamanho de onde entra.
      const end = landing ? target! : pile ?? (arcs && to !== stage && to !== hand ? to : { ...to, w: stage.w, h: stage.h });
      const piece = effect('presentation-piece', end, options.html);
      const caption = document.createElement('span');
      caption.className = 'presentation-caption'; caption.textContent = options.label; piece.append(caption);
      const disappearing = !landing && ['left', 'countered', 'resolved', 'discard'].includes(event.type);
      if (event.type === 'left') {
        leave(event, from, to, end, piece, options.duration, { caption, into, endRot: handBack ? turnOf(handBack) : 0, fade: !handBack });
        // Comandante voltando à zona de comando: chega com uma onda dourada.
        if (event.to === 'Command' && into) { const zone = into; later(() => ripple(center(zone)), options.duration * .85); }
        if (handBack && options.hideDestination && !reduced()) { handBack.style.opacity = '0'; hiddenCards.add(handBack); }
      } else if (event.type === 'discard') {
        fly(piece, from === hand ? { ...hand, w: end.w * .7, h: end.h * .7 } : from, to, end, options.duration, { caption, fade: true });
        if (into) { const pileEl = into; later(() => absorb(pileEl), options.duration * .85); }
      } else if (landing || event.type === 'spell-cast') {
        if (landing) landedAt.set(String(id), performance.now());
        // Sem o lugar no leque (mão do oponente, mão longa), sai do centro da mão no tamanho de uma carta.
        fly(piece, from === hand ? { ...hand, w: end.w * .7, h: end.h * .7 } : from, to, end, options.duration, { caption, tint: zoneGlow(event.from) });
        // Comandante conjurado da zona de comando: a taxa sobe 2 para a próxima vez.
        if (event.type === 'spell-cast' && event.from === 'Command') floatNumber(from, '+2', 'tax', ['Taxa de comandante']);
      } else if (settled) {
        // Anulada: racha na pilha e cai apagada no cemitério. Resolvida: entra no cemitério, ou na carta que a gerou.
        const countered = event.type === 'countered';
        if (countered && from !== stage) shatter(from);
        fly(piece, from, to, end, options.duration, { caption, fade: true, tint: countered ? 'grayscale(.85) brightness(.7)' : '' });
        if (into) { const pileEl = into; later(() => absorb(pileEl), options.duration * .85); }
      }
      else if (event.type === 'entered' && event.from === 'Exile') {
        const ring = effect('exile-ring', { ...to, w: end.w * 1.3, h: end.w * 1.3 });
        animate(ring, [{ opacity: 0, scale: '1.3' }, { opacity: .9, scale: '1', offset: .5 }, { opacity: 0, scale: '.8' }], options.duration);
        later(() => remove(ring), options.duration);
        animate(piece, [{ opacity: 0, scale: '1.1', filter: 'brightness(3) blur(3px)' }, { opacity: .9, scale: '1.03', filter: 'brightness(2) saturate(.4)', offset: .5 }, { opacity: 1, scale: '1', filter: 'none' }], options.duration);
      } else animate(piece, [
        { translate: `${from.cx - to.cx}px ${from.cy - to.cy}px`, scale: '.92', opacity: .8 },
        { translate: '0 -8px', scale: '1.02', opacity: 1, offset: .58 },
        { translate: '0 0', scale: '1', opacity: disappearing ? .1 : 1 },
      ], options.duration);
      if (target && card) {
        pulse(card);
        if (options.hideDestination && !reduced() && landing) { card.style.opacity = '0'; hiddenCards.add(card); }
      }
      // A pilha já mostra a mágica: ela some até a carta que voa chegar, para não aparecer duas vezes.
      if (pileEl && options.hideDestination && !reduced()) { pileEl.style.visibility = 'hidden'; hiddenCards.add(pileEl); }
      later(() => {
        remove(piece);
        if (card && hiddenCards.delete(card)) card.style.opacity = '';
        if (pileEl && hiddenCards.delete(pileEl)) pileEl.style.visibility = '';
        if (handBack && hiddenCards.delete(handBack)) { handBack.style.opacity = ''; animate(handBack, [{ scale: '1.08' }, { scale: '1' }], TAP.duration, TAP.easing); }
        // Terreno ou permanente chegando ao campo: pousa com mola; fichas surgem com um brilho.
        if (id !== undefined && landing) {
          const landed = root.querySelector<HTMLElement>(`.field [data-fid="${id}"]`);
          if (landed) land(landed);
          if (landed && event.card?.token) animate(landed, [{ filter: 'brightness(1.8) drop-shadow(0 0 10px #fff)' }, { filter: 'none' }], 520, 'ease-out');
          if (landed && walkerArrives(event)) walkerArrive(landed, event);
          if (landed && event.from === 'Graveyard') reanimate(landed);
        }
      }, options.duration);
    },
    drew(actor, count, options) {
      if (document.hidden || root.hidden || count < 1) return [];
      const mine = actor === options.you;
      const seat = mine ? null : root.querySelector(`[data-seat-player="${actor}"]`);
      const library = (seat ? center(seat.querySelector('.piles .lib')) : undefined) ?? center(root.querySelector(`${mine ? '#fMePiles' : '#fOppPiles'} .lib`));
      const handPoint = center(seat?.querySelector('.seat-hand')) ?? center(root.querySelector(mine ? '#fHand' : '#fOppHand')) ?? center(root.querySelector(mine ? '#fMeAvatar' : '#fOppAvatar'));
      // A mão pode ter sido redesenhada durante o voo: revela a carta que estiver lá agora, pelo id.
      const reveal = (el: HTMLElement) => (root.querySelector<HTMLElement>(`#fHand [data-fid="${el.dataset.fid}"]`) ?? el).classList.remove('incoming');
      if (!library || !handPoint || reduced()) { options.cards.forEach(reveal); return options.cards.map(() => 0); }
      // Até 7 voos; numa compra grande o resto chega junto com o último.
      const flights = Math.min(count, 7), gap = options.fast ? 60 : 110, travel = options.fast ? 300 : 460;
      // Busca no grimório (tutor): a carta sai com um brilho dourado e uma lupa de luz se abre no grimório.
      if (options.searched) {
        const ring = effect('search-ring', { ...library, w: library.w * 1.5, h: library.w * 1.5 });
        animate(ring, [{ opacity: 0, scale: '.5' }, { opacity: .95, scale: '1', offset: .4 }, { opacity: 0, scale: '1.3' }], 640, 'ease-out');
        later(() => remove(ring), 680);
      }
      for (let i = 0; i < flights; i++) {
        const card = options.cards[i];
        const to = center(card) ?? handPoint;
        // O tamanho da carta sem o giro do leque (a caixa de uma carta girada é maior que ela).
        const size = card ? { w: card.offsetWidth || to.w, h: card.offsetHeight || to.h } : { w: library.w, h: library.h };
        const ghost = effect(`presentation-piece draw-ghost${options.searched ? ' search-ghost' : ''}`, { ...to, ...size }, '<div class="back"></div>');
        // Sobe do grimório em arco, inclinada e com sombra, e assenta no lugar dela no leque, já no giro dele; a sua carta
        // vira de face para cima ao chegar.
        fly(ghost, library, to, { ...to, ...size }, travel, { delay: i * gap, endRot: card ? turnOf(card) : 0, tint: options.searched ? 'drop-shadow(0 0 10px #f2b54c)' : '' });
        later(() => {
          remove(ghost);
          if (card) { reveal(card); animate(root.querySelector<HTMLElement>(`#fHand [data-fid="${card.dataset.fid}"]`) ?? card, [{ rotate: 'y 90deg', scale: '1.06' }, { rotate: 'y 0deg', scale: '1' }], TAP.duration, TAP.easing); }
        }, travel + i * gap);
      }
      // Cartas além dos voos aparecem com a última.
      for (const card of options.cards.slice(flights)) later(() => reveal(card), travel + (flights - 1) * gap);
      return options.cards.map((_, i) => travel + Math.min(i, flights - 1) * gap);
    },
    milled(event, options) {
      if (document.hidden || root.hidden) return;
      const cards = event.milled ?? (event.card ? [event.card] : []);
      const mine = event.actor === options.you;
      const seat = mine ? null : root.querySelector(`[data-seat-player="${event.actor}"]`);
      const piles = seat?.querySelector('.piles') ?? root.querySelector(mine ? '#fMePiles' : '#fOppPiles');
      // A mesa pode ser redesenhada durante os voos: o cemitério é procurado de novo na hora do destaque.
      const pile = () => (seat?.isConnected ? seat : null)?.querySelector<HTMLElement>('.piles .gy:not(.exile)')
        ?? root.querySelector<HTMLElement>(mine ? '#fMePiles .gy:not(.exile)' : seat ? `[data-seat-player="${event.actor}"] .piles .gy:not(.exile)` : '#fOppPiles .gy:not(.exile)');
      const libEl = piles?.querySelector<HTMLElement>('.lib') ?? null, gyEl = pile();
      const library = center(libEl), grave = center(gyEl);
      if (!library || !grave || !cards.length) { pulse(gyEl); return; }
      const { flights, gap, travel } = millTiming(cards.length, options.fast);
      const total = travel + (flights - 1) * gap;
      // Quantas saíram, junto ao grimório (some sozinho; com "reduzir movimento" fica parado e some do mesmo jeito).
      const below = library.cy - library.h / 2 < 90;
      const count = effect(`mill-count${below ? ' below' : ''}`, { ...library, cy: below ? library.cy + library.h / 2 + 4 : library.cy - library.h / 2 - 4, w: 0, h: 0 });
      count.textContent = `−${cards.length}`;
      animate(count, [{ opacity: 0, scale: '.7' }, { opacity: 1, scale: '1.15', offset: .12 }, { opacity: 1, scale: '1', offset: .75 }, { opacity: 0 }], Math.max(1100, total + 500));
      later(() => remove(count), Math.max(1100, total + 500));
      if (reduced()) { pulse(gyEl); return; }
      // A carta voa num tamanho legível e encolhe ao cair na pilha; com muitas, os voos se abrem em leque.
      const w = Math.max(grave.w, 64) * 1.25, h = w * 1.4;
      for (let i = 0; i < flights; i++) {
        const spread = flights >= 6 ? (i - (flights - 1) / 2) * 7 : 0;
        const ghost = effect('presentation-piece mill-ghost', { ...grave, w, h }, `${options.face(cards[i])}<div class="back"></div>`);
        const dx = library.cx - grave.cx, dy = library.cy - grave.cy, delay = i * gap;
        // O arco vai para dentro da mesa (o grimório fica junto da borda de cima ou de baixo).
        const lift = Math.min(90, h * .7) * (grave.cy < window.innerHeight / 2 ? -1 : 1);
        // Sobe do grimório de costas, fica de lado no alto do arco (a virada) e desce de face para cima no cemitério.
        animate(ghost, [
          { translate: `${dx}px ${dy}px`, scale: `${library.w / w} ${library.h / h}`, rotate: '0deg', opacity: .95 },
          { translate: `${dx * .55 + spread}px ${dy * .55 - lift}px`, scale: '.06 1.05', rotate: `${spread * .4}deg`, offset: .45 },
          { translate: `${dx * .4 + spread}px ${dy * .4 - lift}px`, scale: '1.05', rotate: `${spread * .4}deg`, offset: .6 },
          { translate: '0 0', scale: `${grave.w / w} ${grave.h / h}`, rotate: '0deg', opacity: 1 }], travel, MILL_EASE, delay);
        const back = ghost.querySelector<HTMLElement>('.back');
        if (back) animate(back, [{ opacity: 1 }, { opacity: 1, offset: .44 }, { opacity: 0, offset: .46 }, { opacity: 0 }], travel, MILL_EASE, delay);
        later(() => { remove(ghost); if (i === flights - 1) pulse(pile()); }, travel + delay);
      }
    },
    entered(event, options) {
      if (document.hidden || root.hidden) return;
      const cards = event.entries ?? (event.card ? [event.card] : []);
      if (!cards.length) return;
      const mine = event.actor === options.you;
      const seat = !mine && event.actor !== undefined ? root.querySelector(`[data-seat-player="${event.actor}"]`) : null;
      const bounds = layer().getBoundingClientRect();
      const stage: Point = { cx: bounds.left + bounds.width * .5, cy: bounds.top + bounds.height * .48, w: Math.min(112, bounds.height * .17), h: Math.min(156, bounds.height * .237) };
      const hand = center(seat?.querySelector('.seat-hand')) ?? center(root.querySelector(mine ? '#fHand' : '#fOppHand')) ?? stage;
      // Fichas (sem origem) e cartas que voltam do exílio surgem no próprio lugar; as outras vêm de onde estavam.
      const origin = !event.from || event.from === 'Exile' ? null : event.from === 'Stack' ? recentStack() ?? stage : event.from === 'Hand' ? hand
        : destination({ ...event, to: event.from }, mine, seat, hand, stage);
      const { flights, gap, travel } = entryTiming(cards.length, options.fast || !!event.repeat);
      const total = travel + (flights - 1) * gap;
      // Cada monte de cartas iguais recebe as suas: "+8" em cima do monte, que cresce conforme elas chegam.
      const piles = new Map<HTMLElement, number>();
      cards.forEach((card, i) => {
        const el = root.querySelector<HTMLElement>(`.field [data-fid="${card.id}"]`);
        const pile = el?.closest<HTMLElement>('.stack') ?? el;
        // Some a carta inteira, com a moldura e a lupa, até a ficha chegar: o monte cresce conforme elas pousam. É pela
        // visibilidade, porque a animação de entrada da mesa mexe na opacidade.
        const slot = el?.closest<HTMLElement>('.slot') ?? el;
        if (pile) piles.set(pile, (piles.get(pile) ?? 0) + 1);
        const delay = Math.min(i, flights - 1) * gap;
        if (slot && options.hideDestination && !reduced()) { slot.style.visibility = 'hidden'; hiddenCards.add(slot); }
        const to = center(el);
        if (i < flights && to && !reduced()) {
          const piece = effect('presentation-piece', to, options.face(card));
          // Fichas surgem no lugar com uma mola (crescem, passam um pouco e assentam); as outras vêm em arco de onde estavam.
          if (!origin) animate(piece, [
            { opacity: 0, scale: '.5', filter: event.from === 'Exile' ? 'brightness(3) blur(3px)' : 'brightness(2.4) blur(2px)' },
            { opacity: 1, scale: '1', filter: 'none' }], travel, LANDING.easing, delay);
          // Da mão (a área inteira, sem a carta), sai no tamanho de uma carta.
          else fly(piece, origin === hand ? { ...hand, w: to.w * .7, h: to.h * .7 } : origin, to, to, travel, { delay });
          later(() => remove(piece), travel + delay);
        }
        later(() => {
          // A mesa pode ter sido redesenhada durante a cascata: a carta é procurada de novo pelo id.
          if (slot && hiddenCards.delete(slot)) slot.style.visibility = '';
          const landed = root.querySelector<HTMLElement>(`.field [data-fid="${card.id}"]`);
          // Cada uma assenta com mola; a onda dourada fica para o monte inteiro, no fim.
          if (landed && origin) land(landed, false);
          if (landed && event.from === 'Graveyard') reanimate(landed);
          if (landed && card.token) animate(landed, [{ filter: 'brightness(1.8) drop-shadow(0 0 10px #fff)' }, { filter: 'none' }], 520, 'ease-out');
        }, reduced() ? 0 : travel + delay);
      });
      for (const [pile, n] of piles) {
        later(() => { pulse(pile); ripple(center(pile)); }, reduced() ? 0 : total);
        const at = center(pile);
        if (n < 2 || !at) continue;
        // Acima do monte e das fichas que ainda estão chegando (a mola as faz passar um pouco do tamanho).
        const count = effect('entry-count', { ...at, cy: at.cy - at.h * .62 - 6, w: 0, h: 0 });
        count.textContent = `+${n}`;
        // Linear: o número fica inteiro durante a cascata e só some depois que a última ficha pousa.
        animate(count, [{ opacity: 0, scale: '.7' }, { opacity: 1, scale: '1.15', offset: .12 }, { opacity: 1, scale: '1', offset: .75 }, { opacity: 0 }], Math.max(1100, total + 500), 'linear');
        later(() => remove(count), Math.max(1100, total + 500));
      }
    },
    quick(event, options) {
      if (document.hidden || root.hidden) return;
      if (event.type === 'shuffle') shuffle(libraryOf(event.actor, options.you));
      else if (event.type === 'counters') counters(event);
    },
    transformed(ids) {
      if (document.hidden || root.hidden || reduced()) return;
      for (const id of ids) {
        const el = root.querySelector<HTMLElement>(`.field [data-fid="${id}"]`);
        if (!el) continue;
        // Gira no lugar como uma carta virando de lado e mostra a face nova, com um brilho no meio do giro.
        animate(el, [{ rotate: 'y 0deg', scale: '1', filter: 'none' }, { rotate: 'y 90deg', scale: '1.08', filter: 'brightness(1.8)', offset: .45 }, { rotate: 'y 0deg', scale: '1', filter: 'none' }], 620, 'cubic-bezier(.3,.7,.4,1)');
        later(() => ripple(center(el)), 320);
      }
    },
    deal(dealt, options) {
      if (document.hidden || root.hidden || reduced() || !dealt.length) return;
      const libEl = root.querySelector<HTMLElement>('#fMePiles .lib'), library = center(libEl);
      if (!library) return;
      // Mulligan: a mão anterior volta ao grimório (de onde as cartas estavam no leque), e ele embaralha.
      const back = [...handSpots.entries()].filter(([key]) => !dealt.some(el => el.dataset.fid === key)).slice(0, options.returning ? 7 : 0);
      back.forEach(([key, spot], i) => {
        handSpots.delete(key);
        const ghost = effect('presentation-piece draw-ghost deal-ghost', library, '<div class="back"></div>');
        fly(ghost, spot, library, library, 380, { delay: i * 40, fade: true });
        later(() => remove(ghost), 380 + i * 40);
      });
      const wait = back.length ? 380 + (back.length - 1) * 40 + 80 : 0;
      if (back.length) later(() => shuffle(libEl), wait - 60);
      const start = wait + (back.length ? 420 : 0);
      dealt.forEach((card, i) => {
        const to = center(card);
        if (!to) return;
        const size = { w: card.offsetWidth || to.w, h: card.offsetHeight || to.h };
        card.style.opacity = '0'; hiddenCards.add(card);
        const ghost = effect('presentation-piece draw-ghost deal-ghost', { ...to, ...size }, '<div class="back"></div>');
        ghost.style.opacity = '0';
        later(() => { ghost.style.opacity = ''; }, start + i * 90);
        fly(ghost, library, to, { ...to, ...size }, 420, { delay: start + i * 90, endRot: turnOf(card) });
        later(() => {
          remove(ghost);
          const now = root.querySelector<HTMLElement>(`#fHand [data-fid="${card.dataset.fid}"]`) ?? card;
          if (hiddenCards.delete(card)) card.style.opacity = '';
          now.style.opacity = '';
          animate(now, [{ rotate: 'y 90deg', scale: '1.06' }, { rotate: 'y 0deg', scale: '1' }], TAP.duration, TAP.easing);
        }, start + 420 + i * 90);
      });
    },
    revealIn(shown) {
      if (reduced()) return;
      // Entram de costas, crescem um pouco e viram de face, uma depois da outra.
      shown.slice(0, 12).forEach((el, i) => animate(el, [
        { rotate: 'y 180deg', scale: '.8', opacity: 0, filter: 'brightness(.6)' },
        { rotate: 'y 90deg', scale: '1.08', opacity: 1, filter: 'brightness(1.4)', offset: .5 },
        { rotate: 'y 0deg', scale: '1', opacity: 1, filter: 'none' }], 520, 'cubic-bezier(.3,.7,.4,1)', 120 + i * 90));
    },
    finale(winners, losers) {
      if (document.hidden || root.hidden || reduced()) return 0;
      const avatar = (id: number) => root.querySelector<HTMLElement>(`.avatar[data-pid="${id}"]`);
      for (const id of losers) {
        const el = avatar(id), at = center(el);
        if (!el || !at) continue;
        el.classList.add('finale-lose');
        later(() => el.classList.remove('finale-lose'), 1500);
        shatter({ ...at, w: Math.max(at.w, 70), h: Math.max(at.h, 70) });
        animate(el, [{ translate: '0 0' }, { translate: '-5px 0', offset: .15 }, { translate: '5px 0', offset: .3 }, { translate: '-3px 0', offset: .45 }, { translate: '0 0', offset: .6 }, { translate: '0 0' }], 700);
      }
      for (const id of winners) {
        const el = avatar(id), at = center(el);
        if (!el || !at) continue;
        el.classList.add('finale-win');
        later(() => el.classList.remove('finale-win'), 1500);
        const size = Math.max(at.w, at.h) * 2.4;
        const wave = effect('walker-wave finale-wave', { ...at, w: size, h: size });
        wave.style.setProperty('--walker', '#f2b54c');
        animate(wave, [{ opacity: .9, scale: '.2' }, { opacity: .5, scale: '.8', offset: .5 }, { opacity: 0, scale: '1.2' }], 1000, 'cubic-bezier(.2,.6,.3,1)', 200);
        later(() => remove(wave), 1250);
      }
      const arena = root.querySelector<HTMLElement>('.arena');
      if (arena && losers.length) animate(arena, [{ translate: '0 0' }, { translate: '-4px 2px', offset: .25 }, { translate: '3px -1px', offset: .5 }, { translate: '0 0' }], 320, 'linear', 80);
      return 1300;
    },
    cancelPresentation: clear,
    reset() { clear(); cards = new Map(); primed = false; },
  };
}
