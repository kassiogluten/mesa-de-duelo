import type { PresentationEvent } from './presentationTimeline';

/*
 * Dobra (warp, item 86): a mágica conjurada pelo custo de dobra chega à pilha rasgando o espaço, com o som de conjurar
 * mais grave e com eco; no fim do turno, a permanente volta para o exílio com um rasgo menor no lugar de onde saiu.
 */

/** Conjurada por dobra: o item que acabou de entrar na pilha diz a forma de conjurar (o mesmo da etiqueta da pilha). */
export function warpCast(event: PresentationEvent): boolean {
  if (event.type !== 'spell-cast') return false;
  return event.frame?.stack.find(si => si.id === event.stackId)?.cast?.mode === 'warp';
}

/** A permanente conjurada por dobra voltando para o exílio no fim do turno (o servidor marca o motivo). */
export function warpReturn(event: PresentationEvent): boolean {
  return event.type === 'left' && event.reason === 'warped';
}
