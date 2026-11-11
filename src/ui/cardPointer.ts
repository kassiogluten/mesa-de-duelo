// Apontar uma carta para a mesa: o botão "Apontar" da carta aberta avisa os outros jogadores, e a carta apontada pulsa
// por alguns segundos na cor de quem apontou, com um balão "Ana apontou", para todos a acharem sem procurar.
import type { FCard, FState } from '../forge/client';
import { label } from './cardFaces';
import { reduced } from './motionKit';
import { sleeveClass } from './sleeves';
import type { TableCtx } from './tableContext';
import './cardPointer.css';

/** Quanto tempo a carta apontada fica em destaque. */
export const POINT_MS = 4000;

type Zone = 'battlefield' | 'command' | 'graveyard' | 'exile' | 'stack';
export interface PublicSpot { zone: Zone; player: number; card: FCard; stackId?: number }

const ZONE_NAME: Record<Zone, string> = { battlefield: 'no campo', command: 'na zona de comando', graveyard: 'no cemitério', exile: 'no exílio', stack: 'na pilha' };

/** Onde a carta está, se for numa zona que todos veem (campo, zona de comando, cemitério, exílio, pilha). */
export function publicSpot(s: Pick<FState, 'players' | 'stack'> | null | undefined, id: number): PublicSpot | undefined {
  if (!s) return undefined;
  for (const p of s.players) {
    const zones: [Zone, FCard[]][] = [['battlefield', p.battlefield], ['command', p.commandZone ?? []], ['graveyard', p.graveyard], ['exile', p.exile]];
    for (const [zone, cards] of zones) { const card = cards.find(c => c.id === id); if (card) return { zone, player: p.id, card }; }
  }
  const item = s.stack.find(si => si.source?.id === id);
  return item?.source ? { zone: 'stack', player: item.controller ?? -1, card: item.source, stackId: item.id } : undefined;
}

/** Dá para apontar: quem joga (não quem só assiste), com outra pessoa na mesa, e a carta numa zona que todos veem. */
export function canPoint(s: FState | null | undefined, id: number): boolean {
  return !!s && !s.watching && !s.gameOver && s.players.some(p => p.id !== s.you && !p.ai) && !!publicSpot(s, id);
}

const visible = (el: Element | null): el is HTMLElement => !!el && (el as HTMLElement).getClientRects().length > 0;

/** O elemento da mesa que mostra a carta; se ela não está à vista (no meio do cemitério, monte recolhido), o monte ou o campo do jogador. */
export function pointTarget(root: HTMLElement, spot: PublicSpot): { el: HTMLElement; exact: boolean } | undefined {
  const id = spot.card.id;
  const exact = [...root.querySelectorAll(`[data-fid="${id}"],[data-peek="${id}"]`)].find(visible)
    ?? (spot.stackId !== undefined ? [...root.querySelectorAll(`[data-stack="${spot.stackId}"]`)].find(visible) : undefined);
  if (exact) return { el: exact as HTMLElement, exact: true };
  const zone = spot.zone === 'graveyard' ? 'gy' : spot.zone === 'exile' ? 'exile' : '';
  const near = (zone ? root.querySelector(`[data-gy="${spot.player}"][data-zone="${zone}"]`) : null)
    ?? (spot.zone === 'stack' ? root.querySelector('.stack-pile') : null)
    ?? root.querySelector(`[data-seat-player="${spot.player}"]`);
  return visible(near) ? { el: near, exact: false } : undefined;
}

export interface PointerDeps extends Pick<TableCtx, 'root' | 'client' | 'state' | 'match' | 'playerName' | 'announce'> {}

export function createCardPointer(d: PointerDeps) {
  /** Um destaque por jogador: apontar de novo troca o anterior. */
  const shown = new Map<number, { ring: HTMLElement; until: number; frame: number }>();

  function clear(player?: number) {
    for (const [who, mark] of shown) {
      if (player !== undefined && who !== player) continue;
      cancelAnimationFrame(mark.frame); mark.ring.remove(); shown.delete(who);
    }
  }

  /** O que o botão "Apontar" da carta aberta faz; sem botão quando não dá para apontar esta carta. */
  function action(c: FCard): (() => void) | undefined {
    const s = d.state();
    if (!canPoint(s, c.id) || d.match().disconnected) return undefined;
    return () => d.client()?.send({ type: 'point', card: c.id });
  }

  /** Chegou o aviso do servidor: destaca a carta para todos (também para quem apontou, como confirmação). */
  function show(player: number, id: number) {
    const s = d.state();
    const spot = publicSpot(s, id);
    if (!s || !spot || d.root.hidden) return;
    clear(player);
    const mine = player === s.you;
    const who = mine ? 'Você' : d.playerName(player);
    const name = spot.card.faceDown ? 'uma carta virada para baixo' : label(spot.card);
    const ring = document.createElement('div');
    ring.className = `card-pointer${sleeveClass(s.players.find(p => p.id === player)?.sleeve)}`;
    ring.setAttribute('aria-hidden', 'true');
    const tip = document.createElement('span');
    tip.className = 'card-pointer-tip';
    ring.append(tip);
    document.body.append(ring);
    const mark = { ring, until: performance.now() + POINT_MS, frame: 0 };
    shown.set(player, mark);
    d.announce(`${who} apontou ${name} ${ZONE_NAME[spot.zone]}.`);
    let scrolled = mine;
    const step = (now: number) => {
      // A mesa se redesenha a cada estado: procura o elemento de novo a cada quadro.
      const target = pointTarget(d.root, publicSpot(d.state(), id) ?? spot);
      if (now > mark.until || !target || d.root.hidden) { clear(player); return; }
      if (!scrolled) { scrolled = true; target.el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }); }
      const r = target.el.getBoundingClientRect();
      Object.assign(ring.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      const text = target.exact ? `${who} apontou` : `${who} apontou ${name} ${ZONE_NAME[spot.zone]}`;
      if (tip.textContent !== text) tip.textContent = text;
      ring.classList.toggle('below', r.top < 40);
      // O balão fica dentro da tela, mesmo com a carta encostada na borda.
      const half = tip.offsetWidth / 2, center = r.left + r.width / 2;
      const shift = Math.min(Math.max(center, half + 8), innerWidth - half - 8) - center;
      tip.style.transform = `translateX(calc(-50% + ${Math.round(shift)}px))`;
      mark.frame = requestAnimationFrame(step);
    };
    mark.frame = requestAnimationFrame(step);
  }

  return { action, show, clear: () => clear() };
}
