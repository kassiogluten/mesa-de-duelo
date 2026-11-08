// Página de apresentação (/sobre): conta os toques em Jogar, que levam à tela inicial (item 109).
import { countFunnel } from './funnel';

document.addEventListener('click', e => {
  // Os botões de jogar e o Jogar do rodapé; a marca no topo também leva ao jogo, mas não é um convite a jogar.
  const link = (e.target as Element | null)?.closest?.('a.btn[href="/"], .foot a[href="/"]');
  if (link) countFunnel('jogar');
});
