import type { FDungeon, FPlayer, FQuestion } from '../forge/client';
import './dungeon.css';
import { esc } from './cardtext';

/*
 * Masmorras (se aventurar na masmorra, iniciativa): o selo ao lado do retrato, o mapa de salas e a escolha
 * da próxima sala. A sala atual vem do servidor; as salas por onde o jogador já passou o Forge não guarda,
 * então o mapa só marca a atual, as próximas possíveis e as que ficaram para trás pela profundidade.
 */

const svg = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
export const DUNGEON_ICON = svg('M3 21V9l2-1V4h3v2h2V4h4v2h2V4h3v4l2 1v12h-7v-5a2 2 0 0 0-4 0v5z');
const INITIATIVE_ICON = svg('M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6zm-1 5h2v6h-2zm0 8h2v2h-2z');

export const INITIATIVE_HINT = 'Iniciativa: quem a toma, e quem a tem no começo da própria manutenção, se aventura na Undercity. Quem causar dano de combate a esse jogador toma a iniciativa.';

/** Profundidade de cada sala: o caminho mais longo desde a entrada (a primeira sala). */
export function roomDepths(dungeon: FDungeon) {
  const depth = new Map<string, number>();
  const rooms = dungeon.rooms;
  if (!rooms.length) return depth;
  depth.set(rooms[0].name, 0);
  // As salas vêm em ordem de caminho no card; repetir garante o maior caminho mesmo fora de ordem.
  for (let pass = 0; pass < rooms.length; pass++) {
    let changed = false;
    for (const r of rooms) {
      const d = depth.get(r.name);
      if (d === undefined) continue;
      for (const n of r.next) if ((depth.get(n) ?? -1) < d + 1) { depth.set(n, d + 1); changed = true; }
    }
    if (!changed) break;
  }
  return depth;
}

/** Em que passo da masmorra o jogador está (1 = entrada) e quantos passos ela tem até a última sala. */
export function dungeonProgress(dungeon: FDungeon) {
  const depth = roomDepths(dungeon);
  const total = Math.max(0, ...depth.values()) + 1;
  const step = dungeon.room !== undefined ? (depth.get(dungeon.room) ?? 0) + 1 : 0;
  return { step, total };
}

/** Salas para onde a próxima aventura leva: a entrada quando ainda não entrou, ou as saídas da sala atual. */
export function nextRooms(dungeon: FDungeon) {
  if (dungeon.room === undefined) return dungeon.rooms.length ? [dungeon.rooms[0].name] : [];
  return dungeon.rooms.find(r => r.name === dungeon.room)?.next ?? [];
}

const completedText = (p: FPlayer) => {
  const n = p.completedDungeons?.length ?? 0;
  return n ? `${n} ${n === 1 ? 'masmorra completada' : 'masmorras completadas'}` : '';
};

/** Texto para o leitor de tela, junto do nome e da vida do jogador. */
export function dungeonText(p: FPlayer) {
  const parts: string[] = [];
  if (p.initiative) parts.push('tem a iniciativa');
  if (p.dungeon) parts.push(p.dungeon.room ? `na masmorra ${p.dungeon.name}, sala ${p.dungeon.room}` : `na masmorra ${p.dungeon.name}`);
  const done = completedText(p);
  if (done) parts.push(done);
  return parts.map(t => `, ${t}`).join('');
}

/** Selos de iniciativa e de masmorra, para ir junto dos marcadores do jogador. `open` é o balão aberto por clique. */
export function dungeonBadgesHTML(p: FPlayer, open: string | null = null) {
  let html = '';
  if (p.initiative) {
    const key = `p${p.id}:INITIATIVE`;
    html += `<span class="player-counter initiative${open === key ? ' open' : ''}" data-ctr="${key}" aria-hidden="true">${INITIATIVE_ICON}<b>Iniciativa</b><span class="ctr-tip">${esc(INITIATIVE_HINT)}</span></span>`;
  }
  const d = p.dungeon, done = p.completedDungeons?.length ?? 0;
  if (d || done) {
    const { step, total } = d ? dungeonProgress(d) : { step: 0, total: 0 };
    const where = d ? `${d.name}${d.room ? ` · ${d.room}` : ''}` : completedText(p);
    html += `<button class="player-counter dungeon" data-gy="${p.id}" data-zone="dungeon" aria-label="Ver o mapa da masmorra de ${esc(p.name)}: ${esc(where)}">${DUNGEON_ICON}${d ? `<b>${step}</b><small>/${total}</small>` : `<b>✓${done}</b>`}<span class="ctr-tip" aria-hidden="true">${esc(where)}. Toque para ver o mapa.</span></button>`;
  }
  return html;
}

/**
 * Mapa da masmorra em níveis, da entrada até a última sala. `choices` são as salas que a escolha
 * pendente oferece; cada uma vira um botão que responde a pergunta (data-q-opt).
 */
export function dungeonMapHTML(dungeon: FDungeon, choices: Map<string, number> = new Map()) {
  const depth = roomDepths(dungeon);
  const levels: FDungeon['rooms'][] = [];
  for (const r of dungeon.rooms) (levels[depth.get(r.name) ?? 0] ??= []).push(r);
  const currentDepth = dungeon.room !== undefined ? depth.get(dungeon.room) ?? -1 : -1;
  const next = new Set(nextRooms(dungeon));
  const room = (r: FDungeon['rooms'][number]) => {
    const state = r.name === dungeon.room ? 'current' : (depth.get(r.name) ?? 0) <= currentDepth ? 'behind' : next.has(r.name) ? 'next' : '';
    const tag = state === 'current' ? '<em>Você está aqui</em>' : state === 'next' && !choices.size ? '<em>Próxima</em>' : '';
    const leads = r.next.length ? `<small class="dungeon-leads">Leva a: ${r.next.map(esc).join(', ')}</small>` : '<small class="dungeon-leads">Última sala: completa a masmorra.</small>';
    const body = `<strong>${esc(r.name)}</strong>${tag}<span>${esc(r.text)}</span>${leads}`;
    const choice = choices.get(r.name);
    return choice !== undefined
      ? `<button class="dungeon-room choice" data-q-opt="${choice}" aria-label="Ir para ${esc(r.name)}: ${esc(r.text)}">${body}</button>`
      : `<div class="dungeon-room ${state}"${state === 'current' ? ' aria-current="location"' : ''}>${body}</div>`;
  };
  return `<ol class="dungeon-map" aria-label="Salas de ${esc(dungeon.name)}, da entrada à última">${levels.map(level =>
    `<li class="dungeon-level" style="--rooms:${level.length}">${level.map(room).join('')}</li>`).join('')}</ol>`;
}

/** Janela do mapa, aberta pelo selo da masmorra. */
export function dungeonViewHTML(p: FPlayer) {
  const d = p.dungeon;
  const done = p.completedDungeons ?? [];
  const progress = d ? dungeonProgress(d) : null;
  const hint = !d ? 'Nenhuma masmorra em andamento.'
    : d.room ? `Sala atual: ${d.room} (passo ${progress!.step} de ${progress!.total}). Na próxima vez que se aventurar, ${nextRooms(d).length > 1 ? 'escolhe uma das salas marcadas' : 'vai para a sala marcada'}.`
    : 'Ainda não entrou. Na próxima vez que se aventurar, vai para a entrada.';
  return `<section class="question dungeon-view" role="dialog" aria-modal="true" aria-label="Masmorra de ${esc(p.name)}">
    <h2>${d ? esc(d.name) : 'Masmorras'} · ${esc(p.name)}</h2>
    ${p.initiative ? `<p class="q-hint dungeon-initiative">${INITIATIVE_ICON}${esc(INITIATIVE_HINT)}</p>` : ''}
    <p class="q-hint">${esc(hint)}</p>
    ${d ? dungeonMapHTML(d) : ''}
    ${done.length ? `<p class="q-hint">Completadas: ${done.map(esc).join(', ')}.</p>` : ''}
    <div class="q-actions"><button class="arena-btn secondary" data-ui="zone-close">Fechar</button></div>
  </section>`;
}

export const isDungeonRoom = (q: FQuestion) => q.purpose === 'dungeon-room';

/** Escolha da próxima sala: o mapa inteiro, com as salas oferecidas como botões. */
export function dungeonRoomHTML(q: FQuestion, head: string, owner: FPlayer | undefined) {
  const choices = new Map<string, number>();
  (q.options ?? []).forEach((o, i) => { if (typeof o !== 'string' && o.room) choices.set(o.room, i); });
  const d = owner?.dungeon;
  if (!d) {
    return `${head}<div class="q-opts">${(q.options ?? []).map((o, i) => typeof o === 'string' ? '' :
      `<button class="q-opt" data-q-opt="${i}"><span><b>${esc(o.label)}</b> ${esc(o.ability ?? '')}</span></button>`).join('')}</div>`;
  }
  return `${head}<p class="q-hint">${d.room ? `Você está em ${esc(d.room)}.` : ''} Toque na sala para onde quer ir.</p>${dungeonMapHTML(d, choices)}`;
}

/**
 * Junta os selos da masmorra aos marcadores do jogador, na mesma coluna ao lado do retrato. O botão do mapa
 * precisa ser alcançável pelo leitor de tela, então a coluna deixa de ser escondida dele quando o selo existe.
 */
export function withDungeonBadges(counters: string, badges: string) {
  if (!badges) return counters;
  if (!counters) return `<div class="player-counters">${badges}</div>`;
  return counters.replace(/^<div class="player-counters" aria-hidden="true">/, '<div class="player-counters">').replace(/<\/div>$/, `${badges}</div>`);
}
