// Conta no servidor quantos visitantes começam a jogar (item 109): só o nome do evento, uma vez por aba.
import { bridgeHttpUrl } from './forge/client';
import { KEYS } from './storage';

/**
 * Os passos de quem chega até a primeira partida: Jogar na /sobre, deck escolhido e partida começada (contra o
 * computador ou numa sala). Vai só o nome do evento, sem nada do jogador e sem cookie; o servidor soma por semana
 * (Funnel.java) e a área de admin mostra. Cada evento conta no máximo uma vez por aba (sessionStorage), para os
 * números falarem de visitas, não de cliques.
 */
export type FunnelEvent = 'jogar' | 'deck' | 'partida-ia' | 'partida-sala';

export function funnelUrl() { return bridgeHttpUrl('/api/funil'); }

function alreadySent(): FunnelEvent[] {
  try { return JSON.parse(sessionStorage.getItem(KEYS.funil) ?? '[]') as FunnelEvent[]; } catch { return []; }
}

/** Conta o evento, se esta aba ainda não contou. Sai mesmo com a página indo para outro endereço (Jogar na /sobre). */
export function countFunnel(event: FunnelEvent, send: (url: string, body: string) => void = beacon) {
  const sent = alreadySent();
  if (sent.includes(event)) return false;
  try { sessionStorage.setItem(KEYS.funil, JSON.stringify([...sent, event])); } catch { /* sem armazenamento: conta assim mesmo */ }
  try { send(funnelUrl(), JSON.stringify({ evento: event })); } catch { /* sem rede: o número só fica menor */ }
  return true;
}

function beacon(url: string, body: string) {
  // text/plain não pede a confirmação prévia do CORS no `npm run dev`, em que o servidor fica em outra porta.
  if (typeof navigator !== 'undefined' && navigator.sendBeacon?.(url, new Blob([body], { type: 'text/plain' }))) return;
  void fetch(url, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => {});
}
