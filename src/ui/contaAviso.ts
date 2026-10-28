import { contaSessao, contasLigadas } from '../conta/session';
import { desenharBotao } from '../conta/google';
import './contaMenu.css';

/**
 * Faixa em Meus decks para quem tem decks e ainda não entrou: os decks ficam só neste navegador. O × esconde a
 * faixa neste aparelho; entrar também a tira (a tela se redesenha quando a conta muda).
 */
const DISMISSED = 'mesa:conta:aviso-fechado';
const dismissed = () => { try { return localStorage.getItem(DISMISSED) === '1'; } catch { return false; } };

export function avisoContaHTML(hasDecks: boolean): string {
  if (!hasDecks || !contasLigadas() || contaSessao() || dismissed()) return '';
  return `<aside class="conta-faixa" aria-label="Guardar os decks na conta">`
    + `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/></svg>`
    + `<p><strong>Seus decks ficam só neste navegador.</strong> Entre com Google para tê-los em qualquer aparelho.</p>`
    + `<div class="conta-faixa-google" data-conta-faixa-google></div>`
    + `<button type="button" class="conta-faixa-fechar" data-conta-faixa-fechar aria-label="Esconder este aviso">×</button></aside>`;
}

/** Depois de pôr o HTML na página: desenha o botão do Google e liga o ×. */
export function montarAvisoConta(root: ParentNode) {
  const faixa = root.querySelector<HTMLElement>('.conta-faixa');
  if (!faixa) return;
  void desenharBotao(faixa.querySelector<HTMLElement>('[data-conta-faixa-google]')!, false);
  faixa.querySelector('[data-conta-faixa-fechar]')!.addEventListener('click', () => {
    try { localStorage.setItem(DISMISSED, '1'); } catch { /* some só agora */ }
    faixa.remove();
  });
}
