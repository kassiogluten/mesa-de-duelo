import { GOOGLE_CLIENT_ID, contaSessao, contasLigadas, entrar } from './session';

/**
 * Google Identity Services: o botão "Entrar com Google" e o One Tap. O script só é baixado quando algum dos dois
 * vai aparecer. Os dois entregam a mesma credencial (ID token), que a ponte confere em /api/conta/entrar.
 */
interface GoogleId {
  initialize(config: Record<string, unknown>): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
  prompt(): void;
  cancel(): void;
  disableAutoSelect(): void;
}
declare global { interface Window { google?: { accounts: { id: GoogleId } } } }

const SCRIPT = 'https://accounts.google.com/gsi/client';
let loading: Promise<GoogleId | null> | null = null;

export function carregarGoogle(): Promise<GoogleId | null> {
  if (!contasLigadas()) return Promise.resolve(null);
  loading ??= new Promise(resolve => {
    const ready = () => {
      const id = window.google?.accounts.id;
      if (!id) { resolve(null); return; }
      id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (r: { credential?: string }) => { if (r.credential) void entrar(r.credential); },
        // Quem já entrou antes volta logado sozinho; fechar o aviso fora dele também o fecha.
        auto_select: true,
        cancel_on_tap_outside: true,
        use_fedcm_for_prompt: true,
        itp_support: true,
        context: 'signin',
      });
      resolve(id);
    };
    const script = document.createElement('script');
    script.src = SCRIPT; script.async = true;
    script.onload = ready;
    script.onerror = () => { loading = null; resolve(null); };
    document.head.append(script);
  });
  return loading;
}

/** O botão oficial do Google; no cabeçalho do celular, só o ícone, para caber ({@code iconOnNarrow}). */
export async function desenharBotao(parent: HTMLElement, iconOnNarrow = true) {
  const id = await carregarGoogle();
  if (!id || !parent.isConnected) return;
  const narrow = iconOnNarrow && matchMedia('(max-width: 700px)').matches;
  id.renderButton(parent, narrow
    ? { type: 'icon', theme: 'filled_black', size: 'medium', shape: 'circle' }
    : { type: 'standard', theme: 'filled_black', size: 'medium', shape: 'pill', text: 'signin_with', locale: 'pt-BR' });
}

let oneTapShown = false;

/** One Tap na tela inicial e em Meus decks: uma vez por abertura do jogo, e só para quem ainda não entrou. */
export async function mostrarOneTap() {
  if (oneTapShown || contaSessao()) return;
  oneTapShown = true;
  (await carregarGoogle())?.prompt();
}

/** Ao começar uma partida ou abrir o modo livre: o aviso não pode cobrir a mesa. */
export function esconderOneTap() {
  if (loading) void loading.then(id => id?.cancel());
}

/** Depois de sair, o login automático não pode trazer a conta de volta sozinho. */
export function esquecerLoginAutomatico() {
  if (loading) void loading.then(id => id?.disableAutoSelect());
}
