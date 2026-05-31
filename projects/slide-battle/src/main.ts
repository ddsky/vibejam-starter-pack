import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { MainMenuScene } from "./scenes/MainMenuScene";
import { GameScene } from "./scenes/GameScene";
import { HUDScene } from "./scenes/HUDScene";
import { GameOverScene } from "./scenes/GameOverScene";
import { FIELD_WIDTH, FIELD_HEIGHT } from "./config/balance";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: FIELD_WIDTH,
  height: FIELD_HEIGHT,
  parent: "game-container",
  backgroundColor: "#2a2520",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    autoRound: true,
    fullscreenTarget: "game-container",
  },
  physics: {
    default: "arcade",
    arcade: {
      debug: false,
    },
  },
  scene: [BootScene, MainMenuScene, GameScene, HUDScene, GameOverScene],
};

const game = new Phaser.Game(config);
// expose for dev tools / Playwright
(window as unknown as { __game: Phaser.Game }).__game = game;
