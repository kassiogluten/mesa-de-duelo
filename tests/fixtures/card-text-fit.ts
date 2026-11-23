// Página de teste do encaixe do texto nas cartas "Arte e texto": nomes, tipos e regras longos, em todas as cores e tamanhos.
import '../../src/style.css';
import '../../src/ui/cardStyle.css';
import '../../src/ui/cardTextFit';
import { faceHTML } from '../../src/ui/face';

/*
 * Cartas inventadas, com texto de tamanhos diferentes, em cada cor da moldura. A arte é uma paisagem desenhada aqui
 * (sem rede: os prints não dependem do Scryfall). Pelo console: fixture.load({ width: 220 }) monta as cartas com outra
 * largura; fixture.load({ before: true }) mostra como era antes (letra fixa, barras bege e o fim esmaecido), para comparar.
 */
const ART: [sky1: string, sky2: string, sun: string, far: string, near: string][] = [
  ['#9fd3c7', '#e8f1d0', '#fff6c8', '#4f8a5b', '#2c5a35'],
  ['#2a1f4a', '#e0785a', '#ffd38a', '#5a3c5e', '#2a1c30'],
  ['#1d3b66', '#7fb2d9', '#e9f4ff', '#3d6f9a', '#1c3550'],
];
const landscape = ([sky1, sky2, sun, far, near]: typeof ART[number]) => `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 626 457"><defs><linearGradient id="s" x2="0" y2="1"><stop offset="0" stop-color="${sky1}"/><stop offset="1" stop-color="${sky2}"/></linearGradient></defs>`
  + `<rect width="626" height="457" fill="url(#s)"/><circle cx="430" cy="170" r="62" fill="${sun}" opacity=".9"/>`
  + `<path d="M0 300 Q150 200 300 280 T626 250 V457 H0Z" fill="${far}"/><path d="M0 380 Q200 300 380 370 T626 350 V457 H0Z" fill="${near}"/></svg>`)}`;
interface Card { name: string; cost: string; type: string; color: string; text: string; art: number; pt?: [number, number]; loyalty?: number }
const CARDS: Card[] = [
  { name: 'Guardiã da Clareira Ancestral', cost: '{2}{G}{G}', type: 'Criatura Lendária — Elfo Druida Guerreiro', color: 'G', art: 0, pt: [3, 5],
    text: 'Alcance\nNo início de sua manutenção, coloque um marcador +1/+1 em cada criatura que você controla com um marcador +1/+1.\n{T}: Adicione uma mana de qualquer cor. Gaste essa mana apenas para conjurar mágicas de criatura.' },
  { name: 'Tempestade de Brasas', cost: '{X}{R}{R}', type: 'Mágica Instantânea', color: 'R', art: 2,
    text: 'Tempestade de Brasas causa X pontos de dano divididos como você quiser entre qualquer número de alvos. Se uma criatura que sofreu dano desta forma morrer neste turno, exile-a em vez disso.\nSe X for 5 ou mais, copie esta mágica. Você pode escolher novos alvos para a cópia.' },
  { name: 'Anular', cost: '{U}{U}', type: 'Mágica Instantânea', color: 'U', art: 1, text: 'Anule a mágica alvo.' },
  { name: 'Engrenagem do Mestre Artífice', cost: '{3}', type: 'Artefato — Equipamento', color: 'C', art: 2,
    text: 'A criatura equipada recebe +2/+2 e tem vigilância.\nSempre que a criatura equipada atacar, crie uma ficha de criatura artefato 1/1 incolor Servo.\nEquipar {2}' },
  { name: 'Conselheira do Pacto Sombrio', cost: '{1}{W}{B}', type: 'Criatura — Humano Clérigo', color: 'M', art: 1, pt: [2, 3],
    text: 'Vínculo com a vida\nSempre que outra criatura que você controla morrer, cada oponente perde 1 ponto de vida e você ganha 1 ponto de vida.' },
  { name: 'Ruína Silenciosa', cost: '{2}{B}', type: 'Feitiço', color: 'B', art: 1,
    text: 'Cada jogador sacrifica uma criatura. Depois, cada jogador que sacrificou uma criatura desta forma descarta um card.' },
  { name: 'Sentinela da Muralha Branca', cost: '{1}{W}', type: 'Criatura — Humano Soldado', color: 'W', art: 0, pt: [2, 2], text: 'Vigilância' },
  { name: 'Cartógrafa dos Mares Esquecidos', cost: '{3}{U}{U}', type: 'Planeswalker Lendário — Nautilia', color: 'U', art: 2, loyalty: 4,
    text: '+1: Compre um card e depois descarte um card.\n−2: Devolva a permanente não terreno alvo à mão de seu dono.\n−7: Você recebe um emblema com "No início de sua etapa de compra, compre dois cards adicionais".' },
];

function load({ width = 160, before = false }: { width?: number; before?: boolean } = {}) {
  const art = (i: number) => landscape(ART[i]!);
  const face = (c: Card) => faceHTML({ name: c.name, manaCost: c.cost, typeLine: c.type, color: c.color, text: c.text, art: art(c.art), style: 'art',
    creature: !!c.pt, power: c.pt?.[0], toughness: c.pt?.[1], loyalty: c.loyalty });
  const cena = document.querySelector<HTMLElement>('#cena')!;
  cena.classList.toggle('antes', before);
  cena.style.setProperty('--tf-w', `${width}px`);
  cena.innerHTML = `<div class="tf-row">${CARDS.map((c, i) => `<div class="tf-card" data-i="${i}">${face(c)}</div>`).join('')}</div>`;
}

const style = document.createElement('style');
style.textContent = `body { margin: 0; padding: 16px; background: #0b1020; color: #eef1f8; font-family: system-ui, sans-serif; }
  .tf-row { display: flex; gap: 12px; flex-wrap: wrap; } .tf-card { width: var(--tf-w); aspect-ratio: 488 / 680; }
  .tf-card .face { position: relative; width: 100%; height: 100%; border-radius: 6px; overflow: hidden; }
  /* Como era antes: letra fixa, barras bege e o fim do texto sempre esmaecido. */
  .antes .art-face * { --af-ns: 1 !important; --af-ys: 1 !important; --af-ts: 1 !important; }
  .antes .af-head, .antes .af-type, .antes .af-text { background: #f6f0e1eb; box-shadow: none; }
  .antes .af-text { -webkit-mask-image: linear-gradient(#000 82%, transparent); mask-image: linear-gradient(#000 82%, transparent); }`;
document.head.append(style);

const params = new URLSearchParams(location.search);
load({ width: Number(params.get('largura') ?? 160), before: params.has('antes') });
Object.assign(window, { fixture: { load } });
