// Escolher uma cor, a proteção contra uma cor (ou artefatos) ou um tipo de terreno básico: os símbolos grandes, com o nome em português, no lugar da lista de nomes em inglês ("WHITE", "Mountain"); um toque responde.
import type { FQuestion } from '../forge/client';
import { esc, pip } from './cardtext';

interface Token { sym: string; name: string; order: number }
const COLOR: Record<string, Token> = {
  white: { sym: 'W', name: 'Branco', order: 0 }, branco: { sym: 'W', name: 'Branco', order: 0 }, branca: { sym: 'W', name: 'Branco', order: 0 },
  blue: { sym: 'U', name: 'Azul', order: 1 }, azul: { sym: 'U', name: 'Azul', order: 1 },
  black: { sym: 'B', name: 'Preto', order: 2 }, preto: { sym: 'B', name: 'Preto', order: 2 }, preta: { sym: 'B', name: 'Preto', order: 2 },
  red: { sym: 'R', name: 'Vermelho', order: 3 }, vermelho: { sym: 'R', name: 'Vermelho', order: 3 }, vermelha: { sym: 'R', name: 'Vermelho', order: 3 },
  green: { sym: 'G', name: 'Verde', order: 4 }, verde: { sym: 'G', name: 'Verde', order: 4 },
  colorless: { sym: 'C', name: 'Incolor', order: 5 }, incolor: { sym: 'C', name: 'Incolor', order: 5 },
  artifact: { sym: 'A', name: 'Artefatos', order: 6 }, artifacts: { sym: 'A', name: 'Artefatos', order: 6 }, artefato: { sym: 'A', name: 'Artefatos', order: 6 }, artefatos: { sym: 'A', name: 'Artefatos', order: 6 },
};
const LAND: Record<string, Token> = {
  plains: { sym: 'W', name: 'Planície', order: 0 }, 'planície': { sym: 'W', name: 'Planície', order: 0 },
  island: { sym: 'U', name: 'Ilha', order: 1 }, ilha: { sym: 'U', name: 'Ilha', order: 1 },
  swamp: { sym: 'B', name: 'Pântano', order: 2 }, 'pântano': { sym: 'B', name: 'Pântano', order: 2 },
  mountain: { sym: 'R', name: 'Montanha', order: 3 }, montanha: { sym: 'R', name: 'Montanha', order: 3 },
  forest: { sym: 'G', name: 'Floresta', order: 4 }, floresta: { sym: 'G', name: 'Floresta', order: 4 },
};

export type ColorKind = 'color' | 'protection' | 'land';
const labels = (q: FQuestion) => (q.options ?? []).map(o => (typeof o === 'string' ? o : o.label).trim().toLowerCase());

/** Uma escolha de uma opção só entre cores (ou artefatos) ou entre tipos de terreno básico; senão, null. */
export function colorKind(q: FQuestion): ColorKind | null {
  if (q.kind !== 'choose' || q.purpose || (q.max ?? 1) !== 1) return null;
  const all = labels(q);
  if (all.length < 2) return null;
  if (all.every(l => LAND[l])) return 'land';
  if (!all.every(l => COLOR[l])) return null;
  // A proteção vem em minúsculas ("white") e pode ter artefatos; a cor do Forge vem em maiúsculas ("WHITE").
  return /prote/i.test(q.title) || all.some(l => COLOR[l]!.sym === 'A') ? 'protection' : 'color';
}
export const isColorChoice = (q: FQuestion) => colorKind(q) !== null;

/** O nome em português de uma cor ou tipo de terreno básico que o Forge escreveu ("white", "Mountain"); senão, o próprio texto. */
export function colorName(label: string) {
  const key = label.trim().toLowerCase();
  return (COLOR[key] ?? LAND[key])?.name ?? label;
}

const ARTIFACT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 2.3 6.8 3.8L12 11.9 5.2 8.1 12 4.3ZM5 9.8l6 3.4v6.6l-6-3.4V9.8Zm8 10V13.2l6-3.4v6.6l-6 3.4Z"/></svg>';
const ASK: Record<ColorKind, string> = { color: 'escolha uma cor', protection: 'proteção contra…', land: 'escolha um tipo de terreno básico' };

/** A janela: um botão redondo por opção, na ordem branco, azul, preto, vermelho, verde. */
export function colorChoiceHTML(q: FQuestion, cardName: string | undefined) {
  const kind = colorKind(q)!;
  const table = kind === 'land' ? LAND : COLOR;
  const items = labels(q).map((l, i) => ({ i, t: table[l]! })).sort((a, b) => a.t.order - b.t.order);
  const ask = ASK[kind];
  const title = cardName ? `${cardName}: ${ask}` : ask[0]!.toUpperCase() + ask.slice(1);
  const buttons = items.map(({ i, t }) => `<button class="color-opt" data-q-opt="${i}"><span class="color-dot dot-${t.sym}">${t.sym === 'A' ? ARTIFACT : pip(t.sym)}</span><span>${esc(t.name)}</span></button>`).join('');
  return `<div class="q-head"><h2>${esc(title)}</h2><button class="icon-btn q-minimize" data-ui="question-minimize" aria-label="Ver a mesa sem perder esta escolha">Ver a mesa</button></div>
    <div class="color-opts">${buttons}</div>
    ${(q.min ?? 1) === 0 ? '<div class="q-actions"><button class="arena-btn secondary" data-q-none>Não escolher</button></div>' : ''}`;
}
