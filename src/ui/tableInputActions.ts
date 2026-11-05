// Os botões da caixa de ação que respondem ao pedido do Forge (OK, Cancelar, Fim de turno, Resolver tudo, pagar com
// vida) e o atalho "Passar até o fim do turno", com a trava contra o clique duplo enquanto o Forge não responde.
import type { FState } from '../forge/client';
import { legalAttackAllTargets } from './commanderTable';
import { hideCardPreview } from './cardInspector';
import type { createAttackChoice } from './attackChoice';
import type { createPassMenu } from './passMenus';
import type { TableCtx } from './tableContext';

/**
 * Se o Forge recusar a ação (bloqueio inválido, por exemplo), o prompt não muda; a ponte libera os botões depois de
 * 1,5 s e a mesa também, senão o OK ficaria travado para sempre.
 */
const CLICK_LOCK_MS = 1600;

export type InputAct = 'ok' | 'cancel' | 'pass-turn' | 'resolve-all';

/** O botão `act` vale agora (antes da trava de clique e da escolha de ataque). */
export function inputActionAllowed(s: FState, act: InputAct) {
  return act === 'pass-turn' ? !(!s.input.priority || !s.input.ok.enabled || s.input.paying || s.input.targeting || s.activePlayer !== s.you || !!s.stack.length)
    : act === 'resolve-all' ? !(!s.input.priority || !s.input.ok.enabled || s.input.paying || s.input.targeting || s.stack.length < 2)
    : !!s.input[act].enabled;
}

export interface InputActionDeps extends Pick<TableCtx, 'client' | 'match' | 'announce' | 'render' | 'renderTable' | 'stopPresentation'> {
  attack: ReturnType<typeof createAttackChoice>;
  passMenu: ReturnType<typeof createPassMenu>;
}

export function createInputActions(d: InputActionDeps) {
  /** Quando foi o último clique num botão do pedido (a versão do pedido fica em `match.clickedGen`). */
  let clickedAt = 0;
  const locked = (gen: number) => gen === d.match().clickedGen && Date.now() - clickedAt < CLICK_LOCK_MS;
  const lock = (gen: number) => { d.match().clickedGen = gen; clickedAt = Date.now(); };

  function send(act: InputAct, gen: number) {
    const client = d.client(), s = client?.state, match = d.match(), { attack } = d;
    if (!client || !s || match.disconnected || gen !== s.input.gen || s.question) return;
    if (!inputActionAllowed(s, act)) return;
    if (locked(gen)) return;
    if (s.input.attacking) {
      if (attack.allGen !== null) {
        if (act === 'cancel') { attack.clear(); d.renderTable(); }
        return;
      }
      if (attack.queue.busy || (act === 'ok' && attack.selected.size)) return;
      if (act === 'cancel' && !s.combat.length) {
        const targets = legalAttackAllTargets(s, gen);
        attack.clear();
        if (!targets.length) { d.announce('Nenhuma criatura pode atacar um defensor permitido.'); return; }
        attack.allGen = gen;
        if (targets.length === 1) attack.choose(s, targets[0], gen);
        else { d.stopPresentation(); hideCardPreview(true); d.renderTable(); }
        return;
      }
    }
    if (s.input.attacking) attack.clear();
    lock(gen); match.selectedBlocker = null;
    d.stopPresentation(); hideCardPreview(true);
    client.send({ type: act, gen });
    d.render();
    setTimeout(() => { if (d.match().clickedGen === gen) d.render(); }, CLICK_LOCK_MS + 50);
  }

  /** Liga o atalho "Passar até o fim do turno" no turno de outro jogador (no seu, o botão Fim de turno faz o mesmo). */
  function startPassingTurn() {
    const client = d.client(), s = client?.state;
    if (!client || !s || d.match().disconnected || d.passMenu.shortcut(s) !== 'available') return;
    const gen = s.input.gen;
    if (locked(gen)) return;
    lock(gen);
    d.stopPresentation(); hideCardPreview(true);
    client.send({ type: 'pass-turn', gen });
    d.passMenu.set(false);
    d.render();
  }

  /** Pagar o mana fyrexiano com vida (o botão do custo desenhado para o pedido `gen`). */
  function payLife(gen: number) {
    const client = d.client(), s = client?.state;
    if (!client || !s || d.match().disconnected || gen !== s.input.gen || s.input.phyrexianLife === undefined) return;
    if (locked(gen)) return;
    lock(gen);
    d.stopPresentation(); client.send({ type: 'player', id: s.you, gen });
  }

  return { send, startPassingTurn, payLife, locked };
}
