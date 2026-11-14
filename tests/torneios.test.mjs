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
  assert.match(html, /<span class="tn-num">Bye<\/span><p><strong>Caio<\/strong> <small>vitória sem oponente \(2-0\)/);
  assert.match(html, /data-placar="1:1:2:1:0" aria-pressed="true">2-1/);
  assert.match(html, /data-limpar="1:1"/, 'na rodada atual dá para apagar o resultado');
  assert.match(html, /<details class="tn-corrigir"><summary>Corrigir<\/summary>/, 'com o placar lançado, os botões ficam recolhidos');
  const aberta = view.rodadaHTML(t, { numero: 1, mesas: [{ mesa: 1, a: 1, b: 2, resultado: null }] }, true);
  assert.doesNotMatch(aberta, /tn-corrigir/, 'sem placar, os botões ficam à vista');
  assert.equal((html.match(/data-placar=/g) ?? []).length, view.PLACARES.length, 'o bye não tem placar para escolher');
  assert.doesNotMatch(view.rodadaHTML(t, t.rodadasJogadas[0], false), /data-placar/, 'quem só olha não lança resultado');
});

test('o próximo passo do organizador acompanha a rodada', () => {
  assert.match(view.proximoPassoHTML(torneio()), /data-acao="sortear">Sortear a rodada 2/);
  assert.doesNotMatch(view.proximoPassoHTML(torneio()), /desfazer/, 'com resultado lançado, o sorteio não se desfaz');
  const aberta = torneio({ rodadasJogadas: [{ numero: 1, mesas: [{ mesa: 1, a: 1, b: 2, resultado: null }] }] });
  assert.match(view.proximoPassoHTML(aberta), /Falta 1 resultado para fechar a rodada 1/);
  assert.match(view.proximoPassoHTML(aberta), /Desfazer o sorteio/);
  assert.match(view.proximoPassoHTML(torneio({ rodadas: 1 })), /class="arena-btn primary" data-acao="encerrar"/);
  assert.match(view.proximoPassoHTML(torneio({ estado: 'inscricoes', rodadasJogadas: [], jogadores: [{ id: 1, nome: 'Ana' }] })), /disabled>Começar/);
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
  assert.match(html, /data-sair="1">Sair do torneio/);
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
  assert.match(view.listaHTML([]), /ainda não criou/);
});
