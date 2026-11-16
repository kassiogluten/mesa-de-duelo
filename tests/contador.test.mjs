import test from 'node:test';
import assert from 'node:assert/strict';

const s = await import('../src/contador/state.ts');
const view = await import('../src/contador/view.ts');

const partida = (n = 4, extra = {}) => s.novaPartida({ ...s.comJogadores(s.configPadrao(), n), ...extra }, 0);

test('a partida começa com a vida inicial e o 40 é Commander', () => {
  const p = partida(3);
  assert.deepEqual(p.jogadores.map(j => j.vida), [40, 40, 40]);
  assert.equal(p.config.comandante, true);
  const duelo = s.novaPartida({ ...s.comJogadores(s.configPadrao(), 2), vidaInicial: 20, comandante: false }, 0);
  assert.deepEqual(duelo.jogadores.map(j => j.vida), [20, 20]);
});

test('mudar o número de jogadores guarda os nomes e dá cores diferentes a quem entra', () => {
  const c = s.configPadrao(2);
  c.jogadores[0].nome = 'Ana'; c.jogadores[1].cor = s.CORES[2];
  const seis = s.comJogadores(c, 9);
  assert.equal(seis.jogadores.length, s.MAX_JOGADORES);
  assert.equal(seis.jogadores[0].nome, 'Ana');
  assert.equal(new Set(seis.jogadores.map(j => j.cor)).size, 6);
  assert.equal(s.comJogadores(c, 1).jogadores.length, s.MIN_JOGADORES);
});

test('toques seguidos no mesmo jogador viram uma linha do histórico', () => {
  const p = partida();
  s.mudarVida(p, 0, -1, 1000);
  s.mudarVida(p, 0, -1, 1500);
  s.mudarVida(p, 0, -10, 2000);
  assert.equal(p.jogadores[0].vida, 28);
  assert.equal(p.historico.length, 1);
  assert.deepEqual({ de: p.historico[0].de, para: p.historico[0].para }, { de: 40, para: 28 });
  // Outro jogador, ou o mesmo depois de uma pausa, abre outra linha.
  s.mudarVida(p, 1, 3, 2100);
  s.mudarVida(p, 0, -1, 2100 + s.JUNTAR_MS + 1);
  assert.equal(p.historico.length, 3);
  assert.match(s.textoEntrada(p, p.historico[0]), /Jogador 1: −12 de vida \(40 → 28\)/);
});

test('somar e tirar o mesmo valor em seguida não deixa linha no histórico', () => {
  const p = partida();
  s.mudarVida(p, 2, 5, 0);
  s.mudarVida(p, 2, -5, 100);
  assert.equal(p.historico.length, 0);
  assert.equal(p.jogadores[2].vida, 40);
});

test('dano de comandante tira vida junto, e 21 de um mesmo comandante derruba', () => {
  const p = partida();
  s.mudarComandante(p, 1, s.comandanteId(0), 20, 0);
  assert.equal(p.jogadores[1].vida, 20);
  assert.equal(s.derrota(p, 1), null);
  s.mudarComandante(p, 1, s.comandanteId(0), 1, 100);
  assert.deepEqual(s.derrota(p, 1), { motivo: 'cmd', origem: '0' });
  assert.match(view.foraTexto(p, 1), /21 do comandante de Jogador 1/);
  // Dois comandantes diferentes não somam para os 21.
  const q = partida();
  s.mudarComandante(q, 1, '0', 15, 0);
  s.mudarComandante(q, 1, '2', 15, 0);
  assert.equal(s.derrota(q, 1), null);
  assert.equal(q.jogadores[1].vida, 10);
});

test('o dano de comandante nunca fica negativo e o jogador não se causa dano', () => {
  const p = partida();
  s.mudarComandante(p, 1, '0', -3, 0);
  assert.deepEqual(p.jogadores[1].cmd, {});
  assert.equal(p.jogadores[1].vida, 40);
  s.mudarComandante(p, 1, '1', 5, 0);
  assert.equal(p.jogadores[1].vida, 40);
  assert.equal(p.historico.length, 0);
});

test('com parceiro, cada um dos dois comandantes conta separado', () => {
  const c = s.comJogadores(s.configPadrao(), 3);
  c.jogadores[0].parceiro = true;
  c.jogadores[0].nome = 'Bia';
  const p = s.novaPartida(c, 0);
  assert.deepEqual(s.comandantesDe(p, 0), ['0', '0b']);
  s.mudarComandante(p, 2, '0b', 4, 0);
  assert.equal(s.nomeComandante(p, '0b'), 'Bia (2º)');
  assert.equal(s.textoEntrada(p, p.historico[0]), 'Jogador 3: +4 de dano do comandante de Bia (2º) (total 4, vida 36)');
  assert.match(view.painelHTML(p, s.disposicao(3, true), 2, 'cmd'), /Bia \(1º\)[\s\S]*Bia \(2º\)/);
});

test('quem fica sem vida sai da partida', () => {
  const p = partida(2, { comandante: false });
  s.mudarVida(p, 0, -40, 0);
  assert.deepEqual(s.derrota(p, 0), { motivo: 'vida' });
});

test('desfazer volta a última mudança de vida ou de comandante, passando por cima dos dados', () => {
  const p = partida();
  s.mudarVida(p, 0, -5, 0);
  s.mudarComandante(p, 1, '0', 7, 10_000);
  s.rolar(p, 20, () => 0.5, 20_000);
  assert.equal(s.desfazer(p).tipo, 'cmd');
  assert.equal(p.jogadores[1].vida, 40);
  assert.deepEqual(p.jogadores[1].cmd, {});
  assert.equal(s.desfazer(p).tipo, 'vida');
  assert.equal(p.jogadores[0].vida, 40);
  assert.equal(s.desfazer(p), null);
  assert.equal(s.podeDesfazer(p), false);
  assert.equal(p.historico.length, 1, 'o d20 fica no histórico');
});

test('d6, d20 e moeda caem entre o primeiro e o último lado', () => {
  const p = partida();
  assert.deepEqual(s.rolar(p, 6, () => 0, 0), { t: 0, tipo: 'dado', lados: 6, resultado: 1 });
  assert.equal(s.rolar(p, 6, () => 0.9999, 0).resultado, 6);
  assert.equal(s.rolar(p, 20, () => 0.9999, 0).resultado, 20);
  assert.equal(s.rolar(p, 2, () => 0, 0).resultado, 'cara');
  assert.equal(s.rolar(p, 2, () => 0.7, 0).resultado, 'coroa');
  assert.equal(s.textoEntrada(p, p.historico.at(-1)), 'Moeda: Coroa');
});

test('cada jogador tem um lugar só, e a grade inteira fica coberta', () => {
  for (const deitado of [false, true]) {
    for (let n = s.MIN_JOGADORES; n <= s.MAX_JOGADORES; n++) {
      const d = s.disposicao(n, deitado);
      assert.deepEqual(d.lugares.map(l => l.jogador).sort((a, b) => a - b), [...Array(n).keys()]);
      const celulas = new Set();
      for (const l of d.lugares) {
        for (let r = l.linha; r < l.linha + l.linhas; r++) {
          for (let c = l.coluna; c < l.coluna + l.colunas; c++) {
            assert.ok(r <= d.linhas && c <= d.colunas, `${n} ${deitado}: fora da grade`);
            assert.ok(!celulas.has(`${r},${c}`), `${n} ${deitado}: lugar repetido`);
            celulas.add(`${r},${c}`);
          }
        }
      }
      assert.equal(celulas.size, d.linhas * d.colunas, `${n} jogadores ${deitado ? 'deitado' : 'em pé'}: sobra espaço`);
    }
  }
});

test('em pé, os jogadores ficam dos lados virados para fora; deitado, em cima e embaixo', () => {
  const lados = d => d.lugares.map(l => l.lado).join(' ');
  assert.equal(lados(s.disposicao(4, false)), 'esq esq dir dir');
  assert.equal(lados(s.disposicao(3, false)), 'baixo esq dir');
  assert.equal(lados(s.disposicao(2, false)), 'baixo cima');
  assert.equal(lados(s.disposicao(5, true)), 'baixo cima cima baixo baixo');
  // O 1 embaixo à esquerda e a ordem segue o sentido horário.
  const quatro = s.disposicao(4, false).lugares;
  assert.deepEqual(quatro.map(l => [l.linha, l.coluna]), [[2, 1], [1, 1], [1, 2], [2, 2]]);
});

test('a partida guardada só volta se estiver inteira', () => {
  const p = partida(3);
  assert.ok(s.lerPartida(JSON.parse(JSON.stringify(p))));
  assert.equal(s.lerPartida({ ...p, jogadores: [] }), null);
  assert.equal(s.lerPartida('lixo'), null);
  const c = s.lerConfig({ vidaInicial: 30, comandante: 1, jogadores: [{ nome: 'A', cor: '#000' }, { nome: 2 }] });
  assert.equal(c.comandante, true);
  assert.equal(c.jogadores[0].cor, s.CORES[0], 'cor desconhecida volta para a da posição');
  assert.equal(c.jogadores[1].nome, '2');
});

test('o nome do jogador vai escapado para a tela', () => {
  const c = s.comJogadores(s.configPadrao(), 2);
  c.jogadores[0].nome = '<b>x</b>';
  const p = s.novaPartida(c, 0);
  const html = view.mesaHTML(p, s.disposicao(2, false), new Map());
  assert.ok(!html.includes('<b>x</b>'));
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
});

test('cada jogador vê as mudanças na própria vida, com o dano de comandante, a mais nova primeiro', () => {
  const p = partida();
  s.mudarVida(p, 0, -3, 1000);
  s.rolar(p, 6, () => 0, 2000);
  s.mudarVida(p, 1, 2, 3000);
  s.mudarComandante(p, 0, '2', 4, 10_000);
  const ana = s.mudancasDe(p, 0);
  assert.deepEqual(ana.map(e => [e.tipo, s.deltaVida(e)]), [['cmd', -4], ['vida', -3]]);
  assert.match(view.ultimaHTML(p, 0, 10_000), /−4<\/b><span>agora/);
  assert.equal(view.ultimaHTML(partida(), 0), '');
});

test('há quanto tempo foi a mudança', () => {
  assert.equal(view.quandoTexto(0, 9_000), 'agora');
  assert.equal(view.quandoTexto(0, 42_000), 'há 42 s');
  assert.equal(view.quandoTexto(0, 3 * 60_000 + 5_000), 'há 3 min');
  assert.match(view.quandoTexto(0, 2 * 3_600_000), /^às \d\d:\d\d$/);
});

test('o mapa do dano de comandante mostra a mesa vista do lugar de quem olha', () => {
  const onde = (vista, j) => { const l = vista.lugares.find(x => x.jogador === j); return [l.linha, l.coluna]; };
  // Em pé, 4 jogadores: o 1 senta à esquerda da tela, embaixo. Para ele, o 2 (acima dele na tela) fica à esquerda e
  // perto, o 3 do outro lado à esquerda, o 4 do outro lado à direita, e ele mesmo perto, à direita.
  const d = s.disposicao(4, false);
  const v1 = s.vistaDe(d, 'esq');
  assert.deepEqual([v1.linhas, v1.colunas], [2, 2]);
  assert.deepEqual([0, 1, 2, 3].map(j => onde(v1, j)), [[2, 2], [2, 1], [1, 1], [1, 2]]);
  // O 4 senta à direita, embaixo: o próprio lugar fica perto, à esquerda dele, e o 1 bem à frente, à esquerda.
  const v4 = s.vistaDe(d, 'dir');
  assert.deepEqual([0, 1, 2, 3].map(j => onde(v4, j)), [[1, 1], [1, 2], [2, 2], [2, 1]]);
  // Deitado, quem senta em cima vê a mesa de ponta-cabeça: o próprio lugar embaixo.
  const deitado = s.disposicao(5, true), cima = s.vistaDe(deitado, 'cima');
  assert.equal(onde(cima, 1)[0], 2);
  assert.equal(onde(cima, 0)[0], 1);
  // Em pé com 6, quem senta do lado vê duas fileiras de três.
  const seis = s.vistaDe(s.disposicao(6, false), 'esq');
  assert.deepEqual([seis.linhas, seis.colunas], [2, 3]);
});

test('o mapa cobre a grade inteira, de qualquer lado, sem lugar repetido', () => {
  for (const deitado of [false, true]) {
    for (let n = s.MIN_JOGADORES; n <= s.MAX_JOGADORES; n++) {
      const d = s.disposicao(n, deitado);
      for (const lado of ['baixo', 'cima', 'esq', 'dir']) {
        const v = s.vistaDe(d, lado), celulas = new Set();
        for (const l of v.lugares) for (let r = l.linha; r < l.linha + l.linhas; r++) for (let c = l.coluna; c < l.coluna + l.colunas; c++) {
          assert.ok(r >= 1 && c >= 1 && r <= v.linhas && c <= v.colunas, `${n} ${deitado} ${lado}: fora da grade`);
          assert.ok(!celulas.has(`${r},${c}`), `${n} ${deitado} ${lado}: repetido`);
          celulas.add(`${r},${c}`);
        }
        assert.equal(celulas.size, v.linhas * v.colunas);
      }
    }
  }
});

test('nome, cor e parceiro mudados na configuração valem na partida em andamento', () => {
  const p = partida(3);
  s.mudarVida(p, 0, -5, 0);
  const c = structuredClone(p.config);
  c.jogadores[0].nome = 'Ana'; c.jogadores[1].cor = s.CORES[5]; c.jogadores[2].parceiro = true;
  s.aplicarConfig(p, c);
  assert.equal(s.nomeDe(p, 0), 'Ana');
  assert.equal(p.jogadores[1].cor, s.CORES[5]);
  assert.deepEqual(s.comandantesDe(p, 2), ['2', '2b']);
  assert.equal(p.jogadores[0].vida, 35, 'a vida marcada continua');
  // Recomeçar mantém os nomes novos.
  assert.equal(s.nomeDe(s.reiniciar(p), 0), 'Ana');
  // Tirar o parceiro depois de o 2º comandante causar dano não vale: o dano marcado continua com dono.
  s.mudarComandante(p, 0, '2b', 3, 0);
  s.aplicarConfig(p, { ...c, jogadores: c.jogadores.map((j, i) => i === 2 ? { ...j, parceiro: false } : j) });
  assert.equal(p.jogadores[2].parceiro, true);
  // Com menos jogadores na configuração, só os que existem nas duas mudam.
  s.aplicarConfig(p, s.comJogadores({ ...c, jogadores: c.jogadores.map(j => ({ ...j, nome: 'X' })) }, 2));
  assert.deepEqual(p.jogadores.map((_, i) => s.nomeDe(p, i)), ['X', 'X', 'Jogador 3']);
});
