// Endereço de cada tela do app (início, Meus decks, mesa livre, Laboratório, partida) pelo histórico do navegador: o voltar fecha o painel aberto e volta de tela.

/**
 * As telas do index.html com endereço próprio. Todas dividem a mesma página (a conexão com o servidor, as cartas já
 * carregadas e os sons), então trocar de tela não recarrega nada: só o endereço muda, pelo histórico.
 */
export type Route =
  | { screen: 'lobby' }
  | { screen: 'decks'; view: 'library' | 'import' }
  | { screen: 'decks'; view: 'edit'; deckId: string }
  | { screen: 'free' }
  | { screen: 'lab' }
  | { screen: 'game' };

const IMPORT = 'importar';

export function parseRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/decks') return { screen: 'decks', view: 'library' };
  if (path === `/decks/${IMPORT}`) return { screen: 'decks', view: 'import' };
  const deck = /^\/decks\/([^/]+)$/.exec(path);
  if (deck) { try { return { screen: 'decks', view: 'edit', deckId: decodeURIComponent(deck[1]!) }; } catch { return { screen: 'decks', view: 'library' }; } }
  if (path === '/mesa-livre') return { screen: 'free' };
  if (path === '/laboratorio') return { screen: 'lab' };
  if (path === '/partida') return { screen: 'game' };
  // '/', '/index.html' e endereços que não existem: a tela inicial.
  return { screen: 'lobby' };
}

export function routePath(route: Route): string {
  switch (route.screen) {
    case 'lobby': return '/';
    case 'decks': return route.view === 'edit' ? `/decks/${encodeURIComponent(route.deckId)}` : route.view === 'import' ? `/decks/${IMPORT}` : '/decks';
    case 'free': return '/mesa-livre';
    case 'lab': return '/laboratorio';
    case 'game': return '/partida';
  }
}

/**
 * O que fica em cada entrada do histórico: os endereços das telas desde o início até esta (para voltar com o próprio
 * histórico em vez de empilhar a mesma tela de novo) e se a entrada é de um painel aberto por cima da tela.
 */
interface Entry { mesa: 1; stack: string[]; overlay?: true }
const isEntry = (v: unknown): v is Entry => !!v && (v as Entry).mesa === 1 && Array.isArray((v as Entry).stack) && (v as Entry).stack.length > 0;

const parent = (path: string) => path.slice(0, path.lastIndexOf('/')) || '/';
/** Ir de `from` para `to` é subir (do editor de um deck para a lista, de qualquer tela para o início) ou trocar entre irmãs (um deck por outro). */
const replaces = (to: string, from: string) => to === '/' || from.startsWith(`${to}/`) || (parent(to) === parent(from) && parent(to) !== '/');

type RouterWindow = Pick<Window, 'history' | 'location' | 'addEventListener'>;

interface RouterDeps {
  /** O endereço da tela à vista agora. */
  current(): string;
  /** Há painel ou janela aberta por cima da tela (Opções, Novidades, Meus relatos, a janela de zona…). */
  overlayOpen(): boolean;
  /** Fecha o painel ou a janela de cima. */
  closeOverlay(): void;
  /** Dá para sair da tela sem perguntar (fora da partida e da mesa livre com cartas na mesa). */
  canLeave(): boolean;
  /** Pergunta antes de sair (a partida, a mesa livre); quem sai muda de tela sozinho. */
  requestLeave(): void;
  /** O voltar (ou o avançar) levou a outro endereço: abre a tela dele. */
  navigate(route: Route): void;
  win?: RouterWindow;
  /** Espera entre a ação do jogador e a conferência dos painéis (o clique termina de abrir ou fechar antes). */
  later?(fn: () => void): void;
}

export function createRouter(deps: RouterDeps) {
  const win = deps.win ?? window;
  const h = win.history, loc = win.location;
  const later = deps.later ?? (fn => setTimeout(fn, 0));
  /** Uma volta no histórico pedida por aqui: o popstate dela é nosso, e o que vier depois espera por ele. */
  let busy = false, busyTimer: ReturnType<typeof setTimeout> | undefined;
  const queue: (() => void)[] = [];
  let started = false;

  const state = (): Entry | null => isEntry(h.state) ? h.state : null;
  const stack = () => state()?.stack ?? [loc.pathname];
  const url = (path: string) => path + loc.search;
  function traverse(delta: number) {
    busy = true;
    // Se o popstate não vier (histórico mais curto do que o esperado), a fila não fica parada.
    busyTimer = setTimeout(settle, 1500);
    h.go(delta);
  }
  function settle() {
    busy = false; clearTimeout(busyTimer);
    while (queue.length && !busy) queue.shift()!();
  }
  function run(op: () => void) { if (busy) queue.push(op); else op(); }

  /** Põe no endereço a tela à vista. */
  function sync(path: string) {
    const op = () => {
      const st = state();
      // Painel aberto numa entrada própria: sai dela antes de mudar de tela.
      if (st?.overlay) { queue.unshift(op); traverse(-1); return; }
      const now = stack(), here = now[now.length - 1]!;
      if (here === path) { if (loc.pathname !== path) h.replaceState({ mesa: 1, stack: now } satisfies Entry, '', url(path)); return; }
      // A tela já está atrás no histórico: volta até ela, sem empilhar outra cópia.
      const behind = now.lastIndexOf(path);
      if (behind >= 0 && behind < now.length - 1) { traverse(behind - (now.length - 1)); return; }
      if (replaces(path, here)) h.replaceState({ mesa: 1, stack: [...now.slice(0, -1), path] } satisfies Entry, '', url(path));
      else h.pushState({ mesa: 1, stack: [...now, path] } satisfies Entry, '', url(path));
    };
    if (started) run(op);
  }

  /** Painel aberto ganha uma entrada no histórico (o voltar o fecha); fechado por outro jeito, a entrada sai. */
  function checkOverlay() {
    if (!started) return;
    run(() => {
      const open = deps.overlayOpen(), st = state();
      if (open && !st?.overlay) h.pushState({ mesa: 1, stack: stack(), overlay: true } satisfies Entry, '', loc.href);
      else if (!open && st?.overlay) traverse(-1);
    });
  }

  /** Desfaz a volta: a tela à vista continua no endereço. */
  function restore() {
    const path = deps.current();
    h.pushState({ mesa: 1, stack: [...stack(), path] } satisfies Entry, '', url(path));
  }

  function onPopState() {
    if (busy) { settle(); return; }
    const st = state();
    if (deps.overlayOpen() && !st?.overlay) {
      deps.closeOverlay();
      if (loc.pathname !== deps.current()) restore();
      later(checkOverlay);
      return;
    }
    // Avançou para a entrada de um painel que já fechou.
    if (st?.overlay) h.replaceState({ mesa: 1, stack: st.stack } satisfies Entry, '', loc.href);
    const route = parseRoute(loc.pathname);
    if (routePath(route) === deps.current()) {
      if (loc.pathname !== deps.current()) h.replaceState({ mesa: 1, stack: [...stack().slice(0, -1), deps.current()] } satisfies Entry, '', url(deps.current()));
      return;
    }
    if (!deps.canLeave()) { restore(); deps.requestLeave(); later(checkOverlay); return; }
    deps.navigate(route);
    later(checkOverlay);
  }

  return {
    /**
     * Ao abrir a página. Quem chega de fora (link, favorito, recarregar a primeira vez) ganha o início atrás da tela,
     * para o voltar do celular voltar ao início em vez de sair do site. Recarregando, o histórico guardado continua valendo.
     */
    start() {
      if (started) return;
      const path = routePath(parseRoute(loc.pathname));
      const st = state();
      // Recarregou: o histórico já é nosso (numa entrada de painel, o painel já não está aberto).
      if (st && st.stack[st.stack.length - 1] === path) h.replaceState({ mesa: 1, stack: st.stack } satisfies Entry, '', url(path));
      else if (path === '/') h.replaceState({ mesa: 1, stack: ['/'] } satisfies Entry, '', url('/'));
      else {
        h.replaceState({ mesa: 1, stack: ['/'] } satisfies Entry, '', url('/'));
        h.pushState({ mesa: 1, stack: ['/', path] } satisfies Entry, '', url(path));
      }
      started = true;
      win.addEventListener('popstate', onPopState);
      // Painéis abrem e fecham pelo toque e pelo teclado.
      const check = () => later(checkOverlay);
      win.addEventListener('click', check, true);
      win.addEventListener('keyup', check, true);
    },
    /** A tela pedida no endereço ao abrir a página. */
    initial: (): Route => parseRoute(loc.pathname),
    sync,
    checkOverlay,
  };
}
