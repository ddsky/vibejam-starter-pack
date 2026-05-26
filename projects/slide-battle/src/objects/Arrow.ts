import Phaser from "phaser";
import type { Team } from "../config/units";
import { ARROW_FRICTION } from "../config/balance";

export class Arrow extends Phaser.Physics.Arcade.Image {
  ownerTeam: Team = "player";
  ownerType: "archer" = "archer";

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, "arrow-projectile");
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setCollideWorldBounds(true);
    body.setSize(16, 4);
    body.onWorldBounds = true;
    this.setDepth(15);
  }

  /** Call after adding to a group so the group setup doesn't reset velocity. */
  launch(vx: number, vy: number, owner: Team): void {
    this.ownerTeam = owner;
    const body = this.body as Phaser.Physics.Arcade.Body;
    // Use the caller's velocity directly — charge magnitude determines flight distance.
    body.setVelocity(vx, vy);
    body.setDrag(ARROW_FRICTION, ARROW_FRICTION);
    this.rotation = Math.atan2(vy, vx);
  }
}
