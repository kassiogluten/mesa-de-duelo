import './siteFooter.css';

/** WhatsApp para contato, no formato do wa.me (país + DDD + número). */
export const WHATSAPP = { label: '(33) 92000-1670', link: 'https://wa.me/5533920001670' };

const ext = (href: string, text: string) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;

/**
 * Rodapé da tela inicial: créditos de quem faz o jogo funcionar, o aviso da Política de Conteúdo de Fãs da Wizards
 * (texto pedido pela política, traduzido), o contato e a política de privacidade.
 */
export function siteFooterHTML() {
  return `<footer class="site-footer">
    <p class="site-credits"><strong>Créditos.</strong> 
      Imagens e dados das cartas: ${ext('https://scryfall.com', 'Scryfall')}. Importação de decks: ${ext('https://moxfield.com', 'Moxfield')} e ${ext('https://archidekt.com', 'Archidekt')}.
      Fontes Inter e Outfit, pelo ${ext('https://fonts.google.com', 'Google Fonts')}. As ilustrações pertencem aos seus artistas.</p>
    <p class="site-legal">Mesa de Duelo é conteúdo de fã não oficial, gratuito, permitido pela ${ext('https://company.wizards.com/pt-br/legal/fancontentpolicy', 'Política de Conteúdo de Fãs')}.
      Não é aprovado nem endossado pela Wizards of the Coast e não tem nenhum vínculo com ela. Partes dos materiais usados são propriedade da Wizards of the Coast.
      Magic: The Gathering e seus logotipos são marcas da Wizards of the Coast LLC. ©Wizards of the Coast LLC.</p>
    <p class="site-contact">Contato: ${ext(WHATSAPP.link, `WhatsApp ${WHATSAPP.label}`)} · <a href="/privacidade.html">Política de privacidade</a></p>
  </footer>`;
}
