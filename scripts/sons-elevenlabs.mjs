#!/usr/bin/env node
// Gera na ElevenLabs os sons avulsos da mesa (o de cada tipo de criatura, a voz do narrador) e os prepara para tocar.
//
//   npm run sons:elevenlabs [-- <nome> ...] [--refazer]
//
// A lista com o pedido de cada som fica em audio-src/elevenlabs/sons.json. O original que a ElevenLabs devolve fica em
// audio-src/elevenlabs/<nome>.mp3 (com o pedido, o dia e o sha256 em manifest.json) e só é pedido de novo com
// --refazer; o que a mesa toca sai dele em public/audio/<nome>.mp3, sem o silêncio das pontas e no volume dos outros
// sons. Precisa de ELEVENLABS_API_KEY (só para gerar) e do ffmpeg (no PATH ou em FFMPEG=<caminho do executável>).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'audio-src', 'elevenlabs');
const OUT = join(ROOT, 'public', 'audio');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const API = 'https://api.elevenlabs.io/v1';
// O volume dos sons da mesa (medido nos MP3 do pacote clássico): cerca de -21 LUFS, com o pico abaixo de -6 dB.
const LOUDNESS = -21, PEAK = -6;

const args = process.argv.slice(2);
const redo = args.includes('--refazer');
const names = args.filter(a => !a.startsWith('--'));
const list = JSON.parse(readFileSync(join(SRC, 'sons.json'), 'utf8'));
const manifestPath = join(SRC, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
const chosen = list.filter(s => !names.length || names.includes(s.nome));
if (!chosen.length) { console.error('Nenhum som com esse nome em audio-src/elevenlabs/sons.json.'); process.exit(1); }

async function generate(sound) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('Defina ELEVENLABS_API_KEY para gerar sons na ElevenLabs.');
  const voice = sound.tipo === 'voz';
  const url = voice ? `${API}/text-to-speech/${sound.voz}?output_format=mp3_44100_128` : `${API}/sound-generation?output_format=mp3_44100_128`;
  const body = voice
    ? { text: sound.texto, model_id: sound.modelo ?? 'eleven_multilingual_v2', voice_settings: sound.ajustes ?? { stability: .35, similarity_boost: .8, style: .6 } }
    : { text: sound.pedido, duration_seconds: sound.duracao, prompt_influence: sound.influencia ?? .55 };
  const res = await fetch(url, { method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${sound.nome}: a ElevenLabs respondeu ${res.status} ${await res.text()}`);
  const data = Buffer.from(await res.arrayBuffer());
  return { data, record: { ...body, endpoint: url.replace(API, ''), gerado: new Date().toISOString().slice(0, 10), sha256: createHash('sha256').update(data).digest('hex') } };
}

function ffmpeg(input, filters, output) {
  const run = spawnSync(FFMPEG, ['-hide_banner', '-y', '-i', input, '-af', filters, ...(output ? ['-map_metadata', '-1', '-ac', '2', '-ar', '44100', '-codec:a', 'libmp3lame', '-b:a', '128k', '-write_xing', '1', output] : ['-f', 'null', '-'])], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(run.stderr || `ffmpeg falhou (${run.error?.message ?? run.status})`);
  return run.stderr;
}

/** Tira o silêncio das pontas, põe o eco do narrador (só na voz) e acerta o volume pelo dos outros sons da mesa. */
function prepare(sound, original, target) {
  const trim = 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-55dB,areverse';
  const color = sound.tipo === 'voz' ? ',bass=g=3:f=140,aecho=0.85:0.55:80|160:0.28|0.14' : '';
  const fade = ',areverse,afade=t=in:d=0.05,areverse';
  const measured = ffmpeg(original, `${trim}${color},ebur128=peak=true`);
  const loud = Number(/I:\s+(-?[\d.]+) LUFS/.exec(measured.slice(measured.lastIndexOf('Summary')))?.[1]);
  const peak = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(measured.slice(measured.lastIndexOf('Summary')))?.[1]);
  const gain = Math.min(LOUDNESS - loud, PEAK - peak) + (sound.ganho ?? 0);
  mkdirSync(dirname(target), { recursive: true });
  ffmpeg(original, `${trim}${color}${fade},volume=${gain.toFixed(2)}dB`, target);
  return { loud, peak, gain };
}

for (const sound of chosen) {
  const original = join(SRC, `${sound.nome}.mp3`);
  if (redo || !existsSync(original)) {
    const { data, record } = await generate(sound);
    mkdirSync(dirname(original), { recursive: true });
    writeFileSync(original, data);
    manifest[sound.nome] = record;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  const { loud, peak, gain } = prepare(sound, original, join(OUT, `${sound.nome}.mp3`));
  console.log(`${sound.nome}: ${loud.toFixed(1)} LUFS, pico ${peak.toFixed(1)} dB → ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB`);
}
