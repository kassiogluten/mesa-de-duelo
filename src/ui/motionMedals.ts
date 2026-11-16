// Os medalhões em 3D da mesa, na camada GPU: o disco de sol e lua quando o dia vira noite (e o contrário) a coroa do Monarca e o escudo da Dianteira passando de um retrato para o outro o emblema novo saindo do planeswalker, as fichas de Tesouro, Pista, Comida e Sangue caindo sobre a carta e o frasco do veneno, o raio da energia, a estrela da experiência e o disco da radiação caindo sobre o selo do jogador; sem a camada, fica só o ícone ou o selo pulsando.
import type { FCard, FPlayer } from '../forge/client';
import { holderChanges, type Holders } from './holderChanges';
import { center, reduced, type MotionKit, type Point } from './motionKit';
import { emblemSource } from './cardFaces';
import { walkerTone } from './planeswalkerEffects';
import { trinketOf } from './tokenTrinkets';
import { tallyGains, type Tallies } from './playerTallies';

export function createMedalMotion(kit: MotionKit) {
  const { root, layer, gpu, animate } = kit;
  /** O selo (ou o emblema) de destino só aparece quando o medalhão pousa, em 85% de `ms`. */
  const waitFor = (el: Element | null, ms: number) => { if (el instanceof HTMLElement) animate(el, [{ opacity: 0 }, { opacity: 0, offset: .85 }, { opacity: 1 }], ms, 'linear'); };
  // Quem tinha a coroa e a Dianteira no último desenho.
  let holders: Holders | null = null;
  // Quanto cada jogador tinha de cada marcador no último desenho.
  let tallies: Tallies | null = null;
  /** Se a mesa está à vista e com movimento: escondida ou com "reduzir movimento", nenhum medalhão. */
  const showing = () => !document.hidden && !root.hidden && !reduced();
  /** O meio da mesa, com o tamanho de um medalhão (um pouco menor em telas baixas). */
  function middle(): Point {
    const r = layer().getBoundingClientRect(), size = Math.max(72, Math.min(112, r.height * .15));
    return { cx: r.left + r.width / 2, cy: r.top + r.height * .44, w: size, h: size };
  }
  return {
    /** Ficha nova de Tesouro, Pista, Comida ou Sangue pousada em `el`: o objeto dela cai girando e entra na carta. Diz se caiu. */
    trinket(el: Element, card: FCard): boolean {
      const kind = trinketOf(card), at = center(el);
      return !!kind && !!at && showing() && gpu.play('trinket', { at, kind });
    },
    /** Virou dia (ou noite): o disco aparece no meio da mesa com o lado de antes, vira e voa até o sol ou a lua da trilha. */
    dayNight(day: boolean, icon: Element | null) {
      if (!showing()) return;
      gpu.play('dayNight', { at: middle(), to: center(icon), day });
    },
    /**
     * A cada desenho dos assentos: se a coroa do Monarca ou a Dianteira mudou de mão, o medalhão sai do retrato de quem
     * tinha e pousa no selo de quem passou a ter (sem ninguém antes, aparece em cima do selo); um emblema novo sai do
     * planeswalker (ou do meio da mesa) e pousa no lugar dele, ao lado do retrato.
     */
    holders(players: FPlayer[], match: string) {
      const { passes, emblems, now } = holderChanges(holders, players, match);
      holders = now;
      const counted = tallyGains(tallies, players, match);
      tallies = counted.now;
      if ((!passes.length && !emblems.length && !counted.gains.length) || !showing()) return;
      const avatar = (id: number) => root.querySelector(`.avatar[data-pid="${id}"]`);
      // O marcador que subiu: o objeto dele cai sobre o selo (um depois do outro), e o selo só aparece quando ele pousa.
      counted.gains.forEach((gain, i) => {
        const badge = root.querySelector(`[data-ctr="p${gain.player}:${gain.counter}"]`), portrait = center(avatar(gain.player));
        const at = center(badge) ?? portrait, delay = i * 280;
        if (at && gpu.play('tally', { at, kind: gain.kind, size: portrait?.w ?? 72, level: gain.level, delay }) && badge instanceof HTMLElement) {
          const ms = 1200 + gain.level * 300;
          animate(badge, [{ opacity: 0 }, { opacity: 0, offset: .44 }, { opacity: 1, offset: .52 }, { opacity: 1 }], ms, 'linear', delay);
        }
      });
      for (const pass of passes) {
        const badge = root.querySelector(`[data-ctr="p${pass.to}:${pass.kind === 'monarch' ? 'MONARCH' : 'INITIATIVE'}"]`);
        const to = center(badge) ?? center(avatar(pass.to)), from = pass.from === null ? undefined : center(avatar(pass.from));
        if (to && gpu.play('holderPass', { from, to, kind: pass.kind })) waitFor(badge, from ? 1700 : 1300);
      }
      for (const { emblem } of emblems) {
        const slot = root.querySelector<HTMLElement>(`.emblem[data-peek="${emblem.id}"]`), to = center(slot);
        if (!to) continue;
        const walker = players.flatMap(p => p.battlefield).find(c => c.planeswalker && c.name === emblemSource(emblem));
        const art = slot?.querySelector<HTMLElement>('.emblem-art')?.style.backgroundImage.match(/url\(["']?([^"')]+)/)?.[1];
        if (gpu.play('emblem', { from: center(walker && root.querySelector(`.field [data-fid="${walker.id}"]`)) ?? middle(), to, art, color: walkerTone(walker) })) waitFor(slot, 1900);
      }
    },
  };
}
