// Medidas da mesa depois de cada desenho: fileiras que encolhem para caber, a fileira sozinha que cresce, a mão que se
// encaixa com a prateleira do exílio, a caixa de decisão da mão, os selos que viram um só, a pilha que não cobre os botões
// e as setas de rolar dos assentos. Tudo lê o DOM já desenhado; nada aqui muda o que a mesa mostra, só onde e de que tamanho.

const q = (root: HTMLElement, sel: string) => root.querySelector(sel) as HTMLElement;

/** Com uma das fileiras do campo vazia, a outra ganha a altura livre do campo (--lone-h); o CSS limita o tamanho. */
export function fitLoneRows(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.field').forEach(field => {
    const rows = [...field.querySelectorAll<HTMLElement>(':scope > .row')];
    const filled = rows.filter(row => row.childElementCount > 0);
    const lone = rows.length > 1 && filled.length === 1 ? filled[0] : null;
    for (const row of rows) {
      row.classList.toggle('lone', row === lone);
      if (row !== lone) row.style.removeProperty('--lone-h');
    }
    if (!lone) return;
    const px = (style: CSSStyleDeclaration, ...props: ('paddingTop' | 'paddingBottom')[]) => props.reduce((sum, prop) => sum + (parseFloat(style[prop]) || 0), 0);
    const free = field.clientHeight - px(getComputedStyle(field), 'paddingTop', 'paddingBottom') - px(getComputedStyle(lone), 'paddingTop', 'paddingBottom');
    lone.style.setProperty('--lone-h', `${Math.max(0, Math.floor(free))}px`);
  });
}
/**
 * Fileira do campo que não cabe na largura: as cartas dela encolhem até caber, no máximo até 60% do tamanho cheio
 * (e nunca abaixo de 48px, que já é o tamanho do celular); passando disso, a fileira rola para o lado como antes.
 * O tamanho cheio é o do CSS (e da fileira sozinha no campo): por isso cada desenho começa sem o ajuste anterior.
 */
export function fitRowWidths(root: HTMLElement) {
  const rows = [...root.querySelectorAll<HTMLElement>('.field .row.creatures, .field .row.lands')];
  for (const row of rows) { row.style.removeProperty('--ch'); row.style.removeProperty('--cw'); }
  for (const row of rows) {
    const full = row.querySelector<HTMLElement>('.slot')?.offsetHeight ?? 0;
    if (!full) continue;
    const style = getComputedStyle(row), pad = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    const floor = Math.min(full, Math.max(Math.round(full * .6), 48));
    let h = full;
    // Os espaços entre as cartas não encolhem junto: duas ou três medidas acertam o tamanho.
    for (let i = 0; i < 4 && h > floor; i++) {
      const room = row.clientWidth - pad, used = row.scrollWidth - pad;
      if (room <= 0 || used <= room + 1) break;
      h = Math.max(floor, Math.min(h - 1, Math.floor(h * room / used)));
      row.style.setProperty('--ch', `${h}px`);
      row.style.setProperty('--cw', `${(h * .716).toFixed(2)}px`);
    }
  }
}
export function layoutExileShelf(root: HTMLElement) {
  const arena = root.querySelector<HTMLElement>('.forge')!;
  const hand = q(root, '#fHand');
  hand.style.removeProperty('--shelf-hand-overlap');
  if (!arena.classList.contains('has-exile-shelf') || hand.classList.contains('crowded')) return;
  const slots = [...hand.querySelectorAll<HTMLElement>('.hand-slot')];
  if (slots.length < 2) return;
  const width = slots[0]!.getBoundingClientRect().width; // há pelo menos 2 (conferido acima)
  const space = Math.max(width, hand.clientWidth - 24);
  const step = Math.max(14, Math.min(width * .66, (space - width) / (slots.length - 1)));
  hand.style.setProperty('--shelf-hand-overlap', `${step - width}px`);
}
export function layoutCardDecision(root: HTMLElement) {
  const arena = root.querySelector<HTMLElement>('.arena')!;
  const action = q(root, '#fAction');
  arena.style.removeProperty('grid-template-rows');
  action.style.removeProperty('max-height');
  if (!arena.classList.contains('has-hand-decision') || arena.classList.contains('multiplayer')) return;
  // Keep the whole choice scrollable between the phase track and the actual hand.
  const header = getComputedStyle(arena).gridTemplateRows.split(' ')[0]!;
  const hand = q(root, '#fHand').getBoundingClientRect();
  // A trilha de fases fica na linha do meio; o limite de cima é a faixa do oponente no topo da mesa.
  const topBottom = arena.getBoundingClientRect().top + parseFloat(header);
  action.style.maxHeight = `${Math.max(0, hand.top - 8 - topBottom - 12)}px`;
  const bottom = arena.getBoundingClientRect().bottom - action.getBoundingClientRect().top + 8;
  arena.style.gridTemplateRows = `${header} minmax(0, 1fr) 2px minmax(0, 1fr) ${Math.max(hand.height, bottom)}px`;
}
/** Marcadores e palavras-chave que encostam no P/T, um no outro ou cobrem mais de dois terços da carta viram um selo só. */
export function layoutCounters(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.bfc:has(> .ctr-sum)').forEach(card => {
    const child = (sel: string) => card.querySelector<HTMLElement>(`:scope > ${sel}`);
    const counters = child('.counters'), kws = child('.kws'), pt = child('.pt');
    card.classList.remove('crowded');
    counters?.style.removeProperty('max-width');
    // Na carta comum, os marcadores quebram em linhas antes do P/T em vez de passar por baixo dele.
    if (counters && pt && !card.classList.contains('ar-field')) {
      const room = pt.offsetLeft - counters.offsetLeft - 2;
      if (room < counters.offsetWidth) counters.style.maxWidth = `${Math.max(0, room)}px`;
    }
    const box = (el: HTMLElement | null) => el && { left: el.offsetLeft, top: el.offsetTop, right: el.offsetLeft + el.offsetWidth, bottom: el.offsetTop + el.offsetHeight };
    const [c, k] = [box(counters), box(kws)];
    // Dois terços da carta, com uma folga para três linhas de habilidades caberem certinho.
    const limit = card.offsetHeight / 3 - 2;
    const crowded = (counters && counters.scrollWidth > counters.clientWidth + 1) || (c && c.top < limit) || (k && k.top < limit)
      || (c && k && c.left < k.right && k.left < c.right && c.top < k.bottom && k.top < c.bottom);
    card.classList.toggle('crowded', !!crowded);
  });
}
export function layoutStack(root: HTMLElement) {
  const arena = root.querySelector<HTMLElement>('.arena')!;
  const panel = q(root, '#fStack');
  arena.classList.remove('stack-tight');
  arena.style.removeProperty('--stack-active-width');
  for (const property of ['--stack-width', 'top', 'transform']) panel.style.removeProperty(property);
  if (panel.hidden || panel.classList.contains('minimized')) return;
  const pile = panel.querySelector<HTMLElement>('.stack-pile');
  if (!pile) return;
  const action = q(root, '#fAction').getBoundingClientRect();
  const natural = panel.getBoundingClientRect();
  const arenaBox = arena.getBoundingClientRect();
  const topSafe = (parseFloat(getComputedStyle(arena).gridTemplateRows.split(' ')[0]!) || 48) + 12;
  const overlapsAction = natural.right > action.left - 12 && natural.left < action.right + 12;
  const bottomSafe = overlapsAction ? action.top - arenaBox.top - 18 : arenaBox.height - 18;
  if (natural.top - arenaBox.top >= topSafe && natural.bottom - arenaBox.top <= bottomSafe) return;
  if (natural.height <= bottomSafe - topSafe) {
    const top = Math.max(topSafe, Math.min(natural.top - arenaBox.top, bottomSafe - natural.height));
    panel.style.top = `${top}px`;
    panel.style.transform = 'none';
    return;
  }
  const pileBox = pile.getBoundingClientRect();
  const fanTop = Math.min(pileBox.top, ...[...pile.querySelectorAll('.stack-layer')].map(layer => layer.getBoundingClientRect().top));
  const overhang = Math.max(38, pileBox.top - fanTop);
  const available = Math.max(70, bottomSafe - topSafe - overhang);
  const width = Math.min(pile.getBoundingClientRect().width, available * 488 / 680);
  arena.classList.add('stack-tight');
  arena.style.setProperty('--stack-active-width', `${width}px`);
  panel.style.setProperty('--stack-width', `${width}px`);
  panel.style.top = `${Math.max(topSafe + overhang, bottomSafe - width * 680 / 488)}px`;
  panel.style.transform = 'none';
}
export function syncSeatScroll(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.seat-row').forEach(lane => {
    const row = lane.querySelector<HTMLElement>('.row')!;
    const overflow = row.scrollWidth - row.clientWidth > 2;
    lane.classList.toggle('scrollable', overflow);
    lane.querySelector<HTMLButtonElement>('.back-scroll')!.hidden = !overflow || row.scrollLeft < 2;
    lane.querySelector<HTMLButtonElement>('.forward-scroll')!.hidden = !overflow || row.scrollLeft + row.clientWidth >= row.scrollWidth - 2;
  });
}
