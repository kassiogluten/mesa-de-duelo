// Animações entre permanentes: ataque, bloqueio, anexar, controle, marcadores, mana, transformar e as estrelinhas do enjoo de invocação.
import type { PresentationEvent } from './presentationTimeline';
import { center, LANDING, reduced, SETTLE, sideOf, type MotionKit, type Point, type Snap } from './motionKit';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
/** O que sobe de uma permanente que ganhou marcadores: o capítulo da saga, +N/+N, −N/−N, ou nada para os outros. */
export function counterText(kind: string, n: number, lore: number) {
  return lore ? `Capítulo ${ROMAN[lore] ?? lore}` : /^P\d+P\d+$/.test(kind) ? `+${n}/+${n}` : /^M\d+M\d+$/.test(kind) ? `−${n}/−${n}` : '';
}

/** Quanto dura a virada da carta na camada GPU, e quantas viram lá na mesma jogada. */
const TURN_MS = 780, TURN_LIMIT = 4;

/** O que acontece entre permanentes no campo: ataque, bloqueio, anexar, troca de controle, marcadores, mana e transformar. */
export function createBoardMotion(kit: MotionKit) {
  const { root, state, layer, later, animate, effect, remove, pulse, floatNumber, fly, land, ripple, hiddenCards, gpu, flare, toneOf } = kit;
  /**
   * Ataque é só vermelho: o dourado fica para seleção e bloqueio. Cada atacante recua um pouco e avança na direção do
   * oponente (para cima, se está na metade de baixo da mesa), um depois do outro, e volta com mola.
   */
  function attackers(label: string, duration: number) {
    const middle = center(layer())?.cy ?? 0;
    root.querySelectorAll<HTMLElement>('.slot.attacking > .bfc').forEach((el, i) => {
      pulse(el, 'attack-highlight');
      const at = center(el), ahead = (at?.cy ?? 0) > middle ? -1 : 1;
      // Na camada GPU, riscos de velocidade e poeira saem de trás do atacante no bote.
      if (at && !reduced()) {
        gpu.play('charge', { at, ahead, delay: Math.min(i, 8) * 70 });
        // E um anel vermelho no chão, no bote.
        gpu.play('arrive', { at, color: '#ec5a3f', size: Math.max(at.w, at.h) * 1.05, delay: Math.min(i, 8) * 70 + 560 * .3 });
      }
      animate(el, [{ translate: '0 0' }, { translate: `0 ${-7 * ahead}px`, offset: .3 }, { translate: `0 ${16 * ahead}px`, scale: '1.04', offset: .55 }, { translate: '0 0', scale: '1' }],
        560, 'cubic-bezier(.3,.7,.4,1)', Math.min(i, 8) * 70);
    });
    const banner = effect('combat-banner', { cx: 0, cy: 0, w: 0, h: 0 });
    banner.removeAttribute('style');
    banner.textContent = label;
    if (!reduced()) animate(banner, [{ opacity: 0, scale: '.96' }, { opacity: 1, scale: '1', offset: .15 }, { opacity: 1, offset: .8 }, { opacity: 0 }], duration);
    later(() => remove(banner), duration);
  }
  /**
   * Bloqueio: a pose do combate (combatPose.ts) já leva cada bloqueador até a frente do atacante e o deixa lá; aqui o
   * bloqueador acende e a ligação entre os dois corre do bloqueador ao atacante.
   */
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
        const delay = Math.min(order++, 8) * 70;
        animate(el, [{ scale: '1' }, { scale: '1.06', offset: .45 }, { scale: '1' }], 420, 'cubic-bezier(.3,.7,.4,1)', delay);
        // Na camada GPU, o bloqueador ergue um escudo dourado e a ligação vira um feixe.
        gpu.play('arrive', { at: b, color: '#f2b54c', size: Math.max(b.w, b.h) * 1.15, delay });
        if (gpu.play('beam', { from: b, to: a, color: '#f2b54c', delay })) continue;
        const link = effect('ability-beam block-link', { cx: b.cx, cy: b.cy, w: dist, h: 3 });
        link.style.cssText += `;--angle:${Math.atan2(dy, dx)}rad`;
        animate(link, [{ scale: '0 1', opacity: .9 }, { scale: '1 1', opacity: 1, offset: .45 }, { scale: '1 1', opacity: 0 }], 720, 'ease-out', delay);
        later(() => remove(link), 760 + delay);
      }
    }
    // Sem o quadro do combate (ponte antiga), só o destaque de sempre.
    root.querySelectorAll<HTMLElement>('.slot.blocking > .bfc').forEach(el => { if (!blocked.has(el.dataset.fid ?? '')) pulse(el); });
  }
  /** Equipar ou encantar: a criatura recebe a carta com um pulso e um anel dourado; a carta presa acende ao encaixar. */
  function attach(event: PresentationEvent, card: HTMLElement | null) {
    const hostId = event.targets?.cards?.[0], player = event.targets?.players?.[0];
    const host = hostId !== undefined ? root.querySelector<HTMLElement>(`.field [data-fid="${hostId}"]`) : player !== undefined ? root.querySelector<HTMLElement>(`.avatar[data-pid="${player}"]`) : null;
    if (card) later(() => flare(card, '#ffe2a0', [{ filter: 'brightness(1.9) drop-shadow(0 0 10px #ffe2a0)' }, { filter: 'none' }]), event.moved ? SETTLE.duration * .6 : 0);
    if (!host) return;
    later(() => {
      pulse(host);
      animate(host, [{ scale: '1.07' }, { scale: '1' }], LANDING.duration, LANDING.easing);
      const at = center(host);
      if (!at || reduced()) return;
      // Na camada GPU: um anel dourado que se abre com faíscas e um brilho em volta da criatura.
      if (gpu.play('arrive', { at, color: '#ffe2a0', size: Math.max(at.w, at.h) * 1.2 })) { gpu.play('flare', { at, color: '#f2b54c', duration: 560 }); return; }
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
      // Na camada GPU: anel e brilho na cor de quem passou a controlar (dourado se é você, vermelho se é o oponente).
      const tone = mine ? '#f2b54c' : '#ff6a4d';
      if (gpu.play('arrive', { at, color: tone, size: Math.max(at.w, at.h) * 1.25 })) { gpu.play('flare', { at, color: tone, duration: 620 }); return; }
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
      const text = counterText(kind, n, lore);
      if (text) floatNumber({ ...at, h: at.h * .6 }, text, `counter-float${/^M\d+M\d+$/.test(kind) ? ' harmful' : ''}${lore ? ' lore' : ''}`);
      // Na camada GPU: +N/+N solta faíscas verdes para cima; −N/−N, roxas caindo.
      if (text && !lore && !reduced()) gpu.play('counter', { at, harmful: /^M\d+M\d+$/.test(kind) });
      if (/^P\d+P\d+$/.test(kind) && n > 0) grow(el);
    }
  }
  /** +N/+N: uma onda verde sobe pela carta e o P/T pisca. É o único destaque: a carta não fica com brilho depois. */
  function grow(card: HTMLElement) {
    if (reduced()) return;
    const surge = document.createElement('span');
    surge.className = 'counter-surge';
    surge.setAttribute('aria-hidden', 'true');
    surge.innerHTML = '<i></i>';
    card.append(surge);
    later(() => surge.remove(), 1000);
    const pt = card.querySelector<HTMLElement>(':scope > .pt');
    if (pt) animate(pt, [{ scale: '1', filter: 'none' }, { scale: '1.3', filter: 'brightness(1.6) drop-shadow(0 0 5px #7dffae)', offset: .3 }, { scale: '1', filter: 'none' }], 1000, 'ease-out');
  }
  /**
   * A mana sai do terreno que acabou de virar e voa até o custo que falta pagar, na caixa de ação; com `player`, ela foi
   * para a reserva, e voa até o retrato dele, que pulsa quando ela chega.
   */
  function manaOrb(card: HTMLElement, tone: string, delay: number, player?: number) {
    const portrait = player === undefined ? null : root.querySelector<HTMLElement>(`.avatar[data-pid="${player}"] .portrait`);
    const from = center(card), to = center(player === undefined ? root.querySelector('#fAction .prompt-short') ?? root.querySelector('#fAction') : portrait);
    if (!from || !to || reduced()) return;
    if (player !== undefined) later(() => {
      // A mesa pode ter sido redesenhada no meio do voo: a reserva é procurada de novo na chegada.
      const pool = root.querySelector<HTMLElement>(`.avatar[data-pid="${player}"] .pool`) ?? root.querySelector<HTMLElement>(`.avatar[data-pid="${player}"] .portrait`);
      if (pool) animate(pool, [{ transform: 'scale(1)' }, { transform: 'scale(1.16)', offset: .35 }, { transform: 'scale(1)' }], LANDING.duration, LANDING.easing);
    }, delay + 600);
    // Na camada GPU: um orbe de luz com rastro de grãos, que estoura ao chegar no custo ou no retrato.
    if (gpu.play('mana', { from, to, color: tone, duration: 620, delay })) return;
    const orb = effect('mana-orb', { ...from, w: 18, h: 18 });
    orb.style.setProperty('--mana', tone);
    const dx = to.cx - from.cx, dy = to.cy - from.cy;
    animate(orb, [
      { translate: '0 0', scale: '.4', opacity: 0 },
      { translate: `${dx * .1}px ${dy * .1 - 22}px`, scale: '1.2', opacity: 1, offset: .25 },
      { translate: `${dx}px ${dy}px`, scale: '.7', opacity: .9 }], 620, 'cubic-bezier(.4,0,.3,1)', delay);
    later(() => remove(orb), 640 + delay);
  }
  /**
   * Na camada GPU, a carta sobe, vira de verdade (a face de antes, `before.side`, e depois a nova) e pousa, com a carta
   * da mesa escondida enquanto isso. Diz se virou lá; sem a camada ou sem a textura da face de antes, não.
   */
  /**
   * As cartas escondidas enquanto viram na camada GPU, pelo número delas. A mesa pode redesenhar no meio da virada, e o
   * desenho novo tira o estilo da carta: `keepTurning` a esconde de novo a cada desenho, até a virada acabar ou os
   * efeitos serem limpos (`clears`). Escondida por `visibility`, e não por `opacity` como as dos voos.
   */
  const turning = new Map<number, { started: number; clears: number }>();
  const fieldCard = (id: number) => root.querySelector<HTMLElement>(`.field [data-fid="${id}"]`);
  function keepTurning() {
    for (const [id, turn] of turning) {
      const el = turn.clears === kit.clears() ? fieldCard(id) : null;
      if (!el) { turning.delete(id); continue; }
      if (el.style.visibility !== 'hidden') { el.style.visibility = 'hidden'; hiddenCards.add(el); }
    }
  }
  /**
   * Na camada GPU, a carta sobe, vira de verdade (a face de antes, `before.side`, e depois a nova) e pousa, com a carta
   * da mesa escondida enquanto isso. Diz se virou lá; sem a camada ou sem a textura da face de antes, não.
   */
  function turn3d(id: number, el: HTMLElement, before: Snap | undefined) {
    const face = el.querySelector<HTMLElement>('.face') ?? el, box = center(face);
    const from = before?.side, to = sideOf(el);
    if (!box || !from || !to) return false;
    const started = performance.now();
    const done = (landed: boolean) => {
      const turn = turning.get(id);
      if (turn?.started !== started) return;
      turning.delete(id);
      const shown = turn.clears === kit.clears() ? fieldCard(id) : null;
      if (!shown) return;
      hiddenCards.delete(shown); shown.style.visibility = '';
      // A imagem da face nova não chegou a tempo: a carta da mesa termina o giro, do lado em que a de cima parou.
      if (landed) ripple(center(shown)); else animate(shown, [{ rotate: 'y 90deg', scale: '1.08', filter: 'brightness(1.8)' }, { rotate: 'y 0deg', scale: '1', filter: 'none' }], 320, 'cubic-bezier(.3,.7,.4,1)');
    };
    // O tamanho da carta em pé (a caixa dela na tela vem deitada quando está virada).
    const at = { ...box, w: face.offsetWidth || box.w, h: face.offsetHeight || box.h };
    if (!gpu.play('cardTurn', { at, rot: el.closest('.tapped') ? 90 : 0, from, to, edge: toneOf(el), duration: TURN_MS, done })) return false;
    turning.set(id, { started, clears: kit.clears() });
    keepTurning();
    // Se a camada cair no meio da virada, a carta volta a aparecer sozinha.
    later(() => done(true), TURN_MS + 700);
    return true;
  }
  function transformed(ids: number[], flat = false) {
    if (document.hidden || root.hidden || reduced()) return;
    let turns = 0;
    for (const id of ids) {
      const el = root.querySelector<HTMLElement>(`.field [data-fid="${id}"]`);
      if (!el) continue;
      // Muitas de uma vez (ou dia e noite, `flat`): só as primeiras sobem; as outras giram no lugar.
      if (!flat && turns < TURN_LIMIT && !turning.has(id) && turn3d(id, el, state.cards.get(String(id)))) { turns++; continue; }
      // Gira no lugar como uma carta virando de lado e mostra a face nova, com um brilho no meio do giro.
      animate(el, [{ rotate: 'y 0deg', scale: '1', filter: 'none' }, { rotate: 'y 90deg', scale: '1.08', filter: 'brightness(1.8)', offset: .45 }, { rotate: 'y 0deg', scale: '1', filter: 'none' }], 620, 'cubic-bezier(.3,.7,.4,1)');
      later(() => ripple(center(el)), 320);
    }
  }
  /**
   * Enjoo de invocação, só na camada GPU (com efeitos leves fica o selo de sempre): as estrelinhas giram em volta de
   * quem ficou tonto, depois de a carta pousar, e voam embora de quem deixou de estar.
   */
  function dizzy(arrived: number[], cleared: number[]) {
    if (document.hidden || root.hidden || reduced()) return;
    const spot = (id: number) => {
      const el = root.querySelector<HTMLElement>(`.field [data-fid="${id}"]`), at = center(el);
      return at ? { at, tag: center(el!.querySelector('.tag.zzz')) ?? undefined } : null;
    };
    arrived.forEach((id, i) => { const one = spot(id); if (one) gpu.play('dizzy', { ...one, delay: LANDING.duration + 260 + i * 60 }); });
    // O selo já sumiu do desenho novo: as estrelinhas saem do alto da carta.
    cleared.forEach((id, i) => { const one = spot(id); if (one) gpu.play('undizzy', { at: one.at, delay: i * 60 }); });
  }
  return { attackers, blocks, attach, control, counters, manaOrb, transformed, keepTurning, dizzy };
}
