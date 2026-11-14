// O caminho em arco de uma carta voando entre dois pontos, o mesmo para o voo em CSS e para o rastro desenhado na camada GPU.

interface Spot { cx: number; cy: number }

/**
 * O arco de `from` até `to`: para cada fração do tempo do voo (`u`, de 0 a 1), o deslocamento a partir do ponto de
 * chegada (`x`, `y`), a fração do caminho já andada (`t`, com saída e chegada suaves) e a altura da carta (`high`, 0 nas
 * pontas e 1 no meio). Num caminho de lado, o arco sobe acima da linha reta.
 */
export function flightArc(from: Spot, to: Spot) {
  const dx = from.cx - to.cx, dy = from.cy - to.cy, dist = Math.hypot(dx, dy) || 1;
  const bulge = Math.min(140, dist * .3) * (Math.abs(dx) / dist) + 16;
  const control = { x: dx * .5, y: dy * .5 - bulge };
  return (u: number) => {
    const t = (1 - Math.cos(Math.PI * u)) / 2, high = Math.sin(Math.PI * t), back = 1 - t;
    return { x: back * back * dx + 2 * back * t * control.x, y: back * back * dy + 2 * back * t * control.y, t, high, back };
  };
}
