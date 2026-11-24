// A janela Compartilhar da tela do deck: criar o link público (/d/CÓDIGO), copiar e parar de compartilhar.
import { contaSessao, contasLigadas } from '../conta/session';
import { flush } from '../conta/sync';
import type { DeckData } from '../decks';
import { esc } from '../ui/cardtext';
import { myPublicDecks, publicLink, publishDeck, unpublishDeck } from './api';

/** Os códigos dos decks da conta, lidos uma vez por visita (e atualizados ao publicar ou parar). */
let codes: Promise<Map<string, string>> | null = null;
export function publicCodes(): Promise<Map<string, string>> {
  if (!contaSessao()) return Promise.resolve(new Map());
  return codes ??= myPublicDecks().catch(() => { codes = null; return new Map<string, string>(); });
}
/** Esquece os códigos (a conta mudou). */
export const forgetPublicCodes = () => { codes = null; };

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** Abre a janela; `onChange` avisa a tela quando o deck passa a ser público ou deixa de ser. */
export function openShare(deck: DeckData, onChange: (code: string | null) => void) {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dlg = document.createElement('dialog');
  dlg.className = 'dw-preview dv-share';
  dlg.setAttribute('aria-label', `Compartilhar ${deck.name}`);
  document.body.append(dlg);
  let code: string | null = null, busy = false, error = '', copied = false;

  function render() {
    const head = `<header><div><p class="dw-eyebrow">Compartilhar</p><h2>${esc(deck.name)}</h2></div><button type="button" class="dp-close" data-close aria-label="Fechar">×</button></header>`;
    let body: string;
    if (!contasLigadas()) body = '<p>Compartilhar decks precisa das contas, que estão desligadas neste site.</p>';
    else if (!contaSessao()) body = '<p>Entre com sua conta (no alto da tela, ao lado de Novidades) para criar um link deste deck. O link fica ligado à sua conta e acompanha as mudanças que você fizer no deck.</p>';
    else if (code) body = `<p>Qualquer pessoa com o link vê o deck, a análise e a mão de teste, e pode copiar para os decks dela. As mudanças que você fizer aparecem no link.</p><div class="dv-share-link"><input readonly value="${esc(publicLink(code))}" aria-label="Link do deck" data-link><button type="button" class="dw-button primary" data-copy-link>${copied ? 'Copiado' : 'Copiar link'}</button></div><div class="dw-actions"><button type="button" class="dw-button danger" data-stop ${busy ? 'disabled' : ''}>Parar de compartilhar</button></div>`;
    else body = `<p>Cria um link para mostrar este deck a outras pessoas: elas veem as cartas, a análise e a mão de teste, e podem copiar o deck. O link mostra o seu nome na mesa e acompanha as mudanças que você fizer.</p><div class="dw-actions"><button type="button" class="dw-button primary" data-publish ${busy ? 'disabled' : ''}>${busy ? 'Criando o link…' : 'Criar link'}</button></div>`;
    dlg.innerHTML = `${head}<div class="dv-share-body">${body}${error ? `<p class="dw-error" role="alert">${esc(error)}</p>` : ''}</div>`;
  }

  async function run(action: () => Promise<void>) {
    if (busy) return;
    busy = true; error = ''; render();
    try { await action(); } catch (e) { error = e instanceof Error ? e.message : String(e); }
    busy = false;
    if (dlg.open) render();
  }

  dlg.addEventListener('click', e => {
    const target = e.target as HTMLElement;
    if (target === dlg || target.closest('[data-close]')) { dlg.close(); return; }
    if (target.closest('[data-publish]')) void run(async () => {
      // O deck precisa estar na conta: manda o que ainda está só neste aparelho antes de publicar.
      await flush().catch(() => 0);
      code = await publishDeck(deck.id);
      codes = null; onChange(code);
      copied = await copyText(publicLink(code));
    });
    if (target.closest('[data-stop]')) void run(async () => { await unpublishDeck(deck.id); code = null; codes = null; onChange(null); });
    if (target.closest('[data-copy-link]') && code) void copyText(publicLink(code)).then(ok => {
      copied = ok;
      if (!ok) dlg.querySelector<HTMLInputElement>('[data-link]')?.select();
      render();
    });
  });
  dlg.addEventListener('close', () => { dlg.remove(); if (opener?.isConnected) opener.focus({ preventScroll: true }); });
  render();
  dlg.showModal();
  void publicCodes().then(map => { code = map.get(deck.id) ?? null; if (dlg.open) render(); });
}
