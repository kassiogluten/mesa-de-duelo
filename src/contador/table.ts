// A mesa do Contador de vida: toques nos painéis (tocar soma 1, segurar soma 10), o dano de comandante (com a coroa que se estampa no quadro), os golpes grandes na vida, os dados no meio da mesa, o sorteio de quem começa e a tela acesa.
import { GIRO, LETAL_COMANDANTE, PERTO_COMANDANTE, derrota, jogadorDe, disposicao, golpeGrande, mudarComandante, mudarVida, rolar, sortearInicio, type Entrada, type Partida } from './state';
import { mostrarSorteio, type SorteioNaMesa } from './startingRoll';
import { criarEfeitos3d } from './effects3d';
import type { Point } from '../ui/motionKit';
import { ICON_REFRESH } from '../ui/icons';
import { ICON_CAVEIRA, foraTexto, marcasHTML, mesaHTML, painelHTML, ultimaHTML, type Modo } from './view';
import { abrirMenu, type MenuAcoes } from './menu';
import { esc } from '../ui/cardtext';

/** Quanto tempo o dedo fica para o toque virar "segurar", que muda 10 de uma vez. */
const SEGURAR_MS = 450;
/** De quanto em quanto tempo o "há 2 min" da última mudança se atualiza. */
const RELOGIO_MS = 5000;
/** Quanto tempo o resultado do dado fica escrito no meio da mesa. */
const ROLAGEM_MS = 6000;
/** Quanto tempo o "+3" ao lado da vida fica depois do último toque. */
const DELTA_MS = 1800;

export interface Mesa { destruir(): void }

/**
 * Monta a mesa em `raiz` e cuida dela até `destruir`. `salvar` é chamado a cada mudança; as ações do menu do meio
 * (recomeçar, trocar jogadores) voltam para quem montou.
 */
export function montarMesa(raiz: HTMLElement, p: Partida, salvar: () => void, acoes: Omit<MenuAcoes, 'mudou' | 'rolar' | 'sortear'>): Mesa {
  const modos = new Map<number, Modo>();
  const deltas = new Map<number, { soma: number; timer: number }>();
  // A camada 3D cobre a janela inteira, fora da mesa (que se redesenha ao girar o celular).
  const efeitos = criarEfeitos3d(document.body);
  const deitada = matchMedia('(orientation: landscape)');
  let disp = disposicao(p.jogadores.length, deitada.matches);

  let sorteio: SorteioNaMesa | null = null;
  const desenhar = () => {
    sorteio?.cancelar(); sorteio = null;
    disp = disposicao(p.jogadores.length, deitada.matches);
    raiz.innerHTML = mesaHTML(p, disp, modos);
  };
  const painel = (j: number) => raiz.querySelector<HTMLElement>(`.cv-painel[data-j="${j}"]`)!;
  const redesenharPainel = (j: number) => { painel(j).outerHTML = painelHTML(p, disp, j, modos.get(j)); };

  /** Atualiza os números de um painel sem refazer os botões (o dedo pode estar segurando um deles). */
  const atualizar = (j: number, delta = 0): number => {
    const el = painel(j), jog = jogadorDe(p, j);
    el.classList.toggle('fora', !!derrota(p, j));
    const vida = el.querySelector<HTMLElement>('[data-vida]');
    if (vida) vida.textContent = String(jog.vida);
    const mini = el.querySelector<HTMLElement>('[data-vida-mini]');
    if (mini) mini.textContent = String(jog.vida);
    const ultima = el.querySelector<HTMLElement>('[data-ultima]');
    if (ultima) ultima.innerHTML = ultimaHTML(p, j);
    const marcas = el.querySelector<HTMLElement>('[data-marcas]');
    if (marcas) marcas.innerHTML = marcasHTML(p, j);
    const fora = el.querySelector<HTMLElement>('[data-fora]');
    const texto = foraTexto(p, j);
    if (fora && fora.textContent !== texto) fora.innerHTML = texto ? `${ICON_CAVEIRA}<span>${esc(texto)}</span>` : '';
    el.querySelectorAll<HTMLElement>('[data-cmd-valor]').forEach(o => {
      const v = jog.cmd[o.dataset.cmdValor!] ?? 0;
      o.textContent = String(v);
      o.closest('.cv-cmd')?.classList.toggle('letal', v >= LETAL_COMANDANTE);
      o.closest('.cv-cmd')?.classList.toggle('perto', v >= PERTO_COMANDANTE && v < LETAL_COMANDANTE);
    });
    return delta ? mostrarDelta(j, delta) : 0;
  };

  /** Mostra o "+3" somado ao lado da vida e devolve o nível do golpe grande, se a soma acabou de passar de 10, 20… */
  const mostrarDelta = (j: number, delta: number) => {
    const atual = deltas.get(j);
    if (atual) clearTimeout(atual.timer);
    const antes = atual?.soma ?? 0, soma = antes + delta, golpe = golpeGrande(antes, soma);
    const el = painel(j).querySelector<HTMLElement>('[data-delta]');
    const limpar = () => { deltas.delete(j); const e = painel(j).querySelector<HTMLElement>('[data-delta]'); if (e) { e.textContent = ''; e.className = 'cv-delta'; } };
    deltas.set(j, { soma, timer: window.setTimeout(limpar, DELTA_MS) });
    if (!el) return golpe;
    el.textContent = soma ? `${soma > 0 ? '+' : '−'}${Math.abs(soma)}` : '±0';
    el.className = `cv-delta ${soma > 0 ? 'ganho' : soma < 0 ? 'perda' : ''}`;
    // Reinicia o pulso a cada toque.
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    return golpe;
  };

  /** O painel treme com um clarão vermelho (perda) ou acende em verde (ganho), e a camada 3D solta o golpe ou a cura. */
  const marcarGolpe = (j: number, nivel: number) => {
    const el = painel(j), classe = nivel < 0 ? 'golpe' : 'cura';
    el.classList.remove('golpe', 'cura'); void el.offsetWidth; el.classList.add(classe);
    el.style.setProperty('--golpe', String(Math.min(3, Math.abs(nivel))));
    window.setTimeout(() => painel(j)?.classList.remove(classe), 800);
    const at = pontoDe(j);
    if (nivel < 0) { efeitos.golpe({ ...at, w: at.w / .45, h: at.h / .45 }, -nivel); navigator.vibrate?.(40); }
    else efeitos.cura({ ...at, w: at.w * 1.2, h: at.h * 1.2 }, giroDe(j));
  };
  const giroDe = (j: number) => GIRO[disp.lugares.find(l => l.jogador === j)?.lado ?? 'baixo'];

  /** Aplica o toque (ou um passo do segurar) do botão. */
  const aplicar = (botao: HTMLElement, passo: number) => {
    const j = Number(botao.closest<HTMLElement>('.cv-painel')!.dataset.j);
    const sinal = botao.classList.contains('mais') ? 1 : -1;
    const antes = jogadorDe(p, j).vida;
    const origem = botao.dataset.origem;
    const foraAntes = p.jogadores.map((_, i) => !!derrota(p, i));
    const cmdAntes = origem ? jogadorDe(p, j).cmd[origem] ?? 0 : 0;
    if (origem) mudarComandante(p, j, origem, sinal * passo);
    else mudarVida(p, j, sinal * passo);
    const golpe = atualizar(j, jogadorDe(p, j).vida - antes);
    salvar();
    if (origem) golpeDeComandante(botao, cmdAntes, jogadorDe(p, j).cmd[origem] ?? 0);
    fimDeJogo(foraAntes);
    // Quem acabou de sair já racha: o golpe grande fica para quem continua na partida.
    if (golpe > 0 || (golpe < 0 && !derrota(p, j))) marcarGolpe(j, golpe);
  };

  /**
   * Dano de comandante somado: o número do quadro salta em dourado e a coroa se estampa nele (e se parte em vermelho
   * no toque que chega a 21). Tirar dano não tem efeito.
   */
  const golpeDeComandante = (botao: HTMLElement, antes: number, agora: number) => {
    const quadro = botao.closest<HTMLElement>('.cv-cmd');
    if (!quadro || agora <= antes) return;
    const letal = agora >= LETAL_COMANDANTE && antes < LETAL_COMANDANTE;
    quadro.classList.remove('sobe', 'sobe-letal'); void quadro.offsetWidth;
    quadro.classList.add(letal ? 'sobe-letal' : 'sobe');
    // Toques seguidos não empilham coroas: uma por quadro a cada 350 ms (a do 21 sempre sai).
    const agoraMs = performance.now();
    if (!letal && agoraMs - (ultimaCoroa.get(quadro) ?? -1e9) < 350) return;
    ultimaCoroa.set(quadro, agoraMs);
    // Menor e acima do número, sobre o nome: o número que acabou de mudar continua à vista.
    const r = quadro.getBoundingClientRect(), lado = Math.min(r.width, r.height) * .42;
    efeitos.coroa({ cx: r.left + r.width / 2, cy: r.top + r.height * .19, w: lado, h: lado }, letal);
  };
  const ultimaCoroa = new WeakMap<HTMLElement, number>();

  /** O meio do painel, para os efeitos de quem sai e de quem vence. */
  const pontoDe = (j: number): Point => {
    const r = painel(j).getBoundingClientRect(), lado = Math.min(r.width, r.height) * .45;
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: lado, h: lado };
  };
  /** Quem acabou de sair racha; se sobrou um só, ele ganha o brasão. Desfazer ou corrigir não repete o efeito. */
  const fimDeJogo = (antes: boolean[]) => {
    const agora = p.jogadores.map((_, i) => !!derrota(p, i));
    agora.forEach((fora, i) => { if (fora && !antes[i]) efeitos.fora(pontoDe(i)); });
    const vivos = agora.flatMap((fora, i) => fora ? [] : [i]);
    if (vivos.length === 1 && antes.filter(f => !f).length > 1) efeitos.vence(pontoDe(vivos[0]!));
  };

  // O dado rola no meio da mesa; quando assenta, o resultado fica escrito ali, com "De novo".
  const rolagem = document.createElement('div');
  rolagem.className = 'cv-rolagem'; rolagem.hidden = true;
  rolagem.setAttribute('role', 'status');
  document.body.append(rolagem);
  let rolagemTimer = 0, rolagemVez = 0;
  const mostrarRolagem = (e: Entrada, lados: number) => {
    const valor = e.tipo === 'moeda' ? (e.resultado === 'cara' ? 'Cara' : 'Coroa') : e.tipo === 'dado' ? String(e.resultado) : '';
    rolagem.innerHTML = `<span>${lados === 2 ? 'Moeda' : `d${lados}`}</span><strong>${valor}</strong><button type="button" data-de-novo="${lados}">${ICON_REFRESH}<span>De novo</span></button>`;
    rolagem.hidden = false;
    rolagem.style.animation = 'none'; void rolagem.offsetWidth; rolagem.style.animation = '';
    clearTimeout(rolagemTimer);
    rolagemTimer = window.setTimeout(() => { rolagem.hidden = true; }, ROLAGEM_MS);
  };
  const rolarDado = async (lados: number) => {
    const vez = ++rolagemVez;
    rolagem.hidden = true;
    const e = rolar(p, lados);
    salvar();
    const assenta = await efeitos.rolar(e);
    if (vez !== rolagemVez) return;
    if (assenta === null) mostrarRolagem(e, lados);
    else rolagemTimer = window.setTimeout(() => { if (vez === rolagemVez) mostrarRolagem(e, lados); }, assenta);
  };
  /** Quem começa: o sorteio vai para o histórico e cada painel (de quem ainda está na partida) rola o seu d20. */
  const sortear = () => {
    const e = sortearInicio(p);
    if (!e) return;
    salvar();
    // O sorteio aparece por cima da vida: quem estava no dano de comandante ou no histórico volta para ela.
    if (modos.size) { modos.clear(); desenhar(); }
    sorteio?.cancelar();
    sorteio = mostrarSorteio(raiz, p, disp, e, efeitos, pontoDe);
  };
  rolagem.addEventListener('click', ev => {
    const botao = (ev.target as HTMLElement).closest<HTMLElement>('[data-de-novo]');
    if (botao) void rolarDado(Number(botao.dataset.deNovo));
  });

  // Tocar muda 1; segurar muda 10, uma vez só (para outros 10, segure de novo).
  let segurando: { botao: HTMLElement; timer: number; segurou: boolean; id: number } | null = null;
  const soltar = () => { if (segurando) clearTimeout(segurando.timer); segurando = null; };
  const onDown = (e: PointerEvent) => {
    const botao = (e.target as HTMLElement).closest<HTMLElement>('.cv-toque');
    if (!botao || e.button > 0) return;
    soltar();
    const s = { botao, segurou: false, id: e.pointerId, timer: 0 };
    s.timer = window.setTimeout(() => { s.segurou = true; aplicar(botao, 10); navigator.vibrate?.(15); }, SEGURAR_MS);
    segurando = s;
  };
  const onUp = (e: PointerEvent) => {
    if (!segurando || segurando.id !== e.pointerId) return;
    const { botao, segurou } = segurando;
    soltar();
    if (!segurou && (e.target as HTMLElement).closest('.cv-toque') === botao) aplicar(botao, 1);
  };
  const onCancel = (e: PointerEvent) => { if (segurando?.id === e.pointerId) soltar(); };

  const onClick = (e: MouseEvent) => {
    const alvo = (e.target as HTMLElement).closest<HTMLElement>('[data-acao]');
    if (!alvo) return;
    const acao = alvo.dataset.acao!;
    // Pelo teclado (Enter ou espaço) o toque chega como clique sem ponteiro; com o dedo, quem soma é o pointerup.
    if (alvo.classList.contains('cv-toque')) { if (e.detail === 0) aplicar(alvo, 1); return; }
    const j = Number(alvo.closest<HTMLElement>('.cv-painel')?.dataset.j);
    if (acao === 'cmd' || acao === 'hist') { modos.set(j, acao); redesenharPainel(j); painel(j).querySelector<HTMLElement>('.cv-pronto')?.focus(); }
    else if (acao === 'voltar') {
      const era = modos.get(j);
      modos.delete(j); redesenharPainel(j);
      painel(j).querySelector<HTMLElement>(era === 'hist' ? '.cv-ultima' : '.cv-cmd-btn')?.focus();
    }
    else if (acao === 'menu') abrirMenu(p, { ...acoes, mudou: () => { desenhar(); salvar(); }, rolar: lados => { void rolarDado(lados); }, sortear });
  };
  // Segurar o dedo não abre o menu do navegador nem seleciona o número.
  const semMenu = (e: Event) => { if ((e.target as HTMLElement).closest('.cv-painel')) e.preventDefault(); };

  raiz.addEventListener('pointerdown', onDown);
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onCancel);
  raiz.addEventListener('click', onClick);
  raiz.addEventListener('contextmenu', semMenu);
  deitada.addEventListener('change', desenhar);

  // A tela não apaga no meio da partida; o pedido cai quando a aba some e volta com ela.
  let trava: WakeLockSentinel | null = null;
  const acender = () => {
    if (document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
    navigator.wakeLock.request('screen').then(t => { trava = t; }, () => { /* sem permissão ou sem bateria: tudo bem */ });
  };
  document.addEventListener('visibilitychange', acender);
  acender();

  // O "há 2 min" anda sozinho.
  const relogio = window.setInterval(() => {
    raiz.querySelectorAll<HTMLElement>('[data-ultima]').forEach(el => {
      const j = Number(el.closest<HTMLElement>('.cv-painel')!.dataset.j);
      const html = ultimaHTML(p, j);
      if (el.innerHTML !== html) el.innerHTML = html;
    });
  }, RELOGIO_MS);

  desenhar();
  return {
    destruir() {
      soltar();
      clearInterval(relogio);
      clearTimeout(rolagemTimer); rolagemVez++;
      sorteio?.cancelar();
      rolagem.remove();
      efeitos.destruir();
      deltas.forEach(d => clearTimeout(d.timer));
      raiz.removeEventListener('pointerdown', onDown);
      removeEventListener('pointerup', onUp);
      removeEventListener('pointercancel', onCancel);
      raiz.removeEventListener('click', onClick);
      raiz.removeEventListener('contextmenu', semMenu);
      deitada.removeEventListener('change', desenhar);
      document.removeEventListener('visibilitychange', acender);
      trava?.release().catch(() => {});
      raiz.innerHTML = '';
    },
  };
}
