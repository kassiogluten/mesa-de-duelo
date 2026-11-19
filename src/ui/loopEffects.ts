// As animações que ficam rodando no campo com a mesa parada (voar, vínculo com a vida, halo de alvo, mesa viva…), cada uma com o seu interruptor nas Opções, para o jogador medir quanto cada uma pesa no aparelho dele.
import { KEYS } from '../storage';
import { esc } from './cardtext';
import './loopEffects.css';

/**
 * Cada animação em loop. Desligada, ela para à vista (`data-fx-off` na mesa, loopEffects.css): o desenho fica parado,
 * como no degrau 1 do Efeitos automático, e o que só existe em movimento (vento do voar, seiva, luz da seta) some. A
 * mesa viva para no quadro em que está (gpuPort.ts).
 */
export const LOOP_EFFECTS = [
  { id: 'flying', name: 'Voar', hint: 'A criatura flutua, com a sombra e o vento por baixo.' },
  { id: 'hexproof', name: 'Resistência a magia', hint: 'O brilho que pulsa em volta da carta.' },
  { id: 'lifelink', name: 'Vínculo com a vida', hint: 'Os grãos verdes subindo pelas laterais da carta.' },
  { id: 'ward', name: 'Ward', hint: 'As runas da moldura acendendo e apagando.' },
  { id: 'base', name: 'Toque mortífero e ímpeto', hint: 'A névoa verde e a brasa balançando embaixo da carta.' },
  { id: 'crosshair', name: 'Mira de alvo', hint: 'A mira na carta que é alvo de algo na pilha.' },
  { id: 'phased', name: 'Fora de fase', hint: 'A carta ondulando como miragem.' },
  { id: 'sick', name: 'Enjoo de invocação', hint: 'A cor falhando e as estrelinhas girando.' },
  { id: 'targetable', name: 'Alvo possível', hint: 'O halo laranja que respira nas cartas e nos retratos que você pode escolher.' },
  { id: 'arrow', name: 'Luz na seta de alvo', hint: 'O brilho que corre pela seta até o alvo.' },
  { id: 'warning', name: 'Avisos de perigo', hint: 'O brilho do veneno perto do fim e do golpe letal previsto.' },
  { id: 'ambience', name: 'Mesa viva', hint: 'O fundo animado por baixo das cartas. É a mais pesada.' },
] as const;
export type LoopEffectId = typeof LOOP_EFFECTS[number]['id'];
const IDS = new Set<string>(LOOP_EFFECTS.map(e => e.id));

let cache: Set<LoopEffectId> | null = null;
/** As desligadas (gravadas neste aparelho; sem nada, todas ligadas). */
export function loopEffectsOff(): Set<LoopEffectId> {
  if (cache) return cache;
  let saved: unknown = null;
  try { saved = JSON.parse(localStorage.getItem(KEYS.loopEffectsOff) ?? 'null'); } catch { /* Storage is optional. */ }
  cache = new Set(Array.isArray(saved) ? saved.filter((id): id is LoopEffectId => typeof id === 'string' && IDS.has(id)) : []);
  return cache;
}
export const loopEffectOn = (id: LoopEffectId) => !loopEffectsOff().has(id);

/** Liga ou desliga uma (ou todas, sem `id`) e grava. */
export function setLoopEffect(id: LoopEffectId | null, on: boolean) {
  const off = loopEffectsOff();
  for (const each of id ? [id] : LOOP_EFFECTS.map(e => e.id)) { if (on) off.delete(each); else off.add(each); }
  try {
    if (off.size) localStorage.setItem(KEYS.loopEffectsOff, JSON.stringify([...off])); else localStorage.removeItem(KEYS.loopEffectsOff);
  } catch { /* Storage is optional. */ }
}

/** Põe na mesa as desligadas, para o CSS parar cada uma. */
export function applyLoopEffects(root: HTMLElement) {
  const off = [...loopEffectsOff()].join(' ');
  if (off) root.setAttribute('data-fx-off', off); else root.removeAttribute('data-fx-off');
}

/** Os interruptores, dentro de Opções → Aparência. */
export function loopEffectsHTML() {
  return LOOP_EFFECTS.map(e => `<li><span id="fLoop-${e.id}-label"><strong>${esc(e.name)}</strong><small>${esc(e.hint)}</small></span><button class="sound-switch" data-loop-effect="${e.id}" role="switch" aria-checked="true" aria-labelledby="fLoop-${e.id}-label"><span class="sound-switch-track" aria-hidden="true"><span></span></span></button></li>`).join('');
}
