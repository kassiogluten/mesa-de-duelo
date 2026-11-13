import '../../src/style.css';
import { mountAppHeader } from '../../src/ui/appHeader';
import { KEYS, saveJSON, save } from '../../src/storage';
import { FORGE_URL, bridgeHttpUrl } from '../../src/forge/client';
import { statusUrl, type MyReport, type SavedReport } from '../../src/myReports';
import { checkMyReports } from '../../src/ui/myReportsNotice';
import { openMyReportsDialog } from '../../src/ui/myReportsDialog';

/*
 * Meus relatos sem o servidor: o cabeçalho da tela inicial com o menu ⋯, três relatos guardados no aparelho e a
 * rota da situação respondida aqui mesmo. Pelo console, window.fixture muda a cena:
 * fixture.set([...]) troca os relatos que o "servidor" devolve, fixture.offline(true) derruba o servidor,
 * fixture.reset() esquece o que foi visto e avisado, fixture.check() consulta e mostra o aviso e
 * fixture.open() abre a tela. Com ?vazio a página começa sem relato nenhum.
 */
const URL_REPORTS = bridgeHttpUrl('/api/relatos', FORGE_URL);
const DAY = 86_400_000;
const at = (daysAgo: number) => new Date(Date.UTC(2026, 10, 13, 15) - daysAgo * DAY).toISOString();

type Served = Omit<MyReport, 'at'> & { receivedAt: string };
let served: Served[] = new URLSearchParams(location.search).has('vazio') ? [] : [
  { code: 'R-7K2Q', kind: 'erro', summary: 'A Shorikai não desvirou no começo do meu turno depois de tripular com o Piloto.', receivedAt: at(3), status: 'resolvido',
    reply: 'Obrigado pelo relato! Era um erro ao desvirar veículos tripulados por fichas. Corrigido na versão 0.167.0: a partida anexada ajudou a repetir.', repliedAt: at(1) },
  { code: 'R-M4XD', kind: 'sugestao', summary: 'Seria bom poder ordenar a mão por custo de mana.', receivedAt: at(6), status: 'analise' },
  { code: 'R-P9HB', kind: 'erro', summary: 'O som da compra de carta tocou duas vezes.', receivedAt: at(9), status: 'recebido' },
];
let down = false;

function seed() {
  const saved: SavedReport[] = served.map(r => ({ code: r.code, key: `chave-${r.code}`, url: URL_REPORTS, at: Date.parse(r.receivedAt), kind: r.kind, summary: r.summary }));
  saveJSON(KEYS.meusRelatos, saved);
}

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url !== statusUrl(URL_REPORTS)) return realFetch(input, init);
  if (down) throw new TypeError('offline');
  const asked = new Set((JSON.parse(String(init?.body ?? '{}')).relatos ?? []).map((r: { code: string }) => r.code));
  return new Response(JSON.stringify({ relatos: served.filter(r => asked.has(r.code)) }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

const reset = () => { save(KEYS.relatosLidos, null); };
reset();
seed();
mountAppHeader(document.querySelector<HTMLElement>('#top')!, { active: 'play', onPlay() {}, onDecks() {} });
const check = () => checkMyReports(() => true);

Object.assign(window, {
  fixture: {
    set(list: Served[]) { served = list; seed(); },
    offline(on = true) { down = on; },
    reset,
    check,
    open: openMyReportsDialog,
  },
});
void check();
