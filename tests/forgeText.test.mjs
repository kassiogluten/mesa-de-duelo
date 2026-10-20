import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixPossessives } from '../src/ui/forgeText.ts';

test('your own zones read as "seu"/"sua"', () => {
  assert.equal(fixPossessives('Procurar você\'s grimório?'), 'Procurar seu grimório?');
  assert.equal(fixPossessives('Olhando as cartas em você\'s mão'), 'Olhando as cartas na sua mão');
  assert.equal(fixPossessives('Escolha uma carta de você\'s cemitério.'), 'Escolha uma carta do seu cemitério.');
});

test('other players keep their name after the zone', () => {
  assert.equal(fixPossessives('Olhando as cartas em Oponente\'s mão'), 'Olhando as cartas na mão de Oponente');
  assert.equal(fixPossessives('Procurar Oponente\'s grimório?'), 'Procurar o grimório de Oponente?');
  assert.equal(fixPossessives('Olhando as cartas em IA vermelho\'s mão', ['IA vermelho', 'Você']), 'Olhando as cartas na mão de IA vermelho');
  assert.equal(fixPossessives('Oponente\'s cemitério está vazio.'), 'O cemitério de Oponente está vazio.');
});

test('text without a possessive is untouched', () => {
  for (const text of ['Escolha um alvo.', "Lightning Bolt's damage", '']) assert.equal(fixPossessives(text), text);
});
