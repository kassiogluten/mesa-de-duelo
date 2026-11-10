#!/usr/bin/env node
// Converte a carta inteira de uma série própria da mesa (PNG gerado) nas imagens que a mesa usa no lugar das do Scryfall.
//
//   npm run arte -- <carta.png> "<nome em inglês>" [--arte topo,base,esquerda,direita]
//
//   carta.png  a carta inteira, em retrato 63:88 (por exemplo, output/imagegen/cartas-animes/sol-ring.png)
//   nome       o nome da carta em inglês, como o Forge e o Scryfall chamam ("Sol Ring")
//   --arte     a janela da arte, em frações da carta (padrão 0.11,0.86,0.05,0.95: arte cheia, como nos terrenos básicos);
//              vira a imagem do modo "só a arte"
//
// Grava public/cartas/<nome>-small.webp, -normal.webp e -art.webp e acrescenta o nome em src/own-art.json.
import fs from 'node:fs';
import sharp from 'sharp';

const args = process.argv.slice(2);
const flag = args.indexOf('--arte');
const window = flag >= 0 ? args.splice(flag, 2)[1].split(',').map(Number) : [0.11, 0.86, 0.05, 0.95];
const [src, name] = args;
if (!src || !name || window.length !== 4 || window.some(Number.isNaN)) {
  console.error('Uso: npm run arte -- <carta.png> "<nome em inglês>" [--arte topo,base,esquerda,direita]');
  process.exit(1);
}

const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const out = `public/cartas/${slug(name)}`;
const { width: W, height: H } = await sharp(src).metadata();
const [top, bottom, left, right] = window;
await sharp(src).resize(146, 204, { fit: 'fill' }).webp({ quality: 88 }).toFile(`${out}-small.webp`);
await sharp(src).resize(488, 680, { fit: 'fill' }).webp({ quality: 88 }).toFile(`${out}-normal.webp`);
await sharp(src)
  .extract({ left: Math.round(W * left), top: Math.round(H * top), width: Math.round(W * (right - left)), height: Math.round(H * (bottom - top)) })
  .resize({ width: 626, withoutEnlargement: true }).webp({ quality: 88 }).toFile(`${out}-art.webp`);

const listFile = 'src/own-art.json';
const list = JSON.parse(fs.readFileSync(listFile, 'utf8'));
if (!list.includes(name)) fs.writeFileSync(listFile, JSON.stringify([...list, name]) .replace(/","/g, '", "') + '\n');
console.log(`${out}-{small,normal,art}.webp`);
