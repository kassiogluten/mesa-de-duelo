import { esc, manaHTML } from '../ui/cardtext';

/*
 * Minhas partidas (/partidas.html): o que a rota partidas da conta devolve, em HTML. Sem DOM, para os testes.
 * Os números e os filtros vêm prontos do servidor (AccountMatches); aqui só se escreve.
 */

export type Resultado = 'vitoria' | 'derrota' | 'empate' | 'queda';
export interface DeckDaPartida { id?: string; nome?: string; comandante?: string; cores?: string }
export interface Oponente { nome?: string; ia: boolean; deck?: string; comandante?: string; cores?: string }
export interface Partida {
  id: string; quando: string; formato?: string; melhorDe?: 'bo1' | 'bo3'; modo?: 'ia' | 'rede'; ms?: number; fim?: string;
  resultado: Resultado; turnos: number; jogos: number; placar: number[]; deck: DeckDaPartida; oponentes: Oponente[];
}
export interface Grupo { partidas: number; vitorias: number }
export interface Numeros {
  partidas: number; vitorias: number; derrotas: number; empates: number; duracaoMedia?: number;
  sequencia?: { resultado: 'vitoria' | 'derrota'; n: number };
  porDeck: (Grupo & { id: string; nome?: string })[];
  porFormato: (Grupo & { formato: string })[];
  porOponente: (Grupo & { tipo: 'ia' | 'pessoas' })[];
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
export const nomeDoOponente = (o: Oponente) => o.ia ? 'Computador' : o.nome || 'Jogador';
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

export function partidaHTML(p: Partida, nomeDoFormato: NomeDoFormato) {
  const meu = p.deck.comandante || p.deck.nome || 'Deck sem nome';
  const contra = p.oponentes.map(o => {
    const deck = deckDoOponente(o);
    return `<li>${coresHTML(o.cores)}<span><strong>${esc(nomeDoOponente(o))}</strong>${deck ? ` <small>${esc(deck)}</small>` : ''}</span></li>`;
  }).join('');
  const sobre = [p.formato ? nomeDoFormato(p.formato) : '', p.melhorDe === 'bo3' ? 'melhor de três' : '',
    p.turnos ? `${p.turnos} ${p.turnos === 1 ? 'turno' : 'turnos'}` : '', p.ms ? duracao(p.ms) : ''].filter(Boolean);
  const extra = detalhe(p);
  return `<li class="pt-partida r-${p.resultado}">
    <div class="pt-resultado"><strong>${RESULTADO[p.resultado]}</strong>${extra ? `<small>${esc(extra)}</small>` : ''}</div>
    <div class="pt-lados">
      <p class="pt-meu">${coresHTML(p.deck.cores)}<span><strong>${esc(meu)}</strong>${p.deck.comandante && p.deck.nome ? ` <small>${esc(p.deck.nome)}</small>` : ''}</span></p>
      <p class="pt-contra">contra</p>
      <ul class="pt-oponentes">${contra}</ul>
    </div>
    <p class="pt-sobre"><time datetime="${esc(p.quando)}">${esc(quando(p.quando))}</time>${sobre.length ? `<span>${esc(sobre.join(' · '))}</span>` : ''}</p>
  </li>`;
}

function grupoHTML(titulo: string, linhas: { nome: string; g: Grupo }[]) {
  if (!linhas.length) return '';
  return `<section class="pt-grupo"><h3>${esc(titulo)}</h3><table><thead><tr><th scope="col"><span class="sr-only">${esc(titulo)}</span></th><th scope="col">Partidas</th><th scope="col">Vitórias</th><th scope="col">Taxa</th></tr></thead><tbody>${
    linhas.map(l => `<tr><th scope="row">${esc(l.nome)}</th><td>${l.g.partidas}</td><td>${l.g.vitorias}</td><td>${taxa(l.g)}</td></tr>`).join('')}</tbody></table></section>`;
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
