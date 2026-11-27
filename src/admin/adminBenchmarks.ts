// A aba Desempenho da área de admin, com os resultados do teste de desempenho da mesa (/desempenho), o aparelho e as cenas de cada um.
import { esc } from '../ui/cardtext';
import type { BenchmarkResult, BenchmarkScene } from '../benchmarkReport';
import { when } from './adminShared';

type Nullable<T> = { [K in keyof T]: T[K] | null };

/** Um resultado como o servidor devolve em GET /api/admin/desempenho (veja Benchmarks.java): o que faltou vem null. */
export type BenchmarkRow = Omit<Nullable<BenchmarkResult>, 'modo' | 'nota' | 'aparelho' | 'cenas'> & {
  id: string; quando: string; modo: BenchmarkResult['modo']; nota: number;
  aparelho: Nullable<BenchmarkResult['aparelho']> | null;
  cenas: Nullable<BenchmarkScene>[];
};

export interface BenchmarksState { results: BenchmarkRow[]; open: string | null; notice: string }

const MODES: Record<BenchmarkRow['modo'], string> = { duelo: 'Duelo', commander: 'Commander' };

const num = (n: number | null | undefined) => n == null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const step = (n: number | null | undefined) => n == null ? '—' : `E${n}`;
const scoreClass = (n: number) => n >= 75 ? 'good' : n >= 50 ? 'mid' : 'bad';

/** Mediana de uma lista de números; null se vazia. */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Modelo · sistema · navegador · GPU · tela · Hz · núcleos/memória, só o que veio. */
export function deviceLabel(d: BenchmarkRow['aparelho']) {
  if (!d) return '—';
  const cpu = [d.nucleos != null ? `${d.nucleos} núcleos` : '', d.memoria != null ? `${num(d.memoria)} GB` : ''].filter(Boolean).join(' / ');
  return [d.modelo, d.sistema, d.navegador, d.gpu, d.tela, d.hz != null ? `${d.hz} Hz` : '', cpu].filter(Boolean).join(' · ') || '—';
}

const sceneLine = (s: BenchmarkRow['cenas'][number]) => `${s.nome ?? '?'}: ${num(s.fps)} FPS, 1% pior ${num(s.fps1)}, ${s.travadas ?? 0} travadas`;

function scenesHTML(r: BenchmarkRow) {
  if (!r.cenas.length) return '<p class="adm-muted">Sem cenas neste resultado.</p>';
  return `<table class="adm-bench-scenes"><thead><tr><th>Cena</th><th>FPS</th><th>1% pior</th><th>Travadas</th></tr></thead>
    <tbody>${r.cenas.map(s => `<tr><th scope="row">${esc(s.nome ?? '?')}</th><td>${num(s.fps)}</td><td>${num(s.fps1)}</td><td>${s.travadas ?? 0}</td></tr>`).join('')}</tbody></table>
    <p class="adm-muted">${[r.quadros != null ? `${r.quadros} quadros` : '', r.duracaoMs != null ? `${num(r.duracaoMs / 1000)} s` : '', r.efeitos ? `efeitos: ${esc(r.efeitos)}` : ''].filter(Boolean).join(' · ')}</p>`;
}

function rowHTML(r: BenchmarkRow, open: boolean) {
  const id = esc(r.id);
  return `<tr class="${open ? 'on' : ''}" title="${esc(r.cenas.map(sceneLine).join('\n'))}">
    <th scope="row"><button data-bench-open="${id}" aria-expanded="${open}">${esc(when(r.quando))}</button></th>
    <td class="adm-bench-mode">${esc(MODES[r.modo] ?? r.modo)}</td>
    <td><span class="adm-bench-score ${scoreClass(r.nota)}">${r.nota}</span></td>
    <td>${num(r.fps)}</td><td>${num(r.fps1)}</td><td>${r.travadas ?? '—'}</td><td>${step(r.degrau)}</td>
    <td class="adm-bench-device">${esc(deviceLabel(r.aparelho))}</td>
    <td>${esc(r.versao ?? '—')}</td>
    <td><button class="adm-ghost adm-danger adm-bench-del" data-bench-delete="${id}" aria-label="Apagar o resultado de ${esc(when(r.quando))}">Apagar</button></td>
  </tr>${open ? `<tr class="adm-bench-open"><td colspan="10">${scenesHTML(r)}</td></tr>` : ''}`;
}

function summaryHTML(results: BenchmarkRow[]) {
  const tile = (label: string, value: string, detail = '') => `<div class="adm-card adm-tile"><span>${esc(label)}</span><strong>${value}</strong>${detail ? `<small>${esc(detail)}</small>` : ''}</div>`;
  const byMode = (Object.keys(MODES) as BenchmarkRow['modo'][]).map(mode => {
    const scores = results.filter(r => r.modo === mode).map(r => r.nota);
    const m = median(scores);
    return tile(`Nota mediana · ${MODES[mode]}`, m == null ? '—' : num(m), `${scores.length} ${scores.length === 1 ? 'resultado' : 'resultados'}`);
  });
  return `<div class="adm-tiles">${tile('Resultados', String(results.length), 'os 1000 mais recentes ficam')}${byMode.join('')}</div>`;
}

/** A aba inteira: resumo, aviso e a tabela (o mais novo em cima), com as cenas abertas embaixo da linha escolhida. */
export function benchmarksHTML({ results, open, notice }: BenchmarksState) {
  const head = `<div class="adm-head"><h1>Desempenho</h1><button class="adm-ghost" data-act="benchmarks">Atualizar</button></div>
    <p class="adm-muted adm-rank-note">Resultados do Teste de desempenho (/desempenho), mandados por quem rodou. Nota de 0 a 100; E0–E3 é o pior degrau a que o regulador de efeitos chegou. Passe o mouse numa linha para ver as cenas, ou clique na data para abri-las.</p>
    <p class="adm-notice" role="status">${esc(notice)}</p>`;
  if (!results.length) return `${head}<p class="adm-empty">Nenhum resultado ainda.</p>`;
  return `${head}${summaryHTML(results)}<div class="adm-card adm-rank-wrap"><table class="adm-rank adm-bench">
    <thead><tr><th>Quando</th><th>Modo</th><th>Nota</th><th title="FPS médio">FPS</th><th title="FPS do 1% de quadros mais lentos">1% pior</th>
      <th title="Quadros acima de 50 ms">Travadas</th><th title="Pior degrau do regulador de efeitos">Degrau</th><th>Aparelho</th><th>Versão</th><th><span class="sr-only">Apagar</span></th></tr></thead>
    <tbody>${results.map(r => rowHTML(r, r.id === open)).join('')}</tbody>
  </table></div>`;
}
