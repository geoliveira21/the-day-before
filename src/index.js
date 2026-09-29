import './styles/index.css';
import { GameScene } from './scenes/GameScene.js';
import { MainMenu } from './scenes/MainMenu.js';
import { MenuUI } from './ui/MenuUI.js';
import { AudioManager } from './audio/AudioManager.js';
import { loadSettings, saveSettings } from './utils/Helpers.js';
import { GAME_STATES } from './utils/Constants.js';

async function bootstrap() {
  const container = document.getElementById('game');
  const uiRoot = document.getElementById('ui');
  const settings = loadSettings();
  const audio = new AudioManager(settings);

  let game = null;
  let mainMenu = null;

  const menu = new MenuUI(uiRoot, settings, {
    onClick: () => audio.playUI(),
    onPlay: () => mainMenu?.play(),
    onResume: () => game?.resume(),
    onRespawn: () => game?.respawn(),
    onQuitToMenu: () => mainMenu?.show(),
    onSettingsChange: (s) => {
      saveSettings(s);
      audio.setVolumes({ master: s.masterVolume, music: s.musicVolume, sfx: s.sfxVolume });
      game?.applySettings();
    },
  });
  menu.show('loading');

  try {
    game = new GameScene({ container, uiRoot, settings, audio, menu });
    await game.init(async (p, label) => menu.setLoadingProgress(p, label));
  } catch (err) {
    console.error(err);
    menu.setLoadingProgress(1, `Failed to start: ${err.message}. WebGL2 is required.`);
    return;
  }

  mainMenu = new MainMenu(game, menu, audio);
  mainMenu.show();
  game.start();

  // Pause audio when the tab is hidden.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.suspend();
    else if (game.state !== GAME_STATES.MENU) audio.resume();
  });

  // Expose for debugging in the browser console.
  window.__game = game;
}

bootstrap();
