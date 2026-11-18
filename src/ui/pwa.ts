import { registerSW } from 'virtual:pwa-register';
import { VERSION } from './changelog';
import { esc } from './cardtext';
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

/** A versão publicada agora (versao.json, gravado no build), ou nada se não deu para saber. */
export async function latestVersion(): Promise<string> {
  try {
    const res = await fetch('/versao.json', { cache: 'no-store' });
    const version = res.ok ? (await res.json() as { version?: unknown }).version : '';
    return typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version) ? version : '';
  } catch { return ''; }
}

/**
 * Aviso de versão nova: janela no centro, com a mesa embaçada atrás, mostrando a versão que o jogador tem e a mais
 * recente (que chega depois; sem ela, só a do jogador). "Depois", Esc e tocar fora fecham; o foco vai para
 * "Atualizar agora" e volta para onde estava ao fechar.
 */
export function updateDialog(update: () => void, latest: Promise<string> = latestVersion(), current = VERSION) {
  document.querySelector('.pwa-update')?.remove();
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dlg = document.createElement('dialog');
  dlg.className = 'pwa-update';
  dlg.setAttribute('aria-labelledby', 'pwaUpdateTitle'); dlg.setAttribute('aria-describedby', 'pwaUpdateVersions');
  dlg.innerHTML = `<h2 id="pwaUpdateTitle">Nova versão do jogo</h2><dl class="pwa-versions" id="pwaUpdateVersions"><div><dt>Sua versão</dt><dd>${esc(current || '?')}</dd></div>`
    + '<span class="pwa-versions-arrow" aria-hidden="true" hidden>→</span><div class="pwa-latest" hidden><dt>Versão mais recente</dt><dd></dd></div></dl>'
    + '<div class="pwa-actions"><button type="button" class="pwa-dismiss">Depois</button><button type="button" class="pwa-primary">Atualizar agora</button></div>';
  document.body.append(dlg);
  void latest.then(version => {
    if (!version || version === current) return;
    dlg.querySelector('.pwa-latest dd')!.textContent = version;
    dlg.querySelector<HTMLElement>('.pwa-latest')!.hidden = false;
    dlg.querySelector<HTMLElement>('.pwa-versions-arrow')!.hidden = false;
  });
  dlg.addEventListener('click', e => { if (e.target === dlg || (e.target as HTMLElement).closest('.pwa-dismiss')) dlg.close(); });
  dlg.addEventListener('close', () => { dlg.remove(); if (opener?.isConnected) opener.focus({ preventScroll: true }); });
  dlg.querySelector<HTMLButtonElement>('.pwa-primary')!.addEventListener('click', event => {
    (event.currentTarget as HTMLButtonElement).disabled = true;
    update();
  });
  dlg.showModal();
  dlg.querySelector<HTMLElement>('.pwa-primary')!.focus();
}

function iosHint() {
  const el = banner('pwa-ios-hint', `<p><strong>Instalar no iPhone ou iPad</strong>No Safari, toque em <b>Compartilhar</b> <span aria-hidden="true">⬆︎</span> e depois em <b>Adicionar à Tela de Início</b>.</p><button type="button" class="pwa-dismiss">Entendi</button>`);
  el.querySelector('button')!.addEventListener('click', () => el.remove());
}

// O botão Novidades mostra um spinner enquanto o jogo procura ou baixa uma versão nova (data-pwa-update no <html>).
let checking = false;
let downloading = false;
function syncUpdateStatus() {
  const status = downloading ? 'downloading' : checking ? 'checking' : '';
  if (status) document.documentElement.dataset.pwaUpdate = status;
  else delete document.documentElement.dataset.pwaUpdate;
}

function checkForUpdate(registration: ServiceWorkerRegistration) {
  if (!navigator.onLine || checking) return;
  checking = true;
  syncUpdateStatus();
  void registration.update().catch(() => {}).finally(() => { checking = false; syncUpdateStatus(); });
}

function watchDownload(registration: ServiceWorkerRegistration) {
  const track = (worker: ServiceWorker | null) => {
    if (!worker) return;
    const sync = () => { downloading = worker.state === 'installing'; syncUpdateStatus(); };
    worker.addEventListener('statechange', sync);
    sync();
  };
  registration.addEventListener('updatefound', () => track(registration.installing));
  track(registration.installing);
}

/** Registra o service worker, a janela de versão nova e o aviso de sem internet. Chamar uma vez, no início. */
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
      updateDialog(() => void updateSW(true));
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      watchDownload(registration);
      // Quem deixa o jogo aberto por horas também recebe o aviso.
      checkForUpdate(registration);
      setInterval(() => checkForUpdate(registration), UPDATE_CHECK_MS);
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
