import Phaser from "phaser";
import { Button } from "../ui/Button";

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super("MainMenuScene");
  }

  create(): void {
    const { width, height } = this.scale;

    this.drawBackdrop(width, height);

    this.add
      .text(width / 2, height / 2 - 160, "Slide Battle", {
        fontSize: "84px",
        color: "#f1e9d2",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setShadow(4, 4, "#0a0805", 6, true, true);

    this.add
      .text(width / 2, height / 2 - 90, "Drag. Release. Crush.", {
        fontSize: "22px",
        color: "#c9b896",
      })
      .setOrigin(0.5);

    new Button(this, width / 2, height / 2 + 20, "Play vs AI", () => {
      this.scene.start("GameScene", { mode: "ai" });
    });

    new Button(
      this,
      width / 2,
      height / 2 + 105,
      "Play Local PvP",
      () => {
        this.scene.start("GameScene", { mode: "pvp" });
      },
      { bgColor: 0xc4452d, hoverColor: 0xd9573e },
    );

    new Button(
      this,
      width / 2,
      height / 2 + 190,
      "Quit",
      () => {
        window.close();
        // some browsers refuse to close — show a hint instead
        const hint = this.add
          .text(width / 2, height - 60, "Close this tab to quit.", {
            fontSize: "16px",
            color: "#c9b896",
          })
          .setOrigin(0.5);
        this.time.delayedCall(2000, () => hint.destroy());
      },
      { bgColor: 0x5a4f43, hoverColor: 0x6e6253 },
    );
  }

  private drawBackdrop(width: number, height: number): void {
    const g = this.add.graphics();
    // sand gradient
    g.fillStyle(0x3a3127, 1);
    g.fillRect(0, 0, width, height);
    g.fillStyle(0x4a4036, 1);
    g.fillRect(0, height * 0.45, width, height * 0.1);

    // decorative chips
    const chipKeys: Array<{ key: string; x: number; y: number; tint: number }> = [
      { key: "chip-player", x: 180, y: height - 160, tint: 0xffffff },
      { key: "chip-ai", x: width - 180, y: 160, tint: 0xffffff },
      { key: "chip-player", x: 300, y: height - 100, tint: 0xffffff },
      { key: "chip-ai", x: width - 300, y: 100, tint: 0xffffff },
    ];
    for (const c of chipKeys) {
      this.add.image(c.x, c.y, c.key).setScale(0.8).setAlpha(0.7);
    }
  }
}
