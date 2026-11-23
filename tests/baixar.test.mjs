// Mesa no PC (/baixar): o que sai do manifesto, o tamanho do zip, quem é Windows e o que a página e o rodapé mostram.
import test from 'node:test';
import assert from 'node:assert/strict';

const { DEFAULT_ZIP, downloadCardHTML, downloadDetails, downloadFromManifest, formatSize, guideHTML, zipHref } = await import('../src/baixar/view.ts');
const { isWindows } = await import('../src/baixar/platform.ts');
const { siteFooterHTML } = await import('../src/ui/siteFooter.ts');

test('size of the zip as Windows shows it', () => {
  assert.equal(formatSize(89_478_485), '85,3 MB');
  assert.equal(formatSize(150 * 1024 * 1024 + 300_000), '150 MB');
  assert.equal(formatSize(512 * 1024), '512 KB');
  assert.equal(formatSize(10), '1 KB');
  assert.equal(formatSize(1.5 * 1024 ** 3), '1,5 GB');
});

test('without the zip in the manifest there is nothing to download', () => {
  // Manifesto de antes do zip: só o do atualizador (pck, size do pck…).
  const old = downloadFromManifest({ version: '0.239.0', pck: 'game-0.239.0.pck', size: 4_000_000, sha256: 'x' });
  assert.deepEqual(old, { version: '0.239.0', href: undefined, size: undefined }, 'sem zip publicado, sem endereço; o size do pck não vira o do zip');
  assert.match(downloadDetails({ kind: 'pronto', download: old }), /disponível em instantes/);
  const full = downloadFromManifest({ version: '0.239.0', zip: 'mesa-de-duelo-pc.zip', zipSize: 89_478_485, zipSha256: 'y' });
  assert.deepEqual(full, { version: '0.239.0', href: '/mesa-pc/mesa-de-duelo-pc.zip', size: 89_478_485 });
  assert.equal(downloadDetails({ kind: 'pronto', download: full }), 'Versão 0.239.0 · 85,3 MB');
  assert.deepEqual(downloadFromManifest(null), { version: undefined, href: undefined, size: undefined });
  assert.deepEqual(downloadFromManifest({ version: '<b>', zipSize: -1 }), { version: undefined, href: undefined, size: undefined });
  assert.equal(downloadFromManifest({ zip: 'javascript:x' }).href, DEFAULT_ZIP, 'zip estranho cai no padrão');
  assert.equal(downloadDetails({ kind: 'pronto', download: { href: DEFAULT_ZIP } }), 'Windows 10 e 11');
  assert.match(downloadDetails({ kind: 'falhou' }), /Não deu para conferir o download agora/);
});

test('the zip address only from a file name, a site path or https', () => {
  assert.equal(zipHref('mesa-de-duelo-pc-0.239.0.zip'), '/mesa-pc/mesa-de-duelo-pc-0.239.0.zip');
  assert.equal(zipHref('/mesa-pc/outro.zip'), '/mesa-pc/outro.zip');
  assert.equal(zipHref('https://exemplo.com/mesa.zip'), 'https://exemplo.com/mesa.zip');
  for (const bad of ['javascript:alert(1)//.zip', '//outro.site/x.zip', 'http://x/y.zip', '../x.zip', 'a"b.zip', 42, '']) {
    assert.equal(zipHref(bad), DEFAULT_ZIP, String(bad));
  }
});

test('Windows detection', () => {
  const win = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
  assert.equal(isWindows({ userAgent: win }), true);
  assert.equal(isWindows({ userAgent: win, userAgentData: { platform: 'Windows' } }), true);
  assert.equal(isWindows({ userAgent: win, userAgentData: { platform: 'Android' } }), false, 'o userAgentData vale mais');
  assert.equal(isWindows({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15' }), false);
  assert.equal(isWindows({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/131.0 Mobile' }), false);
  assert.equal(isWindows({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }), false);
  assert.equal(isWindows({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox One) Edge/44' }), false);
  assert.equal(isWindows({ userAgent: 'Mozilla/5.0 (Windows Phone 10.0; Android 6.0.1) Edge/15' }), false);
  assert.equal(isWindows({ userAgentData: null, userAgent: win }), true);
  assert.equal(isWindows(undefined), false);
});

test('the download card on Windows and elsewhere', () => {
  const ready = { kind: 'pronto', download: { version: '0.239.0', href: '/mesa-pc/mesa-de-duelo-pc.zip', size: 89_478_485 } };
  const win = downloadCardHTML(ready, true);
  assert.match(win, /href="\/mesa-pc\/mesa-de-duelo-pc\.zip" download/);
  assert.match(win, /Baixar para Windows/);
  assert.match(win, /Versão 0\.239\.0 · 85,3 MB/);
  assert.doesNotMatch(win, /Jogar no navegador/);
  const other = downloadCardHTML(ready, false);
  assert.match(other, /só para <strong>Windows<\/strong>, por enquanto/);
  assert.match(other, /href="\/">Jogar no navegador/);
  assert.match(other, /Baixar para um PC com Windows/);
  // Sem o zip confirmado (conferindo, sem manifesto, manifesto sem zip), o botão fica desligado e não aponta para nada:
  // o endereço sem arquivo devolveria a página do site, que o navegador gravaria como um zip quebrado.
  for (const state of [{ kind: 'carregando' }, { kind: 'falhou' }, { kind: 'pronto', download: { version: '0.239.0' } }]) {
    for (const windows of [true, false]) {
      const html = downloadCardHTML(state, windows);
      assert.doesNotMatch(html, /href="[^"]*\.zip"/, `${state.kind} sem link`);
      assert.match(html, /<button type="button" class="[^"]*" disabled data-baixar>/, `${state.kind} desligado`);
    }
  }
});

test('the guide has the steps, the Windows warning, the requirements and how to uninstall', () => {
  const html = guideHTML();
  for (const text of ['Baixe', 'Extraia', 'Mesa de Duelo.exe', 'atualiza sozinha', 'Mais informações', 'Executar assim mesmo',
    'Windows 10 ou 11, de 64 bits', 'Vulkan ou DirectX 12', 'apagar a pasta']) assert.ok(html.includes(text), text);
});

test('the home screen footer links to the PC table only on Windows', () => {
  assert.match(siteFooterHTML(true), /<a href="\/baixar" data-mesa-pc>Mesa no PC<\/a>/);
  assert.doesNotMatch(siteFooterHTML(false), /\/baixar/);
});
