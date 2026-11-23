// Grava e lê arquivos .tar.gz simples (ustar, com o modo de cada arquivo), sem dependência: o pacote Linux da mesa no PC.
import { writeFileSync, readFileSync } from 'node:fs';
import zlib from 'node:zlib';

const BLOCK = 512;
/** O tar fecha em múltiplos de 10 KB (20 blocos), como o GNU tar grava por padrão. */
const RECORD = BLOCK * 20;

/** Campo numérico do cabeçalho: octal com zeros à esquerda e terminado em \0. */
function octal(header, value, offset, length) {
  const text = value.toString(8).padStart(length - 1, '0');
  if (text.length > length - 1) throw new Error(`Valor grande demais para o tar: ${value}`);
  header.write(`${text}\0`, offset, length, 'ascii');
}

/** Nome no formato ustar: até 100 bytes no campo do nome, ou prefixo (até 155) + "/" + nome. */
function splitName(name) {
  const bytes = Buffer.byteLength(name, 'utf8');
  if (bytes <= 100) return { prefix: '', base: name };
  const cut = name.lastIndexOf('/', name.length - 2);
  const prefix = name.slice(0, cut);
  const base = name.slice(cut + 1);
  if (cut <= 0 || Buffer.byteLength(prefix) > 155 || Buffer.byteLength(base) > 100) throw new Error(`Nome longo demais para o tar: ${name}`);
  return { prefix, base };
}

function header({ name, mode, size, mtime, dir }) {
  const h = Buffer.alloc(BLOCK);
  const { prefix, base } = splitName(name);
  h.write(base, 0, 100, 'utf8');
  octal(h, mode, 100, 8);
  octal(h, 0, 108, 8); // uid
  octal(h, 0, 116, 8); // gid
  octal(h, size, 124, 12);
  octal(h, mtime, 136, 12);
  h.fill(' ', 148, 156); // a soma é calculada com o campo dela em espaços
  h.write(dir ? '5' : '0', 156, 1, 'ascii');
  h.write('ustar\0', 257, 6, 'ascii');
  h.write('00', 263, 2, 'ascii');
  h.write('root', 265, 32, 'ascii');
  h.write('root', 297, 32, 'ascii');
  h.write(prefix, 345, 155, 'utf8');
  let sum = 0;
  for (const byte of h) sum += byte;
  h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return h;
}

/**
 * Grava o .tar.gz em `path`. `entries`: [{ name, data, mode }] (nome terminado em "/" é uma pasta; `mode` como 0o755).
 * Dono root:root, como num pacote: quem extrai fica dono dos arquivos.
 */
export function writeTarGz(path, entries, date = new Date()) {
  const mtime = Math.floor(date.getTime() / 1000);
  const parts = [];
  let size = 0;
  for (const { name, data = Buffer.alloc(0), mode } of entries) {
    const dir = name.endsWith('/');
    const body = dir ? Buffer.alloc(0) : data;
    parts.push(header({ name, mode: mode ?? (dir ? 0o755 : 0o644), size: body.length, mtime, dir }), body);
    const pad = (BLOCK - (body.length % BLOCK)) % BLOCK;
    if (pad) parts.push(Buffer.alloc(pad));
    size += BLOCK + body.length + pad;
  }
  // Dois blocos zerados marcam o fim; completa o registro.
  const end = BLOCK * 2 + ((RECORD - ((size + BLOCK * 2) % RECORD)) % RECORD);
  parts.push(Buffer.alloc(end));
  writeFileSync(path, zlib.gzipSync(Buffer.concat(parts), { level: 9 }));
}

/** Lê o .tar.gz: [{ name, mode, type, data }] na ordem do arquivo, conferindo a soma de cada cabeçalho. */
export function readTarGz(path) {
  const tar = zlib.gunzipSync(readFileSync(path));
  const entries = [];
  for (let pos = 0; pos + BLOCK <= tar.length;) {
    const h = tar.subarray(pos, pos + BLOCK);
    if (h.every(b => b === 0)) break;
    const field = (offset, length) => h.toString('utf8', offset, offset + length).replace(/\0.*$/s, '');
    const num = (offset, length) => parseInt(field(offset, length).trim() || '0', 8);
    let sum = 0;
    for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : h[i];
    if (sum !== num(148, 8)) throw new Error(`Soma do cabeçalho não confere em ${field(0, 100)}.`);
    if (field(257, 6) !== 'ustar') throw new Error('O tar não é ustar.');
    const prefix = field(345, 155);
    const name = prefix ? `${prefix}/${field(0, 100)}` : field(0, 100);
    const size = num(124, 12);
    const data = Buffer.from(tar.subarray(pos + BLOCK, pos + BLOCK + size));
    entries.push({ name, mode: num(100, 8), type: field(156, 1) || '0', data });
    pos += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
  }
  return entries;
}
