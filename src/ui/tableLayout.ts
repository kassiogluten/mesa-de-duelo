// Medidas da mesa depois de cada desenho: o campo numa linha ou em duas fileiras no celular deitado, fileiras que encolhem para caber, a fileira sozinha que cresce, a mão que se
// encaixa com a prateleira do exílio, a caixa de decisão da mão, os selos que viram um só, os seus selos em volta do retrato, a pilha que não cobre os botões
// e as setas de rolar dos assentos. Tudo lê o DOM já desenhado; nada aqui muda o que a mesa mostra, só onde e de que tamanho.

const q = (root: HTMLElement, sel: string) => root.querySelector(sel) as HTMLElement;

/** Celular deitado: a mesma condição das regras de CSS que usam .one-line e .two-lines (phoneTable.css). */
const lowLandscape = matchMedia('(orientation: landscape) and (max-height: 500px)');
const px = (value: string) => parseFloat(value) || 0;

/**
 * Largura que as cartas de uma fileira ocupam, caiba ou não na largura atual. Pela posição delas e não pelo scrollWidth,
 * que as cartas em movimento (chegando de outro lugar da mesa) esticam por um instante.
 */
function rowExtent(row: HTMLElement) {
  const first = row.firstElementChild as HTMLElement | null, last = row.lastElementChild as HTMLElement | null;
  return first && last ? last.offsetLeft + last.offsetWidth - first.offsetLeft : 0;
}
/** O que a fileira pede do campo: as cartas, o respiro e as margens dela. */
function rowNeed(row: HTMLElement) {
  const style = getComputedStyle(row);
  return rowExtent(row) + px(style.paddingLeft) + px(style.paddingRight) + px(style.marginLeft) + px(style.marginRight);
}
/**
 * Celular deitado: cada campo fica numa linha só (terrenos ao lado das criaturas, cartas da altura do campo) enquanto
 * couber, e passa a duas fileiras (criaturas na largura toda, terrenos e o resto na outra) quando não cabe mais.
 * "Cabe" aceita encolher as cartas da linha até o tamanho que as duas fileiras já dariam às criaturas.
 * Fora do celular deitado nenhum campo ganha classe: vale o arranjo do CSS de sempre.
 */
function fitFieldLines(root: HTMLElement) {
  for (const field of root.querySelectorAll<HTMLElement>('.forge > .field, .table-seat > .field')) {
    field.classList.remove('one-line', 'two-lines');
    field.style.removeProperty('--line-h');
    if (!lowLandscape.matches || !field.clientHeight) continue;
    field.classList.add('one-line');
    const rows = [...field.querySelectorAll<HTMLElement>('.row')].filter(row => row.childElementCount > 0);
    // Com uma fileira só não há o que dividir: ela cresce e encolhe pelas regras de sempre.
    if (rows.length < 2) continue;
    // As medidas partem do tamanho cheio: sem o ajuste de largura nem a fileira sozinha do desenho anterior, que esconderia a outra.
    for (const row of rows) { row.style.removeProperty('--ch'); row.style.removeProperty('--cw'); row.classList.remove('lone'); }
    const slot = field.querySelector<HTMLElement>('.row.creatures .slot');
    if (!slot) continue;
    // O piso é a altura que as criaturas teriam nas duas fileiras: abaixo dela, a linha só já não compensa.
    field.classList.replace('one-line', 'two-lines');
    const min = slot.offsetHeight;
    field.classList.replace('two-lines', 'one-line');
    const style = getComputedStyle(field);
    const room = field.clientWidth - px(style.paddingLeft) - px(style.paddingRight);
    const need = () => rows.reduce((sum, row) => sum + rowNeed(row), 0);
    let h = slot.offsetHeight;
    let fits = need() <= room + 1;
    // Os espaços entre as cartas não encolhem junto: algumas medidas acertam o tamanho.
    for (let i = 0; i < 5 && !fits && h > min; i++) {
      h = Math.max(min, Math.min(h - 1, Math.floor(h * room / need())));
      field.style.setProperty('--line-h', `${h}px`);
      fits = need() <= room + 1;
    }
    if (fits) continue;
    field.style.removeProperty('--line-h');
    field.classList.replace('one-line', 'two-lines');
  }
}

/** Com uma das fileiras do campo vazia, a outra ganha a altura livre do campo (--lone-h); o CSS limita o tamanho. */
function fitLoneRows(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.field').forEach(field => {
    const rows = [...field.querySelectorAll<HTMLElement>(':scope > .row')];
    const filled = rows.filter(row => row.childElementCount > 0);
    const lone = rows.length > 1 && filled.length === 1 ? filled[0] : null;
    for (const row of rows) {
      row.classList.toggle('lone', row === lone);
      if (row !== lone) row.style.removeProperty('--lone-h');
    }
    if (!lone) return;
    const pad = (style: CSSStyleDeclaration) => px(style.paddingTop) + px(style.paddingBottom);
    const free = field.clientHeight - pad(getComputedStyle(field)) - pad(getComputedStyle(lone));
    lone.style.setProperty('--lone-h', `${Math.max(0, Math.floor(free))}px`);
  });
}
/**
 * Fileira do campo que não cabe na largura: as cartas dela encolhem até caber, no máximo até 60% do tamanho cheio
 * (e nunca abaixo de 48px, que já é o tamanho do celular); passando disso, a fileira rola para o lado como antes.
 * O tamanho cheio é o do CSS (e da fileira sozinha no campo): por isso cada desenho começa sem o ajuste anterior.
 */
function fitRowWidths(root: HTMLElement) {
  const rows = [...root.querySelectorAll<HTMLElement>('.field .row.creatures, .field .row.lands')];
  for (const row of rows) { row.style.removeProperty('--ch'); row.style.removeProperty('--cw'); }
  for (const row of rows) {
    const full = row.querySelector<HTMLElement>('.slot')?.offsetHeight ?? 0;
    if (!full) continue;
    const style = getComputedStyle(row), pad = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    // A fileira de cima de um oponente no celular (terrenos e o resto, em duas fileiras) pode ficar menor: ali basta contar.
    const least = row.matches('.table-seat > .field.two-lines .row.lands') ? 30 : 48;
    const floor = Math.min(full, Math.max(Math.round(full * .6), least));
    let h = full;
    // Os espaços entre as cartas não encolhem junto: duas ou três medidas acertam o tamanho.
    // Na linha só do celular a fileira tem a largura das cartas: qualquer carta em movimento a faria encolher à toa.
    const byPosition = row.closest('.field.one-line') !== null;
    for (let i = 0; i < 4 && h > floor; i++) {
      const room = row.clientWidth - pad, used = byPosition ? rowExtent(row) : row.scrollWidth - pad;
      if (room <= 0 || used <= room + 1) break;
      h = Math.max(floor, Math.min(h - 1, Math.floor(h * room / used)));
      row.style.setProperty('--ch', `${h}px`);
      row.style.setProperty('--cw', `${(h * .716).toFixed(2)}px`);
    }
  }
}
/** As três medidas dos campos, na ordem em que uma depende da outra: o arranjo, a fileira sozinha e a largura. */
export function fitFields(root: HTMLElement) { fitFieldLines(root); fitLoneRows(root); fitRowWidths(root); }
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
/**
 * Os seus selos e emblemas em volta do retrato (gameplay.css): o ângulo (--a) e a distância do centro (--r) de cada
 * disco, um ao lado do outro sem se encostar, pelo tamanho que o retrato e os discos têm agora. Primeiro os selos,
 * depois os emblemas. Descem pelo lado direito (do alto até antes da vida) e depois pelo esquerdo, numa volta e, se
 * precisar, em outras mais para fora. Uma posição que deixaria o disco fora da tela, ou por cima do grimório, do
 * cemitério, do exílio, da zona de comando, da mão ou da vida, fica vazia: nada cobre as suas pilhas, em nenhum layout (duelo, Commander, celular).
 */
export function layoutPortraitCounters(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.portrait:has(> .player-counters, > .emblems)').forEach(portrait => {
    const discs = [...portrait.querySelectorAll<HTMLElement>(':scope > .player-counters > *, :scope > .emblems > .emblem')];
    const size = portrait.offsetWidth, d = Math.max(0, ...discs.map(disc => disc.offsetWidth));
    if (!size || !d) return;
    const box = portrait.getBoundingClientRect(), cx = box.left + size / 2, cy = box.top + size / 2;
    const rects = (sel: string) => [...root.querySelectorAll(sel)].map(el => el.getBoundingClientRect()).filter(r => r.width && r.height);
    const blocked = rects('#fMePiles > *, #fCommand:not([hidden]) > *'), hand = rects('#fHand > *');
    // A vida é um círculo: conta a distância até o centro dela, não a caixa.
    const lifeBox = portrait.closest('.avatar')?.querySelector(':scope > .life')?.getBoundingClientRect();
    const life = lifeBox?.width ? { x: lifeBox.left + lifeBox.width / 2, y: lifeBox.top + lifeBox.height / 2, r: Math.max(lifeBox.width, lifeBox.height) / 2 } : null;
    const width = innerWidth, height = innerHeight;
    // O disco e a etiqueta do número, no canto de baixo à direita: 0 cabe, 1 só encosta na mão, 2 não cabe.
    const fits = (a: number, r: number) => {
      const x = cx + Math.cos(a * Math.PI / 180) * r, y = cy + Math.sin(a * Math.PI / 180) * r;
      const l = x - d / 2, t = y - d / 2, rt = x + d / 2 + 6, b = y + d / 2 + 5;
      const hits = (o: DOMRect) => l < o.right && o.left < rt && t < o.bottom && o.top < b;
      if (life && Math.hypot(x - life.x, y - life.y) < life.r + d / 2) return 2;
      if (l < 2 || t < 2 || rt > width - 2 || b > height - 2 || blocked.some(hits)) return 2;
      return hand.some(hits) ? 1 : 0;
    };
    // Nas voltas de fora, o lado esquerdo só vai até o alto (no celular, ali em cima ficam as pilhas); da quarta em
    // diante, só o direito, até todos terem lugar.
    const GAP = 2, free: { a: number; r: number }[] = [], byHand: { a: number; r: number }[] = [];
    for (let lap = 0; free.length + byHand.length < discs.length && lap < 8; lap++) {
      const r = size / 2 + d * .2 + lap * (d + GAP), step = 2 * Math.asin(Math.min(1, (d / 2 + GAP / 2) / r)) * 180 / Math.PI;
      const angles: number[] = [];
      for (let a = lap < 3 ? -80 : -40; a <= 50; a += step) angles.push(a);
      if (lap < 3) for (let a = -80 - step; a >= (lap ? -150 : -230); a -= step) angles.push(a);
      for (const a of angles) { const fit = fits(a, r); if (fit === 0) free.push({ a, r }); else if (fit === 1) byHand.push({ a, r }); }
    }
    // Sem lugar livre para todos (muitos selos e emblemas num retrato pequeno), os últimos encostam no canto da mão.
    const slots = [...free, ...byHand];
    discs.forEach((disc, i) => {
      const slot = slots[i];
      if (!slot) return;
      disc.style.setProperty('--a', `${slot.a.toFixed(1)}deg`);
      disc.style.setProperty('--r', `${slot.r.toFixed(1)}px`);
    });
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
