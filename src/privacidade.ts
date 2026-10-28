import './style.css';
import './ui/appHeader.css';
import './novidades.css';
import './privacidade.css';
import { WHATSAPP } from './ui/siteFooter';

/**
 * Política de privacidade (/privacidade.html), linkada no rodapé da tela inicial e no menu da conta. É também o
 * endereço cadastrado na tela de consentimento do Google. Precisa acompanhar o código: o que muda no que o jogo guarda
 * ou envia muda aqui também, com a data no topo.
 */
const UPDATED = '28 de outubro de 2026';
const ext = (href: string, text: string) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
const whatsapp = ext(WHATSAPP.link, `WhatsApp ${WHATSAPP.label}`);

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="home-top shared-shell-header vis-top">
    <a class="home-brand" href="/" aria-label="Mesa de Duelo — início"><span class="brand-mark" aria-hidden="true"></span><span>Mesa de Duelo</span></a>
    <a class="vis-back" href="/">Voltar ao jogo</a>
  </header>
  <main class="vis priv">
    <h1>Política de privacidade</h1>
    <p class="vis-lead">Atualizada em ${UPDATED}. Esta página explica quais dados o Mesa de Duelo usa, onde eles ficam, por quanto tempo e como você pede para ver ou apagar. Ela segue a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).</p>

    <section class="priv-resumo" aria-label="Resumo">
      <ul>
        <li><strong>Sem anúncios, sem rastreadores, sem venda de dados.</strong> O jogo não usa ferramentas de análise nem de publicidade.</li>
        <li><strong>A conta é opcional.</strong> Dá para jogar sem entrar; nesse caso, seus decks ficam só no seu aparelho.</li>
        <li><strong>Com a conta Google,</strong> guardamos só o seu primeiro nome, a foto, o apelido e o que você salva no jogo. Não guardamos seu e-mail.</li>
        <li><strong>Você apaga a conta quando quiser,</strong> no menu da conta, sem precisar pedir a ninguém.</li>
      </ul>
    </section>

    <section id="responsavel">
      <h2>Quem cuida dos dados</h2>
      <p>O Mesa de Duelo é um projeto de fã, gratuito e sem fins lucrativos, feito por Kassio, desenvolvedor independente, que é o responsável pelos dados (o "controlador", na LGPD) e também quem responde aos pedidos sobre eles.</p>
      <p>Contato: ${whatsapp}.</p>
    </section>

    <section id="aparelho">
      <h2>O que fica só no seu aparelho</h2>
      <p>Estes dados ficam no armazenamento do navegador (localStorage e IndexedDB) e não saem dele, a não ser nos casos descritos mais abaixo:</p>
      <ul>
        <li>os decks que você cria ou importa;</li>
        <li>o nome que você usa na mesa e as preferências (som, avisos, passar a vez automaticamente e outras);</li>
        <li>a partida em andamento, para voltar a ela depois de recarregar a página;</li>
        <li>a gravação da última partida, que só sai do aparelho se você anexá-la a um relato;</li>
        <li>uma cópia das cartas e imagens já vistas, para o jogo abrir mais rápido.</li>
      </ul>
      <p>Para apagar tudo isso, basta limpar os dados do site nas configurações do navegador. Se você não tiver conta, o que for apagado assim não volta.</p>
    </section>

    <section id="partidas">
      <h2>O que vai para o servidor quando você joga</h2>
      <p>As partidas rodam no servidor do jogo. Para isso, ele recebe:</p>
      <ul>
        <li><strong>O deck escolhido e o nome que você digitou na mesa.</strong> O nome aparece para os outros jogadores da sala; numa sala pública, ele também aparece na lista de salas para qualquer pessoa.</li>
        <li><strong>As jogadas da partida.</strong> Elas ficam na memória do servidor enquanto a partida existe e somem pouco depois do fim.</li>
        <li><strong>O resumo de cada partida concluída:</strong> formato, nomes dos jogadores, nomes dos decks, quem venceu, número de turnos e duração. Esse resumo é usado só para acompanhar o funcionamento do jogo e não é mostrado a outros jogadores.</li>
        <li><strong>Registros técnicos:</strong> como em qualquer site, o servidor anota o endereço IP, o horário e o que foi pedido. Esses registros servem para segurança e para encontrar erros, e são apagados pela própria hospedagem depois de algum tempo. Para limitar abusos (como tentar muitos códigos de sala), o servidor guarda, só na memória, um resumo do IP que não permite voltar ao endereço.</li>
      </ul>
      <p>As mensagens entre jogadores na sala são frases prontas; o jogo não tem chat livre.</p>
    </section>

    <section id="conta">
      <h2>Conta com Google</h2>
      <p>Entrar com Google serve para guardar seus decks e preferências e encontrá-los em outros aparelhos. Ao entrar, o Google envia ao jogo o seu identificador na conta Google, o seu nome, a sua foto e o seu e-mail. Desses dados, o servidor guarda:</p>
      <ul>
        <li>um código derivado do seu identificador Google, que não permite descobrir qual é a conta;</li>
        <li>o seu primeiro nome e o endereço da sua foto do Google, atualizados a cada vez que você entra;</li>
        <li>o seu apelido na mesa, que você pode mudar;</li>
        <li>os decks e as preferências que você salvar enquanto estiver conectado, incluindo os decks apagados há menos de 30 dias, que ficam numa lixeira para você poder recuperar;</li>
        <li>as sessões abertas (uma por aparelho conectado), guardadas de forma que não podem ser usadas por quem lê o arquivo. Uma sessão vale 180 dias e se renova enquanto você usa o jogo.</li>
      </ul>
      <p><strong>O e-mail e o nome completo não são guardados.</strong> A foto não é mostrada aos outros jogadores: ela aparece só no seu cabeçalho.</p>
      <p>Para ver o que a conta tem, abra o jogo conectado. Para apagar, use <strong>Apagar minha conta</strong> no menu da conta: tudo o que está nela sai do servidor na hora, e os decks do seu aparelho continuam nele. Contas sem uso não são apagadas automaticamente.</p>
      <p>O login é feito pelo Google Identity Services. O Google trata os seus dados de acordo com a ${ext('https://policies.google.com/privacy?hl=pt-BR', 'Política de Privacidade do Google')}, e você pode remover o acesso do Mesa de Duelo a qualquer momento em ${ext('https://myaccount.google.com/connections', 'Apps e serviços conectados à sua Conta do Google')}.</p>
    </section>

    <section id="relatos">
      <h2>Relatos de erro e sugestões</h2>
      <p>Quando você usa <strong>Enviar sugestão ou erro</strong>, o servidor guarda o texto que você escreveu e informações técnicas do aparelho: navegador, tamanho da tela, idioma, se o jogo está instalado e as preferências da mesa. Se você escolher anexar a partida, vão também a gravação dela e o registro do servidor sobre ela, que incluem os decks, as cartas na mão e os nomes de todos os jogadores daquela partida.</p>
      <p>Os relatos são lidos só pelo responsável, para corrigir erros, e ficam guardados por até 90 dias. Se você mandar um relato e quiser que ele seja apagado antes, peça pelo contato informando o código que aparece depois do envio.</p>
    </section>

    <section id="terceiros">
      <h2>Serviços de outras empresas</h2>
      <p>Algumas partes do jogo dependem de serviços de fora, que recebem o endereço IP e as informações normais de navegação de quem os acessa:</p>
      <ul>
        <li>${ext('https://scryfall.com/docs/privacy', 'Scryfall')}: o navegador busca nele as imagens e os textos das cartas.</li>
        <li>${ext('https://policies.google.com/privacy?hl=pt-BR', 'Google')}: as fontes do site (Google Fonts) e, se você usar, o login com Google.</li>
        <li>Moxfield e Archidekt: quando você importa um deck por link, é o servidor do jogo que busca a lista. O seu IP não é enviado a esses sites.</li>
        <li>A empresa de hospedagem do servidor, que guarda os dados descritos nesta página em nome do responsável.</li>
      </ul>
      <p>Alguns desses serviços ficam fora do Brasil, principalmente nos Estados Unidos. Por isso, os dados que eles recebem podem ser tratados lá, como permite a LGPD para a prestação do serviço que você pediu.</p>
    </section>

    <section id="cookies">
      <h2>Cookies</h2>
      <p>O Mesa de Duelo não cria cookies. O armazenamento do navegador descrito acima serve só para o jogo funcionar. O Google pode usar os próprios cookies quando você entra com a conta Google; eles seguem a política do Google.</p>
    </section>

    <section id="tempo">
      <h2>Por quanto tempo</h2>
      <ul>
        <li><strong>Conta:</strong> até você apagá-la.</li>
        <li><strong>Decks apagados:</strong> 30 dias na lixeira da conta.</li>
        <li><strong>Sessão de um aparelho:</strong> 180 dias sem usar o jogo, ou até você sair.</li>
        <li><strong>Relatos:</strong> até 90 dias.</li>
        <li><strong>Partida em andamento:</strong> enquanto existir, e pouco tempo depois do fim.</li>
        <li><strong>Resumo das partidas concluídas:</strong> sem prazo, para acompanhar o funcionamento do jogo ao longo do tempo. Você pode pedir que as partidas com o seu nome sejam apagadas.</li>
      </ul>
    </section>

    <section id="bases">
      <h2>Por que podemos usar esses dados</h2>
      <ul>
        <li><strong>Para entregar o que você pediu</strong> (art. 7º, V, da LGPD): rodar a partida, guardar a conta e sincronizar os decks.</li>
        <li><strong>Por interesse legítimo</strong> (art. 7º, IX): manter o jogo seguro, evitar abusos e corrigir erros, usando o mínimo de dados.</li>
        <li><strong>Com o seu consentimento</strong> (art. 7º, I): os relatos e as partidas anexadas a eles, que só são enviados quando você escolhe.</li>
      </ul>
    </section>

    <section id="direitos">
      <h2>Seus direitos</h2>
      <p>Pela LGPD, você pode confirmar se tratamos dados seus, ter acesso a eles, corrigi-los, pedir que sejam apagados, saber com quem são compartilhados e revogar o consentimento. Para a conta, o menu da conta já resolve a maior parte disso. Para o resto, fale pelo ${whatsapp}. A resposta vem em até 15 dias.</p>
      <p>Se achar que o seu pedido não foi atendido, você também pode reclamar à ${ext('https://www.gov.br/anpd/pt-br', 'Autoridade Nacional de Proteção de Dados (ANPD)')}.</p>
    </section>

    <section id="criancas">
      <h2>Crianças e adolescentes</h2>
      <p>O jogo não pede idade nem foi feito para coletar dados de crianças. A conta Google tem idade mínima definida pelo próprio Google; quem tem menos de 18 anos deve usar o jogo com o conhecimento de um responsável. Se um responsável quiser apagar dados de uma criança, basta falar pelo contato.</p>
    </section>

    <section id="seguranca">
      <h2>Segurança</h2>
      <p>A conexão com o jogo é criptografada (HTTPS). O servidor não guarda senhas: o login é feito pelo Google. As sessões são guardadas só como um resumo que não pode ser usado para entrar, e o acesso à área de administração é protegido por senha. Nenhum sistema é perfeito; se acontecer um incidente que coloque seus dados em risco, avisaremos aqui e à ANPD, como manda a lei.</p>
    </section>

    <section id="mudancas">
      <h2>Mudanças nesta política</h2>
      <p>Quando o jogo passar a usar dados de outro jeito, esta página muda junto, com a nova data no topo, e a mudança aparece em <strong>Novidades</strong>, na tela inicial.</p>
    </section>
  </main>`;

// A página é montada depois do carregamento: refaz o pulo para a âncora (#conta) que veio no link.
if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
