// Novidades ainda sem número (pasta novidades-pendentes/): a mesa as mostra como "Próxima versão" até o /cp numerá-las.
import type { LabScenario } from './forge/client';
import { PENDING, mergeGroups } from './newsFeed';

/**
 * Cada mudança guarda o que o jogador vai ler numa pasta só dela, em novidades-pendentes/<pasta>/, em vez de escolher
 * um número de versão: `novidade.md` (os itens, em `### Novo`, `### Mudou` e `### Corrigido`), `imagens.json` (título
 * do item → prints da própria pasta) e `cenarios.json` (cenários do Laboratório, sem `versao`). Assim, tarefas em
 * paralelo nunca mexem nas mesmas linhas; o `npm run publicar-versao`, na hora de subir para a main, junta tudo numa
 * versão nova do CHANGELOG.md, de src/novidades.json e de src/lab-cenarios.json.
 */
export { PENDING, GROUPS, mergeGroups } from './newsFeed';

interface Shot { img: string; legenda: string }
interface PendingScenario { nome: string; versao?: string; item?: string; conferir: string; cenario: LabScenario }

const texts = import.meta.glob<string>('../novidades-pendentes/*/novidade.md', { eager: true, query: '?raw', import: 'default' });
const shots = import.meta.glob<Record<string, Shot[]>>('../novidades-pendentes/*/imagens.json', { eager: true, import: 'default' });
const files = import.meta.glob<string>('../novidades-pendentes/*/*.webp', { eager: true, query: '?url', import: 'default' });
const scenarios = import.meta.glob<PendingScenario[]>('../novidades-pendentes/*/cenarios.json', { eager: true, import: 'default' });
const folderOf = (key: string) => key.split('/').at(-2)!;

/** As novidades pendentes como uma seção do CHANGELOG (`## [Próxima]`), ou vazio quando não há nenhuma. */
export const PENDING_CHANGELOG = (() => {
  const mds = Object.values(texts);
  // Um novidade.md mal escrito não pode derrubar a tela inicial: o teste das novidades é que avisa.
  try { return mds.length ? `## [${PENDING}]\n\n${mergeGroups(mds).text}` : ''; } catch { return ''; }
})();

/** Prints das novidades pendentes, no formato de src/novidades.json, já com o endereço do arquivo na pasta delas. */
export const PENDING_VISUALS: Record<string, Shot[]> = {};
for (const [key, byTitle] of Object.entries(shots)) {
  const folder = folderOf(key);
  for (const [title, list] of Object.entries(byTitle)) {
    PENDING_VISUALS[title] = [...(PENDING_VISUALS[title] ?? []), ...list.map(s => ({ ...s, img: files[`../novidades-pendentes/${folder}/${s.img}`] ?? s.img }))];
  }
}

/** Cenários do Laboratório das correções pendentes, marcados com a versão "Próxima". */
export const PENDING_SCENARIOS = Object.values(scenarios).flat().map(s => ({ ...s, versao: PENDING }));
