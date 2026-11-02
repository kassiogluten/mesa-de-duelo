import { esc } from './cardtext';
import './shortcuts.css';

export interface Shortcut { keys: string[][]; what: string }

/** Atalhos da partida. Cada item de `keys` é uma alternativa; dentro dele, as teclas apertadas juntas. */
export const MATCH_SHORTCUTS: Shortcut[] = [
  { keys: [['Espaço']], what: 'Aperta o botão de passar da caixa de ação (OK, Resolver, Para o combate). Fim de turno fica só no clique.' },
  { keys: [['Esc']], what: 'Fecha o que estiver aberto: menu, janela, escolha de atacantes, tela de foco ou a carta ampliada.' },
  { keys: [['I']], what: 'Abre de perto a carta em foco.' },
  { keys: [['Enter'], ['Espaço']], what: 'Toca na carta, no jogador, na mana ou no marcador em foco.' },
  { keys: [['Tab'], ['Shift', 'Tab']], what: 'Vai para o próximo controle (ou o anterior). Com uma janela aberta, o foco fica dentro dela.' },
  { keys: [['←'], ['→']], what: 'Troca de oponente na tela de foco, percorre as cartas da pilha e muda a ordem dos gatilhos.' },
  { keys: [['Home'], ['End']], what: 'Vai para a primeira ou a última carta da pilha ou dos gatilhos.' },
  { keys: [['?']], what: 'Mostra esta lista.' },
];

/** Atalhos da mesa livre. */
export const FREE_SHORTCUTS: Shortcut[] = [
  { keys: [['C']], what: 'Compra uma carta.' },
  { keys: [['D']], what: 'Desvira todas as suas permanentes.' },
  { keys: [['Ctrl', 'Z']], what: 'Desfaz a última jogada.' },
  { keys: [['Enter'], ['Espaço']], what: 'Faz a ação principal da carta em foco.' },
  { keys: [['Shift', 'F10']], what: 'Abre o menu da carta em foco.' },
  { keys: [['Esc']], what: 'Fecha o menu da carta ou a janela aberta.' },
  { keys: [['?']], what: 'Mostra esta lista.' },
];

const keyHTML = (combo: string[]) => combo.map(k => `<kbd>${esc(k)}</kbd>`).join('<span class="kbd-plus">+</span>');

export function shortcutsHTML(list: Shortcut[]): string {
  return `<dl class="shortcut-list">${list.map(s => `<div class="shortcut-row"><dt>${s.keys.map(keyHTML).join('<span class="kbd-or">ou</span>')}</dt><dd>${esc(s.what)}</dd></div>`).join('')}</dl>`;
}

/** A tecla "?" (que pede Shift na maioria dos teclados), fora de campos de texto e sem outra janela aberta. */
export function isShortcutsKey(e: KeyboardEvent): boolean {
  if (e.key !== '?' || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return false;
  const t = e.target instanceof HTMLElement ? e.target : null;
  return !t?.closest('input, textarea, select, [contenteditable]') && !document.querySelector('dialog[open]');
}

/** Abre a lista de atalhos numa janela; Esc, o botão ou um toque fora fecham, e o foco volta para onde estava. */
export function openShortcuts(list: Shortcut[]): void {
  if (document.querySelector('dialog.shortcuts[open]')) return;
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dlg = document.createElement('dialog');
  dlg.className = 'shortcuts';
  dlg.setAttribute('aria-labelledby', 'kbTitle');
  dlg.innerHTML = `<h2 id="kbTitle">Atalhos de teclado</h2>${shortcutsHTML(list)}<footer><button type="button" class="arena-btn primary" data-kb="close">Fechar</button></footer>`;
  document.body.append(dlg);
  dlg.addEventListener('click', e => { if (e.target === dlg || (e.target as HTMLElement).closest('[data-kb="close"]')) dlg.close(); });
  dlg.addEventListener('close', () => { dlg.remove(); if (opener?.isConnected) opener.focus({ preventScroll: true }); });
  dlg.showModal();
  dlg.querySelector<HTMLElement>('[data-kb="close"]')?.focus();
}
