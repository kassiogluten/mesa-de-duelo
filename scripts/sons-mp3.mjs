#!/usr/bin/env node
// Converte os sons originais (audio-src/**/*.wav) nos MP3 que a mesa toca (public/audio/**/*.mp3), com o mesmo volume e corte.
//
//   npm run sons [-- <pacote|arquivo> ...]
//
// Precisa do ffmpeg: no PATH ou em FFMPEG=<caminho do executável>. Sem argumentos, converte tudo.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'audio-src');
const OUT = join(ROOT, 'public', 'audio');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
// 128 kb/s estéreo: perto de um décimo do WAV, sem diferença que se ouça nos efeitos curtos da mesa.
const BITRATE = '128k';

function wavs(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'sources' ? [] : wavs(path);
    return name.endsWith('.wav') ? [path] : [];
  });
}

const filters = process.argv.slice(2);
const chosen = wavs(SRC).filter(path => {
  const rel = relative(SRC, path).replaceAll('\\', '/');
  return !filters.length || filters.some(f => rel === f || rel.startsWith(`${f}/`) || rel.endsWith(`/${f}`));
});
if (!chosen.length) { console.error('Nenhum som encontrado em audio-src/.'); process.exit(1); }

let before = 0, after = 0;
for (const path of chosen) {
  const target = join(OUT, relative(SRC, path)).replace(/\.wav$/, '.mp3');
  mkdirSync(dirname(target), { recursive: true });
  // -write_xing guarda o atraso do codificador, que o navegador desconta: o som começa no mesmo ponto do WAV.
  const run = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', path, '-map_metadata', '-1', '-codec:a', 'libmp3lame',
    '-b:a', BITRATE, '-write_xing', '1', target], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (run.error) { console.error(`ffmpeg não encontrado (${run.error.message}). Instale-o ou passe FFMPEG=<caminho>.`); process.exit(1); }
  if (run.status) process.exit(run.status);
  before += statSync(path).size; after += statSync(target).size;
}
const mb = bytes => (bytes / 1048576).toFixed(2);
console.log(`${chosen.length} sons: ${mb(before)} MB em WAV → ${mb(after)} MB em MP3.`);
