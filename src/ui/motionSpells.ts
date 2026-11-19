// Animações de momentos de mágica: o relógio do turno extra, as cópias que se desdobram da original na pilha, a energia da mágica reforçada ou com X, a cascata abrindo o grimório em leque e a permanente que muda de fase.
import type { FCard } from '../forge/client';
import { cascadeTiming, type PresentationEvent } from './presentationTimeline';
import { SWEEP_COLORS, sweepStyle } from './boardSweep';
import { center, reduced, type MotionKit, type Point } from './motionKit';

/** Quantas cópias aparecem no leque (as outras ficam no "×N"). */
export const COPIES_SHOWN = 5;
/** A força do anel de energia: o X pago (de 1 a 10); a reforçada sem X vale 3. */
export const boostPower = (event: Pick<PresentationEvent, 'x' | 'kicked'>) => Math.max(1, Math.min(10, event.x ?? 3));
/** O que sobe da pilha: "X = 5" (com "Reforço" embaixo, se também foi reforçada) ou só "Reforço". */
export function boostText(event: Pick<PresentationEvent, 'x' | 'kicked'>): { text: string; badges: string[] } {
  return event.x !== undefined ? { text: `X = ${event.x}`, badges: event.kicked ? ['Reforço'] : [] } : { text: 'Reforço', badges: [] };
}
/**
 * Onde cada carta da cascata fica no leque, da primeira que saiu à última (a que parou a busca, no meio da mesa): `dx` e
 * `dy` a partir do centro e o giro em graus. As primeiras ficam para a esquerda, mais para trás.
 */
export function cascadeFan(count: number, step: number) {
  return Array.from({ length: count }, (_, i) => {
    const k = i - (count - 1) / 2;
    return { dx: k * step, dy: Math.abs(k) * Math.abs(k) * 3, rot: k * 4 };
  });
}

export function createSpellMotion(kit: MotionKit, libraryOf: (actor: number | undefined, you: number) => HTMLElement | null) {
  const { root, layer, later, animate, effect, remove, floatNumber, stackPile, recentStack, gpu } = kit;
  const middle = (): Point => { const b = layer().getBoundingClientRect(); return { cx: b.left + b.width * .5, cy: b.top + b.height * .46, w: 0, h: 0 }; };
  const pileSpot = (): Point => center(stackPile()) ?? recentStack() ?? kit.stage();

  /**
   * Turno extra: um relógio no meio da mesa com os ponteiros girando para trás. Na camada GPU, com rastro e faíscas; em
   * CSS, o mostrador e os dois ponteiros. A faixa "Turno extra" continua dizendo de quem é.
   */
  function extraTurn(event: PresentationEvent, you: number, duration: number) {
    if (reduced()) return;
    const bounds = layer().getBoundingClientRect();
    const size = Math.max(110, Math.min(170, bounds.height * .22));
    // Abaixo da faixa do turno, para as duas aparecerem juntas.
    const at: Point = { cx: bounds.left + bounds.width * .5, cy: bounds.top + bounds.height * .62, w: size, h: size };
    const color = event.actor === you ? '#f2b54c' : '#ff8a5c';
    const life = Math.max(duration, 1100);
    gpu.ambiencePulse({ dim: { amount: .35, ms: life * .8 } });
    if (gpu.play('extraTurn', { at, size, color, duration: life })) return;
    const clock = effect('extra-turn-clock', at, '<i class="minute"></i><i class="hour"></i>');
    clock.style.setProperty('--clock', color);
    animate(clock, [{ opacity: 0, scale: '.7' }, { opacity: 1, scale: '1', offset: .14 }, { opacity: 1, scale: '1', offset: .82 }, { opacity: 0, scale: '1.2' }], life, 'linear');
    const spin = 'cubic-bezier(.45, 0, .3, 1)';
    animate(clock.querySelector<HTMLElement>('.minute')!, [{ rotate: '0deg' }, { rotate: '-900deg' }], life * .74, spin, life * .1);
    animate(clock.querySelector<HTMLElement>('.hour')!, [{ rotate: '60deg' }, { rotate: '-30deg' }], life * .74, spin, life * .1);
    later(() => remove(clock), life);
  }

  /**
   * Cópias de uma mágica (tempestade, replicar, Twincast): em vez de uma carta voar da mão para cada cópia, elas se
   * desdobram da original na pilha, em leque, com "×N" (ou "Cópia", quando é uma só).
   */
  function copies(event: PresentationEvent, o: { html: string; duration: number }) {
    const pile = pileSpot();
    const n = event.copies ?? 1, shown = Math.min(n, COPIES_SHOWN);
    // O leque abre para o lado de dentro da mesa.
    const bounds = layer().getBoundingClientRect();
    const side = pile.cx > bounds.left + bounds.width / 2 ? -1 : 1;
    const step = Math.min(pile.w * .42, 46);
    const color = SWEEP_COLORS[sweepStyle(event.card)];
    // O número fica sobre o leque, do lado para onde ele abre.
    const count = effect('entry-count copy-count', { ...pile, cx: pile.cx + side * step * (shown + 1) / 2, cy: pile.cy - pile.h * .18, w: 0, h: 0 });
    count.textContent = n > 1 ? `×${n}` : 'Cópia';
    count.style.setProperty('--copy', color);
    animate(count, [{ opacity: 0, scale: '.6' }, { opacity: 1, scale: '1.2', offset: .18 }, { opacity: 1, scale: '1', offset: .8 }, { opacity: 0 }], Math.max(o.duration, 900), 'linear');
    later(() => remove(count), Math.max(o.duration, 900));
    if (reduced()) return;
    gpu.play('echo', { at: pile, color, copies: shown, side, duration: o.duration });
    for (let i = shown - 1; i >= 0; i--) {
      const ghost = effect('presentation-piece copy-ghost', pile, o.html);
      const dx = side * step * (i + 1), dy = -step * .12 * (i + 1), rot = side * 4 * (i + 1);
      const start = .06 + i * (.4 / shown);
      animate(ghost, [
        { translate: '0 0', rotate: '0deg', opacity: 0 },
        { translate: '0 0', rotate: '0deg', opacity: 0, offset: start },
        { translate: `${dx}px ${dy}px`, rotate: `${rot}deg`, opacity: .8 - i * .1, offset: Math.min(.7, start + .4) },
        { translate: `${dx}px ${dy}px`, rotate: `${rot}deg`, opacity: .8 - i * .1, offset: .74 },
        // No fim, as cópias voltam para a pilha, onde ficam.
        { translate: '0 0', rotate: '0deg', opacity: 0 }], o.duration, 'ease-out');
      later(() => remove(ghost), o.duration);
    }
  }

  /**
   * Mágica reforçada (kicker) ou com X: quando ela chega à pilha, a energia na cor dela converge na carta e estoura num
   * anel (maior quanto maior o X), e "X = N" ou "Reforço" sobe da pilha.
   */
  function boost(event: PresentationEvent, duration: number) {
    const color = SWEEP_COLORS[sweepStyle(event.card)];
    later(() => {
      const at = pileSpot();
      const { text, badges } = boostText(event);
      floatNumber(at, text, 'boost', badges);
      if (reduced() || gpu.play('empower', { at, color, power: boostPower(event), duration: 680 })) return;
      const size = Math.max(at.w, at.h, 70) * (1.2 + boostPower(event) * .06);
      const ring = effect('boost-ring', { ...at, w: size, h: size });
      ring.style.setProperty('--boost', color);
      animate(ring, [{ opacity: 0, scale: '1.5' }, { opacity: 1, scale: '.8', offset: .5 }, { opacity: 0, scale: '1.6' }], 620, 'ease-out');
      later(() => remove(ring), 640);
    }, Math.round(duration * .72));
  }

  /**
   * Cascata e descobrir: as cartas saem do topo do grimório uma a uma e se abrem em leque no meio da mesa, de face para
   * cima; a que parou a busca chega por último e acende. No fim, as outras voltam para o grimório e ela segue para a
   * pilha (conjurada) ou some no lugar.
   */
  function cascade(event: PresentationEvent, o: { you: number; duration: number; face?: (card: FCard) => string }) {
    const all = event.revealed ?? [];
    if (!all.length || !o.face) return;
    const base = cascadeTiming(all.length, false);
    const scale = o.duration / (base.start + (base.shown - 1) * base.gap + base.hold);
    const gap = base.gap * scale, travel = base.start * scale;
    // Com muitas, só as últimas aparecem (a que serve é sempre a última).
    const cards = all.slice(-base.shown);
    const libEl = libraryOf(event.actor, o.you), library = center(libEl) ?? kit.stage();
    const bounds = layer().getBoundingClientRect(), mid = middle();
    const w = Math.max(64, Math.min(104, bounds.height * .16)), h = w * 1.4;
    const step = Math.min(w * .78, bounds.width * .62 / cards.length);
    const fan = cascadeFan(cards.length, step);
    const title = effect('cascade-title', { ...mid, cy: mid.cy - h / 2 - 16, w: 0, h: 0 });
    title.textContent = `${event.dig === 'discover' ? 'Descobrir' : 'Cascata'}${all.length > 1 ? ` · ${all.length} cartas` : ''}`;
    animate(title, [{ opacity: 0 }, { opacity: 1, offset: .1 }, { opacity: 1, offset: .88 }, { opacity: 0 }], o.duration, 'linear');
    later(() => remove(title), o.duration);
    const arrive = travel + (cards.length - 1) * gap, leave = o.duration - Math.min(260, o.duration * .2);
    cards.forEach((card, i) => {
      const spot = fan[i]!, at: Point = { cx: mid.cx + spot.dx, cy: mid.cy + spot.dy, w, h };
      const hit = card.id === event.hit;
      const piece = effect(`presentation-piece cascade-card${hit ? ' hit' : ''}`, at, o.face!(card));
      piece.style.rotate = `${spot.rot}deg`;
      piece.style.zIndex = String(32 + i);
      later(() => remove(piece), o.duration);
      if (reduced()) return;
      const fromLib = `${library.cx - at.cx}px ${library.cy - at.cy}px`, small = String(+(Math.max(library.w, 30) / w).toFixed(3));
      // Sai do grimório pequena e chega ao lugar dela no leque, passando um pouco do tamanho.
      animate(piece, [{ translate: fromLib, scale: small, opacity: 0 }, { translate: fromLib, scale: small, opacity: 1, offset: .08 }, { translate: '0 -10px', scale: '1.06', opacity: 1, offset: .8 }, { translate: '0 0', scale: '1', opacity: 1 }], travel, 'cubic-bezier(.3, .7, .3, 1)', i * gap);
      if (hit) later(() => {
        // A achada: sobe um pouco, cresce e acende em dourado.
        animate(piece, [{ translate: '0 0', scale: '1' }, { translate: '0 -12px', scale: '1.18', offset: .25 }, { translate: '0 -12px', scale: '1.18' }], Math.max(120, leave - arrive), 'cubic-bezier(.2, .8, .2, 1)');
        gpu.play('flare', { at: { ...at, cy: at.cy - 12, w: w * 1.18, h: h * 1.18 }, color: '#f2b54c', duration: Math.max(420, (leave - arrive) * .8) });
        gpu.play('arrive', { at, color: '#f2b54c', size: h * 1.5 });
      }, arrive);
      else later(() => animate(piece, [{ opacity: 1 }, { opacity: .5 }], Math.max(120, leave - arrive), 'ease-out'), arrive);
      later(() => {
        // As que não servem voltam para o fundo do grimório; a achada vai para a pilha (conjurada) ou some.
        const to = hit ? (event.cast ? pileSpot() : at) : library;
        animate(piece, [{ translate: hit ? '0 -12px' : '0 0', scale: hit ? '1.18' : '1', opacity: hit ? 1 : .5 },
          { translate: `${to.cx - at.cx}px ${to.cy - at.cy}px`, scale: hit && !event.cast ? '1.3' : small, opacity: 0 }], o.duration - leave, 'ease-in');
        if (hit) piece.classList.add('leaving');
      }, leave);
    });
  }

  /**
   * Mudança de fase: a permanente ondula como miragem ao sair de fase (e fica translúcida, pelo estado dela na mesa) e
   * se firma com um clarão ao voltar. Sem passo próprio: acontece junto com a jogada.
   */
  function phased(event: PresentationEvent) {
    const seen = new Set<number>();
    for (const one of event.grouped ?? [event]) {
      const id = one.card?.id ?? one.sourceId;
      if (id === undefined || seen.has(id)) continue;
      seen.add(id);
      const el = root.querySelector<HTMLElement>(`.field [data-fid="${id}"]`), at = center(el);
      if (!el || !at) continue;
      // Um aviso só para as que mudam juntas (lado a lado, os avisos se atropelavam).
      if (seen.size === 1) floatNumber({ ...at, h: at.h * .6 }, one.out ? 'Saiu de fase' : 'Voltou de fase', 'phase');
      if (reduced()) continue;
      gpu.play('flare', { at, color: one.out ? '#9fd3ff' : '#ffffff', duration: 620 });
      const slot = el.closest<HTMLElement>('.slot') ?? el;
      if (one.out) animate(slot, [{ scale: '1 1', translate: '0 0' }, { scale: '1.08 .94', translate: '4px 0', offset: .25 }, { scale: '.95 1.05', translate: '-4px 0', offset: .5 }, { scale: '1.03 .98', translate: '2px 0', offset: .75 }, { scale: '1 1', translate: '0 0' }], 640, 'ease-in-out');
      else animate(slot, [{ scale: '1.1 .92', opacity: .5 }, { scale: '.97 1.03', opacity: 1, offset: .55 }, { scale: '1 1', opacity: 1 }], 520, 'cubic-bezier(.2, .8, .2, 1)');
    }
  }
  return { extraTurn, copies, boost, cascade, phased };
}
