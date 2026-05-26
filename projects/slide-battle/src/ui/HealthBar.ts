import Phaser from "phaser";

const WIDTH = 44;
const HEIGHT = 6;

export class HealthBar extends Phaser.GameObjects.Graphics {
  private value: number;
  private maxValue: number;

  constructor(scene: Phaser.Scene, x: number, y: number, max: number) {
    super(scene, { x, y });
    this.value = max;
    this.maxValue = max;
    scene.add.existing(this);
    this.setDepth(10);
    this.redraw();
  }

  set(value: number): void {
    this.value = Phaser.Math.Clamp(value, 0, this.maxValue);
    this.redraw();
  }

  private redraw(): void {
    this.clear();
    // backdrop
    this.fillStyle(0x000000, 0.7);
    this.fillRect(-WIDTH / 2 - 1, -HEIGHT / 2 - 1, WIDTH + 2, HEIGHT + 2);
    this.fillStyle(0x2a2520, 1);
    this.fillRect(-WIDTH / 2, -HEIGHT / 2, WIDTH, HEIGHT);
    // fill
    const ratio = this.value / this.maxValue;
    const color = ratio > 0.6 ? 0x7ee787 : ratio > 0.3 ? 0xf4d35e : 0xf1715f;
    this.fillStyle(color, 1);
    this.fillRect(-WIDTH / 2, -HEIGHT / 2, WIDTH * ratio, HEIGHT);
  }
}
