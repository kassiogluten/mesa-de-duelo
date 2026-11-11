// Liga os eventos do cliente do servidor à mesa e à tela inicial: partida nova, revanche, assistir e retomar.
import type { ForgeClient, FState, NoticeDetail } from '../forge/client';
import type { ForgeTableView } from '../ui/forgeTable';
import type { Lobby } from '../ui/lobby';
import type { ForgeConnection } from './connection';
import type { RecordingSession } from './recordingSession';
import { clearResume, saveResume, type ForgeMatch } from './resume';

export type Screen = 'lobby' | 'game' | 'decks' | 'free' | 'lab';
/** Assistindo à partida de uma sala: sem deck, sem assento e sem gravação; cair a conexão pede para assistir de novo. */
export interface Watching { url: string; code: string; name: string }
/** O que a página sabe da partida: a do assento (ou a sala esperando), a assistida e a tela à vista. */
export interface MatchSession { current: ForgeMatch | null; watching: Watching | null; screen: Screen }

/**
 * Outra partida começou na mesma conexão (revanche, "Recomeçar", jogo seguinte da melhor de três): a mesa é zerada.
 * Sem `match` (pontes antigas), vale o fim da partida desfeito ou o turno voltando.
 */
export function isFreshMatch(prev: FState | null, s: FState) {
  return !!prev && (prev.matchId !== s.matchId || prev.match?.gameNumber !== s.match?.gameNumber || (!s.match && ((prev.gameOver && !s.gameOver) || s.turn < prev.turn)));
}

export interface MatchWiring {
  session: MatchSession;
  connection: Pick<ForgeConnection, 'isCurrent' | 'forget'>;
  recording: RecordingSession;
  table: Pick<ForgeTableView, 'render' | 'notice' | 'diagnostic' | 'disconnected' | 'pointed'>;
  lobby: Pick<Lobby, 'showRoom' | 'setStatus' | 'roomSay'>;
  show(screen: Screen): void;
  /** Abre a mesa da partida (ou da assistida, com m null). */
  enterTable(client: ForgeClient, m: ForgeMatch | null): void;
  /** Resolve (ou recusa, com o erro) o pedido de começar que estiver esperando. */
  finishStart(error?: string): void;
  autoRewatch(): void;
  autoReconnect(): void;
}

/** Liga os eventos de um cliente recém-conectado à mesa, à tela inicial, à gravação e à volta à partida. */
export function bindMatchClient(client: ForgeClient, w: MatchWiring) {
  const { session, recording, table, lobby } = w;
  const { recorder } = recording;
  const mine = () => w.connection.isCurrent(client);
  let prev: FState | null = null;
  /** Aviso com lista (cartas que o computador não joga bem): chega antes do primeiro estado e espera a mesa abrir. */
  let heldNotice: [string, NoticeDetail] | null = null;
  client.onSend = msg => { if (mine() && session.current) recorder.sent(msg); };
  client.onState = s => {
    if (!mine()) return;
    const m = session.current;
    if (m) {
      // Revanche ou "Recomeçar": a ponte troca o matchId e a gravação começa de novo.
      if (s.matchId && recorder.matchId && s.matchId !== recorder.matchId) { recording.persist(); recorder.reset(recording.meta(m)); }
      recorder.received(s);
      recording.setSeat({ url: m.url, code: s.session?.code ?? m.code, token: s.session?.token ?? m.token });
    }
    if (m && s.session) {
      m.code = s.session.code;
      m.token = s.session.token;
      // Só partidas em andamento ficam guardadas: no fim não há para onde voltar.
      m.config = s.config ?? m.config;
      if (s.match?.over ?? s.gameOver) clearResume(); else saveResume(session.current);
    }
    // A mesa abre no primeiro estado (sala em rede, volta depois de recarregar) e é zerada quando
    // começa outra partida (revanche ou "Recomeçar").
    const fresh = isFreshMatch(prev, s);
    if (m && (session.screen !== 'game' || fresh)) w.enterTable(client, m);
    else if (!m && session.watching && s.watching && (session.screen !== 'game' || fresh)) w.enterTable(client, null);
    prev = s;
    w.finishStart();
    table.render();
    if (heldNotice && session.screen === 'game') { table.notice(heldNotice[0], false, heldNotice[1]); heldNotice = null; }
  };
  client.onRoom = r => {
    const current = session.current;
    if (current?.net && !r.started) {
      current.code = r.code; current.token = r.token; current.config = r.config;
      // A sala de teste criada no Laboratório espera o outro lado na mesma sala de espera das salas em rede.
      saveResume(session.current); lobby.showRoom(r); lobby.setStatus(''); w.finishStart();
      if (session.screen === 'lab') w.show('lobby');
    }
  };
  client.onRoomSay = (seat, key) => lobby.roomSay(seat, key);
  client.onPoint = (player, card) => { if (session.screen === 'game') table.pointed(player, card); };
  client.onValidation = (validation, target) => {
    const message = `${target === 'opponent' ? 'Deck do computador: ' : ''}${validation.issues.map(issue => `${issue.card ? `${issue.card}: ` : ''}${issue.message}`).join(' ')}`;
    if (session.screen === 'game') table.notice(message, true);
    else { lobby.setStatus(message, true); w.finishStart(message); session.current = null; }
  };
  client.onNotice = (text, error, detail) => {
    if (detail?.groups && mine()) { heldNotice = [text, detail]; if (session.current) recorder.note('aviso', text); return; }
    if (error) w.finishStart(text);
    // Erros na mesa já entram pelo painel de erros (onDiagnostic).
    if (session.current && (!error || session.screen !== 'game')) recorder.note(error ? 'erro' : 'aviso', text);
    if (session.screen === 'game') table.notice(text, error, detail);
    else lobby.setStatus(text, error);
    // Voltando a assistir, a sala pode ter acabado: sem estado nesta conexão, volta ao início com o aviso.
    if (error && session.watching && !client.state && session.screen === 'game') { session.watching = null; w.show('lobby'); lobby.setStatus(text, true); return; }
    // Sala fechada ou código errado antes de a partida começar: volta ao formulário.
    if (error && session.current?.net && session.screen !== 'game') { session.current = null; lobby.showRoom(null); }
  };
  client.onDiagnostic = d => { if (mine()) table.diagnostic(d); };
  client.onGone = text => {
    // A ponte não conhece mais a partida (encerrada ou ponte reiniciada): esquece e volta ao início.
    session.current = null; session.watching = null;
    clearResume();
    client.close();
    w.connection.forget(client);
    w.show('lobby');
    lobby.showRoom(null);
    lobby.setStatus(text, true);
  };
  client.onClose = () => {
    if (!mine()) return;
    w.finishStart('A conexão com o servidor foi interrompida.');
    const current = session.current;
    if (session.watching) w.autoRewatch();
    else if (current?.token && client.replaced) table.disconnected('A partida foi aberta em outra janela. Reconecte para trazê-la de volta para cá.');
    else if (current?.token) w.autoReconnect();
    else if (session.screen === 'game') table.disconnected();
    else if (current?.net) { session.current = null; lobby.showRoom(null); lobby.setStatus('A conexão com o servidor caiu.', true); }
  };
}
