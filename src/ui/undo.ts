import type { FState } from '../forge/client';
import { esc } from './cardtext';

/*
 * Desfazer (opção escolhida ao criar a partida): o selo que avisa que está ligado, o botão de pedir e a faixa do
 * pedido aberto, com Aceitar/Recusar para os outros. A ponte confere tudo de novo; aqui só se mostra e se manda.
 */

export const UNDO_EXPLAINED = 'Desfazer ligado: qualquer jogador pode pedir para voltar a própria última decisão. Só volta se todos os outros aceitarem.';
export const UNDO_EXPLAINED_SOLO = 'Desfazer ligado: você pode voltar a sua última decisão.';

/** Selo "Desfazer ligado" para a lista de salas, a sala de espera e a barra da partida. */
export function undoBadgeHTML(): string {
  return `<span class="undo-badge" title="${esc(UNDO_EXPLAINED)}">${UNDO_ICON}Desfazer ligado</span>`;
}

export const UNDO_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>';

/**
 * O botão de pedir, na barra do topo de todos os jogadores: é ele que mostra que a partida tem o Desfazer ligado.
 * Desligado (mas à vista) quando não há o que desfazer; a dica sempre explica a regra.
 */
export function undoButtonState(s: Pick<FState, 'config' | 'undo' | 'spectating' | 'gameOver' | 'room'>): { hidden: boolean; disabled: boolean; title: string } {
  if (!s.config?.undo || s.spectating) return { hidden: true, disabled: true, title: '' };
  const u = s.undo, rule = s.room ? UNDO_EXPLAINED : UNDO_EXPLAINED_SOLO;
  if (s.gameOver) return { hidden: false, disabled: true, title: `${rule} A partida acabou.` };
  if (u?.request || u?.pending) return { hidden: false, disabled: true, title: `${rule} Já há um pedido em andamento.` };
  if (!u?.last) return { hidden: false, disabled: true, title: `${rule} Ainda não há nada seu para desfazer.` };
  return { hidden: false, disabled: false, title: `Desfazer: ${u.last.text}${s.room ? ' (os outros precisam aceitar)' : ''}` };
}

/** A faixa do pedido aberto: quem pediu espera (e pode desistir); quem vota aceita ou recusa. */
export function undoBarHTML(s: Pick<FState, 'undo' | 'spectating'>): string {
  const r = s.undo?.request;
  if (!r || s.spectating) return '';
  const waiting = r.waiting.length ? `Esperando ${r.waiting.join(', ')}.` : 'Voltando…';
  if (r.mine) return `<div class="skip-row undo" role="group" aria-label="Seu pedido de desfazer">
      <span class="skip-text"><strong>Pedido enviado: desfazer ${esc(r.step.text)}</strong><small>${esc(waiting)}</small></span>
      <button type="button" class="arena-btn secondary" data-undo="cancel">Desistir</button></div>`;
  return `<div class="skip-row undo" role="group" aria-label="${esc(`Pedido de ${r.name} para desfazer`)}">
      <span class="skip-text"><strong>${esc(r.name)} pediu para desfazer: ${esc(r.step.text)}</strong>
        <small>${r.canVote ? 'A mesa volta para antes dessa decisão, para todos. Só volta se todos aceitarem.' : esc(waiting)}</small></span>
      ${r.canVote ? `<span class="skip-actions">
        <button type="button" class="arena-btn ${r.vote === 'yes' ? 'primary' : 'secondary'}" data-undo="yes" aria-pressed="${r.vote === 'yes'}">Aceitar</button>
        <button type="button" class="arena-btn secondary" data-undo="no">Recusar</button>
      </span>` : ''}</div>`;
}
