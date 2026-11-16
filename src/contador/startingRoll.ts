// O sorteio de quem começa no Contador de vida: cada jogador rola um d20 no próprio painel, virado para ele; empatados no maior número rolam de novo e quem tirar mais escolhe quem começa.
import { esc } from '../ui/cardtext';
import type { Point } from '../ui/motionKit';
import type { Efeitos3d } from './effects3d';
import { GIRO, LADOS_SORTEIO, jogadorDe, nomeDe, type Disposicao, type Partida, type Sorteio } from './state';
import { sorteioHTML } from './view';

/** Quanto o d20 em 3D fica no painel: assenta na metade e some de 88% em diante, quando o número escrito aparece. */
const DADO_MS = 2200;
/** Sem 3D: quanto o "?" gira antes de virar o número. */
const SEM_3D_MS = 900;
/** Com os números na mesa, a pausa antes de avisar o empate, e o aviso antes de os empatados rolarem de novo. */
const PAUSA_MS = 700, EMPATE_MS = 1300;
/** Quanto o resultado fica nos painéis antes de sumir sozinho (um toque num deles tira antes). */
const FICA_MS = 9000;

export interface SorteioNaMesa { cancelar(): void }

/**
 * Mostra o sorteio `e` (já feito e no histórico) nos painéis de `raiz`: uma camada por cima de cada painel, virada
 * para o jogador, com o d20 rolando em 3D por cima dela (sem 3D, o "?" girando). `ponto` dá o meio de cada painel.
 */
export function mostrarSorteio(raiz: HTMLElement, p: Partida, d: Disposicao, e: Sorteio, efeitos: Efeitos3d, ponto: (j: number) => Point): SorteioNaMesa {
  const timers: number[] = [];
  let vivo = true;
  const depois = (ms: number) => new Promise<void>(ok => { timers.push(window.setTimeout(ok, ms)); });
  const camadas = new Map<number, HTMLElement>();
  for (const r of e.rodadas[0] ?? []) {
    const face = raiz.querySelector<HTMLElement>(`.cv-painel[data-j="${r.jogador}"] .cv-face`);
    if (!face) continue;
    face.querySelector('[data-sorteio]')?.remove();
    face.insertAdjacentHTML('beforeend', sorteioHTML());
    camadas.set(r.jogador, face.lastElementChild as HTMLElement);
  }
  const num = (j: number) => camadas.get(j)?.querySelector<HTMLElement>('[data-sorteio-num]');
  const texto = (j: number, html: string) => { const el = camadas.get(j)?.querySelector('[data-sorteio-texto]'); if (el) el.innerHTML = html; };
  const nome = (j: number) => `<b style="color:${jogadorDe(p, j).cor}">${esc(nomeDe(p, j))}</b>`;
  const giro = (j: number) => GIRO[d.lugares.find(l => l.jogador === j)?.lado ?? 'baixo'];

  const sair = () => {
    if (!vivo) return;
    vivo = false;
    timers.forEach(clearTimeout);
    camadas.forEach(c => c.remove());
    raiz.removeEventListener('click', tocar, true);
  };

  const rodar = async () => {
    for (let i = 0; i < e.rodadas.length; i++) {
      const rodada = e.rodadas[i]!, maior = Math.max(...rodada.map(r => r.resultado));
      for (const r of rodada) {
        const c = camadas.get(r.jogador);
        c?.classList.remove('maior', 'empate');
        c?.classList.add('rolando');
        const n = num(r.jogador);
        if (n) n.textContent = '';
        texto(r.jogador, i ? 'Desempate' : `Cada um rola um d${LADOS_SORTEIO}`);
      }
      const em3d = await Promise.all(rodada.map(r => {
        const at = ponto(r.jogador);
        return efeitos.rolarNo(at, LADOS_SORTEIO, r.resultado, giro(r.jogador), DADO_MS);
      }));
      if (!vivo) return;
      // Sem 3D (ou com "reduzir movimento"), o "?" gira no lugar do dado.
      if (!em3d.some(Boolean)) for (const r of rodada) { const n = num(r.jogador); if (n) n.textContent = '?'; camadas.get(r.jogador)?.classList.add('sem-3d'); }
      await depois(em3d.some(Boolean) ? DADO_MS * .86 : SEM_3D_MS);
      if (!vivo) return;
      for (const r of rodada) {
        const c = camadas.get(r.jogador), n = num(r.jogador);
        c?.classList.remove('rolando', 'sem-3d');
        c?.classList.toggle('maior', r.resultado === maior);
        if (n) { n.textContent = String(r.resultado); n.classList.toggle('sublinhado', r.resultado === 6 || r.resultado === 9); }
        texto(r.jogador, '');
      }
      if (i === e.rodadas.length - 1) break;
      // Empate no maior número: só os empatados rolam de novo; os outros apagam.
      await depois(PAUSA_MS);
      if (!vivo) return;
      const empatados = rodada.filter(r => r.resultado === maior).map(r => r.jogador);
      for (const [j, c] of camadas) {
        if (empatados.includes(j)) { c.classList.add('empate'); texto(j, 'Empate! Role de novo'); }
        else { c.classList.add('fora'); texto(j, `Empate entre ${empatados.map(nome).join(' e ')}`); }
      }
      await depois(EMPATE_MS);
      if (!vivo) return;
    }
    for (const [j, c] of camadas) {
      c.classList.remove('maior', 'empate');
      c.classList.add(j === e.vencedor ? 'vencedor' : 'fora', 'pronto');
      texto(j, j === e.vencedor ? 'Você escolhe quem começa' : `${nome(e.vencedor)} escolhe quem começa`);
    }
    efeitos.brilho(ponto(e.vencedor), jogadorDe(p, e.vencedor).cor);
    navigator.vibrate?.(30);
    await depois(FICA_MS);
    sair();
  };

  // Acabado o sorteio, um toque em qualquer painel tira o resultado da mesa; antes, o toque não chega à vida.
  function tocar(ev: Event) {
    const c = (ev.target as HTMLElement).closest('[data-sorteio]');
    if (!c) return;
    ev.stopPropagation();
    if (c.classList.contains('pronto')) sair();
  }
  raiz.addEventListener('click', tocar, true);
  void rodar();
  return { cancelar: sair };
}
