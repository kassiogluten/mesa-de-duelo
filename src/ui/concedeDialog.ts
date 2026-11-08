// A confirmação do Conceder do menu da partida: conceder e continuar na mesa, conceder e sair, ou voltar ao jogo.
import type { FState } from '../forge/client';
import './concedeDialog.css';

type ConcedeChoice = 'stay' | 'leave' | null;

/** O que conceder significa nesta partida e para onde vai quem continua na mesa. */
function concedeText(s: Pick<FState, 'config' | 'players' | 'room'>) {
  if (s.config?.matchLength === 'bo3') return { title: 'Conceder este jogo?', text: 'O oponente vence este jogo da melhor de três.',
    stay: 'Continuando na mesa, você vai para a troca de cartas do próximo jogo (ou para o resultado, se a série acabar).' };
  if (s.players.length > 2) return { title: 'Conceder a partida?', text: 'Você sai do jogo, e os outros jogadores continuam.',
    stay: 'Continuando na mesa, você assiste ao resto do jogo.' };
  return { title: 'Conceder a partida?', text: 'O oponente vence a partida.',
    stay: `Continuando na mesa, você vai para o resultado, com ${s.room ? 'Pedir revanche' : 'Jogar de novo'}.` };
}

/** Pergunta se concede e se continua na mesa. "Voltar ao jogo" vem em foco: na dúvida, nada acontece. */
export function confirmConcede(s: Pick<FState, 'config' | 'players' | 'room'>): Promise<ConcedeChoice> {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const t = concedeText(s);
  const dlg = document.createElement('dialog');
  dlg.className = 'concede-dialog';
  dlg.setAttribute('aria-labelledby', 'cdTitle'); dlg.setAttribute('aria-describedby', 'cdText');
  dlg.innerHTML = `<h2 id="cdTitle">${t.title}</h2><p id="cdText">${t.text}</p><p class="concede-dialog-hint">${t.stay}</p>`
    + `<footer><button type="button" class="arena-btn secondary" data-cd="leave">Conceder e sair</button>`
    + `<button type="button" class="arena-btn secondary" data-cd="stay">Conceder e continuar na mesa</button>`
    + `<button type="button" class="arena-btn primary" data-cd="back">Voltar ao jogo</button></footer>`;
  document.body.append(dlg);
  return new Promise(resolve => {
    let answer: ConcedeChoice = null;
    dlg.addEventListener('click', e => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-cd]');
      if (btn) { const v = btn.dataset.cd; answer = v === 'stay' || v === 'leave' ? v : null; dlg.close(); }
      else if (e.target === dlg) dlg.close();
    });
    dlg.addEventListener('close', () => { dlg.remove(); if (!answer && opener?.isConnected) opener.focus({ preventScroll: true }); resolve(answer); });
    dlg.showModal();
    dlg.querySelector<HTMLElement>('[data-cd="back"]')?.focus();
  });
}
