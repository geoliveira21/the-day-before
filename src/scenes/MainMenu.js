import { GAME_STATES } from '../utils/Constants.js';

/**
 * Main menu "scene": while active, the GameScene renders a slow cinematic orbit
 * over the city behind the menu UI. Handles Play / Continue flow.
 */
export class MainMenu {
  constructor(game, menuUI, audio) {
    this.game = game;
    this.menuUI = menuUI;
    this.audio = audio;
  }

  show() {
    this.menuUI.setPlayLabel(this.game.started ? '▶ Continue' : '▶ Start Surviving');
    this.game.setState(GAME_STATES.MENU);
  }

  /** Called from the Play button click (a user gesture: needed for audio + pointer lock). */
  play() {
    this.audio.init();
    this.audio.setAmbientMode(this.game.dayNight.isNight(), false);
    this.game.play();
  }
}
