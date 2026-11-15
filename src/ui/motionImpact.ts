// Momentos grandes e a mesa viva reagindo ao jogo: mágica de valor 6 ou mais, ultimate e golpe letal escurecem a mesa em volta e aproximam a câmera; lendária entra com raios; mágica resolvendo acende a mesa e golpe pesado a sacode.
import type { FCard } from '../forge/client';
import type { PresentationEvent } from './presentationTimeline';
import { damageLook } from './damageEffects';
import { center, type MotionKit, type Point } from './motionKit';
import { bigSpell, legendaryEntry } from './impactRules';
import { effectsTier } from './gpu/gpuSupport';

/** O que faz da jogada um momento grande, ou nada. */
export function impactOf(event: PresentationEvent): 'big-spell' | 'ultimate' | 'lethal' | 'legend' | null {
  if (bigSpell(event)) return 'big-spell';
  if (event.type === 'ability-activated' && event.ultimate) return 'ultimate';
  if (event.type === 'damage' && event.lethal && !event.prevented && !!event.targets?.players?.length) return 'lethal';
  if (legendaryEntry(event)) return 'legend';
  return null;
}

const MANA_LIGHT: Record<string, [number, number, number]> = {
  W: [1, .95, .78], U: [.45, .7, 1], B: [.7, .5, .95], R: [1, .45, .3], G: [.45, .9, .5],
};
/** A cor da luz de uma carta: a média das cores do custo dela; incolor, dourado. */
export function cardLight(card: Pick<FCard, 'manaCost'> | undefined): [number, number, number] {
  const colors = [...new Set((card?.manaCost ?? '').match(/[WUBRG]/g) ?? [])].map(c => MANA_LIGHT[c]!);
  if (!colors.length) return [1, .8, .45];
  return [0, 1, 2].map(i => colors.reduce((sum, c) => sum + c[i]!, 0) / colors.length) as [number, number, number];
}
const hex = (rgb: [number, number, number]) => `#${rgb.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;

export function createImpactMotion(kit: MotionKit) {
  const { root, animate, gpu } = kit;
  /** Onde o momento acontece: a pilha (mágica), a carta (ultimate, lendária) ou o retrato atingido (letal). */
  function focusOf(event: PresentationEvent, kind: NonNullable<ReturnType<typeof impactOf>>): Point | undefined {
    if (kind === 'big-spell') return center(kit.stackPile()) ?? kit.recentStack() ?? kit.stage();
    if (kind === 'lethal') {
      const player = event.targets?.players?.[0];
      return center(root.querySelector(`.avatar-slot [data-pid="${player}"]`)) ?? kit.stage();
    }
    const id = event.card?.id ?? event.sourceId;
    return center(root.querySelector(`.field [data-fid="${id}"]`)) ?? kit.stage();
  }
  /** A câmera chega um pouco mais perto do foco e volta. */
  function push(at: Point, duration: number, delay: number, zoom = 1.012) {
    const arena = root.querySelector<HTMLElement>('.arena');
    if (!arena) return;
    arena.style.transformOrigin = `${Math.round(at.cx)}px ${Math.round(at.cy)}px`;
    animate(arena, [{ scale: '1' }, { scale: String(zoom), offset: .3 }, { scale: String(zoom), offset: .7 }, { scale: '1' }], duration, 'cubic-bezier(.4,0,.2,1)', delay);
  }
  /** Chamado em cada passo da apresentação, antes do efeito da própria jogada. */
  function observe(event: PresentationEvent, duration: number) {
    if (document.hidden || root.hidden) return;
    // A mesa viva reage: a mágica resolvendo acende a mesa na cor dela; o golpe pesado a sacode.
    if (event.type === 'resolved' && !event.repeat && event.card && !event.trigger) gpu.ambiencePulse({ flash: cardLight(event.card) });
    if (event.type === 'damage' && !event.prevented) {
      const look = damageLook(event);
      if (look.heavy) gpu.ambiencePulse({ quake: look.lethal ? 1 : .6 });
    }
    const kind = impactOf(event);
    if (!kind) return;
    const at = focusOf(event, kind);
    if (!at) return;
    // A lendária: a cena começa quando a carta chega ao lugar dela.
    const delay = kind === 'legend' ? Math.round(duration * .35) : 0;
    const length = Math.max(duration, kind === 'legend' ? 700 : 1000);
    // A lendária é só um toque (pedido duas vezes em 14/11/2026): raios fracos no lugar dela, sem escurecer a mesa nem
    // mexer a câmera.
    if (kind === 'legend') { gpu.play('legend', { at, color: hex(cardLight(event.card)), delay }); return; }
    // Reduzido em 14/11/2026: a mesa escurece de leve em volta e a câmera quase não se mexe.
    gpu.ambiencePulse({ dim: { amount: .4, ms: length * .7 } });
    gpu.play('spotlight', { at, radius: Math.max(at.w, at.h) * 1.1 + 40, duration: length, delay, strength: .22 });
    // No degrau 2 do regulador a câmera fica parada: mexer na mesa inteira é o que mais pesa.
    if (effectsTier() < 2) push(at, length, delay);
  }
  return { observe };
}
