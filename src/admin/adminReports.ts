import { esc } from '../ui/cardtext';
import { newIssueUrl, reportOf } from './reportSummary';
import { FORMATS, kindBadge, size, STATUS, statusBadge, when, type Item, type Status, type Stored } from './adminShared';

/** A aba Relatos: o filtro, a lista e o relato aberto, como HTML a partir do que a ponte devolve. */
export interface ReportFilter { status: string; kind: string; author: string; q: string }

/** Chave de quem enviou, para o filtro: a conta junta os relatos de um jogador mesmo se o apelido mudou. */
export const authorKey = (item: Item) => item.author?.account ? `c:${item.author.account}` : item.author?.nickname ? `n:${item.author.nickname.toLowerCase()}` : '-';
const authorName = (item: Item) => item.author?.nickname ?? (item.author?.account ? 'Conta sem apelido' : '');
const authorLabel = (item: Item) => !item.author ? 'anônimo' : `${authorName(item)} (${item.author.account ? 'conta' : 'nome informado'})`;

/** Os relatos que passam no filtro. */
export function visibleReports(items: Item[], filter: ReportFilter) {
  const q = filter.q.trim().toLowerCase();
  return items.filter(item => (filter.status === 'todos' || (filter.status === 'pendentes' ? ['novo', 'visto'].includes(item.status.status) : item.status.status === filter.status))
    && (!filter.kind || item.kind === filter.kind)
    && (!filter.author || authorKey(item) === filter.author)
    && (!q || item.code.toLowerCase().includes(q) || authorName(item).toLowerCase().includes(q) || (item.summary ?? '').toLowerCase().includes(q) || (item.status.note ?? '').toLowerCase().includes(q) || (item.version ?? '').includes(q)));
}

export function reportListHTML(items: Item[], o: { filter: ReportFilter; selected: string | null; totalBytes: number }) {
  const { filter, selected, totalBytes } = o;
  const count = (status: string) => items.filter(i => i.status.status === status).length;
  const shown = visibleReports(items, filter);
  const option = (value: string, text: string, current: string) => `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(text)}</option>`;
  // Quem enviou: cada conta ou nome informado, do que mais relatou para o que menos, e os anônimos no fim.
  const authors = new Map<string, { label: string; n: number }>();
  for (const item of items) {
    const key = authorKey(item), a = authors.get(key);
    if (a) a.n++; else authors.set(key, { label: key === '-' ? 'Anônimos' : authorLabel(item), n: 1 });
  }
  const authorOptions = [...authors].sort(([ka, a], [kb, b]) => Number(ka === '-') - Number(kb === '-') || b.n - a.n || a.label.localeCompare(b.label, 'pt-BR'))
    .map(([key, a]) => option(key, `${a.label} (${a.n})`, filter.author)).join('');
  return `<div class="adm-head"><h1>Relatos</h1><p class="adm-muted">${items.length} guardados · ${size(totalBytes)} · ${count('novo')} novos</p>
      <button class="adm-ghost" data-act="reload">Atualizar</button></div>
    <div class="adm-filters">
      <label>Estado<select data-filter="status">${option('pendentes', `Pendentes (${count('novo') + count('visto')})`, filter.status)}${option('todos', `Todos (${items.length})`, filter.status)}
        ${(Object.keys(STATUS) as Status[]).map(s => option(s, `${STATUS[s]} (${count(s)})`, filter.status)).join('')}</select></label>
      <label>Tipo<select data-filter="kind">${option('', 'Todos', filter.kind)}${option('erro', 'Algo deu errado', filter.kind)}${option('sugestao', 'Sugestão', filter.kind)}</select></label>
      <label>Quem enviou<select data-filter="author">${option('', 'Todos', filter.author)}${authorOptions}</select></label>
      <label class="adm-search">Buscar<input type="search" data-filter="q" value="${esc(filter.q)}" placeholder="Código, texto, apelido, nota ou versão"></label>
    </div>
    <div class="adm-split${selected ? ' has-detail' : ''}">
      <ul class="adm-list" aria-label="Relatos">${shown.length ? shown.map(item => `<li><button class="adm-row${item.code === selected ? ' on' : ''}" data-code="${esc(item.code)}" aria-current="${item.code === selected}">
        <span class="adm-row-top"><strong>${esc(item.code)}</strong>${kindBadge(item.kind)}${statusBadge(item.status.status)}<time>${when(item.receivedAt)}</time></span>
        <span class="adm-row-text">${esc(item.summary ?? 'Abra para ver a descrição.')}</span>
        <span class="adm-row-meta">${esc([item.author ? `${authorName(item)}${item.author.account ? '' : ' (informado)'}` : 'anônimo', item.version && `v${item.version}`, item.format && (FORMATS[item.format] ?? item.format), item.match ? (item.bridge ? 'partida + ponte' : 'partida') : null, size(item.bytes), item.status.issue].filter(Boolean).join(' · '))}</span>
      </button></li>`).join('') : `<li class="adm-empty">${items.length ? 'Nenhum relato com esses filtros.' : 'Nenhum relato ainda.'}</li>`}</ul>
      <section class="adm-detail" id="admDetail" aria-live="polite"></section>
    </div>`;;
}

/** O relato aberto: descrição, ações, tratamento e os detalhes da partida e do aparelho. */
export function reportDetailHTML(code: string, item: Item, stored: Stored, notice: string) {
  const r = reportOf(stored), rec = r.recording, meta = rec?.meta, d = r.device ?? meta?.device, bridge = stored.bridge;
  const rows = (pairs: [string, unknown][]) => `<dl class="adm-dl">${pairs.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(String(v))}</dd>`).join('')}</dl>`;
  const errors = (rec?.notes ?? []).filter((n: Stored) => n.kind !== 'aviso');
  const duration = rec ? Math.round((rec.endedAt - rec.startedAt) / 1000) : 0;
  return `<div class="adm-detail-head"><button class="adm-ghost adm-back" data-act="back">← Lista</button>
      <h2>${esc(code)}</h2>${kindBadge(item.kind)}${statusBadge(item.status.status)}</div>
    <blockquote class="adm-quote">${esc(r.description ?? '')}</blockquote>
    <div class="adm-actions">
      ${rec ? `<a class="arena-btn primary" href="/tests/fixtures/replay.html?relato=${encodeURIComponent(code)}" target="_blank" rel="noopener">Repetir na mesa</a>` : ''}
      <a class="arena-btn secondary" data-act="issue" href="${esc(newIssueUrl(stored))}" target="_blank" rel="noopener">Criar issue no GitHub</a>
      <button class="adm-ghost" data-act="copy">Copiar texto da issue</button>
      <button class="adm-ghost" data-act="download">Baixar arquivo</button>
      <button class="adm-ghost adm-danger" data-act="delete">Excluir</button>
    </div>
    <p class="adm-notice" role="status">${esc(notice)}</p>
    <form class="adm-card adm-status-form" id="admStatus">
      <h3>Tratamento</h3>
      <label>Estado<select name="status">${(Object.keys(STATUS) as Status[]).map(s => `<option value="${s}"${s === item.status.status ? ' selected' : ''}>${STATUS[s]}</option>`).join('')}</select></label>
      <label>Issue<input name="issue" value="${esc(item.status.issue ?? '')}" placeholder="#42 ou o link" maxlength="200"></label>
      <label class="adm-wide">Nota<textarea name="note" rows="3" maxlength="2000" placeholder="O que foi visto, o que falta, em que versão foi corrigido…">${esc(item.status.note ?? '')}</textarea></label>
      <div class="adm-wide adm-form-end"><span class="adm-muted">Atualizado em ${when(item.status.updatedAt)}</span><button class="arena-btn primary" type="submit">Salvar</button></div>
    </form>
    <h3>Detalhes</h3>
    ${rows([['recebido', when(stored.receivedAt ?? r.createdAt)], ['enviado por', item.author ? `${authorName(item)} (${item.author.account ? 'conta conectada' : 'nome informado, sem verificação'})` : 'anônimo'],
      ['conta', item.author?.account && `${item.author.account.slice(0, 12)}…`], ['onde', r.from === 'partida' ? 'durante a partida' : 'tela inicial'], ['versão da mesa', r.app?.version],
      ['regras / motor', r.match?.rulesVersion && `${r.match.rulesVersion} / ${r.match.engineVersion ?? '?'}`], ['formato', r.match?.format && `${FORMATS[r.match.format] ?? r.match.format}${r.match.net ? ' em rede' : ''}, ${r.match.playerCount ?? '?'} jogadores`],
      ['jogadores', meta?.players?.map((p: Stored) => `${p.name}${p.ai ? ' (IA)' : ''}`).join(', ')],
      ['aparelho', d && `${d.viewport} (tela ${d.screen}, ${d.pixelRatio}×), ${d.touch ? 'toque' : 'sem toque'}, ${d.installed ? 'instalado' : 'no navegador'}`],
      ['navegador', d?.userAgent], ['preferências', r.preferences && Object.entries(r.preferences).map(([k, v]) => `${k}: ${v}`).join(', ')],
      ['partida', rec ? `${rec.frames.length} quadros${rec.droppedFrames ? ` (${rec.droppedFrames} cortados)` : ''}, ${Math.floor(duration / 60)} min ${duration % 60} s, ${rec.sent.length} ações` : 'não anexada'],
      ['diário da ponte', bridge ? `${bridge.snapshots?.length ?? 0} retratos, ${bridge.actions?.length ?? 0} ações` : rec ? 'não veio (partida já encerrada na ponte)' : null],
      ['tamanho', size(item.bytes)]])}
    ${errors.length ? `<h3>Erros registrados (${errors.length})</h3><ul class="adm-errors">${errors.slice(-40).map((n: Stored) => `<li><time>${new Date(n.at).toLocaleTimeString('pt-BR')}</time> <strong>${esc(n.kind)}</strong> ${esc(n.text)}${n.detail ? `<code>${esc(n.detail)}</code>` : ''}</li>`).join('')}</ul>` : ''}
    ${r.diagnostics ? `<details><summary>Relatório do painel de erros</summary><pre>${esc(r.diagnostics)}</pre></details>` : ''}
    ${bridge?.snapshots?.length ? `<details><summary>Retratos do Forge (${bridge.snapshots.length})</summary>${bridge.snapshots.map((s: Stored, i: number) => `<p class="adm-muted">Retrato ${i}: jogo ${s.gameNumber}, turno ${s.turn}, ${esc(s.phase)} (${s.reason === 'relato' ? 'no relato' : 'começo do turno'})</p>`).join('')}
      <p class="adm-muted">Para restaurar no Forge: <code>./scripts/rodar.sh --mode=replay --relato=${esc(code)}.json.gz --retrato=N</code> com o arquivo baixado.</p></details>` : ''}`;;
}
