// Página Contador de vida: para partidas no papel, um celular no meio da mesa marca a vida e o dano de comandante de todos.
import './style.css';
import './ui/appHeader.css';
import './novidades.css';
import './contador.css';
import { KEYS, load, save } from './storage';
import { aplicarConfig, comJogadores, configPadrao, lerConfig, lerPartida, novaPartida, reiniciar, type Config, type Partida } from './contador/state';
import { andamentoHTML, configHTML, proximaCor } from './contador/view';
import { montarMesa, type Mesa } from './contador/table';
import { iniciarTema } from './ui/temas';

iniciarTema();

/**
 * Contador de vida (/contador): sem servidor e sem internet (fica guardado com o app). A configuração e a partida
 * em andamento ficam neste aparelho, para a partida continuar depois de recarregar ou de o celular apagar a tela.
 */
interface Guardado { config: Config; partida: Partida | null }

function ler(): Guardado {
  try {
    const raw = JSON.parse(load(KEYS.contador) ?? 'null') as Partial<Guardado> | null;
    return { config: lerConfig(raw?.config) ?? configPadrao(), partida: lerPartida(raw?.partida) };
  } catch { return { config: configPadrao(), partida: null }; }
}

const estado = ler();
const guardar = () => save(KEYS.contador, JSON.stringify(estado));

const app = document.querySelector<HTMLDivElement>('#app')!;
let mesa: Mesa | null = null;

function telaConfig() {
  mesa?.destruir(); mesa = null;
  document.body.classList.remove('cv-jogando');
  app.innerHTML = `
    <header class="home-top shared-shell-header vis-top pt-top">
      <a class="home-brand" href="/" aria-label="Mesa de Duelo — início"><span class="brand-mark" aria-hidden="true"></span><span>Mesa de Duelo</span></a>
      <a class="vis-back" href="/">Voltar ao jogo</a>
    </header>
    <main class="vis cv-pagina">
      <h1>Contador de vida</h1>
      <p class="vis-lead">Para jogar com cartas de papel: deixe o celular no meio da mesa e cada jogador marca a sua vida no lado da tela virado para ele. Toque para somar ou tirar 1, segure para 10. Funciona sem internet.</p>
      <div data-config-raiz></div>
    </main>`;
  const raiz = app.querySelector<HTMLElement>('[data-config-raiz]')!;
  // Com uma partida em andamento, a configuração mostra os jogadores dela (Jogadores, no menu da mesa, cai aqui).
  if (estado.partida) estado.config = structuredClone(estado.partida.config);
  const desenhar = () => { raiz.innerHTML = configHTML(estado.config, estado.partida); };
  /** Nome, cor e parceiro valem na hora para a partida em andamento, não só para a próxima. */
  const levarParaPartida = () => {
    if (!estado.partida) return;
    aplicarConfig(estado.partida, estado.config);
    const linha = raiz.querySelector<HTMLElement>('[data-andamento]');
    if (linha) linha.innerHTML = andamentoHTML(estado.partida);
  };
  desenhar();

  raiz.addEventListener('change', e => {
    const alvo = e.target as HTMLInputElement;
    const c = estado.config;
    if (alvo.name === 'n') { estado.config = comJogadores(c, Number(alvo.value)); desenhar(); }
    else if (alvo.name === 'vida') {
      // 40 é Commander: o dano de comandante liga junto; as outras vidas o desligam. Dá para trocar depois.
      const vida = Number(alvo.value);
      estado.config = { ...c, vidaInicial: vida, comandante: vida === 40 };
      desenhar();
    } else if (alvo.matches('[data-comandante]')) { estado.config = { ...c, comandante: alvo.checked }; desenhar(); }
    else if (alvo.dataset.parceiro) { const j = c.jogadores[Number(alvo.dataset.parceiro)]; if (j) j.parceiro = alvo.checked; }
    levarParaPartida();
    guardar();
  });
  raiz.addEventListener('input', e => {
    const alvo = e.target as HTMLInputElement;
    const j = alvo.dataset.nome && estado.config.jogadores[Number(alvo.dataset.nome)];
    if (!j) return;
    j.nome = alvo.value;
    levarParaPartida();
    guardar();
  });
  raiz.addEventListener('click', e => {
    const alvo = e.target as HTMLElement;
    const cor = alvo.closest<HTMLElement>('[data-cor]');
    if (cor) {
      const jogadores = estado.config.jogadores, j = jogadores[Number(cor.dataset.cor)];
      if (!j) return;
      j.cor = proximaCor(j.cor, jogadores.map(x => x.cor));
      cor.closest<HTMLElement>('.cv-jog')!.style.setProperty('--cor', j.cor);
      levarParaPartida();
      guardar();
      return;
    }
    if (alvo.closest('[data-continuar]')) telaMesa();
  });
  raiz.addEventListener('submit', e => {
    e.preventDefault();
    if (estado.partida && !confirm('Começar outra partida? A que está em andamento é apagada.')) return;
    estado.partida = novaPartida(structuredClone(estado.config));
    guardar();
    telaMesa();
  });
}

function telaMesa() {
  const partida = estado.partida;
  if (!partida) { telaConfig(); return; }
  document.body.classList.add('cv-jogando');
  app.innerHTML = '<main class="cv-raiz" aria-label="Contador de vida"></main>';
  mesa = montarMesa(app.querySelector<HTMLElement>('.cv-raiz')!, partida, guardar, {
    reiniciar() { estado.partida = reiniciar(partida); guardar(); mesa?.destruir(); telaMesa(); },
    configurar() { telaConfig(); },
  });
}

if (estado.partida) telaMesa(); else telaConfig();
