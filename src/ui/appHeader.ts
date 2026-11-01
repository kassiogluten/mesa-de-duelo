import { mountChangelog } from './changelog';
import { installButton } from './pwa';
import { openFeedbackForm } from './feedbackForm';
import { latestMatch } from '../feedback';
import { mountContaMenu } from './contaMenu';
import { mountMaisMenu } from './maisMenu';
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
  root.innerHTML = `<a class="home-brand" href="#" aria-label="Mesa de Duelo — início" data-app-brand><span class="brand-mark" aria-hidden="true"></span><span>Mesa de Duelo</span></a><nav aria-label="Navegação principal"><button type="button" class="home-nav${options.active === 'play' ? ' active' : ''}" ${options.active === 'play' ? 'aria-current="page"' : ''} data-app-nav="play">Jogar</button><button type="button" class="home-nav${options.active === 'decks' ? ' active' : ''}" ${options.active === 'decks' ? 'aria-current="page"' : ''} data-app-nav="decks">Meus decks</button></nav><div class="home-news"></div><div data-app-tema></div><div data-app-conta></div>`;
  mountChangelog(root.querySelector('.home-news')!);
  root.querySelector('.home-news')!.prepend(installButton());
  // Both screens stay mounted: keep disclosure IDs unique for assistive technology.
  const panel = root.querySelector<HTMLElement>('.news-panel')!;
  // O botão de instalar também usa .news-btn: o que abre o painel é o de dentro de .news.
  const disclosure = root.querySelector<HTMLButtonElement>('.news > .news-btn')!;
  panel.id = `news-panel-${options.active}`;
  disclosure.setAttribute('aria-controls', panel.id);
  // O menu ⋯ (relatar e tema) e a conta ficam na ponta, depois de Novidades; no celular, ao lado das abas (CSS).
  mountMaisMenu(root.querySelector<HTMLElement>('[data-app-tema]')!, () => {
    panel.hidden = true; disclosure.setAttribute('aria-expanded', 'false');
    openFeedbackForm({ from: 'inicio', match: latestMatch });
  });
  mountContaMenu(root.querySelector<HTMLElement>('[data-app-conta]')!);
  root.addEventListener('click', async event => {
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
