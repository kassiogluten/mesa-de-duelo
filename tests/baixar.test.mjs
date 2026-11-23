// Mesa no PC (/baixar): o que sai do manifesto, o tamanho dos downloads, quem é Windows ou Linux e o que a página e o rodapé mostram.
import test from 'node:test';
import assert from 'node:assert/strict';

const { DEFAULT_LINUX, DEFAULT_ZIP, downloadCardHTML, downloadDetails, downloadFromManifest, formatSize, linuxHref, zipHref } = await import('../src/baixar/view.ts');
const { guideHTML } = await import('../src/baixar/guide.ts');
const { isLinux, isWindows, pcPlatform } = await import('../src/baixar/platform.ts');
const { siteFooterHTML } = await import('../src/ui/siteFooter.ts');
const { LINUX_ARCHIVE, LINUX_EXE, SHORTCUT_SCRIPT } = await import('../scripts/godot-linux-files.mjs');

const WIN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const LINUX_FIREFOX = 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0';
const LINUX_CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';
const NOTHING = { kind: 'pronto', download: { version: '0.239.0', windows: {}, linux: {} } };

test('size of the zip as Windows shows it', () => {
  assert.equal(formatSize(89_478_485), '85,3 MB');
  assert.equal(formatSize(150 * 1024 * 1024 + 300_000), '150 MB');
  assert.equal(formatSize(512 * 1024), '512 KB');
  assert.equal(formatSize(10), '1 KB');
  assert.equal(formatSize(1.5 * 1024 ** 3), '1,5 GB');
});

test('without a download in the manifest there is nothing to download', () => {
  // Manifesto de antes do zip: só o do atualizador (pck, size do pck…).
  const old = downloadFromManifest({ version: '0.239.0', pck: 'game-0.239.0.pck', size: 4_000_000, sha256: 'x' });
  assert.deepEqual(old, { version: '0.239.0', windows: { href: undefined, size: undefined }, linux: { href: undefined, size: undefined } },
    'sem zip publicado, sem endereço; o size do pck não vira o do zip');
  for (const platform of ['windows', 'linux', null]) {
    assert.match(downloadDetails({ kind: 'pronto', download: old }, platform), /disponível em instantes/);
  }
  const full = downloadFromManifest({ version: '0.239.0', zip: 'mesa-de-duelo-pc.zip', zipSize: 89_478_485, zipSha256: 'y',
    linux: LINUX_ARCHIVE, linuxSize: 32_137_189, linuxSha256: 'z' });
  assert.deepEqual(full, { version: '0.239.0', windows: { href: '/mesa-pc/mesa-de-duelo-pc.zip', size: 89_478_485 },
    linux: { href: `/mesa-pc/${LINUX_ARCHIVE}`, size: 32_137_189 } });
  assert.equal(downloadDetails({ kind: 'pronto', download: full }, 'windows'), 'Versão 0.239.0 · 85,3 MB');
  assert.equal(downloadDetails({ kind: 'pronto', download: full }, 'linux'), 'Versão 0.239.0 · 30,6 MB');
  assert.equal(downloadDetails({ kind: 'pronto', download: full }, null), 'Versão 0.239.0');
  // Manifesto com o zip mas sem o Linux (a exportação do Linux falhou no deploy): só o Linux fica esperando.
  const onlyWindows = downloadFromManifest({ version: '0.239.0', zip: 'mesa-de-duelo-pc.zip', zipSize: 1 });
  assert.match(downloadDetails({ kind: 'pronto', download: onlyWindows }, 'linux'), /disponível em instantes/);
  assert.equal(downloadDetails({ kind: 'pronto', download: onlyWindows }, null), 'Versão 0.239.0');
  assert.deepEqual(downloadFromManifest(null).windows, { href: undefined, size: undefined });
  assert.deepEqual(downloadFromManifest({ version: '<b>', zipSize: -1, linuxSize: 'x' }),
    { version: undefined, windows: { href: undefined, size: undefined }, linux: { href: undefined, size: undefined } });
  assert.equal(downloadFromManifest({ zip: 'javascript:x' }).windows.href, DEFAULT_ZIP, 'zip estranho cai no padrão');
  assert.equal(downloadFromManifest({ linux: 'javascript:x' }).linux.href, DEFAULT_LINUX, 'linux estranho cai no padrão');
  assert.equal(downloadDetails({ kind: 'pronto', download: { windows: { href: DEFAULT_ZIP }, linux: {} } }, 'windows'), 'Windows 10 e 11');
  assert.equal(downloadDetails({ kind: 'pronto', download: { windows: {}, linux: { href: DEFAULT_LINUX } } }, 'linux'), 'Linux de 64 bits');
  assert.match(downloadDetails({ kind: 'falhou' }, 'linux'), /Não deu para conferir o download agora/);
});

test('the version from the manifest shows only the number, without the package hash', () => {
  assert.equal(downloadFromManifest({ version: '0.240.0+a1b2c3d4' }).version, '0.240.0');
  assert.equal(downloadFromManifest({ version: '0.240.0' }).version, '0.240.0');
  assert.equal(downloadFromManifest({ version: '<b>+x' }).version, undefined);
});

test('the download address only from a file name, a site path or https', () => {
  assert.equal(zipHref('mesa-de-duelo-pc-0.239.0.zip'), '/mesa-pc/mesa-de-duelo-pc-0.239.0.zip');
  assert.equal(zipHref('/mesa-pc/outro.zip'), '/mesa-pc/outro.zip');
  assert.equal(zipHref('https://exemplo.com/mesa.zip'), 'https://exemplo.com/mesa.zip');
  for (const bad of ['javascript:alert(1)//.zip', '//outro.site/x.zip', 'http://x/y.zip', '../x.zip', 'a"b.zip', 42, '', LINUX_ARCHIVE]) {
    assert.equal(zipHref(bad), DEFAULT_ZIP, String(bad));
  }
  assert.equal(DEFAULT_LINUX, `/mesa-pc/${LINUX_ARCHIVE}`, 'o padrão é o nome que o godot-zip.mjs grava');
  assert.equal(linuxHref('mesa-0.239.0.tar.gz'), '/mesa-pc/mesa-0.239.0.tar.gz');
  assert.equal(linuxHref('/mesa-pc/outro.tar.gz'), '/mesa-pc/outro.tar.gz');
  assert.equal(linuxHref('https://exemplo.com/mesa.tar.gz'), 'https://exemplo.com/mesa.tar.gz');
  for (const bad of ['javascript:alert(1)//.tar.gz', '//outro.site/x.tar.gz', 'mesa.zip', 'mesa.gz', 'mesatar.gz', 'a"b.tar.gz', null]) {
    assert.equal(linuxHref(bad), DEFAULT_LINUX, String(bad));
  }
});

test('Windows detection', () => {
  assert.equal(isWindows({ userAgent: WIN_UA }), true);
  assert.equal(isWindows({ userAgent: WIN_UA, userAgentData: { platform: 'Windows' } }), true);
  assert.equal(isWindows({ userAgent: WIN_UA, userAgentData: { platform: 'Android' } }), false, 'o userAgentData vale mais');
  assert.equal(isWindows({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15' }), false);
  assert.equal(isWindows({ userAgent: ANDROID_CHROME }), false);
  assert.equal(isWindows({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }), false);
  assert.equal(isWindows({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox One) Edge/44' }), false);
  assert.equal(isWindows({ userAgent: 'Mozilla/5.0 (Windows Phone 10.0; Android 6.0.1) Edge/15' }), false);
  assert.equal(isWindows({ userAgentData: null, userAgent: WIN_UA }), true);
  assert.equal(isWindows({ userAgent: LINUX_FIREFOX }), false);
  assert.equal(isWindows(undefined), false);
});

test('desktop Linux detection, without Android, Chromebook, TVs or ARM', () => {
  assert.equal(isLinux({ userAgent: LINUX_FIREFOX }), true, 'Firefox no Ubuntu');
  assert.equal(isLinux({ userAgent: LINUX_CHROME, userAgentData: { platform: 'Linux' } }), true, 'Chrome no Linux');
  assert.equal(isLinux({ userAgent: 'Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0' }), true);
  // O Chrome do Android com "versão para computador" manda um userAgent de Linux, mas o userAgentData diz Android.
  assert.equal(isLinux({ userAgent: LINUX_CHROME, userAgentData: { platform: 'Android' } }), false);
  assert.equal(isLinux({ userAgent: ANDROID_CHROME }), false);
  assert.equal(isLinux({ userAgent: 'Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0' }), false);
  assert.equal(isLinux({ userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/131.0 Safari/537.36' }), false, 'Chromebook');
  assert.equal(isLinux({ userAgent: LINUX_CHROME, userAgentData: { platform: 'Chrome OS' } }), false, 'Chromebook pelo userAgentData');
  assert.equal(isLinux({ userAgent: 'Mozilla/5.0 (X11; Linux aarch64; rv:132.0) Gecko/20100101 Firefox/132.0' }), false, 'Raspberry Pi');
  assert.equal(isLinux({ userAgent: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 SamsungBrowser/4.0 TV Safari/537.36' }), false);
  assert.equal(isLinux({ userAgent: 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 Chrome/87.0 Safari/537.36' }), false);
  assert.equal(isLinux({ userAgent: WIN_UA }), false);
  assert.equal(isLinux(undefined), false);
  assert.equal(pcPlatform({ userAgent: WIN_UA }), 'windows');
  assert.equal(pcPlatform({ userAgent: LINUX_FIREFOX }), 'linux');
  assert.equal(pcPlatform({ userAgent: ANDROID_CHROME }), null);
  assert.equal(pcPlatform(undefined), null);
});

test('the download card on Windows, on Linux and elsewhere', () => {
  const ready = { kind: 'pronto', download: { version: '0.239.0', windows: { href: '/mesa-pc/mesa-de-duelo-pc.zip', size: 89_478_485 },
    linux: { href: `/mesa-pc/${LINUX_ARCHIVE}`, size: 32_137_189 } } };
  const win = downloadCardHTML(ready, 'windows');
  assert.match(win, /href="\/mesa-pc\/mesa-de-duelo-pc\.zip" download data-baixar="windows"/);
  assert.match(win, /Baixar para Windows/);
  assert.match(win, /Versão 0\.239\.0 · 85,3 MB/);
  assert.doesNotMatch(win, /Jogar no navegador|tar\.gz/);
  const linux = downloadCardHTML(ready, 'linux');
  assert.match(linux, new RegExp(`href="/mesa-pc/${LINUX_ARCHIVE.replace(/\./g, '\\.')}" download data-baixar="linux"`));
  assert.match(linux, /Baixar para Linux/);
  assert.match(linux, /Versão 0\.239\.0 · 30,6 MB/);
  assert.match(linux, /Um arquivo \.tar\.gz/);
  assert.doesNotMatch(linux, /Jogar no navegador|\.zip"/);
  const other = downloadCardHTML(ready, null);
  assert.match(other, /só para <strong>Windows<\/strong> e <strong>Linux<\/strong>, por enquanto/);
  assert.match(other, /href="\/">Jogar no navegador/);
  assert.match(other, /data-baixar="windows">Baixar para Windows/);
  assert.match(other, /data-baixar="linux">Baixar para Linux/);
  // Sem o arquivo confirmado (conferindo, sem manifesto, manifesto sem ele), o botão fica desligado e não aponta para
  // nada: o endereço sem arquivo devolveria a página do site, que o navegador gravaria como um arquivo quebrado.
  for (const state of [{ kind: 'carregando' }, { kind: 'falhou' }, NOTHING]) {
    for (const platform of ['windows', 'linux', null]) {
      const html = downloadCardHTML(state, platform);
      assert.doesNotMatch(html, /href="[^"]*\.(zip|tar\.gz)"/, `${state.kind} sem link`);
      assert.match(html, /<button type="button" class="[^"]*" disabled data-baixar="(windows|linux)">/, `${state.kind} desligado`);
    }
  }
  // Só o zip publicado: no Linux o botão espera; nos outros aparelhos, o do Windows funciona e o do Linux espera.
  const onlyWindows = { kind: 'pronto', download: { ...ready.download, linux: {} } };
  assert.match(downloadCardHTML(onlyWindows, 'linux'), /disabled data-baixar="linux"/);
  const half = downloadCardHTML(onlyWindows, null);
  assert.match(half, /download data-baixar="windows"/);
  assert.match(half, /disabled data-baixar="linux"/);
});

test('the Windows guide has the steps, the Windows warning, the requirements and how to uninstall', () => {
  const html = guideHTML('windows');
  for (const text of ['Baixe', 'Extraia', 'Mesa de Duelo.exe', 'atualiza sozinha', 'Mais informações', 'Executar assim mesmo',
    'Windows 10 ou 11, de 64 bits', 'Vulkan ou DirectX 12', 'apagar a pasta', '%APPDATA%']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /tar\.gz/);
  // Nos outros aparelhos, os passos do Windows e uma linha para o Linux.
  const other = guideHTML(null);
  assert.ok(other.includes('Mesa de Duelo.exe') && other.includes('No Linux, o arquivo é um .tar.gz'));
});

test('the Linux guide has the steps, the menu shortcut, the requirements and how to uninstall', () => {
  const html = guideHTML('linux');
  for (const text of ['Baixe', '.tar.gz', 'Extrair aqui', LINUX_EXE, 'atualiza sozinha', `./${SHORTCUT_SCRIPT}`, 'Executar como programa',
    'Ubuntu 22.04 ou mais novo', 'x86_64', 'Vulkan', 'apagar a pasta', `./${SHORTCUT_SCRIPT} --remover`,
    '~/.local/share/godot/app_userdata/Mesa de Duelo']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /Mesa de Duelo\.exe|Executar assim mesmo|%APPDATA%|DirectX/);
});

test('the home screen footer links to the PC table only on Windows and Linux', () => {
  assert.match(siteFooterHTML(true), /<a href="\/baixar" data-mesa-pc>Mesa no PC<\/a>/);
  assert.doesNotMatch(siteFooterHTML(false), /\/baixar/);
});
