// Página de teste do inseto de quem assiste: a mesa de Commander por trás e botões para soltar a formiga ou o mosquito, e os bichos que atravessam a tela quando uma criatura do tipo deles entra.
// ?auto solta um atrás do outro sem parar; ?zoom=4 mostra de perto; ?agendar liga o sorteio de quem assiste com intervalos curtos.
import './commander-table';
import { convoy, crawl, startScreenBugs, type BugKind, type Corner } from '../../src/ui/screenBug';
import { critter, type CritterKind } from '../../src/ui/screenCritters';

const q = new URLSearchParams(location.search);
let zoom = Number(q.get('zoom') ?? 1) || 1;
let corner: Corner | 'random' = 'random';
const bug = (kind: BugKind, at: Corner | 'random' = corner) => crawl(document.body, kind, { corner: at === 'random' ? undefined : at, zoom, force: true });

const panel = document.createElement('div');
panel.style.cssText = 'position:fixed;left:50%;top:38%;transform:translateX(-50%);z-index:2147483001;display:flex;gap:6px;flex-wrap:wrap;justify-content:center;padding:8px 10px;border-radius:12px;background:#0c1222e6;color:#eee;font:13px system-ui;box-shadow:0 6px 24px #0008';
panel.innerHTML = `
  <button data-bug="ant">Formiga</button><button data-bug="mosquito">Mosquito</button><button data-convoy>Comboio</button>
  <button data-critter="squirrel">Esquilo</button><button data-critter="rat">Rato</button><button data-critter="spider">Aranha</button><button data-critter="bat">Morcego</button>
  <label>Canto <select data-corner><option value="random">qualquer</option><option value="bl">embaixo à esquerda</option><option value="br">embaixo à direita</option><option value="tl">em cima à esquerda</option><option value="tr">em cima à direita</option></select></label>
  <label>Tamanho <select data-zoom><option value="1">real</option><option value="3">3×</option><option value="6">6×</option></select></label>`;
document.body.append(panel);
(panel.querySelector('[data-zoom]') as HTMLSelectElement).value = String(zoom);
panel.addEventListener('click', e => {
  const kind = (e.target as HTMLElement).closest<HTMLElement>('[data-bug]')?.dataset.bug as BugKind | undefined;
  if (kind) void bug(kind);
  if ((e.target as HTMLElement).closest('[data-convoy]')) void convoy(document.body, { zoom, force: true });
  const beast = (e.target as HTMLElement).closest<HTMLElement>('[data-critter]')?.dataset.critter as CritterKind | undefined;
  if (beast) void critter(document.body, beast, { zoom, force: true });
});
panel.addEventListener('change', e => {
  const t = e.target as HTMLSelectElement;
  if (t.matches('[data-zoom]')) zoom = Number(t.value);
  if (t.matches('[data-corner]')) corner = t.value as Corner | 'random';
});

Object.assign((window as any).fixture, { bug, convoy: (toRight?: boolean) => convoy(document.body, { zoom, force: true, toRight }), critter: (kind: CritterKind, toRight?: boolean) => critter(document.body, kind, { zoom, force: true, toRight }) });
if (q.has('auto')) void (async () => { for (;;) { await bug('ant'); await bug('mosquito'); } })();
if (q.has('agendar')) startScreenBugs(document.body, () => true, { first: [1, 2], every: [3, 4], match: () => 'teste' });
