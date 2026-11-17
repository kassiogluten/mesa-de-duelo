// HTML do Contador de vida: a configuração da partida e a mesa, com um painel girado para cada jogador.
import { esc } from '../ui/cardtext';
import { ICON_CLOSE, ICON_REFRESH } from '../ui/icons';
import {
  CORES, GIRO, LETAL_COMANDANTE, corPadrao, deltaVida, jogadorDe, mudancasDe, MAX_JOGADORES, MIN_JOGADORES, VIDAS, comandantesDe, derrota, donoDe, nomeComandante, nomeDe,
  textoEntrada, vistaDe, type Config, type Disposicao, type Mudanca, type Partida,
} from './state';

/** Coroa: o dano de comandante. */
const ICON_COMANDANTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5 8.2 12 12 5.5l3.8 6.5L20 8.5 18.4 18H5.6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M5.6 20.5h12.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="14.4" r="1.3" fill="currentColor"/></svg>';
export const ICON_CAVEIRA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.6 1.2 4.6 3 5.8V20h10v-3.2c1.8-1.2 3-3.2 3-5.8a8 8 0 0 0-8-8Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="9" cy="11.5" r="1.8" fill="currentColor"/><circle cx="15" cy="11.5" r="1.8" fill="currentColor"/><path d="M10.5 20v-2M13.5 20v-2" stroke="currentColor" stroke-width="1.6"/></svg>';

const radio = (name: string, value: number, atual: number, texto = String(value)) =>
  `<label class="cv-opcao"><input type="radio" name="${name}" value="${value}"${value === atual ? ' checked' : ''}><span>${texto}</span></label>`;

/** A linha da partida em andamento, em cima da configuração: o nome e a vida de cada um. */
export const andamentoHTML = (p: Partida) =>
  `<strong>Partida em andamento</strong> · ${p.jogadores.map((j, i) => `${esc(nomeDe(p, i))} ${j.vida}`).join(' · ')}`;

/** A configuração: quantos jogadores, vida inicial, dano de comandante e nome, cor e parceiro de cada um. */
export function configHTML(c: Config, emAndamento: Partida | null) {
  const n = c.jogadores.length;
  const jogadores = c.jogadores.map((j, i) => `
    <li class="cv-jog" style="--cor:${j.cor}">
      <button type="button" class="cv-cor" data-cor="${i}" aria-label="Cor de ${esc(nomeDe(c, i))}: trocar" title="Trocar a cor"></button>
      <input class="cv-nome-input" data-nome="${i}" value="${esc(j.nome)}" placeholder="Jogador ${i + 1}" maxlength="18" aria-label="Nome do jogador ${i + 1}" autocomplete="off">
      ${c.comandante ? `<label class="cv-parceiro"><input type="checkbox" data-parceiro="${i}"${j.parceiro ? ' checked' : ''}><span>Dois comandantes</span></label>` : ''}
    </li>`).join('');
  const andamento = emAndamento ? `
    <div class="cv-andamento">
      <p data-andamento>${andamentoHTML(emAndamento)}</p>
      <button type="button" class="arena-btn primary" data-continuar>Continuar</button>
    </div>` : '';
  return `${andamento}
    <form class="cv-form" data-config>
      <fieldset class="cv-grupo"><legend>Jogadores</legend>
        <div class="cv-seg">${Array.from({ length: MAX_JOGADORES - MIN_JOGADORES + 1 }, (_, i) => radio('n', i + MIN_JOGADORES, n)).join('')}</div>
      </fieldset>
      <fieldset class="cv-grupo"><legend>Vida inicial</legend>
        <div class="cv-seg">${VIDAS.map(v => radio('vida', v, c.vidaInicial)).join('')}</div>
      </fieldset>
      <label class="cv-chave"><input type="checkbox" data-comandante${c.comandante ? ' checked' : ''}>
        <span><strong>Dano de comandante</strong><small>Quem leva ${LETAL_COMANDANTE} de dano de um mesmo comandante perde.</small></span></label>
      <fieldset class="cv-grupo"><legend>Na ordem do turno</legend>
        <ol class="cv-jogadores">${jogadores}</ol>
      </fieldset>
      <button type="submit" class="arena-btn primary cv-comecar">${emAndamento ? 'Começar outra partida' : 'Começar partida'}</button>
    </form>`;
}

export const proximaCor = (atual: string, usadas: string[]) => {
  const i = CORES.indexOf(atual as typeof CORES[number]);
  for (let k = 1; k <= CORES.length; k++) {
    const c = corPadrao(i + k);
    if (!usadas.includes(c)) return c;
  }
  return atual;
};

/** As marcas de dano de comandante que o jogador já levou, na cor de quem causou. */
export function marcasHTML(p: Partida, j: number) {
  const cmd = jogadorDe(p, j).cmd;
  return Object.entries(cmd).filter(([, v]) => v > 0).map(([o, v]) =>
    `<span class="cv-marca${v >= LETAL_COMANDANTE ? ' letal' : ''}" style="--cor:${jogadorDe(p, donoDe(o)).cor}" title="${esc(nomeComandante(p, o))}">${v}</span>`).join('');
}

export function foraTexto(p: Partida, j: number) {
  const d = derrota(p, j);
  if (!d) return '';
  return d.motivo === 'vida' ? 'Sem vida' : `${LETAL_COMANDANTE} do comandante de ${nomeComandante(p, d.origem)}`;
}

/**
 * O dano de comandante que este jogador recebeu, num mapa da mesa visto do lugar dele: cada adversário no lugar em que
 * senta (com os dois comandantes lado a lado, se joga com parceiro) e o lugar dele marcado como "Você".
 */
function cmdHTML(p: Partida, d: Disposicao, j: number) {
  const nome = esc(nomeDe(p, j)), lado = d.lugares.find(l => l.jogador === j)!.lado;
  const vista = vistaDe(d, lado);
  const quadro = (origem: string) => {
    const dono = donoDe(origem), valor = jogadorDe(p, j).cmd[origem] ?? 0, quem = esc(nomeComandante(p, origem));
    return `<div class="cv-cmd${valor >= LETAL_COMANDANTE ? ' letal' : ''}" style="--cor:${jogadorDe(p, dono).cor}">
      <span class="cv-cmd-nome">${quem}</span>
      <output class="cv-cmd-valor" data-cmd-valor="${origem}">${valor}</output>
      <button type="button" class="cv-toque menos" data-acao="cmd-menos" data-origem="${origem}" aria-label="${nome}: tirar 1 do dano do comandante de ${quem}"><span>−</span></button>
      <button type="button" class="cv-toque mais" data-acao="cmd-mais" data-origem="${origem}" aria-label="${nome}: somar 1 ao dano do comandante de ${quem}"><span>+</span></button>
    </div>`;
  };
  const lugares = vista.lugares.map(l => {
    const area = `grid-area:${l.linha} / ${l.coluna} / span ${l.linhas} / span ${l.colunas}`;
    if (l.jogador === j) return `<div class="cv-cmd-eu" style="${area};--cor:${jogadorDe(p, j).cor}"><span>Você</span></div>`;
    const fora = derrota(p, l.jogador) ? ' fora' : '';
    return `<div class="cv-cmd-lugar${fora}" style="${area}">${comandantesDe(p, l.jogador).map(quadro).join('')}</div>`;
  }).join('');
  return `<div class="cv-cmd-vista">
      <p class="cv-cmd-titulo">Dano de comandante em <strong>${nome}</strong><span class="cv-vida-mini">vida <b data-vida-mini>${jogadorDe(p, j).vida}</b></span></p>
      <div class="cv-cmd-grade" style="grid-template-rows:repeat(${vista.linhas}, 1fr);grid-template-columns:repeat(${vista.colunas}, 1fr)">${lugares}</div>
      <button type="button" class="cv-pronto" data-acao="voltar">Pronto</button>
    </div>`;
}

/** Hora com segundos, para conferir uma mudança ("17:42:10"). */
const horaTexto = (t: number) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Há quanto tempo: "agora", "há 40 s", "há 3 min" e, passada uma hora, "às 17:42". */
export function quandoTexto(t: number, agora = Date.now()) {
  const s = Math.max(0, Math.round((agora - t) / 1000));
  if (s < 10) return 'agora';
  if (s < 60) return `há ${s} s`;
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  return `às ${new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

const deltaHTML = (e: Mudanca) => {
  const d = deltaVida(e);
  return `<b class="${d > 0 ? 'ganho' : 'perda'}">${d > 0 ? '+' : '−'}${Math.abs(d)}</b>`;
};

/** A última mudança na vida do jogador, no canto do painel: quanto e há quanto tempo. Sem nenhuma, vazio. */
export function ultimaHTML(p: Partida, j: number, agora = Date.now()) {
  const e = mudancasDe(p, j)[0];
  return e ? `${e.tipo === 'cmd' ? ICON_COMANDANTE : ''}${deltaHTML(e)}<span>${quandoTexto(e.t, agora)}</span>` : '';
}

/** As mudanças na vida deste jogador, no painel dele, com a hora de cada uma. */
function histHTML(p: Partida, j: number, agora = Date.now()) {
  const nome = esc(nomeDe(p, j));
  const linhas = mudancasDe(p, j).slice(0, 40).map(e => {
    const detalhe = e.tipo === 'vida' ? `${e.de} → ${e.para}` : `comandante de ${esc(nomeComandante(p, e.origem))} · vida ${e.vidaPara}`;
    return `<li>${deltaHTML(e)}<span>${detalhe}</span><time datetime="${new Date(e.t).toISOString()}">${horaTexto(e.t)} · ${quandoTexto(e.t, agora)}</time></li>`;
  }).join('');
  return `<div class="cv-hist-vista">
      <p class="cv-cmd-titulo">Mudanças de vida de <strong>${nome}</strong><span class="cv-vida-mini">vida <b>${jogadorDe(p, j).vida}</b></span></p>
      <ol class="cv-hist-painel">${linhas || '<li class="cv-hist-vazio">Nenhuma mudança ainda.</li>'}</ol>
      <button type="button" class="cv-pronto" data-acao="voltar">Pronto</button>
    </div>`;
}

/** O que o painel mostra: a vida, o dano de comandante recebido ou as mudanças de vida do jogador. */
export type Modo = 'vida' | 'cmd' | 'hist';

/** Um painel girado para o lado de quem joga, no modo escolhido. */
export function painelHTML(p: Partida, d: Disposicao, j: number, modo: Modo = 'vida') {
  const l = d.lugares.find(x => x.jogador === j)!;
  const jog = jogadorDe(p, j), nome = esc(nomeDe(p, j)), fora = foraTexto(p, j);
  const vida = `<div class="cv-vida-vista">
      <p class="cv-nome">${nome}</p>
      <button type="button" class="cv-ultima" data-acao="hist" data-ultima aria-label="Mudanças de vida de ${nome}">${ultimaHTML(p, j)}</button>
      <button type="button" class="cv-toque menos" data-acao="menos" aria-label="${nome}: tirar 1 de vida (segure para 10)"><span>−</span></button>
      <button type="button" class="cv-toque mais" data-acao="mais" aria-label="${nome}: somar 1 de vida (segure para 10)"><span>+</span></button>
      <output class="cv-vida" data-vida aria-label="Vida de ${nome}">${jog.vida}</output>
      <span class="cv-delta" data-delta aria-hidden="true"></span>
      <p class="cv-fora" data-fora>${fora ? `${ICON_CAVEIRA}<span>${esc(fora)}</span>` : ''}</p>
      ${p.config.comandante ? `<button type="button" class="cv-cmd-btn" data-acao="cmd" aria-label="Dano de comandante em ${nome}">${ICON_COMANDANTE}<span class="cv-marcas" data-marcas>${marcasHTML(p, j)}</span></button>` : ''}
    </div>`;
  return `<section class="cv-painel${fora ? ' fora' : ''}${modo !== 'vida' ? ` em-${modo}` : ''}" data-j="${j}" data-lado="${l.lado}" aria-label="${nome}"
      style="--cor:${jog.cor};--giro:${GIRO[l.lado]}deg;grid-area:${l.linha} / ${l.coluna} / span ${l.linhas} / span ${l.colunas}">
    <div class="cv-face">${modo === 'cmd' ? cmdHTML(p, d, j) : modo === 'hist' ? histHTML(p, j) : vida}</div>
  </section>`;
}

/** A mesa inteira: os painéis e o botão do meio. */
export function mesaHTML(p: Partida, d: Disposicao, modos: ReadonlyMap<number, Modo>) {
  return `<div class="cv-mesa" style="grid-template-rows:repeat(${d.linhas}, 1fr);grid-template-columns:repeat(${d.colunas}, 1fr)">
      ${p.jogadores.map((_, j) => painelHTML(p, d, j, modos.get(j))).join('')}
      <button type="button" class="cv-meio" data-acao="menu" style="--x:${d.meio.x};--y:${d.meio.y}" aria-label="Mesa: dados, histórico e partida" aria-haspopup="dialog"></button>
    </div>`;
}

/** As linhas do histórico, a mais nova em cima. */
export function historicoHTML(p: Partida) {
  if (!p.historico.length) return '<li class="cv-hist-vazio">Nada ainda. As mudanças de vida aparecem aqui.</li>';
  return p.historico.slice().reverse().slice(0, 60).map(e => {
    const cor = e.tipo === 'vida' || e.tipo === 'cmd' ? jogadorDe(p, e.jogador).cor : e.tipo === 'inicio' ? jogadorDe(p, e.vencedor).cor : 'var(--muted)';
    return `<li style="--cor:${cor}"><span>${esc(textoEntrada(p, e))}</span><time>${horaTexto(e.t)}</time></li>`;
  }).join('');
}

// ---------- Ícones da janela do meio (só esta tela os usa) ----------

/** Um ícone de traço, na cor do texto do botão. */
const linha = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_DESFAZER = linha('M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11');
const ICON_TELA_CHEIA = linha('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5');
const ICON_JOGADORES = linha('M9 11.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM3 20a6 6 0 0 1 12 0M16.5 11a2.6 2.6 0 1 0 0-5.2M17.5 14.3A5 5 0 0 1 21 19');
const ICON_SAIR = linha('M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10');

/** O d6 de marfim em perspectiva: 1 em cima, 2 à esquerda e 3 à direita. */
const ICON_D6 = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4 42 14 24 24 6 14z" fill="#f4f1ea"/><path d="M6 14l18 10v20L6 34z" fill="#d9d5cc"/><path d="M42 14 24 24v20l18-10z" fill="#b9b4a9"/>'
  + '<path d="M24 4 42 14v20L24 44 6 34V14zM6 14l18 10 18-10M24 24v20" fill="none" stroke="#6b6458" stroke-width="1.4" stroke-linejoin="round"/>'
  + '<g fill="#2a2622"><ellipse cx="24" cy="14" rx="3" ry="1.8"/><circle cx="10.5" cy="21" r="2"/><circle cx="19.5" cy="36.5" r="2"/><circle cx="37.5" cy="21.5" r="2"/><circle cx="33" cy="29" r="2"/><circle cx="28.5" cy="36.5" r="2"/></g></svg>';
/** O d20 de marfim de frente: as faces em volta e o 20 no triângulo do meio. */
const ICON_D20 = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 3 42 13.5v21L24 45 6 34.5v-21z" fill="#cfcac0"/><path d="M24 3 42 13.5 24 13zM24 3 6 13.5 24 13z" fill="#ebe7df"/><path d="M6 13.5 24 13 13 32zM6 13.5 13 32 6 34.5z" fill="#ddd8cf"/><path d="M42 34.5 35 32 24 45zM13 32h22L24 45z" fill="#b9b4a9"/><path d="M24 13 35 32H13z" fill="#f6f3ec"/>'
  + '<path d="M24 3 42 13.5v21L24 45 6 34.5v-21zM6 13.5 24 13l18 .5M24 3v10M13 32 24 13l11 19zM6 13.5 13 32 6 34.5M42 13.5 35 32l7 2.5M13 32l11 13 11-13" fill="none" stroke="#6b6458" stroke-width="1.2" stroke-linejoin="round"/>'
  + '<text x="24" y="28.5" text-anchor="middle" font-family="Outfit, sans-serif" font-weight="800" font-size="9" fill="#2a2622">20</text></svg>';
/** A moeda dourada com a coroa e o aro serrilhado. */
const ICON_MOEDA = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20" fill="#9a5a14"/><circle cx="24" cy="24" r="18" fill="#f2b54c"/><circle cx="24" cy="24" r="15.5" fill="none" stroke="#ffe2a0" stroke-width="1.2" stroke-dasharray="1.2 2.2"/>'
  + '<path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z" transform="translate(12.6 13.1) scale(.95)" fill="#6b3a08"/></svg>';

/** A camada do sorteio de quem começa, por cima do painel e virada para o jogador: o número dele e o que aconteceu. */
export const sorteioHTML = () =>
  '<div class="cv-sorteio rolando" data-sorteio role="status"><p class="cv-sorteio-titulo">Quem começa?</p><b class="cv-sorteio-num" data-sorteio-num></b><p class="cv-sorteio-texto" data-sorteio-texto></p></div>';

/** A janela do botão do meio: dados, histórico e a partida. */
export function menuHTML() {
  const dado = (lados: number, icone: string, nome: string, rotulo: string) =>
    `<button type="button" class="cv-dado-btn" data-rolar="${lados}" aria-label="${rotulo}">${icone}<span>${nome}</span></button>`;
  const acao = (attrs: string, icone: string, texto: string) => `<button type="button" class="cv-mini" ${attrs}>${icone}<span>${texto}</span></button>`;
  return `<dialog class="cv-menu" aria-label="Mesa">
    <form method="dialog" class="cv-menu-topo"><h2>Mesa</h2><button class="cv-fechar" aria-label="Fechar">${ICON_CLOSE}</button></form>
    <section class="cv-menu-sec">
      <h3>Dados</h3>
      <div class="cv-dados">
        ${dado(6, ICON_D6, 'd6', 'Rolar um d6')}
        ${dado(20, ICON_D20, 'd20', 'Rolar um d20')}
        ${dado(2, ICON_MOEDA, 'Moeda', 'Jogar a moeda')}
      </div>
      <button type="button" class="cv-sortear" data-sortear>${ICON_D20}<span><strong>Quem começa</strong><small>Todos rolam um d20 no seu lado da mesa; quem tirar mais escolhe quem começa</small></span></button>
    </section>
    <section class="cv-menu-sec">
      <div class="cv-hist-topo"><h3>Histórico</h3>${acao('data-desfazer', ICON_DESFAZER, 'Desfazer a última')}</div>
      <ol class="cv-hist" data-historico></ol>
    </section>
    <section class="cv-menu-sec cv-menu-acoes">
      ${acao('data-tela-cheia hidden', ICON_TELA_CHEIA, 'Tela cheia')}
      ${acao('data-reiniciar', ICON_REFRESH, 'Recomeçar')}
      ${acao('data-configurar aria-label="Trocar os jogadores"', ICON_JOGADORES, 'Jogadores')}
      <a class="cv-mini" href="/">${ICON_SAIR}<span>Sair</span></a>
    </section>
  </dialog>`;
}
