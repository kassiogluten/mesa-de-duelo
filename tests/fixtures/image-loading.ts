// Página de teste do carregando nas imagens das cartas: cartas, arte recortada, permanente e carta grande com a imagem atrasada de propósito.
import '../../src/style.css';
import '../../src/ui/cardStyle.css';
import '../../src/ui/imageLoading';
import { faceHTML } from '../../src/ui/face';

/*
 * As imagens vêm pelo /scryfall/ do Vite com ?lento (vite.config.ts), sempre com um endereço novo para não sair do
 * cache. Pelo console: fixture.load({ ms: 4000 }) monta a cena com a imagem chegando em 4 s e a small na
 * hora; smallMs atrasa a small e smallFirst: true a traz antes de montar; fixture.load({ fail: true }) faz tudo falhar, no
 * cache e no Scryfall; fixture.load({ ms: 0 }) mostra a cena pronta. Com ?lento=4000 na página, ela já começa assim.
 */
const CARDS: [name: string, cost: string, type: string, id: string, version: string, color: string, text: string][] = [
  ['Llanowar Elves', '{G}', 'Criatura — Elfo Druida', '6/a/6a0b230b-d391-4998-a3f7-7b158a0ec2cd', '1783909057', 'G', '{T}: Adicione {G}.'],
  ['Lightning Bolt', '{R}', 'Mágica Instantânea', '7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f', '1783903008', 'R', 'Lightning Bolt causa 3 pontos de dano a qualquer alvo.'],
  ['Counterspell', '{U}{U}', 'Mágica Instantânea', '4/f/4f616706-ec97-4923-bb1e-11a69fbaa1f8', '1783909630', 'U', 'Anule a mágica alvo.'],
  ['Sol Ring', '{1}', 'Artefato', 'f/c/fc817e07-c1f3-469f-9cf7-0945dea7400f', '1793021181', 'C', '{T}: Adicione {C}{C}.'],
];
const ATRAXA = 'd/0/d0d33d52-3d28-4635-b985-51e126289259';
const NONE = '0/0/00000000-0000-0000-0000-000000000000';

interface Options { ms?: number; smallMs?: number; fail?: boolean; smallFirst?: boolean }

async function load({ ms = 4000, smallMs = 0, fail = false, smallFirst = false }: Options = {}) {
  const v = Date.now();
  const q = `?lento=${ms}&lentoSmall=${smallMs}${fail ? '&falha=1' : ''}&v=${v}`;
  // Para falhar de vez, uma carta que o Scryfall também não tem (senão a reserva a traz de lá).
  const url = (size: string, id: string) => `/scryfall/${size}/front/${fail ? NONE : id}.jpg${q}`;
  // A small já no aparelho antes da cena (as imagens atrasadas ocupam as conexões, e a small esperaria atrás delas).
  if (smallFirst) await Promise.all([...CARDS.map(c => c[3]), ATRAXA].map(id => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = url('small', id); })));
  const face = (c: typeof CARDS[number], style?: 'art') => faceHTML({ name: c[0], manaCost: c[1], typeLine: c[2], creature: c[2].startsWith('Criatura'), power: 1, toughness: 1, color: c[5], text: c[6], image: url('normal', c[3]), art: url('art_crop', c[3]), style });
  document.querySelector('#cena')!.innerHTML = `
    <section id="mao"><h2>Mão</h2><div class="il-row">${CARDS.map(c => `<div class="il-card">${face(c)}</div>`).join('')}</div></section>
    <section id="arte"><h2>Arte e texto</h2><div class="il-row">${CARDS.map(c => `<div class="il-card">${face(c, 'art')}</div>`).join('')}</div></section>
    <section id="campo"><h2>Permanente</h2><div class="il-row"><div class="il-card"><div class="bfc">${face(CARDS[0])}</div></div></div></section>
    <section id="grande"><h2>Carta grande</h2><img class="big" src="${url('normal', ATRAXA)}" alt="Atraxa"></section>`;
}

const style = document.createElement('style');
style.textContent = `body { margin: 0; padding: 16px; background: #0b1020; color: #eef1f8; font-family: system-ui, sans-serif; }
  h2 { font-size: 14px; margin: 12px 0 8px; } .il-row { display: flex; gap: 10px; flex-wrap: wrap; }
  .il-card { width: 120px; aspect-ratio: 488 / 680; } .big { width: 260px; display: block; border-radius: 10px; }`;
document.head.append(style);

const initial = Number(new URLSearchParams(location.search).get('lento') ?? 4000);
load({ ms: initial });
Object.assign(window, { fixture: { load } });
