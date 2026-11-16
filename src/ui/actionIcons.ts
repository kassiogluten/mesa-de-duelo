// O ícone ao lado do texto de cada botão da caixa de ação (passar, fim de turno, resolver, atacar, bloquear, pagar, desistir).

/*
 * Um conjunto só, desenhado junto: traço de mesma espessura, pontas e cantos arredondados, tudo dentro da mesma
 * área (2 a 22 na grade de 24), para que nenhum pareça maior ou mais pesado que o vizinho ao lado do texto.
 * O traço é currentColor: segue a cor do texto do botão (escuro no dourado, claro no azul, apagado na espera).
 */
const line = (...paths: string[]) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">${paths.map(d => `<path d="${d}"/>`).join('')}</svg>`;
/** Seta circular em volta: a resposta fica guardada ("Sempre sim", "Sempre não"). */
const always = (...inner: string[]) => line('M20.5 12A8.5 8.5 0 1 1 18 6l2.5 2.5', 'M20.5 3.5v5h-5', ...inner);

export const ACTION_ICON = {
  /** Passar e "Para o combate", "Para a principal 2"...: o jogo segue em frente. */
  pass: line('M4.5 12h14', 'M13 6l6 6-6 6'),
  /** Fim de turno: avança direto até o fim (duas setas e a barra de parada). */
  endTurn: line('M4 6l6 6-6 6', 'M11.5 6l6 6-6 6', 'M21 5v14'),
  /** Resolver todos: a pilha inteira. */
  resolveAll: line('M12 3 2.5 7.75 12 12.5l9.5-4.75z', 'M2.5 12.25 12 17l9.5-4.75', 'M2.5 16.75 12 21.5l9.5-4.75'),
  ok: line('M4.5 12.5l5 5L19.5 7'),
  cancel: line('M6 6l12 12', 'M18 6 6 18'),
  alwaysYes: always('M8 12.25l2.75 2.75 5-5.25'),
  alwaysNo: always('M9.25 9.25l5.5 5.5', 'M14.75 9.25l-5.5 5.5'),
  /** Atacar: a espada com a ponta para cima, com guarda e punho. */
  attack: line('M9.5 17.5 21 6V3h-3L6.5 14.5', 'M11 19l-6-6', 'M8 16l-4 4', 'M5 21l-2-2'),
  /** Bloquear: o escudo, com o friso do meio. */
  block: line('M12 21.5c-4.6-1.7-8-5.6-8-10.75V5.5L12 2.5l8 3v5.25c0 5.15-3.4 9.05-8 10.75z', 'M12 2.5v19'),
  /** Pagar automaticamente: a gota de mana. */
  mana: line('M12 2.5c3.4 4.5 6.5 8.1 6.5 12a6.5 6.5 0 0 1-13 0c0-3.9 3.1-7.5 6.5-12z', 'M9 15a3 3 0 0 0 3 3'),
  /** Pagar com vida (mana phyrexiana). */
  life: line('M12 20.5 4.2 12.8A4.9 4.9 0 0 1 12 6.6a4.9 4.9 0 0 1 7.8 6.2z'),
  /** Mandar o comandante para a zona de comando. */
  commander: line('M3 7.5l4.5 4.25L12 4.5l4.5 7.25L21 7.5l-2 10.5H5z', 'M5.5 21h13'),
  /** Mulligan: embaralhar a mão de volta. */
  mulligan: line('M3 17h2.6c1.3 0 2.5-.65 3.2-1.7l5.9-8.6c.7-1.05 1.9-1.7 3.2-1.7H21', 'M18 2.5 21 5l-3 2.5', 'M3 7h2.6c1.3 0 2.5.65 3.2 1.7l.6.9', 'M21 17h-3.1c-1.3 0-2.5-.65-3.2-1.7l-.6-.9', 'M18 14.5l3 2.5-3 2.5'),
  /** Ver resultado: a bandeira de fim de jogo. */
  result: line('M5 21.5V3.5', 'M5 4h12.5L15 8.5l2.5 4.5H5'),
  /** Esperando: a ampulheta. */
  waiting: line('M5.5 2.5h13', 'M5.5 21.5h13', 'M7 2.5v3.6c0 .9.4 1.7 1 2.3l4 3.6 4-3.6c.6-.6 1-1.4 1-2.3V2.5', 'M7 21.5v-3.6c0-.9.4-1.7 1-2.3l4-3.6 4 3.6c.6.6 1 1.4 1 2.3v3.6'),
  /** Mostrando a jogada: o olho. */
  showing: line('M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'),
};
export type ActionIcon = keyof typeof ACTION_ICON;

/** Os rótulos genéricos que o Forge manda (OK, Sim, Cancelar, Não...); as escolhas da carta ("Cara", "Azul", um modo) ficam sem ícone. */
export function guessActionIcon(label: string): ActionIcon | undefined {
  const text = label.trim().toLowerCase();
  if (/^(ok|sim|confirmar|pronto|concluído|aceitar|yes|done|confirm)$/.test(text)) return 'ok';
  if (/^(cancelar|não|desistir|recusar|no|cancel)$/.test(text)) return 'cancel';
  if (text === 'mulligan') return 'mulligan';
  return undefined;
}

export const actionIconHTML = (icon: ActionIcon | undefined) => icon ? `<span class="act-icon">${ACTION_ICON[icon]}</span>` : '';
