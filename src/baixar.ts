// Página Mesa no PC (/baixar): o botão de baixar a mesa para Windows (zip) ou Linux (.tar.gz), os passos e o que precisa.
import './style.css';
import './ui/appHeader.css';
import './novidades.css';
import './baixar.css';
import { finder } from './ui/dom';
import { iniciarTema } from './ui/temas';
import { pcPlatform } from './baixar/platform';
import { guideHTML } from './baixar/guide';
import { downloadCardHTML, downloadFromManifest, MANIFEST_URL, type ManifestState } from './baixar/view';

iniciarTema();

const platform = pcPlatform();
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="home-top shared-shell-header vis-top bx-top">
    <a class="home-brand" href="/" aria-label="Mesa de Duelo — início"><span class="brand-mark" aria-hidden="true"></span><span>Mesa de Duelo</span></a>
    <a class="vis-back" href="/">Jogar no navegador</a>
  </header>
  <main class="vis bx-pagina">
    <section class="bx-hero" aria-labelledby="bx-titulo">
      <h1 id="bx-titulo">Mesa no PC</h1>
      <p class="vis-lead">A Mesa de Duelo como aplicativo para Windows e Linux: as mesmas partidas, a mesma conta e os mesmos decks, jogando com quem está no navegador, com efeitos feitos para o PC.</p>
      <div class="bx-cartao" data-cartao aria-live="polite"></div>
    </section>
    ${guideHTML(platform)}
  </main>`;
const $ = finder(app);
const cartao = $('[data-cartao]');

const render = (state: ManifestState) => { cartao.innerHTML = downloadCardHTML(state, platform); };

/** O manifesto é o mesmo que o atualizador da mesa no PC consulta: a versão e o tamanho de cada download saem dele. */
async function loadManifest() {
  render({ kind: 'carregando' });
  try {
    const response = await fetch(MANIFEST_URL, { cache: 'no-cache' });
    if (!response.ok) throw new Error(String(response.status));
    render({ kind: 'pronto', download: downloadFromManifest(await response.json()) });
  } catch {
    render({ kind: 'falhou' });
  }
}

void loadManifest();
