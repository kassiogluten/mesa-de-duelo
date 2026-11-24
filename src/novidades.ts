// Página Novidades em imagens: os itens de cada mesa (abas Navegador e Mesa no PC) com os prints de src/novidades.json.
import './style.css';
import './ui/appHeader.css';
import './novidades.css';
import changelogPc from '../CHANGELOG-PC.md?raw';
import { PENDING_CHANGELOG_PC } from './pendingNews';
import { RELEASES, inline, pageEnd, parse, releaseTitle, shotSrc, shotsOf, type Release, type ReleaseItem, type Shot } from './ui/changelog';
import { esc } from './ui/cardtext';
import { iniciarTema } from './ui/temas';
import { justifyRows, ROWS } from './ui/justifiedRows';

iniciarTema();

/**
 * Novidades em imagens: os itens que têm figuras em src/novidades.json, com o print de como ficou na mesa, numa aba
 * para cada mesa: Navegador (CHANGELOG.md) e Mesa no PC (CHANGELOG-PC.md; o mesmo título nos dois mostra as mesmas
 * imagens nas duas abas). Linkada no painel Novidades de cada mesa; a da mesa no PC abre na aba dela (`?mesa=pc`), e cada
 * versão tem âncora #vX.Y.Z. Mostra as versões mais recentes e libera as anteriores de PAGE em PAGE (esticando para não
 * cortar um dia ou uma versão ao meio), em vez de um índice com um botão por versão.
 */
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const GROUP_CLASS: Record<string, string> = { Novo: 'new', Mudou: 'changed', Corrigido: 'fixed' };

type Table = 'navegador' | 'pc';
type VisualRelease = Omit<Release, 'items'> & { items: (ReleaseItem & { shots: Shot[] })[] };
/** Só as versões com algum item com prints, e só esses itens. */
const withShots = (list: Release[]): VisualRelease[] => list
  .map(r => ({ ...r, items: r.items.flatMap(i => { const shots = shotsOf(r.version, i.title); return shots.length ? [{ ...i, shots }] : []; }) }))
  .filter(r => r.items.length);
const TABLES: Record<Table, { label: string; lead: string; empty: string; releases: VisualRelease[] }> = {
  navegador: {
    label: 'Navegador', releases: withShots(RELEASES),
    lead: 'Como cada mudança aparece na mesa do navegador. O texto completo de cada versão continua no botão <b>Novidades</b> da tela inicial.',
    empty: 'Ainda não há imagens das novidades da mesa do navegador.',
  },
  pc: {
    label: 'Mesa no PC', releases: withShots([...parse(PENDING_CHANGELOG_PC), ...parse(changelogPc)]),
    lead: 'Como cada mudança aparece na mesa no PC. O texto completo de cada versão continua no botão <b>Novidades</b> da tela inicial da mesa no PC.',
    empty: 'Ainda não há imagens das novidades da mesa no PC.',
  },
};
/** A aba do endereço: `?mesa=pc` (ou `#pc`) é a da mesa no PC; o resto, a do navegador. */
const tableOfUrl = (): Table => new URLSearchParams(location.search).get('mesa') === 'pc' || location.hash === '#pc' ? 'pc' : 'navegador';
/** As âncoras de uma aba: a de cada versão e a de cada item. */
const anchorsOf = (table: Table) => new Set(TABLES[table].releases.flatMap(r => [`v${r.version}`, ...r.items.map(i => `v${r.version}-${slug(i.title)}`)]));

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="home-top shared-shell-header vis-top">
    <a class="home-brand" href="/" aria-label="Mesa de Duelo — início"><span class="brand-mark" aria-hidden="true"></span><span>Mesa de Duelo</span></a>
    <a class="vis-back" href="/">Voltar ao jogo</a>
  </header>
  <main class="vis">
    <h1>Novidades em imagens</h1>
    <div class="vis-tabs" role="tablist" aria-label="Mesa">
      ${(Object.keys(TABLES) as Table[]).map(t => `<button type="button" role="tab" class="vis-tab" id="vis-tab-${t}" aria-controls="vis-list" data-mesa="${t}">${esc(TABLES[t].label)}</button>`).join('')}
    </div>
    <p class="vis-lead"></p>
    <div class="vis-list" id="vis-list" role="tabpanel"></div>
    <button type="button" class="vis-more" hidden></button>
  </main>
  <dialog class="vis-lightbox" aria-label="Imagem ampliada"><img alt=""><p></p><button type="button" class="vis-close" aria-label="Fechar">×</button></dialog>`;
document.documentElement.style.setProperty('--vis-gap', `${ROWS.gap}px`);

const list = app.querySelector<HTMLElement>('.vis-list')!, lead = app.querySelector<HTMLElement>('.vis-lead')!;
const more = app.querySelector<HTMLButtonElement>('.vis-more')!;
let table: Table = tableOfUrl();
let releases: VisualRelease[] = [];
let sections: HTMLElement[] = [];
let shown = 0;
let observers: ResizeObserver[] = [];

/** Mostra as primeiras `count` versões; o botão diz quantas ainda faltam e some quando não falta nenhuma. */
function showUpTo(count: number) {
  shown = Math.min(Math.max(count, shown), sections.length);
  sections.forEach((section, i) => { section.hidden = i >= shown; });
  const left = sections.length - shown;
  more.hidden = !left;
  more.textContent = `Mostrar versões anteriores (${left} ${left === 1 ? 'restante' : 'restantes'})`;
}

/** Monta a aba `next`: as versões dela, com as primeiras à vista. */
function render(next: Table) {
  table = next;
  const { lead: leadHTML, empty } = TABLES[table];
  releases = TABLES[table].releases;
  for (const tab of app.querySelectorAll<HTMLButtonElement>('.vis-tab')) {
    const active = tab.dataset.mesa === table;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  list.setAttribute('aria-labelledby', `vis-tab-${table}`);
  lead.innerHTML = leadHTML;
  const firstPage = pageEnd(releases, 0);
  list.innerHTML = `${releases.length ? '' : `<p class="vis-empty">${esc(empty)}</p>`}
    ${releases.map((r, index) => `<section class="vis-rel" id="v${esc(r.version)}"${index < firstPage ? '' : ' hidden'}>
      <h2 tabindex="-1">${esc(releaseTitle(r))}${r.date ? ` <small>${r.date}</small>` : ''}</h2>
      ${r.items.map(i => `<article class="vis-item" id="v${esc(r.version)}-${slug(i.title)}">
        <div class="vis-text">
          <span class="vis-tag ${GROUP_CLASS[i.group] ?? ''}">${esc(i.group)}</span>
          <h3>${esc(i.title)}</h3>
          <p>${inline(i.text)}</p>
        </div>
        <div class="vis-shots">${i.shots.map(s => `<figure>
          <button type="button" class="vis-zoom" aria-label="Ampliar: ${esc(s.legenda)}"><img src="${esc(shotSrc(s.img))}" alt="${esc(s.legenda)}" loading="lazy"></button>
          <figcaption>${inline(s.legenda)}</figcaption>
        </figure>`).join('')}</div>
      </article>`).join('')}
    </section>`).join('')}`;
  layoutShots();
  sections = [...list.querySelectorAll<HTMLElement>('.vis-rel')];
  shown = 0;
  showUpTo(firstPage);
}

// Cada item arruma os prints em linhas justificadas (justifiedRows.ts): a proporção de cada um sai do arquivo ao
// carregar (até lá, 4:3), e a arrumação refaz quando a largura muda.
function layoutShots() {
  observers.forEach(o => o.disconnect());
  observers = [...list.querySelectorAll<HTMLElement>('.vis-shots')].map(box => {
    const figures = [...box.querySelectorAll<HTMLElement>('figure')];
    const imgs = figures.map(f => f.querySelector('img')!);
    const layout = () => {
      const width = box.clientWidth;
      if (!width) return;
      const placed = justifyRows(imgs.map(img => img.naturalWidth ? { ar: img.naturalWidth / img.naturalHeight, natural: img.naturalWidth } : { ar: 4 / 3, natural: Infinity }), width);
      figures.forEach((f, i) => { f.style.width = `${placed[i]!.w}px`; f.style.marginRight = `${placed[i]!.pad}px`; });
    };
    imgs.forEach(img => { if (!img.complete) img.addEventListener('load', layout, { once: true }); });
    const observer = new ResizeObserver(layout);
    observer.observe(box);
    return observer;
  });
}

render(table);
more.addEventListener('click', () => {
  const first = shown;
  showUpTo(pageEnd(releases, shown));
  // O foco vai para a primeira versão que apareceu, para quem navega pelo teclado continuar lendo dali.
  sections[first]?.querySelector<HTMLElement>('h2')?.focus();
});

/** O endereço da aba `next` (`?mesa=pc` na da mesa no PC), para o link copiado abrir nela. */
function syncUrl(next: Table, keepHash: boolean) {
  const url = new URL(location.href);
  if (next === 'pc') url.searchParams.set('mesa', 'pc'); else url.searchParams.delete('mesa');
  if (!keepHash) url.hash = '';
  history.replaceState(null, '', url);
}
/** Troca de aba pelo clique ou pelas setas. */
function switchTo(next: Table, focus = false) {
  if (next !== table) { syncUrl(next, false); render(next); }
  if (focus) app.querySelector<HTMLElement>(`#vis-tab-${next}`)?.focus();
}
const tabs = app.querySelector<HTMLElement>('.vis-tabs')!;
tabs.addEventListener('click', e => {
  const tab = (e.target as HTMLElement).closest<HTMLButtonElement>('.vis-tab');
  if (tab) switchTo(tab.dataset.mesa as Table);
});
tabs.addEventListener('keydown', e => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  switchTo(table === 'pc' ? 'navegador' : 'pc', true);
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
// A página é montada depois do carregamento: refaz o pulo para a âncora (#v0.44.0) que veio no link, mostrando antes
// as versões até a pedida, se ela for uma das anteriores. Uma âncora que só existe na outra aba (um link antigo da
// mesa no PC, sem o ?mesa=pc) troca de aba.
function jumpToHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  const other: Table = table === 'pc' ? 'navegador' : 'pc';
  if (!anchorsOf(table).has(id) && anchorsOf(other).has(id)) { syncUrl(other, true); render(other); }
  const target = document.getElementById(id);
  if (!target) return;
  const index = sections.findIndex(section => section.contains(target));
  if (index >= 0) showUpTo(index + 1);
  target.scrollIntoView();
}
jumpToHash();
addEventListener('hashchange', jumpToHash);
