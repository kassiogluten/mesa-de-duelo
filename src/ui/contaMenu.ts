import { apagarConta, contaErro, contaSessao, contasLigadas, onContaChange, sair } from '../conta/session';
import { desenharBotao, esquecerLoginAutomatico } from '../conta/google';
import { esc } from './cardtext';
import './contaMenu.css';

/**
 * A conta no cabeçalho: o botão do Google para quem não entrou; a foto, com um menu (Sair, Apagar minha conta),
 * para quem entrou. Cada tela tem o seu cabeçalho, e todos acompanham a mesma conta.
 */
export function mountContaMenu(slot: HTMLElement) {
  if (!contasLigadas()) { slot.hidden = true; return; }
  slot.classList.add('conta');
  let closeMenu = () => {};

  const render = () => {
    closeMenu();
    const s = contaSessao();
    if (!s) {
      const error = contaErro();
      slot.innerHTML = `<div class="conta-google" data-conta-google></div>${error ? `<p class="conta-erro" role="alert">${esc(error)}</p>` : ''}`;
      void desenharBotao(slot.querySelector<HTMLElement>('[data-conta-google]')!);
      return;
    }
    const nome = s.conta.apelido || s.conta.nome || 'Sua conta';
    const foto = s.conta.foto
      ? `<img src="${esc(s.conta.foto)}" alt="" referrerpolicy="no-referrer">`
      : `<span aria-hidden="true">${esc([...nome][0]?.toUpperCase() ?? '?')}</span>`;
    slot.innerHTML = `<button type="button" class="conta-foto" aria-haspopup="menu" aria-expanded="false" aria-label="Conta de ${esc(nome)}">${foto}</button>`
      + `<div class="conta-menu" role="menu" hidden><p class="conta-nome">Conectado como <strong>${esc(nome)}</strong></p>`
      + `<a role="menuitem" href="/privacidade.html#conta">Privacidade</a>`
      + `<button type="button" role="menuitem" data-conta="sair">Sair</button>`
      + `<button type="button" role="menuitem" class="conta-perigo" data-conta="apagar">Apagar minha conta</button></div>`;
    const button = slot.querySelector<HTMLButtonElement>('.conta-foto')!, menu = slot.querySelector<HTMLElement>('.conta-menu')!;
    const outside = (e: Event) => { if (!slot.contains(e.target as Node)) closeMenu(); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { closeMenu(); button.focus(); } };
    closeMenu = () => {
      menu.hidden = true; button.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape);
    };
    button.addEventListener('click', () => {
      if (!menu.hidden) { closeMenu(); return; }
      menu.hidden = false; button.setAttribute('aria-expanded', 'true');
      document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
      menu.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    });
    menu.addEventListener('click', e => {
      const action = (e.target as HTMLElement).closest<HTMLElement>('[data-conta]')?.dataset.conta;
      if (!action) return;
      closeMenu();
      if (action === 'sair') { esquecerLoginAutomatico(); void sair(); }
      else void confirmarApagar();
    });
  };

  render();
  onContaChange(render);
}

/** "Voltar" vem em foco: na dúvida, nada é apagado. */
async function confirmarApagar() {
  const dlg = document.createElement('dialog');
  dlg.className = 'conta-dialogo';
  dlg.setAttribute('aria-labelledby', 'contaApagarTitulo');
  dlg.innerHTML = `<h2 id="contaApagarTitulo">Apagar sua conta?</h2>`
    + `<p>O que a conta guarda no servidor é apagado de vez. Os decks deste navegador continuam aqui.</p>`
    + `<p class="conta-erro" role="alert" hidden></p>`
    + `<footer><button type="button" class="arena-btn secondary" data-apagar="sim">Apagar conta</button><button type="button" class="arena-btn primary" data-apagar="nao">Voltar</button></footer>`;
  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', async e => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-apagar]');
    if (e.target === dlg || btn?.dataset.apagar === 'nao') { dlg.close(); return; }
    if (!btn) return;
    btn.disabled = true;
    const error = await apagarConta();
    if (!error) { esquecerLoginAutomatico(); dlg.close(); return; }
    btn.disabled = false;
    const p = dlg.querySelector<HTMLElement>('.conta-erro')!;
    p.textContent = error; p.hidden = false;
  });
  dlg.showModal();
  dlg.querySelector<HTMLElement>('[data-apagar="nao"]')?.focus();
}
