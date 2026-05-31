import Phaser from "phaser";
import { MAX_DRAG_PIXELS } from "../config/balance";
import { crispTextStyle } from "./textStyle";

export interface DragArrowOptions {
  fixedLength?: number; // for archer-shoot mode where length doesn't change
  fixedPower?: number; // keeps color/thickness stable when another UI shows power
}

export class DragArrow extends Phaser.GameObjects.Graphics {
  private maxLabel?: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    super(scene);
    scene.add.existing(this);
    this.setDepth(20);
    this.setVisible(false);
  }

  draw(
    originX: number,
    originY: number,
    dirX: number,
    dirY: number,
    magnitude: number,
    opts: DragArrowOptions = {},
  ): void {
    this.clear();
    this.setVisible(true);
    const clamped = Phaser.Math.Clamp(magnitude, 0, MAX_DRAG_PIXELS);
    const t = opts.fixedPower ?? clamped / MAX_DRAG_PIXELS;
    const length = opts.fixedLength ?? Phaser.Math.Linear(40, 220, t);
    const thickness = Phaser.Math.Linear(4, 12, t);
    const color = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.IntegerToColor(0x7ee787),
      Phaser.Display.Color.IntegerToColor(0xf1715f),
      100,
      Math.floor(t * 100),
    );
    const tint = Phaser.Display.Color.GetColor(color.r, color.g, color.b);

    const len = Math.hypot(dirX, dirY);
    if (len < 0.001) return;
    const nx = dirX / len;
    const ny = dirY / len;
    const tipX = originX + nx * length;
    const tipY = originY + ny * length;

    const isMax = opts.fixedPower === undefined && magnitude >= MAX_DRAG_PIXELS;

    // Optional glow outline when fully charged so the player sees "MAX".
    if (isMax) {
      this.lineStyle(thickness + 6, 0xffffff, 0.35);
      this.lineBetween(originX, originY, tipX - nx * 16, tipY - ny * 16);
    }

    // shaft
    this.lineStyle(thickness, tint, 0.95);
    this.lineBetween(originX, originY, tipX - nx * 16, tipY - ny * 16);

    // arrowhead triangle
    this.fillStyle(tint, 0.95);
    const headSize = 8 + thickness;
    const px = -ny;
    const py = nx;
    this.fillTriangle(
      tipX,
      tipY,
      tipX - nx * headSize + px * headSize * 0.6,
      tipY - ny * headSize + py * headSize * 0.6,
      tipX - nx * headSize - px * headSize * 0.6,
      tipY - ny * headSize - py * headSize * 0.6,
    );

    // "MAX!" badge at the arrow tip when fully charged.
    if (isMax) {
      if (!this.maxLabel) {
        this.maxLabel = this.scene.add
          .text(0, 0, "MAX!", crispTextStyle({
            fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
            fontSize: "14px",
            color: "#ffffff",
            fontStyle: "bold",
            stroke: "#a01a10",
            strokeThickness: 4,
          }))
          .setOrigin(0.5)
          .setDepth(21);
      }
      this.maxLabel
        .setPosition(tipX + nx * 16, tipY + ny * 16)
        .setVisible(true);
    } else if (this.maxLabel) {
      this.maxLabel.setVisible(false);
    }
  }

  hide(): void {
    this.clear();
    this.setVisible(false);
    this.maxLabel?.setVisible(false);
  }
}
