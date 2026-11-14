// Animações de habilidades (gatilhos, ativadas, lealdade) e do planeswalker chegando ao campo.
import type { PresentationEvent } from './presentationTimeline';
import { loyaltyLook, walkerTone, type LoyaltyLook } from './planeswalkerEffects';
import { center, reduced, type MotionKit } from './motionKit';

const MAX_CALLOUTS = 3;
const TRIGGER_ICON = '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>';
const ACTIVATED_ICON = '<svg viewBox="0 0 24 24"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.4 5-.1-3 2-1.6-2-3.4-2.4 1a8 8 0 0 0-2.6-1.5L15 2.5h-4l-.4 2.5A8 8 0 0 0 8 6.5l-2.4-1-2 3.4 2 1.6-.1 3-2 1.6 2 3.4 2.4-1A8 8 0 0 0 10.6 19l.4 2.5h4l.4-2.5a8 8 0 0 0 2.6-1.5l2.4 1 2-3.4z"/></svg>';

/** O texto da habilidade sem o nome da carta na frente ("Jace Beleren - +2: Each player draws a card." → "+2: Each…"). */
export function abilityText(event: PresentationEvent) {
  const text = (event.text ?? '').trim();
  const name = event.card?.name;
  return name && text.startsWith(`${name} - `) ? text.slice(name.length + 3) : text;
}

/** Habilidades (gatilhos, ativadas, lealdade) e o planeswalker chegando ao campo. */
export function createAbilityMotion(kit: MotionKit) {
  const { root, layer, later, animate, effect, track, remove, pulse, floatNumber, callouts, gpu } = kit;
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
    // Na camada GPU, a onda é de luz e solta faíscas; em CSS, o anel de sempre.
    if (!gpu.play('shockwave', { at: from, color: tone, reach: size * 1.1 })) {
      const wave = effect('walker-wave', { ...from, w: size, h: size });
      wave.style.setProperty('--walker', tone);
      animate(wave, [{ opacity: .9, scale: '.05' }, { opacity: .55, scale: '.6', offset: .5 }, { opacity: 0, scale: '1.1' }], 1100, 'cubic-bezier(.2,.6,.3,1)');
      later(() => remove(wave), 1150);
    }
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
      // Na camada GPU, grãos de luz sobem em volta da carta (dourados na habilidade ativada, violeta no gatilho).
      if (!look) { const at = center(card); if (at) gpu.play('motes', { at, color: event.trigger ? '#9b7bff' : '#f2b54c' }); }
      if (look) loyaltyAbility(look, card, event);
      // Habilidade ativada: a carta se ergue um pouco da mesa enquanto a habilidade sai dela, e assenta de novo.
      else if (!event.trigger) animate(card, [
        { translate: '0 0', scale: '1', filter: 'none' },
        { translate: '0 -9px', scale: '1.05', filter: 'drop-shadow(0 14px 12px rgb(0 0 0 / .45))', offset: .28 },
        { translate: '0 -9px', scale: '1.05', filter: 'drop-shadow(0 14px 12px rgb(0 0 0 / .45))', offset: .72 },
        { translate: '0 0', scale: '1', filter: 'none' }], Math.max(600, options.duration), 'cubic-bezier(.3,.7,.4,1)');
      // Um aviso por carta, e poucos de uma vez: vários gatilhos seguidos não viram uma pilha de balões.
      for (const old of callouts.filter(c => c.card === card)) remove(old.note);
      while (callouts.length >= MAX_CALLOUTS) remove(callouts[0]!.note); // MAX_CALLOUTS > 0: a lista não está vazia
      const hold = Math.max(options.duration, options.calloutDuration ?? 0);
      const note = document.createElement('div');
      note.className = `ability-callout${event.trigger ? ' trigger' : ''}${look ? ` loyalty ${look.tone}` : ''}${look?.ultimate ? ' ultimate' : ''}`;
      note.setAttribute('aria-hidden', 'true');
      // Raio para gatilho, engrenagem para habilidade ativada, o escudo com o custo na de lealdade; o texto diz qual é.
      if (look) {
        const chip = document.createElement('b'); chip.className = 'loyalty-chip'; chip.textContent = look.cost || '0';
        note.append(chip);
      } else note.innerHTML = event.trigger ? TRIGGER_ICON : ACTIVATED_ICON;
      const text = document.createElement('span'); text.textContent = options.label;
      const detail = look ? abilityText(event) : '';
      if (detail) { const small = document.createElement('small'); small.textContent = detail; text.append(small); }
      note.append(text);
      track(note); callouts.push({ note, card });
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
    const piece = effect('presentation-piece', kit.stage(), options.html);
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
      // Na camada GPU, um feixe de luz corre até o alvo e estoura em faíscas; em CSS, a linha de sempre.
      if (gpu.play('beam', { from, to, color: event.trigger ? '#9b7bff' : '#f2b54c', delay: i * 60 })) return;
      const beam = effect(`ability-beam${event.trigger ? ' trigger' : ''}`, { cx: from.cx, cy: from.cy, w: length, h: 4 });
      beam.style.cssText += `;--angle:${Math.atan2(dy, dx)}rad`;
      animate(beam, [{ scale: '0 1', opacity: .9 }, { scale: '1 1', opacity: 1, offset: .45 }, { scale: '1 1', opacity: 0 }], 700, 'ease-out', i * 60);
      later(() => remove(beam), 760 + i * 60);
    });
  }
  return { ability, walkerArrive };
}
