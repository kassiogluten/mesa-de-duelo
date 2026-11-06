/**
 * Jeito de mostrar a mão no computador, com dois botões centralizados acima da mão:
 * - Auto ligado: a mão fica recolhida por cima do campo, com o topo das cartas à vista, e sobe ao passar o mouse;
 * - Auto desligado: aparece a seta, que mostra a mão (fixa, aberta o tempo todo) ou a esconde (oculta, fora da tela).
 */
export type HandMode = 'fixa' | 'oculta' | 'auto';

/**
 * O que ficou guardado. "open" e "peek" são da versão com dois jeitos (aberta e recolhida). Sem nada guardado, a mão
 * começa fixa em todo aparelho: quem joga pela primeira vez vê as cartas inteiras; o automático é escolha do jogador.
 */
export function savedHandMode(saved: string | null): HandMode {
  if (saved === 'oculta') return 'oculta';
  if (saved === 'auto' || saved === 'peek') return 'auto';
  return 'fixa';
}

/** Botão Auto: liga o automático; desligado, a mão fica à vista. */
export function toggleAuto(mode: HandMode): HandMode {
  return mode === 'auto' ? 'fixa' : 'auto';
}

/** Seta (só com o Auto desligado): mostra a mão oculta ou esconde a que está à vista. */
export function toggleShown(mode: HandMode): HandMode {
  return mode === 'fixa' ? 'oculta' : 'fixa';
}
