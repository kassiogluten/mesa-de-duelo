import { KEYS } from '../storage';
import type { DeckData } from '../decks';
import type { MatchConfig } from '../forge/client';

/**
 * Partida no Forge em andamento (ou sala esperando o oponente): o que é preciso para redesenhar a mesa
 * e voltar ao mesmo assento se a conexão cair. code/token chegam da ponte em state.session.
 */
export interface ForgeMatch { url: string; deck: DeckData; opp?: DeckData; opponents?: (DeckData | null)[]; net: boolean; config?: MatchConfig; code?: string; token?: string; lab?: boolean }

/**
 * Guardada no localStorage para voltar à partida mesmo depois de recarregar a página ou fechar a aba. A sala de teste
 * do Laboratório fica no sessionStorage, de cada aba: quem joga pelos dois lados tem uma aba em cada assento.
 */
const RESUME_KEY = KEYS.resume;
export function saveResume(current: ForgeMatch | null) {
  try {
    if (current?.lab) sessionStorage.setItem(RESUME_KEY, JSON.stringify(current));
    else localStorage.setItem(RESUME_KEY, JSON.stringify(current));
  } catch { /* sem armazenamento */ }
}
export function clearResume() {
  try { sessionStorage.removeItem(RESUME_KEY); localStorage.removeItem(RESUME_KEY); } catch { /* sem armazenamento */ }
}
export function loadResume(): ForgeMatch | null {
  const read = (storage: Storage) => {
    try {
      const m = JSON.parse(storage.getItem(RESUME_KEY) ?? 'null') as ForgeMatch | null;
      return m?.url && m.code && m.token && m.deck ? m : null;
    } catch { return null; }
  };
  return read(sessionStorage) ?? read(localStorage);
}
