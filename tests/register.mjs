// Carregador dos testes: deixa o Node importar o código da mesa como o Vite importa.
// `npm test` liga com `--import ./tests/register.mjs`; num teste é só `await import('../src/ui/x.ts')`.
// - imports sem extensão ('./cardtext') viram '.ts';
// - TypeScript é convertido com o `typescript` do projeto;
// - CSS vira módulo vazio, `?raw` vira o texto do arquivo, JSON vira `export default`;
// - `import.meta.env` existe (BASE_URL '/', DEV false) e `virtual:pwa-register` é um módulo vazio;
// - `import.meta.glob(..., { eager: true })` lê os arquivos do disco (`?raw` vira texto, `?url` o endereço, JSON o objeto).
import { registerHooks } from 'node:module';
import { globSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ENV = "import.meta.env = { BASE_URL: '/', DEV: false, PROD: true, MODE: 'test' };\n";
const GLOB = file => `import.meta.glob = (pattern, options) => globalThis.__testGlob(${JSON.stringify(file)}, pattern, options);\n`;

/** O `import.meta.glob` do Vite, só no modo eager (o único que a mesa usa): chave é o caminho como no padrão. */
globalThis.__testGlob = (file, pattern, { eager, query, import: name } = {}) => {
  if (!eager) throw new Error(`import.meta.glob sem eager não existe nos testes (${file})`);
  const dir = dirname(file), out = {};
  for (const rel of globSync(pattern, { cwd: dir }).sort()) {
    const abs = resolve(dir, rel);
    const value = query === '?raw' ? readFileSync(abs, 'utf8') : query === '?url' ? pathToFileURL(abs).href : JSON.parse(readFileSync(abs, 'utf8'));
    out[rel.startsWith('.') ? rel : `./${rel}`] = name === 'default' ? value : { default: value };
  }
  return out;
};
const CODE = /\.[cm]?[jt]sx?$/;

// Módulo falso num teste: `const { mock } = await import('./register.mjs'); mock('../src/scryfall.ts', 'export const x = 1;', import.meta.url)`
// antes de importar o código; todo import que chegar nesse arquivo recebe o falso.
const MOCKS = new Map();
export function mock(path, source, base) { MOCKS.set(new URL(path, base).href, source); }

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('virtual:')) return { url: `data:text/javascript,export const registerSW = () => () => {};`, shortCircuit: true };
    if (MOCKS.size && !specifier.startsWith('data:')) {
      let resolved; try { resolved = nextResolve(specifier, context).url; } catch { try { resolved = nextResolve(`${specifier}.ts`, context).url; } catch { /* segue */ } }
      if (resolved && MOCKS.has(resolved)) return { url: `data:text/javascript;base64,${Buffer.from(MOCKS.get(resolved)).toString('base64')}`, shortCircuit: true };
    }
    const [path, query] = specifier.split('?');
    if (query === 'raw') {
      const { url } = nextResolve(path, context);
      return { url: `${url}?raw`, shortCircuit: true };
    }
    try { return nextResolve(specifier, context); }
    catch (error) {
      if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !CODE.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw error;
    }
  },
  load(url, context, nextLoad) {
    if (!url.startsWith('file:')) return nextLoad(url, context);
    const file = fileURLToPath(url.split('?')[0]);
    if (url.endsWith('?raw')) return { format: 'module', source: `export default ${JSON.stringify(readFileSync(file, 'utf8'))};`, shortCircuit: true };
    if (file.endsWith('.css')) return { format: 'module', source: 'export default "";', shortCircuit: true };
    if (file.endsWith('.json') && context.importAttributes?.type !== 'json') return { format: 'module', source: `export default ${readFileSync(file, 'utf8')};`, shortCircuit: true };
    if (file.endsWith('.ts')) {
      const out = ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
      return { format: 'module', source: ENV + GLOB(file) + out.outputText, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
