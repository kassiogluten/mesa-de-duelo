// A aba Mão de teste da tela do deck: a mão sorteada, o mulligan de Londres, comprar a próxima e quantos terrenos vieram.
import { cacheGet } from '../scryfall';
import { cardInfo } from '../cards';
import { esc } from '../ui/cardtext';
import type { SampleHand } from './sampleHand';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** `commanders`: o deck tem comandante (fica fora do grimório). */
export function handHTML(hand: SampleHand, commanders: boolean) {
  const infos = hand.hand.map(c => { const sc = cacheGet(c.name, c); return { c, info: sc ? cardInfo(sc) : null }; });
  const lands = infos.filter(x => x.info?.type === 'land').length;
  const status = hand.toBottom > 0
    ? `Mulligan ${hand.mulligans}: toque em ${plural(hand.toBottom, 'carta', 'cartas')} para pôr no fundo do grimório.`
    : `${plural(hand.hand.length, 'carta', 'cartas')} na mão, ${plural(lands, 'terreno', 'terrenos')}${hand.mulligans ? ` · ${plural(hand.mulligans, 'mulligan', 'mulligans')}${hand.freeMulligan ? ' (o primeiro é grátis no Commander)' : ''}` : ''}${hand.draws ? ` · ${plural(hand.draws, 'compra', 'compras')} (turno ${hand.draws + 1})` : ''}.`;
  return `<div class="dv-hand-bar"><div class="dw-actions"><button type="button" class="dw-button primary" data-hand="new">Nova mão</button><button type="button" class="dw-button" data-hand="mulligan" ${hand.mulligans >= 6 ? 'disabled' : ''}>Mulligan</button><button type="button" class="dw-button" data-hand="draw" ${hand.toBottom > 0 || !hand.library.length ? 'disabled' : ''}>Comprar</button></div><p class="dv-hand-status" role="status">${esc(status)}</p></div>
    <ul class="dv-hand${hand.toBottom > 0 ? ' choosing' : ''}">${infos.map(({ c, info }) => `<li><button type="button" class="dv-hand-card" ${hand.toBottom > 0 ? `data-bottom="${c.uid}" aria-label="Pôr ${esc(info?.label ?? c.name)} no fundo"` : `data-inspect="${esc(c.name)}"${c.set ? ` data-set="${esc(c.set)}"${c.cn ? ` data-cn="${esc(c.cn)}"` : ''}` : ''} aria-label="Ler ${esc(info?.label ?? c.name)}"`}>${info?.image ? `<img src="${esc(info.image)}" alt="">` : `<span class="dv-card-blank">${esc(info?.label ?? c.name)}</span>`}</button></li>`).join('')}</ul>
    ${hand.bottom.length ? `<p class="dv-note">No fundo: ${hand.bottom.map(c => esc(cacheGet(c.name)?.pt?.name || c.name)).join(', ')}.</p>` : ''}
    <p class="dv-note">${plural(hand.library.length, 'carta', 'cartas')} no grimório.${commanders ? ' A zona de comando fica fora do sorteio.' : ''}</p>`;
}
