import Phaser from "phaser";
import { crispTextStyle } from "./textStyle";

export interface ButtonOptions {
  width?: number;
  height?: number;
  fontSize?: string;
  bgColor?: number;
  hoverColor?: number;
  textColor?: string;
}

export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;
  private bgColor: number;
  private hoverColor: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    onClick: () => void,
    opts: ButtonOptions = {},
  ) {
    super(scene, x, y);
    const width = opts.width ?? 260;
    const height = opts.height ?? 64;
    this.bgColor = opts.bgColor ?? 0x3a7bd5;
    this.hoverColor = opts.hoverColor ?? 0x4f8de0;

    this.bg = scene.add.rectangle(0, 0, width, height, this.bgColor).setStrokeStyle(2, 0xf1e9d2);
    this.label = scene.add
      .text(0, 0, text, crispTextStyle({
        fontSize: opts.fontSize ?? "24px",
        color: opts.textColor ?? "#f1e9d2",
        fontStyle: "bold",
      }))
      .setOrigin(0.5);

    this.add([this.bg, this.label]);
    this.setSize(width, height);
    this.setInteractive({ useHandCursor: true });

    this.on("pointerover", () => this.bg.setFillStyle(this.hoverColor));
    this.on("pointerout", () => this.bg.setFillStyle(this.bgColor));
    this.on("pointerdown", () => this.bg.setScale(0.97));
    this.on("pointerup", () => {
      this.bg.setScale(1);
      onClick();
    });

    scene.add.existing(this);
  }

  setText(text: string): void {
    this.label.setText(text);
  }
}
