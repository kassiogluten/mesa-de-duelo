// Baixar a mesa no PC: o que vem do manifesto (/mesa-pc/versao.json) e o HTML da página /baixar.
import { esc } from '../ui/cardtext';

/** Onde o pacote fica quando o manifesto não diz outro endereço. */
const MESA_PC_DIR = '/mesa-pc/';
export const DEFAULT_ZIP = `${MESA_PC_DIR}mesa-de-duelo-pc.zip`;
export const MANIFEST_URL = `${MESA_PC_DIR}versao.json`;

/**
 * O que a página usa do manifesto. Sem `href`, o zip ainda não foi publicado (manifesto de antes do zip, ou o build não
 * gerou): o botão não aponta para lugar nenhum, porque o endereço sem arquivo devolveria a página do site no lugar do zip.
 */
interface Download { version?: string; href?: string; size?: number }

/** O manifesto como veio (qualquer JSON) → versão, endereço e tamanho do zip; o que não for válido fica de fora. */
export function downloadFromManifest(raw: unknown): Download {
  const m = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const version = typeof m.version === 'string' && /^\d+\.\d+\.\d+$/.test(m.version) ? m.version : undefined;
  const size = typeof m.zipSize === 'number' && Number.isFinite(m.zipSize) && m.zipSize > 0 ? m.zipSize : undefined;
  return { version, href: typeof m.zip === 'string' && m.zip ? zipHref(m.zip) : undefined, size };
}

/** O campo `zip`: um nome de arquivo (dentro de /mesa-pc/), um caminho do site ou um https://; o resto cai no padrão. */
export function zipHref(zip: unknown): string {
  if (typeof zip !== 'string' || !zip) return DEFAULT_ZIP;
  if (/^[\w.-]+\.zip$/i.test(zip)) return MESA_PC_DIR + zip;
  if (/^\/[\w./-]+\.zip$/i.test(zip) && !zip.startsWith('//')) return zip;
  if (/^https:\/\/[^\s"'<>]+\.zip$/i.test(zip)) return zip;
  return DEFAULT_ZIP;
}

/** Tamanho como o Windows mostra (base 1024), com vírgula: 89478485 → "85,3 MB"; de 100 MB para cima, sem casa. */
export function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1).replace('.', ',')} GB`;
  return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1).replace('.', ',')} MB`;
}

/** Momento do botão: conferindo o manifesto, com o que ele trouxe, ou sem ele (aí não há o que baixar). */
export type ManifestState = { kind: 'carregando' } | { kind: 'pronto'; download: Download } | { kind: 'falhou' };

/** "Versão 0.239.0 · 85,3 MB", só com o que se sabe. */
export function downloadDetails(state: ManifestState): string {
  if (state.kind === 'carregando') return 'Conferindo a versão…';
  if (state.kind === 'falhou') return 'Não deu para conferir o download agora. Tente de novo daqui a pouco.';
  const { version, size, href } = state.download;
  if (!href) return 'O download fica disponível em instantes. Tente de novo daqui a pouco.';
  return [version && `Versão ${version}`, size && formatSize(size)].filter(Boolean).join(' · ') || 'Windows 10 e 11';
}

const ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10.5 12 15.5l5-5M5 19.5h14"/></svg>';
const ICON_WINDOWS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 5.6 10.5 4.6v6.9h-7zM11.8 4.4l8.7-1.2v8.3h-8.7zM3.5 12.8h7v6.9l-7-1zM11.8 12.8h8.7v8.3l-8.7-1.2z"/></svg>';

/** O cartão do botão de baixar: no Windows, o botão grande; fora dele, o aviso e o Jogar no navegador. */
export function downloadCardHTML(state: ManifestState, windows: boolean): string {
  const href = state.kind === 'pronto' ? state.download.href : undefined;
  const details = `<p class="bx-detalhes" data-detalhes>${esc(downloadDetails(state))}</p>`;
  // Só vira link com o zip confirmado no manifesto; antes disso, o mesmo botão desligado.
  const button = (cls: string, content: string) => href
    ? `<a class="${cls}" href="${esc(href)}" download data-baixar>${content}</a>`
    : `<button type="button" class="${cls}" disabled data-baixar>${content}</button>`;
  if (windows) {
    return `${button('arena-btn primary big bx-baixar', `${ICON_DOWNLOAD}<span>Baixar para Windows</span>`)}
      ${details}
      <p class="bx-nota">Um arquivo .zip. Não precisa instalar nem ser administrador do PC.</p>`;
  }
  return `<p class="bx-aviso">${ICON_WINDOWS}<span>A mesa no PC é só para <strong>Windows</strong>, por enquanto. Neste aparelho, jogue no navegador: é a mesma conta, com os mesmos decks.</span></p>
    <div class="bx-botoes">
      <a class="arena-btn primary big" href="/">Jogar no navegador</a>
      ${button('arena-btn secondary bx-mesmo-assim', 'Baixar para um PC com Windows')}
    </div>
    ${details}`;
}

/** O resto da página, que não depende do manifesto: os passos, o aviso do Windows, o que precisa e como desinstalar. */
export function guideHTML(): string {
  return `<section class="bx-secao" aria-labelledby="bx-passos">
      <h2 id="bx-passos">Como começar</h2>
      <ol class="bx-passos">
        <li><span><strong>Baixe</strong> o arquivo .zip.</span></li>
        <li><span><strong>Extraia</strong> numa pasta de sua escolha (botão direito no arquivo, <em>Extrair tudo…</em>).</span></li>
        <li><span><strong>Abra</strong> o <em>Mesa de Duelo.exe</em> que está nela.</span></li>
      </ol>
      <p>A mesa se atualiza sozinha toda vez que abre: não precisa baixar de novo a cada versão.</p>
    </section>
    <section class="bx-secao bx-windows" aria-labelledby="bx-aviso-windows">
      <h2 id="bx-aviso-windows">Se o Windows avisar</h2>
      <p>O Windows pode avisar que o aplicativo não é reconhecido: toque em <strong>Mais informações</strong> e depois em <strong>Executar assim mesmo</strong>.</p>
      <p class="bx-menor">O aviso aparece porque a mesa é nova e ainda não tem assinatura digital, não por algum problema no arquivo.</p>
    </section>
    <div class="bx-duas">
      <section class="bx-secao" aria-labelledby="bx-precisa">
        <h2 id="bx-precisa">O que precisa</h2>
        <ul>
          <li>Windows 10 ou 11, de 64 bits.</li>
          <li>Placa de vídeo com Vulkan ou DirectX 12, com o driver atualizado.</li>
          <li>Internet para jogar e para as atualizações.</li>
        </ul>
      </section>
      <section class="bx-secao" aria-labelledby="bx-desinstalar">
        <h2 id="bx-desinstalar">Como desinstalar</h2>
        <p>É só apagar a pasta onde você extraiu a mesa. Os decks da sua conta continuam nela.</p>
        <p class="bx-menor">Para apagar também as atualizações baixadas, as imagens guardadas e o login, apague a pasta <code>%APPDATA%\\Godot\\app_userdata\\Mesa de Duelo</code>.</p>
      </section>
    </div>`;
}
