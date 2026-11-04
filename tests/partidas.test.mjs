import test from 'node:test';
import assert from 'node:assert/strict';
const view = await import('../src/partidas/view.ts');
const formato = f => ({ commander: 'Commander', free: 'Livre' })[f] ?? f;

const partida = (extra = {}) => ({
  id: 'a', quando: '2026-10-31T21:14:00Z', formato: 'commander', melhorDe: 'bo1', modo: 'ia', ms: 1_080_000, fim: 'concluida',
  resultado: 'vitoria', turnos: 12, jogos: 1, placar: [1, 0],
  deck: { id: 'd1', nome: 'Elfos de Lathril', comandante: 'Lathril, Blade of the Elves', cores: 'BG' },
  oponentes: [{ ia: true, deck: 'Goblins', comandante: 'Krenko, Mob Boss', cores: 'R' }], ...extra,
});

test('cada partida mostra o resultado, os decks, o oponente e como foi', () => {
  const html = view.partidaHTML(partida(), formato);
  assert.match(html, /r-vitoria/);
  assert.match(html, /<strong>Vitória<\/strong>/);
  assert.match(html, /Lathril, Blade of the Elves<\/strong> <small>Elfos de Lathril/);
  assert.match(html, /<strong>Computador<\/strong> <small>Krenko, Mob Boss/);
  assert.match(html, /Commander · 12 turnos · 18 min/);
  assert.equal((html.match(/class="pip /g) ?? []).length, 3, 'as cores dos dois decks');

  const bo3 = view.partidaHTML(partida({ melhorDe: 'bo3', jogos: 3, placar: [1, 2], resultado: 'derrota', fim: 'concedida', modo: 'rede',
    oponentes: [{ ia: false, nome: 'Bia <b>', deck: 'Goblins' }] }), formato);
  assert.match(bo3, /<small>1 a 2, por desistência<\/small>/);
  assert.match(bo3, /melhor de três/);
  assert.match(bo3, /Bia &lt;b&gt;/, 'o nome digitado na sala é escapado');

  assert.match(view.partidaHTML(partida({ resultado: 'queda' }), formato), /Sem vencedor<\/strong><small>a partida caiu e ninguém voltou/);
});

test('números: taxa, duração média, sequência e grupos', () => {
  const html = view.numerosHTML({
    partidas: 5, vitorias: 3, derrotas: 2, empates: 0, duracaoMedia: 3_900_000, sequencia: { resultado: 'vitoria', n: 2 },
    porDeck: [{ id: 'd1', nome: 'Elfos', partidas: 5, vitorias: 3 }], porFormato: [{ formato: 'free', partidas: 5, vitorias: 3 }],
    porOponente: [{ tipo: 'ia', partidas: 4, vitorias: 3 }, { tipo: 'pessoas', partidas: 1, vitorias: 0 }],
  }, formato);
  assert.match(html, /<strong>60%<\/strong><span>taxa de vitória/);
  assert.match(html, /1 h 05 min/);
  assert.match(html, /2 vitórias seguidas/);
  assert.match(html, /<th scope="row">Livre<\/th><td>5<\/td><td>3<\/td><td>60%<\/td>/);
  assert.match(html, /Contra pessoas<\/th><td>1<\/td><td>0<\/td><td>0%/);

  const vazio = view.numerosHTML({ partidas: 0, vitorias: 0, derrotas: 0, empates: 0, porDeck: [], porFormato: [], porOponente: [] }, formato);
  assert.match(vazio, /<strong>—<\/strong><span>taxa de vitória/);
  assert.doesNotMatch(vazio, /pt-grupos/);
  assert.equal(view.sequenciaTexto({ resultado: 'derrota', n: 1 }), 'Perdeu a última');
});

test('a consulta leva só os filtros escolhidos', () => {
  assert.equal(view.consulta({ periodo: '', formato: '', deck: '' }, 0), 'partidas');
  assert.equal(view.consulta({ periodo: '30', formato: 'commander', deck: 'nome:Antigo deck' }, 2), 'partidas?periodo=30&formato=commander&deck=nome%3AAntigo+deck&pagina=2');
  const filtros = view.filtrosHTML({ periodo: '7', formato: '', deck: 'd1' }, { formatos: ['commander'], decks: [{ id: 'd1', nome: 'Elfos' }] }, formato);
  assert.match(filtros, /<option value="7" selected>Últimos 7 dias/);
  assert.match(filtros, /<option value="d1" selected>Elfos/);
  assert.equal(view.duracao(20_000), 'menos de 1 min');
});
