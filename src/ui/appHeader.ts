import { mountChangelog } from './changelog';
import { installButton } from './pwa';
import { openFeedbackForm } from './feedbackForm';
import { latestMatch } from '../feedback';
import { mountContaMenu } from './contaMenu';
import { mountTemaMenu } from './temas';
import './appHeader.css';

export interface AppHeaderOptions {
  active: 'play' | 'decks';
  onPlay(): void;
  onDecks(): void;
  /** Pergunta antes de sair da tela (por exemplo, da sala de espera); `false` fica onde está. */
  beforeNav?(to: 'play' | 'decks'): boolean | Promise<boolean>;
}

/** Shared navigation stays in the same place throughout setup and the deck library. */
export function mountAppHeader(root: HTMLElement, options: AppHeaderOptions) {
  let disabled = false;
  root.classList.add('home-top', 'shared-shell-header');
  root.innerHTML = `<a class="home-brand" href="#" aria-label="Mesa de Duelo — início" data-app-brand><span class="brand-mark" aria-hidden="true"></span><span>Mesa de Duelo</span></a><nav aria-label="Navegação principal"><button type="button" class="home-nav${options.active === 'play' ? ' active' : ''}" ${options.active === 'play' ? 'aria-current="page"' : ''} data-app-nav="play">Jogar</button><button type="button" class="home-nav${options.active === 'decks' ? ' active' : ''}" ${options.active === 'decks' ? 'aria-current="page"' : ''} data-app-nav="decks">Meus decks</button></nav><div class="home-news"><button type="button" class="news-btn feedback-btn" data-app-feedback aria-label="Enviar sugestão ou erro"><span class="feedback-long" aria-hidden="true">Enviar sugestão ou erro</span><span class="feedback-short" aria-hidden="true">Relatar</span></button></div><div data-app-tema></div><div data-app-conta></div>`;
  mountChangelog(root.querySelector('.home-news')!);
  root.querySelector('.home-news')!.prepend(installButton());
  // Tema e conta ficam na ponta, depois de Novidades; no celular, ao lado das abas (CSS).
  mountTemaMenu(root.querySelector<HTMLElement>('[data-app-tema]')!);
  mountContaMenu(root.querySelector<HTMLElement>('[data-app-conta]')!);
  // Both screens stay mounted: keep disclosure IDs unique for assistive technology.
  const panel = root.querySelector<HTMLElement>('.news-panel')!;
  // O botão de relatar também usa .news-btn: o que abre o painel é o de dentro de .news.
  const disclosure = root.querySelector<HTMLButtonElement>('.news > .news-btn')!;
  panel.id = `news-panel-${options.active}`;
  disclosure.setAttribute('aria-controls', panel.id);
  root.addEventListener('click', async event => {
    if ((event.target as HTMLElement).closest('[data-app-feedback]')) {
      panel.hidden = true; disclosure.setAttribute('aria-expanded', 'false');
      openFeedbackForm({ from: 'inicio', match: latestMatch });
      return;
    }
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-app-nav], [data-app-brand]');
    if (!target) return;
    event.preventDefault();
    if (disabled) return;
    panel.hidden = true; disclosure.setAttribute('aria-expanded', 'false');
    const to = target.dataset.appNav === 'decks' ? 'decks' : 'play';
    if (options.beforeNav && !await options.beforeNav(to)) return;
    if (to === 'decks') options.onDecks(); else options.onPlay();
  });
  return {
    setDisabled(value: boolean) {
      disabled = value;
      root.querySelectorAll<HTMLButtonElement>('[data-app-nav]').forEach(button => { button.disabled = value; });
      root.querySelector('[data-app-brand]')?.setAttribute('aria-disabled', String(value));
    },
  };
}
