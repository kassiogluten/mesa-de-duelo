/**
 * Roda do mouse nas faixas que só rolam para o lado (mão, campo, exílio, escolhas de cartas):
 * na web isso pede Shift; na mesa, a roda sozinha já rola a faixa. Na ponta da faixa o giro
 * segue para quem está atrás (a área dos oponentes, por exemplo), e o touchpad, que já rola
 * para o lado, fica como está.
 */
function wheelStep(deltaY: number, deltaMode: number, pageWidth: number) {
  return deltaMode === 1 ? deltaY * 40 : deltaMode === 2 ? deltaY * pageWidth : deltaY;
}

/** A faixa sob o ponteiro que rola só para o lado e ainda tem para onde ir no sentido do giro. */
function sidewaysStrip(from: Element | null, step: number, stop: Element) {
  for (let el = from; el && el !== stop.parentElement; el = el.parentElement) {
    if (!(el instanceof HTMLElement) || el.scrollWidth <= el.clientWidth + 1) continue;
    const style = getComputedStyle(el);
    if (!/auto|scroll/.test(style.overflowX)) continue;
    if (/auto|scroll/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1) return null;
    const room = step > 0 ? el.scrollWidth - el.clientWidth - el.scrollLeft : el.scrollLeft;
    if (room > 1) return el;
  }
  return null;
}

export function installWheelSideways(root: HTMLElement) {
  root.addEventListener('wheel', e => {
    if (e.shiftKey || e.ctrlKey || e.defaultPrevented || !e.deltaY || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
    const strip = sidewaysStrip(e.target as Element, e.deltaY, root);
    if (!strip) return;
    e.preventDefault();
    strip.scrollBy({ left: wheelStep(e.deltaY, e.deltaMode, strip.clientWidth) });
  }, { passive: false });
}
