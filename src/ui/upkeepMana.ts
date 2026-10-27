import type { FState } from '../forge/client';
import { esc } from './cardtext';

type UpkeepState = Pick<FState, 'phase' | 'turn' | 'activePlayer' | 'you' | 'matchId' | 'session' | 'stack' | 'question' | 'input'>;

/**
 * Na sua manutenção, virar algo que só gera mana costuma ser engano de quem acha que já está na fase principal:
 * a mana some ao passar para ela. Devolve a chave da manutenção que pede confirmação, ou '' quando não pede.
 */
export function upkeepManaKey(s: UpkeepState, id: number): string {
  if (s.phase !== 'UPKEEP' || s.activePlayer !== s.you || s.question || s.stack.length) return '';
  if (!s.input.priority || s.input.paying || s.input.targeting || s.input.selection) return '';
  if (!s.input.manaOnly?.includes(id)) return '';
  return `${s.matchId ?? s.session?.code ?? ''}:${s.turn}`;
}

/** Pergunta se o jogador quer mesmo gerar a mana agora. "Voltar" vem em foco: na dúvida, nada acontece. */
export function confirmUpkeepMana(cardName: string): Promise<boolean> {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dlg = document.createElement('dialog');
  dlg.className = 'upkeep-mana';
  dlg.setAttribute('aria-labelledby', 'umTitle'); dlg.setAttribute('aria-describedby', 'umText');
  dlg.innerHTML = `<h2 id="umTitle">Você ainda está na manutenção</h2>`
    + `<p id="umText">A fase principal ainda não começou. Se virar <strong>${esc(cardName)}</strong> agora, a mana fica na reserva só até o fim da manutenção e <strong>some quando o jogo passar para a fase principal</strong>.</p>`
    + `<p class="upkeep-mana-hint">Para baixar terrenos e conjurar mágicas, passe primeiro para a fase principal e vire os terrenos lá.</p>`
    + `<footer><button type="button" class="arena-btn secondary" data-um="yes">Gerar mana mesmo assim</button><button type="button" class="arena-btn primary" data-um="no">Voltar</button></footer>`;
  document.body.append(dlg);
  return new Promise(resolve => {
    let answer = false;
    dlg.addEventListener('click', e => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-um]');
      if (btn) { answer = btn.dataset.um === 'yes'; dlg.close(); }
      else if (e.target === dlg) dlg.close();
    });
    dlg.addEventListener('close', () => { dlg.remove(); if (opener?.isConnected) opener.focus({ preventScroll: true }); resolve(answer); });
    dlg.showModal();
    dlg.querySelector<HTMLElement>('[data-um="no"]')?.focus();
  });
}
