// Os gráficos da Visão geral do deck: terrenos por turno, tipos de carta, curva por tipo e funções contra o que um deck costuma ter.
import type { DeckData } from '../decks';
import { esc } from '../ui/cardtext';
import { CURVE, deckRows } from '../ui/deckStats';
import { functionTargets, landDropChance } from './analysis';
import type { CategoryCount } from './functions';

/** As fatias dos tipos, na ordem das cores (a mesma no gráfico de tipos e na curva). Planeswalkers e batalhas entram em Outras. */
const TYPES = [
  ['creature', 'Criaturas'], ['instant', 'Instantâneas'], ['sorcery', 'Feitiços'], ['artifact', 'Artefatos'],
  ['enchantment', 'Encantamentos'], ['land', 'Terrenos'], ['other', 'Outras'],
] as const;
type TypeKey = typeof TYPES[number][0];
const typeOf = (t: string | undefined): TypeKey => TYPES.some(([k]) => k === t) ? t as TypeKey : 'other';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const tip = (lines: string[]) => `<span class="dv-tip" aria-hidden="true">${lines.map((l, i) => i ? `<span>${l}</span>` : `<b>${l}</b>`).join('')}</span>`;

// ---- Terrenos por turno ----

const TURNS = [1, 2, 3, 4, 5, 6, 7];
const W = 520, H = 210, LEFT = 50, RIGHT = 78, TOP = 12, BOTTOM = 28;
const PW = W - LEFT - RIGHT, PH = H - TOP - BOTTOM;
const px = (turn: number) => LEFT + (turn - 1) / (TURNS.length - 1) * PW;
const py = (p: number) => TOP + (1 - p) * PH;

/**
 * A chance de ter terreno para baixar um por turno, do turno 1 ao 7, jogando primeiro e jogando depois. Mostra o que
 * a análise de terrenos diz em número: se o deck vai travar por falta de terreno. Vazio sem terrenos ou com poucas cartas.
 */
export function landDropsHTML(library: number, lands: number): string {
  if (library <= 7 || lands <= 0) return '';
  const series = [
    { key: 'first', name: 'Jogando primeiro', short: 'Primeiro', values: TURNS.map(t => landDropChance(library, lands, t, true)) },
    { key: 'second', name: 'Jogando depois', short: 'Depois', values: TURNS.map(t => landDropChance(library, lands, t, false)) },
  ];
  const [first, second] = series as [typeof series[0], typeof series[0]];
  const grid = [0, 0.25, 0.5, 0.75, 1].map(p => `<line class="dv-grid${p === 0 ? ' base' : ''}" x1="${LEFT}" x2="${W - RIGHT}" y1="${py(p)}" y2="${py(p)}"/><text class="dv-axis" x="${LEFT - 6}" y="${py(p) + 4}" text-anchor="end">${p * 100}%</text>`).join('');
  const xTicks = TURNS.map(t => `<text class="dv-axis" x="${px(t)}" y="${H - 8}" text-anchor="middle">${t}</text>`).join('');
  const lines = series.map(s => `<polyline class="dv-line ${s.key}" points="${s.values.map((v, i) => `${px(TURNS[i]!)},${py(v).toFixed(1)}`).join(' ')}"/>${s.values.map((v, i) => `<circle class="dv-dot ${s.key}" cx="${px(TURNS[i]!)}" cy="${py(v).toFixed(1)}" r="4"/>`).join('')}`).join('');
  // Os nomes no fim das linhas, afastados quando as duas terminam perto.
  let y1 = py(first.values.at(-1)!), y2 = py(second.values.at(-1)!);
  if (Math.abs(y1 - y2) < 15) { const mid = (y1 + y2) / 2, up = y1 <= y2 ? -1 : 1; y1 = mid + up * 7.5; y2 = mid - up * 7.5; }
  const ends = `<text class="dv-end" x="${W - RIGHT + 10}" y="${y1 + 4}">${first.short}</text><text class="dv-end" x="${W - RIGHT + 10}" y="${y2 + 4}">${second.short}</text>`;
  const step = PW / (TURNS.length - 1);
  const hits = TURNS.map((t, i) => {
    const left = (px(t) - step / 2) / W * 100, width = step / W * 100;
    const label = `Turno ${t}: ${pct(first.values[i]!)} jogando primeiro, ${pct(second.values[i]!)} jogando depois`;
    return `<span class="dv-hit" tabindex="0" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%;top:${TOP / H * 100}%;height:${PH / H * 100}%" aria-label="${esc(label)}">${tip([`Turno ${t}: ${plural(t, 'terreno', 'terrenos')}`, `Jogando primeiro: ${pct(first.values[i]!)}`, `Jogando depois: ${pct(second.values[i]!)}`])}</span>`;
  }).join('');
  const four = TURNS.indexOf(4);
  return `<section class="dv-panel"><h2>Terrenos por turno</h2>
    <p class="dv-chart-lead">No turno 4, ${pct(first.values[four]!)} das partidas jogando primeiro têm os 4 terrenos (${pct(second.values[four]!)} jogando depois).</p>
    <ul class="dv-legend"><li><i class="dv-key first"></i>Jogando primeiro</li><li><i class="dv-key second dashed"></i>Jogando depois</li></ul>
    <div class="dv-linechart"><svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${grid}${xTicks}<text class="dv-axis" x="${LEFT - 12}" y="${H - 8}" text-anchor="end">Turno</text>${lines}${ends}</svg>${hits}</div>
    <p class="dv-note">Chance de ter terreno para baixar um em cada turno, até o turno marcado, sem mulligan. Quem joga primeiro não compra no primeiro turno.</p>
    <details class="dv-table"><summary>Ver em tabela</summary><table><thead><tr><th>Turno</th>${TURNS.map(t => `<th>${t}</th>`).join('')}</tr></thead><tbody>${series.map(s => `<tr><th>${s.name}</th>${s.values.map(v => `<td>${pct(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></details>
  </section>`;
}

// ---- Tipos e curva ----

/** As cartas do deck principal por tipo (com dados) e a curva de cada tipo (sem terrenos). */
export function typeCounts(deck: Pick<DeckData, 'cards'>) {
  const total = new Map<TypeKey, number>(), curve = CURVE.map(() => new Map<TypeKey, number>());
  let unknown = 0;
  for (const r of deckRows(deck.cards)) {
    if (!r.info) { unknown += r.count; continue; }
    const type = typeOf(r.info.type);
    total.set(type, (total.get(type) ?? 0) + r.count);
    if (type === 'land') continue;
    const col = curve[Math.min(CURVE.length - 1, Math.floor(r.cmc ?? 0))]!;
    col.set(type, (col.get(type) ?? 0) + r.count);
  }
  return { total, curve, unknown };
}

/**
 * Uma barra com o deck dividido por tipo e, abaixo, a curva de mana com cada custo dividido pelos mesmos tipos e cores
 * (uma legenda só serve aos dois).
 */
export function typesHTML(deck: Pick<DeckData, 'cards'>): string {
  const { total, curve, unknown } = typeCounts(deck);
  const sum = [...total.values()].reduce((a, b) => a + b, 0);
  if (!sum) return '';
  const parts = TYPES.filter(([k]) => total.get(k)).map(([k, name]) => ({ k, name, n: total.get(k)! }));
  const bar = parts.map(p => {
    const share = p.n / sum;
    return `<span class="dv-part t-${p.k}" tabindex="0" style="flex-grow:${p.n}" aria-label="${esc(`${p.name}: ${p.n}, ${pct(share)} do deck`)}">${share >= 0.07 ? `<em>${pct(share)}</em>` : ''}${tip([p.name, `${plural(p.n, 'carta', 'cartas')} · ${pct(share)}`])}</span>`;
  }).join('');
  const legend = `<ul class="dv-legend">${parts.map(p => `<li><i class="dv-key t-${p.k}"></i>${p.name} <b>${p.n}</b></li>`).join('')}</ul>`;
  const totals = curve.map(col => [...col.values()].reduce((a, b) => a + b, 0)), peak = Math.max(1, ...totals);
  const cols = curve.map((col, i) => {
    const n = totals[i]!, rows = TYPES.filter(([k]) => col.get(k));
    const detail = rows.map(([k, name]) => `${name}: ${col.get(k)}`);
    return `<span class="dv-ccol" tabindex="0" aria-label="${esc(`Custo ${CURVE[i]}: ${plural(n, 'carta', 'cartas')}${detail.length ? ` (${detail.join(', ')})` : ''}`)}"><b>${n || '–'}</b><span class="dv-stack" style="height:${n / peak * 100}%">${rows.map(([k]) => `<i class="t-${k}" style="flex-grow:${col.get(k)}"></i>`).join('')}</span><small>${CURVE[i]}</small>${n ? tip([`Custo ${CURVE[i]}: ${plural(n, 'carta', 'cartas')}`, ...detail]) : ''}</span>`;
  }).join('');
  return `<section class="dv-panel"><h2>Tipos e curva</h2>
    <div class="dv-typebar" role="group" aria-label="Cartas do deck por tipo">${bar}</div>${legend}
    <h3 class="dv-subhead">Curva de mana por tipo <small>sem terrenos</small></h3>
    <div class="dv-curve" role="group" aria-label="Curva de mana por tipo">${cols}</div>
    ${unknown ? `<p class="dv-note">Faltam os dados de ${plural(unknown, 'carta', 'cartas')}; elas não entram nos gráficos.</p>` : ''}
  </section>`;
}

// ---- Funções ----

/** Barras de ramp, compra, remoção e limpa-campo com a marca do que um deck do formato costuma ter. */
export function functionBarsHTML(categories: CategoryCount[], commander: boolean): string {
  const rows = functionTargets(commander).map(t => ({ ...t, n: categories.find(c => c.category.id === t.id)?.count ?? 0 }));
  const max = Math.max(...rows.map(r => Math.max(r.n, Math.ceil(r.ideal * 1.5))));
  return `<div class="dv-fbars" role="list" aria-label="Funções contra o que um deck costuma ter">${rows.map(r => `<p class="dv-frow${r.n < r.low ? ' low' : ''}" role="listitem" aria-label="${esc(`${r.title}: ${r.n}; o comum é ${r.ideal}`)}"><span class="dv-fname">${esc(r.title)}</span><span class="dv-ftrack" aria-hidden="true"><i style="width:${r.n / max * 100}%"></i><em style="left:${r.ideal / max * 100}%"></em></span><span class="dv-fval"><b>${r.n}</b> de ${r.ideal}</span></p>`).join('')}
    <p class="dv-note dv-fkey"><i aria-hidden="true"></i>O traço marca o que um deck ${commander ? 'de Commander' : 'do formato'} costuma ter.</p></div>`;
}
