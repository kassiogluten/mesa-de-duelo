// A escolha de ataque na mesa: as criaturas marcadas, o defensor escolhido primeiro, o "atacar com tudo", a fila de ataques
// que vai para o servidor um de cada vez, as recusas explicadas (atiçada, alvo não permitido) e o painel "Atacar quem?"
// com o arraste da caixa das ações.
import type { FCard, FState, ForgeClient, NoticeDetail } from '../forge/client';
import { KEYS } from '../storage';
import { esc } from './cardtext';
import { label } from './cardFaces';
import { hideCardPreview } from './cardInspector';
import { AttackQueue, attackAllAction, attackScope, availableAttackTargets, legalAttackAllTargets, legalAttackGroupTargets, legalAttackTargets, validAttackSelection, type Defender } from './commanderTable';

/** O que a escolha de ataque precisa da mesa. */
export interface AttackDeps {
  client(): ForgeClient | null;
  disconnected(): boolean;
  findCard(id: number): FCard | undefined;
  notice(text: string, error?: boolean, detail?: NoticeDetail): void;
  stopPresentation(): void;
  render(): void;
}

/** O estado e as ações da escolha de ataque; `clear(true)` volta tudo ao começo (partida nova, conexão caída). */
export function createAttackChoice(root: HTMLElement, d: AttackDeps) {
  const a = {
    /** Criaturas marcadas para atacar, ainda sem defensor (valem só para o prompt `selectionGen`). */
    selected: new Set<number>(),
    selectionGen: -1,
    /** Defensor escolhido antes das criaturas. */
    pinned: null as Defender | null,
    /** A declaração de ataque em que esta escolha começou (muda: tudo volta ao começo). */
    context: null as string | null,
    queue: new AttackQueue(),
    /** "Atacar com tudo" esperando o defensor (o prompt em que começou). */
    allGen: null as number | null,
    clear: clearAttackChoice, flush: flushAttacks, sync: syncAttackChoice, targets: currentAttackTargets, defenderName, refuse: refuseAttack,
    choose: chooseAttackDefender, panelHTML: attackChoices, syncPanelShift: syncAttackPanelShift, tapAttacker, removeSelected,
  };
  function clearAttackChoice(reset = false) {
    a.selected.clear(); a.pinned = null; a.allGen = null; a.selectionGen = -1;
    a.queue.clear(reset);
    if (reset) a.context = null;
  }
  function flushAttacks(s: FState) {
    const client = d.client();
    if (!client || d.disconnected()) return;
    const action = a.queue.next(s);
    if (action) { d.stopPresentation(); hideCardPreview(true); client.send(action); }
  }
  function syncAttackChoice(s: FState) {
    const context = attackScope(s);
    if (d.disconnected() || context === null || context !== a.context) { clearAttackChoice(true); a.context = context; }
    a.queue.observe(s);
    if (a.selectionGen !== s.input.gen) a.selected.clear();
    for (const attacker of a.selected) if (!validAttackSelection(s, { attacker, gen: s.input.gen })) a.selected.delete(attacker);
    if (a.pinned && !availableAttackTargets(s).some(target => target.id === a.pinned!.id && target.kind === a.pinned!.kind)) a.pinned = null;
    if (a.allGen !== null && !legalAttackAllTargets(s, a.allGen).length) a.allGen = null;
    flushAttacks(s);
  }
  function currentAttackTargets(s: FState) {
    return a.allGen !== null ? legalAttackAllTargets(s, a.allGen)
      : a.selected.size ? legalAttackGroupTargets(s, [...a.selected], a.selectionGen) : availableAttackTargets(s);
  }
  function defenderName(s: FState, defender: Defender) {
    return defender.kind === 'player' ? s.players.find(p => p.id === defender.id)?.name ?? 'Jogador' : d.findCard(defender.id)?.name ?? 'Permanente';
  }
  /** Alvo que a criatura não pode atacar: o aviso diz por quê (atiçada por esse jogador) e mostra a criatura. */
  function refuseAttack(s: FState, attacker: number, defender: Defender) {
    const c = d.findCard(attacker);
    if (!c) return;
    const who = defender.kind === 'player' ? s.players.find(p => p.id === defender.id)?.name ?? 'Jogador' : label(d.findCard(defender.id) ?? ({ name: 'esse permanente' } as FCard));
    const goaders = (c.goadedBy ?? []).map(id => s.players.find(p => p.id === id)?.name ?? 'Jogador');
    const text = defender.kind === 'player' && c.goadedBy?.includes(defender.id)
      ? `${label(c)} foi atiçada por ${goaders.length > 1 ? `${goaders.slice(0, -1).join(', ')} e ${goaders.at(-1)}` : goaders[0]} e precisa atacar outro jogador, se puder.`
      : `${label(c)} não pode atacar ${who} neste combate.`;
    d.notice(text, false, { title: 'Ataque não permitido', cards: [{ id: c.id, name: c.name ?? '' }] });
  }
  /** Tocou num defensor fora da lista: explica com a criatura escolhida (ou a atiçada que mira esse jogador). */
  function explainRefusedTarget(s: FState, defender: Defender) {
    if (!s.input.attacking?.defenders.some(target => target.id === defender.id && target.kind === defender.kind)) return;
    const cannot = (a.selected.size ? [...a.selected] : s.input.attacking.attackers)
      .filter(attacker => !legalAttackTargets(s, { attacker, gen: s.input.gen }).some(target => target.id === defender.id && target.kind === defender.kind));
    const attacker = cannot.find(id => d.findCard(id)?.goadedBy?.includes(defender.id)) ?? (a.selected.size ? cannot[0] : undefined);
    if (attacker !== undefined) refuseAttack(s, attacker, defender);
  }
  function chooseAttackDefender(s: FState, defender: Defender, gen: number) {
    const client = d.client();
    if (!client || d.disconnected() || gen !== s.input.gen) return;
    if (!currentAttackTargets(s).some(target => target.id === defender.id && target.kind === defender.kind)) { explainRefusedTarget(s, defender); return; }
    if (a.allGen !== null) {
      if (a.queue.busy) return;
      const action = attackAllAction(s, defender, gen);
      if (!action) return;
      clearAttackChoice(); a.queue.markSent(s, action); d.stopPresentation(); hideCardPreview(true); client.send(action);
    } else if (a.selected.size) {
      a.queue.enqueue([...a.selected], defender);
      a.selected.clear(); a.pinned = null;
      flushAttacks(s);
    } else a.pinned = defender;
    hideCardPreview(true); d.render();
  }
  /**
   * O painel "Atacar quem?" fica no canto das ações e às vezes cobre as próprias criaturas: o título serve de alça para
   * arrastar a caixa das ações para outro lugar. O deslocamento vale para os próximos combates (neste aparelho), a caixa
   * nunca sai da tela, e dois cliques no título a devolvem ao lugar de sempre.
   */
  let attackPanelShift: { x: number; y: number } | null = (() => {
    try { const v = JSON.parse(localStorage.getItem(KEYS.attackPanel) ?? 'null'); return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? { x: v.x, y: v.y } : null; } catch { return null; }
  })();
  function saveAttackPanelShift() {
    try { if (attackPanelShift) localStorage.setItem(KEYS.attackPanel, JSON.stringify(attackPanelShift)); else localStorage.removeItem(KEYS.attackPanel); } catch {}
  }
  function syncAttackPanelShift() {
    const el = root.querySelector<HTMLElement>('#fAction');
    if (!el) return;
    const shift = el.classList.contains('attack-choosing') ? attackPanelShift : null;
    el.classList.toggle('moved', !!shift);
    if (!shift) { el.style.removeProperty('--drag-x'); el.style.removeProperty('--drag-y'); return; }
    const place = (x: number, y: number) => { el.style.setProperty('--drag-x', `${Math.round(x)}px`); el.style.setProperty('--drag-y', `${Math.round(y)}px`); };
    place(shift.x, shift.y);
    // Janela menor que a do arraste: a caixa volta para dentro da tela (sem mudar o lugar guardado).
    const r = el.getBoundingClientRect(), m = 4;
    const dx = r.left < m ? m - r.left : r.right > innerWidth - m ? Math.max(m - r.left, innerWidth - m - r.right) : 0;
    const dy = r.top < m ? m - r.top : r.bottom > innerHeight - m ? Math.max(m - r.top, innerHeight - m - r.bottom) : 0;
    if (dx || dy) place(shift.x + dx, shift.y + dy);
  }
  root.addEventListener('pointerdown', e => {
    const handle = (e.target as HTMLElement).closest<HTMLElement>('#fAction.attack-choosing .attack-choices-title');
    if (!handle || e.button !== 0) return;
    const el = root.querySelector<HTMLElement>('#fAction')!;
    const start = { x: e.clientX, y: e.clientY }, base = attackPanelShift ?? { x: 0, y: 0 };
    let moved = false;
    handle.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      attackPanelShift = { x: base.x + dx, y: base.y + dy };
      syncAttackPanelShift();
    };
    const end = () => {
      handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', end); handle.removeEventListener('pointercancel', end);
      el.classList.remove('dragging');
      if (!moved) return;
      // Guarda o lugar em que a caixa ficou de fato (já trazida para dentro da tela).
      const x = parseFloat(el.style.getPropertyValue('--drag-x')), y = parseFloat(el.style.getPropertyValue('--drag-y'));
      if (Number.isFinite(x) && Number.isFinite(y)) attackPanelShift = { x, y };
      saveAttackPanelShift();
    };
    handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
    e.preventDefault();
  });
  root.addEventListener('dblclick', e => {
    if (!(e.target as HTMLElement).closest('#fAction.attack-choosing .attack-choices-title')) return;
    attackPanelShift = null; saveAttackPanelShift(); syncAttackPanelShift();
  });
  function attackChoices(s: FState) {
    if (a.allGen === null && !a.selected.size && !a.pinned && !a.queue.queuedAttackers.length) return '';
    const removable = [...a.selected].some(id => s.combat.some(pair => pair.attacker === id));
    // Cada alvo é uma linha inteira: vida ou lealdade, nome, de quem é e quantos atacantes já vão nele.
    const targets = currentAttackTargets(s).map(target => {
      const pinned = a.pinned?.id === target.id && a.pinned.kind === target.kind;
      const player = target.kind === 'player' ? s.players.find(p => p.id === target.id) : undefined;
      const card = target.kind === 'card' ? d.findCard(target.id) : undefined;
      const owner = card ? s.players.find(p => p.id === card.controller)?.name : undefined;
      const mark = player ? player.life : card?.planeswalker ? card.counters?.LOYALTY ?? 0 : card?.counters?.DEFENSE ?? '';
      const detail = player ? `${player.life} de vida` : `${card?.planeswalker ? 'Planeswalker' : 'Permanente'}${owner ? ` de ${owner}` : ''}`;
      const coming = s.combat.filter(pair => pair.defender === target.id && (pair.defenderKind ?? 'player') === target.kind).length;
      const name = defenderName(s, target);
      return `<button class="attack-target${pinned ? ' on' : ''}${player ? '' : ' permanent'}" data-defender="${target.id}" data-defender-kind="${target.kind}" data-gen="${s.input.gen}" aria-pressed="${pinned}" aria-label="Atacar ${esc(name)}, ${esc(detail)}${coming ? `, ${coming} ${coming === 1 ? 'atacante' : 'atacantes'} já indo` : ''}">`
        + `<span class="attack-target-mark" aria-hidden="true">${mark}</span><span class="attack-target-text"><strong>${esc(name)}</strong><small>${esc(detail)}</small></span>`
        + `${coming ? `<span class="attack-target-count" aria-hidden="true">${coming}</span>` : ''}</button>`;
    }).join('');
    const tools = `${removable ? '<button class="icon-btn" data-ui="attack-remove">Retirar do combate</button>' : ''}${a.allGen === null ? '<button class="icon-btn" data-ui="attack-clear">Limpar seleção</button>' : ''}`;
    return `<div class="attack-choices" role="group" aria-labelledby="fAttackTitle"><h3 class="attack-choices-title" id="fAttackTitle" title="Arraste para mover este painel. Dois cliques o devolvem ao lugar.">Atacar quem?<svg class="drag-grip" viewBox="0 0 12 12" aria-hidden="true"><circle cx="3" cy="3" r="1.1"/><circle cx="9" cy="3" r="1.1"/><circle cx="3" cy="9" r="1.1"/><circle cx="9" cy="9" r="1.1"/><circle cx="3" cy="6" r="1.1"/><circle cx="9" cy="6" r="1.1"/></svg></h3><div class="attack-targets">${targets}</div>${tools ? `<div class="attack-tools">${tools}</div>` : ''}</div>`;
  }
  /** Toque numa criatura que pode atacar: marca ou desmarca, ou já manda o ataque quando só há um defensor (ou ele foi fixado). */
  function tapAttacker(s: FState, id: number, gen: number) {
    a.allGen = null;
    if (a.selected.has(id)) a.selected.delete(id);
    else if (a.queue.queuedAttackers.includes(id)) a.queue.deselect(id);
    else {
      const targets = legalAttackTargets(s, { attacker: id, gen });
      const assigned = s.combat.some(pair => pair.attacker === id);
      if (a.pinned && !assigned) {
        if (targets.some(target => target.id === a.pinned!.id && target.kind === a.pinned!.kind)) { a.queue.enqueue([id], a.pinned); flushAttacks(s); }
        else refuseAttack(s, id, a.pinned);
      } else if (!a.selected.size && targets.length === 1 && !a.pinned) {
        a.queue.enqueue([id], assigned ? null : targets[0]); flushAttacks(s);
      } else { a.selected.add(id); a.selectionGen = gen; }
    }
    hideCardPreview(true); d.render();
  }
  /** "Retirar do combate": as criaturas marcadas que já estavam atacando saem do ataque. */
  function removeSelected(s: FState) {
    if (d.disconnected() || a.selectionGen !== s.input.gen) return;
    const attackers = [...a.selected].filter(id => s.combat.some(pair => pair.attacker === id));
    if (attackers.length) { a.queue.enqueue(attackers, null); a.selected.clear(); a.pinned = null; flushAttacks(s); d.render(); }
  }
  return a;
}


