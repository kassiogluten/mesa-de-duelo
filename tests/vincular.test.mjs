// Ligar a mesa no PC (/vincular): o código do endereço e o que a página mostra em cada momento.
import test from 'node:test';
import assert from 'node:assert/strict';

const { codeFromQuery, formatCode, linkHTML } = await import('../src/vincular/view.ts');

test('the code comes from ?codigo= only when it is a real code', () => {
  assert.equal(codeFromQuery('?codigo=ABCD-EFGH'), 'ABCDEFGH');
  assert.equal(codeFromQuery('?codigo=abcd efgh'), 'ABCDEFGH');
  assert.equal(codeFromQuery('?codigo=ABCD'), '');
  assert.equal(codeFromQuery('?codigo=ABCDEFG0'), '', 'sem 0, 1, I e O, como no servidor');
  assert.equal(codeFromQuery('?codigo=<script>'), '');
  assert.equal(codeFromQuery(''), '');
  assert.equal(formatCode('ABCDEFGH'), 'ABCD-EFGH');
});

test('each moment of the page', () => {
  assert.match(linkHTML({ kind: 'sem-codigo' }, ''), /Entrar com Google/);
  const login = linkHTML({ kind: 'entrar', erro: 'O Google não confirmou' }, 'ABCDEFGH');
  assert.match(login, /ABCD-EFGH/);
  assert.match(login, /data-google/);
  assert.match(login, /role="alert">O Google não confirmou/);
  const ask = linkHTML({ kind: 'confirmar', nome: '<b>Ana</b>' }, 'ABCDEFGH');
  assert.match(ask, /Ligar a mesa no PC à sua conta\?/);
  assert.match(ask, /&lt;b&gt;Ana/, 'o nome vem escapado');
  assert.match(ask, /data-confirmar>Ligar a mesa</);
  assert.match(ask, /Não fui eu/);
  assert.match(linkHTML({ kind: 'confirmar', nome: 'Ana', enviando: true }, 'ABCDEFGH'), /data-confirmar disabled>Ligando…/);
  assert.match(linkHTML({ kind: 'pronto', nome: 'Ana' }, 'ABCDEFGH'), /Pode fechar esta página/);
  assert.match(linkHTML({ kind: 'recusado' }, 'ABCDEFGH'), /Nada foi ligado/);
});
