import Phaser from "phaser";

export class Obstacle extends Phaser.Physics.Arcade.Image {
  constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number) {
    super(scene, x, y, "obstacle");
    scene.add.existing(this);
    scene.physics.add.existing(this, true);
    this.setDisplaySize(width, height);
    this.setTint(0x5a4f43);
    const body = this.body as Phaser.Physics.Arcade.StaticBody;
    body.setSize(width, height);
    body.updateFromGameObject();
    this.setDepth(1);

    // dark outline ring drawn behind the obstacle for readability
    const outline = scene.add.graphics();
    outline.lineStyle(3, 0x1a1510, 1);
    outline.strokeRect(x - width / 2, y - height / 2, width, height);
    outline.setDepth(1);
  }
}
