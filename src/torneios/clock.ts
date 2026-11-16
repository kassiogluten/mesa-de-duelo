// Relógio da rodada na página Torneios: o que falta, o texto e o HTML do relógio e da tela cheia, sem DOM (para os testes).
import { esc } from '../ui/cardtext';
import { ICON_PAUSE, ICON_PLAY, ICON_RESET, ICON_SCREEN } from './art';

/** Como o servidor manda (RoundClock.java): {@code agora} é a hora do servidor, para acertar a deste aparelho. */
export interface Relogio { estado: 'parado' | 'correndo' | 'pausado'; restanteMs: number; terminaEm?: string; agora: number }

/** Com 5 minutos ou menos, o relógio fica âmbar. */
export const AVISO_MS = 5 * 60_000;
/** Os ajustes que o organizador tem à mão. */
export const AJUSTES = [-5, -1, 1, 5] as const;

/**
 * O que falta agora. Correndo, conta até {@code terminaEm} pelo relógio deste aparelho, corrigido pela diferença
 * para o do servidor medida quando a resposta chegou ({@code recebidoEm}); parado ou pausado, o que o servidor mandou.
 */
export function restante(r: Relogio, recebidoEm: number, agora = Date.now()) {
  if (r.estado !== 'correndo' || !r.terminaEm) return r.restanteMs;
  return Date.parse(r.terminaEm) - (agora + (r.agora - recebidoEm));
}

/** "50:00", "4:07", "1:05:00"; depois do zero, "0:00". */
export function tempoTexto(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, seg = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${seg}` : `${m}:${seg}`;
}

export type Fase = 'ok' | 'aviso' | 'tempo';
export const fase = (ms: number): Fase => ms <= 0 ? 'tempo' : ms <= AVISO_MS ? 'aviso' : 'ok';

/** A linha embaixo dos números. */
export function estadoTexto(r: Relogio, ms: number, minutos: number) {
  if (fase(ms) === 'tempo') return 'Tempo! Terminem o turno e joguem mais 5 turnos.';
  if (r.estado === 'parado') return `Pronto para começar · ${minutos} min`;
  if (r.estado === 'pausado') return 'Pausado';
  return fase(ms) === 'aviso' ? 'Últimos minutos' : 'Correndo';
}

const ajusteTexto = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n)} min`;

/** O relógio no alto da rodada; os botões de controle só para quem organiza, a tela cheia para todos. */
export function relogioHTML(r: Relogio, ms: number, minutos: number, organizador: boolean) {
  const controles = organizador ? `
    ${r.estado === 'correndo'
      ? `<button type="button" class="tn-btn" data-acao="relogio" data-relogio-acao="pausar">${ICON_PAUSE}<span>Pausar</span></button>`
      : `<button type="button" class="arena-btn primary" data-acao="relogio" data-relogio-acao="iniciar">${ICON_PLAY}<span>${r.estado === 'pausado' ? 'Continuar' : 'Iniciar relógio'}</span></button>`}
    ${AJUSTES.map(n => `<button type="button" class="tn-mini" data-acao="relogio" data-relogio-acao="ajustar" data-minutos="${n}" aria-label="${n > 0 ? 'Somar' : 'Tirar'} ${Math.abs(n)} ${Math.abs(n) === 1 ? 'minuto' : 'minutos'}">${ajusteTexto(n)}</button>`).join('')}
    ${r.estado !== 'parado' ? `<button type="button" class="tn-mini" data-acao="relogio" data-relogio-acao="zerar">${ICON_RESET}<span>Recomeçar</span></button>` : ''}` : '';
  return `<div class="tn-relogio f-${fase(ms)} e-${r.estado}" data-relogio>
    <div class="tn-relogio-mostrador" role="timer" aria-label="Tempo da rodada">
      <span class="tn-relogio-tempo" data-relogio-tempo>${tempoTexto(ms)}</span>
      <span class="tn-relogio-estado" data-relogio-estado>${esc(estadoTexto(r, ms, minutos))}</span>
    </div>
    <div class="tn-relogio-acoes">
      ${controles}
      <button type="button" class="tn-mini" data-acao="telao">${ICON_SCREEN}<span>Tela cheia</span></button>
    </div>
  </div>`;
}

/** A tela cheia, para a TV ou o projetor: o nome do torneio, a rodada e o relógio grande. */
export function telaoHTML(nome: string, rodada: string, r: Relogio, ms: number, minutos: number) {
  return `<div class="tn-telao f-${fase(ms)}" data-telao data-relogio role="dialog" aria-modal="true" aria-label="Relógio da rodada em tela cheia">
    <p class="tn-telao-nome">${esc(nome)}</p>
    <p class="tn-telao-rodada">${esc(rodada)}</p>
    <span class="tn-telao-tempo" data-relogio-tempo role="timer">${tempoTexto(ms)}</span>
    <span class="tn-telao-estado" data-relogio-estado>${esc(estadoTexto(r, ms, minutos))}</span>
    <button type="button" class="tn-btn tn-telao-fechar" data-acao="sair-telao">Sair da tela cheia</button>
  </div>`;
}
