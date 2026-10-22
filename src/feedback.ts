import { FORGE_URL } from './forge/client';
import { RECORDING_FORMAT, fitRecording, gzip, type DeviceInfo, type Recording } from './forge/recording';
import { STORES, withStore } from './idb';

/**
 * Relatos de sugestões e erros (item 28): monta o relato, envia para a ponte (POST /api/relatos, corpo em gzip) e,
 * sem rede ou com o servidor fora, guarda numa fila no IndexedDB que sai sozinha depois. Também guarda a gravação
 * da última partida, para relatar da tela inicial depois que ela acabou ou depois de recarregar a página.
 */
export const DESCRIPTION_LIMIT = 2000;
export type FeedbackKind = 'sugestao' | 'erro';

export interface FeedbackReport {
  v: 1;
  kind: FeedbackKind;
  description: string;
  createdAt: string;
  /** Onde o jogador estava ao relatar. */
  from: 'inicio' | 'partida';
  app: { version: string };
  device: DeviceInfo;
  preferences: Record<string, unknown>;
  match?: { matchId?: string; format?: string; rulesVersion?: string; engineVersion?: string; net?: boolean; playerCount?: number };
  /** Texto do painel "Erros da partida", quando relatado de lá. */
  diagnostics?: string;
  recording: Recording | null;
}

/** A partida que acompanha o relato e o assento na ponte, para ela juntar o diário dela. */
export interface MatchAttachment { recording: Recording; url?: string; code?: string; token?: string }

export type SendResult =
  | { status: 'sent'; code: string }
  | { status: 'queued'; text: string }
  | { status: 'rejected'; text: string };

/** Uma rota HTTP no mesmo servidor da ponte (ws://host:7171/ws → http://host:7171/api/...). */
export function bridgeHttpUrl(path: string, forgeUrl = FORGE_URL) {
  try {
    const url = new URL(forgeUrl);
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    url.pathname = url.pathname.replace(/\/ws\/?$/, '') + path;
    url.search = ''; url.hash = '';
    return url.toString();
  } catch { return path; }
}

/** Endereço da rota de relatos. */
export const feedbackUrl = (forgeUrl = FORGE_URL) => bridgeHttpUrl('/api/relatos', forgeUrl);

const media = (query: string) => typeof matchMedia === 'function' && matchMedia(query).matches;

export function deviceInfo(): DeviceInfo {
  return {
    userAgent: navigator.userAgent,
    viewport: `${innerWidth}×${innerHeight}`,
    screen: `${screen.width}×${screen.height}`,
    pixelRatio: devicePixelRatio,
    touch: navigator.maxTouchPoints > 0 || media('(pointer: coarse)'),
    installed: media('(display-mode: standalone)') || (media('(display-mode: fullscreen)') && !document.fullscreenElement)
      || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    language: navigator.language,
  };
}

/** As preferências que mudam o que a mesa mostra e quando ela passa a vez. Nada além delas sai do localStorage. */
export function localPreferences(): Record<string, unknown> {
  const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
  return {
    cards: read('mesa:cards') === 'art' ? 'arte e texto' : read('mesa:cards') === 'arena' ? 'arena' : 'imagem completa',
    pace: read('mesa:pace') === 'fast' ? 'rápido sem resposta' : 'normal',
    reducedMotion: media('(prefers-reduced-motion: reduce)'),
    autoPassNoActions: read('mesa:autoPassNoActions') !== 'false',
    passResponses: read('mesa:passResponses') === 'true',
  };
}

export function buildReport(input: { kind: FeedbackKind; description: string; from: FeedbackReport['from']; version: string; recording: Recording | null; diagnostics?: string }): FeedbackReport {
  const meta = input.recording?.meta;
  return {
    v: 1, kind: input.kind, description: input.description.trim().slice(0, DESCRIPTION_LIMIT), createdAt: new Date().toISOString(), from: input.from,
    app: { version: input.version }, device: deviceInfo(), preferences: { ...localPreferences(), ...meta?.preferences },
    ...(meta ? { match: { matchId: meta.matchId, format: meta.format, rulesVersion: meta.rulesVersion, engineVersion: meta.engineVersion, net: meta.net, playerCount: meta.playerCount } } : {}),
    ...(input.diagnostics ? { diagnostics: input.diagnostics } : {}),
    recording: input.recording,
  };
}

/** O arquivo que vai para o servidor: o mesmo que "Baixar gravação" salva. A gravação é cortada para caber em 2 MB. */
export async function encodeReport(report: FeedbackReport) {
  const fitted = report.recording ? (await fitRecording(report.recording)).recording : null;
  return gzip(JSON.stringify({ ...report, recording: fitted }));
}

/** Tamanho da gravação comprimida, para o formulário mostrar antes de enviar. */
export async function recordingSize(recording: Recording) { return (await fitRecording(recording)).bytes; }

// ---------------------------------------------------------------- envio e fila

interface QueuedReport { url: string; body: Uint8Array; headers: Record<string, string>; createdAt: number }
const OFFLINE = 'Sem conexão com o servidor. O relato ficou guardado e sai sozinho quando a conexão voltar.';
const LIMIT = 'Muitos relatos seguidos, tente de novo em alguns minutos. O relato ficou guardado e sai sozinho depois.';

async function post(item: QueuedReport): Promise<{ ok: true; code: string } | { ok: false; retry: boolean; status: number; text?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(item.url, { method: 'POST', body: item.body as BodyInit, headers: item.headers, signal: controller.signal });
    const json = await response.json().catch(() => ({})) as { code?: string; error?: string };
    if (response.ok && json.code) return { ok: true, code: json.code };
    // Limite de envio, servidor fora, sem espaço ou ainda sem a rota (404): tenta de novo depois. O resto (relato inválido) não adianta repetir.
    const retry = [404, 408, 429].includes(response.status) || response.status >= 500;
    return { ok: false, retry, status: response.status, text: json.error };
  } catch {
    return { ok: false, retry: true, status: 0 };
  } finally { clearTimeout(timer); }
}

const enqueue = (item: QueuedReport) => withStore<IDBValidKey | undefined>(STORES.reports, 'readwrite', store => store.add(item), undefined);

export async function sendReport(report: FeedbackReport, attachment?: Pick<MatchAttachment, 'url' | 'code' | 'token'>): Promise<SendResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' };
  // Com a partida anexada, a ponte junta o lado dela (decks de todos, retratos do Forge, diário de ações) pelo assento.
  if (report.recording && attachment?.code && attachment.token) { headers['X-Mesa-Partida'] = attachment.code; headers['X-Mesa-Token'] = attachment.token; }
  const item: QueuedReport = { url: feedbackUrl(attachment?.url), body: await encodeReport(report), headers, createdAt: Date.now() };
  const result = await post(item);
  if (result.ok) return { status: 'sent', code: result.code };
  if (!result.retry) return { status: 'rejected', text: result.text ?? 'O servidor recusou o relato.' };
  // Sem IndexedDB (navegação privada) não há fila: o formulário continua aberto para tentar de novo.
  if (await enqueue(item) === undefined) return { status: 'rejected', text: result.status === 429 ? 'Muitos relatos seguidos, tente de novo em alguns minutos.' : 'Sem conexão com o servidor. Tente de novo daqui a pouco.' };
  scheduleFlush();
  return { status: 'queued', text: result.status === 429 ? LIMIT : result.status === 507 && result.text ? `${result.text} O relato ficou guardado.` : OFFLINE };
}

let flushing: Promise<void> | null = null;
/** Manda o que está na fila, do mais antigo ao mais novo; para no primeiro que ainda não dá para mandar. */
export function flushQueue() {
  return flushing ??= (async () => {
    try {
      const keys = await withStore<IDBValidKey[]>(STORES.reports, 'readonly', store => store.getAllKeys(), []);
      for (const key of keys) {
        const item = await withStore<QueuedReport | undefined>(STORES.reports, 'readonly', store => store.get(key), undefined);
        if (!item) continue;
        const result = await post(item);
        if (!result.ok && result.retry) { scheduleFlush(); return; }
        await withStore(STORES.reports, 'readwrite', store => store.delete(key), undefined);
      }
    } finally { flushing = null; }
  })();
}

let retryTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleFlush() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => void flushQueue(), 60_000);
}

/** Chamar uma vez, no início: tenta a fila agora e sempre que a conexão voltar. */
export function startFeedbackQueue() {
  addEventListener('online', () => void flushQueue());
  void flushQueue();
}

// ---------------------------------------------------------------- última partida

const LAST = 'ultima';
/** Guarda a gravação com o assento (código e token de volta), para a ponte ainda juntar o diário se a partida existir. */
export const saveLastMatch = (match: MatchAttachment) => withStore(STORES.recording, 'readwrite', store => store.put(match, LAST), undefined);
export async function loadLastMatch(): Promise<MatchAttachment | null> {
  const match = await withStore<MatchAttachment | undefined>(STORES.recording, 'readonly', store => store.get(LAST), undefined);
  return match?.recording?.format === RECORDING_FORMAT && match.recording.frames?.length ? match : null;
}

let liveMatch: () => MatchAttachment | null = () => null;
/** A partida em andamento (ou recém-acabada) ainda na memória, registrada pela página principal. */
export function setLiveMatch(source: () => MatchAttachment | null) { liveMatch = source; }
/** A partida que pode ir junto num relato: a da memória ou, sem ela, a última guardada no aparelho. */
export async function latestMatch() { return liveMatch() ?? loadLastMatch(); }
