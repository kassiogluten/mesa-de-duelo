import { registerSW } from 'virtual:pwa-register';
import './pwa.css';

/** Evento do Chrome/Edge que permite abrir o convite de instalação na hora em que o jogador clicar. */
interface InstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

const UPDATE_CHECK_MS = 30 * 60 * 1000;
let installPrompt: InstallPromptEvent | null = null;
const installButtons = new Set<HTMLButtonElement>();

const standalone = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches
  || (navigator as Navigator & { standalone?: boolean }).standalone === true;
// No iPhone/iPad não existe convite: a instalação é pelo menu Compartilhar do Safari.
const ios = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function syncInstallButtons() {
  const show = !standalone() && (!!installPrompt || ios());
  for (const button of installButtons) button.hidden = !show;
}

function banner(className: string, html: string) {
  document.querySelector(`.${className}`)?.remove();
  const el = document.createElement('div');
  el.className = `pwa-banner ${className}`;
  el.setAttribute('role', 'status');
  el.innerHTML = html;
  document.body.append(el);
  return el;
}

function iosHint() {
  const el = banner('pwa-ios-hint', `<p><strong>Instalar no iPhone ou iPad</strong>No Safari, toque em <b>Compartilhar</b> <span aria-hidden="true">⬆︎</span> e depois em <b>Adicionar à Tela de Início</b>.</p><button type="button" class="pwa-dismiss">Entendi</button>`);
  el.querySelector('button')!.addEventListener('click', () => el.remove());
}

/** Registra o service worker, o aviso de versão nova e o aviso de sem internet. Chamar uma vez, no início. */
export function setupPwa() {
  addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    syncInstallButtons();
  });
  addEventListener('appinstalled', () => { installPrompt = null; syncInstallButtons(); });

  const offline = () => {
    if (navigator.onLine) { document.querySelector('.pwa-offline')?.remove(); return; }
    banner('pwa-offline', '<p><strong>Sem internet</strong>A Mesa livre continua funcionando. As partidas voltam quando a conexão voltar.</p>');
  };
  addEventListener('online', offline);
  addEventListener('offline', offline);
  offline();

  if (!('serviceWorker' in navigator)) return;
  const updateSW = registerSW({
    onNeedRefresh() {
      const el = banner('pwa-update', '<p><strong>Nova versão do jogo</strong>Atualize para ver as novidades. Uma partida em andamento continua de onde parou.</p><div class="pwa-actions"><button type="button" class="pwa-dismiss">Depois</button><button type="button" class="pwa-primary">Atualizar agora</button></div>');
      el.querySelector('.pwa-dismiss')!.addEventListener('click', () => el.remove());
      el.querySelector<HTMLButtonElement>('.pwa-primary')!.addEventListener('click', event => {
        (event.currentTarget as HTMLButtonElement).disabled = true;
        void updateSW(true);
      });
    },
    onRegisteredSW(_url, registration) {
      // Quem deixa o jogo aberto por horas também recebe o aviso.
      if (registration) setInterval(() => { if (navigator.onLine) void registration.update(); }, UPDATE_CHECK_MS);
    },
  });
}

/** Botão "Instalar o jogo": só aparece onde o navegador permite instalar e o jogo ainda não está instalado. */
export function installButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'news-btn pwa-install';
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-5-5m5 5 5-5M5 20h14"/></svg>Instalar o jogo';
  button.addEventListener('click', async () => {
    if (!installPrompt) { if (ios()) iosHint(); return; }
    const prompt = installPrompt;
    installPrompt = null;
    await prompt.prompt();
    await prompt.userChoice.catch(() => undefined);
    syncInstallButtons();
  });
  installButtons.add(button);
  syncInstallButtons();
  return button;
}
