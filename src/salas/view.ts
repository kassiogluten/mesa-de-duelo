import type { PublicRoom } from '../forge/client';
import { esc } from '../ui/cardtext';
import { bracketsLabel } from '../ui/publicRooms';

/*
 * Página Salas (/salas.html, item 87): as salas públicas esperando jogadores e as partidas em andamento para assistir,
 * com filtros por formato e por situação. Entrar e assistir abrem a mesa pelo link da sala (?sala=CÓDIGO), o mesmo
 * caminho do convite: entra direto, com o deck lembrado se ele serve; senão sem deck, para escolher dentro da sala.
 */

export type Situacao = '' | 'esperando' | 'andamento';
export interface FiltrosSalas { formato: string; situacao: Situacao }

const FORMATO: Record<string, string> = { standard: 'Standard', pauper: 'Pauper', sacola50: 'Sacola 50', commander: 'Commander', oathbreaker: 'Oathbreaker', precon: 'Precon', free: 'Livre' };
export const nomeDoFormato = (f: string) => FORMATO[f] ?? f;

export const esperando = (r: PublicRoom) => !r.started && r.players < r.capacity;
export const emAndamento = (r: PublicRoom) => r.started;

/** "2 salas esperando · 3 partidas para assistir"; vazio sem nenhuma. */
export function contagemTexto(rooms: PublicRoom[]): string {
  const abertas = rooms.filter(esperando).length, vivas = rooms.filter(emAndamento).length;
  return [abertas ? `${abertas} ${abertas === 1 ? 'sala esperando' : 'salas esperando'}` : '', vivas ? `${vivas} ${vivas === 1 ? 'partida para assistir' : 'partidas para assistir'}` : ''].filter(Boolean).join(' · ');
}

export function filtrar(rooms: PublicRoom[], f: FiltrosSalas): PublicRoom[] {
  return rooms.filter(r => (esperando(r) || emAndamento(r))
    && (!f.formato || r.config.format === f.formato)
    && (f.situacao === 'esperando' ? esperando(r) : f.situacao === 'andamento' ? emAndamento(r) : true));
}

const linkSala = (code: string) => `/?sala=${encodeURIComponent(code)}`;

function cartao(r: PublicRoom): string {
  const titulo = r.computer ? `${r.host} contra o computador` : `Sala de ${r.host}`;
  const vivo = emAndamento(r);
  const detalhes = [nomeDoFormato(r.config.format), bracketsLabel(r),
    r.config.format === 'commander' || r.config.format === 'oathbreaker' || r.config.format === 'precon' ? '' : r.config.matchLength === 'bo3' ? 'Melhor de três' : 'Partida única',
    vivo ? (r.computer ? '' : `${r.players} jogadores`) : `${r.players}/${r.capacity} jogadores`,
    vivo && r.spectators ? `${r.spectators} assistindo` : ''].filter(Boolean);
  const acao = vivo ? 'Assistir' : 'Entrar';
  const rotulo = `${acao}: ${titulo}, ${detalhes.join(', ')}`;
  return `<li class="sl-sala${vivo ? ' viva' : ''}">
    <div class="sl-texto"><strong>${esc(titulo)}</strong><small>${esc(detalhes.join(' · '))}</small></div>
    <a class="arena-btn ${vivo ? 'secondary' : 'primary'} sl-acao" href="${linkSala(r.code)}" aria-label="${esc(rotulo)}">${acao}</a>
  </li>`;
}

/** Os filtros: formato (só os que aparecem na lista, mais o escolhido) e situação. */
export function filtrosHTML(rooms: PublicRoom[], f: FiltrosSalas): string {
  const formatos = [...new Set([...rooms.map(r => r.config.format), ...(f.formato ? [f.formato] : [])])].sort((a, b) => nomeDoFormato(a).localeCompare(nomeDoFormato(b)));
  const situacoes: [Situacao, string][] = [['', 'Todas'], ['esperando', 'Esperando jogadores'], ['andamento', 'Em andamento']];
  return `<label class="sl-filtro">Formato<select class="input-field" data-filtro="formato"><option value="">Todos</option>${formatos.map(x => `<option value="${esc(x)}"${x === f.formato ? ' selected' : ''}>${esc(nomeDoFormato(x))}</option>`).join('')}</select></label>
    <div class="sl-situacao" role="group" aria-label="Situação">${situacoes.map(([v, t]) => `<button type="button" data-situacao="${v}" aria-pressed="${f.situacao === v}">${t}</button>`).join('')}</div>`;
}

/** A lista filtrada; sem nada, o aviso com o atalho para criar uma sala. */
export function listaHTML(rooms: PublicRoom[], f: FiltrosSalas): string {
  const vistas = filtrar(rooms, f);
  if (!vistas.length) {
    const algum = rooms.some(r => esperando(r) || emAndamento(r));
    return `<div class="sl-vazio"><p><strong>${algum ? 'Nenhuma sala com esses filtros.' : 'Nenhuma sala aberta agora.'}</strong></p>
      <p>${algum ? 'Mude os filtros, ou crie uma sala pública para outros entrarem.' : 'Crie uma sala pública: ela aparece aqui para outros jogadores entrarem.'}</p>
      <a class="arena-btn primary" href="/?criar-sala=1">Criar uma sala</a></div>`;
  }
  const abertas = vistas.filter(esperando), vivas = vistas.filter(emAndamento);
  return [abertas.length ? `<h2 class="sl-titulo">Esperando jogadores <small>${abertas.length}</small></h2><ul class="sl-lista">${abertas.map(cartao).join('')}</ul>` : '',
    vivas.length ? `<h2 class="sl-titulo">Em andamento <small>${vivas.length}</small></h2><ul class="sl-lista">${vivas.map(cartao).join('')}</ul>` : ''].join('');
}
