import { esc, manaHTML } from '../ui/cardtext';
import { aiStyleName, DEFAULT_AI_STYLE } from '../aiStyle';
import type { FPlayerStats } from '../forge/protocol';
import type { ReplaySummary } from '../replays';

/*
 * Minhas partidas (/partidas): o que a rota partidas da conta devolve, em HTML. Sem DOM, para os testes.
 * Os números e os filtros vêm prontos do servidor (AccountMatches); aqui só se escreve.
 */

export type Resultado = 'vitoria' | 'derrota' | 'empate' | 'queda';
export interface DeckDaPartida { id?: string; nome?: string; comandante?: string; cores?: string }
export interface Oponente { nome?: string; ia: boolean; /** Estilo do computador (src/aiStyle.ts). */ estilo?: string; deck?: string; comandante?: string; cores?: string; /** Dano que você causou a ele. */ dano?: number }
/** Os números da conta numa partida (somados nos jogos da série); as partidas de antes deles não os têm. */
export type Estatisticas = Omit<FPlayerStats, 'damageTo'>;
export interface Partida {
  id: string; quando: string; formato?: string; melhorDe?: 'bo1' | 'bo3'; modo?: 'ia' | 'rede'; ms?: number; fim?: string;
  resultado: Resultado; turnos: number; jogos: number; placar: number[]; deck: DeckDaPartida; oponentes: Oponente[]; estatisticas?: Estatisticas;
}
export interface Grupo { partidas: number; vitorias: number }
export interface Numeros {
  partidas: number; vitorias: number; derrotas: number; empates: number; duracaoMedia?: number;
  sequencia?: { resultado: 'vitoria' | 'derrota'; n: number };
  porDeck: (Grupo & { id: string; nome?: string })[];
  porFormato: (Grupo & { formato: string })[];
  porOponente: (Grupo & { tipo: 'ia' | 'pessoas' })[];
  /** A soma dos números das partidas que os têm, e quantas são. */
  estatisticas?: { partidas: number; soma: Estatisticas };
}
export interface Resposta {
  total: number; pagina: number; porPagina: number; partidas: Partida[]; numeros: Numeros;
  filtros: { formatos: string[]; decks: { id: string; nome?: string }[] };
}
export type NomeDoFormato = (formato: string) => string;

export const PERIODOS: readonly { valor: string; nome: string }[] = [
  { valor: '', nome: 'Tudo' }, { valor: '7', nome: 'Últimos 7 dias' }, { valor: '30', nome: 'Últimos 30 dias' }, { valor: '90', nome: 'Últimos 3 meses' },
];

/** "18 min", "1 h 05 min"; menos de um minuto vira "menos de 1 min". */
export function duracao(ms: number) {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'menos de 1 min';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

/** "31/10/2026, 21:14", no fuso de quem lê. */
export const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** 60%; sem partidas, um traço. */
export const taxa = (g: Grupo) => g.partidas ? `${Math.round(100 * g.vitorias / g.partidas)}%` : '—';

/** As cores do deck em símbolos de mana ("GR" → {G}{R}). */
export const coresHTML = (cores?: string) => cores ? manaHTML([...cores].map(c => `{${c}}`).join('')) : '';

const RESULTADO: Record<Resultado, string> = { vitoria: 'Vitória', derrota: 'Derrota', empate: 'Empate', queda: 'Sem vencedor' };

/** Quem estava do outro lado: "Computador" ou o nome digitado na sala. */
export const nomeDoOponente = (o: Oponente) => o.ia ? `Computador${o.estilo && o.estilo !== DEFAULT_AI_STYLE && aiStyleName(o.estilo) ? ` ${aiStyleName(o.estilo).toLowerCase()}` : ''}` : o.nome || 'Jogador';
const deckDoOponente = (o: Oponente) => o.comandante || o.deck || '';

export function sequenciaTexto(s?: Numeros['sequencia']) {
  if (!s) return '';
  if (s.n === 1) return s.resultado === 'vitoria' ? 'Venceu a última' : 'Perdeu a última';
  return `${s.n} ${s.resultado === 'vitoria' ? 'vitórias' : 'derrotas'} seguidas`;
}

/** O detalhe do resultado: placar da melhor de três ou o motivo, quando ajuda. */
function detalhe(p: Partida) {
  if (p.resultado === 'queda') return 'a partida caiu e ninguém voltou';
  const extra: string[] = [];
  if (p.jogos > 1 && p.placar.length === 2) extra.push(`${p.placar[0]} a ${p.placar[1]}`);
  if (p.fim === 'concedida') extra.push('por desistência');
  return extra.join(', ');
}

/** Os números da partida numa linha: o dano sempre, o resto só quando passou de zero. */
const NUMEROS: { key: keyof Estatisticas; um: string; varios: string; sempre?: boolean }[] = [
  { key: 'damage', um: 'de dano causado', varios: 'de dano causado', sempre: true },
  { key: 'removals', um: 'remoção', varios: 'remoções' },
  { key: 'counters', um: 'anulação', varios: 'anulações' },
  { key: 'kills', um: 'criatura eliminada em combate', varios: 'criaturas eliminadas em combate' },
];
export function numerosDaPartida(e?: Estatisticas) {
  if (!e) return '';
  return NUMEROS.filter(n => n.sempre || (e[n.key] ?? 0) > 0).map(n => { const v = e[n.key] ?? 0; return `${v} ${v === 1 ? n.um : n.varios}`; }).join(' · ');
}

/** O link da repetição, para a partida guardada neste aparelho. */
const reverHTML = (id: string) => `<a class="pt-rever" href="/rever?id=${encodeURIComponent(id)}">Rever</a>`;

/** `rever`: a partida está guardada neste aparelho e dá para rever. */
export function partidaHTML(p: Partida, nomeDoFormato: NomeDoFormato, rever = false) {
  const meu = p.deck.comandante || p.deck.nome || 'Deck sem nome';
  // Com mais de um oponente, quanto dano você causou em cada um.
  const varios = p.oponentes.length > 1 && !!p.estatisticas;
  const contra = p.oponentes.map(o => {
    const deck = deckDoOponente(o);
    const dano = varios ? ` <small class="pt-dano">· levou ${o.dano ?? 0} de dano seu</small>` : '';
    return `<li>${coresHTML(o.cores)}<span><strong>${esc(nomeDoOponente(o))}</strong>${deck ? ` <small>${esc(deck)}</small>` : ''}${dano}</span></li>`;
  }).join('');
  const numeros = numerosDaPartida(p.estatisticas);
  const sobre = [p.formato ? nomeDoFormato(p.formato) : '', p.melhorDe === 'bo3' ? 'melhor de três' : '',
    p.turnos ? `${p.turnos} ${p.turnos === 1 ? 'turno' : 'turnos'}` : '', p.ms ? duracao(p.ms) : ''].filter(Boolean);
  const extra = detalhe(p);
  return `<li class="pt-partida r-${p.resultado}">
    <div class="pt-resultado"><strong>${RESULTADO[p.resultado]}</strong>${extra ? `<small>${esc(extra)}</small>` : ''}</div>
    <div class="pt-lados">
      <p class="pt-meu">${coresHTML(p.deck.cores)}<span><strong>${esc(meu)}</strong>${p.deck.comandante && p.deck.nome ? ` <small>${esc(p.deck.nome)}</small>` : ''}</span></p>
      <p class="pt-contra">contra</p>
      <ul class="pt-oponentes">${contra}</ul>
    </div>${numeros ? `
    <p class="pt-stats">${esc(numeros)}</p>` : ''}
    <p class="pt-sobre"><time datetime="${esc(p.quando)}">${esc(quando(p.quando))}</time>${sobre.length ? `<span>${esc(sobre.join(' · '))}</span>` : ''}${rever ? reverHTML(p.id) : ''}</p>
  </li>`;
}

/** O resultado de uma partida guardada, pelo último jogo: a gravação só sabe quem venceu o jogo em que parou. */
export function resultadoGravado(g: Pick<ReplaySummary, 'finished' | 'winner' | 'players' | 'you'>) {
  if (!g.finished) return 'Não terminou';
  const eu = g.players.find(p => p.id === g.you)?.name;
  return !g.winner ? 'Empate' : g.winner === eu ? 'Vitória' : 'Derrota';
}

/** As partidas guardadas neste aparelho (as últimas, com ou sem conta), cada uma com Rever e Apagar. */
export function gravadasHTML(lista: ReplaySummary[], nomeDoFormato: NomeDoFormato, limite: number) {
  const itens = lista.map(g => {
    const outros = g.players.filter(p => p.id !== g.you).map(p => p.ai ? 'Computador' : p.name || 'Jogador');
    const sobre = [g.format ? nomeDoFormato(g.format) : '', g.turns ? `${g.turns} ${g.turns === 1 ? 'turno' : 'turnos'}` : ''].filter(Boolean).join(' · ');
    const iso = new Date(g.startedAt).toISOString();
    const classe = ({ 'Vitória': 'r-vitoria', 'Derrota': 'r-derrota' } as Record<string, string>)[resultadoGravado(g)] ?? 'r-queda';
    return `<li class="pt-gravada ${classe}">
      <div class="pt-resultado"><strong>${esc(resultadoGravado(g))}</strong></div>
      <p class="pt-gravada-quem">contra <strong>${esc(outros.join(', ') || 'ninguém')}</strong>${sobre ? ` <small>${esc(sobre)}</small>` : ''}</p>
      <p class="pt-sobre"><time datetime="${esc(iso)}">${esc(quando(iso))}</time><span class="pt-acoes">${reverHTML(g.id)}<button type="button" class="pt-apagar" data-apagar="${esc(g.id)}" aria-label="Apagar a partida de ${esc(quando(iso))}">Apagar</button></span></p>
    </li>`;
  }).join('');
  return `<h2 class="pt-titulo" id="gravadas" tabindex="-1">Gravadas neste aparelho <small>${lista.length}</small></h2>
    <p class="pt-nota">As últimas ${limite} partidas que você jogou neste aparelho, com ou sem conta, para rever lance a lance. Só aparece o que você viu na hora. A mais antiga sai quando entra outra.</p>
    ${lista.length ? `<ol class="pt-lista">${itens}</ol>` : '<p class="vis-empty">Nenhuma partida gravada ainda. A próxima que você jogar aparece aqui.</p>'}`;
}

function grupoHTML(titulo: string, linhas: { nome: string; g: Grupo }[]) {
  if (!linhas.length) return '';
  return `<section class="pt-grupo"><h3>${esc(titulo)}</h3><table><thead><tr><th scope="col"><span class="sr-only">${esc(titulo)}</span></th><th scope="col">Partidas</th><th scope="col">Vitórias</th><th scope="col">Taxa</th></tr></thead><tbody>${
    linhas.map(l => `<tr><th scope="row">${esc(l.nome)}</th><td>${l.g.partidas}</td><td>${l.g.vitorias}</td><td>${taxa(l.g)}</td></tr>`).join('')}</tbody></table></section>`;
}

/** "4,5": uma casa decimal, só quando ajuda. */
export const media = (soma: number, partidas: number) => (Math.round(10 * soma / partidas) / 10).toLocaleString('pt-BR');

const MEDIAS: { key: keyof Estatisticas; nome: string }[] = [
  { key: 'damage', nome: 'Dano causado' }, { key: 'damageTaken', nome: 'Dano recebido' }, { key: 'removals', nome: 'Remoções' },
  { key: 'counters', nome: 'Anulações' }, { key: 'kills', nome: 'Criaturas eliminadas em combate' }, { key: 'draws', nome: 'Cartas compradas' },
];

/** A média dos números por partida, só das partidas que os têm (as de antes deles ficam de fora). */
function mediasHTML(e?: Numeros['estatisticas']) {
  if (!e?.partidas) return '';
  const linhas = MEDIAS.map(m => `<tr><th scope="row">${esc(m.nome)}</th><td>${media(e.soma[m.key] ?? 0, e.partidas)}</td></tr>`).join('');
  return `<section class="pt-grupo"><h3>Média por partida</h3><table><thead><tr><th scope="col"><span class="sr-only">Número</span></th><th scope="col">Média</th></tr></thead><tbody>${linhas}</tbody></table>`
    + `<p class="pt-nota">De ${e.partidas} ${e.partidas === 1 ? 'partida' : 'partidas'} com os números registrados.</p></section>`;
}

/** Os números do alto e as taxas por deck, formato e oponente. */
export function numerosHTML(n: Numeros, nomeDoFormato: NomeDoFormato) {
  const cartao = (valor: string, rotulo: string) => `<div class="pt-cartao"><strong>${esc(valor)}</strong><span>${esc(rotulo)}</span></div>`;
  const cartoes = [
    cartao(String(n.partidas), n.partidas === 1 ? 'partida' : 'partidas'),
    cartao(String(n.vitorias), n.vitorias === 1 ? 'vitória' : 'vitórias'),
    cartao(taxa(n), 'taxa de vitória'),
    n.duracaoMedia ? cartao(duracao(n.duracaoMedia), 'duração média') : '',
    n.sequencia ? cartao(sequenciaTexto(n.sequencia), 'sequência atual') : '',
  ].join('');
  const grupos = [
    grupoHTML('Por deck', n.porDeck.map(g => ({ nome: g.nome || 'Deck sem nome', g }))),
    grupoHTML('Por formato', n.porFormato.map(g => ({ nome: nomeDoFormato(g.formato), g }))),
    grupoHTML('Por oponente', n.porOponente.map(g => ({ nome: g.tipo === 'ia' ? 'Contra o computador' : 'Contra pessoas', g }))),
    mediasHTML(n.estatisticas),
  ].join('');
  return `<div class="pt-cartoes">${cartoes}</div>${n.partidas ? `<div class="pt-grupos">${grupos}</div>` : ''}`;
}

export interface Filtros { periodo: string; formato: string; deck: string }

/** Período, formato e deck; as opções são as que aparecem nas partidas da conta. */
export function filtrosHTML(f: Filtros, opcoes: Resposta['filtros'], nomeDoFormato: NomeDoFormato) {
  const opcao = (valor: string, nome: string, atual: string) => `<option value="${esc(valor)}"${valor === atual ? ' selected' : ''}>${esc(nome)}</option>`;
  return `<label class="pt-filtro">Período<select class="input-field" data-filtro="periodo">${PERIODOS.map(p => opcao(p.valor, p.nome, f.periodo)).join('')}</select></label>`
    + `<label class="pt-filtro">Formato<select class="input-field" data-filtro="formato">${opcao('', 'Todos', f.formato)}${opcoes.formatos.map(x => opcao(x, nomeDoFormato(x), f.formato)).join('')}</select></label>`
    + `<label class="pt-filtro">Deck<select class="input-field" data-filtro="deck">${opcao('', 'Todos', f.deck)}${opcoes.decks.map(d => opcao(d.id, d.nome || 'Deck sem nome', f.deck)).join('')}</select></label>`;
}

/** A query da rota: só os filtros escolhidos. */
export function consulta(f: Filtros, pagina: number) {
  const q = new URLSearchParams();
  if (f.periodo) q.set('periodo', f.periodo);
  if (f.formato) q.set('formato', f.formato);
  if (f.deck) q.set('deck', f.deck);
  if (pagina) q.set('pagina', String(pagina));
  const s = q.toString();
  return s ? `partidas?${s}` : 'partidas';
}
