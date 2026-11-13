// Meus relatos: os relatos que este aparelho (ou a conta) enviou, com o estado e a resposta que o servidor devolve.
import { EVENTS, KEYS, loadJSON, saveJSON } from './storage';
import { FORGE_URL, bridgeHttpUrl } from './forge/client';

/**
 * O servidor só mostra um relato a quem tem a chave dele (devolvida no envio e guardada aqui) ou a quem o enviou com
 * a conta. Por isso o aparelho guarda, de cada relato enviado, o código, a chave e o servidor para onde ele foi.
 * O que conta como novidade para o jogador: uma resposta nova ou editada e a passagem para Resolvido ou Encerrado.
 */
export type PlayerStatus = 'recebido' | 'analise' | 'resolvido' | 'encerrado';
export type ReportKind = 'sugestao' | 'erro';

/** Um relato enviado, como fica guardado no aparelho. {@code url} é a rota de relatos do servidor que o recebeu. */
export interface SavedReport { code: string; key: string; url: string; at: number; kind: ReportKind; summary: string }

/** Um relato na tela Meus relatos. Sem {@code status}, o servidor não respondeu (sem conexão). */
export interface MyReport { code: string; kind: ReportKind; summary: string; at: number; status?: PlayerStatus; reply?: string; repliedAt?: string }

interface Read { vistos: Record<string, string>; avisados: Record<string, string> }
interface ServerReport { code: string; kind?: string; summary?: string; receivedAt?: string; status?: string; reply?: string; repliedAt?: string }

export const SAVED_LIMIT = 50;
export const SUMMARY_LIMIT = 160;
export const STATUS_LABEL: Record<PlayerStatus, string> = { recebido: 'Recebido', analise: 'Em análise', resolvido: 'Resolvido', encerrado: 'Encerrado' };

const STATUSES = Object.keys(STATUS_LABEL) as PlayerStatus[];
const kindOf = (kind: unknown): ReportKind => kind === 'erro' ? 'erro' : 'sugestao';

/** O começo do texto do relato, numa linha só, como o servidor guarda no índice dele. */
export function summaryOf(description: string) {
  const text = description.trim().replace(/\s+/g, ' ');
  return text.length > SUMMARY_LIMIT ? `${text.slice(0, SUMMARY_LIMIT - 1)}…` : text;
}

/** A rota da situação dos relatos, a partir da rota para onde o relato foi enviado. */
export const statusUrl = (reportsUrl: string) => `${reportsUrl.replace(/\/+$/, '')}/situacao`;
const defaultUrl = () => bridgeHttpUrl('/api/relatos', FORGE_URL);

export function savedReports(): SavedReport[] {
  const list = loadJSON<SavedReport[]>(KEYS.meusRelatos, []);
  return Array.isArray(list) ? list.filter(r => r && typeof r.code === 'string' && typeof r.key === 'string' && typeof r.url === 'string') : [];
}

const changed = () => { try { dispatchEvent(new CustomEvent(EVENTS.meusRelatos)); } catch { /* sem janela (testes) */ } };

/** Guarda o relato que acabou de ser enviado: o mais novo primeiro, até {@link SAVED_LIMIT}. */
export function rememberReport(report: Omit<SavedReport, 'at'> & { at?: number }) {
  if (!report.code || !report.key) return;
  const entry: SavedReport = { code: report.code, key: report.key, url: report.url, at: report.at ?? Date.now(), kind: kindOf(report.kind), summary: summaryOf(report.summary) };
  saveJSON(KEYS.meusRelatos, [entry, ...savedReports().filter(r => r.code !== entry.code)].slice(0, SAVED_LIMIT));
  changed();
}

/**
 * O que muda quando há novidade no relato: o estado, se já é resolvido ou encerrado, e a hora da resposta.
 * Vazia ("|") quando ainda não há nada para avisar: passar para "Em análise" não conta.
 */
export function signature(report: Pick<MyReport, 'status' | 'repliedAt' | 'reply'>) {
  const closed = report.status === 'resolvido' || report.status === 'encerrado' ? report.status : '';
  return `${closed}|${report.reply ? report.repliedAt ?? 'respondido' : ''}`;
}
const NOTHING = '|';

function read(): Read {
  const r = loadJSON<Partial<Read> | null>(KEYS.relatosLidos, null);
  return { vistos: { ...(r?.vistos ?? {}) }, avisados: { ...(r?.avisados ?? {}) } };
}

/** Os relatos com novidade que o jogador ainda não abriu em Meus relatos. */
export function unseenReports(reports: MyReport[]) {
  const { vistos } = read();
  return reports.filter(r => signature(r) !== NOTHING && vistos[r.code] !== signature(r));
}

/** Os relatos com novidade que ainda não foram avisados na tela inicial (nem vistos em Meus relatos). */
export function unnotifiedReports(reports: MyReport[]) {
  const { avisados } = read();
  return unseenReports(reports).filter(r => avisados[r.code] !== signature(r));
}

function mark(which: keyof Read, reports: MyReport[]) {
  const state = read();
  for (const r of reports) if (signature(r) !== NOTHING) state[which][r.code] = signature(r);
  saveJSON(KEYS.relatosLidos, state);
  changed();
}
export const markSeen = (reports: MyReport[]) => mark('vistos', reports);
export const markNotified = (reports: MyReport[]) => mark('avisados', reports);

/** Esquece as marcas dos relatos que já não existem, para a chave não crescer para sempre. */
function forget(alive: Set<string>) {
  const state = read();
  let dirty = false;
  for (const which of ['vistos', 'avisados'] as const)
    for (const code of Object.keys(state[which])) if (!alive.has(code)) { delete state[which][code]; dirty = true; }
  if (dirty) saveJSON(KEYS.relatosLidos, state);
}

async function ask(url: string, reports: SavedReport[], accountToken: string | null): Promise<ServerReport[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (accountToken) headers.Authorization = `Bearer ${accountToken}`;
    const response = await fetch(statusUrl(url), { method: 'POST', headers, signal: controller.signal, body: JSON.stringify({ relatos: reports.map(r => ({ code: r.code, key: r.key })) }) });
    if (!response.ok) return null;
    const json = await response.json() as { relatos?: ServerReport[] };
    return Array.isArray(json.relatos) ? json.relatos : null;
  } catch {
    return null;
  } finally { clearTimeout(timer); }
}

let latest: MyReport[] = [];
/** O que a última consulta devolveu (vazio antes da primeira). */
export const latestReports = () => latest;
/** Há novidade que o jogador ainda não viu: o ponto do menu ⋯. */
export const hasUnseenReports = () => unseenReports(latest).length > 0;

/**
 * Consulta a situação dos relatos: um pedido por servidor para onde este aparelho mandou relato e, com a conta
 * ({@code accountToken}), o servidor padrão também devolve os relatos dela enviados de outros aparelhos.
 * Os relatos que um servidor deixou de devolver (apagados pela retenção) saem da lista do aparelho.
 * {@code offline} é true quando algum servidor não respondeu: os relatos dele vêm só com o que o aparelho guardou.
 */
export async function refreshMyReports(accountToken: string | null = null): Promise<{ reports: MyReport[]; offline: boolean }> {
  const saved = savedReports();
  const groups = new Map<string, SavedReport[]>();
  for (const r of saved) groups.set(r.url, [...(groups.get(r.url) ?? []), r]);
  const home = defaultUrl();
  if (accountToken && !groups.has(home)) groups.set(home, []);
  const byCode = new Map<string, MyReport>();
  const gone = new Set<string>();
  let offline = false;
  await Promise.all([...groups].map(async ([url, list]) => {
    const answer = await ask(url, list, url === home ? accountToken : null);
    if (!answer) {
      offline = true;
      for (const r of list) byCode.set(r.code, { code: r.code, kind: r.kind, summary: r.summary, at: r.at });
      return;
    }
    const answered = new Set(answer.map(a => a.code));
    for (const r of list) if (!answered.has(r.code)) gone.add(r.code);
    for (const a of answer) {
      if (typeof a.code !== 'string') continue;
      const mine = list.find(r => r.code === a.code);
      const at = Date.parse(a.receivedAt ?? '');
      byCode.set(a.code, {
        code: a.code, kind: kindOf(a.kind ?? mine?.kind), summary: a.summary ?? mine?.summary ?? '', at: Number.isFinite(at) ? at : mine?.at ?? 0,
        status: STATUSES.includes(a.status as PlayerStatus) ? a.status as PlayerStatus : 'recebido',
        ...(a.reply ? { reply: a.reply, ...(a.repliedAt ? { repliedAt: a.repliedAt } : {}) } : {}),
      });
    }
  }));
  if (gone.size) saveJSON(KEYS.meusRelatos, savedReports().filter(r => !gone.has(r.code)));
  const reports = [...byCode.values()].sort((a, b) => b.at - a.at || a.code.localeCompare(b.code));
  if (!offline) forget(new Set(reports.map(r => r.code)));
  latest = reports;
  changed();
  return { reports, offline };
}
