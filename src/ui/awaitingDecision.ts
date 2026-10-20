import type { FState } from '../forge/client';

/**
 * Decisão que segura a partida até o jogador responder: alvo, sacrifício, descarte, pergunta de sim/não
 * (mover o comandante para a zona de comando, pagar um custo opcional...). Prioridade comum, ataque, bloqueio,
 * pagamento de mana e a abertura ficam de fora: têm tela própria ou não seguram ninguém.
 * centered: a pergunta não depende de cartas na mesa, então a caixa de ação vai para o centro.
 */
export interface AwaitingDecision { kind: 'target' | 'select' | 'confirm' | 'choice'; centered: boolean }

export function awaitingDecision(s: FState): AwaitingDecision | null {
  const input = s.input;
  if (s.gameOver || s.spectating || s.sideboarding || s.question || input.opening) return null;
  if (input.priority || input.attacking || input.blocking || input.paying) return null;
  if (input.targeting) return { kind: 'target', centered: false };
  if (input.selection) return { kind: 'select', centered: false };
  if (input.suspendCast) return { kind: 'confirm', centered: false };
  const onBoard = input.selectable.length > 0 || !!input.selectablePlayers?.length || !!input.selectableStacks?.length;
  if (onBoard) return { kind: 'choice', centered: false };
  if (input.ok.enabled || input.cancel.enabled) return { kind: 'confirm', centered: true };
  return null;
}

/** Outro jogador decidindo algo: "Aguardando Ana escolher…". Vazio quando a ponte não manda ou ninguém decide. */
export function waitingOnText(s: FState): string {
  const entry = s.deciding?.find(d => d.player !== s.you);
  if (!entry || s.gameOver) return '';
  const name = s.players.find(p => p.id === entry.player)?.name ?? 'Oponente';
  return entry.kind === 'attack' ? `Aguardando ${name} declarar atacantes…`
    : entry.kind === 'block' ? `Aguardando ${name} declarar bloqueadores…`
    : `Aguardando ${name} escolher…`;
}
