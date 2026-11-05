// Conexão com o servidor de jogo: uma só por vez, reaproveitada e com o aviso de conectando na tela.
import { ForgeClient } from '../forge/client';

export interface ForgeConnectionOptions {
  /** Começou a conectar com aviso na tela. */
  onConnecting(): void;
  /** A última tentativa com aviso não achou o servidor; `hint` diz o que fazer. */
  onUnreachable(url: string, hint: string): void;
  /** Conectou: liga os eventos do cliente à mesa e à tela inicial. */
  bind(client: ForgeClient): void;
}

/**
 * A conexão com a ponte: uma só de cada vez, reaproveitada enquanto o endereço é o mesmo. Duas tentativas seguidas
 * para o mesmo endereço esperam a mesma; uma tentativa mais nova faz a antiga desistir sem mexer na tela.
 */
export function createForgeConnection(o: ForgeConnectionOptions) {
  let forge: ForgeClient | null = null;
  let forgeUrl = '';
  let connecting: Promise<ForgeClient | null> | null = null;
  let connectingUrl = '';
  let connectionAttempt = 0;
  /**
   * Conecta à ponte (reaproveitando a conexão aberta com o mesmo endereço) e liga os eventos à mesa.
   * hint null: falha em silêncio, sem mexer na tela (usado nas tentativas de reconexão).
   */
  async function connect(url: string, hint: string | null): Promise<ForgeClient | null> {
    if (forge?.connected && forgeUrl === url) return forge;
    if (connecting && connectingUrl === url) return connecting;
    connectingUrl = url;
    connecting = open(url, hint, ++connectionAttempt);
    const attempt = connecting;
    try { return await attempt; } finally { if (connecting === attempt) connecting = null; }
  }
  async function open(url: string, hint: string | null, attempt: number): Promise<ForgeClient | null> {
    forge?.close();
    forge = null;
    if (hint !== null) o.onConnecting();
    const client = new ForgeClient();
    try {
      await client.connect(url);
    } catch {
      if (hint !== null && attempt === connectionAttempt) o.onUnreachable(url, hint);
      return null;
    }
    if (attempt !== connectionAttempt) { client.close(); return null; }
    forge = client;
    forgeUrl = url;
    o.bind(client);
    return client;
  }
  async function require(url: string): Promise<ForgeClient> {
    const client = await connect(url, null);
    if (!client) throw new Error('Não foi possível conectar ao servidor de jogo. Confira a conexão e tente novamente.');
    return client;
  }
  return {
    /** A conexão aberta agora, se houver. */
    get client() { return forge; },
    isCurrent: (client: ForgeClient) => forge === client,
    connect,
    require,
    /** Fecha a conexão aberta (sair da partida, voltar ao Laboratório). */
    close() { forge?.close(); forge = null; },
    /** Esquece o cliente que a ponte encerrou, se ainda for o atual. */
    forget(client: ForgeClient) { if (forge === client) forge = null; },
  };
}
export type ForgeConnection = ReturnType<typeof createForgeConnection>;
