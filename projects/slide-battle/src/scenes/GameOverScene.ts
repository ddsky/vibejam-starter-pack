import Phaser from "phaser";
import type { Team } from "../config/units";
import { Button } from "../ui/Button";
import { sounds } from "../audio/SoundManager";

export interface GameOverData {
  winner: Team;
}

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super("GameOverScene");
  }

  create(data: GameOverData): void {
    const { width, height } = this.scale;

    if (data.winner === "player") sounds.playVictoryFanfare();
    else sounds.playDefeatTone();

    // dim backdrop
    this.add.rectangle(0, 0, width, height, 0x000000, 0.6).setOrigin(0);

    const titleText = data.winner === "player" ? "Victory!" : "Defeat";
    const titleColor = data.winner === "player" ? "#7ee787" : "#f1715f";

    this.add
      .text(width / 2, height / 2 - 80, titleText, {
        fontSize: "96px",
        color: titleColor,
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setShadow(4, 4, "#0a0805", 8, true, true);

    const subtitle =
      data.winner === "player"
        ? "The battlefield is yours."
        : "The enemy has overrun your line.";
    this.add
      .text(width / 2, height / 2 - 5, subtitle, { fontSize: "22px", color: "#f1e9d2" })
      .setOrigin(0.5);

    new Button(this, width / 2, height / 2 + 70, "Play Again", () => {
      this.scene.stop("HUDScene");
      this.scene.stop("GameScene");
      this.scene.start("GameScene");
      this.scene.stop();
    });

    new Button(
      this,
      width / 2,
      height / 2 + 150,
      "Main Menu",
      () => {
        this.scene.stop("HUDScene");
        this.scene.stop("GameScene");
        this.scene.start("MainMenuScene");
        this.scene.stop();
      },
      { bgColor: 0x5a4f43, hoverColor: 0x6e6253 },
    );
  }
}
