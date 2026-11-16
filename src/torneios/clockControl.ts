// O relógio da rodada vivo na página Torneios: conta a cada meio segundo, toca o alarme do organizador e abre a tela cheia.
import { savedSoundPack, soundUrl } from '../ui/audio';
import { estadoTexto, fase, restante, telaoHTML, tempoTexto } from './clock';
import { nomeRodada, type Torneio } from './view';

/** O torneio de agora e quando a resposta chegou, para acertar a hora deste aparelho com a do servidor. */
type Atual = () => { torneio: Torneio; recebidoEm: number } | null;

/**
 * Liga o relógio: os números se atualizam sozinhos em toda parte que tem [data-relogio] (a página e a tela cheia).
 * Quando o tempo acaba, o aparelho de quem organiza toca um som e vibra, uma vez por rodada (e de novo se o tempo
 * for somado e acabar outra vez).
 */
export function ligarRelogio(atual: Atual) {
  let alarmeDe = '';

  function tick() {
    const a = atual();
    const r = a?.torneio.relogio;
    if (!a || !r) { fecharTelao(); return; }
    const ms = restante(r, a.recebidoEm);
    const f = fase(ms), texto = tempoTexto(ms), linha = estadoTexto(r, ms, a.torneio.minutosPorRodada);
    document.querySelectorAll<HTMLElement>('[data-relogio]').forEach(el => {
      el.classList.remove('f-ok', 'f-aviso', 'f-tempo');
      el.classList.add(`f-${f}`);
      const tempo = el.querySelector<HTMLElement>('[data-relogio-tempo]'), estado = el.querySelector<HTMLElement>('[data-relogio-estado]');
      if (tempo && tempo.textContent !== texto) tempo.textContent = texto;
      if (estado && estado.textContent !== linha) estado.textContent = linha;
    });
    // O alarme só vale para o tempo que acabou agora, correndo; abrir a página com o tempo já esgotado não toca.
    const chave = `${a.torneio.rodadasJogadas.length}:${r.terminaEm}`;
    if (r.estado === 'correndo' && f === 'tempo' && ms > -3000 && a.torneio.organizadorSouEu && alarmeDe !== chave) {
      alarmeDe = chave;
      alarme();
    }
  }

  function alarme() {
    try { void new Audio(`/${soundUrl(savedSoundPack(), 'alarm')}`).play().catch(() => {}); } catch { /* sem som */ }
    try { navigator.vibrate?.([400, 200, 400, 200, 400]); } catch { /* sem vibração */ }
  }

  function abrirTelao() {
    const a = atual();
    const r = a?.torneio.relogio;
    if (!a || !r) return;
    fecharTelao();
    const rodadas = a.torneio.rodadasJogadas;
    const ms = restante(r, a.recebidoEm);
    document.body.insertAdjacentHTML('beforeend', telaoHTML(a.torneio.nome, nomeRodada(rodadas[rodadas.length - 1]!), r, ms, a.torneio.minutosPorRodada));
    const telao = document.querySelector<HTMLElement>('[data-telao]')!;
    telao.querySelector<HTMLButtonElement>('[data-acao="sair-telao"]')!.focus();
    // Sem a tela cheia do navegador (iPhone), a camada ocupa a janela do mesmo jeito.
    telao.requestFullscreen?.().catch(() => {});
  }

  function fecharTelao() {
    const telao = document.querySelector<HTMLElement>('[data-telao]');
    if (!telao) return;
    if (document.fullscreenElement === telao) void document.exitFullscreen().catch(() => {});
    telao.remove();
    document.querySelector<HTMLElement>('[data-acao="telao"]')?.focus();
  }

  /** Rodada nova enquanto a tela cheia está aberta: o nome da rodada muda junto. */
  function atualizarTelao() {
    const a = atual();
    const telao = document.querySelector<HTMLElement>('[data-telao]');
    if (!telao || !a?.torneio.relogio) return;
    const rodadas = a.torneio.rodadasJogadas;
    telao.querySelector('.tn-telao-nome')!.textContent = a.torneio.nome;
    telao.querySelector('.tn-telao-rodada')!.textContent = nomeRodada(rodadas[rodadas.length - 1]!);
  }

  document.addEventListener('click', e => { if ((e.target as HTMLElement).closest('[data-acao="sair-telao"]')) fecharTelao(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharTelao(); });
  // Saiu da tela cheia pelo navegador (Esc, gesto): a camada sai junto.
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) fecharTelao(); });
  setInterval(tick, 500);

  return { tick, abrirTelao, fecharTelao, atualizarTelao };
}
