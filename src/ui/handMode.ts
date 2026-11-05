/**
 * Jeito de mostrar a mão no computador, com dois botões centralizados acima da mão:
 * - Auto ligado: a mão fica recolhida por cima do campo, com o topo das cartas à vista, e sobe ao passar o mouse;
 * - Auto desligado: aparece a seta, que mostra a mão (fixa, aberta o tempo todo) ou a esconde (oculta, fora da tela).
 */
export type HandMode = 'fixa' | 'oculta' | 'auto';

/** A partir desta altura da janela (px), sobra espaço para a mão fixa ter a faixa dela sem apertar o campo. */
export const TALL_TABLE = 850;

/**
 * O que ficou guardado. "open" e "peek" são da versão com dois jeitos (aberta e recolhida). Sem nada guardado, a mão
 * começa fixa no toque, onde não há como passar por cima para abrir, e nas telas altas (tall), onde a faixa dela cabe;
 * nas outras, com mouse, começa no automático.
 */
export function savedHandMode(saved: string | null, hover: boolean, tall = false): HandMode {
  if (saved === 'fixa' || saved === 'open') return 'fixa';
  if (saved === 'oculta') return 'oculta';
  if (saved === 'auto' || saved === 'peek') return 'auto';
  return hover && !tall ? 'auto' : 'fixa';
}

/** Botão Auto: liga o automático; desligado, a mão fica à vista. */
export function toggleAuto(mode: HandMode): HandMode {
  return mode === 'auto' ? 'fixa' : 'auto';
}

/** Seta (só com o Auto desligado): mostra a mão oculta ou esconde a que está à vista. */
export function toggleShown(mode: HandMode): HandMode {
  return mode === 'fixa' ? 'oculta' : 'fixa';
}
