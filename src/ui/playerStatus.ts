import type { FPlayer } from '../forge/client';
import { esc } from './cardtext';

const svg = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const MONARCH_ICON = svg('M2 8l5 4 5-7 5 7 5-4-2 11H4zm2 13h16v2H4z');
const LAND_ICON = svg('M2 20 9 7l4 7 2-3 7 9z');
const SPELLS_ICON = svg('M13 2 4 14h7l-1 8 9-12h-7z');
export const MONARCH_HINT = 'Monarca: no começo da etapa final, compra um card. Quem causar dano de combate ao monarca passa a ser o monarca.';

/** "0 de 1" ou "2, sem limite": terrenos jogados no turno e quantos pode jogar. */
export function landsText(p: FPlayer) {
  const played = p.landsPlayed ?? 0;
  return p.maxLands === -1 ? `${played}, sem limite` : `${played} de ${p.maxLands ?? 1}`;
}
const showsLands = (p: FPlayer, active: number | null | undefined) => p.id === active && p.maxLands !== undefined;

/**
 * Mágicas do turno: só aparecem quando há na mesa uma carta que as conta (`spellsTotal` é o total da mesa, que a
 * Tempestade usa; ausente quando nenhuma carta se importa).
 */
const showsSpells = (p: FPlayer, spellsTotal: number | undefined) => spellsTotal !== undefined && (p.spellsCast ?? 0) > 0;
function spellsText(p: FPlayer, spellsTotal: number) {
  const mine = p.spellsCast ?? 0;
  return `${mine === 1 ? '1 mágica conjurada' : `${mine} mágicas conjuradas`} neste turno.${spellsTotal > mine ? ` Na mesa, ${spellsTotal} no total, a conta da Tempestade.` : ''}`;
}

/** Texto para o leitor de tela, junto do nome e da vida do jogador. */
export function playerStatusText(p: FPlayer, active?: number | null, spellsTotal?: number) {
  return [p.monarch ? ', é o monarca' : '', showsLands(p, active) ? `, terrenos jogados neste turno: ${landsText(p)}` : '',
    showsSpells(p, spellsTotal) ? `, ${spellsText(p, spellsTotal!).toLowerCase()}` : ''].join('');
}

/**
 * Selos de monarca, de terrenos e de mágicas do turno, ao lado dos marcadores do jogador. Os terrenos só aparecem no
 * turno do jogador e ficam apagados quando ele já jogou todos. `changed` traz MONARCH quando a coroa acabou de chegar
 * e SPELLS quando o jogador conjurou mais uma mágica.
 */
export function playerStatusHTML(p: FPlayer, active?: number | null, open: string | null = null, changed: Set<string> = new Set(), spellsTotal?: number) {
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
  if (showsSpells(p, spellsTotal)) {
    const key = `p${p.id}:SPELLS`;
    html += `<span class="player-counter spells-cast${changed.has('SPELLS') ? ' bump' : ''}${open === key ? ' open' : ''}" data-ctr="${key}" aria-hidden="true">${SPELLS_ICON}<b>${p.spellsCast}</b><span class="ctr-tip">${esc(spellsText(p, spellsTotal!))}</span></span>`;
  }
  return html;
}

/** Total de mágicas conjuradas no turno, só quando alguma carta à vista as conta; senão, `undefined`. */
export function turnSpellsTotal(players: FPlayer[]) {
  const counts = players.some(p => [...p.battlefield, ...p.hand, ...(p.commandZone ?? [])].some(c => c.countsSpells));
  return counts ? players.reduce((sum, p) => sum + (p.spellsCast ?? 0), 0) : undefined;
}
