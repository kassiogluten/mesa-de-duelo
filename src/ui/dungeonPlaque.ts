// A placa de pedra da masmorra: quando o jogador entra numa sala, ela cai ao lado do retrato com o nome da sala e a trilha de passos (o novo acende) e entra no selo; ao completar, sai dourada, com faíscas.
import { esc } from './cardtext';
import { DUNGEON_ICON } from './dungeon';
import type { DungeonStep } from './dungeonSteps';
import type { MotionKit } from './motionKit';

/** Quanto a placa fica na mesa, da queda até entrar no selo. */
export const PLAQUE_MS = 1900;
/** Entre uma placa e a seguinte (dois jogadores, ou completar e já entrar na próxima masmorra). */
const STAGGER = 700;
const MARGIN = 8;

const visible = (els: Iterable<Element>) => [...els].find(el => el.getBoundingClientRect().width > 0);

/** O conteúdo da placa: o que aconteceu em cima, o nome da sala (ou da masmorra completada) e a trilha de passos. */
export function plaqueHTML(step: DungeonStep) {
  if (step.kind === 'done') {
    return `<span class="dp-kicker">${DUNGEON_ICON}Masmorra completa</span><strong>${esc(step.name)}</strong><span class="dp-steps"><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i></span>`;
  }
  const marks = Array.from({ length: step.total }, (_, i) => `<i${i < step.step - 1 ? ' class="on"' : i === step.step - 1 ? ' class="on new"' : ''}></i>`).join('');
  return `<span class="dp-kicker">${DUNGEON_ICON}${esc(step.name)} · passo ${step.step} de ${step.total}</span><strong>${esc(step.room)}</strong><span class="dp-steps">${marks}</span>`;
}

export function createDungeonPlaques(kit: MotionKit) {
  const { root, animate, later, track, remove } = kit;
  /** Uma placa para cada passo, ao lado do selo da masmorra de quem se aventurou (ou do retrato, se o selo não está à vista). */
  return function show(steps: DungeonStep[]) {
    steps.forEach((step, i) => {
      const badge = visible(root.querySelectorAll(`button.player-counter.dungeon[data-gy="${step.player}"]`));
      const avatar = visible(root.querySelectorAll(`.avatar[data-pid="${step.player}"]`));
      const anchor = (badge ?? avatar)?.getBoundingClientRect();
      if (!anchor) return;
      const plaque = document.createElement('div');
      plaque.className = `dungeon-plaque${step.kind === 'done' ? ' done' : ''}`;
      plaque.setAttribute('aria-hidden', 'true');
      plaque.innerHTML = plaqueHTML(step);
      plaque.style.visibility = 'hidden';
      track(plaque);
      // À direita do selo; sem espaço (retrato colado na borda direita), à esquerda do retrato. Sempre inteira na tela.
      const size = plaque.getBoundingClientRect(), width = innerWidth, height = innerHeight;
      let x = anchor.right + 10;
      if (x + size.width > width - MARGIN) x = (avatar?.getBoundingClientRect().left ?? anchor.left) - 10 - size.width;
      x = Math.max(MARGIN, Math.min(width - MARGIN - size.width, x));
      const y = Math.max(MARGIN, Math.min(height - MARGIN - size.height, anchor.top + anchor.height / 2 - size.height / 2 - 18));
      plaque.style.left = `${x}px`; plaque.style.top = `${y}px`; plaque.style.visibility = '';
      // Até o meio do selo, encolhendo, no fim.
      const dx = anchor.left + anchor.width / 2 - (x + size.width / 2), dy = anchor.top + anchor.height / 2 - (y + size.height / 2);
      const delay = i * STAGGER;
      animate(plaque, [
        { opacity: 0, transform: 'translateY(-26px) rotate(-4deg)' },
        { opacity: 1, transform: 'translateY(0) rotate(0)', offset: .16 },
        { transform: 'translateY(-3px)', offset: .21 },
        { opacity: 1, transform: 'translateY(0)', offset: .26 },
        { opacity: 1, transform: 'translate(0, 0) scale(1)', offset: .76 },
        { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(.15)` },
      ], PLAQUE_MS, 'ease-out', delay);
      const fresh = plaque.querySelector<HTMLElement>('i.new');
      if (fresh) animate(fresh, [{ background: '#ffffff22' }, { background: '#ffffff22', offset: .3 }, { background: '#fff', boxShadow: '0 0 8px #fff', offset: .4 }, { offset: .6 }], PLAQUE_MS, 'ease-out', delay);
      // A poeira da pedra pousando, e as faíscas da masmorra completa.
      for (const [k, dxDust] of [-14, 14, -26, 26].entries()) {
        const dust = document.createElement('span');
        dust.className = 'dp-dust'; dust.style.left = `${18 + k * (size.width - 36) / 3}px`;
        plaque.append(dust);
        animate(dust, [{ opacity: 0, transform: 'translate(0, 0) scale(.5)' }, { opacity: 0, offset: .15 }, { opacity: .7, offset: .2 }, { opacity: 0, transform: `translate(${dxDust}px, -6px) scale(1.8)`, offset: .45 }, { opacity: 0 }], PLAQUE_MS, 'ease-out', delay);
      }
      if (step.kind === 'done') for (let k = 0; k < 10; k++) {
        const spark = document.createElement('span'), angle = k / 10 * Math.PI * 2;
        spark.className = 'dp-spark';
        plaque.append(spark);
        animate(spark, [{ opacity: 0 }, { opacity: 0, offset: .18 }, { opacity: 1, offset: .28 }, { opacity: 0, transform: `translate(${Math.cos(angle) * 90}px, ${Math.sin(angle) * 50}px)`, offset: .7 }, { opacity: 0 }], PLAQUE_MS, 'ease-out', delay);
      }
      // O selo pula quando a placa entra nele.
      if (badge instanceof HTMLElement) animate(badge, [{ transform: 'scale(1)' }, { transform: 'scale(1)', offset: .78 }, { transform: 'scale(1.35)', offset: .86 }, { transform: 'scale(1)' }], PLAQUE_MS, 'ease-out', delay);
      later(() => remove(plaque), delay + PLAQUE_MS + 50);
    });
  };
}
