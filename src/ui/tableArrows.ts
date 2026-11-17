// As setas desenhadas por cima da mesa: as do combate (atacante até quem ele ataca, bloqueador até o atacante), as de alvo
// (da carta ou do item da pilha até cada alvo) e as das auras que encantam um jogador (da aura até o retrato dele). Medem a mesa já desenhada, só trocam o SVG quando as setas mudam e dizem quais setas de alvo são novas.
import type { FState } from '../forge/client';
import { esc } from './cardtext';
import { label } from './cardFaces';
import { beamDefs, beamHTML, crowdedTargets, curveLength, type ArrowGlyph } from './arrowBeam';

type Pt = { x: number; y: number };
/** Uma seta já medida, antes de virar SVG: `target` diz aonde ela chega (para achar os alvos com várias setas). */
interface Beam { d: string; cls: string; glyph: ArrowGlyph; s: Pt; c: Pt; e: Pt; c2?: Pt; target: string; extra?: string }
/**
 * As setas em SVG, com o losango no lugar do símbolo onde várias chegam ao mesmo alvo. O símbolo fica com a seta que
 * vale: a apagada (ataque já bloqueado, item da pilha fora de foco) só o leva se não houver outra.
 */
function beamsHTML(beams: Beam[], glow: string, pulses?: number) {
  const faded = (b: Beam) => /\b(blocked|dimmed)\b/.test(b.cls) ? 1e6 : 0;
  const crowded = crowdedTargets(beams.map(b => ({ target: b.target, length: curveLength(b.s, b.c, b.e, b.c2) + faded(b) })));
  return beams.map((b, i) => beamHTML({ ...b, glow, pulses, diamond: crowded[i] }) + (b.extra ?? '')).join('');
}

/**
 * Setas do combate: de cada atacante até quem ele ataca (vermelhas) e de cada bloqueador até a criatura que ele
 * bloqueia (douradas). Mede a mesa já desenhada (antes das animações) e é refeita quando a janela muda de tamanho.
 */
export function arrowRect(root: HTMLElement, selector: string): DOMRect | undefined {
  const el = root.querySelector<HTMLElement>(selector);
  if (!el || el.closest('[hidden]')) return undefined;
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height || getComputedStyle(el).visibility === 'hidden') return undefined;
  const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
  for (let parent = el.parentElement; parent && root.contains(parent); parent = parent.parentElement) {
    const style = getComputedStyle(parent), box = parent.getBoundingClientRect();
    if ((style.overflowX !== 'visible' && (x < box.left || x > box.right)) ||
        (style.overflowY !== 'visible' && (y < box.top || y > box.bottom))) return undefined;
  }
  return rect;
}
/** Uma seta que acabou de aparecer, em coordenadas da janela: sai de `from`, curva por `via` (o ponto de controle) e chega em `to`. */
export interface BornArrow { from: { x: number; y: number }; via: { x: number; y: number }; to: { x: number; y: number }; color: string }
// As setas de alvo do último desenho, por SVG: só as que não estavam lá nascem.
const drawnTargets = new WeakMap<SVGSVGElement, Set<string>>();
const BIRTH_COLORS: Record<string, string> = { mine: '#f2b54c', theirs: '#ec5a3f', choosing: '#6cc4ff', aura: '#c79bff' };

export function drawCombatArrows(root: HTMLElement, s: FState) {
  const svg = root.querySelector<SVGSVGElement>('#fArrows')!;
  const box = svg.getBoundingClientRect();
  const rectOf = (id: number) => arrowRect(root, `.field [data-fid="${id}"]`);
  const beams: Beam[] = [];
  // Contra um jogador, só com mais de um oponente: no duelo, o defensor é sempre o mesmo.
  const multiplayer = s.players.length > 2;
  // Atacantes iguais num monte (item 121): uma seta só, saindo do monte.
  const groups = new Set<string>();
  for (const { attacker, defender, defenderKind, blockers } of s.combat) {
    const group = root.querySelector<HTMLElement>(`.field [data-fid="${attacker}"]`)?.closest<HTMLElement>('[data-atk-group]')?.dataset.atkGroup;
    if (group && groups.has(group)) continue;
    if (group) groups.add(group);
    const a = group ? arrowRect(root, `.field [data-atk-group="${group}"]`) : rectOf(attacker);
    if (!a) continue;
    const toPlayer = (defenderKind ?? 'player') === 'player';
    const t = toPlayer ? multiplayer ? arrowRect(root, `.avatar-slot [data-pid="${defender}"]`) : undefined : defender === undefined ? undefined : rectOf(defender);
    if (t) {
      // Da borda do atacante à borda do defensor, curvada para o lado como as setas de alvo; atacantes já
      // bloqueados ficam mais apagados, já que o dano vai para o bloqueador.
      const fx = a.left + a.width / 2 - box.left, fy = a.top + a.height / 2 - box.top;
      const tx = t.left + t.width / 2 - box.left, ty = t.top + t.height / 2 - box.top;
      const dx = tx - fx, dy = ty - fy;
      const clip = (r: DOMRect) => Math.min(r.width / 2 / (Math.abs(dx) || 1e-6), r.height / 2 / (Math.abs(dy) || 1e-6), 1);
      const from = clip(a), to = 1 - clip(t);
      if (to > from) {
        const sx = fx + dx * from, sy = fy + dy * from, ex = fx + dx * to, ey = fy + dy * to;
        const len = Math.hypot(ex - sx, ey - sy) || 1, bend = Math.min(80, len * 0.15);
        const cx = (sx + ex) / 2 - ((ey - sy) / len) * bend, cy = (sy + ey) / 2 + ((ex - sx) / len) * bend;
        const d = `M${sx.toFixed(1)} ${sy.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
        // Com 3 ou 4 jogadores, cada defensor tem a sua cor (a de quem é atacado, pela ordem da mesa).
        const owner = toPlayer ? defender : s.players.find(p => p.battlefield.some(c => c.id === defender))?.id;
        const color = multiplayer ? Math.max(0, s.players.findIndex(p => p.id === owner)) % 4 : 0;
        const cls = `attack${color ? ` def-${color}` : ''}${blockers.length ? ' blocked' : ''}`;
        beams.push({ d, cls, glyph: 'sword', s: { x: sx, y: sy }, c: { x: cx, y: cy }, e: { x: ex, y: ey }, target: `${toPlayer ? 'p' : 'c'}${defender}` });
      }
    }
    blockers.forEach((id, j) => {
      const b = rectOf(id);
      if (!b) return;
      // Do centro do bloqueador ao centro do atacante, por cima das cartas: em combate as duas fileiras
      // ficam quase encostadas e uma seta só no vão entre elas não apareceria. Com vários bloqueadores
      // na mesma criatura, as pontas se espalham.
      const sx = b.left + b.width / 2 - box.left;
      const sy = b.top + b.height / 2 - box.top;
      const ex = a.left + a.width / 2 + (j - (blockers.length - 1) / 2) * a.width * 0.28 - box.left;
      const ey = a.top + a.height / 2 - box.top;
      const my = (sy + ey) / 2;
      const d = `M${sx.toFixed(1)} ${sy.toFixed(1)} C${sx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
      beams.push({ d, cls: 'block', glyph: 'shield', s: { x: sx, y: sy }, c: { x: sx, y: my }, c2: { x: ex, y: my }, e: { x: ex, y: ey }, target: `c${attacker}` });
    });
  }
  // No combate a mesa fica parada esperando bloqueios: o pulso corre três vezes e para.
  const html = beams.length ? `<defs>${beamDefs('fCombatGlow')}</defs>${beamsHTML(beams, 'fCombatGlow', 3)}` : '';
  // O estado chega várias vezes no mesmo combate: só redesenha (e reanima) quando as setas mudam.
  if (svg.dataset.html !== html) { svg.innerHTML = html; svg.dataset.html = html; }
}
/**
 * Setas de alvo: da carta que alveja até cada carta ou jogador escolhido. Enquanto você escolhe os alvos, a seta
 * sai da carta que está sendo conjurada (azul); depois, de cada item da pilha (dourado se for seu, vermelho se
 * for do oponente). Com um item da pilha em foco, só as setas dele ficam fortes. `auras`: auras que encantam um jogador
 * (maldições e afins) em foco, cada uma com a seta lilás até o retrato de quem ela encanta.
 */
export function drawTargetArrows(root: HTMLElement, s: FState, stack: FState['stack'], stackFocus: number | null, auras: number[] = []): BornArrow[] {
  const svg = root.querySelector<SVGSVGElement>('#fTargets')!;
  const box = svg.getBoundingClientRect();
  const q = (selector: string) => arrowRect(root, selector);
  const targetRect = (kind: 'c' | 'p', id: number) =>
    kind === 'p' ? q(`.avatar-slot [data-pid="${id}"]`) : q(`.field [data-fid="${id}"]`) ?? q(`#fHand [data-fid="${id}"]`);
  // `key` diz quem aponta para quem (o item da pilha, a escolha de alvo ou a aura), para saber quais setas são novas.
  const links: { from: DOMRect; to: DOMRect; cls: string; tag?: string; key: string }[] = [];
  const add = (from: DOMRect | undefined, t: { cards?: number[]; players?: number[] } | undefined, cls: string, tag: string | undefined, key: string) => {
    if (!from || !t) return;
    for (const id of t.cards ?? []) { const to = targetRect('c', id); if (to) links.push({ from, to, cls, tag, key: `${key}>c${id}` }); }
    for (const id of t.players ?? []) { const to = targetRect('p', id); if (to) links.push({ from, to, cls, tag, key: `${key}>p${id}` }); }
  };
  // Com um item da pilha em foco (mouse ou teclado), só as setas dele ficam fortes e cada alvo ganha "Alvo de …".
  const focused = stack.some(si => si.id === stackFocus) ? stackFocus : null;
  stack.forEach(si => {
    const from = q(`#fStack [data-stack="${si.id}"]`) ?? (si.source ? q(`.field [data-fid="${si.source.id}"]`) : undefined);
    const owner = si.controller === s.you ? 'mine' : 'theirs';
    if (focused === null) add(from, si.targets, owner, undefined, `s${si.id}`);
    else if (si.id === focused) add(from, si.targets, `${owner} focused`, `Alvo de ${si.source?.name ? label(si.source) : 'efeito na pilha'}`, `s${si.id}`);
    else add(from, si.targets, `${owner} dimmed`, undefined, `s${si.id}`);
  });
  const tg = s.input.targeting;
  if (tg && !s.gameOver) {
    // A seta sai da carta no campo quando ela está lá; senão, da carta na caixa de ação ou na mão.
    const from = q(`.field [data-fid="${tg.source}"]`) ?? q(`#fAction [data-peek="${tg.source}"]`) ?? q(`#fHand [data-fid="${tg.source}"]`);
    add(from, tg, 'choosing', undefined, `t${tg.source}`);
  }
  for (const id of auras) {
    const card = s.players.flatMap(p => p.battlefield).find(c => c.id === id);
    if (card?.attachedToPlayer === undefined) continue;
    const from = q(`.field [data-fid="${id}"]`), to = targetRect('p', card.attachedToPlayer);
    if (from && to) links.push({ from, to, cls: 'aura focused', tag: `Encantado por ${label(card)}`, key: `a${id}>p${card.attachedToPlayer}` });
  }
  const before = drawnTargets.get(svg) ?? new Set<string>(), born: BornArrow[] = [];
  const beams = links.map(({ from, to, cls, tag, key }): Beam => {
    const fx = from.left + from.width / 2 - box.left, fy = from.top + from.height / 2 - box.top;
    const ex = to.left + to.width / 2 - box.left, ey = to.top + to.height / 2 - box.top;
    // Sai da borda da carta de origem, para não cobrir a arte dela.
    const edge = Math.min(from.width / 2 / (Math.abs(ex - fx) || 1e-6), from.height / 2 / (Math.abs(ey - fy) || 1e-6), 1);
    const sx = fx + (ex - fx) * edge, sy = fy + (ey - fy) * edge;
    // Curva para o lado, para não passar reta por cima das cartas do meio e as setas da mesma origem não se sobreporem.
    const dx = ex - sx, dy = ey - sy, len = Math.hypot(dx, dy) || 1, bend = Math.min(120, len * 0.25);
    const cx = (sx + ex) / 2 - (dy / len) * bend, cy = (sy + ey) / 2 + (dx / len) * bend;
    const d = `M${sx.toFixed(1)} ${sy.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
    const head = cls.split(' ')[0];
    if (!before.has(key)) born.push({ from: { x: sx + box.left, y: sy + box.top }, via: { x: cx + box.left, y: cy + box.top }, to: { x: ex + box.left, y: ey + box.top }, color: BIRTH_COLORS[head ?? ''] ?? '#f2b54c' });
    // Etiqueta acima do alvo (abaixo, se não couber no topo da tela); a largura é estimada pelo texto.
    const width = tag ? Math.round(tag.length * 6.4 + 18) : 0, above = to.top - box.top > 30;
    const ty = above ? to.top - box.top - 26 : to.bottom - box.top + 6;
    const tx = Math.max(4, Math.min(box.width - width - 4, ex - width / 2));
    const label = tag ? `<g class="target-tag ${head}"><rect x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" width="${width}" height="20" rx="10"/><text x="${(tx + width / 2).toFixed(1)}" y="${(ty + 14).toFixed(1)}">${esc(tag)}</text></g>` : '';
    return { d, cls, glyph: head === 'aura' ? 'star' : 'aim', s: { x: sx, y: sy }, c: { x: cx, y: cy }, e: { x: ex, y: ey }, target: key.split('>')[1] ?? key, extra: label };
  });
  // O pulso de luz corre 3 vezes e para: correndo para sempre, ele repintava a seta a cada quadro e não deixava a
  // página descansar enquanto a mágica esperava na pilha (docs/spec-mesa-webgl.md, "Mesa em silêncio").
  const html = beams.length ? `<defs>${beamDefs('fTargetGlow')}</defs>${beamsHTML(beams, 'fTargetGlow', 3)}` : '';
  if (svg.dataset.html !== html) { svg.innerHTML = html; svg.dataset.html = html; }
  root.querySelectorAll('.stack-focus').forEach(el => el.classList.remove('stack-focus'));
  if (focused !== null) root.querySelectorAll(`#fStack [data-stack="${focused}"], #fStackGallery [data-stack="${focused}"]`).forEach(el => el.classList.add('stack-focus'));
  drawnTargets.set(svg, new Set(links.map(link => link.key)));
  return born;
}
