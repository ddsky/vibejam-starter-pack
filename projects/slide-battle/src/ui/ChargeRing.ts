import Phaser from "phaser";
import { chargeRingRadius } from "../config/charge";

export class ChargeRing extends Phaser.GameObjects.Graphics {
  constructor(scene: Phaser.Scene) {
    super(scene);
    scene.add.existing(this);
    this.setDepth(22);
    this.setVisible(false);
  }

  draw(originX: number, originY: number, radius: number, power: number): void {
    const t = Phaser.Math.Clamp(power, 0, 1);
    const ringRadius = chargeRingRadius(radius);
    this.clear();
    this.setVisible(true);

    this.lineStyle(5, 0x0a0805, 0.7);
    this.strokeCircle(originX, originY, ringRadius);

    const color = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.IntegerToColor(0x7ee787),
      Phaser.Display.Color.IntegerToColor(0xf1715f),
      100,
      Math.floor(t * 100),
    );
    const tint = Phaser.Display.Color.GetColor(color.r, color.g, color.b);
    this.lineStyle(t >= 1 ? 8 : 6, tint, 0.96);
    this.beginPath();
    this.arc(originX, originY, ringRadius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t, false);
    this.strokePath();

    if (t >= 1) {
      this.lineStyle(2, 0xffffff, 0.65);
      this.strokeCircle(originX, originY, ringRadius + 5);
    }
  }

  hide(): void {
    this.clear();
    this.setVisible(false);
  }
}
