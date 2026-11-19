// Animações de dano e ganho de vida: golpe ou projétil, número que sobe e retrato que acende (o golpe de comandante, com aura e coroa).
import type { PresentationEvent } from './presentationTimeline';
import { damageLook, type DamageLook } from './damageEffects';
import { center, reduced, type MotionKit } from './motionKit';
import { effectsTier } from './gpu/gpuSupport';
import type { createSurviveMotion } from './motionSurvive';
import { COMMANDER_GOLD, type createCommanderMotion } from './motionCommander';

const SKULL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a8 8 0 0 0-8 8c0 2.6 1.2 4.4 3 5.6V19a1 1 0 0 0 1 1h1v-2h2v2h2v-2h2v2h1a1 1 0 0 0 1-1v-3.4c1.8-1.2 3-3 3-5.6a8 8 0 0 0-8-8zm-3.5 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg>';

/** Quanto a cena fica parada no contato do golpe de combate, em ms: mais no golpe pesado e mais ainda no letal. */
export function hitStop(look: Pick<DamageLook, 'heavy' | 'lethal'>) {
  return look.lethal ? 150 : look.heavy ? 110 : 70;
}
/** Golpe de combate de `amount`: quanto o alvo é empurrado no sentido do golpe e quanto a mesa treme nesse sentido (px). */
export function knockback(amount: number, lethal: boolean) {
  return { push: Math.min(26, 8 + amount * 2.2), shake: Math.min(9, 2 + amount * .9) * (lethal ? 1.3 : 1) };
}
/** O sentido do golpe (vetor unitário), quanto a cena ficou parada no contato e o tamanho do dano. */
interface Blow { ux: number; uy: number; stop: number; amount: number }
const coarse = () => globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;

/** Dano e ganho de vida: o golpe ou o projétil até o alvo, o número que sobe e o retrato que acende. */
export function createDamageMotion(kit: MotionKit, survive: ReturnType<typeof createSurviveMotion>, commander: ReturnType<typeof createCommanderMotion>) {
  const { root, layer, later, animate, effect, remove, pulse, floatNumber, hiddenCards, recentStack, gpu } = kit;
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
  /** O que acende no alvo: a imagem da carta ou o retrato do jogador. */
  const faceOf = (target: ReturnType<typeof damageTarget>) =>
    target.el?.querySelector<HTMLElement>(target.player === undefined ? '.face' : '.portrait') ?? target.el;
  /**
   * O contato do golpe de combate: a camada de efeitos para por um instante e o alvo acende em branco; quando a cena
   * solta, vem o impacto, no sentido do golpe.
   */
  function contact(event: PresentationEvent, look: DamageLook, target: ReturnType<typeof damageTarget>, blow: Blow) {
    gpu.freeze(blow.stop);
    // Primeiro golpe (iniciativa ou a primeira metade do golpe duplo) e o segundo golpe do golpe duplo: um corte de
    // lâmina atravessa o alvo no contato; o segundo cruza o primeiro.
    if (event.combat && target.at && (event.step === 'first-strike' || event.doubleStrike)) survive.slash(target.at, Math.atan2(blow.uy, blow.ux), event.step !== 'first-strike');
    const face = faceOf(target);
    if (face && look.tone !== 'shield') {
      const total = blow.stop + 140;
      animate(face, [{ filter: 'brightness(3.2) saturate(0)' }, { filter: 'brightness(3.2) saturate(0)', offset: blow.stop / total }, { filter: 'none' }], total, 'linear');
    }
    later(() => impact(event, look, target, blow), blow.stop);
  }
  /** `calm`: sem sacudir a mesa no golpe pesado (no limpa campo, a onda já sacode uma vez). */
  function impact(event: PresentationEvent, look: DamageLook, target: ReturnType<typeof damageTarget>, blow?: Blow, calm = false) {
    const at = target.at!;
    pulse(target.el, look.tone !== 'shield');
    const size = Math.max(64, Math.min(150, (target.player === undefined ? at.w : 90) * (look.heavy ? 1.5 : 1.15)));
    // Na camada GPU, o impacto explode em faíscas na cor do dano (no golpe de combate, em leque no sentido dele e com a
    // onda curta); em CSS, o clarão redondo de sempre.
    const dir = blow ? Math.atan2(blow.uy, blow.ux) : undefined;
    if (reduced() || !gpu.play('burst', { at, tone: look.tone, size, heavy: look.heavy, lethal: look.lethal, dir })) {
      const burst = effect(`damage-impact ${look.tone}${look.heavy ? ' heavy' : ''}`, { ...at, w: size, h: size });
      animate(burst, [{ opacity: .95, scale: '.3' }, { opacity: .8, scale: '1', offset: .45 }, { opacity: 0, scale: '1.35' }], 520);
      later(() => remove(burst), 560);
    }
    const crowned = !!event.commander && target.player !== undefined && look.tone !== 'shield';
    floatNumber(at, look.amount, `${look.tone}${look.heavy ? ' heavy' : ''}${look.lethal ? ' lethal' : ''}${crowned ? ' commander' : ''}`, look.badges, look.deathtouch ? SKULL : '', !!blow);
    const card = target.player === undefined ? target.el : null;
    if (look.lethal && card && event.indestructible) {
      // Golpe letal numa indestrutível: ela racha com o golpe e as rachaduras se fecham em dourado.
      later(() => { const now = center(card); if (now && card.isConnected) survive.mend(now, 'indestructible'); }, 160);
    } else if (look.lethal && card) {
      // Golpe letal: a carta escurece; a ida para o cemitério vem no evento seguinte.
      card.classList.add('lethal-hit');
      later(() => card.classList.remove('lethal-hit'), 1100);
    }
    if (blow && target.el && !reduced()) shove(target, look, blow);
    else if (look.lethal && card) {
      animate(card, [{ translate: '0 0' }, { translate: '-4px 0', offset: .2 }, { translate: '4px 0', offset: .4 }, { translate: '-3px 0', offset: .6 }, { translate: '0 0' }], 380);
    }
    else if (event.combat && (event.delta ?? 0) > 0 && target.el && !reduced()) {
      // Golpe de combate: um tremor curto no alvo, mais forte quanto maior o dano.
      const a = Math.min(6, 1.5 + (event.delta ?? 0) * .6);
      animate(target.el, [{ translate: '0 0' }, { translate: `${-a}px 0`, offset: .25 }, { translate: `${(a * .6).toFixed(1)}px 0`, offset: .55 }, { translate: '0 0' }], 260);
    }
    // Golpe de comandante: a coroa se estampa no retrato e voa até o contador "Dano X/21" (motionCommander.ts).
    if (crowned) commander.hit(event, center(target.el?.querySelector('.portrait')) ?? at);
    if (blow || calm) return;
    const arena = look.heavy ? root.querySelector<HTMLElement>('.arena') : null;
    if (arena) animate(arena, [{ translate: '0 0' }, { translate: '-5px 2px', offset: .2 }, { translate: '4px -2px', offset: .45 }, { translate: '-2px 1px', offset: .7 }, { translate: '0 0' }], 320);
  }
  /**
   * Depois do contato: o alvo é empurrado no sentido do golpe (a carta gira um pouco; o retrato afunda) e volta com
   * mola, a mesa treme no mesmo sentido e, no golpe pesado, as cores do alvo se separam por um instante.
   */
  function shove(target: ReturnType<typeof damageTarget>, look: DamageLook, blow: Blow) {
    const el = target.el!, { ux, uy } = blow;
    const { push, shake } = knockback(blow.amount, look.lethal);
    const px = (k: number) => `${(ux * push * k).toFixed(1)}px ${(uy * push * k).toFixed(1)}px`;
    if (target.player !== undefined) {
      animate(el, [{ translate: '0 0', scale: '1' }, { translate: px(1), scale: '.9', offset: .18 }, { translate: px(-.25), scale: '1.04', offset: .5 }, { translate: '0 0', scale: '1' }], 520, 'ease-out');
    } else {
      const spin = (ux >= 0 ? 1 : -1) * Math.min(6, 1 + blow.amount * .7);
      animate(el, [{ translate: '0 0', rotate: '0deg' }, { translate: px(1), rotate: `${spin.toFixed(1)}deg`, offset: .2 }, { translate: px(-.2), rotate: `${(-spin * .3).toFixed(1)}deg`, offset: .55 }, { translate: '0 0', rotate: '0deg' }], look.lethal ? 600 : 480, 'ease-out');
    }
    // Cores separadas (vermelho para um lado, azul para o outro): só no golpe pesado, fora do celular e com os efeitos completos.
    const face = faceOf(target);
    if (face && look.heavy && effectsTier() < 1 && !coarse()) {
      const split = (k: number) => `drop-shadow(${(4 * k).toFixed(1)}px 0 0 #ff2a2aa6) drop-shadow(${(-4 * k).toFixed(1)}px 0 0 #28c8ffa6)`;
      animate(face, [{ filter: `brightness(1.8) ${split(1)}` }, { filter: `brightness(1.1) ${split(.5)}`, offset: .4 }, { filter: `brightness(1) ${split(0)}` }], 360, 'ease-out');
    }
    // A mesa treme no sentido do golpe (no degrau 2 do regulador, a mesa fica parada).
    const arena = effectsTier() < 2 ? root.querySelector<HTMLElement>('.arena') : null;
    const a = (k: number) => `${(ux * shake * k).toFixed(1)}px ${(uy * shake * k).toFixed(1)}px`;
    if (arena) animate(arena, [{ translate: '0 0' }, { translate: a(1), offset: .12 }, { translate: a(-.55), offset: .35 }, { translate: a(.25), offset: .6 }, { translate: '0 0' }], 380, 'ease-out');
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
    // Golpe de comandante: o contador volta para o número de antes até a coroa chegar nele.
    const crowned = !!event.commander && target.player !== undefined && !event.prevented;
    if (crowned) commander.prime(event);
    if (reduced() || look.motion === 'self' || Math.hypot(dx, dy) < 8) { impact(event, look, target); return; }
    if (look.motion === 'strike' && source.el && html) {
      // Luta (e atacante contra bloqueador que revida): as duas avançam juntas e se chocam no meio, em vez de chegar até o alvo.
      // O atacante toma impulso (recua e encolhe), dispara quase até o alvo deixando rastro, para no contato enquanto a
      // cena congela, e volta com mola. Uma cópia faz o trajeto porque as fileiras do campo cortam o que sai delas; a
      // carta de verdade some enquanto isso.
      const tapped = !!source.el.closest('.tapped');
      const box = { ...from, w: tapped ? from.h : from.w, h: tapped ? from.w : from.h };
      // O comandante avança com aura e rastro dourados, e os grãos dourados se juntam nele no impulso.
      const ghost = effect(`presentation-piece strike-ghost${crowned ? ' commander' : ''}`, box, html);
      const turn = tapped ? '90deg' : '0deg';
      const dist = Math.hypot(dx, dy), ux = dx / dist, uy = dy / dist;
      const reach = event.fight || event.clash ? .42 : Math.max(0, 1 - (Math.min(to.w, to.h) * .55 + Math.min(from.w, from.h) * .4) / dist);
      const travel = Math.round(duration * .9);
      const stop = Math.round(Math.min(hitStop(look), travel * .18)), wind = travel * .27, dash = travel * .13, hit = wind + dash;
      const recoil = Math.min(22, dist * .12);
      // Ponto do caminho do disparo: 0 é o fim do impulso (recuado), 1 é o contato.
      const along = (k: number) => `${(-ux * recoil + (dx * reach + ux * recoil) * k).toFixed(1)}px ${(-uy * recoil + (dy * reach + uy * recoil) * k).toFixed(1)}px`;
      source.el.style.opacity = '0'; hiddenCards.add(source.el);
      // Na camada GPU, riscos de velocidade acompanham o disparo até o ponto do choque.
      if (crowned) gpu.play('glint', { at: from, color: COMMANDER_GOLD });
      gpu.play('streak', { from, to: { ...from, cx: from.cx + dx * reach, cy: from.cy + dy * reach }, duration: dash, delay: wind, ...(crowned ? { color: COMMANDER_GOLD } : {}) });
      animate(ghost, [
        { translate: '0 0', scale: '1', rotate: turn, easing: 'ease-out' },
        { translate: along(0), scale: '.95', rotate: turn, offset: wind / travel, easing: 'cubic-bezier(.7, 0, 1, .6)' },
        { translate: along(1), scale: '1.1', rotate: turn, offset: hit / travel },
        { translate: along(1), scale: '1.1', rotate: turn, offset: (hit + stop) / travel, easing: 'cubic-bezier(.2, 1.4, .4, 1)' },
        { translate: '0 0', scale: '1', rotate: turn }], travel, 'linear');
      // O rastro: duas cópias apagando no caminho do disparo (só com os efeitos completos).
      if (!reduced() && effectsTier() < 1) for (const k of [.15, .45]) later(() => {
        const trail = effect(`presentation-piece strike-trail${crowned ? ' commander' : ''}`, box, html);
        animate(trail, [{ translate: along(k), rotate: turn, scale: '1', opacity: .4 }, { translate: along(k), rotate: turn, scale: '1', opacity: 0 }], 170, 'linear');
        later(() => remove(trail), 190);
      }, wind + dash * (k + .35));
      later(() => contact(event, look, target, { ux, uy, stop, amount: Math.abs(event.delta ?? 0) }), hit);
      later(() => { remove(ghost); if (source.el && hiddenCards.delete(source.el)) source.el.style.opacity = ''; }, travel);
      return;
    }
    const travel = Math.round(duration * .55);
    if (source.el) pulse(source.el);
    // Na camada GPU, o projétil deixa um rastro de brasas; o impacto sai no mesmo tempo que o de CSS.
    if (gpu.play('bolt', { from, to, tone: look.tone, duration: travel })) { later(() => impact(event, look, target), travel); return; }
    const bolt = effect(`damage-bolt ${look.tone}`, { ...from, w: 22, h: 22 });
    bolt.style.cssText += `;--angle:${Math.atan2(dy, dx)}rad`;
    animate(bolt, [{ translate: '0 0', scale: '.6', opacity: .6 }, { translate: `${dx * .4}px ${dy * .4}px`, scale: '1.1', opacity: 1, offset: .5 }, { translate: `${dx}px ${dy}px`, scale: '1', opacity: 1 }], travel, 'cubic-bezier(.45, 0, .85, .55)');
    later(() => { remove(bolt); impact(event, look, target); }, travel);
  }
  /** Ganho de vida (vínculo com a vida ou qualquer outro): "+N" verde subindo do retrato; na camada GPU, com grãos verdes subindo. */
  function heal(event: PresentationEvent) {
    const avatar = event.actor === undefined ? null : root.querySelector<HTMLElement>(`.avatar[data-pid="${event.actor}"]`);
    const at = center(avatar?.querySelector('.life') ?? avatar);
    if (!avatar || !at || !event.delta || event.delta <= 0) return;
    avatar.classList.add('heal-flash');
    later(() => avatar.classList.remove('heal-flash'), 850);
    floatNumber(at, `+${event.delta}`, 'heal');
    if (!reduced()) gpu.play('heal', { at });
  }
  /** Limpa campo de dano: o dano chega a este alvo quando a onda passa por ele, sem o projétil. */
  function hit(event: PresentationEvent) {
    const target = damageTarget(event);
    if (target.at) impact(event, damageLook(event), target, undefined, true);
  }
  return { damage, heal, hit, damageTarget };
}
