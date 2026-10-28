import { apagarConta, contaErro, contaSessao, contasLigadas, onContaChange, sair } from '../conta/session';
import { desenharBotao, esquecerLoginAutomatico } from '../conta/google';
import { clearSyncNotice, flush, forgetAccount, onSyncChange, restore, startSync, syncNotice, syncStatus, trash, type FirstLoginAnswer } from '../conta/sync';
import { ACCOUNT_BACKUP_PREFIX, exportDeckRecovery } from '../decks';
import { NAME_KEY } from '../conta/prefs';
import { esc } from './cardtext';

/** Há cópia dos decks de antes de "Usar só os da conta"? */
const hasBackup = () => { try { return Object.keys(localStorage).some(k => k.startsWith(ACCOUNT_BACKUP_PREFIX)); } catch { return false; } };
import './contaMenu.css';

/** Uma linha sobre a sincronia, no menu da conta. */
function syncLine(): string {
  const s = syncStatus();
  return s.kind === 'ok' ? 'Decks e preferências sincronizados'
    : s.kind === 'enviando' ? 'Sincronizando os decks…'
    : s.kind === 'offline' ? (s.pendentes ? `Sem conexão: ${s.pendentes} ${s.pendentes === 1 ? 'alteração esperando' : 'alterações esperando'}` : 'Sem conexão')
    : s.kind === 'erro' ? `Não deu para sincronizar: ${s.text}` : '';
}

/**
 * A conta no cabeçalho: o botão do Google para quem não entrou; a foto, com um menu (sincronia, Lixeira,
 * Privacidade, Sair, Apagar minha conta), para quem entrou. Cada tela tem o seu cabeçalho, e todos acompanham a
 * mesma conta.
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
    // O nome na mesa é o apelido da conta: ele sincroniza junto com as preferências.
    let mesa = '';
    try { mesa = localStorage.getItem(NAME_KEY)?.trim() ?? ''; } catch { /* sem armazenamento */ }
    const nome = mesa || s.conta.apelido || s.conta.nome || 'Sua conta';
    const foto = s.conta.foto
      ? `<img src="${esc(s.conta.foto)}" alt="" referrerpolicy="no-referrer">`
      : `<span aria-hidden="true">${esc([...nome][0]?.toUpperCase() ?? '?')}</span>`;
    slot.innerHTML = `<button type="button" class="conta-foto" aria-haspopup="menu" aria-expanded="false" aria-label="Conta de ${esc(nome)}">${foto}</button>`
      + `<div class="conta-menu" role="menu" hidden><p class="conta-nome">Conectado como <strong>${esc(nome)}</strong><span class="conta-sync s-${syncStatus().kind}" aria-live="polite">${esc(syncLine())}</span></p>`
      + (syncNotice() ? `<p class="conta-aviso" role="alert">${esc(syncNotice())}</p>` : '')
      + `<button type="button" role="menuitem" data-conta="lixeira">Lixeira</button>`
      + (hasBackup() ? `<button type="button" role="menuitem" data-conta="copia">Baixar decks de antes da conta</button>` : '')
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
    // A foto avisa quando há algo a ver (deck recusado, falha) sem abrir o menu.
    button.classList.toggle('alerta', !!syncNotice() || syncStatus().kind === 'erro');
    button.addEventListener('click', () => {
      if (!menu.hidden) { closeMenu(); clearSyncNotice(); return; }
      menu.hidden = false; button.setAttribute('aria-expanded', 'true');
      document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
      menu.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    });
    menu.addEventListener('click', e => {
      const action = (e.target as HTMLElement).closest<HTMLElement>('[data-conta]')?.dataset.conta;
      if (!action) return;
      closeMenu();
      if (action === 'sair') void perguntarSair();
      else if (action === 'lixeira') void abrirLixeira();
      else if (action === 'copia') baixarCopia();
      else void confirmarApagar();
    });
  };

  render();
  onContaChange(render);
  addEventListener('mesa:prefs-sincronizadas', render);
  // Só atualiza a linha da sincronia, sem fechar o menu aberto.
  onSyncChange(() => {
    const line = slot.querySelector<HTMLElement>('.conta-sync');
    if (!line) return;
    line.textContent = syncLine(); line.className = `conta-sync s-${syncStatus().kind}`;
    slot.querySelector('.conta-foto')?.classList.toggle('alerta', !!syncNotice() || syncStatus().kind === 'erro');
  });
}

let syncStarted = false;
/** Liga a sincronia dos decks uma vez, com as perguntas desta tela. */
export function iniciarSincronia() {
  if (syncStarted) return;
  syncStarted = true;
  startSync(perguntarPrimeiroLogin, async () => { esquecerLoginAutomatico(); await sair(); });
}

interface Opcao { value: string; label: string; primary?: boolean }

/** Pergunta em janela; Esc ou tocar fora devolve {@code cancel}. A opção principal vem em foco. */
function perguntar(titulo: string, html: string, opcoes: Opcao[], cancel: string): Promise<string> {
  const dlg = document.createElement('dialog');
  dlg.className = 'conta-dialogo';
  dlg.setAttribute('aria-labelledby', 'contaPerguntaTitulo');
  dlg.innerHTML = `<h2 id="contaPerguntaTitulo">${esc(titulo)}</h2>${html}`
    + `<footer>${opcoes.map(o => `<button type="button" class="arena-btn ${o.primary ? 'primary' : 'secondary'}" data-opcao="${esc(o.value)}">${esc(o.label)}</button>`).join('')}</footer>`;
  document.body.append(dlg);
  return new Promise(resolve => {
    let answer = cancel;
    dlg.addEventListener('click', e => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-opcao]');
      if (btn) { answer = btn.dataset.opcao!; dlg.close(); }
      else if (e.target === dlg) dlg.close();
    });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(answer); });
    dlg.showModal();
    dlg.querySelector<HTMLElement>('.arena-btn.primary')?.focus();
  });
}

/** Primeiro login num navegador com decks que a conta não tem. */
async function perguntarPrimeiroLogin(decks: number): Promise<FirstLoginAnswer> {
  const n = decks === 1 ? '1 deck que não está' : `${decks} decks que não estão`;
  return await perguntar(`Este navegador tem ${n} na sua conta`,
    `<p><strong>Juntar à conta</strong>: ${decks === 1 ? 'ele passa' : 'eles passam'} a ficar na conta e aparece${decks === 1 ? '' : 'm'} nos seus outros aparelhos. Se um deck estiver diferente aqui e na conta, ficam os dois.</p>`
    + `<p><strong>Usar só os da conta</strong>: ${decks === 1 ? 'ele sai' : 'eles saem'} de Meus decks, mas ficam guardados neste navegador numa cópia de segurança.</p>`
    + `<p class="conta-dica">Fechar sem escolher não entra na conta.</p>`,
    [{ value: 'conta', label: 'Usar só os da conta' }, { value: 'juntar', label: 'Juntar à conta', primary: true }], 'cancelar') as FirstLoginAnswer;
}

/** Sair da conta: os decks ficam aqui ou saem daqui. Antes de tirar, tenta enviar o que falta. */
async function perguntarSair() {
  const answer = await perguntar('Sair da conta',
    '<p>Os decks continuam guardados na conta. E neste navegador?</p>',
    [{ value: 'tirar', label: 'Tirar deste navegador' }, { value: 'manter', label: 'Manter os decks aqui', primary: true }], '');
  if (!answer) return;
  if (answer === 'tirar') {
    const left = await flush();
    if (left && await perguntar('Alterações ainda não enviadas',
      `<p>${left === 1 ? '1 alteração ainda não chegou' : `${left} alterações ainda não chegaram`} à conta, provavelmente por falta de conexão. Se tirar os decks agora, ${left === 1 ? 'ela se perde' : 'elas se perdem'}.</p>`,
      [{ value: 'tirar', label: 'Tirar mesmo assim' }, { value: '', label: 'Voltar', primary: true }], '') !== 'tirar') return;
  }
  forgetAccount(answer === 'tirar');
  esquecerLoginAutomatico();
  await sair();
}

/** A mesma exportação de recuperação de Meus decks, que inclui as cópias de antes da conta. */
function baixarCopia() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([exportDeckRecovery()], { type: 'application/json' }));
  a.download = 'decks-antes-da-conta.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Os decks apagados nos últimos 30 dias, com Restaurar. */
async function abrirLixeira() {
  const dlg = document.createElement('dialog');
  dlg.className = 'conta-dialogo conta-lixeira';
  dlg.setAttribute('aria-labelledby', 'contaLixeiraTitulo');
  dlg.innerHTML = `<h2 id="contaLixeiraTitulo">Lixeira</h2><p class="conta-dica">Decks apagados nos últimos 30 dias. Depois disso, eles somem de vez.</p><div data-lixeira><p>Carregando…</p></div>`
    + `<footer><button type="button" class="arena-btn primary" data-fechar>Fechar</button></footer>`;
  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  const list = dlg.querySelector<HTMLElement>('[data-lixeira]')!;
  const load = async () => {
    try {
      const decks = await trash();
      list.innerHTML = decks.length
        ? `<ul>${decks.map(d => `<li><span><strong>${esc(d.deck.name)}</strong><small>apagado em ${new Date(d.apagadoEm).toLocaleDateString('pt-BR')}</small></span><button type="button" class="arena-btn secondary" data-restaurar="${esc(d.id)}">Restaurar</button></li>`).join('')}</ul>`
        : '<p>A lixeira está vazia.</p>';
    } catch (e) { list.innerHTML = `<p class="conta-erro" role="alert">${esc(e instanceof Error ? e.message : 'Não deu para abrir a lixeira.')}</p>`; }
  };
  dlg.addEventListener('click', async e => {
    const target = e.target as HTMLElement;
    if (e.target === dlg || target.closest('[data-fechar]')) { dlg.close(); return; }
    const btn = target.closest<HTMLButtonElement>('[data-restaurar]');
    if (!btn) return;
    btn.disabled = true; btn.textContent = 'Restaurando…';
    try { await restore(btn.dataset.restaurar!); btn.closest('li')!.innerHTML = `<span><strong>${esc(btn.closest('li')!.querySelector('strong')!.textContent ?? '')}</strong><small>de volta a Meus decks</small></span>`; }
    catch (err) { btn.disabled = false; btn.textContent = 'Restaurar'; list.insertAdjacentHTML('afterbegin', `<p class="conta-erro" role="alert">${esc(err instanceof Error ? err.message : 'Não deu para restaurar.')}</p>`); }
  });
  dlg.showModal();
  dlg.querySelector<HTMLElement>('[data-fechar]')?.focus();
  await load();
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
    if (!error) { forgetAccount(false); esquecerLoginAutomatico(); dlg.close(); return; }
    btn.disabled = false;
    const p = dlg.querySelector<HTMLElement>('.conta-erro')!;
    p.textContent = error; p.hidden = false;
  });
  dlg.showModal();
  dlg.querySelector<HTMLElement>('[data-apagar="nao"]')?.focus();
}
