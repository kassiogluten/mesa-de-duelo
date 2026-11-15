import test from 'node:test';
import assert from 'node:assert/strict';
const view = await import('../src/torneios/view.ts');

const torneio = (extra = {}) => ({
  id: 'ABCDEFGH', nome: 'Sexta <do> Pauper', formato: 'Pauper', organizador: 'Kassio', criadoEm: '2026-11-14T20:00:00Z',
  estado: 'andamento', rodadas: 3, rodadasEscolhidas: true, rodadasSugeridas: 3, inscricoesAbertas: true, organizadorSouEu: true,
  jogadores: [{ id: 1, nome: 'Ana' }, { id: 2, nome: 'Bruno' }, { id: 3, nome: 'Caio' }, { id: 4, nome: 'Duda', entrou: 2 }],
  rodadasJogadas: [{ numero: 1, mesas: [{ mesa: 1, a: 1, b: 2, resultado: { a: 2, b: 1, empates: 0 } }, { mesa: 0, a: 3, b: 0, resultado: { a: 2, b: 0, empates: 0 } }] }],
  classificacao: [
    { posicao: 1, id: 1, pontos: 3, vitorias: 1, derrotas: 0, empates: 0, omw: 1 / 3, gw: 2 / 3, ogw: 1 / 3 },
    { posicao: 2, id: 3, pontos: 3, vitorias: 1, derrotas: 0, empates: 0, gw: 1 },
    { posicao: 3, id: 2, pontos: 0, vitorias: 0, derrotas: 1, empates: 0, omw: 1, gw: 1 / 3, ogw: 2 / 3 },
    { posicao: 4, id: 4, pontos: 0, vitorias: 0, derrotas: 1, empates: 0, gw: 1 / 3 },
  ],
  ...extra,
});

test('placares e porcentagens como o jogador lê', () => {
  assert.equal(view.placarTexto({ a: 2, b: 1, empates: 0 }), '2-1');
  assert.equal(view.placarTexto({ a: 1, b: 1, empates: 1 }), '1-1-1');
  assert.equal(view.pct(2 / 3), '66,7%');
  assert.equal(view.pct(undefined), '—');
  assert.equal(view.andamentoTexto(torneio()), 'Rodada 1 de 3');
  assert.equal(view.andamentoTexto(torneio({ estado: 'inscricoes', rodadasJogadas: [] })), 'Inscrições abertas · 3 rodadas');
  assert.equal(view.andamentoTexto(torneio({ estado: 'encerrado' })), 'Encerrado depois de 1 rodada');
});

test('a rodada mostra o confronto, o vencedor, o bye e os placares para o organizador', () => {
  const t = torneio();
  const html = view.rodadaHTML(t, t.rodadasJogadas[0], true);
  assert.match(html, /<strong class="tn-vence">Ana<\/strong> <span class="tn-resultado">2-1<\/span> <strong class="">Bruno/);
  assert.match(html, /<span class="tn-num"><svg[^]*?<\/svg>Bye<\/span><p><strong>Caio<\/strong> <small>vitória sem oponente \(2-0\)/);
  assert.match(html, /data-placar="1:1:2:1:0" aria-pressed="true">2-1/);
  assert.match(html, /data-limpar="1:1"/, 'na rodada atual dá para apagar o resultado');
  assert.match(html, /<details class="tn-corrigir"><summary><svg[^]*?<\/svg><span>Corrigir<\/span><\/summary>/, 'com o placar lançado, os botões ficam recolhidos');
  const aberta = view.rodadaHTML(t, { numero: 1, mesas: [{ mesa: 1, a: 1, b: 2, resultado: null }] }, true);
  assert.doesNotMatch(aberta, /tn-corrigir/, 'sem placar, os botões ficam à vista');
  assert.equal((html.match(/data-placar=/g) ?? []).length, view.PLACARES.length, 'o bye não tem placar para escolher');
  assert.doesNotMatch(view.rodadaHTML(t, t.rodadasJogadas[0], false), /data-placar/, 'quem só olha não lança resultado');
});

test('o próximo passo do organizador acompanha a rodada', () => {
  assert.match(view.proximoPassoHTML(torneio()), /data-acao="sortear"><svg[^]*?<\/svg><span>Sortear a rodada 2/);
  assert.doesNotMatch(view.proximoPassoHTML(torneio()), /desfazer/, 'com resultado lançado, o sorteio não se desfaz');
  const aberta = torneio({ rodadasJogadas: [{ numero: 1, mesas: [{ mesa: 1, a: 1, b: 2, resultado: null }] }] });
  assert.match(view.proximoPassoHTML(aberta), /Falta 1 resultado para fechar a rodada 1/);
  assert.match(view.proximoPassoHTML(aberta), /Desfazer o sorteio/);
  assert.match(view.proximoPassoHTML(torneio({ rodadas: 1 })), /class="arena-btn primary" data-acao="encerrar"/);
  assert.match(view.proximoPassoHTML(torneio({ estado: 'inscricoes', rodadasJogadas: [], jogadores: [{ id: 1, nome: 'Ana' }] })), /disabled><svg[^]*?<\/svg><span>Começar/);
  assert.equal(view.proximoPassoHTML(torneio({ organizadorSouEu: false })), '');
});

test('classificação com desempates, atrasados e quem saiu', () => {
  const html = view.classificacaoHTML(torneio({ jogadores: [{ id: 1, nome: 'Ana' }, { id: 2, nome: 'Bruno', saiu: 1 }, { id: 3, nome: 'Caio' }, { id: 4, nome: 'Duda', entrou: 2 }] }));
  assert.match(html, /<td>1<\/td><th scope="row" class="tn-nome">Ana<\/th><td><strong>3<\/strong><\/td>\s*<td>1-0-0<\/td><td>33,3%<\/td><td>66,7%<\/td><td>33,3%<\/td>/);
  assert.match(html, /Caio<\/th><td><strong>3<\/strong><\/td>\s*<td>1-0-0<\/td><td>—<\/td><td>100,0%<\/td><td>—<\/td>/, 'só com bye, sem oponentes');
  assert.match(html, /<tr class="tn-saiu">.*Bruno<span class="tn-tag">saiu/s);
  assert.match(html, /Duda<span class="tn-tag">atrasado/);
});

test('jogadores: inscrever atrasado, tirar quem não jogou e sair do torneio', () => {
  const html = view.jogadoresHTML(torneio());
  assert.match(html, /data-inscrever/);
  assert.match(html, /começa com uma derrota por 0-2/);
  assert.match(html, /data-tirar="4"/, 'Duda ainda não foi sorteada');
  assert.match(html, /data-sair="1"><svg[^]*?<\/svg><span>Sair do torneio/);
  assert.doesNotMatch(view.jogadoresHTML(torneio({ inscricoesAbertas: false })), /data-inscrever/);
  assert.doesNotMatch(view.jogadoresHTML(torneio({ organizadorSouEu: false })), /data-(tirar|sair|inscrever)/);
});

test('a página escapa o que foi digitado e a lista leva ao torneio', () => {
  assert.match(view.torneioHTML(torneio()), /<h1>Sexta &lt;do&gt; Pauper<\/h1>/);
  assert.match(view.torneioHTML(torneio({ organizadorSouEu: false })), /Copiar link/);
  assert.doesNotMatch(view.torneioHTML(torneio({ organizadorSouEu: false })), /data-editar/);
  const lista = view.listaHTML([{ id: 'ABCDEFGH', nome: 'Liga', formato: 'Modern', criadoEm: '', estado: 'andamento', jogadores: 8, rodada: 2, rodadas: 3 }]);
  assert.match(lista, /href="\/torneios.html\?id=ABCDEFGH"/);
  assert.match(lista, /Modern · 8 jogadores · Rodada 2 de 3/);
  assert.match(view.listaHTML([]), /class="tn-vazio"><svg class="tn-ilustra"[^]*ainda não criou/);
});

test('pódio dos três primeiros, com a coroa só no fim', () => {
  const html = view.podioHTML(torneio());
  assert.equal((html.match(/class="tn-degrau/g) ?? []).length, 3, 'os três primeiros com resultado lançado');
  assert.match(html, /aria-label="Pódio até agora"/);
  assert.match(html, /tn-degrau d1">\s*<span class="tn-medalha m1">1º<\/span>\s*<strong>Ana<\/strong>\s*<small>3 pontos · 1-0-0/);
  assert.doesNotMatch(html, /tn-coroa/);
  assert.match(view.podioHTML(torneio({ estado: 'encerrado' })), /aria-label="Pódio final"[^]*tn-coroa/);
  const semJogo = torneio({ classificacao: [{ posicao: 1, id: 1, pontos: 0, vitorias: 0, derrotas: 0, empates: 0 }] });
  assert.equal(view.podioHTML(semJogo), '', 'sem resultado lançado, sem pódio');
  assert.match(view.classificacaoHTML(torneio({ rodadasJogadas: [] })), /tn-vazio[^]*A classificação começa com a 1ª rodada/);
});

test('barra das rodadas: fechadas, a atual com o anel do que foi lançado e as que faltam', () => {
  const t = torneio({ rodadas: 3, rodadasJogadas: [
    { numero: 1, mesas: [{ mesa: 1, a: 1, b: 2, resultado: { a: 2, b: 0, empates: 0 } }] },
    { numero: 2, mesas: [{ mesa: 1, a: 1, b: 3, resultado: { a: 2, b: 0, empates: 0 } }, { mesa: 2, a: 2, b: 4, resultado: null }] },
  ] });
  const html = view.progressoHTML(t);
  assert.match(html, /<li class="tn-p-feita" title="Rodada 1: jogada">/);
  assert.match(html, /<li class="tn-p-atual" title="Rodada 2: em andamento, 1 de 2 resultados" style="--feito:50%">/);
  assert.match(html, /<li class="tn-p-futura" title="Rodada 3: por vir">/);
  assert.match(html, /1 de 2 resultados lançados na rodada 2/);
  assert.match(view.progressoHTML(torneio({ estado: 'inscricoes', rodadasJogadas: [], rodadas: 2 })), /2 rodadas previstas/);
  assert.doesNotMatch(view.progressoHTML(torneio({ estado: 'encerrado' })), /tn-p-atual/, 'no fim, todas fechadas');
});

test('jogadores sem ninguém inscrito mostram a ilustração com o próximo passo', () => {
  assert.match(view.jogadoresHTML(torneio({ jogadores: [], rodadasJogadas: [] })), /tn-vazio[^]*Digite o nome de cada um acima/);
  assert.match(view.jogadoresHTML(torneio({ jogadores: [], rodadasJogadas: [], organizadorSouEu: false })), /O organizador ainda vai inscrever/);
});

test('rodada extra: só depois das planejadas, antes de encerrar, e marcada como extra', () => {
  const fechada = torneio({ rodadas: 1 });
  const passo = view.proximoPassoHTML(fechada);
  assert.match(passo, /data-acao="encerrar"[^]*data-acao="extra"><svg[^]*?<\/svg><span>Rodada extra/);
  assert.match(passo, /sorteie uma rodada extra \(a 2ª\)/);
  assert.doesNotMatch(view.proximoPassoHTML(torneio()), /data-acao="extra"/, 'com rodadas planejadas por jogar, sorteia a próxima');
  assert.doesNotMatch(view.proximoPassoHTML(torneio({ rodadas: 1, estado: 'encerrado' })), /data-acao="extra"/);
  const quinze = Array.from({ length: view.MAX_RODADAS }, (_, i) => ({ numero: i + 1, mesas: [{ mesa: 1, a: 1, b: 2, resultado: { a: 2, b: 0, empates: 0 } }] }));
  assert.doesNotMatch(view.proximoPassoHTML(torneio({ rodadas: 15, rodadasJogadas: quinze })), /data-acao="extra"/, 'no máximo, sem extra');

  const extra = { numero: 2, extra: true, mesas: [{ mesa: 1, a: 1, b: 3, resultado: null }] };
  const comExtra = torneio({ rodadas: 2, rodadasJogadas: [torneio().rodadasJogadas[0], extra] });
  assert.equal(view.nomeRodada(extra), 'Rodada 2 · extra');
  assert.match(view.torneioHTML(comExtra), /id="tn-atual"><svg[^]*?<\/svg><span>Rodada 2 · extra<\/span>/);
  assert.match(view.progressoHTML(comExtra), /<li class="tn-p-atual tn-p-extra" title="Rodada 2 · extra: em andamento/);
});

const clock = await import('../src/torneios/clock.ts');

test('relógio: o que falta, acertado pela hora do servidor, e o texto', () => {
  const correndo = { estado: 'correndo', restanteMs: 0, terminaEm: new Date(10 * 60_000).toISOString(), agora: 1_000 };
  // O aparelho está 1 s atrás do servidor (recebeu às 0 quando o servidor marcava 1 s).
  assert.equal(clock.restante(correndo, 0, 60_000), 10 * 60_000 - 61_000);
  assert.equal(clock.restante({ estado: 'pausado', restanteMs: 90_000, agora: 0 }, 0, 999_999), 90_000, 'pausado não anda');
  assert.equal(clock.tempoTexto(50 * 60_000), '50:00');
  assert.equal(clock.tempoTexto(247_100), '4:08', 'arredonda para cima: 0:01 ainda é tempo');
  assert.equal(clock.tempoTexto(65 * 60_000), '1:05:00');
  assert.equal(clock.tempoTexto(-30_000), '0:00');
  assert.deepEqual([clock.fase(6 * 60_000), clock.fase(5 * 60_000), clock.fase(0)], ['ok', 'aviso', 'tempo']);
  assert.equal(clock.estadoTexto({ estado: 'parado' }, 50 * 60_000, 50), 'Pronto para começar · 50 min');
  assert.equal(clock.estadoTexto({ estado: 'correndo' }, -1, 50), 'Tempo! Terminem o turno e joguem mais 5 turnos.');
});

test('relógio na página: controles só para quem organiza, tela cheia para todos', () => {
  const parado = clock.relogioHTML({ estado: 'parado', restanteMs: 3_000_000, agora: 0 }, 3_000_000, 50, true);
  assert.match(parado, /class="tn-relogio f-ok e-parado"/);
  assert.match(parado, /data-relogio-acao="iniciar"><svg[^]*?<\/svg><span>Iniciar relógio/);
  assert.match(parado, /data-minutos="-1"[^>]*>−1 min[^]*data-minutos="5"[^>]*>\+5 min/);
  assert.doesNotMatch(parado, /zerar/, 'parado não tem o que recomeçar');
  const pausado = clock.relogioHTML({ estado: 'pausado', restanteMs: 60_000, agora: 0 }, 60_000, 50, true);
  assert.match(pausado, /f-aviso e-pausado[^]*<span>Continuar[^]*data-relogio-acao="zerar"/);
  assert.match(clock.relogioHTML({ estado: 'correndo', restanteMs: 0, agora: 0 }, -1, 50, true), /f-tempo[^]*data-relogio-acao="pausar"/);
  const publico = clock.relogioHTML({ estado: 'correndo', restanteMs: 0, agora: 0 }, 600_000, 50, false);
  assert.doesNotMatch(publico, /data-acao="relogio"/);
  assert.match(publico, /data-acao="telao"/);
  assert.match(clock.telaoHTML('Liga <b>', 'Rodada 2', { estado: 'parado', restanteMs: 0, agora: 0 }, 600_000, 50), /Liga &lt;b&gt;[^]*Rodada 2[^]*10:00/);
  const t = torneio({ minutosPorRodada: 50, relogio: { estado: 'parado', restanteMs: 3_000_000, agora: 0 } });
  assert.match(view.torneioHTML(t), /id="tn-atual"[^]*data-relogio[^]*tn-mesas/, 'o relógio fica no alto da rodada');
  assert.match(view.torneioHTML(t), /name="minutos"[^>]*value="50"/, 'o tempo da rodada se muda em Editar');
});
