import type { FPlayer, FState } from '../forge/client';
import { esc } from './cardtext';
import './lifeChart.css';

type ChartState = Pick<FState, 'players' | 'you' | 'lifeHistory' | 'config'>;

/**
 * Cores das linhas: você no dourado da mesa, os oponentes em azul, rosa e verde, nessa ordem (conferidas para
 * daltonismo no fundo escuro da mesa). A quarta linha vem tracejada, e todas levam o nome na ponta.
 */
const COLORS = ['#c98500', '#3987e5', '#d55181', '#008300'];
const DASH = ['', '', '', '6 4'];

const W = 560, H = 210, LEFT = 30, RIGHT = 118, TOP = 14, BOTTOM = 26;

interface Series { player: FPlayer; name: string; color: string; dash: string; life: number[] }

/** Você primeiro, depois os outros na ordem da mesa: a cor de cada um não muda de um jogo para o outro. */
function seriesOf(s: ChartState): Series[] {
  const points = s.lifeHistory ?? [];
  const order = [...s.players].sort((a, b) => Number(b.id === s.you) - Number(a.id === s.you));
  return order.slice(0, COLORS.length).map((player, i) => ({
    player, name: player.id === s.you ? 'Você' : player.name, color: COLORS[i], dash: DASH[i],
    life: points.map(p => p.life[String(player.id)] ?? NaN),
  }));
}

/** Marcas do eixo da vida: de 5 em 5, 10 em 10 ou 20 em 20, conforme o tamanho. */
function lifeTicks(min: number, max: number): number[] {
  const step = max - min > 60 ? 20 : max - min > 24 ? 10 : 5;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(v);
  return ticks;
}

/** Afasta os nomes na ponta das linhas para não se encostarem (pelo menos 14 px entre eles). */
function spreadLabels(ys: number[], gap = 14): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < order.length; k++) order[k].y = Math.max(order[k].y, order[k - 1].y + gap);
  const overflow = order.length ? order[order.length - 1].y - (H - BOTTOM) : 0;
  if (overflow > 0) for (const o of order) o.y -= overflow;
  const out: number[] = [];
  for (const o of order) out[o.i] = o.y;
  return out;
}

/**
 * Gráfico da vida de cada jogador no fim de cada turno, para o fim do jogo. Vazio sem histórico (servidor antigo) ou
 * com menos de dois pontos. Passar o mouse ou tocar numa coluna mostra a vida de todos naquele turno; a mesma
 * informação fica numa tabela, para leitores de tela.
 */
export function lifeChartHTML(s: ChartState): string {
  const points = s.lifeHistory ?? [];
  if (points.length < 2) return '';
  const series = seriesOf(s);
  const all = series.flatMap(x => x.life.filter(Number.isFinite));
  const min = Math.min(0, ...all), max = Math.max(...all, 1);
  const top = Math.ceil(max / 5) * 5, bottom = Math.floor(min / 5) * 5;
  const turns = points.map(p => p.turn), last = turns.length - 1;
  const x = (i: number) => LEFT + (W - LEFT - RIGHT) * (i / last);
  const y = (v: number) => TOP + (H - TOP - BOTTOM) * ((top - v) / (top - bottom || 1));
  const grid = lifeTicks(bottom, top).map(v => `<line class="lc-grid${v === 0 ? ' zero' : ''}" x1="${LEFT}" x2="${W - RIGHT}" y1="${y(v)}" y2="${y(v)}"/><text class="lc-axis" x="${LEFT - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
  // No eixo dos turnos, no máximo uns 10 números.
  const every = Math.max(1, Math.ceil(last / 10));
  const xLabels = turns.map((t, i) => i % every && i !== last ? '' : `<text class="lc-axis" x="${x(i)}" y="${H - 8}" text-anchor="middle">${t}</text>`).join('');
  const lines = series.map(sr => {
    const d = sr.life.map((v, i) => Number.isFinite(v) ? `${x(i).toFixed(1)},${y(v).toFixed(1)}` : '').filter(Boolean).join(' ');
    return `<polyline class="lc-line" points="${d}" stroke="${sr.color}"${sr.dash ? ` stroke-dasharray="${sr.dash}"` : ''}/>`;
  }).join('');
  const lastValue = (sr: Series) => [...sr.life].reverse().find(Number.isFinite) ?? 0;
  const labelY = spreadLabels(series.map(sr => y(lastValue(sr))));
  const ends = series.map((sr, i) => `<circle class="lc-end" cx="${x(last)}" cy="${y(lastValue(sr))}" r="4" fill="${sr.color}"/>`
    + `<text class="lc-label" x="${x(last) + 10}" y="${labelY[i] + 4}"><tspan class="lc-label-life">${lastValue(sr)}</tspan> ${esc(sr.name.length > 12 ? `${sr.name.slice(0, 11)}…` : sr.name)}</text>`).join('');
  // Uma coluna por turno: a área de toque é a coluna inteira; a linha, os pontos e a caixa aparecem no hover e no toque.
  const colW = (W - LEFT - RIGHT) / Math.max(last, 1);
  const cols = turns.map((t, i) => {
    const cx = x(i), boxW = 128, boxH = 22 + series.length * 16;
    const boxX = cx + boxW + 12 > W ? cx - boxW - 10 : cx + 10;
    const rows = series.map((sr, k) => `<circle cx="${boxX + 12}" cy="${TOP + 25 + k * 16}" r="4" fill="${sr.color}"/><text class="lc-tip-row" x="${boxX + 22}" y="${TOP + 29 + k * 16}">${esc(sr.name.length > 10 ? `${sr.name.slice(0, 9)}…` : sr.name)}</text><text class="lc-tip-value" x="${boxX + boxW - 10}" y="${TOP + 29 + k * 16}" text-anchor="end">${Number.isFinite(sr.life[i]) ? sr.life[i] : '–'}</text>`).join('');
    const dots = series.map(sr => Number.isFinite(sr.life[i]) ? `<circle cx="${cx}" cy="${y(sr.life[i])}" r="4" fill="${sr.color}" class="lc-dot"/>` : '').join('');
    return `<g class="lc-col" aria-hidden="true"><rect class="lc-hit" x="${Math.max(LEFT - colW / 2, cx - colW / 2)}" y="${TOP}" width="${colW}" height="${H - TOP - BOTTOM}"/>`
      + `<g class="lc-hover"><line class="lc-cross" x1="${cx}" x2="${cx}" y1="${TOP}" y2="${H - BOTTOM}"/>${dots}<rect class="lc-tip" x="${boxX}" y="${TOP + 2}" width="${boxW}" height="${boxH}" rx="8"/><text class="lc-tip-title" x="${boxX + 10}" y="${TOP + 15}">${t === 0 ? 'Início' : `Fim do turno ${t}`}</text>${rows}</g></g>`;
  }).join('');
  const summary = series.map(sr => `${sr.name}: ${lastValue(sr)}`).join(', ');
  const table = `<table class="sr-only"><caption>Vida no fim de cada turno</caption><thead><tr><th scope="col">Turno</th>${series.map(sr => `<th scope="col">${esc(sr.name)}</th>`).join('')}</tr></thead><tbody>${turns.map((t, i) => `<tr><th scope="row">${t === 0 ? 'Início' : t}</th>${series.map(sr => `<td>${Number.isFinite(sr.life[i]) ? sr.life[i] : '–'}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const legend = `<ul class="lc-legend" aria-hidden="true">${series.map(sr => `<li><svg viewBox="0 0 18 6" aria-hidden="true"><line x1="1" x2="17" y1="3" y2="3" stroke="${sr.color}"${sr.dash ? ' stroke-dasharray="4 3"' : ''}/></svg>${esc(sr.name)}</li>`).join('')}</ul>`;
  return `<figure class="life-chart"><figcaption>Vida no fim de cada turno</figcaption>${legend}`
    + `<svg class="lc-plot" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Gráfico da vida a cada turno. No fim: ${summary}.`)}">${grid}${xLabels}${lines}${ends}${cols}</svg>${table}</figure>`;
}

/**
 * Dano de comandante no fim do jogo: quem recebeu quanto de qual comandante, só o que passou de zero, do maior para
 * o menor. 21 de um mesmo comandante elimina, e fica marcado.
 */
export function commanderDamageHTML(s: ChartState, cardName: (name: string) => string = name => name): string {
  if (s.config?.format !== 'commander' && s.config?.format !== 'precon') return '';
  const owners = new Map<number, { card: string; owner: string }>();
  for (const p of s.players) for (const c of p.commanders ?? []) owners.set(c.id, { card: cardName(c.name), owner: p.id === s.you ? 'você' : p.name });
  const rows = s.players.flatMap(p => (p.commanderDamage ?? []).filter(d => d.damage > 0 && owners.has(d.commanderId))
    .map(d => ({ to: p.id === s.you ? 'Você' : p.name, damage: d.damage, ...owners.get(d.commanderId)! })))
    .sort((a, b) => b.damage - a.damage);
  if (!rows.length) return '';
  return `<section class="commander-damage-summary"><h3>Dano de comandante</h3><ul>${rows.map(r => `<li${r.damage >= 21 ? ' class="lethal"' : ''}><span class="cds-value">${r.damage}</span><span>${esc(r.to)} recebeu de <strong>${esc(r.card)}</strong> (${esc(r.owner)})</span></li>`).join('')}</ul></section>`;
}

/** O resumo inteiro do fim do jogo: o gráfico e, no Commander, o dano de comandante (`cardName` traduz o comandante). */
export function gameSummaryHTML(s: ChartState, cardName?: (name: string) => string): string {
  return lifeChartHTML(s) + commanderDamageHTML(s, cardName);
}
