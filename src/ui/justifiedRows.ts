// Linhas justificadas da página Novidades em imagens: as imagens de cada linha com a mesma altura, juntas na largura toda, sem cortar nada.

/** Uma imagem: proporção (largura ÷ altura) e largura do arquivo, em px (os prints são tirados em 2x). */
export interface Shot { ar: number; natural: number }
/** Onde ela fica: largura e altura em px, e a sobra à direita da última da linha (para a seguinte quebrar a linha). */
export interface Placed { w: number; h: number; pad: number }

export const ROWS = {
  gap: 14,
  /** Altura procurada para cada linha. */
  target: 220,
  /** Teto da linha: uma linha de poucas imagens estreitas não vira um pôster. */
  maxH: 320,
  /** Acima desta proporção a imagem fica sozinha na linha (o ultimate, uma faixa da mesa inteira). */
  wide: 2.5,
  /** Abaixo desta largura (celular), uma imagem por linha, no tamanho real da mesa. */
  single: 480,
  /** No computador, cada imagem cresce até 1,5× o tamanho real da mesa (o arquivo tem 2×), sem ficar borrada. */
  grow: .75,
};

/**
 * Arruma as imagens de um item em linhas: cada linha vai juntando imagens enquanto, esticada na largura toda, ficaria
 * mais alta que o alvo, e fecha com a altura mais perto dele. A linha que não chega à largura toda (a última, ou a que
 * bateu no teto) fica à esquerda, com as imagens na mesma altura.
 */
export function justifyRows(shots: Shot[], width: number, o = ROWS): Placed[] {
  const out: Placed[] = [];
  if (width < o.single) {
    for (const s of shots) {
      const w = Math.floor(Math.min(width, s.natural / 2));
      out.push({ w, h: w / s.ar, pad: Math.max(0, Math.floor(width - w) - 1) });
    }
    return out;
  }
  const maxW = (s: Shot) => s.natural * o.grow;
  const fill = (row: Shot[]) => (width - o.gap * (row.length - 1)) / row.reduce((n, s) => n + s.ar, 0);
  const place = (row: Shot[]) => {
    if (!row.length) return;
    const h = Math.min(fill(row), o.maxH, ...row.map(s => maxW(s) / s.ar));
    const ws = row.map(s => Math.floor(s.ar * h));
    const used = ws.reduce((a, b) => a + b, 0) + o.gap * (row.length - 1);
    ws.forEach((w, i) => out.push({ w, h: w / row[i]!.ar, pad: i === row.length - 1 ? Math.max(0, Math.floor(width - used) - 1) : 0 }));
  };
  let row: Shot[] = [];
  for (const s of shots) {
    if (s.ar > o.wide) { place(row); place([s]); row = []; continue; }
    const h = fill([...row, s]);
    if (h > o.target) { row.push(s); continue; }
    // Com esta a linha passa do alvo: fecha antes dela ou com ela, o que deixar a altura mais perto do alvo.
    if (row.length && fill(row) / o.target < o.target / h) { place(row); row = [s]; } else { place([...row, s]); row = []; }
  }
  place(row);
  return out;
}
