import { MatchRecorder, type RecordingMeta } from '../forge/recording';
import { deviceInfo, localPreferences, saveLastMatch, setLiveMatch, type MatchAttachment } from '../feedback';
import { VERSION } from '../ui/changelog';
import { forgeDeck } from './matchDecks';
import type { ForgeMatch } from './resume';

/**
 * Gravação da partida para os relatos (item 28): estados recebidos, mensagens enviadas e erros. Fica na memória
 * e, de tempos em tempos, no IndexedDB, para relatar da tela inicial depois que a partida acabou.
 */
export function createRecordingSession() {
  const recorder = new MatchRecorder({ app: VERSION });
  /** Assento da partida gravada, para a ponte juntar o diário dela ao relato. Continua depois de sair da partida. */
  let recordedSeat: Pick<MatchAttachment, 'url' | 'code' | 'token'> = {};
  const meta = (m: ForgeMatch): RecordingMeta => ({ app: VERSION, net: m.net, format: m.config?.format, deck: forgeDeck(m.deck), device: deviceInfo(), preferences: localPreferences() });
  const liveAttachment = (): MatchAttachment | null => recorder.empty ? null : { recording: recorder.snapshot(), ...recordedSeat };
  setLiveMatch(liveAttachment);
  let savedRevision = -1;
  function persist() {
    if (recorder.empty || recorder.revision === savedRevision) return;
    savedRevision = recorder.revision;
    void saveLastMatch(liveAttachment()!);
  }
  setInterval(persist, 20000);
  addEventListener('pagehide', persist);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persist(); });
  return {
    recorder, meta, persist,
    setSeat(seat: Pick<MatchAttachment, 'url' | 'code' | 'token'>) { recordedSeat = seat; },
  };
}
export type RecordingSession = ReturnType<typeof createRecordingSession>;
