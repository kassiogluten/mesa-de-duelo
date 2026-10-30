import './style.css';
import './ui/appHeader.css';
import './novidades.css';
import { RELEASES, VISUALS, inline } from './ui/changelog';
import { esc } from './ui/cardtext';
import { iniciarTema } from './ui/temas';

iniciarTema();

/**
 * Novidades em imagens: os itens do CHANGELOG.md que têm figuras em src/novidades.json, com o print de como ficou
 * na mesa. Linkada no painel Novidades; cada versão tem âncora #vX.Y.Z. Mostra as versões mais recentes e libera as
 * anteriores de PAGE em PAGE, em vez de um índice com um botão por versão.
 */
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const GROUP_CLASS: Record<string, string> = { Novo: 'new', Mudou: 'changed', Corrigido: 'fixed' };

const PAGE = 5;
const releases = RELEASES.map(r => ({ ...r, items: r.items.filter(i => VISUALS[r.version]?.[i.title]?.length) })).filter(r => r.items.length);

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="home-top shared-shell-header vis-top">
    <a class="home-brand" href="/" aria-label="Mesa de Duelo — início"><span class="brand-mark" aria-hidden="true"></span><span>Mesa de Duelo</span></a>
    <a class="vis-back" href="/">Voltar ao jogo</a>
  </header>
  <main class="vis">
    <h1>Novidades em imagens</h1>
    <p class="vis-lead">Como cada mudança aparece na mesa. O texto completo de cada versão continua no botão <b>Novidades</b> da tela inicial.</p>
    ${releases.length ? '' : '<p class="vis-empty">Ainda não há imagens das novidades.</p>'}
    ${releases.map((r, index) => `<section class="vis-rel" id="v${esc(r.version)}"${index < PAGE ? '' : ' hidden'}>
      <h2 tabindex="-1">Versão ${esc(r.version)}${r.date ? ` <small>${r.date}</small>` : ''}</h2>
      ${r.items.map(i => `<article class="vis-item" id="v${esc(r.version)}-${slug(i.title)}">
        <div class="vis-text">
          <span class="vis-tag ${GROUP_CLASS[i.group] ?? ''}">${esc(i.group)}</span>
          <h3>${esc(i.title)}</h3>
          <p>${inline(i.text)}</p>
        </div>
        <div class="vis-shots">${VISUALS[r.version][i.title].map(s => `<figure>
          <button type="button" class="vis-zoom" aria-label="Ampliar: ${esc(s.legenda)}"><img src="/novidades/${esc(s.img)}" alt="${esc(s.legenda)}" loading="lazy"></button>
          <figcaption>${inline(s.legenda)}</figcaption>
        </figure>`).join('')}</div>
      </article>`).join('')}
    </section>`).join('')}
    <button type="button" class="vis-more" hidden></button>
  </main>
  <dialog class="vis-lightbox" aria-label="Imagem ampliada"><img alt=""><p></p><button type="button" class="vis-close" aria-label="Fechar">×</button></dialog>`;

// Os prints são tirados em 2x: mostra cada um no tamanho real da mesa (metade da largura do arquivo), nunca esticado.
for (const img of app.querySelectorAll<HTMLImageElement>('.vis-zoom img')) {
  const fit = () => { img.style.width = `${img.naturalWidth / 2}px`; };
  if (img.complete && img.naturalWidth) fit(); else img.addEventListener('load', fit, { once: true });
}

const sections = [...app.querySelectorAll<HTMLElement>('.vis-rel')], more = app.querySelector<HTMLButtonElement>('.vis-more')!;
let shown = Math.min(PAGE, sections.length);
/** Mostra as primeiras `count` versões; o botão diz quantas ainda faltam e some quando não falta nenhuma. */
function showUpTo(count: number) {
  shown = Math.min(Math.max(count, shown), sections.length);
  sections.forEach((section, i) => { section.hidden = i >= shown; });
  const left = sections.length - shown;
  more.hidden = !left;
  more.textContent = `Mostrar versões anteriores (${left} ${left === 1 ? 'restante' : 'restantes'})`;
}
showUpTo(shown);
more.addEventListener('click', () => {
  const first = shown;
  showUpTo(shown + PAGE);
  // O foco vai para a primeira versão que apareceu, para quem navega pelo teclado continuar lendo dali.
  sections[first]?.querySelector<HTMLElement>('h2')?.focus();
});

const box = app.querySelector<HTMLDialogElement>('.vis-lightbox')!;
app.addEventListener('click', e => {
  const zoom = (e.target as HTMLElement).closest('.vis-zoom');
  if (zoom) {
    const img = zoom.querySelector('img')!;
    box.querySelector('img')!.src = img.src;
    box.querySelector('img')!.alt = img.alt;
    box.querySelector('p')!.innerHTML = zoom.parentElement!.querySelector('figcaption')!.innerHTML;
    box.showModal();
    return;
  }
  // Fechar pelo × ou tocando fora da imagem.
  if (e.target === box || (e.target as HTMLElement).closest('.vis-close')) box.close();
});
// A página é montada depois do carregamento: refaz o pulo para a âncora (#v0.44.0) que veio no link,
// mostrando antes as versões até a pedida, se ela for uma das anteriores.
function jumpToHash() {
  const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (!target) return;
  const index = sections.findIndex(section => section.contains(target));
  if (index >= 0) showUpTo(index + 1);
  target.scrollIntoView();
}
jumpToHash();
addEventListener('hashchange', jumpToHash);
