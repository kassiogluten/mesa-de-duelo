// A janela da logo no meio do Contador de vida: d6, d20 e moeda (que rolam no meio da mesa), o sorteio de quem começa, o histórico com desfazer, girar a mesa, recomeçar e sair.
import { desfazer, podeDesfazer, type Partida } from './state';
import { historicoHTML, menuHTML } from './view';

export interface MenuAcoes {
  /** A partida mudou pelo menu (desfazer): redesenhar e guardar. */
  mudou(): void;
  /** Rolar um dado de `lados` lados (2: a moeda) no meio da mesa, com a janela já fechada. */
  rolar(lados: number): void;
  /** Sortear quem começa (cada um rola um d20 no seu painel), com a janela já fechada. */
  sortear(): void;
  /** Girar a mesa um quarto de volta (em pé ↔ deitada), de propósito: girar o celular não muda nada. */
  girar(): void;
  /** Recomeçar com os mesmos jogadores. */
  reiniciar(): void;
  /** Voltar à configuração. */
  configurar(): void;
}

type TravaDeRotacao = ScreenOrientation & { lock?(o: OrientationType): Promise<void> };
/** Em tela cheia, o Android deixa travar a rotação de fato (fora dela, quem segura é a mesa, que gira ao contrário). */
function travarRotacao() {
  const o = screen.orientation as TravaDeRotacao | undefined;
  if (document.fullscreenElement && o?.lock) o.lock(o.type).catch(() => { /* o navegador recusou */ });
}

export function abrirMenu(p: Partida, acoes: MenuAcoes) {
  document.querySelector('.cv-menu')?.remove();
  document.body.insertAdjacentHTML('beforeend', menuHTML());
  const dlg = document.querySelector<HTMLDialogElement>('.cv-menu')!;
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => dlg.querySelector<T>(s)!;
  const lista = $('[data-historico]'), desfazerBtn = $<HTMLButtonElement>('[data-desfazer]');
  const telaCheia = $<HTMLButtonElement>('[data-tela-cheia]');
  telaCheia.hidden = !document.fullscreenEnabled;
  const marcarTelaCheia = () => { telaCheia.querySelector('span')!.textContent = document.fullscreenElement ? 'Sair da tela cheia' : 'Tela cheia'; };
  marcarTelaCheia();

  const mostrar = () => { lista.innerHTML = historicoHTML(p); desfazerBtn.disabled = !podeDesfazer(p); };
  mostrar();

  dlg.addEventListener('click', e => {
    const alvo = e.target as HTMLElement;
    if (alvo === dlg) { dlg.close(); return; } // toque fora da caixa
    const dado = alvo.closest<HTMLElement>('[data-rolar]');
    // O dado rola no meio da mesa, à vista de todos: a janela sai da frente.
    if (dado) { dlg.close(); acoes.rolar(Number(dado.dataset.rolar)); return; }
    if (alvo.closest('[data-sortear]')) { dlg.close(); acoes.sortear(); return; }
    if (alvo.closest('[data-desfazer]')) { desfazer(p); mostrar(); acoes.mudou(); return; }
    if (alvo.closest('[data-tela-cheia]')) {
      const pedido = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
      pedido.then(() => { marcarTelaCheia(); travarRotacao(); }, () => {});
      return;
    }
    if (alvo.closest('[data-girar]')) { dlg.close(); acoes.girar(); return; }
    if (alvo.closest('[data-reiniciar]')) {
      if (!confirm('Recomeçar a partida? Todos voltam à vida inicial e o histórico é apagado.')) return;
      dlg.close(); acoes.reiniciar();
      return;
    }
    if (alvo.closest('[data-configurar]')) { dlg.close(); acoes.configurar(); }
  });
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
}
