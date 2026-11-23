// Ligar a mesa no PC: o código vindo do endereço e o HTML de cada momento da página /vincular.
import { esc } from '../ui/cardtext';

/** Mesmo alfabeto do servidor (AccountLinks.ALPHABET): sem I, O, 0 e 1. */
const CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

/** O código de ?codigo=, em maiúsculas e sem hífen; '' se não for um código válido. */
export function codeFromQuery(search: string): string {
  const raw = new URLSearchParams(search).get('codigo') ?? '';
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return CODE.test(code) ? code : '';
}

/** ABCDEFGH → ABCD-EFGH, como na mesa do PC. */
export const formatCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

export type LinkState =
  | { kind: 'sem-codigo' }
  | { kind: 'desligadas' }
  | { kind: 'entrar'; erro?: string }
  | { kind: 'confirmar'; nome: string; enviando?: boolean; erro?: string }
  | { kind: 'pronto'; nome: string }
  | { kind: 'recusado' };

const codeBox = (code: string) => `<p class="vc-codigo">${esc(formatCode(code))}</p>`;
const error = (text?: string) => text ? `<p class="conta-erro" role="alert">${esc(text)}</p>` : '';

/** O cartão do meio da página para cada momento. */
export function linkHTML(state: LinkState, code: string): string {
  switch (state.kind) {
    case 'sem-codigo':
      return `<h2>Comece pela mesa no PC</h2>
        <p>Na mesa no PC, toque em <strong>Entrar com Google</strong>. Ela mostra um código e abre esta página com ele.</p>`;
    case 'desligadas':
      return '<h2>Contas desligadas</h2><p>As contas não estão ligadas neste servidor.</p>';
    case 'entrar':
      return `<h2>Ligar a mesa no PC à sua conta</h2>
        ${codeBox(code)}
        <p>Entre com a sua conta Google para ligar a mesa no PC a ela.</p>
        <div class="vc-google" data-google></div>
        ${error(state.erro)}`;
    case 'confirmar':
      return `<h2>Ligar a mesa no PC à sua conta?</h2>
        ${codeBox(code)}
        <p>Confira se é o mesmo código que aparece agora na mesa do PC. Ela vai entrar na conta de <strong>${esc(state.nome)}</strong>, com os seus decks.</p>
        <p class="vc-cuidado">Só confirme se foi você quem pediu, agora, na sua mesa. Se alguém mandou este endereço para você, toque em <strong>Não fui eu</strong>.</p>
        ${error(state.erro)}
        <div class="vc-botoes">
          <button type="button" class="arena-btn primary" data-confirmar${state.enviando ? ' disabled' : ''}>${state.enviando ? 'Ligando…' : 'Ligar a mesa'}</button>
          <button type="button" class="arena-btn" data-recusar${state.enviando ? ' disabled' : ''}>Não fui eu</button>
        </div>`;
    case 'pronto':
      return `<h2>Pronto!</h2>
        ${codeBox(code)}
        <p>A mesa no PC está entrando na conta de <strong>${esc(state.nome)}</strong>. Pode fechar esta página e voltar para ela.</p>`;
    case 'recusado':
      return '<h2>Nada foi ligado</h2><p>A mesa no PC continua fora da sua conta. Pode fechar esta página.</p>';
  }
}
