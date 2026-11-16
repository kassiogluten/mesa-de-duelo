// Regras do Contador de vida (partidas no papel): vida, dano de comandante, derrota, histórico com desfazer e dados, sem tela.

/** Cores dos jogadores, na ordem em que a configuração as oferece. */
export const CORES = ['#f2b54c', '#ec5a3f', '#63d68f', '#b48cf2', '#4cc3e0', '#f08ac0'] as const;
export const VIDAS = [20, 25, 30, 40] as const;
/** A cor de quem está na posição `i` (as cores dão a volta). */
export const corPadrao = (i: number): string => CORES[i % CORES.length]!;
export const MIN_JOGADORES = 2;
export const MAX_JOGADORES = 6;
/** Dano de um mesmo comandante que tira o jogador da partida. */
export const LETAL_COMANDANTE = 21;
/** Toques seguidos no mesmo jogador dentro deste tempo viram uma linha só no histórico. */
export const JUNTAR_MS = 2500;
const MAX_HISTORICO = 300;

interface JogadorConfig { nome: string; cor: string; parceiro: boolean }
export interface Config { vidaInicial: number; comandante: boolean; jogadores: JogadorConfig[] }

export interface Jogador extends JogadorConfig {
  vida: number;
  /** Dano de comandante recebido, por comandante de origem (`comandanteId`). */
  cmd: Record<string, number>;
}

export type Entrada =
  | { t: number; tipo: 'vida'; jogador: number; de: number; para: number }
  | { t: number; tipo: 'cmd'; jogador: number; origem: string; de: number; para: number; vidaDe: number; vidaPara: number }
  | { t: number; tipo: 'dado'; lados: number; resultado: number }
  | { t: number; tipo: 'moeda'; resultado: 'cara' | 'coroa' };

export interface Partida { config: Config; jogadores: Jogador[]; historico: Entrada[]; inicio: number }

/** Comandantes de um jogador: um, ou dois com parceiro (o segundo leva "b"). */
export const comandanteId = (jogador: number, segundo = false) => `${jogador}${segundo ? 'b' : ''}`;
export const comandantesDe = (p: Partida, jogador: number) =>
  p.jogadores[jogador]?.parceiro ? [comandanteId(jogador), comandanteId(jogador, true)] : [comandanteId(jogador)];
/** O jogador dono de um comandante. */
export const donoDe = (origem: string) => parseInt(origem, 10);

export const nomeDe = (p: Partida | Config, jogador: number) => p.jogadores[jogador]?.nome.trim() || `Jogador ${jogador + 1}`;
/** O jogador na posição `j`, que a tela só pede para quem existe. */
export const jogadorDe = (p: Partida, j: number): Jogador => p.jogadores[j]!;

export function configPadrao(n = 4): Config {
  return { vidaInicial: 40, comandante: true, jogadores: Array.from({ length: n }, (_, i) => ({ nome: '', cor: corPadrao(i), parceiro: false })) };
}

/** Acerta o número de jogadores mantendo os nomes e cores de quem já estava; quem entra pega a primeira cor livre. */
export function comJogadores(config: Config, n: number): Config {
  const total = Math.min(MAX_JOGADORES, Math.max(MIN_JOGADORES, n));
  const jogadores = config.jogadores.slice(0, total);
  while (jogadores.length < total) {
    const livre = CORES.find(c => !jogadores.some(j => j.cor === c)) ?? corPadrao(jogadores.length);
    jogadores.push({ nome: '', cor: livre, parceiro: false });
  }
  return { ...config, jogadores };
}

export function novaPartida(config: Config, agora = Date.now()): Partida {
  return {
    config,
    jogadores: config.jogadores.map(j => ({ ...j, vida: config.vidaInicial, cmd: {} })),
    historico: [],
    inicio: agora,
  };
}

/**
 * Leva para a partida em andamento o nome, a cor e o parceiro mudados na configuração, de cada jogador que existe nas
 * duas (o número de jogadores e a vida inicial só valem numa partida nova). Tirar o parceiro só vale enquanto o 2º
 * comandante não causou dano, para a vida já marcada continuar batendo com o dano.
 */
export function aplicarConfig(p: Partida, c: Config) {
  p.jogadores.forEach((j, i) => {
    const novo = c.jogadores[i];
    if (!novo) return;
    j.nome = novo.nome; j.cor = novo.cor;
    const segundo = comandanteId(i, true);
    if (novo.parceiro || !p.jogadores.some(o => (o.cmd[segundo] ?? 0) > 0)) j.parceiro = novo.parceiro;
    p.config.jogadores[i] = { nome: j.nome, cor: j.cor, parceiro: j.parceiro };
  });
}

/** A mesma mesa de volta ao começo: mesmos jogadores, vida inicial, sem dano nem histórico. */
export const reiniciar = (p: Partida, agora = Date.now()) => novaPartida(p.config, agora);

function registrar(p: Partida, e: Entrada) {
  p.historico.push(e);
  if (p.historico.length > MAX_HISTORICO) p.historico.splice(0, p.historico.length - MAX_HISTORICO);
}

/** Soma `delta` à vida. Toques seguidos no mesmo jogador juntam numa linha; se a soma volta ao começo, a linha some. */
export function mudarVida(p: Partida, jogador: number, delta: number, agora = Date.now()) {
  const j = p.jogadores[jogador];
  if (!j || !delta) return;
  const de = j.vida;
  j.vida += delta;
  const ultima = p.historico.at(-1);
  if (ultima?.tipo === 'vida' && ultima.jogador === jogador && agora - ultima.t < JUNTAR_MS) {
    ultima.para = j.vida; ultima.t = agora;
    if (ultima.para === ultima.de) p.historico.pop();
    return;
  }
  registrar(p, { t: agora, tipo: 'vida', jogador, de, para: j.vida });
}

/**
 * Soma `delta` ao dano que o comandante `origem` causou a `jogador`. Dano de comandante também é dano: a vida muda
 * junto, no sentido contrário. O dano nunca fica abaixo de zero.
 */
export function mudarComandante(p: Partida, jogador: number, origem: string, delta: number, agora = Date.now()) {
  const j = p.jogadores[jogador];
  if (!j || donoDe(origem) === jogador || !p.jogadores[donoDe(origem)]) return;
  const de = j.cmd[origem] ?? 0;
  const para = Math.max(0, de + delta);
  if (para === de) return;
  const vidaDe = j.vida;
  j.cmd[origem] = para;
  if (!para) delete j.cmd[origem];
  j.vida -= para - de;
  const ultima = p.historico.at(-1);
  if (ultima?.tipo === 'cmd' && ultima.jogador === jogador && ultima.origem === origem && agora - ultima.t < JUNTAR_MS) {
    ultima.para = para; ultima.vidaPara = j.vida; ultima.t = agora;
    if (ultima.para === ultima.de) p.historico.pop();
    return;
  }
  registrar(p, { t: agora, tipo: 'cmd', jogador, origem, de, para, vidaDe, vidaPara: j.vida });
}

/** Desfaz a última mudança de vida ou de dano de comandante (os dados ficam no histórico). Devolve o que desfez. */
export function desfazer(p: Partida): Entrada | null {
  for (let i = p.historico.length - 1; i >= 0; i--) {
    const e = p.historico[i]!;
    if (e.tipo === 'dado' || e.tipo === 'moeda') continue;
    const j = jogadorDe(p, e.jogador);
    if (e.tipo === 'vida') j.vida -= e.para - e.de;
    else {
      j.vida += e.vidaDe - e.vidaPara;
      if (e.de) j.cmd[e.origem] = e.de; else delete j.cmd[e.origem];
    }
    p.historico.splice(i, 1);
    return e;
  }
  return null;
}

/** Uma mudança na vida de um jogador: tocada no painel dele ou vinda do dano de comandante. */
export type Mudanca = Extract<Entrada, { tipo: 'vida' | 'cmd' }>;

/** Quanto a vida mudou nessa linha do histórico. */
export const deltaVida = (e: Mudanca) => e.tipo === 'vida' ? e.para - e.de : e.vidaPara - e.vidaDe;

/** As mudanças na vida de um jogador, a mais nova primeiro, para ele conferir se já tirou ou somou. */
export const mudancasDe = (p: Partida, j: number): Mudanca[] =>
  p.historico.filter((e): e is Mudanca => (e.tipo === 'vida' || e.tipo === 'cmd') && e.jogador === j).reverse();

export const podeDesfazer = (p: Partida) => p.historico.some(e => e.tipo === 'vida' || e.tipo === 'cmd');

/** Rola um dado (ou a moeda, com 2 lados) e guarda no histórico. `sorte` devolve um número em [0, 1). */
export function rolar(p: Partida, lados: number, sorte = Math.random, agora = Date.now()): Entrada {
  const n = Math.floor(sorte() * lados) + 1;
  const e: Entrada = lados === 2 ? { t: agora, tipo: 'moeda', resultado: n === 1 ? 'cara' : 'coroa' } : { t: agora, tipo: 'dado', lados, resultado: n };
  registrar(p, e);
  return e;
}

/** Por que o jogador está fora: vida zerada ou 21 de um mesmo comandante. Sem motivo, null. */
export function derrota(p: Partida, jogador: number): { motivo: 'vida' } | { motivo: 'cmd'; origem: string } | null {
  const j = jogadorDe(p, jogador);
  if (p.config.comandante) {
    const origem = Object.keys(j.cmd).find(o => (j.cmd[o] ?? 0) >= LETAL_COMANDANTE);
    if (origem) return { motivo: 'cmd', origem };
  }
  return j.vida <= 0 ? { motivo: 'vida' } : null;
}

/** O nome do comandante para a tela: o nome do dono e, com parceiro, qual dos dois. */
export function nomeComandante(p: Partida, origem: string) {
  const dono = donoDe(origem);
  if (!p.jogadores[dono]?.parceiro) return nomeDe(p, dono);
  return `${nomeDe(p, dono)} (${origem.endsWith('b') ? '2º' : '1º'})`;
}

/** Uma linha do histórico em português. */
export function textoEntrada(p: Partida, e: Entrada): string {
  if (e.tipo === 'dado') return `d${e.lados}: ${e.resultado}`;
  if (e.tipo === 'moeda') return `Moeda: ${e.resultado === 'cara' ? 'Cara' : 'Coroa'}`;
  const quem = nomeDe(p, e.jogador);
  if (e.tipo === 'vida') {
    const d = e.para - e.de;
    return `${quem}: ${d > 0 ? '+' : '−'}${Math.abs(d)} de vida (${e.de} → ${e.para})`;
  }
  const d = e.para - e.de;
  return `${quem}: ${d > 0 ? '+' : '−'}${Math.abs(d)} de dano do comandante de ${nomeComandante(p, e.origem)} (total ${e.para}, vida ${e.vidaPara})`;
}

/** Lê a partida guardada, conferindo o formato; o que não bater vira null. */
export function lerPartida(raw: unknown): Partida | null {
  const p = raw as Partida | null;
  if (!p || typeof p !== 'object' || !p.config || !Array.isArray(p.jogadores) || !Array.isArray(p.historico)) return null;
  if (p.jogadores.length < MIN_JOGADORES || p.jogadores.length > MAX_JOGADORES) return null;
  if (!p.jogadores.every(j => typeof j.vida === 'number' && j.cmd && typeof j.cmd === 'object')) return null;
  return p;
}

export function lerConfig(raw: unknown): Config | null {
  const c = raw as Config | null;
  if (!c || typeof c !== 'object' || typeof c.vidaInicial !== 'number' || !Array.isArray(c.jogadores)) return null;
  if (c.jogadores.length < MIN_JOGADORES || c.jogadores.length > MAX_JOGADORES) return null;
  return { vidaInicial: c.vidaInicial, comandante: !!c.comandante, jogadores: c.jogadores.map((j, i) => ({ nome: String(j.nome ?? ''), cor: CORES.includes(j.cor as typeof CORES[number]) ? j.cor : corPadrao(i), parceiro: !!j.parceiro })) };
}

// ---------- Lugares na tela ----------

/** De que lado da tela o jogador senta: o painel dele gira para ficar de frente. */
export type Lado = 'baixo' | 'cima' | 'esq' | 'dir';
export const GIRO: Record<Lado, number> = { baixo: 0, cima: 180, esq: 90, dir: -90 };
export interface Lugar { jogador: number; lado: Lado; linha: number; coluna: number; linhas: number; colunas: number }
export interface Disposicao { linhas: number; colunas: number; lugares: Lugar[]; /** Botão do meio, em fração da tela. */ meio: { x: number; y: number } }

/**
 * Onde cada jogador fica com o celular no meio da mesa, na ordem do turno (sentido horário, o 1 embaixo à esquerda).
 * Em pé, os jogadores ficam dos lados (e um embaixo quando o número é ímpar); deitado, em cima e embaixo.
 */
export function disposicao(n: number, deitado: boolean): Disposicao {
  const lugares: Lugar[] = [];
  const add = (jogador: number, lado: Lado, linha: number, coluna: number, linhas = 1, colunas = 1) => lugares.push({ jogador, lado, linha, coluna, linhas, colunas });
  if (deitado || n === 2) {
    // Duas fileiras: o 1 embaixo à esquerda, os de cima da esquerda para a direita, os de baixo voltando da direita.
    const baixo = Math.ceil(n / 2), cima = n - baixo, colunas = baixo * cima;
    let j = 0;
    add(j++, 'baixo', 2, 1, 1, colunas / baixo);
    for (let i = 0; i < cima; i++) add(j++, 'cima', 1, 1 + i * (colunas / cima), 1, colunas / cima);
    for (let i = baixo - 1; i >= 1; i--) add(j++, 'baixo', 2, 1 + i * (colunas / baixo), 1, colunas / baixo);
    return { linhas: 2, colunas, lugares, meio: { x: 0.5, y: 0.5 } };
  }
  // Em pé: duas colunas giradas para os lados e, com número ímpar, um painel embaixo.
  const lado = Math.floor(n / 2), sobra = n % 2, linhas = lado + sobra;
  let j = 0;
  if (sobra) add(j++, 'baixo', linhas, 1, 1, 2);
  for (let i = lado; i >= 1; i--) add(j++, 'esq', i, 1);
  for (let i = 1; i <= lado; i++) add(j++, 'dir', i, 2);
  return { linhas, colunas: 2, lugares, meio: { x: 0.5, y: lado / linhas / 2 } };
}

/**
 * A mesa vista do lugar de quem senta no lado `lado`: a mesma disposição girada para ele, com quem está à frente em
 * cima, quem está à esquerda à esquerda. É o mapa da tela do dano de comandante, para achar de quem foi o dano pelo lugar.
 */
export function vistaDe(d: Disposicao, lado: Lado): Pick<Disposicao, 'linhas' | 'colunas' | 'lugares'> {
  const girar = (l: Lugar): Lugar => {
    const fimLinha = l.linha + l.linhas - 1, fimColuna = l.coluna + l.colunas - 1;
    switch (lado) {
      case 'baixo': return l;
      case 'cima': return { ...l, linha: d.linhas - fimLinha + 1, coluna: d.colunas - fimColuna + 1 };
      // Sentado à esquerda da tela, olhando para a direita: a frente dele é a direita da tela e a esquerda dele, o alto.
      case 'esq': return { ...l, linha: d.colunas - fimColuna + 1, coluna: l.linha, linhas: l.colunas, colunas: l.linhas };
      // Sentado à direita, olhando para a esquerda: a frente é a esquerda da tela e a esquerda dele, o pé.
      case 'dir': return { ...l, linha: l.coluna, coluna: d.linhas - fimLinha + 1, linhas: l.colunas, colunas: l.linhas };
    }
  };
  const deLado = lado === 'esq' || lado === 'dir';
  return { linhas: deLado ? d.colunas : d.linhas, colunas: deLado ? d.linhas : d.colunas, lugares: d.lugares.map(girar) };
}
