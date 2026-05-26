import Phaser from "phaser";
import type { Team } from "../config/units";
import { TEAM_COLORS } from "../config/units";
import type { TurnManager } from "../systems/TurnManager";
import { Button } from "../ui/Button";
import { sounds } from "../audio/SoundManager";

export interface HUDInit {
  turnManager: TurnManager;
}

export class HUDScene extends Phaser.Scene {
  private turnManager!: TurnManager;
  private apIcons: Phaser.GameObjects.Arc[] = [];
  private turnLabel!: Phaser.GameObjects.Text;

  constructor() {
    super("HUDScene");
  }

  create(data: HUDInit): void {
    this.turnManager = data.turnManager;
    const { width } = this.scale;

    // top center panel
    const panel = this.add.rectangle(width / 2, 36, 360, 56, 0x1a1510, 0.8).setStrokeStyle(2, 0xf1e9d2, 0.4);
    panel.setOrigin(0.5);

    this.turnLabel = this.add
      .text(width / 2 - 130, 36, "Your Turn", {
        fontSize: "20px",
        color: "#f1e9d2",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);

    // AP icons
    const apStart = STARTING_X_OFFSET(width);
    for (let i = 0; i < this.turnManager.getStartingAP(); i++) {
      const dot = this.add.circle(apStart + i * 30, 36, 10, 0x7ee787).setStrokeStyle(2, 0xf1e9d2);
      this.apIcons.push(dot);
    }

    // Give Up button (top right)
    new Button(this, width - 100, 36, "Give Up", () => this.handleGiveUp(), {
      width: 160,
      height: 44,
      fontSize: "16px",
      bgColor: 0x8a3a2a,
      hoverColor: 0xa64a37,
    });

    // Mute toggle (top left)
    const muteBtn = new Button(
      this,
      80,
      36,
      sounds.isMuted() ? "Unmute" : "Mute",
      () => {
        sounds.setMuted(!sounds.isMuted());
        if (sounds.isMuted()) sounds.stopMusic();
        else sounds.startMusic();
        muteBtn.setText(sounds.isMuted() ? "Unmute" : "Mute");
      },
      {
        width: 120,
        height: 44,
        fontSize: "16px",
        bgColor: 0x3a3127,
        hoverColor: 0x4a4036,
      },
    );

    this.refreshAP(this.turnManager.getAP());
    this.refreshTurn(this.turnManager.getCurrentTeam());

    this.turnManager.on("ap-changed", (ap: number) => this.refreshAP(ap));
    this.turnManager.on("turn-changed", (team: Team) => this.refreshTurn(team));
    this.turnManager.on("game-over", () => this.events.emit("hud-disable"));
  }

  private refreshAP(ap: number): void {
    this.apIcons.forEach((icon, i) => {
      const used = i >= ap;
      icon.setFillStyle(used ? 0x3a3127 : 0x7ee787);
      icon.setAlpha(used ? 0.6 : 1);
    });
  }

  private refreshTurn(team: Team): void {
    const isPlayer = team === "player";
    this.turnLabel.setText(isPlayer ? "Your Turn" : "AI Turn");
    this.turnLabel.setColor(isPlayer ? "#7ee787" : "#f1715f");
    void TEAM_COLORS; // referenced for future expansion
  }

  private handleGiveUp(): void {
    this.turnManager.giveUp();
  }
}

function STARTING_X_OFFSET(width: number): number {
  // place AP dots in the right half of the center panel
  return width / 2 + 20;
}
