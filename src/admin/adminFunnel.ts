// O bloco "Começar a jogar" da aba Partidas: quantos visitantes passam por cada passo, por semana (item 109).
import { esc } from '../ui/cardtext';

/** Uma semana como a ponte devolve em GET /api/admin/funil (veja Funnel.java): a segunda-feira e cada contador. */
export interface FunnelWeek { semana: string; jogar: number; deck: number; 'partida-ia': number; 'partida-sala': number }

const STEPS: [keyof Omit<FunnelWeek, 'semana'>, string][] = [
  ['jogar', 'Jogar na /sobre'], ['deck', 'Deck escolhido'], ['partida-ia', 'Partida contra o computador'], ['partida-sala', 'Partida em sala'],
];
const weekLabel = (monday: string) => {
  const start = new Date(`${monday}T12:00:00Z`), end = new Date(start.getTime() + 6 * 86_400_000);
  const day = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
  return `${day(start)} a ${day(end)}`;
};

/** A tabela das semanas (a mais recente em cima), com a parte de quem escolheu deck que chegou a jogar. */
export function funnelHTML(weeks: FunnelWeek[]) {
  const head = `<div class="adm-head"><h2>Começar a jogar</h2><p class="adm-muted">Visitas (uma por aba) que passaram por cada passo, por semana. Só números, sem nada do jogador.</p>
    <button class="adm-ghost" data-act="funnel">Atualizar</button></div>`;
  if (!weeks.length) return `${head}<p class="adm-empty">Nenhum visitante contado ainda.</p>`;
  const rate = (w: FunnelWeek) => w.deck ? `${Math.round(100 * (w['partida-ia'] + w['partida-sala']) / w.deck)}%` : '–';
  return `${head}<div class="adm-card adm-funnel-wrap"><table class="adm-funnel">
    <thead><tr><th>Semana</th>${STEPS.map(([, label]) => `<th>${esc(label)}</th>`).join('')}<th title="Partidas começadas para cada deck escolhido">Deck → partida</th></tr></thead>
    <tbody>${weeks.map(w => `<tr><th scope="row">${esc(weekLabel(w.semana))}</th>${STEPS.map(([key]) => `<td>${w[key] ?? 0}</td>`).join('')}<td>${rate(w)}</td></tr>`).join('')}</tbody>
  </table></div>`;
}
