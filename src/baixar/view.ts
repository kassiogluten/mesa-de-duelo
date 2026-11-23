// Baixar a mesa no PC: o que vem do manifesto (/mesa-pc/versao.json) e o cartão do botão de baixar da página /baixar.
import { esc } from '../ui/cardtext';
import type { PcPlatform } from './platform';

/** Onde os downloads ficam quando o manifesto não diz outro endereço. */
const MESA_PC_DIR = '/mesa-pc/';
export const DEFAULT_ZIP = `${MESA_PC_DIR}mesa-de-duelo-pc.zip`;
export const DEFAULT_LINUX = `${MESA_PC_DIR}mesa-de-duelo-pc-linux.tar.gz`;
export const MANIFEST_URL = `${MESA_PC_DIR}versao.json`;

/**
 * Um download do manifesto. Sem `href`, ele ainda não foi publicado (manifesto de antes dele, ou o build não gerou):
 * o botão não aponta para lugar nenhum, porque o endereço sem arquivo devolveria a página do site no lugar do arquivo.
 */
interface Asset { href?: string; size?: number }
/** O que a página usa do manifesto: a versão, o zip do Windows e o .tar.gz do Linux. */
interface Download { version?: string; windows: Asset; linux: Asset }

const validSize = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;

/** O manifesto como veio (qualquer JSON) → versão e, de cada PC, endereço e tamanho; o que não for válido fica de fora. */
export function downloadFromManifest(raw: unknown): Download {
  const m = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const version = typeof m.version === 'string' && /^\d+\.\d+\.\d+$/.test(m.version) ? m.version : undefined;
  return {
    version,
    windows: { href: typeof m.zip === 'string' && m.zip ? zipHref(m.zip) : undefined, size: validSize(m.zipSize) },
    linux: { href: typeof m.linux === 'string' && m.linux ? linuxHref(m.linux) : undefined, size: validSize(m.linuxSize) },
  };
}

/** Um nome de arquivo (dentro de /mesa-pc/), um caminho do site ou um https:// terminado em `ext`; o resto cai no padrão. */
function assetHref(value: unknown, ext: string, fallback: string): string {
  if (typeof value !== 'string' || !value) return fallback;
  const end = `${ext.replace(/\./g, '\\.')}$`;
  if (new RegExp(`^[\\w.-]+${end}`, 'i').test(value)) return MESA_PC_DIR + value;
  if (new RegExp(`^/[\\w./-]+${end}`, 'i').test(value) && !value.startsWith('//')) return value;
  if (new RegExp(`^https://[^\\s"'<>]+${end}`, 'i').test(value)) return value;
  return fallback;
}

/** O campo `zip` do manifesto (Windows). */
export const zipHref = (zip: unknown) => assetHref(zip, '.zip', DEFAULT_ZIP);
/** O campo `linux` do manifesto (o .tar.gz). */
export const linuxHref = (file: unknown) => assetHref(file, '.tar.gz', DEFAULT_LINUX);

/** Tamanho como o Windows mostra (base 1024), com vírgula: 89478485 → "85,3 MB"; de 100 MB para cima, sem casa. */
export function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1).replace('.', ',')} GB`;
  return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1).replace('.', ',')} MB`;
}

/** Momento do botão: conferindo o manifesto, com o que ele trouxe, ou sem ele (aí não há o que baixar). */
export type ManifestState = { kind: 'carregando' } | { kind: 'pronto'; download: Download } | { kind: 'falhou' };

/** Sistema mostrado quando o manifesto não diz versão nem tamanho. */
const SYSTEM: Record<PcPlatform, string> = { windows: 'Windows 10 e 11', linux: 'Linux de 64 bits' };

/** "Versão 0.239.0 · 85,3 MB" do download deste PC (nos outros aparelhos, só a versão), com o que se sabe. */
export function downloadDetails(state: ManifestState, platform: PcPlatform | null = 'windows'): string {
  if (state.kind === 'carregando') return 'Conferindo a versão…';
  if (state.kind === 'falhou') return 'Não deu para conferir o download agora. Tente de novo daqui a pouco.';
  const { version, windows, linux } = state.download;
  const asset = platform ? state.download[platform] : undefined;
  if (platform ? !asset?.href : !windows.href && !linux.href) return 'O download fica disponível em instantes. Tente de novo daqui a pouco.';
  return [version && `Versão ${version}`, asset?.size && formatSize(asset.size)].filter(Boolean).join(' · ')
    || (platform ? SYSTEM[platform] : 'Windows e Linux');
}

const ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10.5 12 15.5l5-5M5 19.5h14"/></svg>';
const ICON_PC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h15A1.5 1.5 0 0 1 21 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 14.5zM9 20h6M12 16v4"/></svg>';

/** Nome do PC no botão e o arquivo que ele baixa. */
const LABEL: Record<PcPlatform, { name: string; note: string }> = {
  windows: { name: 'Windows', note: 'Um arquivo .zip. Não precisa instalar nem ser administrador do PC.' },
  linux: { name: 'Linux', note: 'Um arquivo .tar.gz. Não precisa instalar nem da senha de administrador.' },
};

/** O cartão do botão de baixar: no Windows e no Linux, o botão grande do PC; nos outros, o aviso e o Jogar no navegador. */
export function downloadCardHTML(state: ManifestState, platform: PcPlatform | null): string {
  const details = `<p class="bx-detalhes" data-detalhes>${esc(downloadDetails(state, platform))}</p>`;
  // Só vira link com o arquivo confirmado no manifesto; antes disso, o mesmo botão desligado.
  const button = (pc: PcPlatform, cls: string, content: string) => {
    const href = state.kind === 'pronto' ? state.download[pc].href : undefined;
    return href
      ? `<a class="${cls}" href="${esc(href)}" download data-baixar="${pc}">${content}</a>`
      : `<button type="button" class="${cls}" disabled data-baixar="${pc}">${content}</button>`;
  };
  if (platform) {
    return `${button(platform, 'arena-btn primary big bx-baixar', `${ICON_DOWNLOAD}<span>Baixar para ${LABEL[platform].name}</span>`)}
      ${details}
      <p class="bx-nota">${LABEL[platform].note}</p>`;
  }
  return `<p class="bx-aviso">${ICON_PC}<span>A mesa no PC é só para <strong>Windows</strong> e <strong>Linux</strong>, por enquanto. Neste aparelho, jogue no navegador: é a mesma conta, com os mesmos decks.</span></p>
    <div class="bx-botoes">
      <a class="arena-btn primary big" href="/">Jogar no navegador</a>
      ${button('windows', 'arena-btn secondary bx-mesmo-assim', 'Baixar para Windows')}
      ${button('linux', 'arena-btn secondary bx-mesmo-assim', 'Baixar para Linux')}
    </div>
    ${details}`;
}
