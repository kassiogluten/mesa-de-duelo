import type { FState } from '../forge/client';
import { esc } from './cardtext';

export interface MatchChip { kind: 'format' | 'room' | 'series' | 'offline' | 'spectating'; text: string; label: string }

const FORMAT: Record<string, string> = { commander: 'Commander', standard: 'Standard', pauper: 'Pauper', sacola50: 'Sacola 50', free: 'Livre' };

/** Informação de relance da barra do topo: o que antes só aparecia ao abrir o menu. */
export function matchChips(s: FState): MatchChip[] {
  const chips: MatchChip[] = [];
  const format = s.config?.format ? FORMAT[s.config.format] : undefined;
  if (format) chips.push({ kind: 'format', text: format, label: `Formato ${format}` });
  if (s.spectating) chips.push({ kind: 'spectating', text: 'Assistindo', label: 'Você está assistindo a partida' });
  if (s.room) chips.push({ kind: 'room', text: `Sala ${s.room.code}`, label: `Sala ${s.room.code}` });
  if (s.match && s.config?.matchLength === 'bo3') {
    const score = s.match.wins.join(' × ');
    chips.push({ kind: 'series', text: `Jogo ${s.match.gameNumber} · ${score}`, label: `Jogo ${s.match.gameNumber} da melhor de três, placar ${score}` });
  }
  const me = s.room?.seat;
  const away = (s.room?.players ?? []).filter((p, i) => !p.connected && !p.eliminated && (p.seat ?? i) !== me);
  if (away.length === 1) chips.push({ kind: 'offline', text: `${away[0].name} desconectado`, label: `${away[0].name} está desconectado` });
  else if (away.length > 1) chips.push({ kind: 'offline', text: `${away.length} desconectados`, label: `${away.map(p => p.name).join(', ')} estão desconectados` });
  return chips;
}

export function matchBarHTML(s: FState) {
  return matchChips(s).map(c => `<li class="match-chip ${c.kind}" title="${esc(c.label)}">${esc(c.text)}</li>`).join('');
}
