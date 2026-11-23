// Página Ligar a mesa no PC (/vincular?codigo=…): o jogador entra com a conta do site e confirma o código da mesa no PC.
import './style.css';
import './ui/appHeader.css';
import './novidades.css';
import './vincular.css';
import { contaErro, contaFetch, contaSessao, contasLigadas, onContaChange } from './conta/session';
import { desenharBotao } from './conta/google';
import { mountContaMenu } from './ui/contaMenu';
import { iniciarTema } from './ui/temas';
import { codeFromQuery, linkHTML, type LinkState } from './vincular/view';

iniciarTema();

/**
 * A mesa no PC não entra com o Google sozinha: ela pede um código ao servidor (POST /api/conta/vincular/iniciar) e
 * abre esta página. Aqui o jogador entra com a conta do site, confere o código e confirma
 * (POST /api/conta/vincular/confirmar, com a sessão daqui); a mesa no PC, que pergunta a cada 2 s, recebe uma sessão
 * só dela. Ver AccountLinks no servidor.
 */
const code = codeFromQuery(location.search);

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="home-top shared-shell-header vis-top vc-top">
    <a class="home-brand" href="/" aria-label="Mesa de Duelo — início"><span class="brand-mark" aria-hidden="true"></span><span>Mesa de Duelo</span></a>
    <a class="vis-back" href="/">Ir para o jogo</a>
    <div data-app-conta></div>
  </header>
  <main class="vis vc-pagina">
    <h1>Mesa no PC</h1>
    <section class="vc-cartao" data-cartao aria-live="polite"></section>
  </main>`;
mountContaMenu(app.querySelector<HTMLElement>('[data-app-conta]')!);
const cartao = app.querySelector<HTMLElement>('[data-cartao]')!;

/** Depois de confirmar ou recusar, a página fica no fim, mesmo se a conta mudar. */
let final: LinkState | null = null;
let erro = '';
let enviando = false;

const nome = () => { const s = contaSessao(); return s?.conta.apelido || s?.conta.nome || 'sua conta'; };

function state(): LinkState {
  if (final) return final;
  if (!code) return { kind: 'sem-codigo' };
  if (!contasLigadas()) return { kind: 'desligadas' };
  if (!contaSessao()) return { kind: 'entrar', erro: contaErro() };
  return { kind: 'confirmar', nome: nome(), enviando, erro };
}

function render() {
  const s = state();
  cartao.innerHTML = linkHTML(s, code);
  const google = cartao.querySelector<HTMLElement>('[data-google]');
  if (google) void desenharBotao(google, false);
}

/** "Não fui eu": o código morre no servidor, e a mesa que pediu (de quem quer que seja) vê o código vencido. */
async function recusar() {
  final = { kind: 'recusado' };
  render();
  await contaFetch('vincular/recusar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo: code }),
  }).catch(() => {});
}

async function confirmar() {
  enviando = true; erro = ''; render();
  try {
    const response = await contaFetch('vincular/confirmar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo: code }),
    });
    if (response.ok) { final = { kind: 'pronto', nome: nome() }; return; }
    const body = await response.json().catch(() => null) as { error?: string } | null;
    // 401: a sessão deste navegador acabou e já foi apagada; a página volta a pedir o login.
    erro = response.status === 401 ? '' : body?.error ?? 'Não deu para ligar a mesa agora. Tente de novo.';
  } catch {
    erro = 'Sem conexão com o servidor. Tente de novo quando a internet voltar.';
  } finally {
    enviando = false;
    render();
  }
}

cartao.addEventListener('click', e => {
  const target = e.target as HTMLElement;
  if (target.closest('[data-confirmar]')) void confirmar();
  else if (target.closest('[data-recusar]')) void recusar();
});

onContaChange(() => { erro = ''; render(); });
render();
