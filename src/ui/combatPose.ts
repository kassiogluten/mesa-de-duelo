// A pose do combate: cada atacante inclinado na direção de quem ele ataca e cada bloqueador à frente do atacante que
// bloqueia, enquanto o combate dura. Só ajusta variáveis de CSS nos slots; o movimento vem da transição do CSS.
import type { FState } from '../forge/client';
import { arrowRect } from './tableArrows';

/** Inclinação máxima do atacante, em graus. */
const MAX_TILT = 7;
/** Quanto do caminho até o atacante o bloqueador anda, e no máximo quantos pixels. */
const BLOCK_REACH = .3, BLOCK_MAX = 48;

/**
 * Inclinação (graus, sentido horário) de um atacante com o defensor a (dx, dy) dele: o topo da carta aponta para o
 * defensor. Subindo (dy < 0) e com o defensor à direita, gira no sentido horário; descendo, ao contrário.
 */
export function attackTilt(dx: number, dy: number): number {
  const deg = Math.atan2(dx, Math.abs(dy) || 1) * 180 / Math.PI;
  const tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, deg * .35)) * (dy > 0 ? -1 : 1);
  return Math.round(tilt * 2) / 2 || 0;
}
/** Quanto o bloqueador anda na direção do atacante a (dx, dy) dele. */
export function blockOffset(dx: number, dy: number): { x: number; y: number } {
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return { x: 0, y: 0 };
  const k = Math.min(dist * BLOCK_REACH, BLOCK_MAX) / dist;
  return { x: Math.round(dx * k), y: Math.round(dy * k) };
}

const middle = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
function setVar(el: HTMLElement, name: string, value: string | null) {
  if (value === null) { if (el.style.getPropertyValue(name)) el.style.removeProperty(name); return; }
  if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
}

/** Põe a pose do combate atual nos slots do campo (e tira dos que saíram do combate). Mede a mesa já desenhada. */
export function applyCombatPose(root: HTMLElement, s: FState) {
  const slotOf = (id: number | undefined) => id === undefined ? null : root.querySelector<HTMLElement>(`.field [data-fid="${id}"]`)?.closest<HTMLElement>('.slot') ?? null;
  const tilts = new Map<HTMLElement, string>(), offsets = new Map<HTMLElement, { x: number; y: number }>();
  for (const { attacker, defender, defenderKind, blockers } of s.combat ?? []) {
    const slot = slotOf(attacker);
    if (!slot) continue;
    const from = middle(slot.getBoundingClientRect());
    const to = defender === undefined ? undefined
      : (defenderKind ?? 'player') === 'player' ? arrowRect(root, `.avatar[data-pid="${defender}"]`) : arrowRect(root, `.field [data-fid="${defender}"]`);
    if (to) { const t = middle(to); tilts.set(slot, `${attackTilt(t.x - from.x, t.y - from.y)}deg`); }
    for (const id of blockers) {
      const blocker = slotOf(id);
      if (!blocker) continue;
      const b = middle(blocker.getBoundingClientRect());
      offsets.set(blocker, blockOffset(from.x - b.x, from.y - b.y));
    }
  }
  for (const slot of root.querySelectorAll<HTMLElement>('.field .slot')) {
    setVar(slot, '--atk-tilt', tilts.get(slot) ?? null);
    const o = offsets.get(slot);
    setVar(slot, '--blk-x', o ? `${o.x}px` : null);
    setVar(slot, '--blk-y', o ? `${o.y}px` : null);
  }
}
