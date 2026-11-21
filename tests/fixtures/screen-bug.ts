// Página de teste do inseto de quem assiste: a mesa de Commander por trás e botões para soltar a formiga ou o mosquito.
// ?auto solta um atrás do outro sem parar; ?zoom=4 mostra de perto; ?agendar liga o sorteio de quem assiste com intervalos curtos.
import './commander-table';
import { crawl, startScreenBugs, type BugKind, type Corner } from '../../src/ui/screenBug';

const q = new URLSearchParams(location.search);
let zoom = Number(q.get('zoom') ?? 1) || 1;
let corner: Corner | 'random' = 'random';
const bug = (kind: BugKind, at: Corner | 'random' = corner) => crawl(document.body, kind, { corner: at === 'random' ? undefined : at, zoom, force: true });

const panel = document.createElement('div');
panel.style.cssText = 'position:fixed;left:50%;top:38%;transform:translateX(-50%);z-index:2147483001;display:flex;gap:6px;flex-wrap:wrap;justify-content:center;padding:8px 10px;border-radius:12px;background:#0c1222e6;color:#eee;font:13px system-ui;box-shadow:0 6px 24px #0008';
panel.innerHTML = `
  <button data-bug="ant">Formiga</button><button data-bug="mosquito">Mosquito</button>
  <label>Canto <select data-corner><option value="random">qualquer</option><option value="bl">embaixo à esquerda</option><option value="br">embaixo à direita</option><option value="tl">em cima à esquerda</option><option value="tr">em cima à direita</option></select></label>
  <label>Tamanho <select data-zoom><option value="1">real</option><option value="3">3×</option><option value="6">6×</option></select></label>`;
document.body.append(panel);
(panel.querySelector('[data-zoom]') as HTMLSelectElement).value = String(zoom);
panel.addEventListener('click', e => { const kind = (e.target as HTMLElement).closest<HTMLElement>('[data-bug]')?.dataset.bug as BugKind | undefined; if (kind) void bug(kind); });
panel.addEventListener('change', e => {
  const t = e.target as HTMLSelectElement;
  if (t.matches('[data-zoom]')) zoom = Number(t.value);
  if (t.matches('[data-corner]')) corner = t.value as Corner | 'random';
});

Object.assign((window as any).fixture, { bug });
if (q.has('auto')) void (async () => { for (;;) { await bug('ant'); await bug('mosquito'); } })();
if (q.has('agendar')) startScreenBugs(document.body, () => true, { first: [1, 2], every: [3, 4] });
