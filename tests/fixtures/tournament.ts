import { KEYS, saveJSON } from '../../src/storage';
import type { Torneio } from '../../src/torneios/view';

/*
 * Torneios sem o servidor e sem login: a página de verdade (/torneios.html) com a rota /api/torneios/ respondida aqui
 * e uma sessão de conta falsa, de quem organiza. ?cena=rodada (padrão) mostra a 2ª rodada em andamento, com uma mesa
 * esperando o placar; ?cena=atrasado, a 1ª rodada fechada e uma inscrição atrasada; ?cena=final, o torneio encerrado
 * (com o pódio final); ?cena=ultima, as rodadas planejadas jogadas e ainda aberto (Encerrar ou Rodada extra);
 * ?cena=vazio, recém-criado e sem jogadores. O relógio da rodada funciona de verdade (iniciar, pausar, somar e
 * tirar minutos, recomeçar); na cena rodada ele começa correndo com 12 minutos, e ?tempo=10 o põe com 10 segundos,
 * para ver o tempo acabar e ouvir o alarme. Pelo console, window.fixture:
 * fixture.cena('atrasado') troca a cena e fixture.publico() mostra como quem só tem o link vê.
 * Lançar um placar muda a mesa, mas a classificação de exemplo não é recalculada (quem calcula é o servidor).
 */
const CENAS: Record<string, Torneio> = {"atrasado":{"id":"SEXTA9PX","nome":"Sexta do Pauper","formato":"Pauper","organizador":"Kassio","criadoEm":"2026-11-14T22:00:00Z","estado":"andamento","rodadas":3,"rodadasEscolhidas":true,"rodadasSugeridas":4,"inscricoesAbertas":true,"organizadorSouEu":true,"jogadores":[{"id":1,"nome":"Ana"},{"id":2,"nome":"Bruno"},{"id":3,"nome":"Caio"},{"id":4,"nome":"Duda"},{"id":5,"nome":"Edu"},{"id":6,"nome":"Fê"},{"id":7,"nome":"Gui"},{"id":8,"nome":"Hugo"},{"id":9,"nome":"Íris","entrou":2}],"rodadasJogadas":[{"numero":1,"mesas":[{"mesa":1,"a":1,"b":2,"resultado":{"a":2,"b":1,"empates":0}},{"mesa":2,"a":3,"b":4,"resultado":{"a":2,"b":0,"empates":0}},{"mesa":3,"a":5,"b":6,"resultado":{"a":1,"b":2,"empates":0}},{"mesa":4,"a":7,"b":8,"resultado":{"a":1,"b":1,"empates":1}}]}],"classificacao":[{"posicao":1,"id":3,"pontos":3,"vitorias":1,"derrotas":0,"empates":0,"omw":0.333333,"ogw":0.333333,"gw":1.0},{"posicao":2,"id":1,"pontos":3,"vitorias":1,"derrotas":0,"empates":0,"omw":0.333333,"ogw":0.333333,"gw":0.666667},{"posicao":2,"id":6,"pontos":3,"vitorias":1,"derrotas":0,"empates":0,"omw":0.333333,"ogw":0.333333,"gw":0.666667},{"posicao":4,"id":7,"pontos":1,"vitorias":0,"derrotas":0,"empates":1,"omw":0.333333,"ogw":0.444444,"gw":0.444444},{"posicao":4,"id":8,"pontos":1,"vitorias":0,"derrotas":0,"empates":1,"omw":0.333333,"ogw":0.444444,"gw":0.444444},{"posicao":6,"id":4,"pontos":0,"vitorias":0,"derrotas":1,"empates":0,"omw":1.0,"ogw":1.0,"gw":0.333333},{"posicao":7,"id":2,"pontos":0,"vitorias":0,"derrotas":1,"empates":0,"omw":1.0,"ogw":0.666667,"gw":0.333333},{"posicao":7,"id":5,"pontos":0,"vitorias":0,"derrotas":1,"empates":0,"omw":1.0,"ogw":0.666667,"gw":0.333333},{"posicao":9,"id":9,"pontos":0,"vitorias":0,"derrotas":1,"empates":0,"gw":0.333333}]},"rodada":{"id":"SEXTA9PX","nome":"Sexta do Pauper","formato":"Pauper","organizador":"Kassio","criadoEm":"2026-11-14T22:00:00Z","estado":"andamento","rodadas":4,"rodadasEscolhidas":true,"rodadasSugeridas":4,"inscricoesAbertas":false,"organizadorSouEu":true,"jogadores":[{"id":1,"nome":"Ana"},{"id":2,"nome":"Bruno"},{"id":3,"nome":"Caio"},{"id":4,"nome":"Duda"},{"id":5,"nome":"Edu"},{"id":6,"nome":"Fê"},{"id":7,"nome":"Gui"},{"id":8,"nome":"Hugo"},{"id":9,"nome":"Íris","entrou":2}],"rodadasJogadas":[{"numero":1,"mesas":[{"mesa":1,"a":1,"b":2,"resultado":{"a":2,"b":1,"empates":0}},{"mesa":2,"a":3,"b":4,"resultado":{"a":2,"b":0,"empates":0}},{"mesa":3,"a":5,"b":6,"resultado":{"a":1,"b":2,"empates":0}},{"mesa":4,"a":7,"b":8,"resultado":{"a":1,"b":1,"empates":1}}]},{"numero":2,"mesas":[{"mesa":1,"a":1,"b":3,"resultado":null},{"mesa":2,"a":6,"b":7,"resultado":{"a":2,"b":0,"empates":0}},{"mesa":3,"a":8,"b":2,"resultado":{"a":0,"b":2,"empates":0}},{"mesa":4,"a":4,"b":9,"resultado":{"a":2,"b":1,"empates":0}},{"mesa":0,"a":5,"b":0,"resultado":{"a":2,"b":0,"empates":0}}]}],"classificacao":[{"posicao":1,"id":6,"pontos":6,"vitorias":2,"derrotas":0,"empates":0,"omw":0.416667,"ogw":0.466667,"gw":0.8},{"posicao":2,"id":5,"pontos":3,"vitorias":1,"derrotas":1,"empates":0,"omw":1.0,"ogw":0.8,"gw":0.6},{"posicao":3,"id":2,"pontos":3,"vitorias":1,"derrotas":1,"empates":0,"omw":0.666667,"ogw":0.5,"gw":0.6},{"posicao":4,"id":4,"pontos":3,"vitorias":1,"derrotas":1,"empates":0,"omw":0.666667,"ogw":0.666667,"gw":0.4},{"posicao":5,"id":3,"pontos":3,"vitorias":1,"derrotas":0,"empates":0,"omw":0.5,"ogw":0.4,"gw":1.0},{"posicao":6,"id":1,"pontos":3,"vitorias":1,"derrotas":0,"empates":0,"omw":0.5,"ogw":0.6,"gw":0.666667},{"posicao":7,"id":7,"pontos":1,"vitorias":0,"derrotas":1,"empates":1,"omw":0.666667,"ogw":0.566667,"gw":0.333333},{"posicao":8,"id":8,"pontos":1,"vitorias":0,"derrotas":1,"empates":1,"omw":0.416667,"ogw":0.466667,"gw":0.333333},{"posicao":9,"id":9,"pontos":0,"vitorias":0,"derrotas":2,"empates":0,"omw":0.5,"ogw":0.4,"gw":0.333333}]}};

// O encerrado reaproveita a rodada 2, com a mesa que faltava lançada; o vazio, só o nome.
const fechada = structuredClone(CENAS.rodada);
fechada.rodadasJogadas[1].mesas[0].resultado = { a: 2, b: 0, empates: 0 };
CENAS.final = { ...fechada, estado: 'encerrado', rodadas: 2, inscricoesAbertas: false };
CENAS.ultima = { ...fechada, rodadas: 2 };
CENAS.vazio = { ...CENAS.rodada, estado: 'inscricoes', jogadores: [], rodadasJogadas: [], classificacao: [], inscricoesAbertas: true, rodadasEscolhidas: false, rodadas: 1 };
const params = new URLSearchParams(location.search);
const pedida = params.get('cena') ?? 'rodada';
let atual: Torneio = structuredClone(CENAS[pedida] ?? CENAS.rodada);
history.replaceState(null, '', `?cena=${pedida}${params.has('tempo') ? `&tempo=${params.get('tempo')}` : ''}&id=${atual.id}`);

// O relógio como o servidor (RoundClock.java) o guarda: correndo, a hora do fim; parado ou pausado, o que falta.
const MIN = 60_000;
atual.minutosPorRodada = 50;
const segundos = Number(params.get('tempo'));
const relogio = pedida === 'rodada'
  ? { estado: 'correndo', restante: 0, fim: Date.now() + (segundos > 0 ? segundos * 1000 : 12 * MIN) }
  : { estado: 'parado', restante: 50 * MIN, fim: 0 };
function comRelogio(): Torneio {
  if (atual.estado !== 'andamento') return { ...atual, relogio: undefined };
  const agora = Date.now(), correndo = relogio.estado === 'correndo';
  return { ...atual, relogio: { estado: relogio.estado as 'parado', restanteMs: correndo ? relogio.fim - agora : relogio.restante, agora, ...(correndo ? { terminaEm: new Date(relogio.fim).toISOString() } : {}) } };
}
function mexerNoRelogio(pedido: { acao: string; minutos?: number }) {
  const agora = Date.now();
  if (pedido.acao === 'iniciar') { relogio.fim = agora + relogio.restante; relogio.estado = 'correndo'; }
  if (pedido.acao === 'pausar') { relogio.restante = relogio.fim - agora; relogio.estado = 'pausado'; }
  if (pedido.acao === 'ajustar') { if (relogio.estado === 'correndo') relogio.fim += pedido.minutos! * MIN; else relogio.restante += pedido.minutos! * MIN; }
  if (pedido.acao === 'zerar') { relogio.estado = 'parado'; relogio.restante = atual.minutosPorRodada * MIN; }
}
saveJSON(KEYS.conta, { token: 'teste', expiresAt: '2099-01-01T00:00:00Z', conta: { id: 'conta-teste', apelido: 'Kassio' } });

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
  const i = url.pathname.indexOf('/api/torneios/');
  if (i < 0) return realFetch(input, init);
  const partes = url.pathname.slice(i + '/api/torneios/'.length).split('/');
  const mesa = partes[1] === 'rodadas' && partes[3] === 'mesas' ? atual.rodadasJogadas[Number(partes[2]) - 1]?.mesas.find(m => m.mesa === Number(partes[4])) : undefined;
  if (mesa) mesa.resultado = init?.method === 'DELETE' ? null : JSON.parse(String(init?.body));
  if (partes[1] === 'relogio') mexerNoRelogio(JSON.parse(String(init?.body)));
  return new Response(JSON.stringify({ torneio: comRelogio() }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

Object.assign(window, {
  fixture: {
    cena(nome: string) { location.search = `?cena=${nome}`; },
    publico() { atual = { ...atual, organizadorSouEu: false }; document.querySelector('[data-conteudo]')!.innerHTML = ''; },
    atual: () => atual,
  },
});
// Sem await no topo: o alvo do build (es2020) não aceita, e nada depende do fim da carga.
void import('../../src/torneios');
