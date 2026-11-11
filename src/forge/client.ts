import type { DeckData, DeckFormat } from '../decks';
import type { ClientMessage, DeckValidation, FRoom, FState, NoticeDetail, PublicRoom, ReplyMessage, RequestMessage, RequestReplies, RoomInfo, RoomSaying, ServerMessage, SimilarCard } from './protocol';

export type * from './protocol';

/** Cliente da ponte do Forge (forge-bridge). Formato das mensagens em ./protocol.ts e forge-bridge/README.md. */

/**
 * Endereço padrão da ponte: a mesma máquina que serviu a página. Assim, quem abre a página pela rede
 * (http://IP-DO-ANFITRIÃO:5173) já encontra a ponte do anfitrião. "localhost" vira 127.0.0.1 porque a
 * ponte só escuta IPv4. Fora do Vite (dev na 5173, preview na 4173), a página está publicada atrás de um
 * proxy que repassa /ws para a ponte no mesmo endereço (veja deploy/nginx.conf).
 */
function defaultUrl() {
  if (typeof location !== 'undefined' && location.host && !['5173', '4173'].includes(location.port)) {
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  }
  const host = typeof location === 'undefined' || !location.hostname || location.hostname === 'localhost' ? '127.0.0.1' : location.hostname;
  return `ws://${host.includes(':') ? `[${host}]` : host}:7171/ws`;
}


/** Erro de uma consulta à ponte; `reason` diz o motivo quando a mesa reage a ele (como 'room-not-found'). */
export class RequestError extends Error {
  readonly reason?: string;
  constructor(message: string, reason?: string) { super(message); this.reason = reason; }
}

export const FORGE_URL: string = import.meta.env?.VITE_FORGE_URL ?? defaultUrl();

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

/** Os problemas de um deck recusado, numa frase só. */
export const validationText = (v: DeckValidation | undefined) =>
  v?.issues?.map(i => `${i.card ? `${i.card}: ` : ''}${i.message}`).join(' ') || 'O deck não vale para o formato da sala.';
const REPLY_TYPES = new Set<string>(['validation', 'room-info', 'room-list', 'room-deck', 'deck-source', 'similar-cards', 'request-error', 'error', 'validation-error']);
const isReply = (msg: ServerMessage): msg is ReplyMessage => 'requestId' in msg && typeof msg.requestId === 'string' && REPLY_TYPES.has(msg.type);

/** Lê uma mensagem do servidor; null se não for JSON com `type`. */
export function parseServerMessage(data: unknown): ServerMessage | null {
  if (typeof data !== 'string') return null;
  try {
    const msg: unknown = JSON.parse(data);
    return msg && typeof msg === 'object' && typeof (msg as { type?: unknown }).type === 'string' ? msg as ServerMessage : null;
  } catch { return null; }
}

/** O valor que a resposta entrega ao pedido, ou o erro que o recusa. */
function settleReply(msg: ReplyMessage): { value: unknown } | { error: RequestError } {
  switch (msg.type) {
    case 'validation': return { value: msg.validation };
    case 'room-info': return { value: msg.room };
    case 'room-list': return { value: Array.isArray(msg.rooms) ? msg.rooms : [] };
    case 'deck-source': return { value: msg.body };
    case 'similar-cards': return { value: Array.isArray(msg.cards) ? msg.cards : [] };
    case 'room-deck': return { value: undefined };
    case 'validation-error': return { error: new RequestError(validationText(msg.validation)) };
    default: return { error: new RequestError(msg.text ?? 'Não foi possível concluir a solicitação.', msg.reason) };
  }
}

export class ForgeClient {
  private ws: WebSocket | null = null;
  state: FState | null = null;
  room: FRoom | null = null;
  onState: (s: FState) => void = () => {};
  onRoom: (r: FRoom) => void = () => {};
  onRoomSay: (seat: number, key: RoomSaying) => void = () => {};
  onPoint: (player: number, card: number) => void = () => {};
  /** A partida foi aberta em outra janela, que assumiu o assento: não adianta reconectar sozinho. */
  replaced = false;
  /** A ponte não conhece mais a partida pedida no "rejoin". */
  onGone: (text: string) => void = () => {};
  onNotice: (text: string, error: boolean, detail?: NoticeDetail) => void = () => {};
  onClose: () => void = () => {};
  onValidation: (validation: DeckValidation, target: string) => void = () => {};
  /** Ação recusada pela ponte sem aviso ao jogador (ex.: clique num pedido que já tinha mudado). Vai só para o painel de erros. */
  onDiagnostic: (diagnostic: { code: string; action?: string; text: string }) => void = () => {};
  onHello: (info: {supportedFormats: DeckFormat[]; rulesVersion: string; engineVersion: string}) => void = () => {};
  /** Cada mensagem enviada (para a gravação da partida); delivered false quando a conexão já estava fechada. */
  onSend: (msg: ClientMessage, delivered: boolean) => void = () => {};
  private requestSequence = 0;
  private pending = new Map<string, {resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout>}>();

  private rejectPending(reason: string) {
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error(reason)); }
    this.pending.clear();
  }

  private request<M extends RequestMessage>(message: M, timeoutMs = 12000): Promise<RequestReplies[M['type']]> {
    if (!this.connected) return Promise.reject(new Error('Conecte-se ao servidor para verificar.'));
    const requestId = `request-${++this.requestSequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('O servidor demorou para responder. Tente novamente.')); }, timeoutMs);
      this.pending.set(requestId, {resolve: resolve as (value: unknown) => void, reject, timer});
      this.send({...message, requestId} as ClientMessage);
    });
  }

  validateDeck(deck: Pick<DeckData, 'name' | 'cards' | 'sideboard' | 'commanders'>, format: DeckFormat): Promise<DeckValidation> {
    return this.request({type: 'validate-deck', format, deck});
  }

  /** Escolhe ou troca o deck do próprio lugar na sala de espera; recusa com o motivo (deck inválido, partida já começada). */
  chooseRoomDeck(message: Omit<Extract<ClientMessage, { type: 'room-deck' }>, 'type' | 'requestId'>): Promise<void> {
    return this.request({type: 'room-deck', ...message});
  }

  lookupRoom(code: string): Promise<RoomInfo> { return this.request({type: 'lookup-room', code}); }

  /** Salas públicas com lugar ou em andamento (para assistir). As privadas nunca vêm na lista. */
  listRooms(): Promise<PublicRoom[]> { return this.request({type: 'list-rooms'}); }

  /** JSON da API pública do Moxfield ou do Archidekt, buscado pela ponte (o navegador esbarra no CORS). */
  fetchDeckSource(site: 'moxfield' | 'archidekt', id: string): Promise<string> { return this.request({type: 'fetch-deck', site, id}, 20000); }

  /**
   * Ordena as candidatas pela semelhança com a carta, pelas tags de função do Tagger (a ponte baixa o arquivo
   * do Scryfall uma vez por dia; o primeiro pedido do dia pode demorar).
   */
  similarCards(oracleId: string, candidates: string[], limit = 40): Promise<SimilarCard[]> {
    return this.request({type: 'similar-cards', oracleId, candidates, limit}, 60000);
  }

  connect(url = FORGE_URL, timeoutMs = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => { ws.close(); reject(new Error('tempo esgotado')); }, timeoutMs);
      ws.onopen = () => { clearTimeout(timer); this.ws = ws; resolve(); };
      ws.onerror = () => { clearTimeout(timer); reject(new Error('conexão recusada')); };
      ws.onclose = () => { if (this.ws === ws) { this.ws = null; this.rejectPending('A conexão foi interrompida.'); this.onClose(); } };
      ws.onmessage = ev => {
        const msg = parseServerMessage(ev.data);
        if (!msg) return;
        if (isReply(msg) && this.pending.has(msg.requestId)) {
          const request = this.pending.get(msg.requestId)!;
          clearTimeout(request.timer); this.pending.delete(msg.requestId);
          const settled = settleReply(msg);
          if ('error' in settled) request.reject(settled.error); else request.resolve(settled.value);
          return;
        }
        switch (msg.type) {
          case 'state':
            this.state = msg;
            if (msg.room) this.room = msg.room;
            this.onState(msg);
            break;
          case 'room': this.room = msg.room; this.onRoom(msg.room); break;
          case 'room-say': this.onRoomSay(msg.seat, msg.key); break;
          case 'point': this.onPoint(msg.player, msg.card); break;
          case 'validation-error': this.onValidation(msg.validation, msg.target ?? ''); break;
          case 'hello': this.onHello(msg); break;
          case 'toast': this.onNotice(msg.text, false, msg.title || Array.isArray(msg.cards) || Array.isArray(msg.groups) ? { title: msg.title, cards: Array.isArray(msg.cards) ? msg.cards : undefined, groups: Array.isArray(msg.groups) ? msg.groups : undefined } : undefined); break;
          case 'error': this.onNotice(msg.text ?? '', true); break;
          case 'diagnostic': this.onDiagnostic({ code: String(msg.code ?? ''), action: msg.action, text: String(msg.text ?? '') }); break;
          case 'gone': this.onGone(msg.text); break;
          case 'replaced': this.replaced = true; this.onNotice(msg.text, true); break;
        }
      };
    });
  }

  get connected() { return !!this.ws && this.ws.readyState === WebSocket.OPEN; }

  send(msg: ClientMessage) {
    const delivered = this.connected;
    if (delivered) this.ws!.send(JSON.stringify(msg));
    this.onSend(msg, delivered);
  }

  close() {
    const ws = this.ws;
    this.ws = null;
    this.rejectPending('A conexão foi encerrada.');
    ws?.close();
  }
}
