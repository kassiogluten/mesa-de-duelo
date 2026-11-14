// A fila de apresentação da mesa: cada jogada nova que chega no estado é mostrada um passo de cada vez (voo da carta,
// balão, som), com a mesa desenhada no quadro daquele passo. Compras, embaralhar e marcadores não têm passo próprio:
// animam junto com o passo seguinte.
import type { FState } from '../forge/client';
import { suppressOpeningPreview } from './openingPresentation';
import { calloutDuration, presentationDuration, hasLiveDecision, type PresentationEvent, type PresentationFrame } from './presentationTimeline';
import type { TableCtx } from './tableContext';

export type PresentationDeps = Pick<TableCtx, 'root' | 'timeline' | 'motion' | 'audio' | 'prefs' | 'state' | 'match' | 'face' | 'eventDescription' | 'announce' | 'render' | 'renderTable'>;

export function createPresentationQueue(d: PresentationDeps) {
  const { root, timeline, motion, audio } = d;
  let presentationTimer = 0;
  let displayFrame: PresentationFrame | null = null;
  /** Cartas que você está comprando no passo que a mesa desenha agora (ficam escondidas na mão até o voo chegar). */
  let drawingNow = 0;
  /** O próximo desenho só alcança os eventos, sem mostrar nem tocar nada (partida aberta, aba voltando, conexão de volta). */
  let silentNext = true;

  function advance() {
    clearTimeout(presentationTimer);
    const match = d.match();
    if (document.hidden || root.hidden || match.disconnected) { stop(); return; }
    let entry = timeline.advance();
    const s = d.state();
    const draws: PresentationEvent[] = [], quick: PresentationEvent[] = [];
    while (entry?.audioOnly) {
      if (s) audio.play(entry.event, timeline.matchId, entry.audible, s.you);
      if (entry.event.type === 'draw' && entry.event.actor !== undefined) draws.push(entry.event);
      else if (entry.audible) quick.push(entry.event);
      entry = timeline.advance();
    }
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
    // O ritmo é só o das Opções: no Normal, tudo no tempo cheio, mesmo com uma decisão sua esperando (os botões já ficam
    // liberados na hora); só o Rápido acelera.
    const fast = d.prefs.fast;
    const duration = presentationDuration(entry.event, fast);
    // Dano dividido: os próximos danos da mesma mágica ou habilidade saem juntos, cada um para o seu alvo.
    const first = entry.event;
    const divided = first.type === 'damage' && !first.combat && !first.prevented && first.sourceId !== undefined
      ? timeline.takeWhile(e => e.type === 'damage' && !e.combat && !e.prevented && e.sourceId === first.sourceId) : [];
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
    if (first.type === 'mill') motion.milled(first, { you: s.you, fast: d.prefs.fast, face: card => d.face(card, 'normal') });
    else if (first.type === 'entered' && (first.entries?.length ?? 0) > 1) motion.entered(first, { you: s.you, fast: d.prefs.fast, face: card => d.face(card, 'normal'), hideDestination: !hasLiveDecision(s) });
    else for (const part of [entry, ...divided, ...fought, ...clashing]) {
      if (divided.length) part.event.divided = divided.length + 1;
      motion.present(part.event, { you: s.you, html: part.event.card ? d.face(part.event.card, 'normal') : undefined,
        label: d.eventDescription(part.event), duration, calloutDuration: calloutDuration(part.event, d.prefs.fast), hideDestination: !hasLiveDecision(s) });
    }
    audio.play(entry.event, timeline.matchId, entry.audible, s.you);
    if (entry.event.type === 'damage' && entry.event.targets?.players?.length) d.announce(d.eventDescription(entry.event));
    else if (!hasLiveDecision(s)) d.announce(d.eventDescription(entry.event));
    presentationTimer = window.setTimeout(advance, duration);
  }
  function stop() {
    clearTimeout(presentationTimer); timeline.catchUp(); displayFrame = null; d.match().arriving.clear();
    motion.cancelPresentation(); audio.silence();
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
    if (silently || hasLiveDecision(s)) displayFrame = null;
    if (!timeline.current && timeline.queued) { advance(); return true; }
    return false;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stop(); silentNext = true; }
    else if (!root.hidden) d.render();
  });

  return {
    advance, stop, ingest,
    frame: () => displayFrame,
    drawing: () => drawingNow,
    /** Este desenho é só para alcançar os eventos (ou a aba está escondida). */
    silent: () => silentNext || document.hidden,
    /** O próximo desenho alcança os eventos em silêncio. */
    muteNext() { silentNext = true; },
  };
}
