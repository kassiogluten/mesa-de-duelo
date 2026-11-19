// Os botões do laboratório de efeitos que são novos (ou ganharam efeito novo): os da última versão publicada que trouxe algum e os das mudanças ainda sem número ganham o selo "novo"; só uma versão com botão novo tira o selo dos anteriores.
import published from './effects-lab-new.json';

/**
 * Cada botão novo é `<atributo>:<valor>`, o `data-` do botão no painel: "gpu:crown" é o `[data-gpu="crown"]` da seção
 * Efeitos na GPU, "play:commanderStrike" a jogada pronta. A mudança lista os seus em
 * novidades-pendentes/<pasta>/lab-efeitos.json; o `npm run publicar-versao` troca o effects-lab-new.json pelos da
 * versão nova quando ela traz algum, e o deixa como está quando não traz.
 */
const pending = import.meta.glob<string[]>('../../novidades-pendentes/*/lab-efeitos.json', { eager: true, import: 'default' });

/** O seletor do botão no painel. */
export function selectorOf(id: string) {
  const at = id.indexOf(':');
  return `[data-${id.slice(0, at)}="${CSS.escape(id.slice(at + 1))}"]`;
}

/** Os botões novos: da versão publicada (`versao`) e da próxima versão (as pastas pendentes). */
export function newButtons(): { id: string; when: string }[] {
  const out = new Map<string, string>();
  for (const id of published.botoes) out.set(id, `na ${published.versao}`);
  for (const list of Object.values(pending)) for (const id of list) out.set(id, 'na próxima versão');
  return [...out].map(([id, when]) => ({ id, when }));
}

/** Põe o selo "novo" nos botões do painel e a legenda logo abaixo do título. */
export function markNewButtons(panel: HTMLElement) {
  let marked = 0;
  for (const { id, when } of newButtons()) {
    for (const button of panel.querySelectorAll<HTMLElement>(`button${selectorOf(id)}`)) {
      button.classList.add('lab-new');
      button.title = `Novo ${when}`;
      marked++;
    }
  }
  if (!marked) return;
  const legend = document.createElement('p');
  legend.className = 'lab-new-legend';
  legend.innerHTML = `<span class="lab-new-dot"></span> ${marked === 1 ? 'Um botão novo' : `${marked} botões novos`} ou com efeito novo (passe o mouse para ver a versão).`;
  panel.querySelector('h1')?.after(legend);
}

/** O estilo do selo, para o painel. */
export const NEW_BUTTON_CSS = `
    #lab button.lab-new { position: relative; border-color: #63d68f; box-shadow: inset 0 0 0 1px #63d68f40; }
    #lab button.lab-new::after { content: 'novo'; position: absolute; top: -7px; right: -4px; padding: 0 4px; border-radius: 6px; background: #63d68f; color: #06210f; font: 800 9px/13px system-ui; letter-spacing: .03em; }
    #lab .lab-new-legend { display: flex; align-items: center; gap: 6px; color: #9fe6b8; font-size: 12px; }
    #lab .lab-new-dot { width: 10px; height: 10px; flex: none; border-radius: 3px; background: #63d68f; }`;
