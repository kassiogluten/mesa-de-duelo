// Os números de cada jogador no fim do jogo: os quatro destaques de quem joga e a tabela com todos os jogadores.
import type { FPlayer, FPlayerStats, FState } from '../forge/client';
import { esc } from './cardtext';
import './matchStats.css';

type StatsState = Pick<FState, 'players' | 'you' | 'stats' | 'watching'>;
type Key = Exclude<keyof FPlayerStats, 'damageTo'>;

/** As linhas da tabela, em grupos; `sub` é uma parte da linha de cima (o dano de combate dentro do dano causado). */
const GROUPS: { title: string; rows: { key: Key; label: string; sub?: boolean }[] }[] = [
  { title: 'Dano', rows: [
    { key: 'damage', label: 'Dano causado' }, { key: 'combatDamage', label: 'em combate', sub: true },
    { key: 'damageTaken', label: 'Dano recebido' }, { key: 'biggestTurn', label: 'Maior dano num turno' },
  ] },
  { title: 'Remoções e anulações', rows: [
    { key: 'removals', label: 'Remoções' }, { key: 'counters', label: 'Anulações' }, { key: 'countered', label: 'Mágicas anuladas' },
  ] },
  { title: 'Combate', rows: [
    { key: 'kills', label: 'Criaturas eliminadas em combate' }, { key: 'creaturesLost', label: 'Criaturas perdidas' }, { key: 'attackers', label: 'Ataques com criaturas' },
  ] },
  { title: 'Ritmo', rows: [
    { key: 'spells', label: 'Mágicas conjuradas' }, { key: 'abilities', label: 'Habilidades ativadas' }, { key: 'lands', label: 'Terrenos jogados' },
    { key: 'draws', label: 'Cartas compradas' }, { key: 'lifeGained', label: 'Vida ganha' },
  ] },
];

/** Os quatro destaques: o número e o rótulo no singular e no plural. */
const HIGHLIGHTS: { key: Key; one: string; many: string }[] = [
  { key: 'damage', one: 'dano causado', many: 'dano causado' },
  { key: 'removals', one: 'remoção', many: 'remoções' },
  { key: 'counters', one: 'anulação', many: 'anulações' },
  { key: 'draws', one: 'carta comprada', many: 'cartas compradas' },
];

const value = (st: FPlayerStats | undefined, key: Key) => st?.[key] ?? 0;
const statsOf = (s: StatsState, p: FPlayer) => s.stats?.[String(p.id)];
const nameOf = (s: StatsState, p: FPlayer) => p.id === s.you && !s.watching ? 'Você' : p.name;

/** Você primeiro, depois os outros na ordem da mesa (a mesma do gráfico de vida). */
function ordered(s: StatsState): FPlayer[] {
  return [...s.players].sort((a, b) => Number(b.id === s.you) - Number(a.id === s.you));
}

/** Os quatro números de quem joga logo abaixo do resultado; vazio para quem assiste e sem números (servidor antigo). */
export function statsHighlightsHTML(s: StatsState): string {
  if (!s.stats || s.watching) return '';
  const me = s.players.find(p => p.id === s.you);
  if (!me) return '';
  const st = statsOf(s, me);
  const tiles = HIGHLIGHTS.map(h => {
    const n = value(st, h.key);
    return `<li><strong>${n}</strong><span>${n === 1 ? h.one : h.many}</span></li>`;
  }).join('');
  return `<ul class="stats-highlights" aria-label="Seus números neste jogo">${tiles}</ul>`;
}

/**
 * A tabela de todos os números, um jogador por coluna, com o maior de cada linha marcado. Com mais de dois jogadores,
 * um grupo a mais diz quanto dano cada um causou em cada outro (com dois, é o mesmo que o dano causado).
 */
export function statsTableHTML(s: StatsState): string {
  if (!s.stats) return '';
  const players = ordered(s);
  const head = players.map(p => { const name = nameOf(s, p); return `<th scope="col" title="${esc(name)}"><span>${esc(name)}</span></th>`; }).join('');
  const cells = (values: number[]) => {
    const top = Math.max(...values);
    const unique = values.filter(v => v === top).length === 1;
    return values.map(v => `<td${v > 0 && v === top && unique ? ' class="top"' : ''}>${v}</td>`).join('');
  };
  // Um grupo por tbody, com o título na primeira linha.
  const group = (title: string, rows: string) => `<tbody><tr class="st-group"><th scope="rowgroup" colspan="${players.length + 1}">${esc(title)}</th></tr>${rows}</tbody>`;
  let body = GROUPS.map(g => group(g.title, g.rows.map(r =>
    `<tr${r.sub ? ' class="st-sub"' : ''}><th scope="row">${esc(r.label)}</th>${cells(players.map(p => value(statsOf(s, p), r.key)))}</tr>`).join(''))).join('');
  if (players.length > 2) {
    body += group('Dano em cada jogador', players.map(target => {
      const row = players.map(p => p.id === target.id ? '<td class="st-self" aria-label="não se aplica">–</td>' : `<td>${statsOf(s, p)?.damageTo?.[String(target.id)] ?? 0}</td>`).join('');
      const name = nameOf(s, target);
      return `<tr><th scope="row">em ${esc(name === 'Você' ? 'você' : name)}</th>${row}</tr>`;
    }).join(''));
  }
  return `<table class="stats-table"><caption class="sr-only">Os números de cada jogador neste jogo</caption><thead><tr><td></td>${head}</tr></thead>${body}</table>`;
}

/** "Ver todos os números", recolhido ou aberto (`open`), como o gráfico de vida. */
export function statsDetailsHTML(s: StatsState, open: boolean): string {
  const table = statsTableHTML(s);
  return table ? `<details class="stats-details" data-stats-details${open ? ' open' : ''}><summary>Ver todos os números</summary>${table}</details>` : '';
}
