import type { FPlayer } from '../forge/client';
import { esc } from './cardtext';
import { turnTimeText } from './clock';

const svg = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const MONARCH_ICON = svg('M2 8l5 4 5-7 5 7 5-4-2 11H4zm2 13h16v2H4z');
const LAND_ICON = svg('M2 20 9 7l4 7 2-3 7 9z');
const BLESSING_ICON = svg('M3 21V10l3-3 3 3V6l3-4 3 4v4l3-3 3 3v11h-7v-5h-4v5z');
const SPEED_ICON = svg('M12 4a10 10 0 0 0-10 10c0 2 .6 3.9 1.6 5.5h16.8A10 10 0 0 0 22 14 10 10 0 0 0 12 4zm5.2 4.4-4 6.3a1.8 1.8 0 1 1-2.4-1.9z');
export const BLESSING_HINT = 'Bênção da cidade: vem do Ascend, quando o jogador controla dez permanentes, e dura até o fim da partida, mesmo que ele perca permanentes depois.';
/** O que a velocidade faz e como sobe, com o próximo passo. */
export function speedText(speed: number) {
  return `Velocidade ${speed} de 4. ${speed >= 4 ? 'Velocidade máxima: as habilidades de velocidade máxima estão ligadas.'
    : 'Sobe 1, no máximo uma vez por turno, quando um oponente perde vida no turno deste jogador. Com 4, ligam as habilidades de velocidade máxima.'}`;
}
const SPELLS_ICON = svg('M13 2 4 14h7l-1 8 9-12h-7z');
const HOURGLASS_ICON = svg('M6 2h12v2h-1v3l-4 5 4 5v3h1v2H6v-2h1v-3l4-5-4-5V4H6zm3 2v2.3l3 3.7 3-3.7V4zm3 9.9-3 3.8V20h6v-2.3z');
export const MONARCH_HINT = 'Monarca: no começo da etapa final, compra um card. Quem causar dano de combate ao monarca passa a ser o monarca.';

/** "0 de 1" ou "2, sem limite": terrenos jogados no turno e quantos pode jogar. */
export function landsText(p: FPlayer) {
  const played = p.landsPlayed ?? 0;
  return p.maxLands === -1 ? `${played}, sem limite` : `${played} de ${p.maxLands ?? 1}`;
}
const showsLands = (p: FPlayer, active: number | null | undefined) => p.id === active && p.maxLands !== undefined;
/** O tempo do último turno fica de fora no turno do próprio jogador: ali vale o relógio da trilha. */
const showsLastTurn = (p: FPlayer, active: number | null | undefined) => p.lastTurnMs != null && p.id !== active;

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
  return [p.monarch ? ', é o monarca' : '', p.blessing ? ', tem a bênção da cidade' : '', p.speed ? `, velocidade ${p.speed} de 4` : '', showsLands(p, active) ? `, terrenos jogados neste turno: ${landsText(p)}` : '',
    showsSpells(p, spellsTotal) ? `, ${spellsText(p, spellsTotal!).toLowerCase()}` : '', showsLastTurn(p, active) ? `, último turno durou ${turnTimeText(p.lastTurnMs!)}` : ''].join('');
}

/**
 * Selos de monarca, bênção da cidade, velocidade, terrenos, mágicas do turno e tempo do último turno, ao lado dos marcadores
 * do jogador. Os terrenos só aparecem no turno do jogador e ficam apagados quando ele já jogou todos; o tempo, fora dele.
 * `changed` traz MONARCH quando a coroa acabou de chegar (BLESSING e SPEED, da mesma forma, quando chegam ou mudam) e
 * SPELLS quando o jogador conjurou mais uma mágica.
 */
export function playerStatusHTML(p: FPlayer, active?: number | null, open: string | null = null, changed: Set<string> = new Set(), spellsTotal?: number) {
  let html = '';
  if (p.monarch) {
    const key = `p${p.id}:MONARCH`;
    html += `<span class="player-counter monarch${changed.has('MONARCH') ? ' bump' : ''}${open === key ? ' open' : ''}" data-ctr="${key}" aria-hidden="true">${MONARCH_ICON}<b>Monarca</b><span class="ctr-tip">${esc(MONARCH_HINT)}</span></span>`;
  }
  if (p.blessing) {
    const key = `p${p.id}:BLESSING`;
    html += `<span class="player-counter blessing${changed.has('BLESSING') ? ' bump' : ''}${open === key ? ' open' : ''}" data-ctr="${key}" aria-hidden="true">${BLESSING_ICON}<b>Bênção</b><span class="ctr-tip">${esc(BLESSING_HINT)}</span></span>`;
  }
  if (p.speed) {
    const key = `p${p.id}:SPEED`;
    html += `<span class="player-counter speed${p.speed >= 4 ? ' max' : ''}${changed.has('SPEED') ? ' bump' : ''}${open === key ? ' open' : ''}" data-ctr="${key}" aria-hidden="true">${SPEED_ICON}<b>${p.speed}</b><small>/4</small><span class="ctr-tip">${esc(speedText(p.speed))}</span></span>`;
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
  if (showsLastTurn(p, active)) {
    const key = `p${p.id}:LASTTURN`, time = turnTimeText(p.lastTurnMs!);
    html += `<span class="player-counter last-turn${open === key ? ' open' : ''}" data-ctr="${key}" aria-hidden="true">${HOURGLASS_ICON}<b>${time}</b><span class="ctr-tip">${esc(`Último turno: durou ${time}.`)}</span></span>`;
  }
  return html;
}

/** Total de mágicas conjuradas no turno, só quando alguma carta à vista as conta; senão, `undefined`. */
export function turnSpellsTotal(players: FPlayer[]) {
  const counts = players.some(p => [...p.battlefield, ...p.hand, ...(p.commandZone ?? [])].some(c => c.countsSpells));
  return counts ? players.reduce((sum, p) => sum + (p.spellsCast ?? 0), 0) : undefined;
}
