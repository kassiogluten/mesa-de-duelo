import type { FState } from '../forge/client';
import type { PresentationEvent } from './presentationTimeline';

export interface StackPresentation {
  stack: FState['stack'];
  replaying: boolean;
}

/** Real pending effects always win. Recorded public frames are inspection-only playback. */
export function stackPresentation(state: FState, event?: PresentationEvent | null): StackPresentation {
  const live = { stack: state.stack, replaying: false };
  if (state.stack.length || state.gameOver || state.sideboarding || state.question) return live;
  const input = state.input;
  // A later, ordinary priority window must not erase an opponent's coalesced cast.
  // Actual choices still replace playback immediately; no frame supplies game input.
  if (input.opening || input.paying || input.targeting || input.blocking || input.suspendCast || input.selection ||
      input.selectable.length || input.selectableStacks?.length || input.selectablePlayers?.length ||
      (!input.priority && (input.ok.enabled || input.cancel.enabled || input.actionable?.length))) return live;
  const stack = event?.frame?.stack;
  return stack?.length ? { stack, replaying: true } : live;
}

type StackItem = FState['stack'][number];

/** Why an item is on the stack, as the table labels it. */
export const STACK_KINDS = {
  spell: { label: 'Mágica', mine: 'Sua mágica', by: (who: string) => `Mágica conjurada por ${who}`, icon: '<path d="M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4Z"/>' },
  ability: { label: 'Habilidade', mine: 'Sua habilidade ativada', by: (who: string) => `Habilidade ativada por ${who}`, icon: '<path d="M8 2.5a5.5 5.5 0 1 0 5.2 3.7l-1.9.7A3.5 3.5 0 1 1 8 4.5V7l3.5-3.5L8 0Z"/>' },
  trigger: { label: 'Gatilho', mine: 'Seu gatilho', by: (who: string) => `Gatilho de ${who}`, icon: '<path d="M9.5 1 3 9h4l-1 6 6.5-8h-4Z"/>' },
} as const;

/** "Sua mágica", "Gatilho de Ana"... Older bridges send no kind: just the controller's name. */
export function stackOwnerLine(item: StackItem, you: number, owner?: string): string {
  const kind = item.kind && STACK_KINDS[item.kind];
  if (!kind) return owner ?? 'Efeito';
  if (item.controller === you) return kind.mine;
  return owner ? kind.by(owner) : kind.label;
}

type StackCast = NonNullable<StackItem['cast']>;

/** Forma de conjurar: o nome curto do selo e como a frase da galeria começa. */
const CAST_MODES: Record<string, [string, string]> = {
  flashback: ['Flashback', 'Conjurada por flashback'],
  escape: ['Fuga', 'Conjurada por fuga'],
  harmonize: ['Harmonizar', 'Conjurada por harmonizar'],
  retrace: ['Retraçar', 'Conjurada por retraçar'],
  jumpstart: ['Jump-start', 'Conjurada por jump-start'],
  evoke: ['Evocar', 'Conjurada por evocar'],
  dash: ['Dash', 'Conjurada por dash'],
  blitz: ['Blitz', 'Conjurada por blitz'],
  madness: ['Loucura', 'Conjurada por loucura'],
  overload: ['Sobrecarga', 'Conjurada com sobrecarga'],
  bestow: ['Agraciar', 'Conjurada por agraciar'],
  disturb: ['Perturbar', 'Conjurada por perturbar'],
  prowl: ['Rondar', 'Conjurada por rondar'],
  spectacle: ['Espetáculo', 'Conjurada por espetáculo'],
  surge: ['Surto', 'Conjurada por surto'],
  emerge: ['Emergir', 'Conjurada por emergir'],
  mutate: ['Mutação', 'Conjurada por mutação'],
  awaken: ['Despertar', 'Conjurada por despertar'],
  warp: ['Dobra', 'Conjurada por dobra'],
  adventure: ['Aventura', 'Conjurada como aventura'],
  omen: ['Presságio', 'Conjurada como presságio'],
  aftermath: ['Consequência', 'Conjurada a metade de consequência'],
  facedown: ['Virada', 'Conjurada virada para baixo'],
  plotted: ['Tramada', 'Conjurada tramada, sem pagar o custo de mana'],
  foretold: ['Prevista', 'Conjurada prevista, pelo custo previsto'],
};

/** Custos opcionais pagos: o nome curto do selo e o pedaço da frase da galeria. */
const CAST_EXTRAS: Record<string, [string, string]> = {
  buyback: ['Recompra', 'com recompra'],
  entwine: ['Entrelaçada', 'com entrelaçar'],
  bargain: ['Barganha', 'com barganha'],
  gift: ['Presente', 'com o presente prometido'],
  teamwork: ['Em equipe', 'com trabalho em equipe'],
  offering: ['Oferenda', 'por oferenda'],
  flash: ['Lampejo', 'pagando a mais para ter lampejo'],
  extra: ['Custo extra', 'com o custo adicional pago'],
};

/** O que mais pesa no selo pequeno: a forma de conjurar, depois o reforço, os outros opcionais e o X. */
export function stackCastTag(cast?: StackCast): string {
  if (!cast) return '';
  const mode = cast.mode && CAST_MODES[cast.mode]?.[0];
  if (mode) return mode;
  if (cast.kicker) return cast.kicker > 1 ? `Reforçada ×${cast.kicker}` : 'Reforçada';
  const extra = cast.extras?.map(e => CAST_EXTRAS[e]?.[0]).find(Boolean);
  if (extra) return extra;
  return cast.x != null ? `X=${cast.x}` : '';
}

/** "Mágica · Reforçada": o tipo do item com a forma de conjurar, quando houver. */
export function stackBadgeText(item: StackItem): string {
  const kind = item.kind && STACK_KINDS[item.kind];
  const tag = stackCastTag(item.cast);
  return kind && tag ? `${kind.label} · ${tag}` : kind ? kind.label : tag;
}

/** "Conjurada por flashback, com reforço 2 vezes e com recompra. X = 3." para a galeria; vazio no custo normal. */
export function stackCastLine(cast?: StackCast): string {
  if (!cast) return '';
  const parts = [
    ...(cast.kicker ? [cast.kicker > 1 ? `com reforço ${cast.kicker} vezes` : 'com reforço'] : []),
    ...(cast.extras ?? []).map(e => CAST_EXTRAS[e]?.[1]).filter((p): p is string => !!p),
  ];
  const mode = cast.mode && CAST_MODES[cast.mode]?.[1];
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}` : parts[0];
  const how = mode && list ? `${mode}, ${list}.` : mode ? `${mode}.` : list ? `Conjurada ${list}.` : '';
  const x = cast.x != null ? `X = ${cast.x}.` : '';
  return [how, x].filter(Boolean).join(' ');
}
