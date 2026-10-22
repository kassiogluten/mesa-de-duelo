#!/usr/bin/env node
/*
 * Triagem dos relatos dos jogadores (item 28). Os relatos ficam no volume "feedback-data" da ponte, em
 * relatos/AAAA-MM/<código>.json.gz, com um índice em relatos/indice.jsonl.
 *
 *   node deploy/relatos.mjs baixar [--container NOME] [--destino ./relatos]
 *       copia os relatos do container da ponte (docker cp). Para um servidor remoto: DOCKER_HOST=ssh://usuario@servidor.
 *   node deploy/relatos.mjs listar [--pasta ./relatos] [--tipo erro|sugestao]
 *   node deploy/relatos.mjs mostrar <código ou arquivo> [--pasta ./relatos]
 *   node deploy/relatos.mjs abrir <código ou arquivo> [--pasta ./relatos]
 *       endereço da página de repetição (com `npm run dev` rodando) já com o relato aberto.
 *   node deploy/relatos.mjs issue <código ou arquivo> [--pasta ./relatos] [--criar]
 *       monta uma issue só com o texto e o resumo técnico, sem a partida. Sem --criar, só mostra; com --criar, usa o gh.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { issueBody, issueTitle } from '../src/admin/reportSummary.ts';

const [command, ...rest] = process.argv.slice(2);
const flags = {}, args = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) { const [k, v] = rest[i].slice(2).split('='); flags[k] = v ?? (rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true); }
  else args.push(rest[i]);
}
const folder = resolve(flags.pasta ?? flags.destino ?? 'relatos');
const fail = message => { console.error(message); process.exit(1); };

function index() {
  const file = join(folder, 'relatos', 'indice.jsonl');
  if (!existsSync(file)) fail(`Não encontrei ${file}. Rode "baixar" antes ou use --pasta.`);
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
}

function find(ref) {
  if (!ref) fail('Informe o código (R-XXXX) ou o caminho do arquivo.');
  if (existsSync(ref) && statSync(ref).isFile()) return resolve(ref);
  const code = ref.toUpperCase();
  const entry = index().find(e => e.code === code);
  if (entry) return join(folder, 'relatos', entry.path);
  // Sem índice confiável: procura o arquivo nas pastas dos meses.
  for (const month of readdirSync(join(folder, 'relatos')).filter(d => /^\d{4}-\d{2}$/.test(d))) {
    const file = join(folder, 'relatos', month, `${code}.json.gz`);
    if (existsSync(file)) return file;
  }
  fail(`Relato ${code} não encontrado em ${folder}.`);
}

const read = file => { const bytes = readFileSync(file); return JSON.parse((bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).toString('utf8')); };

switch (command) {
  case 'baixar': {
    const container = flags.container ?? execFileSync('docker', ['ps', '--filter', 'label=com.docker.compose.service=bridge', '--format', '{{.Names}}'], { encoding: 'utf8' }).trim().split('\n')[0];
    if (!container) fail('Não achei o container da ponte. Use --container NOME (docker ps).');
    // Com a pasta de destino já existindo, o docker cp cria relatos/ dentro dela.
    mkdirSync(folder, { recursive: true });
    execFileSync('docker', ['cp', `${container}:/data/relatos`, folder], { stdio: 'inherit' });
    console.log(`Relatos copiados de ${container} para ${join(folder, 'relatos')}.`);
    break;
  }
  case 'listar': {
    const entries = index().filter(e => !flags.tipo || e.kind === flags.tipo);
    for (const e of entries) console.log([e.code.padEnd(7), e.receivedAt.slice(0, 16).replace('T', ' '), (e.kind ?? '').padEnd(8), (e.version ?? '').padEnd(8), (e.format ?? '—').padEnd(9),
      `${Math.round((e.bytes ?? 0) / 1024)} KB`.padStart(7), e.match ? (e.bridge ? 'partida+ponte' : 'partida') : ''].join('  '));
    console.log(`${entries.length} relato(s).`);
    break;
  }
  case 'mostrar': console.log(issueBody(read(find(args[0])))); break;
  case 'abrir': {
    const file = find(args[0]), root = resolve(new URL('..', import.meta.url).pathname);
    const path = relative(root, file);
    console.log(`http://localhost:5173/tests/fixtures/replay.html?arquivo=${encodeURIComponent(path.startsWith('..') ? `/@fs${file}` : `/${path}`)}`);
    break;
  }
  case 'issue': {
    const stored = read(find(args[0]));
    const title = issueTitle(stored), body = issueBody(stored);
    if (!flags.criar) { console.log(`Título: ${title}\n\n${body}\n\n(Revise o texto acima: ele expõe a descrição do jogador. Para criar a issue, repita com --criar.)`); break; }
    execFileSync('gh', ['issue', 'create', '--title', title, '--body', body, ...(flags.repo ? ['--repo', flags.repo] : [])], { stdio: 'inherit' });
    break;
  }
  default: console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\n?/, '').replace(/^ \* ?/gm, ''));
}
