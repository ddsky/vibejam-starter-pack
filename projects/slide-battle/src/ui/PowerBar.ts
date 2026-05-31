import Phaser from "phaser";

export class PowerBar extends Phaser.GameObjects.Graphics {
  constructor(scene: Phaser.Scene) {
    super(scene);
    scene.add.existing(this);
    this.setDepth(23);
    this.setVisible(false);
  }

  draw(originX: number, originY: number, unitRadius: number, power: number): void {
    const t = Phaser.Math.Clamp(power, 0, 1);
    const width = 12;
    const height = 58;
    const x = originX + unitRadius + 22;
    const y = originY - height / 2;
    const fillHeight = height * t;

    this.clear();
    this.setVisible(true);
    this.fillStyle(0x0a0805, 0.72);
    this.fillRoundedRect(x - 3, y - 3, width + 6, height + 6, 4);
    this.lineStyle(2, 0xf1e9d2, 0.86);
    this.strokeRoundedRect(x, y, width, height, 2);

    const color = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.IntegerToColor(0x7ee787),
      Phaser.Display.Color.IntegerToColor(0xf1715f),
      100,
      Math.floor(t * 100),
    );
    const tint = Phaser.Display.Color.GetColor(color.r, color.g, color.b);
    this.fillStyle(tint, 0.96);
    this.fillRect(x + 2, y + height - fillHeight + 2, width - 4, Math.max(0, fillHeight - 4));
  }

  hide(): void {
    this.clear();
    this.setVisible(false);
  }
}
