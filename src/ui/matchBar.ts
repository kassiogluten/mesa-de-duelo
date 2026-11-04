import type { FState } from '../forge/client';
import { esc } from './cardtext';

export interface MatchChip { kind: 'series' | 'offline' | 'spectating'; text: string; label: string }

const FORMAT: Record<string, string> = { commander: 'Commander', standard: 'Standard', pauper: 'Pauper', sacola50: 'Sacola 50', free: 'Livre', oathbreaker: 'Oathbreaker', precon: 'Precon' };

/** Nome do formato da partida, para o menu. */
export const matchFormatName = (s: Pick<FState, 'config'>) => s.config?.format ? FORMAT[s.config.format] ?? '' : '';

/** Placar da melhor de três; vazio numa partida única. */
export function seriesText(s: Pick<FState, 'config' | 'match'>): string {
  return s.match && s.config?.matchLength === 'bo3' ? `Jogo ${s.match.gameNumber} · ${s.match.wins.join(' × ')}` : '';
}

/**
 * A barra do topo fica só com o que muda a partida: o placar da melhor de três, quem caiu e o aviso de quem só
 * assiste. Formato, sala e quem assiste ficam no menu.
 */
export function matchChips(s: FState): MatchChip[] {
  const chips: MatchChip[] = [];
  if (s.spectating) chips.push({ kind: 'spectating', text: 'Assistindo', label: s.watching ? 'Você está assistindo, sem jogar' : 'Você está assistindo a partida' });
  const series = seriesText(s);
  if (series) chips.push({ kind: 'series', text: series, label: `Jogo ${s.match!.gameNumber} da melhor de três, placar ${s.match!.wins.join(' × ')}` });
  const me = s.room?.seat;
  const away = (s.room?.players ?? []).filter((p, i) => !p.connected && !p.eliminated && (p.seat ?? i) !== me);
  if (away.length === 1) chips.push({ kind: 'offline', text: `${away[0].name} desconectado`, label: `${away[0].name} está desconectado` });
  else if (away.length > 1) chips.push({ kind: 'offline', text: `${away.length} desconectados`, label: `${away.map(p => p.name).join(', ')} estão desconectados` });
  return chips;
}

export function matchBarHTML(s: FState) {
  return matchChips(s).map(c => `<li class="match-chip ${c.kind}" title="${esc(c.label)}">${esc(c.text)}</li>`).join('');
}
