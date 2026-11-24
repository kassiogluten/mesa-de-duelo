// Painel Novidades da mesa do navegador (o CHANGELOG.md) e o que a página Novidades em imagens usa dele.
import { KEYS, load, save } from '../storage';
import { version as APP_VERSION } from '../../package.json';
import changelog from '../../CHANGELOG.md?raw';
import older from '../../docs/changelog-antigo.md?raw';
import visuals from '../novidades.json';
import { PENDING, PENDING_CHANGELOG, PENDING_CHANGELOG_PC, PENDING_VISUALS } from '../pendingNews';
import { esc } from './cardtext';

/** Um item da lista: o título em negrito do começo ("Relógio da partida") e o grupo em que está (Novo, Mudou...). */
export interface ReleaseItem { group: string; title: string; text: string }
export interface Release { version: string; date: string; html: string; items: ReleaseItem[] }
/** Imagens de cada item em src/novidades.json: versão → título do item → figuras (arquivo em public/novidades/). */
export interface Shot { img: string; legenda: string }
export const VISUALS: Record<string, Record<string, Shot[]>> = { ...(PENDING_CHANGELOG || PENDING_CHANGELOG_PC ? { [PENDING]: PENDING_VISUALS } : {}), ...visuals };
/** Os prints de um item (o mesmo título nas duas mesas mostra as mesmas imagens), ou nenhum. */
export const shotsOf = (version: string, title: string): Shot[] => VISUALS[version]?.[title] ?? [];
/** Algum item da versão tem prints (o link "ver em imagens"). */
export const hasShots = (r: Release) => r.items.some(i => shotsOf(r.version, i.title).length);
/** Endereço de um print: os publicados ficam em public/novidades/; os pendentes já vêm com o endereço completo. */
export const shotSrc = (img: string) => img.startsWith('/') || img.includes(':') ? img : `/novidades/${img}`;
/** "Versão 0.150.0", ou "Próxima versão" para as novidades que ainda não ganharam número. */
export const releaseTitle = (r: Release) => r.version === PENDING ? 'Próxima versão' : `Versão ${r.version}`;

/** Negrito e código, o pouco de Markdown inline que o CHANGELOG usa. */
export const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');

/** Lê as seções `## [X.Y.Z] - AAAA-MM-DD` de um CHANGELOG; o texto antes da primeira fica de fora. */
export function parse(md: string): Release[] {
  const out: Release[] = [];
  let cur: Release | null = null;
  let list = false;
  let group = '';
  const close = () => { if (cur && list) cur.html += '</ul>'; list = false; };
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    const head = /^## \[(.+?)\](?:\s*-\s*(\d{4})-(\d{2})-(\d{2}))?/.exec(line);
    if (head) {
      close();
      cur = { version: head[1]!, date: head[2] ? `${head[4]}/${head[3]}/${head[2]}` : '', html: '', items: [] };
      group = '';
      out.push(cur);
      continue;
    }
    if (!cur || !line) continue;
    if (line.startsWith('### ')) { close(); group = line.slice(4); cur.html += `<h4>${inline(line.slice(4))}</h4>`; continue; }
    if (line.startsWith('- ')) {
      if (!list) { cur.html += '<ul>'; list = true; }
      cur.html += `<li>${inline(line.slice(2))}</li>`;
      const item = /^\*\*(.+?)\.?\*\*\s*(.*)$/.exec(line.slice(2));
      if (item) cur.items.push({ group, title: item[1]!, text: item[2]! });
      continue;
    }
    close();
    cur.html += `<p>${inline(line)}</p>`;
  }
  close();
  return out;
}

/**
 * As novidades da mesa do navegador: as ainda sem número (só aparecem na branch da mudança), as versões recentes
 * (CHANGELOG.md) e, depois, as anteriores à 0.100.0 (docs/changelog-antigo.md). As da mesa no PC ficam no
 * CHANGELOG-PC.md, que só a página Novidades em imagens lê (e o /novidades.json da mesa no PC).
 */
export const RELEASES = [...parse(PENDING_CHANGELOG), ...parse(changelog), ...parse(older)];
/** A versão da mesa (a do package.json, que o publicar-versao acerta): uma versão só com novidades da mesa no PC também conta. */
export const VERSION: string = APP_VERSION;
/** A versão mais nova com novidade para o navegador: a do ponto de "não vista" no botão. */
export const NEWS_VERSION = RELEASES.find(r => r.version !== PENDING)?.version ?? '';

const SEEN_KEY = KEYS.novidades;
function seen() {
  return load(SEEN_KEY);
}
function markSeen() {
  save(SEEN_KEY, NEWS_VERSION);
}

/** Quantas versões o painel mostra de cada vez: as mais recentes primeiro, e o resto pelo botão no fim. */
const PAGE = 5;
/** X.Y de uma versão: 0.178.0 e 0.178.1 são da mesma. */
const minor = (version: string) => version.split('.').slice(0, 2).join('.');
/**
 * Onde termina a página que começa em `start`: PAGE versões, esticada enquanto a seguinte for do mesmo dia ou da
 * mesma versão X.Y que a última mostrada, para não cortar um dia (ou uma versão) ao meio.
 */
export function pageEnd(releases: readonly Pick<Release, 'version' | 'date'>[], start: number) {
  let end = Math.min(start + PAGE, releases.length);
  const together = (a: Pick<Release, 'version' | 'date'>, b: Pick<Release, 'version' | 'date'>) =>
    (!!a.date && a.date === b.date) || (a.version !== PENDING && minor(a.version) === minor(b.version));
  while (end > start && end < releases.length && together(releases[end - 1]!, releases[end]!)) end++;
  return end;
}
const releaseHTML = (r: Release) => `<section class="news-rel">
        <h3 tabindex="-1">${esc(releaseTitle(r))}${r.date ? ` <small>${r.date}</small>` : ''}${hasShots(r) ? ` <a class="news-visual" href="/novidades#v${esc(r.version)}">ver em imagens</a>` : ''}</h3>${r.html}
      </section>`;

/** Botão "Novidades" com a versão atual; abre um painel com o histórico. Um ponto marca versão ainda não vista. */
export function mountChangelog(host: HTMLElement) {
  const el = document.createElement('div');
  el.className = 'news';
  el.innerHTML = `
    <button class="news-btn news-icon" aria-expanded="false" aria-controls="newsPanel" aria-label="Novidades" title="Novidades">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10a6 6 0 0 1 12 0c0 4.5 1.5 6 2 6.5H4c.5-.5 2-2 2-6.5Z"/><path d="M10 19.5a2.2 2.2 0 0 0 4 0"/></svg><span class="news-dot" ${seen() === NEWS_VERSION ? 'hidden' : ''}></span><span class="news-sync" aria-hidden="true"></span>
    </button>
    <div class="news-panel" id="newsPanel" role="dialog" aria-label="Novidades" hidden>
      <a class="news-visual-all" href="/novidades">Ver as novidades em imagens</a>
      ${RELEASES.slice(0, pageEnd(RELEASES, 0)).map(releaseHTML).join('')}
      <button type="button" class="news-more" hidden></button>
    </div>`;
  host.append(el);

  const btn = el.querySelector<HTMLButtonElement>('.news-btn')!;
  const panel = el.querySelector<HTMLElement>('.news-panel')!;
  const more = el.querySelector<HTMLButtonElement>('.news-more')!;
  let shown = pageEnd(RELEASES, 0);
  const syncMore = () => {
    const left = RELEASES.length - shown;
    more.hidden = !left;
    more.textContent = `Mostrar versões anteriores (${left} ${left === 1 ? 'restante' : 'restantes'})`;
  };
  syncMore();
  more.addEventListener('click', () => {
    const next = RELEASES.slice(shown, pageEnd(RELEASES, shown));
    more.insertAdjacentHTML('beforebegin', next.map(releaseHTML).join(''));
    const sections = panel.querySelectorAll<HTMLElement>('.news-rel');
    // O foco vai para a primeira versão que apareceu, para continuar lendo dali.
    sections[shown]?.querySelector<HTMLElement>('h3')?.focus();
    shown += next.length;
    syncMore();
  });
  const toggle = (open: boolean) => {
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) { markSeen(); el.querySelector<HTMLElement>('.news-dot')!.hidden = true; }
  };
  btn.addEventListener('click', () => toggle(panel.hidden));
  document.addEventListener('click', e => { if (!panel.hidden && !el.contains(e.target as Node)) toggle(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { toggle(false); btn.focus(); } });
}
