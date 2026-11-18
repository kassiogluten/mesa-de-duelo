// A fila de apresentação da mesa: cada jogada nova que chega no estado é mostrada um passo de cada vez (voo da carta,
// balão, som), com a mesa desenhada no quadro daquele passo. Compras, embaralhar e marcadores não têm passo próprio:
// animam junto com o passo seguinte.
import type { FState } from '../forge/client';
import { suppressOpeningPreview } from './openingPresentation';
import { calloutDuration, presentationDuration, presentationPace, hasLiveDecision, type PresentationEvent, type PresentationFrame } from './presentationTimeline';
import type { TableCtx } from './tableContext';
import { damageSweep, sameSweep, sweepCause, SWEEP_MIN } from './boardSweep';

export type PresentationDeps = Pick<TableCtx, 'root' | 'timeline' | 'motion' | 'audio' | 'prefs' | 'state' | 'match' | 'face' | 'eventDescription' | 'announce' | 'render' | 'renderTable'>;

export function createPresentationQueue(d: PresentationDeps) {
  const { root, timeline, motion, audio } = d;
  let presentationTimer = 0;
  let displayFrame: PresentationFrame | null = null;
  /** Cartas que você está comprando no passo que a mesa desenha agora (ficam escondidas na mão até o voo chegar). */
  let drawingNow = 0;
  /** A carta do último limpa campo de dano mostrado: as mortes que vêm dele racham juntas, sem outra onda. */
  let burnedBy: number | undefined;
  /** O próximo desenho só alcança os eventos, sem mostrar nem tocar nada (partida aberta, aba voltando, conexão de volta). */
  let silentNext = true;
  /** Ver a jogada de novo (Histórico): o que fazer ao terminar e o número da repetição (o som de cada uma toca de novo). */
  let replayEnd: (() => void) | null = null;
  let replayRun = 0;
  const banner = () => root.querySelector<HTMLElement>('#fReplay');
  function endReplay() {
    if (!replayEnd) return;
    const done = replayEnd;
    replayEnd = null;
    const el = banner();
    if (el) el.hidden = true;
    done();
  }

  function advance() {
    clearTimeout(presentationTimer);
    const match = d.match();
    if (document.hidden || root.hidden || match.disconnected) { stop(); return; }
    let entry = timeline.advance();
    if (replayEnd && !entry?.replay) endReplay();
    const s = d.state();
    const draws: PresentationEvent[] = [], quick: PresentationEvent[] = [];
    while (entry?.audioOnly) {
      if (s) audio.play(entry.event, timeline.matchId, entry.audible, s.you);
      if (entry.event.type === 'draw' && entry.event.actor !== undefined) draws.push(entry.event);
      else if (entry.audible) quick.push(entry.event);
      entry = timeline.advance();
    }
    // `s` já vem com a sua decisão guardada enquanto houver passo (holdDecision): a mesa mostra o quadro da jogada.
    displayFrame = s && !hasLiveDecision(s) ? entry?.event.frame ?? null : null;
    drawingNow = s ? draws.filter(dr => dr.actor === s.you).reduce((n, dr) => n + (dr.count ?? 1), 0) : 0;
    d.renderTable();
    drawingNow = 0;
    // Embaralhar e marcadores não têm passo próprio: animam junto com a jogada, na mesa já desenhada.
    if (s) for (const event of quick) motion.quick(event, { you: s.you });
    // A mão inicial e os mulligans já têm a própria apresentação: sem voos por cima dela.
    const gameBegun = timeline.history.some(e => e.type === 'turn');
    if (s && draws.length && gameBegun && !suppressOpeningPreview(s)) {
      const incoming = [...root.querySelectorAll<HTMLElement>('#fHand .hcard.incoming')];
      for (const el of incoming) match.knownHand.add(Number(el.dataset.fid));
      for (const draw of draws) {
        const cards = draw.actor === s.you ? incoming : [];
        const arrivals = motion.drew(draw.actor!, draw.count ?? 1, { you: s.you, cards, fast: d.prefs.fast, searched: !!draw.searched });
        cards.forEach((el, i) => match.arriving.set(Number(el.dataset.fid), performance.now() + (arrivals[i] ?? 0)));
      }
    }
    if (!entry || !s) return;
    // O ritmo é o das Opções; com a fila crescendo, os passos encurtam em vez de serem pulados. A sua decisão espera
    // a fila acabar.
    const pace = presentationPace(timeline.queuedSteps + 1, d.prefs.fast), shortened = pace < 1;
    // Dano dividido: os próximos danos da mesma mágica ou habilidade saem juntos, cada um para o seu alvo.
    const first = entry.event;
    const divided = first.type === 'damage' && !first.combat && !first.prevented && first.sourceId !== undefined
      ? timeline.takeWhile(e => e.type === 'damage' && !e.combat && !e.prevented && e.sourceId === first.sourceId) : [];
    // Limpa campo (boardSweep.ts): o mesmo dano em 3 criaturas ou mais, sem mirar, vira uma onda que varre a mesa; as
    // saídas do campo da mesma mágica ou habilidade (Wrath of God, Evacuation) também, de 3 em diante; e as mortes
    // logo depois de um limpa campo de dano racham juntas, sem outra onda.
    let sweep: PresentationEvent['sweep'];
    if (divided.length && damageSweep(timeline.history, [first, ...divided.map(part => part.event)])) {
      sweep = { events: [first, ...divided.map(part => part.event)], cause: first.card, controller: first.actor, wave: true };
      burnedBy = first.sourceId;
    } else if (first.type === 'left') {
      const cause = sweepCause(timeline.history, first);
      const afterBurn = burnedBy !== undefined && cause?.card?.id === burnedBy;
      const rest = cause ? timeline.takeWhile(sameSweep(timeline.history, cause.stackId), afterBurn ? 1 : SWEEP_MIN - 1) : [];
      if (cause && rest.length) sweep = { events: [first, ...rest.map(part => part.event)], cause: cause.card, name: cause.name, controller: cause.controller, wave: !afterBurn };
    }
    if (first.type === 'turn') burnedBy = undefined;
    const shown: PresentationEvent = sweep ? { ...first, sweep } : first;
    const duration = presentationDuration(shown, pace);
    // Luta: o golpe de volta (da criatura atingida na outra) sai junto, e as duas se chocam no meio.
    const fought = first.type === 'damage' && first.fight && first.targets?.cards?.length
      ? timeline.takeWhile(e => e.type === 'damage' && !!e.fight && e.sourceId === first.targets!.cards![0]) : [];
    // Combate: os golpes da mesma etapa de dano (iniciativa ou normal) saem juntos, mesmo num combate grande, e o
    // atacante e o bloqueador que se atingem se chocam no meio, em vez de um golpe esperar o outro.
    const clashing = first.type === 'damage' && first.combat
      ? timeline.takeWhile(e => e.type === 'damage' && !!e.combat && (e.step ?? 'regular') === (first.step ?? 'regular')) : [];
    if (clashing.length) {
      const all = [first, ...clashing.map(part => part.event)];
      for (const e of all) e.clash = all.some(o => o !== e && o.sourceId !== undefined && o.sourceId === e.targets?.cards?.[0] && o.targets?.cards?.[0] === e.sourceId);
    }
    if (sweep) motion.sweep(shown, { you: s.you, label: d.eventDescription(shown), duration, face: card => d.face(card, 'normal'), hideDestination: !hasLiveDecision(s) });
    else if (first.type === 'mill') motion.milled(first, { you: s.you, fast: shortened, face: card => d.face(card, 'normal') });
    else if (first.type === 'entered' && (first.entries?.length ?? 0) > 1) motion.entered(first, { you: s.you, fast: shortened, face: card => d.face(card, 'normal'), hideDestination: !hasLiveDecision(s) });
    else for (const part of [entry, ...divided, ...fought, ...clashing]) {
      if (divided.length) part.event.divided = divided.length + 1;
      motion.present(part.event, { you: s.you, html: part.event.card ? d.face(part.event.card, 'normal') : undefined,
        label: d.eventDescription(part.event), duration, calloutDuration: calloutDuration(part.event, d.prefs.fast), hideDestination: !hasLiveDecision(s) });
    }
    audio.play(entry.event, entry.replay ? `${timeline.matchId}:replay${replayRun}` : timeline.matchId, entry.audible, s.you);
    if (shown.type === 'damage' && !sweep && shown.targets?.players?.length) d.announce(d.eventDescription(shown));
    else if (!hasLiveDecision(s)) d.announce(d.eventDescription(shown));
    presentationTimer = window.setTimeout(advance, duration);
  }
  function stop() {
    clearTimeout(presentationTimer); timeline.catchUp(); displayFrame = null; d.match().arriving.clear();
    motion.cancelPresentation(); audio.silence(); endReplay();
  }
  /** Repete na mesa os passos de uma jogada antiga, com a faixa "Repetindo" no alto; false quando a fila não está parada. */
  function replay(events: readonly PresentationEvent[], label: string, onEnd: () => void) {
    if (document.hidden || root.hidden || d.match().disconnected || !timeline.replay(events)) return false;
    replayRun++; replayEnd = onEnd;
    const el = banner();
    if (el) { el.querySelector('.replay-text')!.textContent = `Repetindo: ${label}`; el.hidden = false; }
    advance();
    return true;
  }
  /**
   * Junta os eventos novos do estado à fila. `collect` recebe o estado logo depois (as janelas de remoção leem o
   * histórico). Devolve true quando um passo começou agora: ele já desenhou a mesa, e o desenho de quem chamou para aí.
   */
  function ingest(s: FState, silently: boolean, collect: (s: FState) => void) {
    const beforeCurrent = timeline.current;
    timeline.ingest(s.matchId ?? s.session?.code ?? 'local', s.events ?? [], { silent: silently, cursor: s.eventCursor });
    silentNext = false;
    collect(s);
    if (beforeCurrent && !timeline.current) { clearTimeout(presentationTimer); motion.cancelPresentation(); }
    if (silently) displayFrame = null;
    if (!timeline.current && timeline.queued) { advance(); return true; }
    return false;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stop(); silentNext = true; }
    else if (!root.hidden) d.render();
  });

  return {
    advance, stop, ingest, replay,
    frame: () => displayFrame,
    drawing: () => drawingNow,
    /** Este desenho é só para alcançar os eventos (ou a aba está escondida). */
    silent: () => silentNext || document.hidden,
    /** O próximo desenho alcança os eventos em silêncio. */
    muteNext() { silentNext = true; },
  };
}
