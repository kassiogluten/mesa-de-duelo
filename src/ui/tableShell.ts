// A casca da mesa: todos os elementos fixos (barra do topo, menu, Opções, gavetas, campos, mão, caixa de ação e janelas),
// desenhada uma vez quando a mesa é criada. O conteúdo de cada parte vem depois, a cada desenho da forgeTable.ts.
import { esc } from './cardtext';
import { VERSION } from './changelog';
import { canFullscreen } from './landscape';
import { UNDO_ICON } from './undo';
import { SOUND_PACKS } from './audio';
import { PASS_LEVELS, PASS_LEVEL_ALWAYS, passLevelInfo } from './passLevel';
import { screenWake } from './screenWake';
import { temaOptionsHTML, temasDisponiveis } from './temas';

/** feedback: há "Enviar sugestão ou erro"; download: "Baixar gravação" (desenvolvimento); buzz: o aparelho vibra. */
export function tableShellHTML(o: { feedback: boolean; download: boolean; buzz: boolean }) {
  return `
  <div class="arena forge">
    <div class="mat" aria-hidden="true"></div>
    <div class="topbar">
      <button class="icon-btn game-menu-trigger" data-ui="menu" aria-label="Menu" aria-expanded="false" aria-controls="fMenu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg><span class="menu-label">Menu</span></button>
      <button class="icon-btn fs-btn" data-ui="fullscreen" aria-label="Tela cheia" title="Tela cheia"${canFullscreen() ? '' : ' hidden'}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path class="fs-enter" d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><path class="fs-exit" d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/></svg>
      </button>
      <button class="icon-btn undo-btn" id="fUndo" data-ui="undo" hidden>${UNDO_ICON}<span class="undo-label">Desfazer</span></button>
      <div class="turn-info" id="fTurnInfo"></div>
      <ul class="match-bar" id="fMatchBar" aria-label="Partida"></ul>
    </div>
    <div class="skip-bar" id="fSkipBar" aria-live="polite" hidden></div>
    <nav class="menu game-menu" id="fMenu" aria-label="Menu da partida" hidden>
      <div class="game-menu-meta"><span class="format-tag" id="fFormatTag" hidden></span><span class="room-tag" id="fRoomTag" hidden></span><span class="series-score" id="fSeries" hidden></span></div>
      <p class="game-menu-audience" id="fAudience" hidden></p>
      <button class="btn" data-ui="log" aria-expanded="false" aria-controls="fLogDrawer">Registro</button>
      <button class="btn" data-ui="errors" aria-expanded="false" aria-controls="fErrorsDrawer">Erros da partida<span class="menu-count" id="fErrorsCount" hidden></span></button>
      <button class="btn" data-ui="feedback" aria-haspopup="dialog"${o.feedback ? '' : ' hidden'}>Enviar sugestão ou erro</button>
      <button class="btn" data-ui="settings" aria-haspopup="dialog" aria-expanded="false" aria-controls="fSettings">Opções</button>
      <div class="game-menu-divider" aria-hidden="true"></div>
      <button class="btn" data-ui="rematch" id="fMenuRematch">Recomeçar partida</button>
      <button class="btn" data-ui="watchable" id="fMenuWatchable" hidden></button>
      <button class="btn" data-ui="lab-close" id="fMenuLab" hidden>Fechar a sala e voltar ao Laboratório</button>
      <button class="btn" data-ui="exit" id="fMenuExit">Desistir e voltar ao início</button>
      <button type="button" class="game-menu-version" data-ui="version" aria-pressed="false" title="Toque para ver as versões das regras e do motor">Mesa de Duelo ${esc(VERSION)}</button>
    </nav>
    <div class="overlay game-options-overlay" id="fSettings" hidden>
      <section class="game-options" role="dialog" aria-modal="true" aria-labelledby="fSettingsTitle">
        <header class="game-options-heading"><h2 id="fSettingsTitle">Opções</h2><button class="icon-btn game-options-close" data-ui="settings-close" aria-label="Fechar opções"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
        <details class="game-option-group" data-options-group="sound">
          <summary><svg class="game-option-group-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg><span class="game-option-group-title">Som</span><span class="game-option-group-value" id="fSoundSummary"></span></summary>
          <div class="game-option-row"><span id="fSoundLabel">Efeitos sonoros</span><button class="sound-switch" id="fMute" data-ui="mute" role="switch" aria-checked="false" aria-labelledby="fSoundLabel"><span class="sound-switch-track" aria-hidden="true"><span></span></span><span id="fSoundState" aria-hidden="true">Desligados</span></button></div>
          <div class="game-option-volume"><div class="game-option-row"><label for="fVolume">Volume</label><output id="fVolumeValue" for="fVolume">35%</output></div><input id="fVolume" type="range" min="0" max="100" step="5" value="35" aria-valuetext="35%">
          <div class="game-option-pace"><label for="fSoundPack">Pacote de sons</label><select id="fSoundPack" aria-describedby="fSoundPackHint">${SOUND_PACKS.map(pack => `<option value="${pack.id}">${pack.name}</option>`).join('')}</select><p id="fSoundPackHint">Ao trocar, toca uma amostra do pacote escolhido.</p></div></div>
        </details>
        <details class="game-option-group" data-options-group="play">
          <summary><svg class="game-option-group-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg><span class="game-option-group-title">Jogo</span><span class="game-option-group-value" id="fPlaySummary"></span></summary>
          <div class="game-option-pace game-option-auto-pass"><label for="fPassLevel">Passar automaticamente</label><select id="fPassLevel" aria-describedby="fPassLevelHint fPassLevelAlways fPassLevelStatus" disabled>${PASS_LEVELS.map(level => `<option value="${level.id}">${level.name}</option>`).join('')}</select><p id="fPassLevelHint">${passLevelInfo('acoes').hint}</p><p id="fPassLevelAlways">${PASS_LEVEL_ALWAYS} Para trocar durante a partida, toque no botão pequeno ao lado do botão principal.</p><p id="fPassLevelStatus" role="status">Aguardando conexão com o servidor.</p></div>
          <div class="game-option-auto-pass"><div class="game-option-row"><span id="fTurnNoticeLabel">Notificar quando for seu turno</span><button class="sound-switch" id="fTurnNotice" data-ui="turn-notice" role="switch" aria-checked="false" aria-labelledby="fTurnNoticeLabel" aria-describedby="fTurnNoticeHint fTurnNoticeStatus"><span class="sound-switch-track" aria-hidden="true"><span></span></span><span id="fTurnNoticeState" aria-hidden="true">Desligado</span></button></div><p id="fTurnNoticeHint">Com a mesa em outra aba ou minimizada, o título da aba pisca quando o seu turno começa. Ligado, aparece também um aviso do sistema.</p><p id="fTurnNoticeStatus" role="status" hidden></p></div>
          ${screenWake.supported ? `<div class="game-option-auto-pass"><div class="game-option-row"><span id="fAwakeLabel">Manter a tela acesa</span><button class="sound-switch" id="fAwake" data-ui="awake" role="switch" aria-checked="true" aria-labelledby="fAwakeLabel" aria-describedby="fAwakeHint"><span class="sound-switch-track" aria-hidden="true"><span></span></span><span id="fAwakeState" aria-hidden="true">Ligado</span></button></div><p id="fAwakeHint">Durante a partida, a tela do aparelho não apaga sozinha enquanto os outros jogam.</p></div>` : ''}
          ${o.buzz ? `<div class="game-option-auto-pass"><div class="game-option-row"><span id="fBuzzLabel">Vibrar na sua vez</span><button class="sound-switch" id="fBuzz" data-ui="buzz" role="switch" aria-checked="true" aria-labelledby="fBuzzLabel" aria-describedby="fBuzzHint"><span class="sound-switch-track" aria-hidden="true"><span></span></span><span id="fBuzzState" aria-hidden="true">Ligado</span></button></div><p id="fBuzzHint">O celular vibra quando o seu turno começa, quando você precisa bloquear e quando chega uma decisão sua no turno de outro jogador.</p></div>` : ''}
          <div class="game-option-pace"><label for="fPace">Ritmo das jogadas</label><select id="fPace" aria-describedby="fPaceHint"><option value="normal">Normal</option><option value="fast">Rápido sem resposta</option></select><p id="fPaceHint">Acelere as animações quando não houver uma decisão sua. Suas respostas continuam disponíveis imediatamente.</p></div>
        </details>
        <details class="game-option-group" data-options-group="look">
          <summary><svg class="game-option-group-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg><span class="game-option-group-title">Aparência</span><span class="game-option-group-value" id="fLookSummary"></span></summary>
          <div class="game-option-pace"><label for="fCardStyle">Estilo das cartas</label><select id="fCardStyle" aria-describedby="fCardStyleHint"><option value="full">Imagem completa</option><option value="art">Arte e texto</option><option value="arena">Arena</option></select><p id="fCardStyleHint">Arte e texto mostra a arte da carta com nome, custo e texto em letras da mesa, mais fáceis de ler em telas pequenas. Arena deixa as permanentes no campo só com a arte e os atributos num rodapé. O texto inteiro continua no inspetor.</p></div>
          <div class="game-option-auto-pass"><div class="game-option-row"><span id="fPlaymatLabel">Tapete com a arte do deck</span><button class="sound-switch" id="fPlaymat" data-ui="playmat" role="switch" aria-checked="true" aria-labelledby="fPlaymatLabel" aria-describedby="fPlaymatHint"><span class="sound-switch-track" aria-hidden="true"><span></span></span><span id="fPlaymatState" aria-hidden="true">Ligado</span></button></div><p id="fPlaymatHint">Atrás do campo de cada jogador, a arte de capa do deck dele, escura e desfocada.</p></div>
          <div class="game-option-pace"${temasDisponiveis() ? '' : ' hidden'}><label for="fTema">Tema da mesa</label><select id="fTema" aria-describedby="fTemaHint">${temaOptionsHTML()}</select><p id="fTemaHint">Muda a cor do fundo da mesa. Vale também na tela inicial e acompanha a sua conta.</p></div>
        </details>
        <footer><button type="button" class="game-options-shortcuts" data-ui="shortcuts" aria-haspopup="dialog" aria-keyshortcuts="Shift+?">Atalhos de teclado <kbd>?</kbd></button><button class="arena-btn secondary" data-ui="settings-close">Voltar à partida</button></footer>
      </section>
    </div>
    <aside class="log-drawer errors-drawer" id="fErrorsDrawer" hidden aria-labelledby="fErrorsTitle"><div class="stack-heading"><h2 id="fErrorsTitle">Erros da partida</h2><button class="icon-btn" data-ui="errors" aria-label="Fechar erros da partida">Fechar</button></div>
      <p class="errors-hint">Avisos de erro, ações que o servidor ignorou, quedas de conexão e falhas da mesa. Relate o erro para mandar a partida junto, ou copie o relatório.</p>
      <ul id="fErrors"></ul>
      <div class="errors-actions"><button class="ghost-btn" data-ui="errors-report" aria-haspopup="dialog"${o.feedback ? '' : ' hidden'}>Relatar este erro</button><button class="ghost-btn" data-ui="errors-copy">Copiar relatório</button><button class="ghost-btn" data-ui="errors-download"${o.download ? '' : ' hidden'}>Baixar gravação</button><button class="ghost-btn" data-ui="errors-clear">Limpar</button></div>
      <p class="errors-status" id="fErrorsStatus" role="status" aria-live="polite"></p></aside>
    <aside class="log-drawer" id="fLogDrawer" hidden><div class="stack-heading"><h2>Histórico da partida</h2><button class="icon-btn" data-ui="log" aria-label="Fechar histórico">Fechar</button></div><ul id="fLog"></ul></aside>

    <div class="opp-hand" id="fOppHand"></div>
    <div class="avatar-slot opp" id="fOppAvatar"></div>
    <div class="piles opp" id="fOppPiles"></div>

    <section class="field opp" aria-label="Campo do oponente">
      <div class="playmat" id="fOppMat" aria-hidden="true" hidden></div>
      <div class="row lands" id="fOppLands"></div>
      <div class="row creatures" id="fOppCreatures"></div>
    </section>
    <section class="commander-opponents" id="fOpponents" aria-label="Campos dos oponentes" hidden></section>
    <section class="own-command" id="fCommand" aria-label="Sua zona de comando" hidden></section>
    <div class="divider" aria-hidden="true"></div>
    <svg class="combat-arrows" id="fArrows" aria-hidden="true"></svg>
    <section class="field me" aria-label="Seu campo">
      <div class="playmat" id="fMeMat" aria-hidden="true" hidden></div>
      <div class="row creatures" id="fMeCreatures"></div>
      <div class="row lands" id="fMeLands"></div>
    </section>

    <div class="avatar-slot me" id="fMeAvatar"></div>
    <div class="piles me" id="fMePiles"></div>
    <div class="hand" id="fHand"></div>
    <button type="button" class="phase-hand" id="fHandAuto" data-ui="hand-auto" aria-pressed="false" aria-label="Mão automática" title="Mão automática: recolhida, sobe ao passar o mouse"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V5.5a1.5 1.5 0 0 1 3 0V11M10 10V4a1.5 1.5 0 0 1 3 0v6M13 10V5a1.5 1.5 0 0 1 3 0v6M16 11V8a1.5 1.5 0 0 1 3 0v6.5A6.5 6.5 0 0 1 12.5 21h-.7a6.5 6.5 0 0 1-5.1-2.5L3.6 14.6a1.6 1.6 0 0 1 2.4-2.1L7 13.6"/></svg><b class="phase-hand-count" hidden></b></button>
    <div class="hand-mode" id="fHandMode">
      <button type="button" class="hand-toggle" id="fHandToggle" data-ui="hand-toggle" aria-label="Esconder a mão" title="Esconder a mão"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
    </div>
    <section class="exile-shelf" id="fExileShelf" aria-label="Cartas disponíveis no exílio" hidden></section>
    <section class="focus-view" id="fFocus" role="dialog" aria-modal="true" aria-labelledby="fFocusTitle" hidden></section>

    <aside class="stack-panel" id="fStack" aria-label="Mágicas e habilidades na pilha" hidden></aside>
    <svg class="target-arrows" id="fTargets" aria-hidden="true"></svg>
    <nav class="phase-rail phase-trail" id="fPhases" aria-label="Fases do turno"></nav>
    <div class="stop-menu" id="fStopMenu" role="dialog" aria-labelledby="fStopMenuTitle" hidden></div>
    <div class="stop-menu pass-menu" id="fPassMenu" role="dialog" aria-labelledby="fPassMenuTitle" hidden></div>
    <div class="action" id="fAction"></div><div class="sr-only" id="fAnnouncement" aria-live="polite" aria-atomic="true"></div>
    <div class="await-callout" id="fAwait" hidden><span class="await-eyebrow" aria-hidden="true">Sua decisão</span><strong class="await-text"></strong></div>
    <div class="banner" id="fBanner" hidden></div><div class="sr-only" id="fTurnAnnouncement" aria-live="polite" aria-atomic="true"></div>
    <div class="toasts" id="fToasts" aria-live="polite"></div>
    <div class="overlay" id="fQuestion" hidden></div>
    <div class="overlay" id="fOverlay" hidden></div>
    <div class="overlay" id="fZone" hidden></div>
    <div class="overlay stack-gallery-overlay" id="fStackGallery" hidden></div>
    <div class="overlay" id="fRemoval" hidden></div>
    <div class="overlay vote-overlay" id="fVote" hidden></div>
  </div>`;
}
