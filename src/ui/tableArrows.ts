// As setas desenhadas por cima da mesa: as do combate (atacante até quem ele ataca, bloqueador até o atacante) e as de alvo
// (da carta ou do item da pilha até cada alvo). Medem a mesa já desenhada e só trocam o SVG quando as setas mudam.
import type { FState } from '../forge/client';
import { esc } from './cardtext';
import { label } from './cardFaces';

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
export function drawCombatArrows(root: HTMLElement, s: FState) {
  const svg = root.querySelector<SVGSVGElement>('#fArrows')!;
  const box = svg.getBoundingClientRect();
  const rectOf = (id: number) => arrowRect(root, `.field [data-fid="${id}"]`);
  const paths: string[] = [];
  // Contra um jogador, só com mais de um oponente: no duelo, o defensor é sempre o mesmo.
  const multiplayer = s.players.length > 2;
  for (const { attacker, defender, defenderKind, blockers } of s.combat) {
    const a = rectOf(attacker);
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
        const cls = `attack${blockers.length ? ' blocked' : ''}`;
        paths.push(`<path class="arrow-under ${cls}" d="${d}"/><path class="arrow ${cls}" d="${d}" marker-end="url(#fAttackHead)"/>`);
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
      paths.push(`<path class="arrow-under" d="${d}"/><path class="arrow" d="${d}" marker-end="url(#fArrowHead)"/>`);
    });
  }
  const html = paths.length ? `<defs><marker id="fArrowHead" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
    <path d="M0 0 10 5 0 10z" fill="var(--gold)" stroke="#2a1600" stroke-width="1"/></marker>
    <marker id="fAttackHead" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
    <path d="M0 0 10 5 0 10z" fill="var(--red)" stroke="#2a0800" stroke-width="1"/></marker></defs>${paths.join('')}` : '';
  // O estado chega várias vezes no mesmo combate: só redesenha (e reanima) quando as setas mudam.
  if (svg.dataset.html !== html) { svg.innerHTML = html; svg.dataset.html = html; }
}
/**
 * Setas de alvo: da carta que alveja até cada carta ou jogador escolhido. Enquanto você escolhe os alvos, a seta
 * sai da carta que está sendo conjurada (azul); depois, de cada item da pilha (dourado se for seu, vermelho se
 * for do oponente). Com um item da pilha em foco, só as setas dele ficam fortes.
 */
export function drawTargetArrows(root: HTMLElement, s: FState, stack: FState['stack'], stackFocus: number | null) {
  const svg = root.querySelector<SVGSVGElement>('#fTargets')!;
  const box = svg.getBoundingClientRect();
  const q = (selector: string) => arrowRect(root, selector);
  const targetRect = (kind: 'c' | 'p', id: number) =>
    kind === 'p' ? q(`.avatar-slot [data-pid="${id}"]`) : q(`.field [data-fid="${id}"]`) ?? q(`#fHand [data-fid="${id}"]`);
  const links: { from: DOMRect; to: DOMRect; cls: string; tag?: string }[] = [];
  const add = (from: DOMRect | undefined, t: { cards?: number[]; players?: number[] } | undefined, cls: string, tag?: string) => {
    if (!from || !t) return;
    for (const id of t.cards ?? []) { const to = targetRect('c', id); if (to) links.push({ from, to, cls, tag }); }
    for (const id of t.players ?? []) { const to = targetRect('p', id); if (to) links.push({ from, to, cls, tag }); }
  };
  // Com um item da pilha em foco (mouse ou teclado), só as setas dele ficam fortes e cada alvo ganha "Alvo de …".
  const focused = stack.some(si => si.id === stackFocus) ? stackFocus : null;
  stack.forEach(si => {
    const from = q(`#fStack [data-stack="${si.id}"]`) ?? (si.source ? q(`.field [data-fid="${si.source.id}"]`) : undefined);
    const owner = si.controller === s.you ? 'mine' : 'theirs';
    if (focused === null) add(from, si.targets, owner);
    else if (si.id === focused) add(from, si.targets, `${owner} focused`, `Alvo de ${si.source?.name ? label(si.source) : 'efeito na pilha'}`);
    else add(from, si.targets, `${owner} dimmed`);
  });
  const tg = s.input.targeting;
  if (tg && !s.gameOver) {
    // A seta sai da carta no campo quando ela está lá; senão, da carta na caixa de ação ou na mão.
    const from = q(`.field [data-fid="${tg.source}"]`) ?? q(`#fAction [data-peek="${tg.source}"]`) ?? q(`#fHand [data-fid="${tg.source}"]`);
    add(from, tg, 'choosing');
  }
  const paths = links.map(({ from, to, cls, tag }) => {
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
    // Etiqueta acima do alvo (abaixo, se não couber no topo da tela); a largura é estimada pelo texto.
    const width = tag ? Math.round(tag.length * 6.4 + 18) : 0, above = to.top - box.top > 30;
    const ty = above ? to.top - box.top - 26 : to.bottom - box.top + 6;
    const tx = Math.max(4, Math.min(box.width - width - 4, ex - width / 2));
    const label = tag ? `<g class="target-tag ${head}"><rect x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" width="${width}" height="20" rx="10"/><text x="${(tx + width / 2).toFixed(1)}" y="${(ty + 14).toFixed(1)}">${esc(tag)}</text></g>` : '';
    return `<path class="arrow-under ${cls}" d="${d}"/><path class="arrow ${cls}" d="${d}" marker-end="url(#fTargetHead-${head})"/>` +
      `<circle class="ring ${cls}" cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="${(Math.min(to.width, to.height) * 0.32).toFixed(1)}"/>` + label;
  });
  const head = (cls: string) => `<marker id="fTargetHead-${cls}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
    <path class="head ${cls}" d="M0 0 10 5 0 10z" stroke="#120800" stroke-width="1"/></marker>`;
  const html = paths.length ? `<defs>${['mine', 'theirs', 'choosing'].map(head).join('')}</defs>${paths.join('')}` : '';
  if (svg.dataset.html !== html) { svg.innerHTML = html; svg.dataset.html = html; }
  root.querySelectorAll('.stack-focus').forEach(el => el.classList.remove('stack-focus'));
  if (focused !== null) root.querySelectorAll(`#fStack [data-stack="${focused}"], #fStackGallery [data-stack="${focused}"]`).forEach(el => el.classList.add('stack-focus'));
}
