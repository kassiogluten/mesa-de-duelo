// O desenho das setas da mesa (estilo "feixe com símbolo", escolhido em 14/11/2026): traço contínuo com brilho, um pulso de luz correndo até o alvo e, perto da ponta, uma gota virada para o alvo com o símbolo do que a seta é (docs/setas-opcoes.html, opção D, de 19/11/2026); com várias setas no mesmo alvo, só a mais curta leva o símbolo e as outras, um losango aceso.

/** O que a seta é: espada (ataque), escudo (bloqueio), mira (alvo) ou estrela (aura num jogador). */
export type ArrowGlyph = 'sword' | 'shield' | 'aim' | 'star';
type Pt = { x: number; y: number };

// Os símbolos num quadrado de 18 px centrado na origem, na cor da seta (`currentColor`): `f` é forma cheia e `s`, traço.
const GLYPHS: Record<ArrowGlyph, string> = {
  sword: '<path class="f" d="M8-8 7.2-3.6-1.6 5.2-5.2 1.6 3.6-7.2z"/><path class="s" d="M-6.6-.6.6 6.6M-3.8 3.8l-2.6 2.6"/><circle class="f" cx="-7" cy="7" r="1.3"/>',
  shield: '<path class="f" d="M0-8 6.5-5.2v5.4c0 4.2-2.9 6.6-6.5 7.8-3.6-1.2-6.5-3.6-6.5-7.8v-5.4z"/>',
  aim: '<circle class="s" r="5.2"/><path class="s" d="M0-8.8v2.6M0 8.8V6.2M-8.8 0h2.6M8.8 0H6.2"/><circle class="f" r="1.9"/>',
  star: '<path class="f" d="M0-8.4 2.1-2.9l5.9.3L3.4 1.1l1.5 5.7L0 3.6l-4.9 3.2 1.5-5.7L-8-2.6l5.9-.3z"/>',
};
/** A gota em volta do símbolo: um disco de 12,5 px de raio com a ponta 20 px à frente, girada para onde a seta vai. */
const DROP = 'M20 0 7.8 9.76A12.5 12.5 0 1 1 7.8-9.76z';
/** Onde o símbolo fica no caminho: antes do alvo, com folga para a ponta da gota não cobri-lo. */
const GLYPH_AT = .82;

/** Ponto de uma curva quadrática (`c` é o controle) ou cúbica (`c` e `c2`), em `u` de 0 a 1. */
export function curveAt(s: Pt, c: Pt, e: Pt, u: number, c2?: Pt): Pt {
  const v = 1 - u;
  if (!c2) return { x: v * v * s.x + 2 * v * u * c.x + u * u * e.x, y: v * v * s.y + 2 * v * u * c.y + u * u * e.y };
  return {
    x: v ** 3 * s.x + 3 * v * v * u * c.x + 3 * v * u * u * c2.x + u ** 3 * e.x,
    y: v ** 3 * s.y + 3 * v * v * u * c.y + 3 * v * u * u * c2.y + u ** 3 * e.y,
  };
}
/** Comprimento aproximado da curva (somando 16 trechos retos). */
export function curveLength(s: Pt, c: Pt, e: Pt, c2?: Pt) {
  let total = 0, last = s;
  for (let i = 1; i <= 16; i++) { const p = curveAt(s, c, e, i / 16, c2); total += Math.hypot(p.x - last.x, p.y - last.y); last = p; }
  return total;
}

/** O filtro do brilho em volta do traço; cada SVG de setas tem o seu (`id`). */
export const beamDefs = (id: string) => `<filter id="${id}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.5"/></filter>`;

/**
 * Uma seta: o brilho, o contorno escuro, o traço na cor (`path.arrow`, a que os testes procuram), o pulso de luz e a
 * ponta: a gota com o símbolo a 82% do caminho, para não cobrir o alvo, com a ponta virada para ele (o símbolo fica em pé), ou (`diamond`, quando outra seta do mesmo alvo já leva o
 * símbolo) um losango aceso na ponta. A cor vem da classe (`color` no CSS). `glow` é o id do filtro do SVG; `pulses`
 * limita quantas vezes o pulso corre (sem ele, corre enquanto a seta existir).
 */
export function beamHTML(o: { d: string; cls: string; glyph: ArrowGlyph; s: Pt; c: Pt; e: Pt; c2?: Pt; glow: string; pulses?: number; diamond?: boolean }) {
  const len = Math.round(curveLength(o.s, o.c, o.e, o.c2));
  const at = curveAt(o.s, o.c, o.e, GLYPH_AT, o.c2), a = curveAt(o.s, o.c, o.e, GLYPH_AT - .03, o.c2), b = curveAt(o.s, o.c, o.e, GLYPH_AT + .03, o.c2);
  const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  // O pulso anda a uns 330 px por segundo, qualquer que seja o tamanho da seta.
  const timing = `--len:${len}px;--dur:${Math.max(.6, len / 330).toFixed(2)}s${o.pulses ? `;--runs:${o.pulses}` : ''}`;
  return `<g class="beam ${o.cls}"><path class="arrow-glow" d="${o.d}" filter="url(#${o.glow})"/><path class="arrow-under" d="${o.d}"/>` +
    `<path class="arrow" d="${o.d}"/><path class="arrow-pulse" d="${o.d}" style="${timing}"/>` +
    (o.diamond ? diamondHTML(o) : `<g class="arrow-glyph" transform="translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})"><path class="plate" transform="rotate(${angle.toFixed(1)})" d="${DROP}"/>${GLYPHS[o.glyph]}</g>`) + '</g>';
}
/** O losango aceso na ponta, apontando para onde a seta chega. */
function diamondHTML(o: { s: Pt; c: Pt; e: Pt; c2?: Pt }) {
  const before = curveAt(o.s, o.c, o.e, .97, o.c2);
  const angle = Math.atan2(o.e.y - before.y, o.e.x - before.x) * 180 / Math.PI;
  return `<g class="arrow-diamond" transform="translate(${o.e.x.toFixed(1)} ${o.e.y.toFixed(1)}) rotate(${angle.toFixed(1)})"><path d="M-11 0-5.5-4.6 3 0-5.5 4.6z"/></g>`;
}

/**
 * Com várias setas chegando ao mesmo alvo (`target`), os símbolos se amontoariam perto dele: só a mais curta de cada
 * alvo leva o símbolo. Devolve, na ordem recebida, quais ficam com o losango.
 */
export function crowdedTargets(arrows: { target: string; length: number }[]) {
  const shortest = new Map<string, number>();
  arrows.forEach((arrow, i) => { const best = shortest.get(arrow.target); if (best === undefined || arrow.length < arrows[best]!.length) shortest.set(arrow.target, i); });
  return arrows.map((arrow, i) => shortest.get(arrow.target) !== i);
}
