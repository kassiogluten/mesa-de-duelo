/**
 * Texto e resumo técnico de um relato guardado, em Markdown, para virar issue no GitHub. Leva só o que o jogador
 * escreveu e os dados técnicos: nunca a gravação, os decks dos outros jogadores nem os retratos do Forge.
 * Usado pela área de admin e por deploy/relatos.mjs (o Node lê este arquivo direto, por isso só tipos importados).
 */
export const ISSUES_URL = 'https://github.com/kassiogluten/mesa-de-duelo/issues/new';

type Stored = Record<string, any>;

const kindName = (kind: unknown) => kind === 'erro' ? 'Algo deu errado' : 'Sugestão';

export function reportOf(stored: Stored): Stored { return stored.report ?? stored; }

export function issueTitle(stored: Stored) {
  const first = String(reportOf(stored).description ?? '').split('\n')[0].slice(0, 70);
  return `[Relato ${stored.code ?? ''}] ${first}`;
}

export function issueBody(stored: Stored) {
  const r = reportOf(stored), rec = r.recording, meta = rec?.meta, d = r.device ?? meta?.device;
  const lines: (string | null)[] = [
    `**${kindName(r.kind)}** — relato ${stored.code ?? '(sem código)'} de ${new Date(stored.receivedAt ?? r.createdAt).toLocaleString('pt-BR')}`,
    '', '> ' + String(r.description ?? '').replace(/\n/g, '\n> '), '',
    '| | |', '|---|---|',
    `| Versão da mesa | ${r.app?.version ?? '?'} |`,
    r.match?.rulesVersion ? `| Regras / motor | ${r.match.rulesVersion} / ${r.match.engineVersion ?? '?'} |` : null,
    r.match?.format ? `| Formato | ${r.match.format}${r.match.net ? ' (em rede)' : ''}, ${r.match.playerCount ?? '?'} jogadores |` : null,
    `| Onde | ${r.from === 'partida' ? 'durante a partida' : 'tela inicial'} |`,
    d ? `| Aparelho | ${d.viewport} (tela ${d.screen}, ${d.pixelRatio}×), ${d.touch ? 'toque' : 'sem toque'}, ${d.installed ? 'instalado' : 'no navegador'} |` : null,
    d ? `| Navegador | ${d.userAgent} |` : null,
    r.preferences ? `| Preferências | ${Object.entries(r.preferences).map(([k, v]) => `${k}: ${v}`).join(', ')} |` : null,
    `| Partida anexada | ${rec ? `sim, ${rec.frames.length} quadros${stored.bridge ? ', com o diário da ponte' : ''}` : 'não'} |`,
  ];
  const errors = (rec?.notes ?? []).filter((n: Stored) => n.kind !== 'aviso').slice(-30);
  if (errors.length) {
    lines.push('', '<details><summary>Erros registrados na partida</summary>', '', '```');
    for (const n of errors) lines.push(`${new Date(n.at).toISOString()} ${n.kind}: ${n.text}${n.detail ? ` (${String(n.detail).split('\n')[0]})` : ''}`);
    lines.push('```', '</details>');
  }
  return lines.filter(line => line !== null).join('\n');
}

/** Endereço de "nova issue" já preenchido: abre no navegador de quem está logado no GitHub, sem token no servidor. */
export function newIssueUrl(stored: Stored) {
  const body = issueBody(stored);
  // URLs muito longas são recusadas: o resumo é cortado (o completo fica no relato).
  return `${ISSUES_URL}?title=${encodeURIComponent(issueTitle(stored))}&body=${encodeURIComponent(body.length > 6000 ? `${body.slice(0, 6000)}\n\n(cortado)` : body)}`;
}
