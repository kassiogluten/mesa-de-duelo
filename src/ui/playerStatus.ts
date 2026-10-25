import type { FPlayer } from '../forge/client';
import { esc } from './cardtext';

const svg = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const MONARCH_ICON = svg('M2 8l5 4 5-7 5 7 5-4-2 11H4zm2 13h16v2H4z');
const LAND_ICON = svg('M2 20 9 7l4 7 2-3 7 9z');
export const MONARCH_HINT = 'Monarca: no começo da etapa final, compra um card. Quem causar dano de combate ao monarca passa a ser o monarca.';

/** "0 de 1" ou "2, sem limite": terrenos jogados no turno e quantos pode jogar. */
export function landsText(p: FPlayer) {
  const played = p.landsPlayed ?? 0;
  return p.maxLands === -1 ? `${played}, sem limite` : `${played} de ${p.maxLands ?? 1}`;
}
const showsLands = (p: FPlayer, active: number | null | undefined) => p.id === active && p.maxLands !== undefined;

/** Texto para o leitor de tela, junto do nome e da vida do jogador. */
export function playerStatusText(p: FPlayer, active?: number | null) {
  return [p.monarch ? ', é o monarca' : '', showsLands(p, active) ? `, terrenos jogados neste turno: ${landsText(p)}` : ''].join('');
}

/**
 * Selos de monarca e de terrenos do turno, ao lado dos marcadores do jogador. Os terrenos só aparecem no turno do
 * jogador e ficam apagados quando ele já jogou todos. `changed` traz MONARCH quando a coroa acabou de chegar.
 */
export function playerStatusHTML(p: FPlayer, active?: number | null, open: string | null = null, changed: Set<string> = new Set()) {
  let html = '';
  if (p.monarch) {
    const key = `p${p.id}:MONARCH`;
    html += `<span class="player-counter monarch${changed.has('MONARCH') ? ' bump' : ''}${open === key ? ' open' : ''}" data-ctr="${key}" aria-hidden="true">${MONARCH_ICON}<b>Monarca</b><span class="ctr-tip">${esc(MONARCH_HINT)}</span></span>`;
  }
  if (showsLands(p, active)) {
    const key = `p${p.id}:LANDS`, played = p.landsPlayed ?? 0;
    const done = p.maxLands !== -1 && played >= (p.maxLands ?? 1);
    html += `<span class="player-counter land-plays${done ? ' done' : ''}${open === key ? ' open' : ''}" data-ctr="${key}" aria-hidden="true">${LAND_ICON}<b>${played}</b><small>/${p.maxLands === -1 ? '∞' : p.maxLands}</small><span class="ctr-tip">${esc(`Terrenos jogados neste turno: ${landsText(p)}.${done ? ' Não dá para jogar outro terreno neste turno.' : ''}`)}</span></span>`;
  }
  return html;
}
