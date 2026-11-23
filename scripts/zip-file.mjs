// Grava e lê arquivos .zip simples (deflate, nomes em UTF-8), sem dependência: usado pelo zip da mesa no PC e pelo teste dele.
import { closeSync, openSync, readFileSync, writeSync } from 'node:fs';
import zlib from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** CRC-32 do zip (o do zlib quando o Node tem, senão a tabela). */
function crc32(data) {
  if (zlib.crc32) return zlib.crc32(data) >>> 0;
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Data e hora no formato do MS-DOS que o zip guarda. */
function dosTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/**
 * Grava o zip em `path`. `entries`: [{ name, data }] (data: Buffer; nome terminado em "/" é uma pasta).
 * Cada arquivo é comprimido (deflate), a não ser que comprimido fique maior.
 */
export function writeZip(path, entries, date = new Date()) {
  const { time, day } = dosTime(date);
  const fd = openSync(path, 'w');
  const central = [];
  let offset = 0;
  const write = buf => { writeSync(fd, buf); offset += buf.length; };
  try {
    for (const { name, data = Buffer.alloc(0) } of entries) {
      const isDir = name.endsWith('/');
      const nameBuf = Buffer.from(name, 'utf8');
      const deflated = isDir ? data : zlib.deflateRawSync(data, { level: 9 });
      const method = !isDir && deflated.length < data.length ? 8 : 0;
      const body = method === 8 ? deflated : data;
      const crc = crc32(data);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(0x0800, 6); // nomes em UTF-8
      local.writeUInt16LE(method, 8);
      local.writeUInt16LE(time, 10);
      local.writeUInt16LE(day, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(body.length, 18);
      local.writeUInt32LE(data.length, 22);
      local.writeUInt16LE(nameBuf.length, 26);
      local.writeUInt16LE(0, 28);
      const header = Buffer.alloc(46);
      header.writeUInt32LE(0x02014b50, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(20, 6);
      header.writeUInt16LE(0x0800, 8);
      header.writeUInt16LE(method, 10);
      header.writeUInt16LE(time, 12);
      header.writeUInt16LE(day, 14);
      header.writeUInt32LE(crc, 16);
      header.writeUInt32LE(body.length, 20);
      header.writeUInt32LE(data.length, 24);
      header.writeUInt16LE(nameBuf.length, 28);
      header.writeUInt32LE(isDir ? 0x10 : 0x20, 38); // atributo do Windows: pasta ou arquivo
      header.writeUInt32LE(offset, 42);
      central.push(Buffer.concat([header, nameBuf]));
      write(local);
      write(nameBuf);
      write(body);
    }
    const dir = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(dir.length, 12);
    end.writeUInt32LE(offset, 16); // onde começa o diretório central
    write(dir);
    write(end);
  } finally {
    closeSync(fd);
  }
}

/** Lê o zip: [{ name, data }] na ordem do diretório central, conferindo o CRC de cada arquivo. */
export function readZip(path) {
  const buf = readFileSync(path);
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error(`${path} não é um zip.`);
  const count = buf.readUInt16LE(end + 10);
  let pos = buf.readUInt32LE(end + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) throw new Error('Diretório do zip corrompido.');
    const method = buf.readUInt16LE(pos + 10);
    const crc = buf.readUInt32LE(pos + 16);
    const size = buf.readUInt32LE(pos + 20);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const local = buf.readUInt32LE(pos + 42);
    const name = buf.toString('utf8', pos + 46, pos + 46 + nameLen);
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataStart, dataStart + size);
    const data = method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);
    if (crc32(data) !== crc) throw new Error(`CRC não confere em ${name}.`);
    entries.push({ name, data });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
