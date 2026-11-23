// O guia da página /baixar, que não depende do manifesto: os passos, o aviso do Windows ou o atalho do Linux, o que precisa e como desinstalar.
import type { PcPlatform } from './platform';

const steps = (items: string[], after: string) => `<section class="bx-secao" aria-labelledby="bx-passos">
      <h2 id="bx-passos">Como começar</h2>
      <ol class="bx-passos">${items.map(item => `
        <li><span>${item}</span></li>`).join('')}
      </ol>
      <p>A mesa se atualiza sozinha toda vez que abre: não precisa baixar de novo a cada versão.</p>${after}
    </section>`;

const twoColumns = (needs: string[], uninstall: string) => `<div class="bx-duas">
      <section class="bx-secao" aria-labelledby="bx-precisa">
        <h2 id="bx-precisa">O que precisa</h2>
        <ul>${needs.map(item => `
          <li>${item}</li>`).join('')}
        </ul>
      </section>
      <section class="bx-secao" aria-labelledby="bx-desinstalar">
        <h2 id="bx-desinstalar">Como desinstalar</h2>
        ${uninstall}
      </section>
    </div>`;

const INTERNET = 'Internet para jogar e para as atualizações.';

function windowsGuide(otherDevice: boolean): string {
  // Nos outros aparelhos, os passos do Windows e uma linha para quem vai baixar para um PC com Linux.
  const linuxLine = otherDevice
    ? '\n      <p class="bx-menor">No Linux, o arquivo é um .tar.gz: extraia e abra o <em>mesa-de-duelo</em> da pasta. Os passos aparecem ao abrir esta página no PC com Linux.</p>'
    : '';
  return `${steps([
    '<strong>Baixe</strong> o arquivo .zip.',
    '<strong>Extraia</strong> numa pasta de sua escolha (botão direito no arquivo, <em>Extrair tudo…</em>).',
    '<strong>Abra</strong> o <em>Mesa de Duelo.exe</em> que está nela.',
  ], linuxLine)}
    <section class="bx-secao bx-destaque" aria-labelledby="bx-aviso-windows">
      <h2 id="bx-aviso-windows">Se o Windows avisar</h2>
      <p>O Windows pode avisar que o aplicativo não é reconhecido: toque em <strong>Mais informações</strong> e depois em <strong>Executar assim mesmo</strong>.</p>
      <p class="bx-menor">O aviso aparece porque a mesa é nova e ainda não tem assinatura digital, não por algum problema no arquivo.</p>
    </section>
    ${twoColumns([
    'Windows 10 ou 11, de 64 bits.',
    'Placa de vídeo com Vulkan ou DirectX 12, com o driver atualizado.',
    INTERNET,
  ], `<p>É só apagar a pasta onde você extraiu a mesa. Os decks da sua conta continuam nela.</p>
        <p class="bx-menor">Para apagar também as atualizações baixadas, as imagens guardadas e o login, apague a pasta <code>%APPDATA%\\Godot\\app_userdata\\Mesa de Duelo</code>.</p>`)}`;
}

function linuxGuide(): string {
  return `${steps([
    '<strong>Baixe</strong> o arquivo .tar.gz.',
    '<strong>Extraia</strong> numa pasta de sua escolha (botão direito no arquivo, <em>Extrair aqui</em>).',
    '<strong>Abra</strong> o <em>mesa-de-duelo</em> que está na pasta <em>Mesa de Duelo</em>.',
  ], '')}
    <section class="bx-secao bx-destaque" aria-labelledby="bx-atalho">
      <h2 id="bx-atalho">Atalho no menu de aplicativos</h2>
      <p>Para a mesa aparecer no menu de aplicativos, com o ícone, abra um terminal na pasta (botão direito no espaço vazio, <em>Abrir no terminal</em>) e rode <code>./criar-atalho.sh</code>. Não pede senha.</p>
      <p class="bx-menor">Se os dois cliques não abrirem a mesa, clique com o botão direito no <em>mesa-de-duelo</em> e escolha <em>Executar como programa</em>, ou rode <code>./mesa-de-duelo</code> no terminal.</p>
    </section>
    ${twoColumns([
    'Ubuntu 22.04 ou mais novo, ou outro Linux de 64 bits (x86_64).',
    'Placa de vídeo com Vulkan, com o driver atualizado (o Mesa, que já vem no Ubuntu, ou o da NVIDIA).',
    INTERNET,
  ], `<p>É só apagar a pasta onde você extraiu a mesa. Os decks da sua conta continuam nela. Se criou o atalho, rode antes <code>./criar-atalho.sh --remover</code>.</p>
        <p class="bx-menor">Para apagar também as atualizações baixadas, as imagens guardadas e o login, apague a pasta <code>~/.local/share/godot/app_userdata/Mesa de Duelo</code>.</p>`)}`;
}

/** O guia do PC deste aparelho; nos outros aparelhos, o do Windows com uma linha sobre o Linux. */
export function guideHTML(platform: PcPlatform | null = 'windows'): string {
  return platform === 'linux' ? linuxGuide() : windowsGuide(platform === null);
}
