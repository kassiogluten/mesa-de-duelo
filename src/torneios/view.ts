import { esc } from '../ui/cardtext';

/*
 * Torneios (/torneios.html): o que a rota /api/torneios/ devolve, em HTML. Sem DOM, para os testes.
 * A classificação e os desempates vêm prontos do servidor (Tournament.java); aqui só se escreve.
 */

export type Estado = 'inscricoes' | 'andamento' | 'encerrado';
export interface Placar { a: number; b: number; empates: number }
export interface Mesa { mesa: number; a: number; /** 0: bye. */ b: number; resultado: Placar | null }
export interface Rodada { numero: number; mesas: Mesa[] }
export interface Jogador { id: number; nome: string; /** 2: entrou atrasado, com derrota na 1ª rodada. */ entrou?: number; /** Saiu depois dessa rodada. */ saiu?: number }
export interface Linha { posicao: number; id: number; pontos: number; vitorias: number; derrotas: number; empates: number; omw?: number; gw?: number; ogw?: number }
export interface Torneio {
  id: string; nome: string; formato?: string; organizador?: string; criadoEm: string; estado: Estado;
  rodadas: number; rodadasEscolhidas: boolean; rodadasSugeridas: number; inscricoesAbertas: boolean; organizadorSouEu: boolean;
  jogadores: Jogador[]; rodadasJogadas: Rodada[]; classificacao: Linha[];
}
export interface Resumo { id: string; nome: string; formato?: string; criadoEm: string; estado: Estado; jogadores: number; rodada: number; rodadas: number }

/** Os placares que o organizador escolhe, do lado do primeiro jogador da mesa. */
export const PLACARES: readonly Placar[] = [
  { a: 2, b: 0, empates: 0 }, { a: 2, b: 1, empates: 0 }, { a: 1, b: 0, empates: 0 }, { a: 1, b: 1, empates: 0 },
  { a: 0, b: 0, empates: 0 }, { a: 0, b: 1, empates: 0 }, { a: 1, b: 2, empates: 0 }, { a: 0, b: 2, empates: 0 },
];

/** "2-1"; com jogos empatados, "1-1-1". */
export const placarTexto = (p: Placar) => p.empates ? `${p.a}-${p.b}-${p.empates}` : `${p.a}-${p.b}`;
const mesmoPlacar = (x: Placar | null, y: Placar) => !!x && x.a === y.a && x.b === y.b && x.empates === y.empates;

/** 66,7%; sem oponentes, um traço. */
export const pct = (x?: number) => x === undefined ? '—' : `${(100 * x).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

const ESTADO: Record<Estado, string> = { inscricoes: 'Inscrições', andamento: 'Em andamento', encerrado: 'Encerrado' };

/** "Rodada 2 de 4", "Inscrições abertas" ou "Encerrado depois de 4 rodadas". */
export function andamentoTexto(t: Pick<Torneio, 'estado' | 'rodadas' | 'rodadasJogadas'>) {
  const n = t.rodadasJogadas.length;
  if (t.estado === 'inscricoes') return `Inscrições abertas · ${t.rodadas} ${t.rodadas === 1 ? 'rodada' : 'rodadas'}`;
  if (t.estado === 'encerrado') return `Encerrado depois de ${n} ${n === 1 ? 'rodada' : 'rodadas'}`;
  return `Rodada ${n} de ${t.rodadas}`;
}

/** O nome do jogador pelo id da mesa. */
const nomeDe = (t: Torneio, id: number) => t.jogadores.find(j => j.id === id)?.nome ?? 'Jogador';

// ---------- Meus torneios ----------

export function criarHTML() {
  return `<form class="tn-criar" data-criar>
    <h2>Novo torneio</h2>
    <label class="tn-campo"><span>Nome</span><input name="nome" required maxlength="60" placeholder="Sexta do Pauper" autocomplete="off"></label>
    <label class="tn-campo"><span>Formato <small>(opcional)</small></span><input name="formato" maxlength="30" placeholder="Commander, Pauper, Modern…" autocomplete="off"></label>
    <button type="submit" class="arena-btn primary">Criar torneio</button>
  </form>`;
}

export function listaHTML(torneios: Resumo[]) {
  if (!torneios.length) return '<p class="vis-empty">Você ainda não criou nenhum torneio.</p>';
  return `<ol class="tn-lista">${torneios.map(t => `<li><a class="tn-resumo e-${t.estado}" href="/torneios.html?id=${encodeURIComponent(t.id)}">
    <strong>${esc(t.nome)}</strong>
    <span>${[t.formato ? esc(t.formato) : '', `${t.jogadores} ${t.jogadores === 1 ? 'jogador' : 'jogadores'}`, esc(andamentoTexto({ estado: t.estado, rodadas: t.rodadas, rodadasJogadas: Array.from({ length: t.rodada }) as Rodada[] }))].filter(Boolean).join(' · ')}</span>
    <small>${ESTADO[t.estado]}</small>
  </a></li>`).join('')}</ol>`;
}

// ---------- Um torneio ----------

export function cabecalhoHTML(t: Torneio) {
  const sobre = [t.formato ? esc(t.formato) : '', t.organizador ? `organizado por ${esc(t.organizador)}` : ''].filter(Boolean).join(' · ');
  return `<div class="tn-cabecalho">
    <p class="tn-estado e-${t.estado}">${esc(andamentoTexto(t))}</p>
    <h1>${esc(t.nome)}</h1>
    ${sobre ? `<p class="tn-sobre">${sobre}</p>` : ''}
    <div class="tn-acoes">
      <button type="button" class="tn-btn" data-acao="copiar">Copiar link</button>
      ${t.organizadorSouEu ? '<button type="button" class="tn-btn" data-acao="editar" aria-expanded="false" aria-controls="tn-editar">Editar</button>' : ''}
    </div>
    ${t.organizadorSouEu ? editarHTML(t) : ''}
  </div>`;
}

function editarHTML(t: Torneio) {
  const minimo = Math.max(1, t.rodadasJogadas.length);
  return `<form class="tn-editar" id="tn-editar" data-editar hidden>
    <label class="tn-campo"><span>Nome</span><input name="nome" required maxlength="60" value="${esc(t.nome)}" autocomplete="off"></label>
    <label class="tn-campo"><span>Formato</span><input name="formato" maxlength="30" value="${esc(t.formato ?? '')}" autocomplete="off"></label>
    ${t.estado === 'encerrado' ? '' : `<label class="tn-campo tn-curto"><span>Rodadas</span><input name="rodadas" type="number" min="${minimo}" max="15" value="${t.rodadas}"></label>
    <p class="tn-nota">Sugestão para ${t.jogadores.length} ${t.jogadores.length === 1 ? 'jogador' : 'jogadores'}: ${t.rodadasSugeridas} ${t.rodadasSugeridas === 1 ? 'rodada' : 'rodadas'}.</p>`}
    <div class="tn-linha">
      <button type="submit" class="arena-btn primary">Salvar</button>
      <button type="button" class="tn-btn tn-perigo" data-acao="apagar">Apagar torneio</button>
    </div>
  </form>`;
}

/** As mesas de uma rodada; o organizador escolhe o placar ali mesmo. */
export function rodadaHTML(t: Torneio, r: Rodada, editavel: boolean) {
  const atual = r.numero === t.rodadasJogadas.length;
  return `<ol class="tn-mesas">${r.mesas.map(m => {
    if (!m.b) return `<li class="tn-mesa tn-bye"><span class="tn-num">Bye</span><p><strong>${esc(nomeDe(t, m.a))}</strong> <small>vitória sem oponente (2-0)</small></p></li>`;
    const a = esc(nomeDe(t, m.a)), b = esc(nomeDe(t, m.b));
    const res = m.resultado;
    const vence = res ? (res.a > res.b ? 'a' : res.b > res.a ? 'b' : '') : '';
    const lado = (quem: 'a' | 'b', nome: string) => `<strong class="${vence === quem ? 'tn-vence' : ''}">${nome}</strong>`;
    const botoes = `<div class="tn-placares" role="group" aria-label="Placar da mesa ${m.mesa}, do lado de ${a}">${PLACARES.map(p =>
      `<button type="button" class="tn-placar" data-placar="${r.numero}:${m.mesa}:${p.a}:${p.b}:${p.empates}" aria-pressed="${mesmoPlacar(res, p)}">${placarTexto(p)}</button>`).join('')}
      ${res && atual ? `<button type="button" class="tn-placar tn-limpar" data-limpar="${r.numero}:${m.mesa}" aria-label="Apagar o resultado da mesa ${m.mesa}">Apagar</button>` : ''}</div>`;
    // Com o placar lançado, os botões ficam recolhidos em Corrigir: a rodada fica fácil de ler.
    const escolha = !editavel ? '' : res ? `<details class="tn-corrigir"><summary>Corrigir</summary>${botoes}</details>` : botoes;
    return `<li class="tn-mesa${res ? ' tn-feita' : ''}">
      <span class="tn-num">Mesa ${m.mesa}</span>
      <p class="tn-confronto">${lado('a', a)} <span class="tn-resultado">${res ? placarTexto(res) : 'x'}</span> ${lado('b', b)}</p>
      ${escolha}
    </li>`;
  }).join('')}</ol>`;
}

/** O que o organizador faz agora: começar, sortear a próxima, desfazer o sorteio ou encerrar. */
export function proximoPassoHTML(t: Torneio) {
  if (!t.organizadorSouEu) return '';
  const rodadas = t.rodadasJogadas, atual = rodadas[rodadas.length - 1];
  if (t.estado === 'encerrado') return `<div class="tn-passo"><button type="button" class="tn-btn" data-acao="reabrir">Reabrir para corrigir</button></div>`;
  if (!atual) {
    const podeComecar = t.jogadores.length >= 2;
    return `<div class="tn-passo"><button type="button" class="arena-btn primary" data-acao="sortear" ${podeComecar ? '' : 'disabled'}>Começar: sortear a 1ª rodada</button>
      <p class="tn-nota">${podeComecar ? `${t.rodadas} ${t.rodadas === 1 ? 'rodada' : 'rodadas'}${t.rodadasEscolhidas ? '' : ', pela quantidade de jogadores'}. Quem chegar depois do sorteio ainda entra, com derrota na 1ª rodada, até a 2ª ser sorteada.` : 'Inscreva ao menos 2 jogadores para começar.'}</p></div>`;
  }
  const faltam = atual.mesas.filter(m => !m.resultado).length;
  const semResultado = atual.mesas.every(m => !m.b || !m.resultado);
  const desfazer = semResultado ? `<button type="button" class="tn-btn" data-acao="desfazer" data-rodada="${atual.numero}">Desfazer o sorteio</button>` : '';
  if (faltam) return `<div class="tn-passo"><p class="tn-nota">Falta${faltam === 1 ? '' : 'm'} ${faltam} ${faltam === 1 ? 'resultado' : 'resultados'} para fechar a rodada ${atual.numero}.</p>${desfazer}</div>`;
  const ultima = rodadas.length >= t.rodadas;
  return `<div class="tn-passo">
    ${ultima ? '' : `<button type="button" class="arena-btn primary" data-acao="sortear">Sortear a rodada ${rodadas.length + 1}</button>`}
    <button type="button" class="${ultima ? 'arena-btn primary' : 'tn-btn'}" data-acao="encerrar">Encerrar o torneio</button>
    ${ultima ? '<p class="tn-nota">Todas as rodadas foram jogadas. Para mais uma, aumente as rodadas em Editar.</p>' : ''}
    ${desfazer}
  </div>`;
}

const DICAS = {
  omw: '% de vitórias dos oponentes: o 1º desempate',
  gw: '% de jogos ganhos: o 2º desempate',
  ogw: '% de jogos ganhos dos oponentes: o 3º desempate',
};

export function classificacaoHTML(t: Torneio) {
  if (!t.rodadasJogadas.length) return '<p class="vis-empty">A classificação aparece depois do sorteio da 1ª rodada.</p>';
  return `<div class="tn-tabela"><table>
    <thead><tr><th scope="col">#</th><th scope="col" class="tn-nome">Jogador</th><th scope="col">Pontos</th><th scope="col" title="Vitórias, derrotas e empates">V-D-E</th>
      <th scope="col" title="${DICAS.omw}"><abbr title="${DICAS.omw}">Op.</abbr></th><th scope="col" title="${DICAS.gw}"><abbr title="${DICAS.gw}">Jogos</abbr></th><th scope="col" title="${DICAS.ogw}"><abbr title="${DICAS.ogw}">Jogos op.</abbr></th></tr></thead>
    <tbody>${t.classificacao.map(l => {
      const j = t.jogadores.find(x => x.id === l.id);
      const marcas = [j?.entrou && j.entrou > 1 ? '<span class="tn-tag">atrasado</span>' : '', j?.saiu ? '<span class="tn-tag">saiu</span>' : ''].join('');
      return `<tr${j?.saiu ? ' class="tn-saiu"' : ''}><td>${l.posicao}</td><th scope="row" class="tn-nome">${esc(j?.nome ?? 'Jogador')}${marcas}</th><td><strong>${l.pontos}</strong></td>
        <td>${l.vitorias}-${l.derrotas}-${l.empates}</td><td>${pct(l.omw)}</td><td>${pct(l.gw)}</td><td>${pct(l.ogw)}</td></tr>`;
    }).join('')}</tbody>
  </table></div>
  <p class="tn-nota">Vitória vale 3 pontos, empate 1 e o bye conta como vitória por 2-0. Desempates, em ordem: % de vitórias dos oponentes (Op.), % de jogos ganhos (Jogos) e % de jogos ganhos dos oponentes (Jogos op.), com mínimo de 33%.</p>`;
}

export function jogadoresHTML(t: Torneio) {
  const dono = t.organizadorSouEu, comecou = t.rodadasJogadas.length > 0, sorteados = new Set(t.rodadasJogadas.flatMap(r => r.mesas.flatMap(m => [m.a, m.b])));
  const form = dono && t.inscricoesAbertas ? `<form class="tn-inscrever" data-inscrever>
      <label class="tn-campo"><span>Nome do jogador</span><input name="nome" required maxlength="40" autocomplete="off"></label>
      <button type="submit" class="arena-btn secondary">Inscrever</button>
    </form>${comecou ? '<p class="tn-nota">A 1ª rodada já foi sorteada: quem entra agora começa com uma derrota por 0-2 e é sorteado a partir da 2ª.</p>' : ''}` : '';
  const lista = t.jogadores.length ? `<ul class="tn-jogadores">${t.jogadores.map(j => {
    const acoes = !dono || t.estado === 'encerrado' ? ''
      : !sorteados.has(j.id) ? `<button type="button" class="tn-mini" data-tirar="${j.id}" aria-label="Tirar ${esc(j.nome)} da lista">Tirar</button>`
      : `<button type="button" class="tn-mini" data-${j.saiu ? 'voltar' : 'sair'}="${j.id}">${j.saiu ? 'Voltar ao torneio' : 'Sair do torneio'}</button>`;
    const marcas = [j.entrou && j.entrou > 1 ? '<span class="tn-tag">atrasado</span>' : '', j.saiu ? `<span class="tn-tag">saiu na rodada ${j.saiu}</span>` : ''].join('');
    return `<li${j.saiu ? ' class="tn-saiu"' : ''}><span>${esc(j.nome)}${marcas}</span>${acoes}</li>`;
  }).join('')}</ul>` : '<p class="vis-empty">Nenhum jogador inscrito ainda.</p>';
  return form + lista;
}

/** A página inteira de um torneio. */
export function torneioHTML(t: Torneio) {
  const rodadas = t.rodadasJogadas, atual = rodadas[rodadas.length - 1];
  const editavel = t.organizadorSouEu && t.estado !== 'encerrado';
  // Na rodada em andamento, as anteriores ficam embaixo; no fim, todas.
  const passadas = (t.estado === 'encerrado' ? rodadas : rodadas.slice(0, -1)).slice().reverse();
  return `${cabecalhoHTML(t)}
    ${proximoPassoHTML(t)}
    ${atual && t.estado !== 'encerrado' ? `<section class="tn-secao" aria-labelledby="tn-atual"><h2 class="pt-titulo" id="tn-atual">Rodada ${atual.numero}</h2>${rodadaHTML(t, atual, editavel)}</section>` : ''}
    <section class="tn-secao" aria-labelledby="tn-class"><h2 class="pt-titulo" id="tn-class">${t.estado === 'encerrado' ? 'Classificação final' : 'Classificação'}</h2>${classificacaoHTML(t)}</section>
    <section class="tn-secao" aria-labelledby="tn-jog"><h2 class="pt-titulo" id="tn-jog">Jogadores <small>${t.jogadores.length}</small></h2>${jogadoresHTML(t)}</section>
    ${passadas.length ? `<section class="tn-secao" aria-labelledby="tn-ant"><h2 class="pt-titulo" id="tn-ant">${t.estado === 'encerrado' ? 'Rodadas' : 'Rodadas anteriores'}</h2>
      ${passadas.map(r => `<details class="tn-anterior"><summary>Rodada ${r.numero}</summary>${rodadaHTML(t, r, editavel)}</details>`).join('')}</section>` : ''}`;
}
